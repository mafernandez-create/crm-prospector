// Unit tests del alias de búsqueda: que buscar «Comunidad de Regantes»
// encuentre también las fichas escritas «C.R. …», y al revés.
//
// El CRM escribe el mismo ente de dos maneras: de las 158 comunidades de
// regantes, 109 están abreviadas («C.R. Huércal-Overa»), 15 con el nombre
// entero («Comunidad General de Regantes del Bajo Andarax») y el resto con
// otras formas. La búsqueda exige que TODAS las palabras del texto aparezcan en
// nombre+ciudad+provincia, así que «comunidad de regantes» encontraba 15 de 158
// y Manolo concluía, con razón, que la ficha no estaba.
//
// Lo que se protege aquí:
//   1. que las dos grafías se encuentren la una a la otra,
//   2. que buscar «comunidad» siga encontrando la ficha que se llama así
//      —el alias AÑADE al pajar, no sustituye—,
//   3. que no arrastre fichas ajenas,
//   4. y que los dos buscadores (listado y ⌘K) usen de verdad el alias: un
//      normalizador bien escrito al que nadie llama no arregla nada.

const fs   = require('fs');
const path = require('path');
const A    = require('../_lib/assert');

A.reset();

const RAIZ = path.resolve(__dirname, '..', '..', '..');
const APP  = fs.readFileSync(path.join(RAIZ, 'redesign', 'app.js'), 'utf8');

function extraer(desde, hasta, etiqueta) {
  const i = APP.indexOf(desde);
  const j = APP.indexOf(hasta, i + 1);
  if (i < 0 || j <= i) {
    throw new Error('No se pudo extraer ' + etiqueta + ' de app.js: marcador movido o renombrado');
  }
  return APP.slice(i, j);
}

const src = extraer(
  '// Normalizador para búsquedas de texto libre',
  '// Índice de adyacencia simétrico derivado de LIMITROFES',
  'normSearch/normSearchAlias');

const { normSearch, normSearchAlias } = new Function(
  src + '\nreturn { normSearch: normSearch, normSearchAlias: normSearchAlias };')();
A.isType(normSearch, 'function', 'normSearch se extrae de app.js');
A.isType(normSearchAlias, 'function', 'normSearchAlias se extrae de app.js');

/* El contrato de los dos buscadores, reproducido: cada palabra del texto tiene
   que aparecer dentro del pajar. Si esto se separa de studios.js/cmdk.js, el
   test de abajo que compara los ficheros lo canta. */
function encuentra(consulta, ficha) {
  const toks = normSearch(consulta).split(' ').filter(Boolean);
  const pajar = normSearchAlias(
    (ficha.name || '') + ' ' + (ficha.city || '') + ' ' + (ficha.province || ''));
  return toks.every(t => pajar.indexOf(t) >= 0);
}

// Fichas reales del CRM (nombres tal como están guardados).
const ABREVIADA  = { id: '301',  name: 'C.R. Huércal-Overa', city: 'Huércal-Overa', province: 'Almería' };
const SIN_PUNTOS = { id: '368',  name: 'CR Acequias del Guadalhorce - Fase I', city: 'Álora', province: 'Málaga' };
const ENTERA     = { id: '2681', name: 'Comunidad General de Regantes del Bajo Andarax', city: 'Huércal de Almería', province: 'Almería' };
const AJENA      = { id: '3139', name: 'Codeur, S.A.', city: 'Vera', province: 'Almería' };
const CIUDAD     = { id: '9000', name: 'Estudio Overa', city: 'Granada', province: 'Granada' };

// ── 1. Las dos grafías se encuentran la una a la otra ─────────────────────────
A.truthy(encuentra('comunidad de regantes huercal', ABREVIADA),
         'el nombre entero encuentra la ficha abreviada (era el fallo)');
A.truthy(encuentra('Comunidad de Regantes', ABREVIADA),
         'y sin municipio también: las 109 abreviadas salen en el listado');
A.truthy(encuentra('comunidad de regantes acequias', SIN_PUNTOS),
         'vale igual escrito «CR» sin puntos');
A.truthy(encuentra('c r bajo andarax', ENTERA),
         'y la abreviatura encuentra la ficha con el nombre entero');
A.truthy(encuentra('ccrr andarax', ENTERA),
         'también «ccrr», que es como se escribe en los correos');

// ── 2. Lo que ya funcionaba sigue funcionando ─────────────────────────────────
// El alias añade al pajar; no sustituye. Si sustituyera, la palabra «comunidad»
// desaparecería del nombre y esta ficha dejaría de encontrarse por su propio
// nombre: sería cambiar un agujero por otro.
A.truthy(encuentra('comunidad', ENTERA),
         'buscar «comunidad» sigue encontrando la ficha que se llama así');
A.truthy(encuentra('regantes bajo andarax', ENTERA), 'y por sus palabras propias');
A.truthy(encuentra('c r huercal', ABREVIADA), 'y la abreviada por la suya');
A.truthy(encuentra('huercal overa', ABREVIADA), 'y por el municipio');

// ── 3. Sin arrastrar fichas ajenas ────────────────────────────────────────────
A.falsy(encuentra('comunidad de regantes', AJENA),
        'una ingeniería no se cuela entre las comunidades de regantes');
A.falsy(encuentra('comunidad de regantes overa', CIUDAD),
        'ni una ficha que solo comparte el topónimo');
A.falsy(encuentra('comunidad de regantes jerte', ABREVIADA),
        'y el alias no afloja el resto de las palabras');
A.eq(normSearchAlias('Codeur, S.A.'), normSearch('Codeur, S.A.'),
     'a un nombre sin comunidad de regantes no se le añade nada');

// ── 4. Los dos buscadores usan el alias ───────────────────────────────────────
// Sin esto, el test seguiría verde con el alias desconectado de la interfaz.
for (const [fich, marca] of [
  ['redesign/screens/studios.js', 'normSearchAlias('],
  ['redesign/screens/cmdk.js',    'normSearchAlias('],
]) {
  A.contains(fs.readFileSync(path.join(RAIZ, fich), 'utf8'), marca,
             fich.split('/').pop() + ' compara contra el pajar con alias');
}
// Y la consulta, en los dos, sigue pasando por normSearch a secas.
A.contains(fs.readFileSync(path.join(RAIZ, 'redesign/screens/studios.js'), 'utf8'),
           'U.normSearch(FILTERS.q)', 'el listado normaliza la consulta sin alias');
A.contains(fs.readFileSync(path.join(RAIZ, 'redesign/screens/cmdk.js'), 'utf8'),
           'window.Util.normSearch(q)', '⌘K normaliza la consulta sin alias');

const s = A.summary();
console.log(JSON.stringify(s));
process.exit(s.failed > 0 ? 1 : 0);
