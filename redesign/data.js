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

  /* ============================================================
     BÚSQUEDA WEB MULTI-FUENTE (Fase B briefing IA)
     Replica el método del legacy (index-legacy.html línea 30791+):
     - Web propia del cliente via allorigins.win proxy CORS
     - DuckDuckGo Instant Answer API (sin CORS, devuelve JSON)
     - Páginas Amarillas / InfoEmpresas para datos mercantiles
     - Queries sectoriales según tipo de cliente + provincia
     ============================================================ */

  /* Queries sectoriales por tipo de cliente y provincia.
     Devuelven una lista de strings de búsqueda específicos del nicho. */
  const QUERIES_SECTORIALES = {
    'ING':  function (p) { return [
      'SEIASA modernización regadíos ' + p + ' adjudicación 2024 2025',
      'Plan PARRA Andalucía agua regenerada ' + p + ' proyectos',
      'PERTE digitalización ciclo agua comunidades regantes ' + p,
    ]; },
    'CCRR': function (p) { return [
      'SEIASA modernización regadíos ' + p,
      'comunidad regantes ' + p + ' adjudicación tubería presión',
      'Plan PARRA agua regenerada ' + p + ' riego',
    ]; },
    'ARQ':  function (p) { return [
      'arquitectura visados obra ' + p + ' 2024 2025',
      'colegio arquitectos ' + p + ' concursos proyectos',
    ]; },
    'OCV':  function (p) { return [
      'obra civil licitación adjudicación ' + p + ' 2024 2025',
      'promotora ' + p + ' BORME constitución administradores',
    ]; },
    'CICA': function (p) { return [
      'ciclo urbano agua ' + p + ' concesión gestión',
      'confederación hidrográfica ' + p + ' obras hidráulicas 2024 2025',
      'iAgua ' + p + ' adjudicación saneamiento',
    ]; },
    'AAPP': function (p) { return [
      'ayuntamiento ' + p + ' licitación obras agua saneamiento 2024 2025',
      'diputación ' + p + ' plan provincial obras servicios',
    ]; },
  };

  /* Fetch genérico vía allorigins.win con timeout. Devuelve texto plano
     limpio del HTML o '' si falla. */
  async function _fetchTextoWeb(url, maxChars, timeoutMs) {
    maxChars = maxChars || 2000;
    timeoutMs = timeoutMs || 7000;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(function () { ctrl.abort(); }, timeoutMs);
      const r = await fetch('https://api.allorigins.win/get?url=' + encodeURIComponent(url),
        { signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) return '';
      const d = await r.json();
      if (!d.contents) return '';
      // Limpiar HTML básico (sin DOMParser para ser portable)
      let html = d.contents;
      html = html.replace(/<(script|style|nav|footer|header|aside|form|button)[\s\S]*?<\/\1>/gi, ' ');
      html = html.replace(/<[^>]+>/g, ' ');
      html = html.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      html = html.replace(/\s+/g, ' ').trim();
      return html.substring(0, maxChars);
    } catch (_) { return ''; }
  }

  /* Llama a DuckDuckGo Instant Answer API (devuelve JSON, sin CORS).
     No siempre devuelve contenido — depende de la query. Best-effort. */
  async function _searchDuckDuckGo(query) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(function () { ctrl.abort(); }, 5000);
      const r = await fetch('https://api.duckduckgo.com/?q=' + encodeURIComponent(query) + '&format=json&no_html=1&skip_disambig=1',
        { signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) return '';
      const j = await r.json();
      const parts = [j.AbstractText, j.Answer];
      (j.RelatedTopics || []).slice(0, 6).forEach(function (top) {
        if (top.Text) parts.push(top.Text);
        else if (top.Topics) top.Topics.forEach(function (s) { if (s.Text) parts.push(s.Text); });
      });
      const text = parts.filter(Boolean).join(' · ').trim();
      return text.length > 50 ? text.substring(0, 1200) : '';
    } catch (_) { return ''; }
  }

  /* Recopila contexto web para el briefing. Ejecuta varias búsquedas
     en paralelo con timeouts. Devuelve un string markdown listo para
     inyectar en el user prompt, o '' si nada funcionó. */
  async function _gatherWebContext(studio) {
    const startTs = Date.now();
    const sources = [];
    const studioName = studio.name || '';
    const province = _val(studio.province) || '';
    const city = _val(studio.city) || '';
    const types = Array.isArray(studio.type) ? studio.type : [studio.type || ''];
    const tipo = types[0];
    const contact = (studio.data && studio.data.contact) || {};
    const webUrl = _val(contact.web);

    // Lanzamos todas en paralelo y filtramos las que devuelvan algo
    const tasks = [];

    // 1. Web propia del cliente
    if (webUrl && /^https?:\/\//i.test(webUrl)) {
      tasks.push(
        _fetchTextoWeb(webUrl, 2500, 8000).then(function (t) {
          return t.length > 80 ? { label: 'Web del cliente · ' + webUrl, text: t } : null;
        })
      );
    }

    // 2. DuckDuckGo del cliente (info general)
    const qCliente = studioName + (city ? ' ' + city : '');
    tasks.push(
      _searchDuckDuckGo(qCliente).then(function (t) {
        return t ? { label: 'Buscador · ' + qCliente, text: t } : null;
      })
    );

    // 3. Páginas Amarillas (datos contacto / categoría)
    const normalSlug = studioName.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9\s]/g, '').trim();
    if (normalSlug.length > 3) {
      tasks.push(
        _fetchTextoWeb('https://www.paginasamarillas.es/search/' + encodeURIComponent(normalSlug) + '/all-spain/', 1500, 6000)
          .then(function (t) { return t.length > 100 ? { label: 'Páginas Amarillas', text: t } : null; })
      );
    }

    // 4. Búsquedas sectoriales según tipo + provincia
    const getQueries = QUERIES_SECTORIALES[tipo];
    if (getQueries && province) {
      const queries = getQueries(province);
      queries.forEach(function (q) {
        tasks.push(
          _searchDuckDuckGo(q).then(function (t) {
            return t ? { label: 'Sectorial · ' + q.substring(0, 50), text: t } : null;
          })
        );
      });
    }

    // Limit total time: 25s
    const results = await Promise.race([
      Promise.all(tasks),
      new Promise(function (resolve) { setTimeout(function () { resolve([]); }, 25000); }),
    ]);

    (results || []).forEach(function (r) { if (r) sources.push(r); });

    if (!sources.length) return '';

    const duration = ((Date.now() - startTs) / 1000).toFixed(1);
    console.info('[redesign/data] contexto web recopilado · ' + sources.length + ' fuentes · ' + duration + 's');

    return '\n## CONTEXTO WEB RECOPILADO (' + new Date().toISOString().slice(0, 10) + ')\n\n' +
      sources.map(function (s) {
        return '### ' + s.label + '\n' + s.text + '\n';
      }).join('\n');
  }

  /* ============================================================
     BRIEFING IA · §19.2 Modo Briefing Narrativo
     Metodología documentada en docs/metodologia_briefing_AEGRA.md
     ============================================================ */

  /* Tabla de catálogo GPF prioritario por tipo de cliente */
  const CATALOGO_POR_TIPO = {
    'ING': 'Ingeniería · regadío/saneamiento/obra civil → BIOPIPE PVC-O y PE 100 (conducción a presión, regadío); TUYPER conducción (transporte agua); ECOSAN y CONDUSAN (saneamiento enterrado). Si hay edificación: MUTE/EUME para saneamiento insonorizado.',
    'CCRR': 'Comunidad de Regantes → BIOPIPE PVC-O y PE 100 (sustitución acequia por tubería a presión); TUYPER conducción; soluciones para telecontrol y riego a demanda.',
    'ARQ': 'Arquitectura → MUTE (saneamiento insonorizado PVC, requisito DB-HR); EUME (canalón aluminio); CONDUSAN para enterrado. Énfasis en certificaciones y cumplimiento DB-HR.',
    'OCV': 'Promotora / OCV → ECOSAN, CONDUSAN, MUTE para edificios residenciales; TUYPER conducción si hay urbanización. Catálogo según la fase del proyecto.',
    'CICA': 'Ciclo del agua → ECOSAN y CONDUSAN (saneamiento); BIOPIPE / TUYPER para conducción a presión y abastecimiento. Énfasis en garantía a largo plazo.',
    'AAPP': 'Admin. pública → según el tipo de obra: BIOPIPE/PE 100 para abastecimiento; ECOSAN/CONDUSAN para saneamiento; MUTE para reformas en edificios públicos.',
  };

  /* Mapa de fuentes sectoriales por tipo (§18.5 + sección 8 doc metodología) */
  const FUENTES_SECTORIALES = {
    'ING': ['SEIASA (modernización regadíos)', 'Plan PARRA Andalucía (agua regenerada)', 'PERTE digitalización ciclo del agua', 'TED Europa / PLACSP', 'BOE (CCRR)', 'FERAGUA'],
    'CCRR': ['SEIASA', 'PERTE agua', 'FERAGUA', 'Confederación hidrográfica de la cuenca', 'BOE'],
    'ARQ': ['Colegio Oficial Arquitectos (COA provincial)', 'AIA Journey to Specification', 'Plataformas de concursos', 'Visados de obra colegios'],
    'OCV': ['PLACSP / TED Europa', 'BORME (datos mercantiles)', 'Prensa económica local'],
    'CICA': ['Confederaciones hidrográficas', 'iAgua, RETEMA, AguasResiduales', 'Empresas gestoras del ciclo integral'],
    'AAPP': ['PLACSP', 'Presupuestos municipales', 'Planes provinciales de obras (Diputaciones)'],
  };

  /* Reglas implícitas del método (sección 6 del doc metodología) */
  const REGLAS_IMPLICITAS = [
    'Si el cliente es nuevo, las secciones 3 (Histórico) y 4 (Compromisos) se DECLARAN vacías explícitamente, NO se omiten.',
    'Si tipo=ING/CCRR y provincia andaluza, mencionar el contexto SEIASA / Plan PARRA / PERTE agua como pico de inversión actual.',
    'Toda señal de mercado debe llevar cifra concreta + fuente (aunque sea solo "según prensa sectorial").',
    'Cada señal de mercado cierra con una "lectura para la visita": cómo se traduce esa señal en argumento comercial concreto.',
    'El catálogo GPF se filtra: máximo 3-4 productos relevantes, NUNCA el catálogo entero.',
    'Recomienda llevar un CASO CONCRETO de proyecto similar, no fichas comerciales genéricas.',
    'NUNCA menciones scoring interno, cuadrantes, ni clasificación de cartera al cliente.',
    'NUNCA reveles cómo se ha identificado al cliente (búsqueda automatizada, BORME, etc.).',
    'El objetivo final de la visita es un ADVANCE (entregable concreto + fecha), nunca una "continuation" tipo "ya hablaremos".',
    'Advierte explícitamente del riesgo de continuation disfrazada de éxito.',
    'Tono: rol consultor técnico, NO comercial. Especialmente con ingenierías/CCRR que tienen equipo técnico propio.',
    'Mix SPIN proporcional a 30 min: 1-2 Situación, 3-4 Problema, 4-6 Implicación, 2-3 Need-payoff (~12-15 preguntas).',
    'Las preguntas de Situación se MINIMIZAN porque lo demás se investiga antes de la visita.',
    'Separa lo VERIFICADO de lo INFERIDO: incluye bloque "lo que NO se sabe y conviene verificar en visita".',
    'Si la información del cliente es muy limitada, di explícitamente "perfil reconstruido desde fuentes públicas, nivel de confianza single_source".',
    'Descarta resultados de homónimos en otros países (caso clásico: empresas con mismo nombre en LatAm).',
  ];

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
    const tipoPrincipal = types[0];
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

    // Compromisos abiertos: propuestas pendientes en activities
    const propuestasPendientes = [];
    activities.forEach(function (a) {
      const ps = (a && a.registroVisita && a.registroVisita.actualizaciones_propuestas) || [];
      ps.forEach(function (p) {
        if (!p.decision || p.decision === 'pending') propuestasPendientes.push(p);
      });
    });

    // Red de conexiones
    const sameProvince = studios.filter(function (s) {
      return s.id !== studio.id && (_val(s.province) === province);
    });
    const sameQuadrant = sameProvince.filter(function (s) {
      return s.priorityQuadrant && s.priorityQuadrant === studio.priorityQuadrant;
    }).slice(0, 5);
    const puentes = sameProvince.filter(function (s) { return s.es_cliente_puente === true; }).slice(0, 5);
    const visitadosProvincia = sameProvince.filter(function (s) {
      return (s.data && (s.data.reports || []).length > 0) || (s.data && (s.data.activities || []).length > 0);
    }).slice(0, 5);

    // Es cliente nuevo si no tiene histórico
    const esClienteNuevo = lastEvents.length === 0;

    // Contexto CRM (estructurado)
    const crmCtx = [
      '## DATOS DEL CLIENTE',
      'Nombre: ' + studioName,
      'Ciudad / Provincia: ' + (city || '—') + ' / ' + (province || '—'),
      'Tipo(s): ' + types.join(', '),
      studio.es_cliente_puente ? 'CLIENTE PUENTE: sí (fuente: ' + (_val(studio.fuente_descubrimiento) || 'sectorial') + ')' : 'Cliente puente: no',
      studio.priorityQuadrant ? 'Cuadrante: Q' + studio.priorityQuadrant + ' (' + (studio.priorityQuadrantName || '') + ')' : 'Cuadrante: sin clasificar',
      studio.priorityDirect ? 'Eje Directo: ' + studio.priorityDirect + ' · score ' + (studio.priorityDirectScore || 0) : null,
      studio.priorityNetwork ? 'Eje Red: ' + studio.priorityNetwork + ' · score ' + (studio.priorityNetworkScore || 0) : null,
      studio.score ? 'Score interno: ' + studio.score : null,
      _val(contact.phone) ? 'Teléfono: ' + _val(contact.phone) : null,
      _val(contact.email) ? 'Email: ' + _val(contact.email) : null,
      _val(contact.web) ? 'Web: ' + _val(contact.web) : null,
      _val(contact.address) ? 'Dirección: ' + _val(contact.address) : null,
      studio.data && studio.data.description ? 'Descripción: ' + studio.data.description.slice(0, 500) : null,
      studio.data && studio.data.studio && studio.data.studio.employees ? 'Empleados: ' + _val(studio.data.studio.employees) : null,
    ].filter(Boolean).join('\n');

    const histCtx = esClienteNuevo
      ? 'PRIMERA VISITA — cliente nuevo, sin histórico previo de visitas ni actividades registradas en el CRM.'
      : lastEvents.map(function (v, i) {
          const d = (v.date || v.createdAt || '').slice(0, 10);
          const t = v.title || v.type || 'evento';
          const n = (v.notes || '').slice(0, 350);
          return (i + 1) + '. [' + d + '] ' + t + (n ? '\n   Notas: ' + n : '');
        }).join('\n');

    const compromisosCtx = propuestasPendientes.length === 0
      ? 'Sin compromisos abiertos.'
      : propuestasPendientes.map(function (p) {
          return '- ' + (p.tipo || 'propuesta') + ': ' + (p.propuesta || '');
        }).join('\n');

    const redCtx = [];
    if (puentes.length) redCtx.push('PRESCRIPTORES PUENTE en ' + province + ' (red para activar): ' + puentes.map(function (s) { return s.name; }).join(', '));
    if (sameQuadrant.length) redCtx.push('Otros clientes del mismo cuadrante Q' + studio.priorityQuadrant + ' en ' + province + ' (referencias): ' + sameQuadrant.slice(0, 5).map(function (s) { return s.name; }).join(', '));
    if (visitadosProvincia.length) redCtx.push('Clientes visitados en ' + province + ' (referencias activas): ' + visitadosProvincia.map(function (s) { return s.name; }).join(', '));
    const redText = redCtx.length ? redCtx.join('\n') : 'Sin red de conexiones destacable en el CRM para esta provincia.';

    const catalogoSugerido = CATALOGO_POR_TIPO[tipoPrincipal] || 'Catálogo GPF: elegir 3-4 productos según el perfil técnico del cliente.';
    const fuentesSugeridas = (FUENTES_SECTORIALES[tipoPrincipal] || []).join(', ');

    /* Fase B: recopilar contexto web ANTES de llamar a Claude.
       Esto suma 10-25s pero garantiza datos verificables con URL. */
    let webContext = '';
    try {
      webContext = await _gatherWebContext(studio);
    } catch (e) {
      console.warn('[redesign/data] _gatherWebContext falló (no bloqueante):', e.message);
    }
    const tieneWeb = !!webContext;

    /* SYSTEM PROMPT — perfil del agente + reglas duras */
    const systemPrompt =
      'Eres el asistente comercial estratégico de Manuel Fernández (Manolo), prescriptor de Grupo Plásticos Ferro (GPF) en Andalucía, Extremadura y Levante. Trabajas bajo la metodología SPIN de Neil Rackham aplicada a prescripción técnica B2B en construcción/agua.\n\n' +
      'MISIÓN: generar un briefing pre-visita ACCIONABLE en formato markdown, siguiendo la estructura del Modo Briefing §19.2 del CRM. NO un informe genérico: un documento de 2-4 páginas que prepare a Manolo para entrar a la visita con un PLAN claro y salir con un ADVANCE concreto.\n\n' +
      'PRODUCTOS GPF (catálogo de referencia):\n' +
      '- MUTE: saneamiento insonorizado PVC tricapa, requisito DB-HR edificación residencial.\n' +
      '- EUME: canalón de aluminio extruido.\n' +
      '- ECOSAN: saneamiento enterrado PVC corrugado.\n' +
      '- CONDUSAN: tubería saneamiento de gran diámetro.\n' +
      '- BIOPIPE PVC-O: tubería a presión orientada (regadío + abastecimiento).\n' +
      '- PE 100: polietileno alta densidad para presión.\n' +
      '- TUYPER: marca hermana, gama conducción.\n\n' +
      'USO DEL CONTEXTO WEB:\n' +
      (tieneWeb
        ? 'El user prompt incluye un bloque "## CONTEXTO WEB RECOPILADO" con fuentes reales (web del cliente, buscador, prensa sectorial). REGLAS PARA USARLO:\n' +
          '- Cualquier CIFRA que cites en la sección 5 (Señales de mercado) DEBE venir de ese bloque, indicando la fuente (nombre o URL).\n' +
          '- Si una señal no la encuentras en el bloque web, NO la inventes. Es mejor decir "sin cifra verificable, comprobar antes de la visita" que inventar un dato.\n' +
          '- Cita la fuente como `(según paginasamarillas.es)`, `(según iAgua)`, `(según noticia del [medio])`, etc.\n' +
          '- Si el bloque web te aporta datos NUEVOS del cliente (proyectos verificados, equipo, premios, web propia), úsalos en la sección 2 (Contexto del cliente) con la misma regla de citación.\n'
        : 'NO se ha recopilado contexto web (fuentes inalcanzables o cliente sin web). REGLA: en la sección 5 (Señales de mercado), si citas cifras concretas, marca explícitamente "estimación orientativa basada en conocimiento sectorial" o "comprobar antes de la visita". Mejor pocos datos verificables que muchos inventados.\n') +
      '\nREGLAS DURAS (cumplir TODAS):\n' +
      REGLAS_IMPLICITAS.map(function (r, i) { return (i + 1) + '. ' + r; }).join('\n') + '\n\n' +
      'FORMATO DE OUTPUT: markdown directo, con headings ## para cada sección. SIN frontmatter YAML. SIN texto antes ni después del markdown. Las secciones DEBEN ser exactamente las 10 listadas en el user prompt, en ese orden.';

    /* USER PROMPT — datos concretos + plantilla */
    const userMsg =
      'Genera el briefing pre-visita para esta visita.\n\n' +
      '## FECHA DE VISITA\n' + fecha + '\n\n' +
      crmCtx + '\n\n' +
      '## HISTÓRICO RECIENTE (últimas 5 entradas)\n' + histCtx + '\n\n' +
      '## COMPROMISOS ABIERTOS\n' + compromisosCtx + '\n\n' +
      '## RED DE CONEXIONES EN EL CRM\n' + redText + '\n\n' +
      (contextoExtra ? '## CONTEXTO EXTRA INDICADO POR MANOLO\n' + contextoExtra + '\n\n' : '') +
      '## ORIENTACIÓN SECTORIAL\n' +
      'Tipo principal: ' + tipoPrincipal + '\n' +
      'Fuentes sectoriales habituales: ' + (fuentesSugeridas || '(no mapeado)') + '\n' +
      'Catálogo GPF sugerido para este tipo:\n' + catalogoSugerido + '\n' +
      webContext + '\n' +
      '---\n\n' +
      'Genera el briefing en MARKDOWN con EXACTAMENTE estas 10 secciones, en este orden:\n\n' +
      '# Briefing pre-visita — ' + studioName + '\n\n' +
      '> (línea de aviso si procede: si la cartera es escasa, decir "perfil reconstruido desde el CRM' +
      (tieneWeb ? ' + búsqueda web del ' + new Date().toISOString().slice(0,10) : '') +
      ', nivel single_source")\n\n' +
      '## 1. Resumen ejecutivo\n' +
      '(3-5 líneas: quién es, dónde está en cartera, por qué se le visita AHORA — específico, no genérico. Si es cliente nuevo, mencionar que el objetivo no es vender sino posicionarse como interlocutor técnico)\n\n' +
      '## 2. Contexto del cliente\n' +
      '(actividad, estructura, proyectos verificados, perfil; bloque al final "lo que NO se sabe y conviene verificar en visita")\n\n' +
      '## 3. Histórico reciente\n' +
      '(' + (esClienteNuevo ? 'declarar explícitamente: PRIMERA VISITA, sin histórico' : 'resumir últimas 3-5 interacciones con fecha + insight') + ')\n\n' +
      '## 4. Compromisos abiertos\n' +
      '(' + (propuestasPendientes.length === 0 ? 'declarar: ninguno por ' + (esClienteNuevo ? 'no haber relación previa' : 'estar al día') : 'listar compromisos con qué/quién/cuándo') + ')\n\n' +
      '## 5. Señales de mercado relevantes\n' +
      '(adjudicaciones públicas recientes y noticias del sector ' + tipoPrincipal + ' en ' + province + '. Cada señal con cifra concreta + fuente. Cerrar con "Lectura para la visita")\n\n' +
      '## 6. Red y conexiones\n' +
      '(prescriptores puente, clientes referenciables en la zona, ecosistema natural donde el cliente opera)\n\n' +
      '## 7. Sugerencia SPIN para esta visita\n' +
      '(apertura breve + Situación 1-2 preguntas + Problema 3-4 preguntas + Implicación 4-6 preguntas + Need-payoff 2-3 preguntas. Particulariza las preguntas al cliente concreto, no plantillas)\n\n' +
      '## 8. Catálogo GPF prioritario para esta visita\n' +
      '(3-4 productos relevantes, NO el catálogo entero. Para cada producto, una línea de POR QUÉ encaja con ESTE cliente)\n\n' +
      '## 9. Cosas a evitar mencionar\n' +
      '(3-5 cosas concretas: origen del descubrimiento, scoring, posicionarse como comercial puro, presionar para cierre, etc.)\n\n' +
      '## 10. Objetivo de advance para esta visita\n' +
      '(2-3 opciones realistas de compromiso entregable + fecha; advertencia sobre continuation; cómo cerrar la reunión sin caer en "ya hablaremos")';

    const raw = await _claudeCall(systemPrompt, userMsg, 8192);

    // El output es markdown directo. Lo limpiamos por si vino con fences.
    const markdown = String(raw)
      .replace(/^```(?:markdown|md)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();

    // Persistir en el backend activo
    const isoDate = new Date().toISOString().replace(/[:.]/g, '-');
    try {
      await _patchDocActive('briefings/' + studioId + '/items/' + isoDate, {
        fecha_visita: fecha,
        generated_at: new Date().toISOString(),
        contexto_extra: contextoExtra || null,
        markdown: markdown,
        formato: 'markdown_v2',
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

    return { success: true, markdown: markdown, persisted: true };
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

  /* ============================================================
     DELETE DOC
     ============================================================ */
  async function _deleteDocFirestore(path) {
    const url = new URL(REST_BASE + '/' + path);
    url.searchParams.set('key', API_KEY);
    const res = await fetch(url, { method: 'DELETE' });
    // 404 = ya no existe, se acepta como éxito
    if (!res.ok && res.status !== 404) {
      const txt = await res.text().catch(function () { return ''; });
      throw new Error('Firestore DELETE ' + res.status + ' ' + res.statusText + ' (' + path + ') ' + txt.slice(0, 200));
    }
    return true;
  }

  function _routeDeleteDoc(path) {
    if (_useSupabase()) return _sb().deleteDoc(path);
    return _deleteDocFirestore(path);
  }

  /* ============================================================
     ENRICH STUDIO — investigación web + IA para rellenar ficha
     Llama a _gatherWebContext y pide a Claude que extraiga datos
     estructurados (contacto, descripción, equipo). Solo sobreescribe
     campos vacíos para no borrar lo que el usuario ya rellenó.
     ============================================================ */
  async function enrichStudio(studioId) {
    const State = window.State;
    const studio = State && State.studiosById && State.studiosById[studioId];
    if (!studio) throw new Error('Studio ' + studioId + ' no encontrado en State');

    let webContext = '';
    try {
      webContext = await _gatherWebContext(studio);
    } catch (e) {
      console.warn('[enrichStudio] _gatherWebContext falló:', e.message);
    }
    if (!webContext || webContext.trim().length < 80) {
      throw new Error('No se encontró información web suficiente sobre "' + (studio.name || studioId) + '"');
    }

    const systemPrompt =
      'Eres un extractor de datos de empresas españolas. ' +
      'A partir del contexto web, extrae los datos de la empresa. ' +
      'Devuelve EXCLUSIVAMENTE un JSON válido (sin markdown, sin texto extra) con esta estructura:\n' +
      '{"city":"","province":"","type":"","description":"","contact":{"address":"","phone":"","email":"","web":""},' +
      '"team":[{"name":"","role":"","phone":"","email":""}]}\n' +
      'Para type usa uno de: Arquitectura, Ingeniería, C.R. Regantes, Ciclo del agua, ' +
      'Promotora · Constructora, Administración pública, Hotel / Hostelería, Hospital, Distribuidor, Otros. ' +
      'Usa cadena vacía "" para campos no encontrados. team puede ser array vacío [].';

    const userMsg =
      'Empresa: ' + (studio.name || '') + '\n' +
      'Ciudad actual: ' + (_val(studio.city) || '—') + '\n' +
      'Provincia actual: ' + (_val(studio.province) || '—') + '\n\n' +
      'Contexto web:\n' + webContext.slice(0, 4500);

    const raw = await _claudeCall(systemPrompt, userMsg, 1024);

    let parsed;
    try {
      const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const s = cleaned.indexOf('{');
      const e = cleaned.lastIndexOf('}');
      parsed = JSON.parse(s >= 0 && e > s ? cleaned.slice(s, e + 1) : cleaned);
    } catch (_) {
      throw new Error('La IA no devolvió JSON válido. Respuesta: ' + raw.slice(0, 120));
    }

    // Solo actualizar campos que el studio NO tiene ya rellenos
    const patch = {};
    const _empty = function (v) { return !v || (typeof v === 'string' && !v.trim()) || (typeof v === 'object' && !_val(v)); };

    if (parsed.city     && _empty(studio.city))     patch.city     = parsed.city;
    if (parsed.province && _empty(studio.province)) patch.province = parsed.province;
    if (parsed.type     && _empty(studio.type))     patch.type     = parsed.type;

    const ctcOrig = (studio.data && studio.data.contact) ? Object.assign({}, studio.data.contact) : {};
    const ctcNew  = parsed.contact || {};
    let ctcChanged = false;
    ['address', 'phone', 'email', 'web'].forEach(function (k) {
      if (ctcNew[k] && _empty(ctcOrig[k])) { ctcOrig[k] = ctcNew[k]; ctcChanged = true; }
    });
    if (ctcChanged) patch['data.contact'] = ctcOrig;

    if (parsed.description && _empty(studio.data && studio.data.description)) {
      patch['data.description'] = parsed.description;
    }
    if (Array.isArray(parsed.team) && parsed.team.length > 0) {
      const teamOrig = (studio.data && studio.data.team) || [];
      if (!teamOrig.length) {
        patch['data.team'] = parsed.team.filter(function (t) { return t && t.name; });
      }
    }

    if (Object.keys(patch).length === 0) {
      return { fieldsUpdated: 0, message: 'Ya tenía todos los datos; no se sobrescribió nada.' };
    }

    await _routePatchDoc('studios/' + studioId, patch);
    Object.assign(State.studiosById[studioId], patch);

    return { fieldsUpdated: Object.keys(patch).length, patch: patch };
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
     BACKEND SWITCH (migración Supabase consolidada 2026-05-25)
     ============================================================
     Default: 'supabase'. Firestore queda como fallback opcional:
       localStorage.setItem('redesign:backend','firebase'); location.reload()
     vuelve al comportamiento legacy.

     Si window.DataSupabase no está cargado por cualquier motivo,
     _useSupabase() devuelve false y caemos a Firestore automáticamente. */
  const DEFAULT_BACKEND = 'supabase';
  function _activeBackend() {
    try { return localStorage.getItem('redesign:backend') || DEFAULT_BACKEND; }
    catch (_) { return DEFAULT_BACKEND; }
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
    deleteDoc: _routeDeleteDoc,
    enrichStudio: enrichStudio,
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
