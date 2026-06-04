// Smoke test del CRM publicado en GitHub Pages.
// Tras la Fase H (rediseño v1 en producción), comprueba ambas versiones:
//   - / → rediseño v1
//   - /index-legacy.html → CRM antiguo (rollback)

const A = require('../_lib/assert');

const CRM_URL = (process.env.CRM_URL || 'https://mafernandez-create.github.io/crm-prospector/').replace(/\/?$/, '/');

async function fetchHtml(url, timeoutMs) {
  const ctrl = new AbortController();
  const tm = setTimeout(() => ctrl.abort(), timeoutMs || 30000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    return { status: res.status, html: await res.text() };
  } catch (e) {
    return { status: 0, html: '', error: e.message };
  } finally { clearTimeout(tm); }
}

(async () => {
  A.reset();

  // 1. Rediseño v1 en raíz
  const r1 = await fetchHtml(CRM_URL);
  A.eq(r1.status, 200, 'GET / → 200 (rediseño v1)');
  A.contains(r1.html, 'Ferroplast', '/ contiene la marca "Ferroplast"');
  A.matches(r1.html, /Redise[ñn]o\s*v1/i, '/ es el rediseño v1');

  // 2. CRM antiguo RETIRADO (2026-06): ya no debe servirse (leía Firestore,
  //    bloqueado al cerrar la RLS/auth).
  const r2 = await fetchHtml(CRM_URL + 'index-legacy.html');
  A.eq(r2.status, 404, 'GET /index-legacy.html → 404 (legacy retirado)');

  const s = A.summary();
  console.log(JSON.stringify(s));
  process.exit(s.failed > 0 ? 1 : 0);
})();
