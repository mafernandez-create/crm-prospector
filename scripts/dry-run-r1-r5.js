#!/usr/bin/env node
/* eslint-disable */
// ──────────────────────────────────────────────────────────────────────
// Dry-run R1-R5 sobre la cartera completa de Firestore.
// Lee todos los studios via REST API (lectura pública del proyecto),
// aplica la nueva fórmula de scoring v2 con R1-R5 reales, y comparativa
// con los valores actuales (los que están escritos en Firestore).
// NO escribe nada.
//
// Salida: stats agregadas para validar el impacto antes del batch real.
// ──────────────────────────────────────────────────────────────────────

const PROJECT = 'ferroplast-crm';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/studios`;

// ── Constantes spec (mismas que index.html y gas-batch-qualify.gs) ──

const GPF_FIT_FAMILIES = [
  ['evacuacion', ['evacuación','evacuacion','bajante','tubería','tuberia','sanitario','baño','baños','baño/cocina','fontaneria','fontanería','plumbing','desagüe','desague']],
  ['arquitectonico', ['acústic','acustic','insonor','silen','ruido','noise','sonido','sound','aislamiento acústico','aislamiento acustico']],
  ['canalizacion_riego', ['riego','irrigation','regant','regadío','regadio','agua de riego','goteo','aspersión','aspersion']],
  ['saneamiento_pluviales', ['saneamiento','colector','colectores','pluvial','pluviales','pluvial','alcantarillado','sewer','drainage','desagüe pluvial','desague pluvial']],
  ['abastecimiento', ['abastecimiento','agua potable','potable','captación','captacion','red de agua','water supply']],
  ['edar_etap', ['edar','etap','depuradora','depuración','depuracion','tratamiento de agua','wastewater']],
  ['urbanizacion_ov', ['urbanización','urbanizacion','viario','vial','pavimentación','pavimentacion','asfalto','acerado','acera']],
  ['infraestructura', ['infraestructura','obra civil','civil engineering','infrastructure','autovía','autovia','autopista']],
];

const R2_TARGET_KWS = [
  'regant','regadío','regadio','comunidad de riego',
  'edar','depuradora','abastecimiento','saneamiento','agua potable',
  'red de aguas','red de saneamiento','red de abastecimiento','colector',
  'ayuntamiento','diputación','diputacion','consorcio','mancomunidad',
  'junta de','sector público','sector publico',
  'urbanización','urbanizacion','infraestructura','vial','autovía','autovia',
  'pavimentación','pavimentacion'
];

const R3_KWS = [
  'proveedor exclusivo','proveedor preferente','proveedor habitual',
  'colaborador habitual','partner exclusivo','partner preferente'
];

const R5_ZONA_PROVS = [
  'málaga','malaga','sevilla','granada','almería','almeria','jaén','jaen','córdoba','cordoba','huelva','cádiz','cadiz',
  'cáceres','caceres','badajoz',
  'toledo','cuenca','ciudad real','albacete','guadalajara',
  'madrid',
  'alicante','valencia','castellón','castellon',
  'murcia',
  'islas baleares','baleares','palma',
  'las palmas','tenerife','santa cruz de tenerife',
  'ceuta','melilla'
];

const SV2_QUADRANT_MAP = {
  'Alto_Alta':  1, 'Alto_Media':  2, 'Alto_Baja':  3,
  'Medio_Alta': 4, 'Medio_Media': 5, 'Medio_Baja': 6,
  'Bajo_Alta':  7, 'Bajo_Media':  8, 'Bajo_Baja':  9,
};

// ── Helpers ──

function unwrap(field) {
  if (field === null || field === undefined) return null;
  if (typeof field !== 'object') return field;
  if ('stringValue'   in field) return field.stringValue;
  if ('integerValue'  in field) return parseInt(field.integerValue, 10);
  if ('doubleValue'   in field) return field.doubleValue;
  if ('booleanValue'  in field) return field.booleanValue;
  if ('nullValue'     in field) return null;
  if ('timestampValue' in field) return field.timestampValue;
  if ('arrayValue'    in field) {
    const arr = (field.arrayValue.values || []).map(unwrap);
    return arr;
  }
  if ('mapValue'      in field) {
    const out = {};
    const fields = field.mapValue.fields || {};
    for (const k of Object.keys(fields)) out[k] = unwrap(fields[k]);
    return out;
  }
  return null;
}

function docToStudio(doc) {
  const fields = doc.fields || {};
  const out = {};
  for (const k of Object.keys(fields)) out[k] = unwrap(fields[k]);
  out.id = doc.name.split('/').pop();
  return out;
}

function getValor(field) {
  if (field === null || field === undefined) return null;
  if (typeof field === 'object' && 'valor' in field) return field.valor;
  return field;
}

function getTipoPrincipal(studio) {
  const t = studio.type;
  if (Array.isArray(t)) return t[0] || '';
  return t || '';
}

// ── Scoring v2 con R1-R5 (idéntico a index.html/gas-batch-qualify.gs) ──

function calculateScoringV2(studio) {
  const data     = studio.data || {};
  const social   = data.social  || {};
  const contact  = data.contact || {};
  const team     = data.team    || [];
  const projects = data.projects || [];
  const tipoPpal = getTipoPrincipal(studio);

  // D1
  let d1 = 0;
  if (tipoPpal === 'ARQ' || tipoPpal === 'ING') d1 = 3;
  else if (tipoPpal === 'OCV') d1 = 2;
  else if (['AAPP','CCRR','CICA','CONC'].includes(tipoPpal)) d1 = 1;

  // D2
  let d2 = 0;
  const empVal = parseInt(getValor((data.studio || {}).employees)) || 0;
  if (empVal > 0) {
    if (tipoPpal === 'OCV') {
      if (empVal >= 50) d2 = 3; else if (empVal >= 20) d2 = 2; else if (empVal >= 5) d2 = 1;
    } else {
      if (empVal >= 20) d2 = 3; else if (empVal >= 10) d2 = 2; else if (empVal >= 3) d2 = 1;
    }
  }

  // D3 (sin_dato)
  const d3 = 0;

  // D4
  let d4 = 0, d4Recent = 0;
  const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 1);
  projects.forEach(p => {
    if (p.year && parseInt(p.year) >= cutoff.getFullYear()) d4Recent++;
    else if (p.date) { try { if (new Date(p.date) >= cutoff) d4Recent++; } catch(e) {} }
  });
  const d4Effective = d4Recent > 0 ? d4Recent : Math.round(projects.length * 0.6);
  if (d4Effective >= 5) d4 = 3; else if (d4Effective >= 3) d4 = 2; else if (d4Effective >= 1) d4 = 1;

  // D5
  let d5 = 0;
  const projText = projects.map(p => ((p.name||'')+' '+(p.type||'')).toLowerCase()).join(' ');
  let d5Fits = 0;
  GPF_FIT_FAMILIES.forEach(([, kws]) => {
    if (kws.some(kw => projText.includes(kw))) d5Fits++;
  });
  if ((tipoPpal === 'ARQ' || tipoPpal === 'ING') && projects.length > 0) d5Fits = Math.max(d5Fits, 1);
  if (d5Fits >= 3) d5 = 2; else if (d5Fits >= 1) d5 = 1;

  // D6
  let d6 = 0, d6Pts = 0;
  if (getValor(contact.phone)   && getValor(contact.phone)   !== 'No encontrado') d6Pts++;
  if (getValor(contact.email)   && getValor(contact.email)   !== 'No encontrado') d6Pts++;
  if (getValor(contact.address) && getValor(contact.address) !== 'No encontrado') d6Pts++;
  if (getValor(contact.web)     && getValor(contact.web)     !== 'No encontrado') d6Pts++;
  if (team.some(t => t.isDecisionMaker)) d6Pts++;
  if (team.some(t => t.email && t.email !== 'No encontrado')) d6Pts++;
  if (team.some(t => t.linkedin && t.linkedin !== 'No encontrado')) d6Pts++;
  if (d6Pts >= 5) d6 = 2; else if (d6Pts >= 2) d6 = 1;

  const rawDirect = d1 + d2 + d3 + d4 + d5 + d6;

  // R1
  let r1 = 0;
  if      (projects.length >= 10) r1 = 2;
  else if (projects.length >=  5) r1 = 1.5;
  else if (projects.length >=  2) r1 = 1;

  // R2
  let r2TargetCount = 0;
  projects.forEach(p => {
    const t = ((p.name||p.nombre||'')+' '+(p.type||p.tipo||'')+' '+(p.descripcion||p.description||'')).toLowerCase();
    if (R2_TARGET_KWS.some(kw => t.includes(kw))) r2TargetCount++;
  });
  const r2Pct = projects.length > 0 ? (r2TargetCount / projects.length) : 0;
  let r2 = 0;
  if      (r2Pct >= 0.75)      r2 = 4;
  else if (r2Pct >= 0.50)      r2 = 3;
  else if (r2Pct >= 0.25)      r2 = 2;
  else if (r2TargetCount >= 1) r2 = 1;

  // R3
  const r3Text = ((data.description||'')+' '+projects.map(p => (p.name||p.nombre||'')+' '+(p.descripcion||p.description||'')).join(' ')).toLowerCase();
  const r3Hits = R3_KWS.filter(kw => r3Text.includes(kw)).length;
  let r3 = 0;
  if      (r3Hits >= 2) r3 = 2;
  else if (r3Hits >= 1) r3 = 1;

  // R4
  const liFollowers = parseInt(String(getValor((social.linkedin||{}).followers)||'').replace(/[^0-9]/g,'')||'0') || 0;
  const awardKws = ['premio','bienal','award','finalista','reconoci','distinción','medalla','ganador'];
  const teachKws = ['profesor','docente','universidad','cátedra','master','máster'];
  let socialCount = 0;
  if (getValor((social.linkedin||{}).url))   socialCount++;
  if (getValor((social.instagram||{}).url))  socialCount++;
  if (getValor((social.twitter||{}).url))    socialCount++;
  const awardsHit  = projects.some(p => awardKws.some(kw => ((p.name||'')+(p.type||'')).toLowerCase().includes(kw))) ||
                     awardKws.some(kw => (data.description||'').toLowerCase().includes(kw));
  const teachingHit = team.some(t => teachKws.some(kw => ((t.role||'')+(t.bio||'')).toLowerCase().includes(kw)));
  let r4Signals = 0;
  if (liFollowers >= 1000) r4Signals++;
  if (awardsHit) r4Signals++;
  if (teachingHit) r4Signals++;
  if (projects.length >= 10) r4Signals++;
  if (socialCount >= 2 && liFollowers >= 500) r4Signals++;
  const r4 = r4Signals >= 4 ? 4 : r4Signals >= 2 ? 2 : 0;

  // R5
  const r5Provs = new Set();
  projects.forEach(p => {
    const t = ((p.location||'')+' '+(p.name||p.nombre||'')+' '+(p.descripcion||p.description||'')).toLowerCase();
    R5_ZONA_PROVS.forEach(prov => { if (t.includes(prov)) r5Provs.add(prov); });
  });
  const r5ProvCount = r5Provs.size;
  let r5 = 0;
  if      (r5ProvCount >= 3) r5 = 2;
  else if (r5ProvCount >= 1) r5 = 1;

  const rawNetwork = r1 + r2 + r3 + r4 + r5;
  const priorityNetwork = rawNetwork >= 10 ? 'Alta' : rawNetwork >= 6 ? 'Media' : 'Baja';

  const esCandidatoPuente = rawDirect < 6 && rawNetwork >= 6 && projects.length >= 5;
  const puenteActivo = studio.es_cliente_puente === true;
  const rawDirectFinal = puenteActivo ? rawDirect + 4 : rawDirect;
  const priorityDirect = rawDirectFinal >= 10 ? 'Alto' : rawDirectFinal >= 6 ? 'Medio' : 'Bajo';

  const priorityQuadrant = SV2_QUADRANT_MAP[`${priorityDirect}_${priorityNetwork}`] || 5;

  return {
    rawDirect, rawDirectFinal, priorityDirect,
    rawNetwork, priorityNetwork,
    priorityQuadrant,
    esCandidatoPuente, puenteActivo,
    r1, r2, r3, r4, r5,
    proyectos: projects.length,
  };
}

// ── Fetch all studios paginando ──

async function fetchAll() {
  const studios = [];
  let pageToken = null;
  let page = 0;
  do {
    const url = new URL(BASE);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Firestore REST: ${res.status} ${res.statusText}`);
    const json = await res.json();
    (json.documents || []).forEach(doc => studios.push(docToStudio(doc)));
    pageToken = json.nextPageToken || null;
    page++;
    process.stderr.write(`  Página ${page}: ${studios.length} studios cargados...\r`);
  } while (pageToken);
  process.stderr.write('\n');
  return studios;
}

