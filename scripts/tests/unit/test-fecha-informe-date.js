// 6-oct-2026: la fecha de la visita de un informe es `date`, no `iso_date`.
//
// `iso_date` es el instante de REDACCIÓN —en 107 de los 325 informes del CRM
// coincide exactamente con `generated_at`—, así que el emparejamiento
// visita↔informe le atribuía a cada informe el día en que se escribió. Dos
// visitas reales de febrero (46 Ingeniería en Edificación, 50 Parque Málaga)
// quedaban escondidas de `visitas_sin_informe` porque su informe lleva
// iso_date de junio.
//
// `iso_date` sigue siendo la CLAVE de identidad del informe (y del upsert de
// briefings): lo que este test fija es que no vuelva a usarse como FECHA.

const path = require('path');
const A    = require('../_lib/assert');

A.reset();

const visitasDb = [
  // Caso real: ficha 2676. Visita el 11-feb, informe con date=11-feb e
  // iso_date=15-jun (la fecha en que lo generó el pipeline).
  { id: 46, fecha: '2026-02-11', studio_id: '2676', empresa: 'Ingeniería en Edificación', estado: 'planificada', motivo_no_realizada: null },
  // Caso inverso: el informe es de otra visita (date fuera de la ventana), pero
  // su iso_date cae dentro. Con el campo equivocado contaba como informe de
  // esta visita; con el bueno, no.
  { id: 47, fecha: '2026-02-12', studio_id: '2677', empresa: 'Parque Málaga, S.L.', estado: 'planificada', motivo_no_realizada: null },
  // Informe sin `date` (no existe hoy en el CRM, pero el fallback a iso_date
  // tiene que seguir funcionando si apareciera).
  { id: 48, fecha: '2026-02-13', studio_id: '2678', empresa: 'Solo iso_date', estado: 'planificada', motivo_no_realizada: null },
];

global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
global.window = {
  State: { studiosById: {
    '2676': { id: '2676', data: { reports: [
      { date: '2026-02-11', iso_date: '2026-06-15T09-01-00-000Z', generated_at: '2026-06-15T09:01:00.000Z', markdown: 'informe de la visita del 11-feb, redactado el 15-jun' },
    ] } },
    '2677': { id: '2677', data: { reports: [
      { date: '2025-11-20', iso_date: '2026-02-14T10-00-00-000Z', generated_at: '2026-02-14T10:00:00.000Z', markdown: 'informe de una visita de noviembre, redactado el 14-feb' },
    ] } },
    '2678': { id: '2678', data: { reports: [
      { iso_date: '2026-02-13', markdown: 'informe sin campo date' },
    ] } },
  } },
  DataSupabase: {
    listVisitasSemana: async (l, d) => visitasDb.filter(v => v.fecha >= l && v.fecha <= d),
    listVisitasPosteriores: async () => [],
  },
  Util: { toISOLocal: () => '2026-02-17' },
};
require(path.resolve(__dirname, '..', '..', '..', 'redesign', 'data.js'));
const D = global.window.Data;

(async function () {
  const conc = await D.conciliarSemana('2026-02-09');
  const fila = (id) => conc.filas.find(f => f.id === id);

  A.truthy(fila(46).informe, 'el informe de la visita del 11-feb se encuentra aunque se redactara el 15-jun');
  A.eq(fila(46).informe.date, '2026-02-11', 'y se le atribuye la fecha de la VISITA (date), no la de redacción (iso_date)');
  A.truthy(fila(46).realizada, 'por tanto la visita cuenta como realizada con informe');

  A.eq(fila(47).informe, null, 'un informe de noviembre no cuenta como informe de la visita del 12-feb, aunque su iso_date caiga dentro de la ventana');
  A.falsy(fila(47).realizada, 'esa visita sigue sin informe (es deuda real)');

  A.truthy(fila(48).informe, 'si un informe no trae `date`, se usa iso_date como respaldo');
  A.eq(fila(48).informe.date, '2026-02-13', 'con la fecha que ese respaldo da');

  A.eq(conc.cifras.informes, 2, 'de las tres visitas de la semana, dos tienen informe');

  const s = A.summary();
  console.log(JSON.stringify(s));
  process.exit(s.failed > 0 ? 1 : 0);
})();
