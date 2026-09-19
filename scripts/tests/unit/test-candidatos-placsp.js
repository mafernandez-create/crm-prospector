// Candidatos PLACSP: el cron diario daba de alta cada adjudicatario desconocido
// como ficha normal, y 141 contratistas nacionales (Dragados, TYPSA, UTEs…)
// acabaron contando como cartera sin provincia («141 sin coords» en el mapa).
// Ahora nacen como candidatos (data.revision_placsp.estado = 'pendiente'), no
// son cartera hasta que Manolo los acepta, y se pueden descartar sin borrar.

const path = require('path');
const A    = require('../_lib/assert');

A.reset();

const db = {}; const patches = [];
global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
global.document = { querySelectorAll() { return []; }, getElementById() { return null; } };
global.window = {
  State: { studios: [], studiosById: {}, candidatosPlacsp: [], planificador: null },
  DataSupabase: {
    getDoc: async (p) => { const id = p.split('/')[1]; return db[id] ? JSON.parse(JSON.stringify(db[id])) : null; },
    patchDoc: async (p, obj) => { const id = p.split('/')[1]; patches.push({ id, obj }); db[id] = JSON.parse(JSON.stringify(Object.assign({}, db[id] || {}, obj))); return db[id]; },
  },
  Util: { toISOLocal: () => '2026-09-19' },
  Shell: { updateBadges() { global.badges = (global.badges || 0) + 1; } },
};
require(path.resolve(__dirname, '..', '..', '..', 'redesign', 'data.js'));
const D = global.window.Data;
const S = global.window.State;

const cand = (id, estado, creada, extra) => Object.assign({ id, name: 'Cand ' + id, type: 'ING', status: 'nuevo', data: { revision_placsp: { estado, creada }, ultima_adjudicacion_placsp: { lugar: 'Madrid', titulo: 'Obra', fecha: creada } } }, extra || {});
const normal = (id) => ({ id, name: 'Estudio ' + id, province: 'Málaga', data: { activities: [] } });

