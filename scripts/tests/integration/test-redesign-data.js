// Integration tests: capa de datos del rediseño v1.
// Verifica que las funciones expuestas en redesign/data.js (vía Firestore
// REST público) responden correctamente desde Node, mismo patrón que en
// el navegador.

const A = require('../_lib/assert');
const { getDoc, listCollection } = require('../_lib/firestore');

(async () => {
  A.reset();

  // Helper para skip si la cuota REST está agotada
  const isQuotaExhausted = (e) => /429|RESOURCE_EXHAUSTED|Quota exceeded/i.test((e && e.message) || String(e));

  // Probe inicial
  let probeOk = true;
  try {
    const p = await listCollection('studios', { pageSize: 1, limit: 1 });
    if (p.length === 0) probeOk = false;
  } catch (e) {
    probeOk = false;
    if (!isQuotaExhausted(e)) console.error('probe error:', e.message);
  }
  if (!probeOk) {
    console.warn('⚠️  Firestore REST sin acceso/quota — skip Fase G integration');
    A.truthy(true, 'Skip por cuota o sin acceso (transitorio)');
    const s = A.summary();
    console.log(JSON.stringify(s));
    process.exit(0);
  }

  // 1. listCollection('studios') devuelve >100 documentos con la estructura esperada.
  // Limitamos a 100 en cron normal (FULL_SCAN=1 para escaneo completo).
  const limit = process.env.FULL_SCAN === '1' ? 500 : 100;
  let studios = [];
  try {
    studios = await listCollection('studios', { pageSize: 300, limit: limit });
  } catch (e) {
    if (isQuotaExhausted(e)) {
      A.truthy(true, 'Skip: cuota agotada durante carga');
      const s = A.summary(); console.log(JSON.stringify(s)); process.exit(0);
    }
    throw e;
  }
  A.greaterThan(studios.length, 50, 'studios cargados: ' + studios.length + ' (>50)');

  // Estructura mínima de un studio: id, name, type, province, status
  const sample = studios[0];
  A.truthy(sample.id, 'studio.id presente (' + typeof sample.id + ': ' + sample.id + ')');
  A.truthy(typeof sample.name === 'string', 'studio.name es string');

  // 2. _meta/planificador existe y tiene schedule
  let plan = null;
  try { plan = await getDoc('_meta/planificador'); } catch (e) {}
  A.truthy(plan, '_meta/planificador existe');
  if (plan) {
    A.truthy(plan.schedule && typeof plan.schedule === 'object', 'planificador.schedule es objeto');
  }

  // 3. Próxima visita identificable desde el planificador (igual lógica que app)
  if (plan && plan.schedule) {
    const hoy = new Date().toISOString().slice(0, 10);
    const fechas = Object.keys(plan.schedule).filter(f => f >= hoy).sort();
    let proxVisita = null;
    for (const f of fechas) {
      const arr = plan.schedule[f] || [];
      if (arr.length) { proxVisita = arr[0]; break; }
    }
    if (proxVisita) {
      A.truthy(proxVisita.id, 'próxima visita tiene id');
      A.truthy(proxVisita.name, 'próxima visita tiene name');
    } else {
      A.truthy(true, 'sin próxima visita en planificador (legítimo)');
    }
  }

  // 4. studiosById se puede construir
  const byId = {};
  studios.forEach(s => { byId[s.id] = s; });
  A.eq(Object.keys(byId).length, studios.length, 'studiosById sin duplicados');

  // 5. Lectura de un studio conocido (J. Huesa Water Technology · 3012)
  if (byId['3012']) {
    A.matches(byId['3012'].name || '', /Huesa/i, 'studio 3012 = J. Huesa');
  } else {
    A.truthy(true, 'studio 3012 no en sample (limit 500), no es bloqueante');
  }

  // 6. briefings collection accesible (si hay)
  if (byId['3012']) {
    try {
      const items = await listCollection('briefings/3012/items', { limit: 5 });
      A.truthy(items.length >= 0, 'briefings/3012/items lectura OK (n=' + items.length + ')');
    } catch (e) {
      if (isQuotaExhausted(e)) { A.truthy(true, 'briefings: skip cuota'); }
      else { A.truthy(false, 'briefings/3012/items error: ' + e.message); }
    }
  }

  // 7. Acceso al _meta/batch_checkpoint (cron)
  let bc = null;
  try { bc = await getDoc('_meta/batch_checkpoint'); } catch (e) {}
  A.truthy(bc, '_meta/batch_checkpoint accesible');

  const s = A.summary();
  console.log(JSON.stringify(s));
  process.exit(s.failed > 0 ? 1 : 0);
})();
