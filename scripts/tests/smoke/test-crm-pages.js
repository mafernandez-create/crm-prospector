// Smoke test del CRM publicado en GitHub Pages.
// Comprueba que el index.html sirve 200 y contiene los marcadores clave
// del bundle (firestoreDB, loadBandeja, marca de proyecto, etc.).

const A = require('../_lib/assert');

const CRM_URL = process.env.CRM_URL || 'https://mafernandez-create.github.io/crm-prospector/';

(async () => {
  A.reset();

  let status = 0;
  let html = '';
  try {
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), 30000);
    try {
      const res = await fetch(CRM_URL, { signal: ctrl.signal });
      status = res.status;
      html = await res.text();
    } finally { clearTimeout(tm); }
  } catch (e) {
    console.error('ERROR fetch CRM:', e.message);
  }

  A.eq(status, 200, `CRM HTML: HTTP 200 desde ${CRM_URL}`);
  A.contains(html, 'Ferroplast',  'CRM HTML: contiene la marca "Ferroplast"');
  A.contains(html, 'loadBandeja', 'CRM HTML: contiene función bundle "loadBandeja"');
  A.contains(html, 'firestoreDB', 'CRM HTML: contiene la variable global "firestoreDB"');

  const s = A.summary();
  console.log(JSON.stringify(s));
  process.exit(s.failed > 0 ? 1 : 0);
})();
