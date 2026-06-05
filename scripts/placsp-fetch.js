#!/usr/bin/env node
/* eslint-disable */
// ──────────────────────────────────────────────────────────────────────
// PLACSP Daily Crosscheck — Bloque 10 §19.3
//
// 1. Descarga feed ATOM diario incremental
// 2. Parsea XML
// 3. Filtra por CPV relevantes (ingeniería + obra hidráulica)
// 4. POSTea las adjudicaciones nuevas al endpoint GAS
//    (action=placspCrosscheck) que cruza con cartera
// ──────────────────────────────────────────────────────────────────────

const ENDPOINT = process.env.BATCH_ENDPOINT;
const API_KEY = process.env.BATCH_API_KEY;
const DESDE = process.env.DESDE || '';
const HASTA = process.env.HASTA || '';
const LIMITE = parseInt(process.env.LIMITE || '500', 10);

// Supabase — dual-write desde Node.js (cierre migración 2026-05-25).
// Si no están configurados, el script sigue funcionando con sólo el GAS.
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ENABLED = !!(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

// CPV relevantes según §19.3 (ingeniería + obra hidráulica + saneamiento)
const CPV_RELEVANTES = [
  '71300000','71310000','71311000','71320000','71321000','71322000',
  '45232000','45232100','45232120','45232150','45232300','45232400',
  '45231100','45231110','45231300','45231400',
  '45240000','45252100','45252200',
];

// URL del feed ATOM oficial de PLACSP
const ATOM_URL = 'https://contrataciondelestado.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom';

function isoNow() { return new Date().toISOString(); }

function log(...args) {
  console.log(`[${isoNow()}]`, ...args);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Errores de red transitorios: el servidor de PLACSP
// (contrataciondelestado.es) es lento e intermitente desde los runners de
// GitHub (connect timeout, reset, DNS, "fetch failed" genérico, abort por
// nuestro propio timeout). NO son un fallo del CRM ni un secret caducado, así
// que tras agotar reintentos NO deben marcar el workflow en rojo (sería ruido
// diario). En cambio, un 4xx o un fallo de parseo/escritura SÍ son señal real.
function isTransientNetworkError(err) {
  if (!err) return false;
  if (err.name === 'AbortError') return true;
  const code = err.code || (err.cause && err.cause.code) || '';
  const TRANSIENT = [
    'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_SOCKET',
    'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND', 'ENETUNREACH',
  ];
  if (TRANSIENT.includes(code)) return true;
  // fetch() envuelve los errores de red de bajo nivel como "TypeError: fetch failed".
  if (err.name === 'TypeError' && /fetch failed/i.test(err.message || '')) return true;
  return false;
}

async function fetchAtom(url) {
  const MAX_ATTEMPTS = 4;
  const PER_ATTEMPT_TIMEOUT_MS = 30000;       // el servidor gov es lento: 30s/intento
  const BACKOFFS_MS = [3000, 8000, 15000];    // espera entre intentos
  let lastErr = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    log(`Descargando feed ATOM (intento ${attempt}/${MAX_ATTEMPTS}):`, url);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PER_ATTEMPT_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        // UA de navegador real: el WAF de contrataciondelestado.es bloquea
        // User-Agents no-navegador (200 con body vacío) en entornos como GitHub.
        headers: {
          'Accept': 'application/atom+xml,application/xml,text/xml,*/*',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Accept-Language': 'es-ES,es;q=0.9',
        },
      });
      // 5xx del servidor PLACSP = transitorio → reintentar. 4xx = error duro.
      if (!res.ok) throw new Error(`Feed ATOM HTTP ${res.status}: ${res.statusText}`);
      const text = await res.text();
      log(`Feed recibido: ${text.length} bytes`);
      return text;
    } catch (err) {
      lastErr = err;
      const transient = isTransientNetworkError(err) || /HTTP 5\d\d/.test(err.message || '');
      log(`  ✗ intento ${attempt} falló: ${err.message || err}${transient ? ' (transitorio)' : ''}`);
      if (!transient) throw err;                 // 4xx u otro error duro → no reintentar
      if (attempt < MAX_ATTEMPTS) await sleep(BACKOFFS_MS[attempt - 1] || 15000);
    } finally {
      clearTimeout(timer);
    }
  }
  // Agotados los reintentos por causa transitoria: marcar para que main() lo
  // trate como soft-skip (exit 0) en vez de fallo (exit 1).
  const e = new Error(`Feed PLACSP inalcanzable tras ${MAX_ATTEMPTS} intentos: ${lastErr && lastErr.message}`);
  e.transientNetwork = true;
  throw e;
}

