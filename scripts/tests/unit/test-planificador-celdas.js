// Unit tests del mapeo fecha ↔ celda de la hoja del jefe (CALENDARIO 2026 MANOLO).
//
// No usa un espejo: extrae _getCellRef/_cellRefToDate del propio planificador.js,
// porque un espejo puede divergir y este mapeo escribe en la hoja de otra persona.
//
// Los valores esperados están verificados celda a celda contra la hoja real
// (descarga xlsx del 2026-07-17). El dato clave: los bloques trimestrales NO están
// equiespaciados — van 2, 37, 72, 106 (35, 35, 34). Suponer 35 siempre desplazaba
// octubre, noviembre y diciembre una fila y escribía la visita en el día siguiente.

const fs = require('fs');
const path = require('path');
const A = require('../_lib/assert');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'redesign', 'screens', 'planificador.js'), 'utf8');

// Extraer del fuente las piezas que necesitamos, sin ejecutar el módulo entero
function extraer(nombre) {
  const re = new RegExp('\\n  (?:const|function) ' + nombre + '\\b');
  const m = SRC.match(re);
  if (!m) throw new Error('No se encontró ' + nombre + ' en planificador.js');
  const desde = m.index + 1;
  // Cortar en la siguiente declaración de nivel 2 espacios
  const resto = SRC.slice(desde + 1);
  const fin = resto.search(/\n  (?:const|let|function|async function|\/\*)/);
  return SRC.slice(desde, fin < 0 ? undefined : desde + 1 + fin);
}

const codigo = [
  extraer('_COL_LETTERS'),
  extraer('_BLOQUE_BASE'),
  extraer('_getCellRef'),
  extraer('_cellRefToDate'),
  'return { _getCellRef, _cellRefToDate, _BLOQUE_BASE };',
].join('\n');

const { _getCellRef, _cellRefToDate, _BLOQUE_BASE } = new Function(codigo)();

A.reset();

// ── Bases de bloque: el dato que estaba mal ────────────────────────────────
A.eq(JSON.stringify(_BLOQUE_BASE), '[2,37,72,106]',
  'Bases de bloque = [2,37,72,106] (separación 35, 35, 34 — no 35 fija)');

// ── Celdas verificadas contra la hoja real ─────────────────────────────────
// Ruta de Murcia de abril (columna C)
A.eq(_getCellRef('2026-04-06'), 'C43', 'Abr 6 → C43 (ruta Murcia, verificado)');
A.eq(_getCellRef('2026-04-09'), 'C46', 'Abr 9 → C46 (ruta Murcia, verificado)');
// Ruta Almería+Murcia de junio (columna M)
A.eq(_getCellRef('2026-06-22'), 'M59', 'Jun 22 → M59 (verificado)');
A.eq(_getCellRef('2026-06-25'), 'M62', 'Jun 25 → M62 (verificado)');
// Julio (columna C, tercer bloque)
A.eq(_getCellRef('2026-07-08'), 'C80', 'Jul 8 → C80 (verificado)');

// ── Primer día de cada mes: la regresión del bug Oct-Dic ───────────────────
A.eq(_getCellRef('2026-01-01'), 'C3',   'Ene 1 → C3');
A.eq(_getCellRef('2026-02-01'), 'H3',   'Feb 1 → H3');
A.eq(_getCellRef('2026-03-01'), 'M3',   'Mar 1 → M3');
A.eq(_getCellRef('2026-04-01'), 'C38',  'Abr 1 → C38');
A.eq(_getCellRef('2026-05-01'), 'H38',  'May 1 → H38');
A.eq(_getCellRef('2026-06-01'), 'M38',  'Jun 1 → M38');
A.eq(_getCellRef('2026-07-01'), 'C73',  'Jul 1 → C73');
A.eq(_getCellRef('2026-08-01'), 'H73',  'Ago 1 → H73');
A.eq(_getCellRef('2026-09-01'), 'M73',  'Sep 1 → M73');
A.eq(_getCellRef('2026-10-01'), 'C107', 'Oct 1 → C107 (era C108: escribía en el día 2)');
A.eq(_getCellRef('2026-11-01'), 'H107', 'Nov 1 → H107 (era H108)');
A.eq(_getCellRef('2026-12-01'), 'M107', 'Dic 1 → M107 (era M108)');

