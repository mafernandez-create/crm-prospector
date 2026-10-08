#!/usr/bin/env node
/* eslint-disable */
// ──────────────────────────────────────────────────────────────────────
// PLACSP Monitor → crm-prospector: licitaciones «interesantes» (8-oct-2026)
//
// Lo que Manolo marca como interesante en el Monitor llega aqui cada dia:
//   1. GET {PLACSP_MONITOR_URL}/api/crm/interesantes (cabecera X-Cron-Secret)
//   2. Cruza el organo de contratacion con la cartera (scripts/placsp-interesantes-lib.js)
//   3. Upsert en public.placsp_interesantes por monitor_id
//   4. Las que ya no vienen (desmarcadas en el Monitor) pasan a vigente=false
// La Bandeja las enseña. No toca studios.data: el cruce queda en studio_id.
//
// Antes este puente lo consumia CRM3 (retirado el 8-oct-2026).
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PLACSP_MONITOR_SECRET,
//      PLACSP_MONITOR_URL (opcional), DRY_RUN=1 (no escribe, solo cuenta).
// ──────────────────────────────────────────────────────────────────────

const L = require('./placsp-interesantes-lib');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const MONITOR_URL = (process.env.PLACSP_MONITOR_URL || 'https://placsp-monitor.fly.dev').replace(/\/$/, '');
const MONITOR_SECRET = process.env.PLACSP_MONITOR_SECRET || '';
const DRY = process.env.DRY_RUN === '1';

function log(...a) { console.log(`[${new Date().toISOString()}]`, ...a); }

async function sb(path, opts = {}) {
  const res = await fetch(SUPABASE_URL + path, Object.assign({}, opts, {
    headers: Object.assign({
      apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json',
    }, opts.headers || {}),
  }));
  if (res.status >= 400) throw new Error(`Supabase ${res.status} ${path.split('?')[0]}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

async function cargarCartera() {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const res = await sb('/rest/v1/studios?select=id,name&order=id.asc', { headers: { Range: `${from}-${from + 999}` } });
    const rows = await res.json();
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

async function pedirAlMonitor() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(`${MONITOR_URL}/api/crm/interesantes?limite=500`, {
      headers: { 'X-Cron-Secret': MONITOR_SECRET }, signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Monitor HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = await res.json();
    if (body.version !== 1) throw new Error(`Contrato del Monitor desconocido (version ${body.version})`);
    return body;
  } finally { clearTimeout(t); }
}

async function main() {
  if (!SUPABASE_URL || !KEY) throw new Error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  if (!MONITOR_SECRET) throw new Error('Falta PLACSP_MONITOR_SECRET');

  const body = await pedirAlMonitor();
  const lics = body.licitaciones || [];
  log(`Monitor: ${lics.length} interesantes (total ${body.total})`);
  if (body.total > lics.length) log(`⚠️  El Monitor tiene ${body.total} y solo han llegado ${lics.length}: subir el limite.`);

  const idx = L.indexarCartera(await cargarCartera());
  const ahora = new Date().toISOString();
  const filas = lics.map(l => L.aFila(l, L.buscarFicha(l.organo_contratacion, idx), ahora));
  const cruzadas = filas.filter(f => f.studio_id).length;
  log(`Cruzadas con una ficha de la cartera: ${cruzadas}`);

  if (DRY) {
    filas.filter(f => f.studio_id).forEach(f => log('  ↔', f.studio_id, '·', f.organo));
    log('DRY_RUN: no se escribe nada.');
    return;
  }

  for (let i = 0; i < filas.length; i += 100) {
    await sb('/rest/v1/placsp_interesantes?on_conflict=monitor_id', {
      method: 'POST',
      headers: { Prefer: 'return=minimal,resolution=merge-duplicates' },
      body: JSON.stringify(filas.slice(i, i + 100)),
    });
  }

  // Desmarcadas en el Monitor → dejan de ser vigentes (no se borran: historial).
  // Solo si el Monitor ha devuelto la lista entera; con una lista cortada se
  // apagarian por error las que no han cabido.
  let apagadas = 0;
  if (body.total <= lics.length) {
    const ids = filas.map(f => f.monitor_id);
    const filtro = ids.length ? `&monitor_id=not.in.(${ids.join(',')})` : '';
    const res = await sb(`/rest/v1/placsp_interesantes?vigente=eq.true${filtro}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ vigente: false, actualizada: ahora }),
    });
    apagadas = (await res.json()).length;
  }
  log(`Guardadas ${filas.length} · ya no marcadas en el Monitor: ${apagadas}`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
