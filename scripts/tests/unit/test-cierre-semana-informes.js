// K1 (contrarian, 18-sep-2026): el cierre de semana buscaba el informe de una
// visita en una ventana de −3/+21 días. Si la visita se arrastraba a la semana
// siguiente y el informe de la nueva ya estaba escrito, la fila vieja lo
// tomaba como suyo: la misma visita contaba como realizada dos veces (o nunca
// como reprogramada), según el día en que se pulsara «Cerrar semana».
// Ahora el informe no puede saltar por encima de otra visita del mismo estudio.

const path = require('path');
const A    = require('../_lib/assert');

A.reset();

const visitasDb = [
  { id: 1, fecha: '2026-09-16', studio_id: '3099', empresa: 'X', estado: 'planificada', motivo_no_realizada: null },
  { id: 2, fecha: '2026-09-21', studio_id: '3099', empresa: 'X', estado: 'planificada', motivo_no_realizada: null },
  { id: 3, fecha: '2026-09-17', studio_id: '3100', empresa: 'Y', estado: 'planificada', motivo_no_realizada: null },
  { id: 4, fecha: '2026-09-15', studio_id: '3101', empresa: 'Z', estado: 'planificada', motivo_no_realizada: null },
  { id: 5, fecha: '2026-09-17', studio_id: '3101', empresa: 'Z', estado: 'planificada', motivo_no_realizada: null },
];
global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
global.window = {
  State: { studiosById: {
    '3099': { id: '3099', data: { reports: [{ iso_date: '2026-09-21', markdown: 'informe de la visita del 21' }] } },
    '3100': { id: '3100', data: { reports: [{ iso_date: '2026-09-30', markdown: 'informe tardío, 13 días después' }] } },
    '3101': { id: '3101', data: { reports: [{ iso_date: '2026-09-17', markdown: 'informe del segundo intento' }] } },
  } },
  DataSupabase: {
    listVisitasSemana: async (l, d) => visitasDb.filter(v => v.fecha >= l && v.fecha <= d),
    listVisitasPosteriores: async (desde, hasta, ids) => visitasDb.filter(v => v.fecha > desde && v.fecha <= hasta && ids.includes(v.studio_id)),
  },
  Util: { toISOLocal: () => '2026-09-22' },
};
require(path.resolve(__dirname, '..', '..', '..', 'redesign', 'data.js'));
const D = global.window.Data;

(async function () {
  const conc = await D.conciliarSemana('2026-09-14');
  const fila = (id) => conc.filas.find(f => f.id === id);

  A.eq(fila(1).informe, null, 'K1: la visita del 16 NO toma el informe del 21 (hay otra visita del mismo estudio en medio)');
  A.falsy(fila(1).realizada, 'por tanto sigue sin realizar y pedirá motivo («reprogramada»)');
  A.truthy(fila(3).informe && fila(3).informe.date === '2026-09-30', 'sin visita posterior, la ventana de +21 días sigue valiendo (informe tardío)');
  A.eq(fila(4).informe, null, 'dos intentos en la misma semana: el del 15 no se lleva el informe del 17');
  A.truthy(fila(5).informe && fila(5).informe.date === '2026-09-17', 'el informe es del segundo intento');
  A.eq(conc.cifras, { planificadas: 4, realizadas: 2, informes: 2, no_realizadas: 2 }, 'cifras de la semana 38: 4 planificadas, 2 realizadas, 2 sin informe');

  // La semana siguiente, la visita del 21 sí es dueña de su informe.
  const conc2 = await D.conciliarSemana('2026-09-21');
  const f2 = conc2.filas.find(f => f.id === 2);
  A.truthy(f2.informe && f2.informe.date === '2026-09-21', 'la semana 39 cuenta la visita del 21 con su informe (una sola vez)');

  // Si la consulta de visitas posteriores falla, se degrada a la ventana clásica (no rompe el cierre).
  global.window.DataSupabase.listVisitasPosteriores = async () => { throw new Error('red'); };
  const conc3 = await D.conciliarSemana('2026-09-14');
  A.truthy(conc3.filas.find(f => f.id === 1).informe, 'sin acceso a visitas posteriores, vuelve a la ventana +21 (comportamiento anterior) en vez de fallar');
  A.eq(conc3.filas.find(f => f.id === 4).informe, null, 'pero dentro de la propia semana la cota sigue aplicándose (no necesita la consulta)');

  const s = A.summary();
  console.log(JSON.stringify(s));
  process.exit(s.failed > 0 ? 1 : 0);
})();
