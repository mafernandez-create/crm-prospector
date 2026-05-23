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
      if (_useSupabase()) return await _sb().getBriefingItems(studioId, limit);
      return await listCollection('briefings/' + studioId + '/items', { limit: limit || 10 });
    } catch (e) {
      console.warn('[redesign/data] no se pudo leer briefings/' + studioId + '/items:', e.message);
      return [];
    }
  }

  /* ============================================================
     IA: BRIEFING + INFORME
     El GAS sólo expone 'claudeProxy' (passthrough a la API de Claude).
     La lógica de build prompt + parseo + persistencia se hace
     client-side (igual que el legacy).
     ============================================================ */

  /* Helper: localiza el studio en State o lo fetcha del backend activo */
  async function _getStudio(studioId) {
    const State = window.State;
    if (State && State.studiosById && State.studiosById[studioId]) return State.studiosById[studioId];
    if (_useSupabase()) return await _sb().getDoc('studios/' + studioId);
    return await getDoc('studios/' + studioId);
  }
  /* Helper: patch que respeta el backend activo. Lo usan las funciones de
     alto nivel (generateBriefing, generateReport, savePlanificador, …) */
  async function _patchDocActive(path, obj) {
    if (_useSupabase()) return _sb().patchDoc(path, obj);
    return patchDoc(path, obj);
  }

  /* Helper: read value (puede venir como string o {valor, fuente_url}) */
  function _val(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'object' && 'valor' in v) return v.valor || '';
    return String(v);
  }

  /* Llama a claudeProxy a través de GAS. Devuelve el texto plano de Claude
     o lanza con el mensaje de error. */
  async function _claudeCall(systemPrompt, userMsg, maxTokens) {
    const res = await callGAS('claudeProxy', {
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens || 4096,
      messages: [{ role: 'user', content: userMsg }],
      system: systemPrompt,
    });
    if (res && res.error) {
      const msg = typeof res.error === 'string' ? res.error : (res.error.message || JSON.stringify(res.error));
      throw new Error(msg);
    }
    const text = (res && res.content && res.content[0] && (res.content[0].text || res.content[0].value)) || res.text || '';
    if (!text) throw new Error('Respuesta vacía de la IA');
    return text;
  }

  /* Extrae JSON de la respuesta de Claude (con ```json fences o no) */
  function _parseJSON(raw) {
    const cleaned = String(raw).replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    try { return JSON.parse(cleaned); } catch (_) {}
    const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
    if (s >= 0 && e > s) {
      try { return JSON.parse(raw.slice(s, e + 1)); } catch (_) {}
    }
    throw new Error('La IA no devolvió JSON parseable');
  }

  async function generateBriefing(studioId, fechaISO, contextoExtra) {
    const studio = await _getStudio(studioId);
    if (!studio) throw new Error('Estudio ' + studioId + ' no encontrado');

    const State = window.State;
    const studios = (State && State.studios) || [];
    const fecha = fechaISO || new Date().toISOString().slice(0, 10);

    // Datos del studio
    const studioName = studio.name || 'Empresa';
    const province = _val(studio.province) || _val(studio.city) || '';
    const city = _val(studio.city) || province;
    const types = Array.isArray(studio.type) ? studio.type : [studio.type || 'ARQ'];
    const contact = (studio.data && studio.data.contact) || {};
    const reports = (studio.data && studio.data.reports) || [];
    const activities = (studio.data && studio.data.activities) || [];
    const lastEvents = [].concat(reports, activities)
      .filter(function (e) { return e && (e.date || e.createdAt); })
      .sort(function (a, b) {
        const da = new Date(b.date || b.createdAt || 0).getTime();
        const db = new Date(a.date || a.createdAt || 0).getTime();
        return da - db;
      }).slice(0, 5);

    // Red de conexiones: mismo cuadrante o misma provincia
    const sameProvince = studios.filter(function (s) {
      return s.id !== studio.id && (_val(s.province) === province);
    });
    const sameQuadrant = sameProvince.filter(function (s) {
      return s.priorityQuadrant && s.priorityQuadrant === studio.priorityQuadrant;
    }).slice(0, 5);
    const puentes = sameProvince.filter(function (s) { return s.es_cliente_puente === true; }).slice(0, 5);

    const crmCtx = [
      'NOMBRE: ' + studioName,
      'CIUDAD: ' + (city || '—') + ' · PROVINCIA: ' + (province || '—'),
      'TIPOS: ' + types.join(', '),
      studio.es_cliente_puente ? '⚠️ ES CLIENTE PUENTE' : null,
      studio.priorityQuadrant ? 'CUADRANTE: Q' + studio.priorityQuadrant + ' ' + (studio.priorityQuadrantName || '') : null,
      studio.priorityDirect ? 'Eje Directo: ' + studio.priorityDirect + ' (' + (studio.priorityDirectScore || 0) + 'pts)' : null,
      studio.priorityNetwork ? 'Eje Red: ' + studio.priorityNetwork + ' (' + (studio.priorityNetworkScore || 0) + 'pts)' : null,
      studio.score ? 'SCORE INTERNO: ' + studio.score : null,
      _val(contact.phone) ? 'TEL: ' + _val(contact.phone) : null,
      _val(contact.email) ? 'EMAIL: ' + _val(contact.email) : null,
      _val(contact.web) ? 'WEB: ' + _val(contact.web) : null,
      studio.data && studio.data.description ? 'DESCRIPCIÓN: ' + studio.data.description.slice(0, 400) : null,
    ].filter(Boolean).join('\n');

    const histCtx = lastEvents.length === 0
      ? 'Sin visitas ni actividades registradas (primera visita).'
      : lastEvents.map(function (v, i) {
          const d = (v.date || v.createdAt || '').slice(0, 10);
          const t = v.title || v.type || 'evento';
          const n = (v.notes || '').slice(0, 220);
          return '[' + d + '] ' + t + (n ? ' — ' + n : '');
        }).join('\n');

    const redCtx = [];
    if (puentes.length) redCtx.push('Otros prescriptores puente en ' + province + ': ' + puentes.map(function (s) { return s.name; }).join(', '));
    if (sameQuadrant.length) redCtx.push('Mismo cuadrante Q' + studio.priorityQuadrant + ' en provincia: ' + sameQuadrant.slice(0, 3).map(function (s) { return s.name; }).join(', '));

    const systemPrompt = 'Eres el asistente comercial de Manolo Fernández, prescriptor de Grupo GPF (Ferroplast, Tuyper, Ecosan, Biopipe, PVC-O, MUTE) en Andalucía/Extremadura/Levante.\n\n' +
      'Misión: generar un briefing pre-visita ACCIONABLE de 1 página con 8 secciones exactas.\n\n' +
      'REGLAS:\n' +
      '- Concreto, NO genérico. Si no hay datos suficientes, dilo explícito.\n' +
      '- Productos GPF: MUTE (saneamiento insonorizado PVC), Ecosan (saneamiento ecológico), Biopipe (bioplástico), PVC-O (presión), Tuyper.\n' +
      '- Devuelve ÚNICAMENTE el JSON con las 8 claves exactas, sin texto extra.';

    const userMsg = 'Genera briefing pre-visita para esta empresa.\n\n' +
      'DATOS CRM:\n' + crmCtx + '\n' +
      (contextoExtra ? '\nCONTEXTO ADICIONAL:\n' + contextoExtra + '\n' : '') +
      '\nHISTÓRICO RECIENTE:\n' + histCtx + '\n' +
      '\nRED DE CONEXIONES:\n' + (redCtx.join('\n') || 'Sin conexiones destacables.') + '\n' +
      '\nFECHA VISITA: ' + fecha + '\n\n' +
      'Devuelve ÚNICAMENTE este JSON (8 claves exactas):\n' +
      '{\n' +
      '  "resumen_ejecutivo": "3-4 líneas: quién es, dónde está en la cartera (cuadrante), por qué se le visita ahora",\n' +
      '  "historico_reciente": "Lo último que se habló, fecha, interlocutor. Si primera visita, di \'Primera visita — sin historial\'",\n' +
      '  "compromisos_abiertos": "Lo prometido y no cerrado. Si no hay, di \'—\'",\n' +
      '  "senales_mercado": "Adjudicaciones públicas recientes, cambios sector, noticias 2024-2026 relevantes",\n' +
      '  "red_conexiones": "Otros prospects/clientes relacionados, especialmente cliente puente si aplica",\n' +
      '  "spin_visita": {"situacion":"Pregunta concreta", "problema":"Pregunta concreta", "implicacion":"Pregunta concreta", "necesidad_pago":"Pregunta concreta"},\n' +
      '  "catalogo_prioritario": ["Producto GPF 1 — razón específica", "Producto 2 — razón", "Producto 3 — razón (opcional)"],\n' +
      '  "evitar_mencionar": ["Aspecto 1 a no revelar", "Aspecto 2"]\n' +
      '}';

    const raw = await _claudeCall(systemPrompt, userMsg, 4096);
    const briefing = _parseJSON(raw);

    // Persistir en el backend activo
    const isoDate = new Date().toISOString().replace(/[:.]/g, '-');
    try {
      await _patchDocActive('briefings/' + studioId + '/items/' + isoDate, {
        fecha_visita: fecha,
        generated_at: new Date().toISOString(),
        contexto_extra: contextoExtra || null,
        briefing: briefing,
        studio_snapshot: {
          name: studioName,
          province: province,
          cuadrante: studio.priorityQuadrant || null,
          es_cliente_puente: studio.es_cliente_puente === true,
        },
      });
    } catch (e) {
      console.warn('[redesign/data] persistencia briefing falló:', e.message);
    }

    return { success: true, briefing: briefing, persisted: true };
  }

  async function generateReport(studioId, payload) {
    payload = payload || {};
    const studio = await _getStudio(studioId);
    if (!studio) throw new Error('Estudio ' + studioId + ' no encontrado');

    const modalidad = payload.modalidad || 'real';
    const fecha = payload.fecha || new Date().toISOString().slice(0, 10);
    const comercial = payload.comercial || 'Manolo Fernández';
    const prescripcion = !!payload.prescripcion;
    const notas = payload.notes || payload.notas || '';

    if (modalidad === 'real' && !notas.trim()) {
      throw new Error('Necesitas escribir las notas de la visita antes de generar el informe.');
    }

    const studioName = studio.name || 'Empresa';
    const province = _val(studio.province) || '';
    const city = _val(studio.city) || province;
    const contact = (studio.data && studio.data.contact) || {};

    const crmCtx = [
      'EMPRESA: ' + studioName,
      'CIUDAD: ' + (city || '—') + ' · PROVINCIA: ' + (province || '—'),
      _val(contact.phone) ? 'TEL: ' + _val(contact.phone) : null,
      _val(contact.email) ? 'EMAIL: ' + _val(contact.email) : null,
      _val(contact.web) ? 'WEB: ' + _val(contact.web) : null,
      studio.priorityQuadrant ? 'CUADRANTE: Q' + studio.priorityQuadrant : null,
      studio.score ? 'SCORE: ' + studio.score : null,
    ].filter(Boolean).join('\n');

    const systemPrompt = 'Eres el asistente de informes de visitas comerciales de Manuel Fernández (Manolo), prescriptor de Grupo Plásticos Ferro (GPF) en Andalucía/Extremadura/Levante.\n\n' +
      'Misión: convertir las notas en bruto de una visita en un informe estructurado, conciso y accionable.\n\n' +
      'REGLAS:\n' +
      '- Tono profesional pero ameno, primera persona ("estuve con…", "me comentaron que…").\n' +
      '- Sintetiza, no copies literal. Detecta compromisos, acciones siguientes y oportunidades.\n' +
      '- Devuelve ÚNICAMENTE el JSON con las claves exactas, sin texto extra.';

    const userMsg = 'Genera un informe de visita.\n\n' +
      'DATOS EMPRESA:\n' + crmCtx + '\n' +
      '\nFECHA VISITA: ' + fecha + '\nCOMERCIAL: ' + comercial + '\nMODALIDAD: ' + modalidad +
      (prescripcion ? ' (visita de prescripción)' : '') + '\n' +
      '\nNOTAS EN BRUTO DEL COMERCIAL:\n' + notas + '\n\n' +
      'Devuelve ÚNICAMENTE este JSON:\n' +
      '{\n' +
      '  "resumen": "1-2 párrafos sintetizando la reunión",\n' +
      '  "interlocutores": ["Nombre 1 — cargo", "Nombre 2 — cargo"],\n' +
      '  "temas_tratados": ["Tema 1", "Tema 2", "Tema 3"],\n' +
      '  "compromisos": [{"que":"Qué hacer", "quien":"Quién", "cuando":"Cuándo"}],\n' +
      '  "oportunidades_detectadas": ["Producto/proyecto identificado"],\n' +
      '  "proxima_accion": "La acción más concreta para mover el deal",\n' +
      '  "nivel_interes": "alto|medio|bajo",\n' +
      '  "notas_adicionales": "Cualquier cosa relevante que no encaje arriba"\n' +
      '}';

    const raw = await _claudeCall(systemPrompt, userMsg, 4096);
    const report = _parseJSON(raw);

    // Persistir como un report más en el studio
    const isoDate = new Date().toISOString().replace(/[:.]/g, '-');
    try {
      await _patchDocActive('studios/' + studioId + '/reports/' + isoDate, {
        date: fecha,
        generated_at: new Date().toISOString(),
        modalidad: modalidad,
        comercial: comercial,
        prescripcion: prescripcion,
        notes_raw: notas,
        report: report,
        title: 'Visita ' + fecha + ' · ' + comercial,
      });
    } catch (e) {
      console.warn('[redesign/data] persistencia report falló:', e.message);
    }

    return { success: true, report: report, persisted: true };
  }

  /* Guarda _meta/planificador con el schedule pasado. Reemplaza el documento
     entero porque planificador se trata como una unidad atómica. */
  async function savePlanificador(schedule) {
    const out = await _patchDocActive('_meta/planificador', { schedule: schedule || {} });
    if (window.State) window.State.planificador = out;
    return out;
  }

  /* ============================================================
     CARGA INICIAL
     ============================================================ */
  /* Reintenta una promesa con backoff exponencial si Firestore devuelve 429 */
  async function _withRetry(fn, label, maxAttempts) {
    maxAttempts = maxAttempts || 4;
    let lastErr;
    for (let i = 1; i <= maxAttempts; i++) {
      try {
        return await fn();
      } catch (e) {
        lastErr = e;
        const is429 = /\b429\b|Too Many Requests/i.test(e.message || '');
        if (!is429 || i === maxAttempts) throw e;
        const wait = Math.min(5000, 400 * Math.pow(2, i - 1)) + Math.random() * 200;
        console.warn('[redesign/data] ' + label + ' 429, reintento ' + i + '/' + (maxAttempts - 1) + ' en ' + Math.round(wait) + 'ms');
        await new Promise(function (r) { setTimeout(r, wait); });
      }
    }
    throw lastErr;
  }

  /* Cache local de la última carga exitosa.
     - TTL_FRESH (1h): si tenemos cache fresco, lo servimos SIN tocar Firestore
       (0 reads por recarga durante la primera hora).
     - TTL_STALE (24h): si cache existe pero es viejo, intentamos refresh; si
       Firestore falla devolvemos lo viejo con aviso de antigüedad.
     - Más de 24h: cache obsoleto, fuerza recarga. */
  const CACHE_KEY = 'redesign:studios:cache:v1';
  const CACHE_TTL_STALE_MS = 24 * 3600 * 1000;
  const CACHE_TTL_FRESH_MS = 60 * 60 * 1000;

  function _readCache(maxAgeMs) {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !obj.savedAt || !Array.isArray(obj.studios)) return null;
      if (Date.now() - obj.savedAt > (maxAgeMs || CACHE_TTL_STALE_MS)) return null;
      return obj;
    } catch (_) { return null; }
  }
  function _writeCache(studios, planificador) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        savedAt: Date.now(),
        studios: studios,
        planificador: planificador || null,
      }));
    } catch (_) { /* quota llena o private mode */ }
  }

  /* ============================================================
     BACKEND SWITCH (Fase 1 migración Supabase)
     ============================================================
     Si localStorage['redesign:backend'] === 'supabase', delega TODO el
     I/O a window.DataSupabase (definido en redesign/data-supabase.js).
     Default: 'firebase' = comportamiento actual. */
  function _activeBackend() {
    try { return localStorage.getItem('redesign:backend') || 'firebase'; }
    catch (_) { return 'firebase'; }
  }
  function _sb() {
    return window.DataSupabase;
  }
  function _useSupabase() {
    return _activeBackend() === 'supabase' && !!_sb();
  }

  async function loadAll() {
    const State = window.State;
    if (!State) {
      console.warn('[redesign/data] State no disponible');
      return;
    }
    State.loading = true;
    State.error = null;
    State.backend = _activeBackend();

    // ¿Tenemos cache fresco (<1h)? Servir sin tocar el backend.
    const fresh = _readCache(CACHE_TTL_FRESH_MS);
    if (fresh) {
      State.studios = fresh.studios;
      State.studiosById = {};
      fresh.studios.forEach(function (s) { State.studiosById[s.id] = s; });
      State.planificador = fresh.planificador || null;
      State.loading = false;
      console.info('[redesign/data] cartera servida desde cache local (' +
        Math.round((Date.now() - fresh.savedAt) / 60000) + ' min) · ' +
        fresh.studios.length + ' studios · 0 reads remotos');
      return;
    }

    // Path Supabase: una sola llamada que retorna {studios, planificador}
    if (_useSupabase()) {
      try {
        const out = await _sb().loadAll();
        State.studios = out.studios || [];
        State.studiosById = {};
        State.studios.forEach(function (s) { State.studiosById[s.id] = s; });
        State.planificador = out.planificador || null;
        _writeCache(State.studios, State.planificador);
        State.loading = false;
        console.info('[redesign/data] backend=supabase · cartera: ' + State.studios.length);
        return;
      } catch (e) {
        // Si Supabase falla, fallback a cache STALE (24h)
        const stale = _readCache(CACHE_TTL_STALE_MS);
        if (stale) {
          const ageMin = Math.round((Date.now() - stale.savedAt) / 60000);
          console.warn('[redesign/data] Supabase falló, cache stale ' + ageMin + ' min');
          State.studios = stale.studios;
          State.studiosById = {};
          stale.studios.forEach(function (s) { State.studiosById[s.id] = s; });
          State.planificador = stale.planificador || null;
          State.error = 'Datos de hace ' + ageMin + ' min (Supabase no disponible)';
        } else {
          console.error('[redesign/data] Supabase falló y sin cache:', e);
          State.error = e.message || String(e);
          State.loading = false;
          throw e;
        }
        State.loading = false;
        return;
      }
    }

    // Path Firebase (default) — comportamiento previo
    // Carga las dos fuentes en paralelo pero AISLADAS: si una falla,
    // la otra sigue. La cartera es crítica; el planificador, accesorio.
    const studiosP = _withRetry(function () {
      return listCollection('studios', { pageSize: 300, limit: 5000 });
    }, 'studios');
    const planP = _withRetry(function () {
      return getDoc('_meta/planificador');
    }, 'planificador', 2).catch(function (e) {
      console.warn('[redesign/data] planificador no se pudo cargar (no es crítico):', e.message);
      return null;
    });

    try {
      const studios = await studiosP;
      State.studios = studios || [];
      State.studiosById = {};
      (studios || []).forEach(function (s) { State.studiosById[s.id] = s; });
      const plan = await planP;
      State.planificador = plan;
      _writeCache(studios || [], plan);
      console.info('[redesign/data] backend=firebase · cartera: ' + (studios || []).length);
    } catch (e) {
      // Firestore caído / 429 sostenido: usar cache STALE si existe (hasta 24h)
      const stale = _readCache(CACHE_TTL_STALE_MS);
      if (stale) {
        const ageMin = Math.round((Date.now() - stale.savedAt) / 60000);
        console.warn('[redesign/data] Firestore falló, usando cache stale de hace ' +
          ageMin + ' min · ' + stale.studios.length + ' studios');
        State.studios = stale.studios;
        State.studiosById = {};
        stale.studios.forEach(function (s) { State.studiosById[s.id] = s; });
        State.planificador = stale.planificador || null;
        State.error = 'Datos de hace ' + ageMin + ' min (Firestore no disponible)';
      } else {
        console.error('[redesign/data] error cargando studios y sin cache:', e);
        State.error = e.message || String(e);
        State.loading = false;
        throw e;
      }
    }
    State.loading = false;
  }

  /* Fuerza recarga ignorando cache (botón "Sincronizar ahora") */
  async function forceReload() {
    try { localStorage.removeItem(CACHE_KEY); } catch (_) {}
    return loadAll();
  }

  /* ============================================================
     EXPORT
     ============================================================
     Para getDoc/listCollection/patchDoc, exponemos wrappers que enrutan
     al backend activo. Las pantallas siguen llamando a window.Data.X
     sin saber qué backend hay detrás. */
  function _routeGetDoc(path) {
    if (_useSupabase()) return _sb().getDoc(path);
    return getDoc(path);
  }
  function _routeListCollection(name, opts) {
    if (_useSupabase()) return _sb().listCollection(name, opts);
    return listCollection(name, opts);
  }
  function _routePatchDoc(path, obj, opts) {
    if (_useSupabase()) return _sb().patchDoc(path, obj, opts);
    return patchDoc(path, obj, opts);
  }

  window.Data = {
    PROJECT: PROJECT,
    REST_BASE: REST_BASE,
    GAS_URL: GAS_URL,
    loadAll: loadAll,
    forceReload: forceReload,
    getDoc: _routeGetDoc,
    listCollection: _routeListCollection,
    patchDoc: _routePatchDoc,
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
    // Diagnóstico
    activeBackend: _activeBackend,
  };
})();
