// Unit tests: estructura semántica del rediseño v1.
// Verifica patrones esperados en cada pantalla sin necesidad de DOM real.

const fs = require('fs');
const path = require('path');
const A = require('../_lib/assert');

(async () => {
  A.reset();
  const REDESIGN_DIR = path.resolve(__dirname, '..', '..', '..', 'redesign');

  // 1. Cada screen registra render() y se acopla a window.Screens
  const screens = ['inicio', 'studios', 'detail', 'briefing', 'informe', 'dashboard', 'bandeja', 'planificador', 'mapa', 'importar', 'cmdk'];
  for (const s of screens) {
    const file = path.join(REDESIGN_DIR, 'screens', s + '.js');
    const src = fs.readFileSync(file, 'utf8');
    A.contains(src, 'window.Screens.' + s, 'screens/' + s + '.js asigna window.Screens.' + s);
    // Excepción: comollegar usa "open" (sheet) y cmdk usa "update", el resto "render"
  }
  const comollegar = fs.readFileSync(path.join(REDESIGN_DIR, 'screens', 'comollegar.js'), 'utf8');
  A.contains(comollegar, 'window.Screens.comollegar', 'comollegar.js registrado');
  A.contains(comollegar, 'open(studioId)', 'comollegar.js expone open(studioId)');

  // 2. iconos críticos están exportados
  const icons = fs.readFileSync(path.join(REDESIGN_DIR, 'icons.js'), 'utf8');
  const criticos = ['Menu','Search','MapPin','Navigation','Phone','Mail','Calendar','Clock','Building','FileText','Edit','Check','ArrowLeft','ChevronRight','ChevronDown','Plus','X','Target','AlertTriangle','Home','Briefcase','Layers','Bell','Activity','TrendingUp','Save','Cmd','Filter','User','Sun','Wifi','Battery','Signal'];
  for (const ic of criticos) {
    A.matches(icons, new RegExp(ic + ':\\s*\\('), 'icons.js exporta Icon.' + ic);
  }
  A.contains(icons, 'BrandMarks', 'icons.js exporta BrandMarks');
  A.contains(icons, 'AppleMaps', 'BrandMarks tiene AppleMaps');
  A.contains(icons, 'GoogleMaps', 'BrandMarks tiene GoogleMaps');
  A.contains(icons, 'Waze', 'BrandMarks tiene Waze');

  // 3. data.js apunta al endpoint GAS correcto y al proyecto Firestore
  const data = fs.readFileSync(path.join(REDESIGN_DIR, 'data.js'), 'utf8');
  A.contains(data, 'ferroplast-crm', 'data.js apunta a proyecto ferroplast-crm');
  A.contains(data, 'script.google.com/macros', 'data.js apunta al GAS endpoint');
  A.contains(data, 'AKfycb', 'data.js tiene el ID del despliegue GAS');
  A.contains(data, 'function loadAll', 'data.js expone loadAll()');
  A.contains(data, 'function generateBriefing', 'data.js expone generateBriefing()');
  A.contains(data, 'function generateReport', 'data.js expone generateReport()');

  // 4. informe.js implementa autosave + estado loading/error/success
  const informe = fs.readFileSync(path.join(REDESIGN_DIR, 'screens', 'informe.js'), 'utf8');
  A.contains(informe, 'localStorage.setItem', 'informe.js persiste a localStorage');
  A.contains(informe, "'redesign:informe:draft:'", 'informe.js usa namespace redesign:* en localStorage');
  A.contains(informe, 'States.showLoading', 'informe.js usa States.showLoading');
  A.contains(informe, 'States.showError', 'informe.js usa States.showError');
  // En éxito informe.js NO usa el panel genérico showSuccess: renderiza el
  // informe generado (markdown) vía _showInformeResultado. Verificamos esa ruta.
  A.contains(informe, '_showInformeResultado', 'informe.js muestra el informe generado en éxito');
  A.contains(informe, 'Data.generateReport', 'informe.js llama Data.generateReport');

  // 5. detail.js wirea regenerar briefing
  const detail = fs.readFileSync(path.join(REDESIGN_DIR, 'screens', 'detail.js'), 'utf8');
  A.contains(detail, 'Data.generateBriefing', 'detail.js llama Data.generateBriefing');
  A.contains(detail, 'regenerar-briefing', 'detail.js tiene CTA regenerar-briefing');

  // 6. states.js expone los 5 helpers
  const states = fs.readFileSync(path.join(REDESIGN_DIR, 'states.js'), 'utf8');
  for (const fn of ['showEmpty', 'showLoading', 'showError', 'showSuccess', 'showKeyboard']) {
    A.contains(states, 'function ' + fn, 'states.js define ' + fn);
  }

  // 7. cmdk.js implementa fuzzy + keyboard nav
  const cmdk = fs.readFileSync(path.join(REDESIGN_DIR, 'screens', 'cmdk.js'), 'utf8');
  A.contains(cmdk, 'ArrowDown', 'cmdk.js maneja ArrowDown');
  A.contains(cmdk, 'ArrowUp', 'cmdk.js maneja ArrowUp');
  A.contains(cmdk, "key === 'Enter'", 'cmdk.js maneja Enter');
  A.contains(cmdk, "key === 'Tab'", 'cmdk.js maneja Tab');
  A.contains(cmdk, 'scoreEmpresa', 'cmdk.js implementa scoring para fuzzy');

  // 8. shell.js monta sidebar + topbar + 10 vistas
  const shell = fs.readFileSync(path.join(REDESIGN_DIR, 'shell.js'), 'utf8');
  for (const view of ['inicio', 'studios', 'detail', 'briefing', 'informe', 'bandeja', 'dashboard']) {
    A.contains(shell, 'view-' + view, 'shell.js declara <section id="view-' + view + '">');
  }
  A.contains(shell, 'cmdk-overlay', 'shell.js monta cmdk-overlay');
  A.contains(shell, 'sheet-overlay', 'shell.js monta sheet-overlay');

  // 9. app.js implementa hash routing
  const app = fs.readFileSync(path.join(REDESIGN_DIR, 'app.js'), 'utf8');
  A.contains(app, 'hashchange', 'app.js escucha hashchange');
  A.contains(app, 'showView', 'app.js define showView');
  A.contains(app, "key.toLowerCase() === 'k'", 'app.js maneja ⌘K');

  const s = A.summary();
  console.log(JSON.stringify(s));
  process.exit(s.failed > 0 ? 1 : 0);
})();
