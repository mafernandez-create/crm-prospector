/* CRM Prospector · rediseño v1 · Fase G — Capa de datos
 *
 * Acceso a Firestore (REST público, mismo proyecto ferroplast-crm) y
 * proxy al endpoint GAS Web App existente. NO se reescribe lógica de
 * negocio — se mantiene el mismo endpoint actual.
 *
 * Expone:
 *   window.Data.loadAll()        — carga studios + planificador en State
 *   window.Data.getDoc(path)     — un único documento
 *   window.Data.listCollection(name, opts) — lista paginada
 *   window.Data.patchDoc(path, obj) — UPSERT documento (rules-permitting)
 *   window.Data.callGAS(action, params)    — proxy genérico al GAS Web App
 *   window.Data.generateBriefing(studioId, fecha, contextoExtra)
 *   window.Data.generateReport(studioId, payload)
 *   window.Data.getBriefingItems(studioId, limit) — read briefings/{id}/items
 *   window.Data.savePlanificador(schedule) — persiste _meta/planificador
 *
 * Convenciones:
 *   - Sin Firebase compat SDK: usamos REST directo, mismo patrón que
 *     scripts/tests/_lib/firestore.js para no tener que cargar 200KB
 *     adicionales de Firebase SDK.
 *   - Escrituras REST usan apiKey público (mismo que el legacy SDK). Las
 *     reglas de Firestore deciden qué se puede escribir; _meta/planificador
 *     y studios admiten patch (igual que el legacy).
 *   - GAS URL es la misma del CRM actual. Si se redeploya, hay que
 *     actualizar aquí también.
 */
