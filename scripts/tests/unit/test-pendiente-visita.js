// Una visita planificada que no se pudo hacer (cierre de semana) se perdía: el
// motivo iba al correo a Javier y nadie lo volvía a leer. Ahora deja en la ficha
// una tarea de bandeja «pendiente de visitar» —que es lo que leen «Pendiente en
// la zona» y el agente pendientes-zona— y esa tarea se cierra sola al
// replanificar la empresa. Este test cubre la parte pura; Supabase se simula.
//
// Los casos con nombre C1-C4/C8 y K2-K4 vienen de la revisión adversaria del
// 18-sep-2026 (crítico de código y contrarian): cada uno reproducía un fallo real.

const path = require('path');
const A    = require('../_lib/assert');

A.reset();

// ── Supabase simulado: la "BD" es la fuente fresca; State puede ir por detrás ─
const db = {};                       // id → fila como la devolvería getDoc
const patches = [];
const removed = [];
global.localStorage = { getItem() { return null; }, setItem() {}, removeItem(k) { removed.push(k); } };
global.window = {
  State: { studios: [], studiosById: {}, planificador: { schedule: {} } },
  DataSupabase: {
    getDoc: async function (p) { const id = p.split('/')[1]; return db[id] ? JSON.parse(JSON.stringify(db[id])) : null; },
    patchDoc: async function (p, obj) { const id = p.split('/')[1]; patches.push(id); db[id] = JSON.parse(JSON.stringify(Object.assign({}, db[id] || {}, obj))); return db[id]; },   // la BD no comparte objetos con el cliente
    updateVisita: async function (id, patch) { return Object.assign({ id: id, studio_id: '3099', fecha: '2026-09-10' }, patch); },
  },
  AccionesEngine: { invalidarCache: function () {} },
  Util: { toISOLocal: function (d) { return '2026-09-18'; } },   // «hoy» fijo para el test
};
require(path.resolve(__dirname, '..', '..', '..', 'redesign', 'data.js'));
const D = global.window.Data;

function ficha(id, activities) {
  const raw = { id: id, name: 'Estudio ' + id, data: { activities: activities || [] } };
  db[id] = JSON.parse(JSON.stringify(raw));
  global.window.State.studiosById[id] = raw;
  const S = global.window.State.studios, i = S.findIndex(s => s.id === id);
  if (i >= 0) S[i] = raw; else S.push(raw);   // array y mapa comparten objeto, como en loadAll
  return raw;
}
const abiertasDb = (id) => (db[id].data.activities || []).filter(a => a.pendiente_visita && !a.completada);
const abiertasState = (id) => (global.window.State.studiosById[id].data.activities || []).filter(a => a.pendiente_visita && !a.completada);

