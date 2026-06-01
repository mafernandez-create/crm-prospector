#!/usr/bin/env node
/* CRM Prospector — backup Firestore → JSON local
 *
 * Lee todas las colecciones relevantes vía REST público (no auth) y
 * vuelca a un único JSON con la misma forma que los backups históricos.
 *
 * Uso:
 *   node scripts/export-firestore-to-json.js
 *   node scripts/export-firestore-to-json.js --out ~/Documents/backup.json
 *
 * Salida por defecto:
 *   ~/Documents/CRM_Ferroplast_Backup_{YYYY-MM-DD}_{HHMM}.json
 *
 * Estructura del JSON:
 *   {
 *     version: "1",
 *     createdAt: ISO,
 *     source: "firestore-rest",
 *     stats: { totalStudios, totalActivities, totalBriefings, ... },
 *     data: {
 *       studios:    [ {id, name, ...}, ... ],
 *       activities: [ ... ],
 *       briefings:  [ { studio_id, iso, ... }, ... ],   // listado plano
 *       meta:       { planificador, batch_checkpoint, search_metrics, ... },
 *     }
 *   }
 *
 * NO escribe en Firestore. Sólo lectura. Retry con backoff en 429.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1/projects/ferroplast-crm/databases/(default)/documents';

// ─── argv ────────────────────────────────────────────────────────────
function arg(name, def) {
  const eq = process.argv.find(a => a.startsWith('--' + name + '='));
  if (eq) return eq.slice(name.length + 3);
  const idx = process.argv.indexOf('--' + name);
  if (idx > 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return def;
}
const stamp = new Date().toISOString().replace(/:/g, '-').slice(0, 16);
const outPath = arg('out', path.join(os.homedir(), 'Documents', `CRM_Ferroplast_Backup_${stamp}.json`));

// ─── Firestore unwrap ───────────────────────────────────────────────
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

async function retryFetch(url, tries = 4) {
  let lastErr;
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(url);
      if (r.status === 429 && i < tries) {
        const wait = Math.min(60000, 2000 * Math.pow(2, i - 1));
        console.warn(`   ⚠ 429, esperando ${(wait/1000).toFixed(1)}s (${i}/${tries-1})`);
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
      throw new Error(`Firestore ${collection} ${r.status} — ${t.slice(0, 200)}`);
    }
    const j = await r.json();
    (j.documents || []).forEach(d => {
      out.push(Object.assign({ id: d.name.split('/').pop() }, fieldsToObj(d.fields || {})));
    });
    pageToken = j.nextPageToken || null;
    if (out.length && out.length % 600 === 0) console.log(`   - ${out.length} ${collection} leídos…`);
  } while (pageToken);
  return out;
}

async function getDoc(p) {
  const r = await retryFetch(`${FIRESTORE_BASE}/${p}`);
  if (r.status === 404) return null;
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    console.warn(`   ⚠ getDoc ${p}: ${r.status} — ${t.slice(0,150)}`);
    return null;
  }
  const j = await r.json();
  return Object.assign({ id: (j.name || '').split('/').pop() }, fieldsToObj(j.fields || {}));
}

// ─── Run ─────────────────────────────────────────────────────────────
(async () => {
  const t0 = Date.now();
  console.log('[export] arrancando backup completo Firestore → JSON');
  console.log('[export] destino: ' + outPath);

  const studios = await listAll('studios');
  console.log(`✓ studios: ${studios.length}`);

  const activities = await listAll('activities').catch(e => { console.warn('  activities: ' + e.message); return []; });
  console.log(`✓ activities: ${activities.length}`);

  // Briefings: tenemos que iterar por studio para listar sus items.
  // Es caro pero hace falta. Saltamos si studio no tiene briefingFecha.
  const briefings = [];
  const candidates = studios.filter(s => s.briefingFecha || s.briefingPreview);
  console.log(`[export] briefings: ${candidates.length} studios candidatos`);
  for (let i = 0; i < candidates.length; i++) {
    const items = await listAll(`briefings/${candidates[i].id}/items`).catch(() => []);
    items.forEach(it => briefings.push(Object.assign({ studio_id: candidates[i].id }, it)));
    if ((i + 1) % 50 === 0) console.log(`   ${i+1}/${candidates.length}`);
  }
  console.log(`✓ briefings: ${briefings.length}`);

  const meta = {};
  for (const k of ['planificador', 'batch_checkpoint', 'search_metrics', 'counters', 'referencias_cruzadas']) {
    const d = await getDoc('_meta/' + k);
    if (d) {
      delete d.id;
      meta[k] = d;
      console.log(`✓ _meta/${k}`);
    }
  }

  const out = {
    version: '1',
    createdAt: new Date().toISOString(),
    source: 'firestore-rest',
    stats: {
      totalStudios: studios.length,
      totalActivities: activities.length,
      totalBriefings: briefings.length,
      metaKeys: Object.keys(meta),
    },
    data: { studios, activities, briefings, meta },
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  const sizeMB = (fs.statSync(outPath).size / 1024 / 1024).toFixed(1);
  console.log(`\n✓ backup guardado: ${outPath}`);
  console.log(`  tamaño: ${sizeMB} MB`);
  console.log(`  duración: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
})().catch(e => {
  console.error('[export] FAIL:', e.message);
  process.exit(1);
});
