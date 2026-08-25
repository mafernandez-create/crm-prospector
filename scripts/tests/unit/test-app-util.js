// Unit tests para funciones de redesign/app.js (window.Util).
//
// app.js no se puede `require()`: llama a init() al cargarse y toca `document`.
// Así que se extrae el código fuente de las funciones por marcadores y se evalúa
// aislado. Frágil si alguien renombra los marcadores — por eso el test falla con
// un mensaje explícito en vez de en cascada.
//
// Cubre dos reglas globales del proyecto:
//   - extractClaudeText: el texto de Claude NO está siempre en content[0].
//   - stripTimestamps:   ningún informe puede llevar marcas de tiempo.
// La segunda está marcada como OBLIGATORIO en CLAUDE.md y no tenía cobertura.

const fs   = require('fs');
const path = require('path');
const A    = require('../_lib/assert');

A.reset();

const APP = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', 'redesign', 'app.js'), 'utf8');

function extraer(desde, hasta, etiqueta) {
  const i = APP.indexOf(desde);
  const j = APP.indexOf(hasta, i + 1);
  if (i < 0 || j <= i) {
    throw new Error('No se pudo extraer ' + etiqueta + ' de app.js: marcador movido o renombrado');
  }
  return APP.slice(i, j);
}

// ── Cargar las funciones bajo prueba ──────────────────────────────────────────
const srcExtract = extraer(
  'function extractClaudeText(res) {',
  '/* ------------------------------------------------------------',
  'extractClaudeText');
const srcStrip = extraer(
  "var _TS = '",
  '// L2/L3: valida el esquema',
  'stripTimestamps');

// new Function en vez de eval: el cuerpo se compila en su propio ámbito, así no
// colisiona con las declaraciones de este módulo ni ensucia el scope global.
const { extractClaudeText, stripTimestamps, stripTimestampsDeep } = new Function(
  srcExtract + '\n' + srcStrip +
  '\nreturn { extractClaudeText, stripTimestamps, stripTimestampsDeep };'
)();
A.isType(extractClaudeText, 'function', 'extractClaudeText se extrae de app.js');
A.isType(stripTimestamps, 'function', 'stripTimestamps se extrae de app.js');

/* ============================================================================
   extractClaudeText — el bug que rompió el generador de correos
   ========================================================================== */

// Forma clásica (sin pensamiento): el texto va en content[0].
A.eq(
  extractClaudeText({ content: [{ type: 'text', text: 'hola' }] }),
  'hola', 'lee el texto cuando es el primer bloque');

// Forma con pensamiento activado (Opus 5 y familia 4.6+): content[0] es
// "thinking" y el texto viene detrás. Este es el caso que fallaba en silencio.
A.eq(
  extractClaudeText({ content: [
    { type: 'thinking', thinking: 'déjame pensar…' },
    { type: 'text', text: 'el correo' },
  ] }),
  'el correo', 'salta el bloque thinking y encuentra el texto');

// Varios bloques de pensamiento antes del texto.
A.eq(
  extractClaudeText({ content: [
    { type: 'thinking', thinking: 'a' },
    { type: 'thinking', thinking: 'b' },
    { type: 'text', text: 'ok' },
  ] }),
  'ok', 'salta varios bloques de pensamiento');

// Bloque de pensamiento vacío (display omitted): no debe confundirse con texto.
A.eq(
  extractClaudeText({ content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'z' }] }),
  'z', 'un bloque thinking vacío no se toma por texto');

// Un bloque de texto vacío no cuenta: hay que seguir buscando.
A.eq(
  extractClaudeText({ content: [{ type: 'text', text: '' }, { type: 'text', text: 'bueno' }] }),
  'bueno', 'ignora bloques de texto vacíos');

// Respaldos hacia atrás: proxies que devuelven la forma vieja sin `type`.
A.eq(extractClaudeText({ content: [{ text: 'viejo' }] }), 'viejo',
  'acepta la forma antigua de content[0] sin type');
A.eq(extractClaudeText({ content: [{ value: 'valor' }] }), 'valor',
  'acepta la variante con .value');
A.eq(extractClaudeText({ text: 'suelto' }), 'suelto', 'acepta un res.text suelto');

// Vacíos y nulos: devuelve cadena, no revienta.
A.eq(extractClaudeText(null), '', 'tolera null');
A.eq(extractClaudeText({}), '', 'tolera respuesta sin content');
A.eq(extractClaudeText({ content: [] }), '', 'tolera content vacío');

