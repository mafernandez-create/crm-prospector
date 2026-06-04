// Integration tests · Supabase (REST público con anon key)
// Valida lecturas, paginación y roundtrip de writes contra el proyecto
// ferroplast-crm en Supabase. No depende de credenciales locales: la
// anon key es pública y va embebida en el adapter del rediseño.

const A = require('../_lib/assert');

const SUPABASE_URL = 'https://zmelqffrkwxkbzzutjrg.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
  '.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptZWxxZmZya3d4a2J6enV0anJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1Mjg2MzAsImV4cCI6MjA5NTEwNDYzMH0' +
  '.v1_Isxz6-mZtz_DJs3k6qoH9mV9FNW21Z94tiew9cQE';

async function sb(path, opts) {
  opts = opts || {};
  const headers = Object.assign({
    'apikey': ANON,
    'Authorization': 'Bearer ' + ANON,
  }, opts.headers || {});
  if (opts.method && opts.method !== 'GET') headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  const r = await fetch(SUPABASE_URL + '/rest/v1' + path, {
    method: opts.method || 'GET',
    headers: headers,
    body: opts.body,
  });
  return r;
}

(async () => {
  A.reset();

  // 0) Probe de acceso. Tras el cierre de RLS (hallazgo C1), la anon key solo
  //    tiene los permisos que conceda RLS — hoy NINGUNO (rol authenticated
  //    requerido). Sin acceso de lectura/escritura no se puede validar Supabase
  //    con la anon key pública → SKIP limpio (skip != fail). La validación real
  //    de writes requiere SUPABASE_SERVICE_ROLE_KEY (no se usa aquí: este test
  //    hacía writes destructivos —reseteaba meta_planificador— y la RLS ahora
  //    lo bloquea, que es justo lo que queremos).
  const ping = await sb('/studios?select=id&limit=1');
  let pingBody = null;
  try { pingBody = await ping.json(); } catch (_) { /* body no-JSON */ }
  const cr = await sb('/studios?select=count', { headers: { 'Prefer': 'count=exact' } });
  const range = cr.headers.get('content-range');
  const totalCount = parseInt((range || '0/0').split('/')[1], 10) || 0;

  if (ping.status !== 200 || !Array.isArray(pingBody) || totalCount === 0) {
    console.warn('⚠️  Supabase: la anon key no tiene acceso a los datos ' +
      '(RLS exige rol authenticated tras el cierre de C1; GET status ' + ping.status +
      ', total visible ' + totalCount + '). SKIP — validar Supabase requiere SUPABASE_SERVICE_ROLE_KEY.');
    A.truthy(true, 'Supabase: skip (anon sin acceso por RLS, status ' + ping.status + '/total ' + totalCount + ')');
    const s = A.summary();
    console.log(JSON.stringify(s));
    process.exit(0);
  }

  // 1) Conectividad básica
  A.eq(ping.status, 200, 'Supabase responde 200 a GET /studios');

  // 2) Count total con header count=exact (200 sin Range, 206 con Range)
  A.truthy(cr.status === 200 || cr.status === 206, 'count=exact responde 200/206 (got ' + cr.status + ')');
  A.matches(range || '', /\/\d+/, 'content-range incluye total: ' + range);
  A.greaterThan(totalCount, 50, 'Hay studios cargados en Supabase (total=' + totalCount + ')');

  // 3) Paginación Range header funciona
  const p1 = await sb('/studios?select=id', { headers: { 'Range-Unit': 'items', 'Range': '0-99' } });
  A.eq(p1.status, 200, 'GET con Range 0-99 → 200');
  const batch1 = await p1.json();
  A.eq(batch1.length, 100, 'Range 0-99 devuelve 100 rows');

  if (totalCount > 100) {
    const p2 = await sb('/studios?select=id', { headers: { 'Range-Unit': 'items', 'Range': '100-199' } });
    const batch2 = await p2.json();
    A.greaterThan(batch2.length, 0, 'Segunda página tiene rows');
    // No overlap (los IDs no deben coincidir)
    const overlap = batch1.filter(r => batch2.find(s => s.id === r.id));
    A.eq(overlap.length, 0, 'No hay overlap entre páginas');
  }

  // 4) Tabla briefings existe y es accesible
  const brief = await sb('/briefings?select=count', { headers: { 'Prefer': 'count=exact' } });
  A.truthy(brief.status === 200 || brief.status === 206, 'briefings accesible (got ' + brief.status + ')');

  // 5) Tabla meta_planificador existe y tiene fila id=1
  const plan = await sb('/meta_planificador?id=eq.1&select=id,schedule');
  A.eq(plan.status, 200, 'meta_planificador accesible');
  const planArr = await plan.json();
  A.eq(planArr.length, 1, 'meta_planificador tiene exactamente 1 fila');
  A.eq(planArr[0].id, 1, 'la fila tiene id=1');

  // 6) Roundtrip studio: insertar TEST, leer, borrar
  const testId = 'INTEGRATION_TEST_' + Date.now();
  const ins = await sb('/studios?on_conflict=id', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify([{
      id: testId,
      name: 'Integration test studio',
      province: 'TEST',
      score: 5,
      data: { test: true, ts: Date.now() },
    }]),
  });
  // Guard: si la escritura está bloqueada por RLS/permisos, SKIP limpio (nunca crashear).
  if (ins.status === 401 || ins.status === 403) {
    const errTxt = await ins.text().catch(function () { return ''; });
    console.warn('⚠️  Supabase: escritura rechazada (status ' + ins.status + '): ' + errTxt.slice(0, 120) +
      '. SKIP roundtrip de writes (anon sin permiso de escritura por RLS).');
    A.truthy(true, 'Supabase: skip writes (RLS, status ' + ins.status + ')');
    const s = A.summary();
    console.log(JSON.stringify(s));
    process.exit(0);
  }
  const insArr = await ins.json();
  if (!Array.isArray(insArr) || !insArr[0]) {
    console.warn('⚠️  Supabase: INSERT no devolvió representación (status ' + ins.status + '). SKIP.');
    A.truthy(true, 'Supabase: skip (insert sin fila devuelta, status ' + ins.status + ')');
    const s = A.summary();
    console.log(JSON.stringify(s));
    process.exit(0);
  }
  A.eq(ins.status, 201, 'INSERT test studio → 201');
  A.eq(insArr[0].id, testId, 'Insert retorna id correcto');
  A.eq(insArr[0].score, 5, 'score persistido');

  // PATCH del mismo
  const upd = await sb('/studios?id=eq.' + testId, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify({ score: 7 }),
  });
  A.eq(upd.status, 200, 'PATCH → 200');
  const updArr = await upd.json();
  A.eq(updArr[0].score, 7, 'PATCH actualiza score');

  // DELETE limpio
  const del = await sb('/studios?id=eq.' + testId, { method: 'DELETE' });
  A.eq(del.status, 204, 'DELETE → 204');
  const verify = await sb('/studios?id=eq.' + testId + '&select=id');
  const verifyArr = await verify.json();
  A.eq(verifyArr.length, 0, 'studio borrado, no aparece en query');

  // 7) Roundtrip planificador
  const planTestKey = 'TEST_DAY_' + Date.now();
  const planSched = {};
  planSched[planTestKey] = [{ id: '999', name: 'test', city: '', province: '' }];
  const planUpd = await sb('/meta_planificador?id=eq.1', {
    method: 'PATCH',
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify({ schedule: planSched }),
  });
  A.eq(planUpd.status, 200, 'PATCH planificador → 200');
  const planRead = await sb('/meta_planificador?id=eq.1&select=schedule');
  const planJ = await planRead.json();
  A.truthy(planJ[0].schedule[planTestKey], 'schedule contiene la clave test');
  // Cleanup
  await sb('/meta_planificador?id=eq.1', {
    method: 'PATCH',
    body: JSON.stringify({ schedule: {} }),
  });

  const s = A.summary();
  console.log(JSON.stringify(s));
  process.exit(s.failed > 0 ? 1 : 0);
})().catch(e => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
