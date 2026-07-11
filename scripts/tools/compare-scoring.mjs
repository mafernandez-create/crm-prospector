// =========================================================================
// compare-scoring.mjs — Comparador de modelos de scoring v2.0 ↔ v2.1
//
// SOLO LECTURA. No escribe en Supabase ni en disco. Lee la cartera, pasa cada
// estudio por AMBOS modelos y reporta el delta:
//   - cuántos estudios cambian de cuadrante, cuántos SUBEN y cuántos BAJAN
//   - distribución de cuadrantes antes (v2.0) → después (v2.1)
//   - correlación del movimiento con el engagement (informes de visita)
//   - churn de cuadrantes por estudio (si hay scoringHistory)
//
// Los dos modelos:
//   v2.0 = scripts/tests/_lib/crm-modules.js  (espejo de index.html ~6320, la UI)
//   v2.1 = scripts/batch-qualify/scoring.mjs  (el batch nocturno, "fuente única")
//
// Uso:
//   # Cartera real, SIN login ni credenciales (usa la clave anon PÚBLICA que ya
//   # va en el frontend; el CRM no tiene auth, así que anon puede leer studios):
//   node scripts/tools/compare-scoring.mjs
//
//   # Demostración con datos sintéticos (ni siquiera toca la red):
//   node scripts/tools/compare-scoring.mjs --sample
//
//   # Si algún día activas RLS y anon deja de leer, con service_role:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/tools/compare-scoring.mjs
//
//   # Salida JSON para encadenar con otras herramientas:
//   node scripts/tools/compare-scoring.mjs --json
//
// Cuadrantes: 1 (Estratégico) = mejor  →  9 (Congelar) = peor.
// "Sube" = pasa a un cuadrante de número MENOR.
// =========================================================================

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));

// v2.0 — copia CommonJS que espeja la UI (index.html)
const { calculateScoringV2: scoreV20 } = require(path.join(HERE, '..', 'tests', '_lib', 'crm-modules.js'));
// v2.1 — copia ESM que corre en el batch nocturno
const { calculateScoringV2: scoreV21 } = await import(path.join(HERE, '..', 'batch-qualify', 'scoring.mjs'));

const QUADRANT_NAMES = {
  1: 'Estratégico', 2: 'Cliente core', 3: 'Cliente volumen',
  4: 'Puerta entrada', 5: 'Cartera estándar', 6: 'Mantenimiento',
  7: 'Conector', 8: 'Seguimiento ligero', 9: 'Congelar',
};

const argv = process.argv.slice(2);
const USE_SAMPLE = argv.includes('--sample');
const AS_JSON = argv.includes('--json');

// ── Config PÚBLICA del frontend (redesign/data-supabase.js) ────────────────
// La anon key es pública por diseño: va incrustada en la web de GitHub Pages.
// El CRM no tiene autenticación de usuario, así que anon puede LEER studios.
const PUBLIC_URL = 'https://zmelqffrkwxkbzzutjrg.supabase.co';
const PUBLIC_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
  '.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptZWxxZmZya3d4a2J6enV0anJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1Mjg2MzAsImV4cCI6MjA5NTEwNDYzMH0' +
  '.v1_Isxz6-mZtz_DJs3k6qoH9mV9FNW21Z94tiew9cQE';

// Mapea una fila Supabase (columnas + JSONB data) al shape que consumen los
// scorers (mismo criterio que rowToInternal de supabase.mjs).
function rowToInternal(row) {
  const o = (row.data && typeof row.data === 'object') ? { ...row.data } : {};
  o.id = row.id; o.name = row.name; o.type = row.type;
  o.es_cliente_puente = row.es_cliente_puente === true;
  o.data = (row.data && typeof row.data === 'object') ? row.data : {};
  return o;
}