(async function () {
  // ── Clasificación ────────────────────────────────────────────────────────
  A.truthy(D.esCandidatoPlacsp(cand('1', 'pendiente', '2026-09-18')), 'pendiente → candidato');
  A.truthy(D.esCandidatoPlacsp(cand('2', 'descartada', '2026-09-18')), 'descartada → candidato (no cartera)');
  A.falsy(D.esCandidatoPlacsp(cand('3', 'aceptada', '2026-09-18')), 'aceptada → cartera');
  A.falsy(D.esCandidatoPlacsp(normal('4')), 'sin revision_placsp → cartera (fichas normales)');
  A.falsy(D.esCandidatoPlacsp({ id: '5', fuente_descubrimiento: { valor: 'placsp' }, data: {} }), 'la fuente sola no basta: manda revision_placsp (las 5 que Manolo ya trabajó son cartera)');

  // ── indexarCartera separa y el mapa comparte objeto ─────────────────────
  const todos = [normal('10'), cand('11', 'pendiente', '2026-09-18'), cand('12', 'descartada', '2026-09-01'), cand('13', 'aceptada', '2026-08-01'), cand('14', 'pendiente', '2026-09-10')];
  todos.forEach(s => { db[s.id] = JSON.parse(JSON.stringify(s)); });
  D.indexarCartera(todos);
  A.eq(S.studios.map(s => s.id), ['10', '13'], 'cartera = normales + aceptadas');
  A.eq(S.candidatosPlacsp.map(s => s.id), ['11', '12', '14'], 'candidatos = pendientes + descartadas');
  A.eq(Object.keys(S.studiosById).length, 5, 'studiosById tiene todas (la ficha se puede abrir)');
  A.truthy(S.studiosById['11'] === S.candidatosPlacsp[0], 'mismo objeto en mapa y array');

  A.eq(D.candidatosPlacspPendientes().map(s => s.id), ['11', '14'], 'pendientes, más recientes primero');
  A.eq(D.candidatosPlacspPendientes('2026-09-15').map(s => s.id), ['11'], 'con fecha: solo las altas desde entonces (aviso «nuevos esta semana»)');

  // ── Aceptar: provincia obligatoria en la UI, aquí va en extra ───────────
  const obj = await D.revisarCandidatoPlacsp('11', 'aceptada', { province: 'Sevilla', city: 'Écija', type: 'OCV', nota: 'obra en Écija' });
  A.eq(obj.data.revision_placsp.estado, 'aceptada', 'queda aceptada');
  A.eq([obj.province, obj.city, obj.type, obj.status], ['Sevilla', 'Écija', 'OCV', 'nuevo'], 'provincia, ciudad, tipo y estado «nuevo»');
  A.eq(S.studios.map(s => s.id).sort(), ['10', '11', '13'], 'pasa a la cartera');
  A.eq(S.candidatosPlacsp.map(s => s.id), ['12', '14'], 'y sale de candidatos');
  const p = patches[patches.length - 1];
  A.eq(Object.keys(p.obj).sort(), ['city', 'data', 'province', 'status', 'type'], 'el PATCH lleva solo lo que cambia');
  A.eq(p.obj.data.ultima_adjudicacion_placsp.titulo, 'Obra', 'conserva el resto del data (adjudicación)');
  A.truthy(S.studiosById['11'] === obj && S.studios.indexOf(obj) >= 0, 'el objeto del State es el mismo, recolocado');
  A.truthy(global.badges >= 1, 'actualiza los contadores de la barra lateral');

  // ── Descartar y deshacer ────────────────────────────────────────────────
  const d = await D.revisarCandidatoPlacsp('14', 'descartada', { nota: 'contratista nacional' });
  A.eq([d.data.revision_placsp.estado, d.status, d.data.revision_placsp.nota], ['descartada', 'descartado', 'contratista nacional'], 'descartada con nota y status descartado');
  A.eq(S.candidatosPlacsp.map(s => s.id).sort(), ['12', '14'], 'sigue en candidatos (pestaña Descartadas), no en cartera');
  A.eq(D.candidatosPlacspPendientes().length, 0, 'ya no hay pendientes');
  const u = await D.revisarCandidatoPlacsp('14', 'pendiente');
  A.eq([u.data.revision_placsp.estado, u.status, u.data.revision_placsp.nota], ['pendiente', 'nuevo', undefined], 'deshacer: vuelve a pendiente y limpia la nota');

  // ── Lee la ficha fresca (otro dispositivo pudo escribir) ────────────────
  db['12'].data.activities = [{ title: 'escrita en otro sitio' }];
  await D.revisarCandidatoPlacsp('12', 'pendiente');
  A.eq(db['12'].data.activities.length, 1, 'no pisa lo que otro dispositivo escribió en data');

  let err = null; try { await D.revisarCandidatoPlacsp('12', 'borrada'); } catch (e) { err = e.message; }
  A.truthy(/no válido/.test(err || ''), 'estado desconocido → error');

  // ── Pantalla: provinciaSugerida solo si el lugar de la obra es una provincia ─
  global.window.Util = Object.assign(global.window.Util, {
    escapeHtml: (x) => String(x), normProv: (p) => String(p || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(),
    PROVINCIAS: ['Almería', 'Sevilla', 'Madrid', 'Alicante', 'Santa Cruz de Tenerife'],
  });
  global.window.Icon = new Proxy({}, { get: () => () => '' });
  require(path.resolve(__dirname, '..', '..', '..', 'redesign', 'screens', 'candidatos.js'));
  const C = global.window.Screens.candidatos;
  A.eq(C.provinciaSugerida('Sevilla'), 'Sevilla', 'lugar = capital → se sugiere');
  A.eq(C.provinciaSugerida('Calp (Alicante)'), '', 'un municipio no se sugiere (la sede no es la obra)');
  A.eq(C.provinciaSugerida('almeria'), 'Almería', 'sin tildes ni mayúsculas');
  A.eq(C.provinciaSugerida(''), '', 'sin lugar → nada');

  const s = A.summary();
  console.log(JSON.stringify(s));
  process.exit(s.failed > 0 ? 1 : 0);
})();