// Parser XML mínimo usando regex (sin dependencias). PLACSP usa estructura
// estable de Atom 1.0 con entry. Para CSP/CWE escapes confiamos en la
// estructura del XML oficial.
function parseAtomEntries(xml) {
  const entries = [];
  const entryRegex = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi;
  let m;
  while ((m = entryRegex.exec(xml)) !== null && entries.length < LIMITE * 5) {
    entries.push(m[1]);
  }
  return entries;
}

function extractField(entryXml, fieldRegex) {
  const m = entryXml.match(fieldRegex);
  return m ? m[1].trim() : '';
}

function decodeHtmlEntities(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
}

function extractFromAtomEntry(entryXml) {
  const title = decodeHtmlEntities(extractField(entryXml, /<title[^>]*>([\s\S]*?)<\/title>/i));
  const id = extractField(entryXml, /<id>([\s\S]*?)<\/id>/i);
  const updated = extractField(entryXml, /<updated>([\s\S]*?)<\/updated>/i);
  const link = extractField(entryXml, /<link[^>]*href="([^"]+)"/i);
  const summary = decodeHtmlEntities(extractField(entryXml, /<summary[^>]*>([\s\S]*?)<\/summary>/i));

  // Extensiones específicas de PLACSP — los namespaces cwr:CodCPV, cwr:ImporteAdjudicacion,
  // cwr:Adjudicatario / cbc:Name, etc. PLACSP empaqueta en cbc:ID, cbc:IssueDate, cac:Party.
  const cpvCodes = [];
  const cpvRegex = /<cbc:ItemClassificationCode\b[^>]*>([\d]+)<\/cbc:ItemClassificationCode>|<cbc:CPV[^>]*>([\d]+)<\/cbc:CPV>|<cbc:Code\b[^>]*>([\d]+)<\/cbc:Code>/gi;
  let cpvMatch;
  while ((cpvMatch = cpvRegex.exec(entryXml)) !== null) {
    const code = cpvMatch[1] || cpvMatch[2] || cpvMatch[3];
    if (code && code.length >= 6) cpvCodes.push(code);
  }

  const importeRaw = extractField(entryXml, /<cbc:PayableAmount[^>]*>([^<]+)<\/cbc:PayableAmount>|<cbc:TaxInclusiveAmount[^>]*>([^<]+)<\/cbc:TaxInclusiveAmount>/i);
  const importe = importeRaw ? parseFloat(importeRaw.replace(',', '.')) : null;

  // Adjudicatario(s) — nombre de la empresa que ganó.
  // PLACSP usa namespaces variables: cac, cac-place-ext, cbc, cbc-place-ext,
  // y la estructura típica anida WinningParty/Party/PartyName/Name.
  const adjudicatarios = [];

  // Patrón 1: WinningParty con PartyName anidado (cualquier prefijo cac*)
  let wRegex = /<[a-z-]+:WinningParty\b[\s\S]*?<[a-z-]+:PartyName>\s*<[a-z-]+:Name[^>]*>([\s\S]*?)<\/[a-z-]+:Name>/gi;
  let wMatch;
  while ((wMatch = wRegex.exec(entryXml)) !== null && adjudicatarios.length < 5) {
    const name = decodeHtmlEntities(wMatch[1].trim());
    if (name && !adjudicatarios.includes(name)) adjudicatarios.push(name);
  }

  // Patrón 2: WinningParty directo con cbc:Name sin PartyName intermedio
  if (adjudicatarios.length === 0) {
    wRegex = /<[a-z-]+:WinningParty\b[\s\S]*?<[a-z-]+:Name[^>]*>([\s\S]*?)<\/[a-z-]+:Name>/gi;
    while ((wMatch = wRegex.exec(entryXml)) !== null && adjudicatarios.length < 5) {
      const name = decodeHtmlEntities(wMatch[1].trim());
      if (name && !adjudicatarios.includes(name)) adjudicatarios.push(name);
    }
  }

  // Patrón 3: TenderResult con AwardedTenderedProject anidado (formato ESPD/PLACSP nuevo)
  if (adjudicatarios.length === 0) {
    wRegex = /<[a-z-]+:TenderResult\b[\s\S]*?<[a-z-]+:WinningParty\b[\s\S]*?<[a-z-]+:Name[^>]*>([\s\S]*?)<\/[a-z-]+:Name>/gi;
    while ((wMatch = wRegex.exec(entryXml)) !== null && adjudicatarios.length < 5) {
      const name = decodeHtmlEntities(wMatch[1].trim());
      if (name && !adjudicatarios.includes(name)) adjudicatarios.push(name);
    }
  }

  // Patrón 4: extensión cac-place-ext:Adjudicatario / OfficialName
  if (adjudicatarios.length === 0) {
    wRegex = /<[a-z-]+:Adjudicatario\b[\s\S]*?<[a-z-]+:OfficialName[^>]*>([\s\S]*?)<\/[a-z-]+:OfficialName>|<[a-z-]+:Adjudicatario\b[\s\S]*?<[a-z-]+:Name[^>]*>([\s\S]*?)<\/[a-z-]+:Name>/gi;
    while ((wMatch = wRegex.exec(entryXml)) !== null && adjudicatarios.length < 5) {
      const name = decodeHtmlEntities((wMatch[1] || wMatch[2] || '').trim());
      if (name && !adjudicatarios.includes(name)) adjudicatarios.push(name);
    }
  }

  // Patrón 5 ELIMINADO §19.3 iter — el fallback laxo capturaba ContractingParty
  // (organismo adjudicador) como si fuera WinningParty (empresa ganadora),
  // creando ruido en cartera (12 fichas creadas, solo 1 era empresa real).
  //
  // Si los patrones 1-4 no encuentran adjudicatario en el feed ATOM, devolvemos
  // adjudicatarios=[] y el endpoint GAS NO creará ficha. Esto es mejor que
  // contaminar cartera con organismos públicos.
  //
  // ITERACIÓN FUTURA: descargar XML detallado por link (cada entry tiene href)
  // donde el WinningParty/Adjudicatario sí está bien marcado. Hoy el feed ATOM
  // solo trae el resumen, no el detalle de adjudicación.

  // Organismo adjudicador
  const organismo = decodeHtmlEntities(extractField(entryXml, /<cac:ContractingParty\b[\s\S]*?<cbc:Name[^>]*>([\s\S]*?)<\/cbc:Name>/i));

  // Provincia/ciudad
  const lugar = decodeHtmlEntities(extractField(entryXml, /<cbc:CityName[^>]*>([\s\S]*?)<\/cbc:CityName>/i)) ||
                decodeHtmlEntities(extractField(entryXml, /<cbc:CountrySubentity[^>]*>([\s\S]*?)<\/cbc:CountrySubentity>/i));

  return { id, title, link, summary, updated, cpvCodes, importe, adjudicatarios, organismo, lugar };
}

