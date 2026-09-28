// A quién se le puede escribir desde la ficha: el panel de correo ya no está
// anclado a una sola dirección. Se prueba el código REAL, recortado de
// detail.js entre dos marcas, para que el test no sea una copia que se queda
// atrás: si alguien mueve el bloque, este test lo dice en vez de pasar en falso.

const fs   = require('fs');
const path = require('path');
const A    = require('../_lib/assert');

const DETALLE = path.join(__dirname, '..', '..', '..', 'redesign', 'screens', 'detail.js');
const src     = fs.readFileSync(DETALLE, 'utf8');
const INI     = '  var _RE_MAIL = ';
const FIN     = '  /* Construye la URL mailto';

A.reset();

const i = src.indexOf(INI), j = src.indexOf(FIN);
A.truthy(i > 0 && j > i, 'el bloque de destinatarios sigue en detail.js');
if (!(i > 0 && j > i)) { const s = A.summary(); console.log(JSON.stringify(s)); process.exit(1); }

// Stubs de lo único que usa el bloque del resto del módulo.
const U   = { readField: v => (v && typeof v === 'object' && 'valor' in v) ? v.valor : v };
const arr = v => Array.isArray(v) ? v : [];
const window = {};
const { mailsDeTexto, emailDestinatarios, _destActivo } =
  new Function('U', 'arr', 'window',
    src.slice(i, j) + '\nreturn { mailsDeTexto, emailDestinatarios, _destActivo };')(U, arr, window);

// --- Extraer direcciones de lo que hay escrito de verdad en el CRM ----------
const rofisa = 'sros@rofisa.com (directo) · info@rofisa.com (general, VERIFICADO: funciona) · info@eneragua.com (eneragua, general)';
A.eq(mailsDeTexto(rofisa).map(d => d.dir),
     ['sros@rofisa.com', 'info@rofisa.com', 'info@eneragua.com'],
     'ficha 3120: saca las tres direcciones de una sola línea');
A.eq(mailsDeTexto(rofisa)[0].nota, 'directo',
     'se queda con la coletilla de la tarjeta, que es la que dice a cuál escribir');
A.eq(mailsDeTexto('roman@gamagrupo.es / info@gamainmobiliaria.com').length, 2,
     'ficha 3126: separadas por barra, también');
A.eq(mailsDeTexto({ valor: 'info@x.es' })[0].dir, 'info@x.es',
     'campo en forma {valor, nivel_confianza}');
A.eq(mailsDeTexto('Escribir a juan@ayto.es, o bien registro@ayto.es.').map(d => d.dir),
     ['juan@ayto.es', 'registro@ayto.es'],
     'el punto final no se cuela dentro de la dirección');
A.eq(mailsDeTexto('sin correo conocido'), [], 'texto sin arroba: ninguna dirección');
A.eq(mailsDeTexto(null), [], 'campo vacío: ninguna dirección');

// --- Reunir ficha + equipo --------------------------------------------------
const soloEquipo = { name: 'SGM', email: '', team: [
  { name: 'Salvador G.', role: 'Arquitecto', email: 'salvador@sgm.com (nominal) · estudio@sgm.com (general)' },
]};
A.eq(emailDestinatarios(soloEquipo).map(d => d.dir), ['salvador@sgm.com', 'estudio@sgm.com'],
     'ficha sin correo propio: las del equipo ya no son invisibles');

const ambos = { name: 'Novhidro', email: { valor: rofisa }, team: [
  { name: 'Sergio Ros', role: 'Gerente', email: 'sros@rofisa.com' },
]};
const d = emailDestinatarios(ambos);
A.eq(d.length, 3, 'la dirección repetida en ficha y equipo sale una sola vez');
A.eq(d[0].quien, 'Sergio Ros', 'si un contacto le pone nombre a la dirección, gana la persona');
A.truthy(d[0].persona, 'y queda marcada como persona, que es a quien escribe el coach');
A.falsy(d[1].persona, 'una dirección general no tiene persona detrás');

A.eq(emailDestinatarios({ name: 'X', email: '', team: [] }), [],
     'sin nada que enviar, lista vacía (el panel pide destinatario a mano)');
A.eq(emailDestinatarios({ name: 'Y', email: 'info@y.es',
       team: [{ nombre: 'Ana', cargo: 'Jefa', email: 'ana@y.es' }] }).map(x => x.quien),
     ['Y', 'Ana'], 'contactos con las claves en español también cuentan');

// --- Cuál es la activa ------------------------------------------------------
window._emailPanelTo = 'info@eneragua.com';
A.eq(_destActivo(d).dir, 'info@eneragua.com', 'respeta la dirección elegida');
window._emailPanelTo = 'borrada@x.es';
A.eq(_destActivo(d).dir, 'sros@rofisa.com', 'si la elegida ya no está, cae a la primera');
window._emailPanelTo = '';
A.eq(_destActivo([]), null, 'sin direcciones, no hay activa');

const s = A.summary();
console.log(JSON.stringify(s));
process.exit(s.failed > 0 ? 1 : 0);
