// Una visita planificada que no se pudo hacer (cierre de semana: reprogramada,
// no pudieron recibirme, la canceló el cliente) se perdía: el motivo iba al
// correo a Javier y nadie lo volvía a leer. Ahora deja en la ficha una tarea
// de bandeja «pendiente de visitar» —que es lo que leen «Pendiente en la zona»
// y el agente pendientes-zona— y esa tarea se cierra sola al replanificar la
// empresa. Este test cubre esa parte pura; el PATCH a Supabase se simula.

const path = require('path');
const A    = require('../_lib/assert');

A.reset();

const patches = [];
global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
global.window = {
  State: { studiosById: {} },
  DataSupabase: { patchDoc: async function (p, obj) { patches.push(p); return obj; } },
  AccionesEngine: { invalidarCache: function () {} },
};
require(path.resolve(__dirname, '..', '..', '..', 'redesign', 'data.js'));
const D = global.window.Data;

function ficha(id, activities) {
  const raw = { id: id, name: 'Estudio ' + id, data: { activities: activities || [] } };
  global.window.State.studiosById[id] = raw;
  return raw;
}
const abiertas = (raw) => raw.data.activities.filter(a => a.pendiente_visita && !a.completada);

(async function () {
  // ── Motivos con deuda de visita crean la tarea ──────────────────────────
  A.eq(D.MOTIVOS_PENDIENTE_VISITA, ['reprogramada', 'no-recibieron', 'cancelada-cliente'],
    'reprogramada / no-recibieron / cancelada-cliente son deuda; sustituida y otro no');

  const s1 = ficha('3099');
  const r1 = await D.sincronizarPendienteVisita({ id: 347, studio_id: '3099', fecha: '2026-08-31' }, 'no-recibieron', 'Antonio no estaba');
  A.eq(r1, 'creada', 'con no-recibieron se crea la tarea');
  const t = abiertas(s1)[0];
  A.truthy(t && t.bandeja === true && t.completada === false, 'la tarea va a la bandeja (bandeja:true, completada:false)');
  A.eq(t.tipo_accion, 'reunion', 'es de tipo reunión (📅), como «Pedir visita»');
  A.eq(t.bandeja_id, 'pv347', 'id estable derivado de la visita');
  A.eq(t.visita_fecha, '2026-08-31', 'recuerda la fecha de la visita fallida');
  A.truthy(/Pendiente de visitar — no pudieron recibirme el 31 de agosto/.test(t.title), 'título legible: ' + t.title);
  A.eq(t.notes, 'Antonio no estaba', 'la nota del cierre va en la tarea');

  // ── Idempotencia: una sola abierta por ficha ────────────────────────────
  const r2 = await D.sincronizarPendienteVisita({ id: 348, studio_id: '3099', fecha: '2026-09-02' }, 'reprogramada', null);
  A.eq(r2, 'ya-abierta', 'una segunda visita fallida no duplica la tarea');
  A.eq(abiertas(s1).length, 1, 'sigue habiendo una sola abierta');

  // ── Sin deuda: sustituida / otro / sin ficha no crean nada ──────────────
  const s2 = ficha('3100');
  A.eq(await D.sincronizarPendienteVisita({ id: 350, studio_id: '3100', fecha: '2026-09-02' }, 'sustituida', null), null, 'sustituida no crea tarea');
  A.eq(await D.sincronizarPendienteVisita({ id: 351, studio_id: '3100', fecha: '2026-09-02' }, 'otro', null), null, 'otro no crea tarea');
  A.eq(abiertas(s2).length, 0, 'la ficha sigue sin tareas');
  A.eq(await D.sincronizarPendienteVisita({ id: 352, studio_id: null, fecha: '2026-09-02' }, 'reprogramada', null), null, 'sin ficha no hay dónde apuntarla (la cubre el SQL del agente)');

  // ── Quitar el motivo cierra la tarea que nació de ESA visita ────────────
  A.eq(await D.sincronizarPendienteVisita({ id: 348, studio_id: '3099', fecha: '2026-09-02' }, null, null), null, 'quitar el motivo de otra visita no toca la tarea ajena');
  A.eq(abiertas(s1).length, 1, 'sigue abierta');
  A.eq(await D.sincronizarPendienteVisita({ id: 347, studio_id: '3099', fecha: '2026-08-31' }, null, null), 'cerrada', 'quitar el motivo de la visita origen la cierra');
  A.eq(abiertas(s1).length, 0, 'ya no hay abiertas');

  // ── Replanificar cierra; replanificar antes de la fecha fallida, no ─────
  const s3 = ficha('3122');
  await D.sincronizarPendienteVisita({ id: 383, studio_id: '3122', fecha: '2026-09-10' }, 'no-recibieron', null);
  let n = await D.cerrarPendientesVisitaPlanificadas({ '2026-09-10': [{ id: '3122', name: 'Estudio 3122' }] });
  A.eq(n, 0, 'la propia semana fallida (misma fecha) no cierra la tarea');
  n = await D.cerrarPendientesVisitaPlanificadas({ '2026-09-24': [{ id: '3122', name: 'Estudio 3122', reserva: true }] });
  A.eq(n, 0, 'una entrada de reserva no cuenta como visita planificada');
  n = await D.cerrarPendientesVisitaPlanificadas({ '2026-09-24': [{ id: '3122', name: 'Estudio 3122' }, { id: '3099', name: 'Otro' }] });
  A.eq(n, 1, 'planificarla en una fecha posterior cierra la tarea');
  A.eq(abiertas(s3).length, 0, 'la ficha queda sin pendiente de visitar');
  A.truthy(s3.data.activities[0].completada === true, 'la tarea queda completada, no borrada (histórico)');

  // ── Nada que cerrar = ningún PATCH (savePlanificador se llama en cada autoguardado) ─
  const antes = patches.length;
  await D.cerrarPendientesVisitaPlanificadas({ '2026-09-25': [{ id: '3122', name: 'Estudio 3122' }] });
  A.eq(patches.length, antes, 'sin tareas abiertas no se escribe nada en Supabase');

  const s = A.summary();
  console.log(JSON.stringify(s));
  process.exit(s.failed > 0 ? 1 : 0);
})();
