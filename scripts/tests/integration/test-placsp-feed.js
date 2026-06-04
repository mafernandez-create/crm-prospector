// Integration tests para el feed ATOM de PLACSP.
// Endpoint oficial usado por scripts/placsp-fetch.js.
//
// NOTA: el WAF de contrataciondelestado.es bloquea User-Agents no-navegador
// (devuelve 200 con body vacío a los runners de GitHub). Usamos un UA de
// navegador real + 1 retry; si aun así el body llega vacío, SKIP limpio
// (convención del README: skip != fail).

const A = require('../_lib/assert');

const ATOM_URL = 'https://contrataciondelestado.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom';
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function fetchFeed() {
  const ctrl = new AbortController();
  const tm = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(ATOM_URL, {
      headers: {
        'Accept': 'application/atom+xml,application/xml,text/xml,*/*',
        'User-Agent': BROWSER_UA,
        'Accept-Language': 'es-ES,es;q=0.9',
      },
      signal: ctrl.signal,
    });
    return { status: res.status, xml: await res.text() };
  } finally { clearTimeout(tm); }
}

(async () => {
  A.reset();

  let status = 0, xml = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const r = await fetchFeed();
      status = r.status; xml = r.xml || '';
      if (status === 200 && xml.includes('<entry')) break;   // contenido usable
    } catch (e) {
      console.error('PLACSP ATOM: intento ' + attempt + ' falló:', e.message);
    }
    if (attempt < 2) await new Promise(function (r) { setTimeout(r, 2000); });
  }

  // Si el feed no devuelve contenido usable → SKIP limpio (no fallo).
  if (status !== 200 || !xml || !xml.includes('<entry')) {
    console.warn('⚠️  PLACSP ATOM: feed no accesible desde el runner ' +
      '(status ' + status + ', ' + xml.length + ' bytes). El WAF de ' +
      'contrataciondelestado.es bloquea peticiones no-navegador en CI. SKIP (skip != fail).');
    A.truthy(true, 'PLACSP ATOM: skip (feed no accesible desde CI)');
    const s = A.summary();
    console.log(JSON.stringify(s));
    process.exit(0);
  }

  // Feed accesible → asserts normales
  A.eq(status, 200, 'PLACSP ATOM: HTTP 200 al descargar feed');
  A.contains(xml, '<entry', 'PLACSP ATOM: cuerpo XML contiene tag <entry');

  const entryMatches = xml.match(/<entry[\s>]/g) || [];
  A.greaterThan(entryMatches.length, 50, `PLACSP ATOM: >50 entries en el feed (obtenidas ${entryMatches.length})`);

  const s = A.summary();
  console.log(JSON.stringify(s));
  process.exit(s.failed > 0 ? 1 : 0);
})();
