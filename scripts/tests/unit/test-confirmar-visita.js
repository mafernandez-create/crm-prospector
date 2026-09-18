// Algunos clientes piden que se les llame uno o dos días antes para confirmar
// la visita. El planificador lo guarda en data.confirmar_dias y de ahí sale
// la llamada: en «Hoy», en la columna del día y en Google Calendar. Este test
// cubre la parte pura (Util.fechaConfirmacion / confirmacionesDeSchedule):
// la llamada cae en días LABORABLES y no se recuerda lo que ya pasó.
// app.js ejecuta init() al cargarse (DOM real), así que se extraen las dos
// funciones del fuente en vez de requerir el módulo.

const fs   = require('fs');
const path = require('path');
const A    = require('../_lib/assert');

A.reset();

const src = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'redesign', 'app.js'), 'utf8');
const ini = src.indexOf('function toISOLocal(');
const fin = src.indexOf('window.Util = {', ini);
A.truthy(ini > 0 && fin > ini, 'app.js define fechaConfirmacion y confirmacionesDeSchedule antes de window.Util');
const U = new Function(src.slice(ini, fin) + '\nreturn { toISOLocal, fechaConfirmacion, confirmacionesDeSchedule };')();

// ── Días laborables ───────────────────────────────────────────────────────
// Referencia: 2026-09-24 es jueves; 2026-09-21 lunes; 2026-09-19 sábado.
A.eq(U.fechaConfirmacion('2026-09-24', 1), '2026-09-23', 'jueves, 1 día antes → miércoles');
A.eq(U.fechaConfirmacion('2026-09-24', 2), '2026-09-22', 'jueves, 2 días antes → martes');
A.eq(U.fechaConfirmacion('2026-09-21', 1), '2026-09-18', 'lunes, 1 día antes → viernes (salta el fin de semana)');
A.eq(U.fechaConfirmacion('2026-09-21', 2), '2026-09-17', 'lunes, 2 días antes → jueves');
A.eq(U.fechaConfirmacion('2026-09-22', 2), '2026-09-18', 'martes, 2 días antes → viernes');
A.eq(U.fechaConfirmacion('2026-10-01', 1), '2026-09-30', 'cambio de mes correcto');

// ── Sin confirmación ──────────────────────────────────────────────────────
A.eq(U.fechaConfirmacion('2026-09-24', 0), null, '0 = no hace falta');
A.eq(U.fechaConfirmacion('2026-09-24', undefined), null, 'sin campo = no hace falta');
A.eq(U.fechaConfirmacion('2026-09-24', '2'), '2026-09-22', 'acepta el valor como string (viene de un <select>)');
A.eq(U.fechaConfirmacion('mañana', 1), null, 'fecha inválida → null');

// ── confirmacionesDeSchedule ──────────────────────────────────────────────
const sched = {
  '2026-09-24': [
    { id: '3122', name: 'González Soto S.A.', data: { hora: '11:30', confirmar_dias: 2 } },
    { id: '3099', name: 'ED3 Arquitectos', data: { hora: '09:00' } },
    { id: null, name: 'Pernocta Murcia', reserva: true, data: { confirmar_dias: 1 } },
  ],
  '2026-09-21': [ { id: '3111', name: 'CUPISA', data: { confirmar_dias: 1 } } ],
  '2026-09-10': [ { id: '3119', name: 'JOVEA', data: { confirmar_dias: 1 } } ],
  'sin-hora': 'basura',
};
const out = U.confirmacionesDeSchedule(sched, '2026-09-18');
A.eq(out.map(c => c.visita.name), ['CUPISA', 'González Soto S.A.'], 'solo las visitas futuras con confirmar_dias, sin reservas, ordenadas por fecha de llamada');
A.eq(out[0].fechaLlamada, '2026-09-18', 'CUPISA (lunes 21, 1 día) se llama el viernes 18');
A.eq(out[1], { fechaLlamada: '2026-09-22', fechaVisita: '2026-09-24', dias: 2, visita: sched['2026-09-24'][0], hecha: null }, 'González Soto (jueves 24, 2 días) se llama el martes 22 y conserva la visita');
A.eq(U.confirmacionesDeSchedule(sched).length, 3, 'sin hoyISO no se filtra por fecha');
A.eq(U.confirmacionesDeSchedule({}, '2026-09-18'), [], 'schedule vacío');

// ── K5: la llamada hecha deja de recordarse ──────────────────────────────
sched['2026-09-21'][0].data.confirmada_el = '2026-09-18';
A.eq(U.confirmacionesDeSchedule(sched, '2026-09-18').map(c => c.visita.name), ['González Soto S.A.'], 'K5: una llamada marcada como hecha no vuelve a salir');
A.eq(U.confirmacionesDeSchedule(sched, '2026-09-18', true).length, 2, 'salvo que se pidan también las hechas (llevan `hecha`)');
A.eq(U.confirmacionesDeSchedule(sched, '2026-09-18', true)[0].hecha, '2026-09-18', 'con la fecha en que se hizo');

// ── C6: fecha local, no UTC ─────────────────────────────────────────────
A.eq(U.toISOLocal(new Date(2026, 8, 18, 0, 30)), '2026-09-18', 'C6: a las 00:30 locales sigue siendo el 18 (toISOString daría el 17 en Europe/Madrid)');
A.eq(U.toISOLocal(new Date(2026, 0, 5, 23, 59)), '2026-01-05', 'cero a la izquierda en mes y día');

// ── C6 (gate de fuente): «hoy» nunca vuelve a calcularse en UTC en estos sitios ─
const inicio = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'redesign', 'screens', 'inicio.js'), 'utf8');
const planif = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'redesign', 'screens', 'planificador.js'), 'utf8');
const data   = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'redesign', 'data.js'), 'utf8');
A.falsy(/State\.today\.toISOString\(\)\.slice\(0, 10\)/.test(inicio), 'C6: inicio.js no calcula «hoy» con toISOString (UTC)');
A.truthy((inicio.match(/U\.toISOLocal\(State\.today\)/g) || []).length >= 3, 'C6: inicio.js usa U.toISOLocal(State.today) en visitas de hoy, próxima visita y confirmaciones');
const subir = planif.slice(planif.indexOf('async function subirCalendario'), planif.indexOf('async function guardar()'));
A.contains(subir, 'U.toISOLocal(new Date())', 'C6: subirCalendario define hoyISO en local');
A.falsy(/new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/.test(subir), 'C6: subirCalendario no usa toISOString para hoy');
A.falsy(/function _addDaysISO[\s\S]{0,300}toISOString/.test(data), 'R2: _addDaysISO no pasa por UTC');

const s = A.summary();
console.log(JSON.stringify(s));
process.exit(s.failed > 0 ? 1 : 0);
