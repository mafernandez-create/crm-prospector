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
  { id: 6, fecha: '2026-09-16', studio_id: '3102', empresa: 'W', estado: 'planificada', motivo_no_realizada: null },
  { id: 7, fecha: '2026-09-17', studio_id: '3102', empresa: 'W', estado: 'planificada', motivo_no_realizada: null },
];
global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
global.window = {
  State: { studiosById: {
    '3099': { id: '3099', data: { reports: [{ iso_date: '2026-09-21', markdown: 'informe de la visita del 21' }] } },
    '3100': { id: '3100', data: { reports: [{ iso_date: '2026-09-30', markdown: 'informe tardío, 13 días después' }] } },
    '3101': { id: '3101', data: { reports: [{ iso_date: '2026-09-17', markdown: 'informe del segundo intento' }] } },
    '3102': { id: '3102', data: { reports: [{ iso_date: '2026-09-16', markdown: 'informe del 16' }] } },
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

  // R2: las fechas del cierre no pasan por UTC (en Europe/Madrid salían un día menos).
  A.eq(conc.domingo, '2026-09-20', 'R2: la semana del lunes 14 acaba el domingo 20');
  A.eq(conc.fecha_limite, '2026-09-22', 'R2: la entrega a Javier es el MARTES 22 (regla del martes), no el lunes');
  A.eq(conc.num_semana, 38, 'semana ISO 38');

  A.eq(fila(1).informe, null, 'K1: la visita del 16 NO toma el informe del 21 (hay otra visita del mismo estudio en medio)');
  A.falsy(fila(1).realizada, 'por tanto sigue sin realizar y pedirá motivo («reprogramada»)');
  A.truthy(fila(3).informe && fila(3).informe.date === '2026-09-30', 'sin visita posterior, la ventana de +21 días sigue valiendo (informe tardío)');
  A.eq(fila(4).informe, null, 'dos intentos en la misma semana: el del 15 no se lleva el informe del 17');
  A.truthy(fila(5).informe && fila(5).informe.date === '2026-09-17', 'el informe es del segundo intento');
  A.truthy(fila(6).informe && fila(6).informe.date === '2026-09-16', 'R2/K1: con visitas en días consecutivos (16 y 17), la del 16 conserva su propio informe del 16');
  A.eq(fila(7).informe, null, 'y la del 17 (sin informe propio) no roba el del 16');
  A.eq(conc.cifras, { planificadas: 6, realizadas: 3, informes: 3, no_realizadas: 3 }, 'cifras de la semana 38: 6 planificadas, 3 realizadas, 3 sin informe');

  // La semana siguiente, la visita del 21 sí es dueña de su informe.
  const conc2 = await D.conciliarSemana('2026-09-21');
  const f2 = conc2.filas.find(f => f.id === 2);
  A.truthy(f2.informe && f2.informe.date === '2026-09-21', 'la semana 39 cuenta la visita del 21 con su informe (una sola vez)');

  // Si la consulta de visitas posteriores falla, se degrada a la ventana clásica (no rompe el cierre).
  global.window.DataSupabase.listVisitasPosteriores = async () => { throw new Error('red'); };
  const conc3 = await D.conciliarSemana('2026-09-14');
  A.truthy(conc3.filas.find(f => f.id === 1).informe, 'sin acceso a visitas posteriores, vuelve a la ventana +21 (comportamiento anterior) en vez de fallar');
  A.eq(conc3.filas.find(f => f.id === 4).informe, null, 'pero dentro de la propia semana la cota sigue aplicándose (no necesita la consulta)');

  // ── El correo a Javier justifica las NO realizadas, aunque tengan informe ──
  // (AIMA, S38: el informe documenta el intento fallido; antes el correo la
  // omitía de «las que no» y las cifras decían 5/7 sin explicar la séptima).
  const concC = {
    semana: '2026-09-14', domingo: '2026-09-20', num_semana: 38,
    cifras: { planificadas: 3, realizadas: 1, informes: 2, no_realizadas: 2 },
    filas: [
      { empresa: 'Hidralia', fecha: '2026-09-18', informe: { date: '2026-09-18' }, realizada: true, motivo: null, ruta: 'Planificador · Almería' },
      { empresa: 'AIMA', fecha: '2026-09-18', informe: { date: '2026-09-18' }, realizada: false, motivo: 'no-recibieron', nota: 'sin hora cerrada', ruta: 'Planificador · Almería' },
      { empresa: 'Fomintax', fecha: '2026-09-18', informe: null, realizada: false, motivo: 'cancelada-cliente', nota: 'urgencia', ruta: 'Planificador · Almería' },
    ],
  };
  const correo = D.redactarCorreoJavier(concC, '');
  A.truthy(/AIMA \(18 de septiembre\): no pudieron recibirme \(sin hora cerrada\)/.test(correo.cuerpo), 'una visita con informe pero con motivo se justifica en el correo');
  A.truthy(/Fomintax \(18 de septiembre\): la canceló el cliente \(urgencia\)/.test(correo.cuerpo), 'la cancelada también');
  A.truthy(/se hicieron 1\. Las que no:/.test(correo.cuerpo), 'las cifras del correo son las de realizadas');
  A.eq(correo.asunto, 'Informes semana 38 (14 de septiembre al 20 de septiembre) — 1/3 visitas', 'asunto con realizadas/planificadas');

  const s = A.summary();
  console.log(JSON.stringify(s));
  process.exit(s.failed > 0 ? 1 : 0);
})();