(async function () {
  // ── Criterio por defecto y casilla «volver a planificar» (K3) ───────────
  A.eq(D.MOTIVOS_PENDIENTE_VISITA, ['reprogramada', 'no-recibieron', 'cancelada-cliente'], 'por defecto: reprogramada / no-recibieron / cancelada-cliente');
  A.truthy(D.debeVolverAPlanificar('no-recibieron', null), 'sin casilla, no-recibieron → volver');
  A.falsy(D.debeVolverAPlanificar('sustituida', null), 'sin casilla, sustituida → no');
  A.falsy(D.debeVolverAPlanificar('cancelada-cliente', false), 'K3: la casilla desmarcada manda («ya no llevamos ese proyecto»)');
  A.truthy(D.debeVolverAPlanificar('otro', true), 'K3: la casilla marcada manda aunque el motivo sea «otro»');
  A.falsy(D.debeVolverAPlanificar(null, true), 'sin motivo nunca hay deuda');

  // ── Crear ────────────────────────────────────────────────────────────────
  ficha('3099');
  const r1 = await D.sincronizarPendienteVisita({ id: 347, studio_id: '3099', fecha: '2026-08-31' }, 'no-recibieron', 'Antonio no estaba', null);
  A.eq(r1, 'creada', 'con no-recibieron se crea la tarea');
  const t = abiertasDb('3099')[0];
  A.truthy(t && t.bandeja === true && t.completada === false, 'la tarea va a la bandeja (bandeja:true, completada:false)');
  A.eq(t.tipo_accion, 'reunion', 'es de tipo reunión (📅), como «Pedir visita»');
  A.eq(t.bandeja_id, 'pv347', 'id estable derivado de la visita');
  A.eq(t.visita_fecha, '2026-08-31', 'recuerda la fecha de la visita fallida');
  A.truthy(/Pendiente de visitar — no pudieron recibirme el 31 de agosto/.test(t.title), 'título legible: ' + t.title);
  A.eq(t.notes, 'Antonio no estaba', 'la nota del cierre va en la tarea');
  A.eq(t.date, '2026-09-18', 'la fecha de alta es la local de hoy (C6)');
  A.truthy(removed.includes('redesign:studios:cache:v1'), 'C1: invalida la caché local de cartera (si no, recargar la borraba de Supabase)');
  A.eq(abiertasState('3099').length, 1, 'el State queda alineado con la BD');
  const enArray = global.window.State.studios.find(s => s.id === '3099');
  A.truthy(enArray === global.window.State.studiosById['3099'], 'R1: State.studios y studiosById siguen compartiendo el mismo objeto');
  A.eq((enArray.data.activities || []).filter(a => a.pendiente_visita && !a.completada).length, 1, 'R1: la bandeja y «Pendiente en la zona» (que leen State.studios) ven la tarea sin recargar');

  // ── C2: segunda visita fallida a la misma ficha reutiliza la tarea y adelanta la fecha ─
  const r2 = await D.sincronizarPendienteVisita({ id: 348, studio_id: '3099', fecha: '2026-09-02' }, 'reprogramada', 'segundo intento', null);
  A.eq(r2, 'actualizada', 'C2: la segunda visita fallida no duplica: actualiza la abierta');
  A.eq(abiertasDb('3099').length, 1, 'sigue habiendo una sola abierta');
  A.eq(abiertasDb('3099')[0].visita_fecha, '2026-09-02', 'C2: la fecha de referencia pasa a la visita más reciente');
  A.eq(abiertasDb('3099')[0].visita_id, 348, 'y la visita de origen también');
  let n = await D.cerrarPendientesVisitaPlanificadas({ '2026-09-02': [{ id: '3099', name: 'x' }] });
  A.eq(n, 0, 'C2: el schedule con la propia visita fallida (2-sep) ya no cierra la deuda');

  // ── C8: cambiar solo la nota de la visita origen llega a la tarea ────────
  const r3 = await D.sincronizarPendienteVisita({ id: 348, studio_id: '3099', fecha: '2026-09-02' }, 'reprogramada', 'nota corregida', null);
  A.eq(r3, 'actualizada', 'C8: cambiar la nota actualiza la tarea');
  A.eq(abiertasDb('3099')[0].notes, 'nota corregida', 'la nota nueva está en la tarea');
  const r3b = await D.sincronizarPendienteVisita({ id: 348, studio_id: '3099', fecha: '2026-09-02' }, 'reprogramada', 'nota corregida', null);
  A.eq(r3b, 'ya-abierta', 'sin cambios → ya-abierta, sin escribir');

  // ── C4: la mutación se aplica sobre la copia FRESCA, no sobre un State viejo ─
  const raw = global.window.State.studiosById['3099'];
  db['3099'].data.reports = [{ iso_date: '2026-09-17', markdown: 'informe escrito en el Mac' }];   // otro dispositivo escribió
  raw.data.reports = [];                                                                          // este State no lo sabe
  await D.sincronizarPendienteVisita({ id: 349, studio_id: '3099', fecha: '2026-09-04' }, 'no-recibieron', 'tercero', null);
  A.eq(db['3099'].data.reports.length, 1, 'C4: el informe escrito en otro dispositivo sobrevive al PATCH (se lee la ficha fresca)');
  A.eq(global.window.State.studiosById['3099'].data.reports.length, 1, 'y el State se actualiza con la copia fresca');

  // ── Sin deuda: sustituida / otro / sin ficha no crean nada ──────────────
  ficha('3100');
  A.eq(await D.sincronizarPendienteVisita({ id: 350, studio_id: '3100', fecha: '2026-09-02' }, 'sustituida', null, null), null, 'sustituida no crea tarea');
  A.eq(await D.sincronizarPendienteVisita({ id: 351, studio_id: '3100', fecha: '2026-09-02' }, 'otro', null, null), null, 'otro no crea tarea');
  A.eq(abiertasDb('3100').length, 0, 'la ficha sigue sin tareas');
  A.eq(await D.sincronizarPendienteVisita({ id: 352, studio_id: null, fecha: '2026-09-02' }, 'reprogramada', null, null), null, 'sin ficha no hay dónde apuntarla (la cubre el SQL del agente)');
  A.eq(await D.sincronizarPendienteVisita({ id: 353, studio_id: '9999', fecha: '2026-09-02' }, 'reprogramada', null, null), null, 'ficha inexistente → null sin romper');

  // ── K4: visitas de hace más de 60 días no inundan la bandeja ────────────
  A.eq(await D.sincronizarPendienteVisita({ id: 354, studio_id: '3100', fecha: '2026-02-10' }, 'no-recibieron', null, null), 'antigua', 'K4: una visita de febrero no crea deuda');
  A.eq(abiertasDb('3100').length, 0, 'sigue sin tareas');

  // ── K2/C3: si el planificador ya la tiene replanificada, no se crea ──────
  global.window.State.planificador.schedule = { '2026-09-28': [{ id: '3100', name: 'Estudio 3100' }] };
  A.eq(await D.sincronizarPendienteVisita({ id: 355, studio_id: '3100', fecha: '2026-09-15' }, 'reprogramada', null, null), 'ya-replanificada', 'C3: replanificada antes del cierre → no hay deuda que crear');
  global.window.State.planificador.schedule = { '2026-09-16': [{ id: '3100', name: 'Estudio 3100' }] };
  A.eq(await D.sincronizarPendienteVisita({ id: 355, studio_id: '3100', fecha: '2026-09-15' }, 'reprogramada', null, null), 'creada', 'pero una replanificación ya pasada (16-sep < hoy) no demuestra nada: se crea');
  global.window.State.planificador.schedule = {};

  // ── Quitar el motivo / anular cierra la tarea que nació de ESA visita ────
  A.eq(await D.sincronizarPendienteVisita({ id: 999, studio_id: '3100', fecha: '2026-09-15' }, null, null, null), null, 'quitar el motivo de otra visita no toca la tarea ajena');
  A.eq(abiertasDb('3100').length, 1, 'sigue abierta');
  A.eq(await D.sincronizarPendienteVisita({ id: 355, studio_id: '3100', fecha: '2026-09-15' }, null, null, null), 'cerrada', 'quitar el motivo de la visita origen la cierra');
  A.eq(abiertasDb('3100').length, 0, 'ya no hay abiertas');
  A.eq(await D.sincronizarPendienteVisita({ id: 356, studio_id: '3100', fecha: '2026-09-15' }, 'cancelada-cliente', null, false), null, 'K3: cancelada con la casilla desmarcada no crea deuda');

  // ── Replanificar cierra; replanificar en el pasado o en reserva, no ──────
  ficha('3122');
  await D.sincronizarPendienteVisita({ id: 383, studio_id: '3122', fecha: '2026-09-10' }, 'no-recibieron', null, null);
  n = await D.cerrarPendientesVisitaPlanificadas({ '2026-09-10': [{ id: '3122', name: 'Estudio 3122' }] });
  A.eq(n, 0, 'la propia semana fallida (misma fecha) no cierra la tarea');
  n = await D.cerrarPendientesVisitaPlanificadas({ '2026-09-24': [{ id: '3122', name: 'Estudio 3122', reserva: true }] });
  A.eq(n, 0, 'una entrada de reserva no cuenta como visita planificada');
  n = await D.cerrarPendientesVisitaPlanificadas({ '2026-09-16': [{ id: '3122', name: 'Estudio 3122' }] });
  A.eq(n, 0, 'C3: una fecha posterior pero ya pasada (16-sep) no cierra: no demuestra que se hiciera');
  n = await D.cerrarPendientesVisitaPlanificadas({ '2026-09-24': [{ id: '3122', name: 'Estudio 3122' }, { id: '3099', name: 'Otro' }] });
  A.eq(n, 2, 'planificarla en una fecha posterior y futura cierra la tarea (3122 y la de 3099)');
  A.eq(abiertasDb('3122').length, 0, 'la ficha queda sin pendiente de visitar');
  A.truthy(db['3122'].data.activities[0].completada === true, 'la tarea queda completada, no borrada (histórico)');

  // ── Nada que cerrar = ningún PATCH (savePlanificador se llama en cada guardado) ─
  const antes = patches.length;
  await D.cerrarPendientesVisitaPlanificadas({ '2026-09-25': [{ id: '3122', name: 'Estudio 3122' }] });
  A.eq(patches.length, antes, 'sin tareas abiertas no se escribe nada en Supabase');

  // ── guardarMotivoVisita devuelve {row, sync} y no miente (C5) ───────────
  ficha('3099');
  let res = await D.guardarMotivoVisita(500, 'no-recibieron', 'x', 'planificada', null);
  A.truthy(res.row && res.sync === 'creada', 'guardarMotivoVisita devuelve la fila y el resultado de la sincronía');
  A.eq(res.row.volver_a_planificar, null, 'la casilla en blanco se guarda como NULL (criterio por defecto)');
  res = await D.guardarMotivoVisita(502, 'cancelada-cliente', 'x', 'planificada', false);
  A.eq(res.row.volver_a_planificar, false, 'K3: la casilla desmarcada se persiste como false');
  A.eq(res.sync, null, 'y con false no hay deuda aunque el motivo sea cancelada');
  res = await D.guardarMotivoVisita(503, 'otro', 'x', 'planificada', true);
  A.eq(res.row.volver_a_planificar, true, 'K3: la casilla marcada se persiste como true');
  const antesC5 = patches.length;
  global.window.DataSupabase.updateVisita = async function () { return null; };   // RLS filtró: PATCH 200 con []
  res = await D.guardarMotivoVisita(501, 'no-recibieron', 'x', 'planificada', true);
  A.eq(res, { row: null, sync: null }, 'C5: si Supabase no devuelve la fila, no se sincroniza nada y se sabe');
  A.eq(patches.length, antesC5, 'C5: …y no se escribe en ninguna ficha');

  // ── K5: marcar la llamada hecha escribe confirmada_el y guarda el planificador ─
  global.window.DataSupabase.patchDoc = async function (p, obj) { patches.push(p); return obj; };
  global.window.State.planificador = { schedule: { '2026-09-22': [{ id: '3122', name: 'Baza', data: { hora: '09:00', confirmar_dias: 2 } }, { id: '3122', name: 'Otra del mismo estudio', data: {} }] } };
  const v = await D.marcarLlamadaConfirmada('2026-09-22', '3122', 'Baza');
  A.eq(v && v.data.confirmada_el, '2026-09-18', 'K5: la visita queda con confirmada_el = hoy (local)');
  A.eq(global.window.State.planificador.schedule['2026-09-22'][1].data.confirmada_el, undefined, 'K5: solo la visita indicada (mismo estudio, otro nombre, no)');
  A.truthy(patches[patches.length - 1] === '_meta/planificador', 'K5: se guarda el planificador');
  A.eq(await D.marcarLlamadaConfirmada('2026-09-23', '3122', 'Baza'), null, 'K5: visita inexistente → null sin escribir');

  // ── C9: guardar el planificador actualiza la caché local (si no, recargar mostraba el anterior) ─
  const cache = { savedAt: Date.now(), studios: [], planificador: { schedule: { '2026-09-01': [] } } };
  global.localStorage.getItem = (k) => k === 'redesign:studios:cache:v1' ? JSON.stringify(cache) : null;
  global.localStorage.setItem = (k, v) => { if (k === 'redesign:studios:cache:v1') Object.assign(cache, JSON.parse(v)); };
  global.window.DataSupabase.patchDoc = async function (p, obj) { return obj; };
  await D.savePlanificador({ '2026-09-22': [{ id: '3122', name: 'x', data: { confirmar_dias: 2 } }] });
  A.eq(cache.planificador.schedule['2026-09-22'][0].data.confirmar_dias, 2, 'C9: la caché local lleva el schedule recién guardado');
  A.eq(cache.planificador.schedule['2026-09-01'], undefined, 'y no conserva el anterior');

  const s = A.summary();
  console.log(JSON.stringify(s));
  process.exit(s.failed > 0 ? 1 : 0);
})();