// Errores del proxy: lanza con el mensaje útil, en ambas formas.
let lanzo = false;
try { extractClaudeText({ error: 'No autorizado' }); } catch (e) {
  lanzo = true; A.eq(e.message, 'No autorizado', 'propaga el error en forma de string');
}
A.truthy(lanzo, 'lanza cuando la respuesta trae error');

lanzo = false;
try { extractClaudeText({ error: { message: 'cuota agotada' } }); } catch (e) {
  lanzo = true; A.eq(e.message, 'cuota agotada', 'propaga el error en forma de objeto');
}
A.truthy(lanzo, 'lanza con error en forma de objeto');

// El caso caro: el razonamiento se comió el presupuesto y no escribió nada.
// Sin este aviso el síntoma era "no devolvió JSON parseable", que no dice nada.
lanzo = false;
try {
  extractClaudeText({ stop_reason: 'max_tokens', content: [{ type: 'thinking', thinking: '' }] });
} catch (e) {
  lanzo = true;
  A.matches(e.message, /presupuesto de tokens/, 'el error de max_tokens explica la causa real');
  A.matches(e.message, /effort|max_tokens/, 'el error de max_tokens dice qué tocar');
}
A.truthy(lanzo, 'lanza cuando el razonamiento agotó max_tokens sin producir texto');

// Pero si SÍ hay texto, max_tokens no debe lanzar: el texto manda.
A.eq(
  extractClaudeText({ stop_reason: 'max_tokens', content: [{ type: 'text', text: 'parcial' }] }),
  'parcial', 'con texto presente, max_tokens no lanza');

/* ============================================================================
   stripTimestamps — regla OBLIGATORIA del proyecto, hasta ahora sin cobertura.
   Un informe es un registro comercial, NO una transcripción.
   ========================================================================== */

const debeLimpiar = [
  ['Habló del proyecto [01:47] y del plazo.',        'Habló del proyecto y del plazo.',   'borra [MM:SS]'],
  ['Comentario [01:47–02:34] sobre el pliego.',      'Comentario sobre el pliego.',       'borra rango con guion largo'],
  ['Nota (12:05) del cliente.',                      'Nota del cliente.',                 'borra (MM:SS)'],
  ['Bloque 10:30-11:45 sobre precios.',              'Bloque sobre precios.',             'borra rango suelto'],
  ['Duró [01:02:33] la sesión.',                     'Duró la sesión.',                   'borra HH:MM:SS'],
  ['- [01:12] Punto de la reunión',                  '- Punto de la reunión',             'limpia la viñeta huérfana'],
];
for (const [entrada, esperado, desc] of debeLimpiar) {
  A.eq(stripTimestamps(entrada), esperado, 'stripTimestamps ' + desc);
}

// Controles negativos: lo que NO debe tocar. Tan importante como lo que borra.
const debeRespetar = [
  ['Visita del [2026-07-14] a Granada.', 'no toca una fecha ISO entre corchetes'],
  ['Quedamos a las 10:30 en la obra.',   'no toca una hora suelta'],
  ['Presupuesto: [SIN DATO]',            'no toca el marcador [SIN DATO]'],
  ['Ref. 3001:20 del catálogo',          'no toca un código de producto'],
  ['Tramo 100:50–200:60 del pliego',     'no toca un rango numérico no horario'],
];
for (const [entrada, desc] of debeRespetar) {
  A.eq(stripTimestamps(entrada), entrada, 'stripTimestamps ' + desc);
}

// No-strings pasan tal cual (se aplica sobre objetos heterogéneos).
A.eq(stripTimestamps(42), 42, 'stripTimestamps devuelve los no-strings sin tocar');
A.eq(stripTimestamps(null), null, 'stripTimestamps tolera null');

// Recorrido profundo: informes importados de YAML son objetos anidados.
const informe = {
  titulo: 'Visita [00:05]',
  puntos: ['Precio [01:10]', { nota: 'Cierre (02:00)', fecha: '[2026-07-14]' }],
  nivel: 3,
};
const limpio = stripTimestampsDeep(informe);
A.eq(limpio.titulo, 'Visita', 'deep: limpia strings de primer nivel');
A.eq(limpio.puntos[0], 'Precio', 'deep: limpia dentro de arrays');
A.eq(limpio.puntos[1].nota, 'Cierre', 'deep: limpia objetos anidados en arrays');
A.eq(limpio.puntos[1].fecha, '[2026-07-14]', 'deep: respeta las fechas anidadas');
A.eq(limpio.nivel, 3, 'deep: no toca los números');

const s = A.summary();
console.log(JSON.stringify(s));
process.exit(s.failed > 0 ? 1 : 0);
