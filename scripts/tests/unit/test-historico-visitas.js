// El CRM no guardaba en ningún sitio que una visita se hubiera celebrado: el
// único rastro era su informe. Por eso "¿qué visitas no tienen informe?" solo
// podía contestarse cruzando a mano la hoja del jefe con los nombres de las
// fichas — un cruce que en su día dio tres falsos positivos.
//
// Ahora cada guardado del planificador vuelca sus visitas a la tabla `visitas`,
// que solo añade. Este test cubre la parte pura de ese volcado: qué entradas
// del schedule se archivan y cómo se mapean. Lo que NO cubre (hace falta red):
// el RPC archivar_visitas y la vista visitas_sin_informe.

const path = require('path');
const A    = require('../_lib/assert');

A.reset();

global.window = {};
require(path.resolve(__dirname, '..', '..', '..', 'redesign', 'data-supabase.js'));
const DS = global.window.DataSupabase;

A.truthy(typeof DS.visitasDeSchedule === 'function',
  'data-supabase expone visitasDeSchedule');

const F = DS.visitasDeSchedule;

// ── Caso normal ───────────────────────────────────────────────────────────
A.eq(F({ '2026-09-01': [{ id: '3089', name: 'Ingeniería Guadalsur SLP', province: 'Granada' }] }),
  [{ fecha: '2026-09-01', studio_id: '3089', empresa: 'Ingeniería Guadalsur SLP',
     ruta: 'Planificador · Granada' }],
  'una visita normal se archiva con ficha, nombre y provincia');

// ── Reservas y logística: NO son visitas ──────────────────────────────────
// El planificador marca con reserva:true tanto los clientes de reserva como las
// notas de pernocta y regreso. Archivarlas inflaría la deuda de informes con
// líneas que nunca fueron una reunión.
A.eq(F({ '2026-07-13': [
      { id: null, name: 'Pernocta — Bahía de Cádiz', reserva: true },
      { id: null, name: 'FAINSUR', reserva: true, province: 'Cádiz' },
      { id: '3062', name: 'C.R. Margen Izquierda del Bajo Guadalete', province: 'Cádiz' },
    ] }).map(v => v.empresa),
  ['C.R. Margen Izquierda del Bajo Guadalete'],
  'las entradas marcadas reserva (clientes de reserva y pernoctas) no se archivan');

A.eq(F({ '2026-07-13': [{ name: 'X', reserva: false }] }).length, 1,
  'reserva:false sí se archiva');

// ── Visita sin ficha: se guarda igual, con studio_id nulo ─────────────────
// Es el caso de las empresas anunciadas y nunca dadas de alta. Perderlas
// escondería justo lo que hay que ver.
A.eq(F({ '2026-06-10': [{ id: null, name: 'EMAYA' }] }),
  [{ fecha: '2026-06-10', studio_id: null, empresa: 'EMAYA', ruta: null }],
  'una visita sin ficha se archiva con studio_id nulo');

// ── Basura que no debe llegar a la tabla ──────────────────────────────────
A.eq(F({ '2026-09-01': [{ id: '1', name: '   ' }, { id: '2' }, null] }).length, 0,
  'las entradas sin nombre se descartan');
A.eq(F({ 'semana-36': [{ id: '1', name: 'X' }] }).length, 0,
  'las claves que no son una fecha ISO se ignoran');
A.eq(F({ '2026-09-01': 'no es un array' }).length, 0,
  'un día que no es un array no revienta');
A.eq(F(null).length, 0, 'un schedule nulo devuelve lista vacía');
A.eq(F({}).length, 0, 'un schedule vacío devuelve lista vacía');

// ── El nombre se limpia, la ficha se preserva tal cual ────────────────────
A.eq(F({ '2026-09-02': [{ id: 'hh9Lhwb3mWKFFKy3XYEo', name: '  Proinaqua  ' }] })[0],
  { fecha: '2026-09-02', studio_id: 'hh9Lhwb3mWKFFKy3XYEo', empresa: 'Proinaqua', ruta: null },
  'se recorta el nombre y se respetan los ids alfanuméricos heredados de Firestore');

// ── Varios días a la vez ──────────────────────────────────────────────────
A.eq(F({
    '2026-09-01': [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    '2026-09-02': [{ id: 'c', name: 'C' }],
  }).length, 3, 'recorre todos los días del schedule');

const s = A.summary();
console.log(JSON.stringify(s));
process.exit(s.failed > 0 ? 1 : 0);