function filterByCPV(adjudicaciones) {
  return adjudicaciones.filter(a => a.cpvCodes.some(code => CPV_RELEVANTES.includes(code)));
}

async function postToGAS(adjudicaciones) {
  log(`POSTing ${adjudicaciones.length} adjudicaciones al endpoint GAS...`);
  const params = new URLSearchParams({
    action: 'placspCrosscheck',
    apiKey: API_KEY,
    payload: JSON.stringify({ adjudicaciones }),
  });
  // GAS Web App devuelve 302, manejo manual del redirect (mismo patrón que batch-qualify.yml)
  const postRes = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    redirect: 'manual',
  });
  if (postRes.status !== 302) {
    log(`POST inicial no devolvió 302: ${postRes.status}`);
    const text = await postRes.text();
    log('Respuesta:', text.slice(0, 500));
    throw new Error('GAS respuesta inesperada');
  }
  const location = postRes.headers.get('location');
  if (!location) throw new Error('Sin Location header');
  const getRes = await fetch(location);
  const resp = await getRes.text();
  log('Respuesta GAS:', resp.slice(0, 500));
  return JSON.parse(resp);
}

// ──────────────────────────────────────────────────────────────────────
// SUPABASE — dual-write del cross-check
//
// Replica la lógica de handlePlacspCrosscheck (gas-batch-qualify.gs:775)
// pero contra Supabase. No depende del GAS — si SUPABASE_URL/KEY están
// configurados, el script lee studios desde Supabase, hace el match
// localmente y upserta resultados en placsp_adjudicaciones + studios.data.
// ──────────────────────────────────────────────────────────────────────

