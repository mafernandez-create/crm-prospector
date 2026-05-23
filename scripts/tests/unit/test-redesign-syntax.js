// Unit tests: integridad sintáctica del rediseño v1.
// Verifica que cada archivo .js del rediseño parsea limpio y exporta los
// globales esperados en window.* (vía análisis estático del código).

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const A = require('../_lib/assert');

(async () => {
  A.reset();

  const REDESIGN_DIR = path.resolve(__dirname, '..', '..', '..', 'redesign');

  // 1. Archivos esperados existen
  const archivos = [
    'tokens.css',
    'components.css',
    'icons.js',
    'states.js',
    'data.js',
    'app.js',
    'shell.js',
    'screens/inicio.js',
    'screens/studios.js',
    'screens/detail.js',
    'screens/comollegar.js',
    'screens/briefing.js',
    'screens/informe.js',
    'screens/dashboard.js',
    'screens/bandeja.js',
    'screens/planificador.js',
    'screens/mapa.js',
    'screens/importar.js',
    'screens/cmdk.js',
  ];

  for (const rel of archivos) {
    const abs = path.join(REDESIGN_DIR, rel);
    A.truthy(fs.existsSync(abs), 'redesign/' + rel + ' existe');
  }

  // 2. Sintaxis JS válida en todos los .js del rediseño
  const jsFiles = archivos.filter(f => f.endsWith('.js'));
  for (const rel of jsFiles) {
    const abs = path.join(REDESIGN_DIR, rel);
    if (!fs.existsSync(abs)) continue;
    const r = spawnSync('node', ['--check', abs], { encoding: 'utf8' });
    A.eq(r.status, 0, 'sintaxis OK: redesign/' + rel);
    if (r.status !== 0 && r.stderr) {
      console.error('  └─ ' + r.stderr.split('\n')[0]);
    }
  }

  // 3. Cada archivo expone los globales window.* esperados
  const expectedExports = [
    { file: 'icons.js',                  globals: ['window.Icon', 'window.BrandMarks'] },
    { file: 'states.js',                 globals: ['window.States'] },
    { file: 'data.js',                   globals: ['window.Data'] },
    { file: 'app.js',                    globals: ['window.State', 'window.Cmdk', 'window.openSheet', 'window.closeSheet', 'window.Util', 'window.showView'] },
    { file: 'shell.js',                  globals: ['window.Shell'] },
    { file: 'screens/inicio.js',         globals: ['window.Screens'] },
    { file: 'screens/studios.js',        globals: ['window.Screens'] },
    { file: 'screens/detail.js',         globals: ['window.Screens'] },
    { file: 'screens/comollegar.js',     globals: ['window.Screens'] },
    { file: 'screens/briefing.js',       globals: ['window.Screens'] },
    { file: 'screens/informe.js',        globals: ['window.Screens'] },
    { file: 'screens/dashboard.js',      globals: ['window.Screens'] },
    { file: 'screens/bandeja.js',        globals: ['window.Screens'] },
    { file: 'screens/planificador.js',   globals: ['window.Screens'] },
    { file: 'screens/mapa.js',           globals: ['window.Screens'] },
    { file: 'screens/importar.js',       globals: ['window.Screens'] },
    { file: 'screens/cmdk.js',           globals: ['window.Screens'] },
  ];

  for (const e of expectedExports) {
    const abs = path.join(REDESIGN_DIR, e.file);
    if (!fs.existsSync(abs)) continue;
    const src = fs.readFileSync(abs, 'utf8');
    for (const g of e.globals) {
      A.contains(src, g + ' =', e.file + ' exporta ' + g);
    }
  }

  // 4. tokens.css tiene los tokens críticos del DS
  const tokens = fs.readFileSync(path.join(REDESIGN_DIR, 'tokens.css'), 'utf8');
  const criticalTokens = [
    '--gpf-blue-900', '--gpf-blue-700', '--gpf-blue-500', '--gpf-blue-100',
    '--mute-red', '--paper-warm',
    '--font-display', '--font-sans', '--font-mono',
    '--safe-top', '--safe-bot',
    '--q-estrategico', '--q-congelar',
  ];
  for (const t of criticalTokens) {
    A.contains(tokens, t + ':', 'tokens.css tiene ' + t);
  }

  // 5. components.css tiene selectores scoped a .crm-root
  const components = fs.readFileSync(path.join(REDESIGN_DIR, 'components.css'), 'utf8');
  const scopedCount = (components.match(/\.crm-root/g) || []).length;
  A.greaterThan(scopedCount, 50, 'components.css: ' + scopedCount + ' selectores .crm-root (esperado >50)');

  // 6. index.html (producción) carga los scripts del rediseño en orden correcto
  const indexHtml = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'index.html'), 'utf8');
  A.contains(indexHtml, 'redesign/tokens.css', 'index.html carga tokens.css');
  A.contains(indexHtml, 'redesign/components.css', 'index.html carga components.css');
  A.contains(indexHtml, 'redesign/icons.js', 'index.html carga icons.js');
  A.contains(indexHtml, 'redesign/app.js', 'index.html carga app.js');
  A.contains(indexHtml, 'redesign/screens/inicio.js', 'index.html carga inicio.js');
  A.contains(indexHtml, 'redesign/screens/informe.js', 'index.html carga informe.js');
  A.contains(indexHtml, "register(swUrl", 'index.html registra el SW (archivo externo)');

  // 6b. sw.js existe como archivo real y tiene la CACHE_NAME esperada
  const swPath = path.resolve(__dirname, '..', '..', '..', 'sw.js');
  A.truthy(fs.existsSync(swPath), 'sw.js existe en raíz (archivo real, no blob)');
  if (fs.existsSync(swPath)) {
    const swSrc = fs.readFileSync(swPath, 'utf8');
    A.matches(swSrc, /CACHE_NAME = 'crm-prospector-v\d+'/, 'sw.js declara CACHE_NAME versionado');
    A.contains(swSrc, 'skipWaiting', 'sw.js usa skipWaiting');
    A.contains(swSrc, 'clients.claim', 'sw.js usa clients.claim');
  }

  // 7. index-legacy.html sigue accesible (rollback path)
  const legacyPath = path.resolve(__dirname, '..', '..', '..', 'index-legacy.html');
  A.truthy(fs.existsSync(legacyPath), 'index-legacy.html existe (rollback)');
  const legacy = fs.readFileSync(legacyPath, 'utf8').slice(0, 5000);
  A.contains(legacy, 'CRM Prospector', 'index-legacy.html parece el CRM antiguo');

  const s = A.summary();
  console.log(JSON.stringify(s));
  process.exit(s.failed > 0 ? 1 : 0);
})();
