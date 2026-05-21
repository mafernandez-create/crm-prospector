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

async function fetchAtom(url) {
  log('Descargando feed ATOM:', url);
  const res = await fetch(url, {
    headers: { 'Accept': 'application/atom+xml,application/xml,text/xml', 'User-Agent': 'CRM-Prospector-PLACSP/1.0' },
  });
  if (!res.ok) throw new Error(`Feed ATOM HTTP ${res.status}: ${res.statusText}`);
  const text = await res.text();
  log(`Feed recibido: ${text.length} bytes`);
  return text;
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

  // Patrón 5 fallback: cualquier OfficialName/PartyName/Name dentro del entry
  // (no ideal, pero asegura que si hay nombre de organización lo capturamos)
  if (adjudicatarios.length === 0) {
    wRegex = /<[a-z-]+:(?:OfficialName|PartyName)[^>]*>([\s\S]*?)<\/[a-z-]+:(?:OfficialName|PartyName)>/gi;
    while ((wMatch = wRegex.exec(entryXml)) !== null && adjudicatarios.length < 3) {
      const name = decodeHtmlEntities(wMatch[1].trim()).replace(/<[^>]+>/g, '').trim();
      if (name && name.length > 3 && name.length < 200 && !adjudicatarios.includes(name)) {
        adjudicatarios.push(name);
      }
    }
  }

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
    return;
  }

  // POST a GAS
  const result = await postToGAS(relevantes);
  log('======================================');
  log('Resumen');
  log('======================================');
  log(`Adjudicaciones enviadas:   ${relevantes.length}`);
  log(`Cruces con cartera:        ${result.matched ?? '?'}`);
  log(`Fichas nuevas creadas:     ${result.created ?? '?'}`);
  log(`Errores:                   ${result.errorsCount ?? 0}`);
}

main().catch(err => {
  console.error('PLACSP fetch failed:', err);
  process.exit(1);
});