function normalizeNameForMatch(name) {
  if (!name) return '';
  return String(name).toLowerCase()
    .replace(/\b(s\.?l\.?|s\.?a\.?|s\.?l\.?u\.?|s\.?c\.?p\.?|sociedad limitada|sociedad an[óo]nima|sociedad cooperativa|ute|s\.?c\.?|c\.?b\.?)\b/g, '')
    .replace(/[.,&\-_'" ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function supaFetch(path, opts = {}) {
  const url = SUPABASE_URL.replace(/\/$/, '') + path;
  const headers = Object.assign({
    'apikey': SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
  }, opts.headers || {});
  const res = await fetch(url, Object.assign({}, opts, { headers }));
  return res;
}

// Lee toda la cartera (sólo id, name, data) paginando con Range header.
async function supaLoadAllStudios() {
  const PAGE = 1000;
  let from = 0;
  const out = [];
  while (true) {
    const to = from + PAGE - 1;
    const res = await supaFetch('/rest/v1/studios?select=id,name,data&order=id.asc', {
      method: 'GET',
      headers: { Range: `${from}-${to}` },
    });
    if (!res.ok) throw new Error(`Supabase select studios HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) break;
    out.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

// Patch del JSONB data preservando los demás campos.
// Postgres permite jsonb_set para esto, pero la API REST de Supabase no lo
// expone directamente. Hacemos un GET → merge → PATCH (atómico por studio).
async function supaPatchStudioData(studioId, partial) {
  // 1. Leer el data actual
  const getRes = await supaFetch(
    `/rest/v1/studios?id=eq.${encodeURIComponent(studioId)}&select=data`,
    { method: 'GET' }
  );
  if (!getRes.ok) throw new Error(`get data ${studioId}: HTTP ${getRes.status}`);
  const rows = await getRes.json();
  const currentData = (rows[0] && rows[0].data) || {};

  // 2. Merge superficial — sólo añadimos/sobreescribimos las claves de partial
  const newData = Object.assign({}, currentData, partial);

  // 3. PATCH
  const patchRes = await supaFetch(
    `/rest/v1/studios?id=eq.${encodeURIComponent(studioId)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ data: newData }),
    }
  );
  if (patchRes.status >= 400) {
    throw new Error(`patch data ${studioId}: HTTP ${patchRes.status} ${(await patchRes.text()).slice(0, 200)}`);
  }
}

// Crea ficha nueva en Supabase (cuando un adjudicatario PLACSP no está en cartera).
async function supaCreateStudio(id, studio) {
  const row = {
    id: String(id),
    name: studio.name || '',
    type: Array.isArray(studio.type) ? studio.type[0] : (studio.type || 'ING'),
    status: studio.status || 'nuevo',
    fuente_descubrimiento: studio.fuente_descubrimiento || null,
    data: studio.data || {},
  };
  const res = await supaFetch('/rest/v1/studios', {
    method: 'POST',
    headers: { Prefer: 'return=minimal,resolution=ignore-duplicates' },
    body: JSON.stringify(row),
  });
  if (res.status >= 400) {
    throw new Error(`create studio ${id}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
}

// Upsert de un row en placsp_adjudicaciones (histórico).
async function supaUpsertAdjudicacion(row) {
  const res = await supaFetch('/rest/v1/placsp_adjudicaciones?on_conflict=adjudicacion_id', {
    method: 'POST',
    headers: { Prefer: 'return=minimal,resolution=merge-duplicates' },
    body: JSON.stringify(row),
  });
  if (res.status >= 400) {
    throw new Error(`upsert placsp ${row.adjudicacion_id}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
}

// Heartbeat de salud del pipeline: registra la última ingesta EXITOSA en
// meta_kv['placsp_last_success']. scripts/placsp-freshness.js lo lee para
// avisar si PLACSP deja de ingerir varios días seguidos (p.ej. el WAF del
// Estado bloquea las IPs de GitHub), aunque el workflow salga en verde por el
// soft-skip de fetchAtom. Nunca rompe el run: si falla, sólo avisa.
async function supaWriteHeartbeat(stats) {
  if (!SUPABASE_ENABLED) return;
  const value = Object.assign({ ts: isoNow() }, stats || {});
  try {
    const res = await supaFetch('/rest/v1/meta_kv?on_conflict=key', {
      method: 'POST',
      // merge-duplicates: cada ingesta exitosa REFRESCA el timestamp.
      headers: { Prefer: 'return=minimal,resolution=merge-duplicates' },
      body: JSON.stringify({ key: 'placsp_last_success', value }),
    });
    if (res.status >= 400) {
      log(`⚠️  heartbeat meta_kv falló: HTTP ${res.status} ${(await res.text()).slice(0, 150)}`);
    } else {
      log(`Heartbeat OK: placsp_last_success = ${value.ts} (sent=${value.sent ?? 0})`);
    }
  } catch (e) {
    log(`⚠️  heartbeat meta_kv error: ${e.message}`);
  }
}

// Cruce completo contra Supabase. Mismo contrato que postToGAS:
// devuelve { matched, created, errorsCount, errors }.
async function crosscheckSupabase(adjudicaciones) {
  if (!SUPABASE_ENABLED) {
    log('Supabase no configurado (SUPABASE_URL/SERVICE_ROLE_KEY ausentes) — skipping');
    return null;
  }

  log(`[supabase] Cruzando ${adjudicaciones.length} adjudicaciones contra cartera Supabase…`);
  const studios = await supaLoadAllStudios();
  log(`[supabase] Cartera Supabase: ${studios.length} studios`);

  // Índice por nombre normalizado (primera coincidencia gana, como en el GAS)
  const byName = {};
  for (const s of studios) {
    const k = normalizeNameForMatch(s.name || '');
    if (k && !byName[k]) byName[k] = s;
  }

  let matched = 0, created = 0;
  const errors = [];

  for (const adj of adjudicaciones) {
    const fecha = (adj.updated || '').slice(0, 10);
    const yearMonth = fecha.slice(0, 7) || 'unknown';
    const safeId = (adj.id || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(-100) || ('adj_' + Date.now());

    const adjudicacionMeta = {
      adjudicacion_id: adj.id || '',
      fecha: fecha,
      titulo: (adj.title || '').slice(0, 250),
      organismo: adj.organismo || '',
      importe: adj.importe || null,
      lugar: adj.lugar || '',
      cpv: (adj.cpvCodes || []).slice(0, 3),
      url: adj.link || '',
    };

    for (const adjName of (adj.adjudicatarios || [])) {
      const key = normalizeNameForMatch(adjName);
      if (!key) continue;
      const hit = byName[key];

      try {
        if (hit) {
          // Cruce con cartera — patcha el JSONB data
          await supaPatchStudioData(hit.id, {
            ultima_adjudicacion_placsp: adjudicacionMeta,
            tieneAlertaPlacsp: true,
          });
          matched++;
        } else {
          // Descubrimiento — crea ficha nueva
          const newId = String(Date.now()) + '_' + Math.floor(Math.random() * 9999);
          await supaCreateStudio(newId, {
            name: adjName,
            type: ['ING'],
            status: 'nuevo',
            fuente_descubrimiento: { valor: 'placsp', nivel_confianza: 'double_source' },
            data: {
              description: 'Detectado automáticamente desde PLACSP: ' + adjudicacionMeta.titulo,
              ultima_adjudicacion_placsp: adjudicacionMeta,
              tieneAlertaPlacsp: true,
            },
          });
          byName[key] = { id: newId, name: adjName };
          created++;
        }

        // Persistencia histórica (siempre, exista o no la ficha)
        await supaUpsertAdjudicacion({
          adjudicacion_id: safeId,
          year_month: yearMonth,
          fecha: fecha || null,
          titulo: adjudicacionMeta.titulo,
          organismo: adjudicacionMeta.organismo,
          importe: adjudicacionMeta.importe,
          lugar: adjudicacionMeta.lugar,
          cpv: adjudicacionMeta.cpv,
          url: adjudicacionMeta.url,
          adjudicatario: adjName,
          adjudicatario_norm: key,
          cruzado: !!hit,
          studio_id: hit ? hit.id : null,
        });
      } catch (e) {
        errors.push(`${adj.id || '?'} → ${adjName}: ${e.message}`);
      }
    }
  }

  return {
    matched,
    created,
    errorsCount: errors.length,
    errors: errors.slice(0, 10),
  };
}

async function main() {
  if (!ENDPOINT || !API_KEY) throw new Error('BATCH_ENDPOINT y BATCH_API_KEY requeridos');

  log('PLACSP Daily Crosscheck');
  log(`Filtros: desde=${DESDE||'incremental_24h'} hasta=${HASTA||'now'} limite=${LIMITE}`);

  const xml = await fetchAtom(ATOM_URL);
  const entries = parseAtomEntries(xml);
  log(`Entradas en feed: ${entries.length}`);

  const parsed = entries.map(extractFromAtomEntry);
  log(`Adjudicaciones parseadas: ${parsed.length}`);

  // Debug: log estructura de los primeros 2 entries para diagnosticar parser
  if (parsed.length > 0) {
    const withAdj = parsed.filter(p => p.adjudicatarios.length > 0);
    log(`  Con adjudicatarios parseados: ${withAdj.length}/${parsed.length}`);
    if (withAdj.length === 0 && entries.length > 0) {
      // Mostrar tags relevantes del primer entry para ajustar regex
      const sample = entries[0].slice(0, 3000);
      const tags = [...new Set((sample.match(/<[a-z-]+:[A-Z][a-zA-Z]+/g) || []))].slice(0, 30);
      log('  Sample namespaces del primer entry:', tags.join(', '));
    } else if (withAdj.length > 0) {
      log(`  Sample adjudicatario: "${withAdj[0].adjudicatarios[0]}"`);
    }
  }

  // Filtro fecha si DESDE/HASTA presentes
  let filtered = parsed;
  if (DESDE) {
    filtered = filtered.filter(a => (a.updated || '').slice(0, 10) >= DESDE);
  }
  if (HASTA) {
    filtered = filtered.filter(a => (a.updated || '').slice(0, 10) <= HASTA);
  }
  log(`Tras filtro fechas: ${filtered.length}`);

  // Filtro CPV
  const relevantes = filterByCPV(filtered).slice(0, LIMITE);
  log(`Tras filtro CPV: ${relevantes.length}`);

  if (relevantes.length === 0) {
    log('Sin adjudicaciones relevantes hoy.');
    // Feed descargado y procesado OK → run sano aunque no haya nada relevante.
    await supaWriteHeartbeat({ sent: 0, matched: 0, created: 0, feed_entries: entries.length });
    return;
  }

  // Cross-check escrito SOLO en Supabase (fuente de verdad). Firestore/GAS
  // retirado (2026-06): se mantenía una copia espejo que nadie leía.
  let supaResult = null, supaErr = null;
  try {
    supaResult = await crosscheckSupabase(relevantes);
  } catch (e) {
    supaErr = e;
  }

  log('======================================');
  log('Resumen');
  log('======================================');
  log(`Adjudicaciones enviadas:        ${relevantes.length}`);
  if (supaErr) {
    log(`Supabase:                       ✗ ${supaErr.message}`);
  } else if (supaResult) {
    log(`Supabase cruces:                ${supaResult.matched}`);
    log(`Supabase creadas:               ${supaResult.created}`);
    log(`Supabase errores:               ${supaResult.errorsCount}`);
    if (supaResult.errors.length > 0) {
      log('  Primeros errores:');
      supaResult.errors.forEach(e => log('   - ' + e));
    }
  } else if (!SUPABASE_ENABLED) {
    log(`Supabase:                       skipped (no configurado)`);
  }

  // Si la escritura en Supabase falló (o no está configurado), exit != 0 para
  // que GH Actions lo marque en rojo.
  if (supaErr) {
    throw supaErr;
  }
  if (!SUPABASE_ENABLED) {
    throw new Error('Supabase no configurado (SUPABASE_URL/SERVICE_ROLE_KEY ausentes)');
  }

  // Ingesta completada con éxito → refresca el heartbeat de frescura.
  await supaWriteHeartbeat({
    sent: relevantes.length,
    matched: supaResult ? supaResult.matched : 0,
    created: supaResult ? supaResult.created : 0,
    feed_entries: entries.length,
  });
}

main().catch(err => {
  // Fuente PLACSP inalcanzable tras reintentos: condición transitoria externa,
  // NO un fallo del CRM ni de credenciales. Salimos en verde con aviso para no
  // generar ruido (rojo diario) cuando el servidor del Estado está caído/lento.
  if (err && err.transientNetwork) {
    console.warn('⚠️  ' + err.message);
    console.warn('⚠️  Se omite la pasada de hoy (fuente externa caída). Se reintentará en el próximo cron.');
    process.exit(0);
  }
  console.error('PLACSP fetch failed:', err);
  process.exit(1);
});
