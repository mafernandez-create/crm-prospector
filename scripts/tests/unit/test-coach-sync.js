// Detector de desfase entre la doctrina original de FerroCom Coach y la copia
// vendorizada en redesign/coach-doctrine.js.
//
// El problema que resuelve: la copia del CRM no es literal — está condensada y
// reordenada para caber en un prompt —, así que ningún script puede regenerarla
// sola. Lo que sí se puede es AVISAR: si el original cambia y la copia no, este
// test lo canta en vez de dejar que el CRM escriba con doctrina caducada meses.
//
// La doctrina vive fuera del repo (es un proyecto aparte, ~/Proyectos/Trabajo_GPF/
// ferrocom-coach). En CI esa ruta no existe: el test se salta con un aviso, no
// falla. Solo muerde en la máquina de Manolo, que es donde se edita la doctrina.

const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const crypto = require('crypto');
const A      = require('../_lib/assert');

A.reset();

// Cargar el módulo vendorizado (IIFE sobre window).
global.window = {};
require(path.resolve(__dirname, '..', '..', '..', 'redesign', 'coach-doctrine.js'));
const C = global.window.CoachDoctrine;

A.matches(C.DOCTRINA_SHA, /^[0-9a-f]{16}$/, 'coach-doctrine declara un sello de doctrina');
A.truthy(Array.isArray(C.DOCTRINA_FICHEROS) && C.DOCTRINA_FICHEROS.length === 9,
  'el sello cubre los 9 ficheros de doctrina vendorizados');

const ORIGEN = path.join(
  os.homedir(), 'Proyectos', 'Trabajo_GPF', 'ferrocom-coach',
  'skill', 'ferrocom-coach', 'references');

if (!fs.existsSync(ORIGEN)) {
  // Entorno sin la doctrina (CI, otra máquina, clon limpio). No es un fallo.
  console.error('[coach-sync] doctrina original no encontrada en ' + ORIGEN +
                ' — comprobación de desfase omitida (esperado fuera del Mac de Manolo).');
} else {
  const faltan = C.DOCTRINA_FICHEROS.filter(
    n => !fs.existsSync(path.join(ORIGEN, n + '.md')));
  A.truthy(faltan.length === 0,
    'están los 9 ficheros de doctrina en el original' +
    (faltan.length ? ' (faltan: ' + faltan.join(', ') + ')' : ''));

  if (faltan.length === 0) {
    const concat = C.DOCTRINA_FICHEROS
      .map(n => fs.readFileSync(path.join(ORIGEN, n + '.md'), 'utf8'))
      .join('');
    const sha = crypto.createHash('sha256').update(concat).digest('hex').slice(0, 16);

    A.eq(sha, C.DOCTRINA_SHA,
      'la doctrina original NO ha cambiado desde la última sincronización — si esto ' +
      'falla, la doctrina se editó y hay que re-vendorizar redesign/coach-doctrine.js, ' +
      'actualizar DOCTRINA_SHA a "' + sha + '" y subir VERSION');
  }
}

// Independiente del entorno: comprobaciones de coherencia interna del sello.
const idsTipos = Object.keys(C.TIPOS);
A.truthy(idsTipos.indexOf('primera') >= 0, 'el arquetipo de correo frío sigue existiendo');
A.truthy(idsTipos.length >= 8, 'siguen definidos al menos los 8 arquetipos');

const s = A.summary();
console.log(JSON.stringify(s));
process.exit(s.failed > 0 ? 1 : 0);
