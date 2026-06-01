// Integration tests para el feed ATOM de PLACSP.
// Endpoint oficial usado por scripts/placsp-fetch.js.

const A = require('../_lib/assert');

const ATOM_URL = 'https://contrataciondelestado.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom';

(async () => {
  A.reset();

  let status = 0;
  let xml = '';
  try {
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), 60000);
    try {
      const res = await fetch(ATOM_URL, {
        headers: { 'Accept': 'application/atom+xml,application/xml,text/xml', 'User-Agent': 'CRM-Prospector-PLACSP-Tests/1.0' },
        signal:  ctrl.signal,
      });
      status = res.status;
      xml = await res.text();
    } finally { clearTimeout(tm); }
  } catch (e) {
    console.error('ERROR fetch PLACSP feed:', e.message);
  }

  A.eq(status, 200, 'PLACSP ATOM: HTTP 200 al descargar feed');
  A.contains(xml, '<entry', 'PLACSP ATOM: cuerpo XML contiene tag <entry');

  // Parsing mínimo de entries (cuenta apariciones de <entry abierto)
  const entryMatches = xml.match(/<entry[\s>]/g) || [];
  A.greaterThan(entryMatches.length, 50, `PLACSP ATOM: >50 entries en el feed (obtenidas ${entryMatches.length})`);

  const s = A.summary();
  console.log(JSON.stringify(s));
  process.exit(s.failed > 0 ? 1 : 0);
})();