// Festivos conocidos de la hoja, como anclas independientes del cálculo
A.eq(_getCellRef('2026-11-01'), 'H107', 'Nov 1 = "Todos los Santos", que en la hoja está en H107');
A.eq(_getCellRef('2026-12-25'), 'M131', 'Dic 25 = "Navidad", que en la hoja está en M131');
A.eq(_getCellRef('2026-01-01'), 'C3',   'Ene 1 = "Año Nuevo", que en la hoja está en C3');

// ── Años y fechas fuera de rango ───────────────────────────────────────────
A.eq(_getCellRef('2025-06-22'), null, 'Año ≠ 2026 → null');
A.eq(_getCellRef('2027-01-05'), null, 'Año ≠ 2026 → null');
A.eq(_getCellRef('2026-13-01'), null, 'Mes 13 → null');
A.eq(_getCellRef('2026-06-00'), null, 'Día 0 → null');
A.eq(_getCellRef('2026-06-32'), null, 'Día 32 → null');
// Días que no existen en ese mes: la hoja no tiene casilla y la inversa los rechaza,
// así que _getCellRef tampoco debe inventarse una celda.
A.eq(_getCellRef('2026-02-30'), null, '30 de febrero → null (no existe)');
A.eq(_getCellRef('2026-02-29'), null, '29 de febrero de 2026 → null (no es bisiesto)');
A.eq(_getCellRef('2026-04-31'), null, '31 de abril → null (no existe)');
A.eq(_getCellRef('2026-02-28'), 'H30', '28 de febrero sí existe → H30');

// ── Ida y vuelta: _cellRefToDate invierte a _getCellRef ────────────────────
let idaVuelta = 0; let fallos = 0;
for (let mes = 1; mes <= 12; mes++) {
  const diasMes = new Date(2026, mes, 0).getDate();
  for (let dia = 1; dia <= diasMes; dia++) {
    const iso = '2026-' + String(mes).padStart(2, '0') + '-' + String(dia).padStart(2, '0');
    const ref = _getCellRef(iso);
    if (!ref || _cellRefToDate(ref) !== iso) fallos++;
    idaVuelta++;
  }
}
A.eq(fallos, 0, 'Ida y vuelta fecha→celda→fecha para los ' + idaVuelta + ' días de 2026');

// ── Sin colisiones: dos fechas nunca comparten celda ───────────────────────
const vistas = {}; let colisiones = 0;
for (let mes = 1; mes <= 12; mes++) {
  const diasMes = new Date(2026, mes, 0).getDate();
  for (let dia = 1; dia <= diasMes; dia++) {
    const iso = '2026-' + String(mes).padStart(2, '0') + '-' + String(dia).padStart(2, '0');
    const ref = _getCellRef(iso);
    if (vistas[ref]) colisiones++;
    vistas[ref] = iso;
  }
}
A.eq(colisiones, 0, 'Ninguna celda se reparte entre dos fechas de 2026');

// ── _cellRefToDate rechaza celdas que no son casillas de día ───────────────
A.eq(_cellRefToDate('C2'),   null, 'C2 es cabecera de bloque, no un día');
A.eq(_cellRefToDate('C37'),  null, 'C37 es cabecera de bloque, no un día');
A.eq(_cellRefToDate('C106'), null, 'C106 es cabecera de bloque, no un día');
A.eq(_cellRefToDate('A59'),  null, 'Columna A no es de anotaciones');
A.eq(_cellRefToDate('H36'),  null, 'Fila entre bloques → null');
A.eq(_cellRefToDate('H33'),  null, 'H33 sería el 31 de febrero, que no existe → null');
A.eq(_cellRefToDate('H61'),  '2026-05-24', 'H61 → 24 de mayo (celda válida del bloque Abr-Jun)');

const s = A.summary();
console.log(JSON.stringify(s));
process.exit(s.failed > 0 ? 1 : 0);