// ── Main ──

async function main() {
  console.log('Cargando studios de Firestore...');
  const studios = await fetchAll();
  console.log(`Total: ${studios.length} studios`);
  console.log();

  const stats = {
    total: studios.length,
    cuadranteAntes: {},
    cuadranteDespues: {},
    cambioCuadrante: 0,
    cambioCuadranteDetalle: {},
    nuevosCandidatosPuente: 0,
    dejaSerCandidatoPuente: 0,
    candidatosPuenteAhora: [],
    distrR1: { '0': 0, '1': 0, '1.5': 0, '2': 0 },
    distrR2: { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0 },
    distrR3: { '0': 0, '1': 0, '2': 0 },
    distrR5: { '0': 0, '1': 0, '2': 0 },
    distrRawNetwork: {},
    studiosConProyectos: 0,
    studiosSinProyectos: 0,
    proyectosMax: 0,
    promedioProyectos: 0,
  };

  let proyectosSum = 0;

  for (const studio of studios) {
    const v2 = calculateScoringV2(studio);
    const qAntes  = parseInt(studio.priorityQuadrant) || 5;
    const qDespues = v2.priorityQuadrant;

    stats.cuadranteAntes[qAntes]   = (stats.cuadranteAntes[qAntes]||0)   + 1;
    stats.cuadranteDespues[qDespues] = (stats.cuadranteDespues[qDespues]||0) + 1;

    if (qAntes !== qDespues) {
      stats.cambioCuadrante++;
      const key = `Q${qAntes}→Q${qDespues}`;
      stats.cambioCuadranteDetalle[key] = (stats.cambioCuadranteDetalle[key]||0) + 1;
    }

    if (v2.esCandidatoPuente && !studio.esCandidatoPuente) stats.nuevosCandidatosPuente++;
    if (!v2.esCandidatoPuente && studio.esCandidatoPuente) stats.dejaSerCandidatoPuente++;
    if (v2.esCandidatoPuente) {
      stats.candidatosPuenteAhora.push({
        id: studio.id,
        name: studio.name,
        province: studio.province,
        proyectos: v2.proyectos,
        r: { r1: v2.r1, r2: v2.r2, r3: v2.r3, r4: v2.r4, r5: v2.r5 },
        rawNetwork: v2.rawNetwork,
        rawDirect: v2.rawDirect,
      });
    }

    stats.distrR1[String(v2.r1)] = (stats.distrR1[String(v2.r1)]||0) + 1;
    stats.distrR2[String(v2.r2)] = (stats.distrR2[String(v2.r2)]||0) + 1;
    stats.distrR3[String(v2.r3)] = (stats.distrR3[String(v2.r3)]||0) + 1;
    stats.distrR5[String(v2.r5)] = (stats.distrR5[String(v2.r5)]||0) + 1;
    const rnKey = String(v2.rawNetwork);
    stats.distrRawNetwork[rnKey] = (stats.distrRawNetwork[rnKey]||0) + 1;

    if (v2.proyectos > 0) stats.studiosConProyectos++; else stats.studiosSinProyectos++;
    if (v2.proyectos > stats.proyectosMax) stats.proyectosMax = v2.proyectos;
    proyectosSum += v2.proyectos;
  }

  stats.promedioProyectos = (proyectosSum / studios.length).toFixed(2);

  // Ordenar candidatos puente por rawNetwork desc
  stats.candidatosPuenteAhora.sort((a, b) => b.rawNetwork - a.rawNetwork);

  // ── Reporte ──
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Dry-run R1-R5 sobre la cartera completa');
  console.log('═══════════════════════════════════════════════════════════');
  console.log();
  console.log(`Cartera total:               ${stats.total}`);
  console.log(`Con ≥1 proyecto detectable: ${stats.studiosConProyectos}`);
  console.log(`Sin proyectos:               ${stats.studiosSinProyectos}`);
  console.log(`Proyectos promedio:          ${stats.promedioProyectos}`);
  console.log(`Proyectos máximo:            ${stats.proyectosMax}`);
  console.log();
  console.log('── Distribución cuadrante ANTES (escrito en Firestore) ──');
  Object.keys(stats.cuadranteAntes).sort().forEach(q => console.log(`  Q${q}: ${stats.cuadranteAntes[q]}`));
  console.log();
  console.log('── Distribución cuadrante DESPUÉS (con R1-R5) ──');
  Object.keys(stats.cuadranteDespues).sort().forEach(q => console.log(`  Q${q}: ${stats.cuadranteDespues[q]}`));
  console.log();
  console.log(`Cambian de cuadrante: ${stats.cambioCuadrante} (${((stats.cambioCuadrante/stats.total)*100).toFixed(1)}%)`);
  Object.keys(stats.cambioCuadranteDetalle).sort().forEach(k => {
    console.log(`  ${k}: ${stats.cambioCuadranteDetalle[k]}`);
  });
  console.log();
  console.log('── Distribución rawNetwork (después) ──');
  Object.keys(stats.distrRawNetwork).map(Number).sort((a,b)=>a-b).forEach(k => {
    const banda = k >= 10 ? 'Alta' : k >= 6 ? 'Media' : 'Baja';
    console.log(`  ${k.toString().padStart(3,' ')}: ${stats.distrRawNetwork[String(k)]} (${banda})`);
  });
  console.log();
  console.log('── Distribución por dimensión ──');
  console.log('R1 (cartera):    ', JSON.stringify(stats.distrR1));
  console.log('R2 (densidad):   ', JSON.stringify(stats.distrR2));
  console.log('R3 (exclusividad):', JSON.stringify(stats.distrR3));
  console.log('R5 (diversidad): ', JSON.stringify(stats.distrR5));
  console.log();
  console.log('── Cliente puente (§7.2.1) ──');
  console.log(`Nuevos candidatos a puente:       ${stats.nuevosCandidatosPuente}`);
  console.log(`Dejan de ser candidatos a puente: ${stats.dejaSerCandidatoPuente}`);
  console.log(`Total candidatos a puente AHORA:  ${stats.candidatosPuenteAhora.length}`);
  console.log();
  if (stats.candidatosPuenteAhora.length > 0) {
    console.log('Top 15 candidatos a puente (por rawNetwork desc):');
    stats.candidatosPuenteAhora.slice(0, 15).forEach((c, i) => {
      console.log(`  ${(i+1).toString().padStart(2)}. [${c.id}] ${c.name} (${c.province}) — proyectos=${c.proyectos}, D=${c.rawDirect}, R=${c.rawNetwork} (r1=${c.r.r1} r2=${c.r.r2} r3=${c.r.r3} r4=${c.r.r4} r5=${c.r.r5})`);
    });
  }
  console.log();
  console.log('═══════════════════════════════════════════════════════════');
  console.log('FIN DEL DRY-RUN — Ningún dato modificado en Firestore.');
  console.log('═══════════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