(function () {
  'use strict';

  /* ============================================================
     CONFIG (extraída del index.html actual)
     ============================================================ */
  const PROJECT = 'ferroplast-crm';
  const API_KEY = 'AIzaSyCVxMjrIfB4MrYiUzvKzt8fJeKKNne-Cm0';
  const REST_BASE = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents';
  const GAS_URL = 'https://script.google.com/macros/s/AKfycbxx6KIUavnMAVn3eUtX4SKMoVAnOQ3YAsIYofiMufkw6tkbQDaG3-jDku_Z8kEsNY_6aQ/exec';

  /* ============================================================
     FIRESTORE REST CLIENT (sin auth, igual que scripts/tests/_lib)
     ============================================================ */
  function unwrap(f) {
    if (f === null || f === undefined) return null;
    if ('stringValue' in f) return f.stringValue;
    if ('integerValue' in f) return parseInt(f.integerValue, 10);
    if ('doubleValue' in f) return f.doubleValue;
    if ('booleanValue' in f) return f.booleanValue;
    if ('nullValue' in f) return null;
    if ('timestampValue' in f) return f.timestampValue;
    if ('arrayValue' in f) return (f.arrayValue.values || []).map(unwrap);
    if ('mapValue' in f) {
      const o = {};
      const fields = f.mapValue.fields || {};
      for (const k in fields) o[k] = unwrap(fields[k]);
      return o;
    }
    return null;
  }
  function fieldsToObj(fields) {
    const o = {};
    for (const k in (fields || {})) o[k] = unwrap(fields[k]);
    return o;
  }

  /* Inversa de unwrap — convierte un valor JS en un Firestore Value typed */
  function wrap(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') {
      if (Number.isInteger(v)) return { integerValue: String(v) };
      return { doubleValue: v };
    }
    if (typeof v === 'string') return { stringValue: v };
    if (Array.isArray(v)) {
      return { arrayValue: { values: v.map(wrap) } };
    }
    if (typeof v === 'object') {
      const fields = {};
      for (const k in v) fields[k] = wrap(v[k]);
      return { mapValue: { fields: fields } };
    }
    return { stringValue: String(v) };
  }
  function objToFields(obj) {
    const fields = {};
    for (const k in (obj || {})) fields[k] = wrap(obj[k]);
    return fields;
  }

  async function getDoc(path) {
    const r = await fetch(REST_BASE + '/' + path);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('Firestore ' + r.status + ' ' + r.statusText + ' (' + path + ')');
    const j = await r.json();
    return Object.assign({ id: j.name.split('/').pop() }, fieldsToObj(j.fields || {}));
  }

  async function listCollection(name, opts) {
    opts = opts || {};
    const docs = [];
    const pageSize = opts.pageSize || 300;
    const limit = opts.limit || Infinity;
    let pageToken = null;
    do {
      const u = new URL(REST_BASE + '/' + name);
      u.searchParams.set('pageSize', String(pageSize));
      if (pageToken) u.searchParams.set('pageToken', pageToken);
      const r = await fetch(u);
      if (!r.ok) throw new Error('Firestore ' + r.status + ' ' + r.statusText + ' (' + name + ')');
      const j = await r.json();
      (j.documents || []).forEach(function (d) {
        if (docs.length >= limit) return;
        docs.push(Object.assign({ id: d.name.split('/').pop() }, fieldsToObj(d.fields || {})));
      });
      pageToken = j.nextPageToken || null;
    } while (pageToken && docs.length < limit);
    return docs;
  }

  /* PATCH = upsert. Si el doc no existe se crea, si existe se mergea
     (sólo los campos indicados; pasar updateMask vacío reemplaza todo).
     Usa la API key pública del proyecto, idéntico al SDK del legacy. */
  async function patchDoc(path, obj, opts) {
    opts = opts || {};
    const url = new URL(REST_BASE + '/' + path);
    url.searchParams.set('key', API_KEY);
    if (opts.updateMask && opts.updateMask.length) {
      opts.updateMask.forEach(function (m) { url.searchParams.append('updateMask.fieldPaths', m); });
    }
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: objToFields(obj) }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(function () { return ''; });
      throw new Error('Firestore PATCH ' + res.status + ' ' + res.statusText + ' (' + path + ') ' + txt.slice(0, 200));
    }
    const j = await res.json();
    return Object.assign({ id: (j.name || '').split('/').pop() }, fieldsToObj(j.fields || {}));
  }

  /* ============================================================
     GAS WEB APP PROXY (no-CORS via form-encoded)
     ============================================================ */
  async function callGAS(action, params) {
    params = params || {};
    // Body como JSON; el GAS endpoint espera doPost con e.postData.contents
    const body = JSON.stringify(Object.assign({ action: action }, params));
    const res = await fetch(GAS_URL, {
      method: 'POST',
      // GAS Web App suele requerir text/plain para evitar preflight CORS
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: body,
      redirect: 'follow',
    });
    if (!res.ok) throw new Error('GAS ' + res.status + ' ' + res.statusText);
    const txt = await res.text();
    try { return JSON.parse(txt); }
    catch (_) { return { raw: txt }; }
  }

  /* ============================================================
     ALTO NIVEL — operaciones específicas del rediseño
     ============================================================ */

  async function getBriefingItems(studioId, limit) {
    try {
      return await listCollection('briefings/' + studioId + '/items', { limit: limit || 10 });
    } catch (e) {
      console.warn('[redesign/data] no se pudo leer briefings/' + studioId + '/items:', e.message);
      return [];
    }
  }

  async function generateBriefing(studioId, fechaISO, contextoExtra) {
    return callGAS('briefingNarrativo', {
      studioId: studioId,
      fecha: fechaISO,
      contextoExtra: contextoExtra || '',
    });
  }

  async function generateReport(studioId, payload) {
    // payload: { modalidad, fecha, comercial, prescripcion, notes }
    return callGAS('informeIA', Object.assign({ studioId: studioId }, payload || {}));
  }

  /* Guarda _meta/planificador con el schedule pasado. Reemplaza el documento
     entero porque planificador se trata como una unidad atómica. */
  async function savePlanificador(schedule) {
    const out = await patchDoc('_meta/planificador', { schedule: schedule || {} });
    if (window.State) window.State.planificador = out;
    return out;
  }

  /* ============================================================
     CARGA INICIAL
     ============================================================ */
  async function loadAll() {
    const State = window.State;
    if (!State) {
      console.warn('[redesign/data] State no disponible');
      return;
    }
    State.loading = true;
    State.error = null;
    try {
      const [studios, plan] = await Promise.all([
        listCollection('studios', { pageSize: 300, limit: 5000 }),
        getDoc('_meta/planificador'),
      ]);
      State.studios = studios;
      State.studiosById = {};
      studios.forEach(function (s) { State.studiosById[s.id] = s; });
      State.planificador = plan;
      State.loading = false;
      console.info('[redesign/data] cartera cargada: ' + studios.length + ' studios');
    } catch (e) {
      console.error('[redesign/data] error de carga:', e);
      State.error = e.message || String(e);
      State.loading = false;
      throw e;
    }
  }

  /* ============================================================
     EXPORT
     ============================================================ */
  window.Data = {
    PROJECT: PROJECT,
    REST_BASE: REST_BASE,
    GAS_URL: GAS_URL,
    loadAll: loadAll,
    getDoc: getDoc,
    listCollection: listCollection,
    patchDoc: patchDoc,
    callGAS: callGAS,
    generateBriefing: generateBriefing,
    generateReport: generateReport,
    getBriefingItems: getBriefingItems,
    savePlanificador: savePlanificador,
    // Helpers internos por si las pantallas quieren parsear ad-hoc
    unwrap: unwrap,
    fieldsToObj: fieldsToObj,
    wrap: wrap,
    objToFields: objToFields,
  };
})();