async function listAllStudiosPublic() {
  const all = [];
  let offset = 0;
  const lim = 200;
  for (;;) {
    const q = `${PUBLIC_URL}/rest/v1/studios?select=*&order=id.asc&offset=${offset}&limit=${lim}`;
    const res = await fetch(q, { headers: { apikey: PUBLIC_ANON_KEY, Authorization: 'Bearer ' + PUBLIC_ANON_KEY } });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 200);
      throw new Error(`Lectura pública falló HTTP ${res.status}: ${body}\n` +
        '→ Puede que hayas activado RLS. Corre con SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.');
    }
    const rows = await res.json();
    all.push(...rows.map(rowToInternal));
    if (rows.length < lim) break;
    offset += lim;
  }
  return all;
}

// ── Carga de estudios ────────────────────────────────────────────────────
async function loadStudios() {
  if (USE_SAMPLE) return { studios: SAMPLE_STUDIOS, source: 'muestra sintética (--sample)' };
  // Si hay service_role en el entorno, úsalo; si no, lectura pública anon.
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { listAllStudios } = await import(path.join(HERE, '..', 'batch-qualify', 'supabase.mjs'));
    const all = [];
    let offset = 0;
    for (;;) {
      const { studios, nextOffset } = await listAllStudios(offset, 200);
      all.push(...studios);
      if (nextOffset == null) break;
      offset = nextOffset;
    }
    return { studios: all, source: 'Supabase service_role (cartera real, solo lectura)' };
  }
  const studios = await listAllStudiosPublic();
  return { studios, source: 'Supabase anon público (cartera real, solo lectura, sin login)' };
}

// ── Muestra sintética (solo para --sample; NO son clientes reales) ─────────
const SAMPLE_STUDIOS = [
  {
    // Sin engagement: v2.0 y v2.1 deberían COINCIDIR
    id: 'DEMO-1', name: '[DEMO] Ingeniería sin visitas', type: 'ingenieria',
    data: { projects: [{ name: 'EDAR', type: 'depuradora', year: new Date().getFullYear() }],
            contact: { phone: '900', email: 'a@b.es' }, studio: { employees: '25' } },
  },
  {
    // Con engagement fuerte: v2.1 suma y puede SUBIR de banda/cuadrante
    id: 'DEMO-2', name: '[DEMO] Arquitecto muy trabajado', type: 'arquitectura',
    data: {
      projects: [{ name: 'saneamiento', type: 'colector', year: new Date().getFullYear() }],
      contact: { phone: '900', email: 'a@b.es' },
      reports: [{ date: new Date().toISOString().slice(0, 10), probabilidad_cierre_pct: 70,
                  fecha_proxima_visita: '2027-01-01', proxima_accion: 'enviar ficha BC3' }],
    },
  },
  {
    // Cliente puente (bonus +4 en ambos)
    id: 'DEMO-3', name: '[DEMO] Conector puente', type: 'ingenieria', es_cliente_puente: true,
    data: { projects: Array.from({ length: 6 }, (_, i) => ({ name: 'regadío ' + i, type: 'riego', location: 'Málaga' })) },
  },
  {
    // Datos escasos: confianza baja
    id: 'DEMO-4', name: '[DEMO] Ficha casi vacía', type: 'promotora', data: {} },
];

// ── Comparación ────────────────────────────────────────────────────────────
function compareOne(studio) {
  const a = scoreV20(studio);   // v2.0
  const b = scoreV21(studio);   // v2.1
  const qA = a.priorityQuadrant, qB = b.priorityQuadrant;
  return {
    id: studio.id, name: studio.name,
    qA, qB,
    dirA: a.priorityDirect, dirB: b.priorityDirect,
    scoreA: a.priorityDirectScore, scoreB: b.priorityDirectScore,
    engagement: b.engagementScore || 0,
    confianza: b.scoringConfianza || null,
    changed: qA !== qB,
    delta: qA - qB,               // >0 = sube (mejor); <0 = baja
  };
}

function churnStats(studios) {
  let withHistory = 0, flips = 0, multiQ = 0;
  for (const s of studios) {
    const h = Array.isArray(s.scoringHistory) ? s.scoringHistory
            : (s.data && Array.isArray(s.data.scoringHistory) ? s.data.scoringHistory : null);
    if (!h || h.length < 2) continue;
    withHistory++;
    const qs = h.map(e => e.priorityQuadrant).filter(q => q != null);
    const distinct = new Set(qs);
    if (distinct.size > 1) multiQ++;
    for (let i = 1; i < qs.length; i++) if (qs[i] !== qs[i - 1]) flips++;
  }
  return { withHistory, multiQ, flips };
}

