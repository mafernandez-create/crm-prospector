// E2E tests: el rediseño v1 produce las pantallas esperadas vía hash routing.
// Sin browser headless — usamos contenido estático del HTML servido + smoke
// de las URLs de routing (#inicio, #detail/3012, #briefing/3012, …) cuya
// resolución es del lado cliente, así que solo podemos verificar que el
// HTML base trae lo necesario para renderizarlas.

const A = require('../_lib/assert');

const BASE = (process.env.CRM_URL || 'https://mafernandez-create.github.io/crm-prospector/').replace(/\/?$/, '/');

async function fetchText(url) {
  try {
    const r = await fetch(url);
    return { status: r.status, text: await r.text() };
  } catch (e) {
    return { status: 0, text: '', error: e.message };
  }
}

(async () => {
  A.reset();

  // Cargar el HTML del rediseño y verificar elementos clave del shell + screens
  const r = await fetchText(BASE);
  A.eq(r.status, 200, 'GET / → 200');

  const html = r.text;

  // 1. Shell mínimo: <div id="app"> + loader
  A.contains(html, 'id="app"', 'HTML tiene contenedor #app');
  A.contains(html, 'id="app-loader"', 'HTML tiene loader inicial');

  // 2. Todos los scripts del rediseño se cargan en orden
  const ordenScripts = [
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
  let lastPos = -1;
  for (const s of ordenScripts) {
    const pos = html.indexOf(s);
    A.greaterThan(pos, lastPos, 'orden carga: ' + s + ' después del anterior');
    lastPos = pos;
  }

  // 3. PWA: el SW v2 está como archivo externo /sw.js (no inline, blob:
  //    no admitido por Chrome moderno para SW)
  A.contains(html, 'sw.js', 'HTML registra SW desde archivo externo sw.js');
  A.contains(html, 'navigator.serviceWorker.register', 'HTML llama serviceWorker.register');
  // El SW real está en /sw.js (verificado en smoke/test-redesign-pages.js)

  // 4. Manifest meta + safe-area iOS
  A.contains(html, 'apple-mobile-web-app-status-bar-style', 'meta status-bar-style');
  A.contains(html, 'apple-mobile-web-app-title', 'meta app-title');
  A.contains(html, 'theme-color', 'meta theme-color');
  A.matches(html, /viewport-fit=cover/, 'meta viewport-fit=cover');

  // 5. Google Fonts cargado con display=swap (no bloquea render)
  A.contains(html, 'display=swap', 'fonts cargadas con display=swap');

  // 6. Cargar uno de los archivos JS de screen y verificar que registra el screen
  const inicio = await fetchText(BASE + 'redesign/screens/inicio.js');
  A.eq(inicio.status, 200, 'screen inicio.js → 200');
  A.contains(inicio.text, 'window.Screens.inicio', 'inicio.js registra Screens.inicio');
  A.contains(inicio.text, 'computeProximaVisita', 'inicio.js lee planificador real');

  const detail = await fetchText(BASE + 'redesign/screens/detail.js');
  A.eq(detail.status, 200, 'screen detail.js → 200');
  A.contains(detail.text, 'window.Screens.detail', 'detail.js registra Screens.detail');
  A.contains(detail.text, 'Data.generateBriefing', 'detail.js wirea generateBriefing');

  const informe = await fetchText(BASE + 'redesign/screens/informe.js');
  A.eq(informe.status, 200, 'screen informe.js → 200');
  A.contains(informe.text, 'Data.generateReport', 'informe.js wirea generateReport');
  A.contains(informe.text, "'redesign:informe:draft:'", 'informe.js autosave a localStorage namespace');

  // 7. data.js apunta al endpoint GAS de producción
  const data = await fetchText(BASE + 'redesign/data.js');
  A.eq(data.status, 200, 'data.js → 200');
  A.contains(data.text, 'script.google.com/macros', 'data.js → GAS Web App');
  A.contains(data.text, 'AKfycb', 'data.js → ID despliegue válido');

  const s = A.summary();
  console.log(JSON.stringify(s));
  process.exit(s.failed > 0 ? 1 : 0);
})();
