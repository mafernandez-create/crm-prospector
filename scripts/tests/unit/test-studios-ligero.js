// La cartera se carga desde la vista studios_ligero, que quita de cada informe
// los Word en base64 (fileData/file/data) y deja "_bin": índice original.
// Riesgo: la ficha guarda data ENTERO desde el State; si se mandara la versión
// ligera, los Word se borrarían de la BD. _restaurarBinarios lo impide.
// Este test cubre esa guarda con un fetch simulado (sin red).

const path = require('path');
const A    = require('../_lib/assert');

A.reset();

let dbReports = [];
let peticiones = 0;
global.window = {};
global.fetch = async function () {
  peticiones++;
  return { ok: true, status: 200, json: async () => [{ reports: JSON.parse(JSON.stringify(dbReports)) }] };
};
require(path.resolve(__dirname, '..', '..', '..', 'redesign', 'data-supabase.js'));
const R = global.window.DataSupabase._restaurarBinarios;

(async function () {
  A.truthy(typeof R === 'function', 'data-supabase expone _restaurarBinarios');

  // ── Sin marcas _bin: no hay nada que hacer ni que pedir ───────────────────
  peticiones = 0;
  const sinBin = { reports: [{ date: '2026-01-01', title: 'A' }], contact: { email: 'x' } };
  A.eq(await R('1', sinBin), sinBin, 'sin _bin devuelve el mismo data');
  A.eq(peticiones, 0, 'sin _bin no pide nada a la BD');

  // ── Caso normal: se añade una actividad, los informes vuelven con su Word ──
  dbReports = [
    { date: '2026-01-01', title: 'A', fileData: 'WORD-A' },
    { date: '2026-02-01', title: 'B', markdown: 'texto' },
    { date: '2026-03-01', title: 'C', file: 'FILE-C', data: 'DATA-C' },
  ];
  const ligero = {
    activities: [{ title: 'nueva' }],
    reports: [
      { date: '2026-01-01', title: 'A', _bin: 0 },
      { date: '2026-02-01', title: 'B', markdown: 'texto' },
      { date: '2026-03-01', title: 'C', _bin: 2 },
    ],
  };
  const out = await R('1', ligero);
  A.eq(out.reports, dbReports, 'restaura fileData, file y data en su informe');
  A.eq(out.activities, [{ title: 'nueva' }], 'el resto de data se manda tal cual');
  A.eq(ligero.reports[0]._bin, 0, 'no modifica el objeto del State');

  // ── Se edita el título de un informe (misma longitud): manda la posición ──
  const editado = await R('1', { reports: [
    { date: '2026-01-01', title: 'A corregido', _bin: 0 },
    { date: '2026-02-01', title: 'B', markdown: 'texto' },
    { date: '2026-03-01', title: 'C', _bin: 2 },
  ] });
  A.eq(editado.reports[0], { date: '2026-01-01', title: 'A corregido', fileData: 'WORD-A' },
    'editar el título de un informe conserva su Word');

  // ── Otro dispositivo añadió un informe al principio: se casa por identidad ─
  dbReports = [
    { date: '2025-12-01', title: 'Z', fileData: 'WORD-Z' },
    { date: '2026-01-01', title: 'A', fileData: 'WORD-A' },
  ];
  const desplazado = await R('1', { reports: [{ date: '2026-01-01', title: 'A', _bin: 0 }] });
  A.eq(desplazado.reports[0].fileData, 'WORD-A',
    'si el índice ya no casa, busca el informe por fecha y título');

  // ── No se puede casar y quedan Word en la BD: NO se guarda ────────────────
  dbReports = [{ date: '2026-05-05', title: 'Otro', fileData: 'WORD-O' }, { date: 'x', title: 'y' }];
  let lanzo = false;
  try { await R('1', { reports: [{ date: '2026-01-01', title: 'A', _bin: 0 }] }); }
  catch (e) { lanzo = /No se ha guardado/.test(e.message); }
  A.truthy(lanzo, 'si no puede conservar un Word, lanza error en vez de borrarlo');

  // ── La BD ya no tiene ningún Word: nada que perder, se guarda ─────────────
  dbReports = [{ date: '2026-09-09', title: 'Q' }];
  const nada = await R('1', { reports: [{ date: '2026-01-01', title: 'A', _bin: 0 }, { a: 1 }] });
  A.eq(nada.reports[0], { date: '2026-01-01', title: 'A' }, 'sin Word en la BD, solo quita la marca _bin');

  const s = A.summary();
  console.log(JSON.stringify(s));
  process.exit(s.failed > 0 ? 1 : 0);
})();
