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
    'data-supabase.js',
    'app.js',
    'coach-doctrine.js',
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

  // 2. Sintaxis JS válida en TODOS los .js del rediseño.
  //    La lista se recorre del disco, no de `archivos`: esa es a mano y se
  //    queda atrás. atlas-agua.js entró el 2-oct-2026 sin que nadie la
  //    actualizara, así que el módulo nuevo no pasaba ni por `node --check`
  //    —y en un proyecto sin build step, un error de sintaxis se descubre en
  //    producción. Lo que esté en redesign/ se comprueba, se haya apuntado o no.
  const porDisco = (dir, pref = '') => fs.readdirSync(dir, { withFileTypes: true })
    .flatMap(d => d.isDirectory() ? porDisco(path.join(dir, d.name), pref + d.name + '/')
                                  : (d.name.endsWith('.js') ? [pref + d.name] : []))
    .sort();
  const jsFiles = porDisco(REDESIGN_DIR);
  A.greaterThan(jsFiles.length, archivos.filter(f => f.endsWith('.js')).length - 1,
                'se comprueban los ' + jsFiles.length + ' .js que hay en redesign/');
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
    { file: 'data-supabase.js',          globals: ['window.DataSupabase'] },
    { file: 'app.js',                    globals: ['window.State', 'window.Cmdk', 'window.openSheet', 'window.closeSheet', 'window.Util', 'window.showView'] },
    { file: 'coach-doctrine.js',         globals: ['window.CoachDoctrine'] },
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
    { file: 'atlas-agua.js',             globals: ['window.AtlasAgua'] },
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
  A.contains(indexHtml, 'redesign/coach-doctrine.js', 'index.html carga coach-doctrine.js');
  A.contains(indexHtml, 'redesign/screens/inicio.js', 'index.html carga inicio.js');
  A.contains(indexHtml, 'redesign/screens/informe.js', 'index.html carga informe.js');
  A.contains(indexHtml, 'redesign/atlas-agua.js', 'index.html carga atlas-agua.js');
  A.contains(indexHtml, "register(swUrl", 'index.html registra el SW (archivo externo)');

  // 6a. El ORDEN importa: no hay bundler, cada módulo se apoya en los globales
  //     que dejó el anterior. Comprobar que el script está no basta — detail.js
  //     llama a AtlasAgua, que llama a Util y a DataSupabase.
  const pos = rel => indexHtml.indexOf('redesign/' + rel);
  const antes = (a, b) => {
    A.truthy(pos(a) >= 0 && pos(b) >= 0 && pos(a) < pos(b),
             'index.html carga ' + a + ' antes de ' + b);
  };
  antes('app.js', 'atlas-agua.js');            // AtlasAgua usa Util.clavesMunicipioRango
  antes('data-supabase.js', 'atlas-agua.js');  // y DataSupabase.sbGet
  antes('atlas-agua.js', 'screens/detail.js'); // la ficha es quien lo llama
  antes('app.js', 'shell.js');

  // 6b. sw.js existe como archivo real y tiene la CACHE_NAME esperada
  const swPath = path.resolve(__dirname, '..', '..', '..', 'sw.js');
  A.truthy(fs.existsSync(swPath), 'sw.js existe en raíz (archivo real, no blob)');
  if (fs.existsSync(swPath)) {
    const swSrc = fs.readFileSync(swPath, 'utf8');
    A.matches(swSrc, /CACHE_NAME = 'crm-prospector-v\d+'/, 'sw.js declara CACHE_NAME versionado');
    A.contains(swSrc, 'skipWaiting', 'sw.js usa skipWaiting');
    A.contains(swSrc, 'clients.claim', 'sw.js usa clients.claim');
  }

  // 7. index-legacy.html RETIRADO (2026-06): leía Firestore, bloqueado al cerrar
  //    la RLS/auth. Se confirma que ya NO está en el repo (recuperable del historial).
  const legacyPath = path.resolve(__dirname, '..', '..', '..', 'index-legacy.html');
  A.falsy(fs.existsSync(legacyPath), 'index-legacy.html retirado del repo');

  const s = A.summary();
  console.log(JSON.stringify(s));
  process.exit(s.failed > 0 ? 1 : 0);
})();
