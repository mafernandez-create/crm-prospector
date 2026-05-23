#!/usr/bin/env node
/* CRM Prospector — migración Firestore → Supabase
 *
 * Idempotente: usa UPSERT por id, se puede correr múltiples veces.
 * Aborta limpio en 429 (rate-limit) tras reintentos con backoff.
 *
 * Uso:
 *   node scripts/migrate-firestore-to-supabase.js                # studios (default)
 *   node scripts/migrate-firestore-to-supabase.js --only=studios
 *   node scripts/migrate-firestore-to-supabase.js --only=meta
 *   node scripts/migrate-firestore-to-supabase.js --only=briefings
 *   node scripts/migrate-firestore-to-supabase.js --only=all
 *
 * Requiere variables (las carga de ~/.crm-supabase.env si existe):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Lee de Firestore REST público de ferroplast-crm (sin auth).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── Carga env opcional ──────────────────────────────────────────────
const envFile = path.join(os.homedir(), '.crm-supabase.env');
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split('\n').forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const eq = line.indexOf('=');
    if (eq === -1) return;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  });
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Define en env o crea ~/.crm-supabase.env');
  process.exit(1);
}

const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1/projects/ferroplast-crm/databases/(default)/documents';

// ─── Firestore REST helpers (unwrap + retry) ─────────────────────────
function unwrap(f) {
  if (f == null) return null;
  if ('stringValue' in f) return f.stringValue;
  if ('integerValue' in f) return parseInt(f.integerValue, 10);
  if ('doubleValue' in f) return f.doubleValue;
  if ('booleanValue' in f) return f.booleanValue;
  if ('nullValue' in f) return null;
  if ('timestampValue' in f) return f.timestampValue;
  if ('arrayValue' in f) return (f.arrayValue.values || []).map(unwrap);
  if ('mapValue' in f) {
    const o = {};
    for (const k in (f.mapValue.fields || {})) o[k] = unwrap(f.mapValue.fields[k]);
    return o;
  }
  return null;
}
function fieldsToObj(fields) {
  const o = {};
  for (const k in (fields || {})) o[k] = unwrap(fields[k]);
  return o;
}
async function retryFetch(url, opts, tries = 5) {
  let lastErr;
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(url, opts);
      if (r.status === 429 && i < tries) {
        const wait = Math.min(60000, 1500 * Math.pow(2, i));
        console.warn(`   ⚠ 429, espera ${(wait/1000).toFixed(1)}s (intento ${i}/${tries})`);
        await new Promise(res => setTimeout(res, wait));
        continue;
      }
      return r;
    } catch (e) {
      lastErr = e;
      if (i === tries) throw e;
      await new Promise(res => setTimeout(res, 1000 * i));
    }
  }
  throw lastErr;
}

async function listAll(collection, pageSize = 300) {
  const out = [];
  let pageToken = null;
  do {
    const u = new URL(`${FIRESTORE_BASE}/${collection}`);
    u.searchParams.set('pageSize', String(pageSize));
    if (pageToken) u.searchParams.set('pageToken', pageToken);
    const r = await retryFetch(u);
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      throw new Error(`Firestore ${collection} ${r.status} ${r.statusText} — ${t.slice(0, 200)}`);
    }
    const j = await r.json();
    (j.documents || []).forEach(d => {
      out.push(Object.assign({ id: d.name.split('/').pop() }, fieldsToObj(d.fields || {})));
    });
    pageToken = j.nextPageToken || null;
    if (out.length % 600 === 0) console.log(`   - ${out.length} ${collection} leídos…`);
  } while (pageToken);
  return out;
}

async function getDoc(path) {
  const r = await retryFetch(`${FIRESTORE_BASE}/${path}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Firestore getDoc ${path}: ${r.status}`);
  const j = await r.json();
  return Object.assign({ id: (j.name || '').split('/').pop() }, fieldsToObj(j.fields || {}));
}

// ─── Supabase REST helpers ───────────────────────────────────────────
async function supabaseUpsert(table, rows, conflictKey = 'id') {
  if (!rows.length) return 0;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${conflictKey}`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`Supabase upsert ${table}: ${r.status} — ${txt.slice(0, 500)}`);
  }
  return rows.length;
}

// ─── Mapeos Firestore → Supabase ─────────────────────────────────────
function readField(v) {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && 'valor' in v) return v.valor || null;
  return String(v);
}
function asNumber(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = parseInt(v, 10);
    return isNaN(n) ? null : n;
  }
  return null;
}

function mapStudio(s) {
  const types = Array.isArray(s.type) ? s.type : (s.type ? [s.type] : []);
  const flatKeys = [
    'id','name','type','city','province','score','priority','status',
    'priorityQuadrant','priorityQuadrantName','priorityDirect','priorityDirectScore',
    'priorityNetwork','priorityNetworkScore','priorityDirectScoreNatural','priorityNetworkScoreNatural',
    'es_cliente_puente','fuente_descubrimiento',
  ];
  const data = {};
  for (const k in s) {
    if (!flatKeys.includes(k)) data[k] = s[k];
  }
  // Si el tipo es array de varios, guardamos los demás en data.types_all
  if (types.length > 1) data.types_all = types;

  return {
    id: String(s.id),
    name: readField(s.name),
    type: types[0] || null,
    city: readField(s.city),
    province: readField(s.province),
    score: asNumber(s.score),
    priority: readField(s.priority),
    status: readField(s.status),
    priority_quadrant: asNumber(s.priorityQuadrant),
    priority_quadrant_name: readField(s.priorityQuadrantName),
    priority_direct: readField(s.priorityDirect),
    priority_direct_score: asNumber(s.priorityDirectScore),
    priority_network: readField(s.priorityNetwork),
    priority_network_score: asNumber(s.priorityNetworkScore),
    priority_direct_score_natural: asNumber(s.priorityDirectScoreNatural),
    priority_network_score_natural: asNumber(s.priorityNetworkScoreNatural),
    es_cliente_puente: s.es_cliente_puente === true,
    fuente_descubrimiento: s.fuente_descubrimiento || null,
    data: data,
    migrated_from_firestore_at: new Date().toISOString(),
  };
}

// ─── Migraciones por colección ───────────────────────────────────────
async function migrateStudios() {
  console.log('\n=== MIGRACIÓN: studios ===');
  console.log('1) Leyendo Firestore (paginado)…');
  const docs = await listAll('studios');
  console.log(`   Total: ${docs.length}`);

  console.log('2) Mapeando al schema Postgres…');
  const rows = docs.map(mapStudio);

  console.log('3) Upsert en bloques de 100…');
  let done = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    await supabaseUpsert('studios', batch);
    done += batch.length;
    process.stdout.write(`\r   ${done}/${rows.length}`);
  }
  console.log(`\n✓ ${done} studios migrados`);
}

async function migrateMeta() {
  console.log('\n=== MIGRACIÓN: _meta/* ===');
  const planificador = await getDoc('_meta/planificador');
  if (planificador) {
    const schedule = planificador.schedule || {};
    const r = await fetch(`${SUPABASE_URL}/rest/v1/meta_planificador?id=eq.1`, {
      method: 'PATCH',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ schedule: schedule, updated_at: new Date().toISOString() }),
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`Supabase meta_planificador PATCH: ${r.status} — ${t.slice(0,300)}`);
    }
    console.log(`✓ meta_planificador (schedule keys: ${Object.keys(schedule).length} días)`);
  } else {
    console.log('  (sin _meta/planificador en Firestore)');
  }

  const otherKeys = ['batch_checkpoint', 'search_metrics', 'counters', 'referencias_cruzadas'];
  const kvRows = [];
  for (const key of otherKeys) {
    const doc = await getDoc('_meta/' + key);
    if (doc) {
      // Eliminamos el campo 'id' que viene del unwrap (es el nombre del doc, no útil)
      const value = Object.assign({}, doc);
      delete value.id;
      kvRows.push({ key: key, value: value, updated_at: new Date().toISOString() });
    }
  }
  if (kvRows.length) {
    await supabaseUpsert('meta_kv', kvRows, 'key');
    console.log(`✓ meta_kv (${kvRows.length} entradas: ${kvRows.map(r => r.key).join(', ')})`);
  }
}

async function migrateBriefings() {
  console.log('\n=== MIGRACIÓN: briefings ===');
  console.log('Nota: las subcolecciones briefings/{id}/items no se pueden listar globalmente sin collectionGroup query.');
  console.log('Esto migra briefings iterando los studios con campo briefingPreview o leyendo cada subcol.');
  console.log('Por defecto NO se migra en esta fase. Activar manualmente cuando sea necesario.');
  // TODO: implementar cuando sea necesario. La mayoría de briefings se regenerarán
  // bajo demanda desde el rediseño, no es crítico portar el histórico.
}

// ─── Entrada ────────────────────────────────────────────────────────
const argOnly = (() => {
  const eq = process.argv.find(a => a.startsWith('--only='));
  if (eq) return eq.slice(7);
  const idx = process.argv.indexOf('--only');
  if (idx > 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return 'studios';
})();

(async () => {
  const start = Date.now();
  console.log(`[migration] arrancando · only=${argOnly}`);
  console.log(`[migration] target: ${SUPABASE_URL}`);

  if (argOnly === 'studios' || argOnly === 'all') await migrateStudios();
  if (argOnly === 'meta' || argOnly === 'all') await migrateMeta();
  if (argOnly === 'briefings' || argOnly === 'all') await migrateBriefings();

  const dur = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n[migration] terminado en ${dur}s`);
})().catch(e => {
  console.error('\n[migration] FAIL:', e.message);
  if (e.stack) console.error(e.stack);
  process.exit(1);
});
