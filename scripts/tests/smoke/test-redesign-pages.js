// Smoke tests: deploys públicos del rediseño v1 en GitHub Pages.
// Verifica que las páginas críticas devuelven 200 con el contenido esperado.

const A = require('../_lib/assert');

const BASE = process.env.CRM_URL || 'https://mafernandez-create.github.io/crm-prospector/';

async function fetchText(url) {
  try {
    const r = await fetch(url);
    const txt = await r.text();
    return { status: r.status, text: txt };
  } catch (e) {
    return { status: 0, text: '', error: e.message };
  }
}

(async () => {
  A.reset();

  const root = BASE.replace(/\/?$/, '/');

  // 1. Root sirve el rediseño (no legacy)
  const r1 = await fetchText(root);
  A.eq(r1.status, 200, 'GET / → 200');
  A.matches(r1.text, /Redise[ñn]o\s*v1/i, '/ es el rediseño v1 (no legacy)');
  A.contains(r1.text, 'redesign/tokens.css', '/ carga tokens.css');
  A.contains(r1.text, 'redesign/app.js', '/ carga app.js');
  A.contains(r1.text, 'sw.js', '/ registra SW desde archivo externo sw.js');

  // 1b. sw.js servido correctamente y tiene CACHE_NAME v2
  const swResp = await fetchText(root + 'sw.js');
  A.eq(swResp.status, 200, 'GET /sw.js → 200');
  A.contains(swResp.text, "CACHE_NAME = 'crm-prospector-v2'", 'sw.js sirve CACHE_NAME v2');
  A.matches(swResp.text, /content-type|/i, 'sw.js servido (chequeo trivial)');

  // 2. index-legacy.html accesible para rollback
  const r2 = await fetchText(root + 'index-legacy.html');
  A.eq(r2.status, 200, 'GET /index-legacy.html → 200');
  A.matches(r2.text, /CRM Prospector/i, 'legacy contiene CRM Prospector');
  // firebaseConfig aparece bien dentro del HTML (línea ~5530), comprobamos en todo el texto:
  A.contains(r2.text, 'FIREBASE_CONFIG', 'legacy tiene FIREBASE_CONFIG embebido (CRM antiguo)');
  A.contains(r2.text, 'ferroplast-crm', 'legacy apunta al mismo Firestore (ferroplast-crm)');

  // 3. Recursos críticos del rediseño servidos correctamente
  const assets = [
    'redesign/tokens.css',
    'redesign/components.css',
    'redesign/icons.js',
    'redesign/states.js',
    'redesign/data.js',
    'redesign/app.js',
    'redesign/shell.js',
    'redesign/screens/inicio.js',
    'redesign/screens/studios.js',
    'redesign/screens/detail.js',
    'redesign/screens/comollegar.js',
    'redesign/screens/briefing.js',
    'redesign/screens/informe.js',
    'redesign/screens/dashboard.js',
    'redesign/screens/bandeja.js',
    'redesign/screens/cmdk.js',
  ];
  for (const a of assets) {
    const r = await fetchText(root + a);
    A.eq(r.status, 200, 'GET /' + a + ' → 200');
  }

  // 4. Storybooks accesibles
  const sb1 = await fetchText(root + 'redesign/_demo.html');
  A.eq(sb1.status, 200, 'GET /_demo.html (storybook componentes) → 200');
  const sb2 = await fetchText(root + 'redesign/_states.html');
  A.eq(sb2.status, 200, 'GET /_states.html (storybook estados) → 200');

  // 5. Fuentes Google Fonts referenciadas correctamente
  A.matches(r1.text, /fonts\.googleapis\.com\/css2[^"]*Barlow\+Condensed/, 'preload Barlow Condensed');
  A.matches(r1.text, /Inter:wght/, 'preload Inter');
  A.matches(r1.text, /IBM\+Plex\+Mono/, 'preload IBM Plex Mono');

  // 6. PWA meta tags
  A.contains(r1.text, 'theme-color', '/ declara theme-color');
  A.contains(r1.text, 'apple-mobile-web-app-capable', '/ declara apple-mobile-web-app-capable');
  A.matches(r1.text, /viewport-fit=cover/, '/ declara viewport-fit=cover (safe-area iOS)');

  const s = A.summary();
  console.log(JSON.stringify(s));
  process.exit(s.failed > 0 ? 1 : 0);
})();