// ── Informe ────────────────────────────────────────────────────────────────
function buildReport(rows, source, churn) {
  const total = rows.length;
  const changed = rows.filter(r => r.changed);
  const up = changed.filter(r => r.delta > 0);
  const down = changed.filter(r => r.delta < 0);
  const changedWithEngagement = changed.filter(r => r.engagement > 0).length;
  const distA = {}, distB = {};
  for (const r of rows) { distA[r.qA] = (distA[r.qA] || 0) + 1; distB[r.qB] = (distB[r.qB] || 0) + 1; }
  const pct = n => total ? (100 * n / total).toFixed(1) + '%' : '0%';
  return {
    source, total,
    changed: changed.length, up: up.length, down: down.length, same: total - changed.length,
    changedPct: pct(changed.length),
    changedWithEngagement,
    engagementShareOfMovers: changed.length ? (100 * changedWithEngagement / changed.length).toFixed(1) + '%' : 'n/a',
    distA, distB, churn,
    topMovers: changed.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta)).slice(0, 15)
      .map(r => ({ id: r.id, name: r.name, de: r.qA, a: r.qB, delta: r.delta, engagement: r.engagement })),
  };
}

function printHuman(rep) {
  const L = console.log;
  L('\n═══════════════════════════════════════════════════════════════');
  L('  COMPARADOR DE SCORING · v2.0 (UI) ↔ v2.1 (batch nocturno)');
  L('═══════════════════════════════════════════════════════════════');
  L(`  Fuente: ${rep.source}`);
  L(`  Estudios evaluados: ${rep.total}`);
  L('───────────────────────────────────────────────────────────────');
  L(`  Cambian de cuadrante: ${rep.changed} (${rep.changedPct})`);
  L(`     ↑ suben (mejor):   ${rep.up}`);
  L(`     ↓ bajan (peor):    ${rep.down}`);
  L(`     = igual:           ${rep.same}`);
  L('───────────────────────────────────────────────────────────────');
  L(`  De los que se mueven, con engagement (visitas): ${rep.changedWithEngagement} (${rep.engagementShareOfMovers})`);
  L('  → Si ese % es alto, el cambio se concentra en clientes trabajados (lo esperado).');
  L('───────────────────────────────────────────────────────────────');
  L('  Distribución de cuadrantes (v2.0 → v2.1):');
  for (let q = 1; q <= 9; q++) {
    const a = rep.distA[q] || 0, b = rep.distB[q] || 0;
    const arrow = b > a ? '▲' : b < a ? '▼' : ' ';
    L(`    Q${q} ${QUADRANT_NAMES[q].padEnd(18)} ${String(a).padStart(5)} → ${String(b).padStart(5)}  ${arrow}`);
  }
  if (rep.churn.withHistory > 0) {
    L('───────────────────────────────────────────────────────────────');
    L(`  Estabilidad (scoringHistory de ${rep.churn.withHistory} estudios):`);
    L(`    con ≥2 cuadrantes distintos en su historia: ${rep.churn.multiQ}`);
    L(`    nº total de saltos de cuadrante:            ${rep.churn.flips}`);
  }
  L('───────────────────────────────────────────────────────────────');
  L('  Mayores movimientos:');
  for (const m of rep.topMovers) {
    const dir = m.delta > 0 ? `↑${m.delta}` : `↓${-m.delta}`;
    L(`    ${dir}  Q${m.de}→Q${m.a}  eng:${m.engagement}  ${m.name || m.id}`);
  }
  L('═══════════════════════════════════════════════════════════════');
  L('  SOLO LECTURA: no se ha escrito nada en Supabase ni en disco.\n');
}

// ── Main ────────────────────────────────────────────────────────────────────
const { studios, source } = await loadStudios();
const rows = studios.map(compareOne);
const rep = buildReport(rows, source, churnStats(studios));
if (AS_JSON) console.log(JSON.stringify(rep, null, 2));
else printHuman(rep);
