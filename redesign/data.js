/* CRM Prospector · rediseño v1 — Capa de datos de alto nivel (window.Data)
 *
 * Backend: Supabase (única fuente de verdad desde 2026-06). El acceso a datos
 * se delega en window.DataSupabase (data-supabase.js); este módulo enruta y
 * añade la lógica de negocio (informes, briefings, enriquecimiento). El cliente
 * REST de Firestore se eliminó: Firestore quedó bloqueado al cerrar la RLS/auth.
 * Se mantiene además el proxy al GAS Web App (Claude/Anthropic + Calendar).
 *
 * Expone:
 *   window.Data.loadAll()        — carga studios + planificador en State
 *   window.Data.getDoc(path)     — un único documento (→ Supabase)
 *   window.Data.listCollection(name, opts) — lista paginada (→ Supabase)
 *   window.Data.patchDoc(path, obj) — UPSERT documento (→ Supabase)
 *   window.Data.callGAS(action, params)    — proxy genérico al GAS Web App
 *   window.Data.generateBriefing(studioId, fecha, contextoExtra)
 *   window.Data.generateReport(studioId, payload)
 *   window.Data.getBriefingItems(studioId, limit)
 *   window.Data.savePlanificador(schedule) — persiste meta_planificador
 *
 * Convenciones:
 *   - Todo el acceso a Supabase pasa por window.DataSupabase (REST/PostgREST
 *     con Bearer de Supabase Auth, ver auth.js).
 *   - GAS URL es la misma del CRM actual. Si se redeploya, hay que
 *     actualizar aquí también.
 */
(function () {
  'use strict';

  /* ============================================================
     CONFIG (extraída del index.html actual)
     ============================================================ */
  const GAS_URL = 'https://script.google.com/macros/s/AKfycbxx6KIUavnMAVn3eUtX4SKMoVAnOQ3YAsIYofiMufkw6tkbQDaG3-jDku_Z8kEsNY_6aQ/exec';

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
      return await _sb().getBriefingItems(studioId, limit);
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
    return await _sb().getDoc('studios/' + studioId);
  }
  /* Helper: patch que respeta el backend activo. Lo usan las funciones de
     alto nivel (generateBriefing, generateReport, savePlanificador, …) */
  async function _patchDocActive(path, obj) {
    return _sb().patchDoc(path, obj);
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
      model: 'claude-sonnet-4-6',
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
  /* Proxies CORS por orden de preferencia.
     allorigins.win dejó de funcionar ~2026-05-26 (HTTP 500).
     corsproxy.io devuelve HTML raw directamente.
     api.codetabs.com también devuelve HTML raw. */
  var _CORS_PROXIES = [
    function (u) { return 'https://corsproxy.io/?' + encodeURIComponent(u); },
    function (u) { return 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u); },
  ];

  function _stripHtml(html) {
    html = html.replace(/<(script|style|nav|footer|header|aside|form|button)[\s\S]*?<\/\1>/gi, ' ');
    html = html.replace(/<[^>]+>/g, ' ');
    html = html.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    return html.replace(/\s+/g, ' ').trim();
  }

  async function _fetchTextoWeb(url, maxChars, timeoutMs) {
    maxChars = maxChars || 2000;
    timeoutMs = timeoutMs || 9000;
    for (var pi = 0; pi < _CORS_PROXIES.length; pi++) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(function () { ctrl.abort(); }, timeoutMs);
        const r = await fetch(_CORS_PROXIES[pi](url), { signal: ctrl.signal });
        clearTimeout(t);
        if (!r.ok) continue;
        const raw = await r.text();
        // corsproxy y codetabs devuelven HTML directo (no JSON wrapper)
        const html = _stripHtml(raw);
        if (html.length > 50) return html.substring(0, maxChars);
      } catch (_) { /* intentar siguiente proxy */ }
    }
    return '';
  }

  /* Jina.ai reader — renderiza JavaScript/React/Vue y devuelve markdown.
     No requiere CORS proxy (Jina lo gestiona). Gratuito y sin auth.
     Ideal para páginas SPA que devuelven sólo el shell HTML con los proxies
     normales. El timeout es mayor porque Jina renderiza el JS en servidor. */
  async function _fetchTextoJina(url, maxChars, timeoutMs) {
    maxChars = maxChars || 3500;
    timeoutMs = timeoutMs || 13000;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(function () { ctrl.abort(); }, timeoutMs);
      const r = await fetch('https://r.jina.ai/' + url, {
        signal: ctrl.signal,
        headers: { 'Accept': 'text/plain' },
      });
      clearTimeout(t);
      if (!r.ok) return '';
      const text = await r.text();
      // Jina añade cabeceras informativas al principio — limpiarlas
      const clean = text
        .replace(/^Title:.*\n?/gm, '')
        .replace(/^URL Source:.*\n?/gm, '')
        .replace(/^Markdown Content:\s*\n?/gm, '')
        .replace(/^Published Time:.*\n?/gm, '')
        .trim();
      return clean.length > 100 ? clean.substring(0, maxChars) : '';
    } catch (_) { return ''; }
  }

  /* Extrae emails y teléfonos españoles de un texto plano. */
  function _extractEmails(text) {
    var found = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || [];
    return Array.from(new Set(found)).filter(function (e) {
      return !/(example\.|wixpress|sentry|adobe|schema\.org|w3\.org|openxmlformats)/i.test(e);
    }).slice(0, 6);
  }
  function _extractPhones(text) {
    var found = text.match(/(?:\+34[\s.\-]?)?(?:[679]\d{2}[\s.\-]?\d{3}[\s.\-]?\d{3})/g) || [];
    return Array.from(new Set(found.map(function (p) { return p.replace(/[\s.\-]/g, ''); }))).slice(0, 5);
  }

  /* Escaneo multi-página de la web del cliente: además de la portada
     intenta obtener la página de contacto, el "sobre nosotros" y el equipo.
     Devuelve { text, emails, phones } con todo combinado, o null si no hay URL. */
  async function _deepScanWeb(baseUrl) {
    var origin;
    try { origin = new URL(baseUrl).origin; } catch (_) { return null; }

    var subpages = [
      // contacto
      { label: 'contacto', path: '/contacto' },
      { label: 'contacto', path: '/contact' },
      { label: 'contacto', path: '/contactanos' },
      { label: 'contacto', path: '/donde-estamos' },
      { label: 'contacto', path: '/info' },
      { label: 'contacto', path: '/aviso-legal' },
      // sobre nosotros / estudio
      { label: 'about', path: '/sobre-nosotros' },
      { label: 'about', path: '/estudio' },
      { label: 'about', path: '/quienes-somos' },
      { label: 'about', path: '/about' },
      { label: 'about', path: '/la-firma' },
      { label: 'about', path: '/nosotros' },
      { label: 'about', path: '/empresa' },
      // equipo
      { label: 'equipo', path: '/equipo' },
      { label: 'equipo', path: '/team' },
      { label: 'equipo', path: '/socios' },
      { label: 'equipo', path: '/profesionales' },
      { label: 'equipo', path: '/nuestro-equipo' },
    ];

    // Grupo A: portada + subpáginas con proxies CORS estándar (HTML)
    var standardTasks = [
      _fetchTextoWeb(baseUrl, 2500, 9000).then(function (t) {
        return t.length > 80 ? { label: 'portada', text: t } : null;
      })
    ].concat(subpages.map(function (sp) {
      return _fetchTextoWeb(origin + sp.path, 1800, 6000).then(function (t) {
        return t.length > 100 ? { label: sp.label, text: t } : null;
      });
    }));

    // Grupo B: Jina.ai — renderiza JS en servidor, ideal para SPAs.
    // Corre en paralelo con el grupo A para no añadir latencia en HTML estático.
    // Si la portada tiene contenido, extrae links de contacto y los fetchea también.
    var jinaTask = _fetchTextoJina(baseUrl, 4000, 13000).then(async function (jinaText) {
      var jinaPages = [];
      if (!jinaText || jinaText.length < 200) return jinaPages;
      jinaPages.push({ label: 'portada-jina', text: jinaText });
      // Extraer hrefs del markdown renderizado que parezcan páginas de contacto
      var re = /\]\(((?:https?:\/\/[^\)\s<]+|\/[^\)\s<]+))\)/g;
      var m;
      var contactUrls = [];
      var hrefSeen = {};
      while ((m = re.exec(jinaText)) !== null) {
        var href = m[1];
        if (/contact|contacto|donde|aviso-legal|info\b/i.test(href) && !hrefSeen[href]) {
          hrefSeen[href] = true;
          if (href.charAt(0) === '/') href = origin + href;
          if (/^https?:\/\//.test(href)) contactUrls.push(href);
        }
      }
      // Fetch hasta 1 página de contacto vía Jina (la primera que encontremos)
      if (contactUrls.length) {
        var ctcText = await _fetchTextoJina(contactUrls[0], 3000, 10000);
        if (ctcText.length > 200) jinaPages.push({ label: 'contacto-jina', text: ctcText });
      }
      return jinaPages;
    });

    // Esperar ambos grupos en paralelo
    var settled, jinaResults;
    try {
      var both = await Promise.all([Promise.allSettled(standardTasks), jinaTask]);
      settled    = both[0];
      jinaResults = both[1];
    } catch (_) {
      settled    = await Promise.allSettled(standardTasks);
      jinaResults = [];
    }

    var pages = [];
    settled.forEach(function (r) { if (r.status === 'fulfilled' && r.value) pages.push(r.value); });
    (jinaResults || []).forEach(function (p) { if (p) pages.push(p); });
    if (!pages.length) return null;

    // Consolidar: sólo la primera página que devuelva algo por sección
    var seen = {};
    var uniq = [];
    pages.forEach(function (p) {
      if (!seen[p.label]) { seen[p.label] = true; uniq.push(p); }
    });

    var combined = uniq.map(function (p) {
      return '=== ' + p.label.toUpperCase() + ' ===\n' + p.text;
    }).join('\n\n');

    return {
      text: combined,
      emails: _extractEmails(combined),
      phones: _extractPhones(combined),
      pageCount: uniq.length,
    };
  }

  /* Consulta Nominatim (OpenStreetMap) para obtener dirección postal
     estructurada de una entidad. Gratuito, CORS nativo, sin proxy.
     Retorna string con los datos formateados para Claude, o '' si no hay. */
  async function _queryNominatim(name, city, province) {
    async function _nominatimFetch(q) {
      var ctrl = new AbortController();
      var t = setTimeout(function () { ctrl.abort(); }, 6000);
      try {
        var r = await fetch(
          'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(q) +
          '&format=json&addressdetails=1&limit=3&countrycodes=es',
          { signal: ctrl.signal, headers: { 'Accept-Language': 'es', 'User-Agent': 'CRM-Prospector/1.0' } }
        );
        clearTimeout(t);
        if (!r.ok) return [];
        var results = await r.json();
        return Array.isArray(results) ? results : [];
      } catch (_) { clearTimeout(t); return []; }
    }

    try {
      // Query primaria: nombre completo + ciudad + provincia
      var q1 = name + (city ? ' ' + city : '') + (province ? ' ' + province : '') + ' España';
      var results = await _nominatimFetch(q1);

      // Fallback: si no hay resultados, intentar con tipo genérico + municipio.
      // Útil cuando el nombre del studio tiene typos (ej: "Ayutamiento" → "Ayuntamiento")
      if (!results.length && city) {
        // Detectar tipo de entidad pública por palabras clave en el nombre
        var nameLower = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        var tipoEntidad = '';
        if (/ayun?tamiento|ayto\.?/i.test(nameLower)) tipoEntidad = 'Ayuntamiento';
        else if (/diputacion|diputació/i.test(nameLower))  tipoEntidad = 'Diputación';
        else if (/mancomunidad/i.test(nameLower))          tipoEntidad = 'Mancomunidad';
        else if (/consorcio/i.test(nameLower))             tipoEntidad = 'Consorcio';
        if (tipoEntidad) {
          var q2 = tipoEntidad + ' ' + city + (province ? ' ' + province : '') + ' España';
          results = await _nominatimFetch(q2);
        }
      }

      if (!results.length) return '';
      // Tomar el primer resultado relevante (preferir amenity=townhall, offices, etc.)
      var best = results.find(function (res) {
        var t = (res.type || '').toLowerCase();
        return t === 'townhall' || t === 'administrative' || t === 'office' || t === 'government';
      }) || results[0];
      var addr = best.address || {};
      var parts = [];
      if (addr.road) parts.push(addr.road + (addr.house_number ? ' ' + addr.house_number : ''));
      if (addr.postcode) parts.push('CP ' + addr.postcode);
      if (addr.village || addr.town || addr.city) parts.push(addr.village || addr.town || addr.city);
      if (addr.province || addr.state) parts.push(addr.province || addr.state);
      if (!parts.length) return '';
      return 'DIRECCIÓN (OpenStreetMap): ' + parts.join(', ') +
             '\nNOMBRE OSM: ' + (best.display_name || '').split(',')[0] +
             '\nCOORDENADAS: ' + best.lat + ',' + best.lon;
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

  /* Recopila contexto web. Para briefings y para enrichStudio.
     Estrategia combinada:
       A) Si hay URL → deep scan multi-página (portada + contacto + about + equipo)
       B) DuckDuckGo general + contacto específico
       C) Páginas Amarillas
       D) Búsquedas sectoriales (si tipo + provincia conocidos)
     Devuelve string markdown listo para inyectar en Claude, o '' si vacío. */
  async function _gatherWebContext(studio) {
    const startTs = Date.now();
    const sources = [];
    const studioName = studio.name || '';
    const province = _val(studio.province) || '';
    const city = _val(studio.city) || '';
    const types = Array.isArray(studio.type) ? studio.type : [studio.type || ''];
    const tipo = types[0];
    const contact = (studio.data && studio.data.contact) || {};
    // Buscar URL de web en varias ubicaciones posibles (data.contact.web, studio.web, studio._data.contact.web)
    const webUrl = _val(contact.web) || _val(studio.web) ||
      (studio._data && studio._data.contact && _val(studio._data.contact.web)) || '';

    const tasks = [];

    // A. Deep scan multi-página del sitio del cliente
    if (webUrl && /^https?:\/\//i.test(webUrl)) {
      tasks.push(
        _deepScanWeb(webUrl).then(function (scan) {
          if (!scan) return null;
          var header = '### Web cliente (' + scan.pageCount + ' páginas) · ' + webUrl;
          var meta = '';
          if (scan.emails.length) meta += '\nEMAILS ENCONTRADOS: ' + scan.emails.join(' | ');
          if (scan.phones.length) meta += '\nTELÉFONOS ENCONTRADOS: ' + scan.phones.join(' | ');
          return { label: 'Web cliente · ' + webUrl, text: (meta ? meta + '\n\n' : '') + scan.text };
        })
      );
    }

    // B1. DuckDuckGo general
    const qCliente = studioName + (city ? ' ' + city : '') + (province ? ' ' + province : '');
    tasks.push(
      _searchDuckDuckGo(qCliente).then(function (t) {
        return t ? { label: 'Buscador general · ' + qCliente, text: t } : null;
      })
    );

    // B2. DuckDuckGo específico de contacto (teléfono / email)
    const qContacto = '"' + studioName + '" ' + (province || city) + ' teléfono email contacto';
    tasks.push(
      _searchDuckDuckGo(qContacto).then(function (t) {
        return t ? { label: 'Buscador contacto · ' + studioName, text: t } : null;
      })
    );

    // B3. Nominatim (OpenStreetMap) — dirección postal estructurada.
    // Especialmente útil para ayuntamientos, hospitales, entidades públicas
    // cuyas webs son SPAs que no se pueden scrappear.
    tasks.push(
      _queryNominatim(studioName, city, province).then(function (t) {
        return t ? { label: 'OpenStreetMap · ' + studioName, text: t } : null;
      })
    );

    // C. Páginas Amarillas
    const normalSlug = studioName.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9\s]/g, '').trim();
    if (normalSlug.length > 3) {
      tasks.push(
        _fetchTextoWeb('https://www.paginasamarillas.es/search/' + encodeURIComponent(normalSlug) + '/all-spain/', 1800, 7000)
          .then(function (t) {
            if (t.length < 100) return null;
            var emails = _extractEmails(t);
            var phones = _extractPhones(t);
            var meta = '';
            if (emails.length) meta += 'EMAILS PA: ' + emails.join(' | ') + '\n';
            if (phones.length) meta += 'TELÉFONOS PA: ' + phones.join(' | ') + '\n';
            return { label: 'Páginas Amarillas', text: (meta || '') + t };
          })
      );
    }

    // D. Búsquedas sectoriales según tipo + provincia
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

    // Timeout global 35s (deep scan puede tardar si hay muchas subpáginas)
    const results = await Promise.race([
      Promise.all(tasks),
      new Promise(function (resolve) { setTimeout(function () { resolve([]); }, 35000); }),
    ]);

    (results || []).forEach(function (r) { if (r) sources.push(r); });

    if (!sources.length) return '';

    const duration = ((Date.now() - startTs) / 1000).toFixed(1);
    console.info('[redesign/data] contexto web recopilado · ' + sources.length + ' fuentes · ' + duration + 's');

    return '\n## CONTEXTO WEB (' + new Date().toISOString().slice(0, 10) + ')\n\n' +
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

  /* Matriz cruzada cargo × tipo de empresa — se superpone a CATALOGO_POR_TIPO */
  const CARGOS_POR_TIPO = {
    ARQ: {
      default: 'arquitecto',
      perfiles: {
        arquitecto: {
          alias: 'Arquitecto firmante / responsable de proyecto',
          prioritarios: ['MUTE', 'EUME', 'PVC presión', 'PE multilayer'],
          evitar: ['BIOPIPE PVC-O', 'ecoSAN', 'CONDUSAN', 'PE 100 obra civil'],
          angulo: 'Acústica DB-HR, DAP y BIM compatibles con Revit/Archicad, fichas estéticas para defender ante cliente final, soluciones para rehabilitación.',
          discovery_clave: [
            'Tipología de proyectos: residencial / hotelero / terciario.',
            'Volumen de proyectos al año.',
            'Si tienen proveedor de referencia para drenaje y canalones.',
            'Quién decide marca: arquitecto firmante o constructora.',
          ],
        },
        'jefe-de-estudio': {
          alias: 'Jefe de estudio / socio del despacho',
          prioritarios: ['MUTE', 'EUME', 'PVC presión'],
          evitar: ['BIOPIPE PVC-O', 'ecoSAN', 'CONDUSAN'],
          angulo: 'Capacidad técnica del proveedor, soporte BIM, casos de referencia con otros estudios premium. Eficiencia operativa: menos consultas al fabricante por obra.',
          discovery_clave: [
            'Estructura del despacho y reparto de roles entre arquitectos.',
            'Marca de tubería estándar en pliegos actuales.',
            'Tiempo medio que dedican a especificación técnica.',
          ],
        },
        'director-tecnico-estudio': {
          alias: 'Director técnico de estudio',
          prioritarios: ['MUTE', 'EUME', 'PVC presión', 'PE multilayer'],
          evitar: ['BIOPIPE PVC-O', 'ecoSAN', 'CONDUSAN'],
          angulo: 'Resolver dolores técnicos concretos: acústica en plurifamiliar, rehabilitación en cascos históricos, integración BIM real (IFC validado).',
          discovery_clave: [
            'Última obra con problema de acústica reportado por usuario final.',
            'Cómo gestionan modificaciones de proyecto en obra.',
            'Compatibilidad de la biblioteca BIM actual con su software.',
          ],
        },
      },
    },
    ING: {
      default: 'ingeniero-civil',
      perfiles: {
        'ingeniero-agronomico': {
          alias: 'Ingeniero agronómico — proyectos de regadío',
          prioritarios: ['BIOPIPE PVC-O', 'PE 100', 'PVC presión'],
          evitar: ['MUTE', 'EUME', 'CONDUSAN drenaje urbano'],
          angulo: 'Fichas BC3/Presto/CIP listas, BIM/IFC, casos GPF en comunidades de regantes andaluzas, soporte de cálculo en redacción, invitación a fábrica de Atarfe.',
          discovery_clave: [
            'Reparto España / Portugal en cartera.',
            'Si dejan pliego abierto o cierran marca de referencia.',
            'Proveedor de tubería estándar hoy.',
            'Si tienen proyectos PERTE activos.',
          ],
        },
        'ingeniero-civil': {
          alias: 'Ingeniero de caminos / civil',
          prioritarios: ['ecoSAN', 'CONDUSAN', 'PE 100', 'BIOPIPE PVC-O', 'PVC presión'],
          evitar: ['MUTE', 'EUME'],
          angulo: 'Comparativos técnicos verificados frente a Molecor/Adequa, fichas listas para memoria, certificación AENOR de reciclado en ecoSAN, BIM/IFC.',
          discovery_clave: [
            'Tipos de proyecto en cartera (saneamiento principal, secundario, abastecimiento).',
            'Si reciben pliegos con marca cerrada o abierta.',
            'Histórico de incidencias por tubería en obras recientes.',
          ],
        },
        'ingeniero-industrial': {
          alias: 'Ingeniero industrial',
          prioritarios: ['PE 100', 'PVC presión', 'MUTE'],
          evitar: ['BIOPIPE riego', 'ecoSAN', 'CONDUSAN'],
          angulo: 'Especificación técnica, resistencia química y a temperatura, cálculo de dilataciones, MUTE solo si la planta tiene zona de oficinas.',
          discovery_clave: [
            'Tipo de procesos de la planta (químico, alimentario, energético).',
            'Marca de tubería actual y motivo de elección.',
            'Tiempo de parada admisible por avería.',
          ],
        },
        proyectista: {
          alias: 'Proyectista / técnico redactor',
          prioritarios: ['Depende de la especialidad del estudio'],
          evitar: ['Catálogo completo a la primera'],
          angulo: 'Soporte técnico ágil, fichas en su formato (BC3/Presto/CIP), capacidad de respuesta en redacción de pliegos.',
          discovery_clave: [
            'Especialidad real del estudio (agronómico / civil / industrial).',
            'Cómo gestionan modificados en obra.',
            'Si delegan especificación de marca al cliente final.',
          ],
        },
        'jefe-de-proyecto': {
          alias: 'Jefe de proyecto en ingeniería',
          prioritarios: ['Catálogo según especialidad del estudio'],
          evitar: ['Argumentación puramente técnica si no hay tiempo'],
          angulo: 'Rentabilidad, plazo, riesgo. Plazos de entrega garantizados (planta Atarfe / Chilches), soporte en obra ante incidencias, banco precios CIP actualizado.',
          discovery_clave: [
            'Volumen de obra al año.',
            'Margen objetivo en obras tipo.',
            'Penalizaciones SLA típicas en sus contratos.',
          ],
        },
        'director-tecnico': {
          alias: 'Director técnico de ingeniería',
          prioritarios: ['Catálogo según especialidad del estudio'],
          evitar: [],
          angulo: 'Estabilidad del proveedor, capacidad de soporte a su equipo de proyectistas, valor añadido en candidaturas PERTE y europeas.',
          discovery_clave: [
            'Estructura del equipo técnico bajo su mando.',
            'Cómo decide la marca de tubería en sus pliegos.',
            'Si tienen acuerdos marco con fabricantes.',
          ],
        },
      },
    },
    CCRR: {
      default: 'gerente',
      perfiles: {
        gerente: {
          alias: 'Gerente de Comunidad de Regantes',
          prioritarios: ['BIOPIPE PVC-O', 'PE 100', 'PVC presión'],
          evitar: ['MUTE', 'EUME', 'CONDUSAN drenaje urbano'],
          angulo: 'Fiabilidad operativa (sin averías en campaña), fondos PERTE Digitalización del Ciclo del Agua, sostenibilidad, casos GPF en CRs cercanas (efecto red comarcal).',
          discovery_clave: [
            'Hectáreas regadas y tipo de cultivo.',
            'Estado de modernización (red existente vs. nueva).',
            'Si están en candidatura PERTE.',
            'Frecuencia de averías en redes actuales.',
            'Quién decide marca: gerencia, técnico interno o ingeniería externa.',
          ],
        },
        presidente: {
          alias: 'Presidente de la Junta',
          prioritarios: ['BIOPIPE PVC-O', 'PE 100'],
          evitar: ['Detalles técnicos demasiado profundos'],
          angulo: 'Visión institucional: empleo local andaluz, garantía con organismos públicos, comparativas frente a otras CRs ya modernizadas.',
          discovery_clave: [
            'Composición de la junta y peso del presidente en decisión técnica.',
            'Estado de relación con la ingeniería externa contratada.',
            'Prioridades estratégicas declaradas en la junta.',
          ],
        },
        'tecnico-externo': {
          alias: 'Técnico/ingeniero externo contratado por la CR',
          prioritarios: ['BIOPIPE PVC-O', 'PE 100', 'PVC presión'],
          evitar: ['MUTE', 'EUME'],
          angulo: 'Funciona como ingeniero del subcaso ING: BC3/Presto/CIP, BIM/IFC, soporte de cálculo, fábrica Atarfe. Es el que firma el pliego.',
          discovery_clave: [
            'Si trabaja para varias CRs o solo para esta.',
            'Marca de tubería habitual en sus pliegos.',
            'Si reabre comparativas o cierra siempre la misma referencia.',
          ],
        },
        guarda: {
          alias: 'Guarda / responsable operativo de la CR',
          prioritarios: ['Ninguno directamente — es alianza operativa'],
          evitar: ['Todo el catálogo: no decide'],
          angulo: 'Información operativa: dónde se rompe la red, qué tramos preocupan, qué demanda el regante. Aliado clave para entender el problema real.',
          discovery_clave: [
            'Tramos de red que dan más problemas operativos.',
            'Quejas recurrentes de los comuneros.',
            'Quién toma decisiones cuando hay una rotura.',
          ],
        },
      },
    },
    OCV: {
      default: 'jefe-de-obra',
      perfiles: {
        'jefe-de-obra': {
          alias: 'Jefe de obra en constructora',
          prioritarios: ['Según obra adjudicada: BIOPIPE, ecoSAN, CONDUSAN, PE 100, MUTE'],
          evitar: ['Argumentación puramente técnica sin coste/plazo'],
          angulo: 'Plazo de suministro garantizado, planta cercana (Atarfe / Chilches), soporte en obra ante incidencias, comparativos para sustituir marca prescrita en pliego.',
          discovery_clave: [
            'Obras adjudicadas y plazos pactados.',
            'Incidencias recientes con proveedor de tubería actual.',
            'Penalizaciones por retraso de suministro.',
          ],
        },
        'jefe-de-compras': {
          alias: 'Jefe de compras en constructora',
          prioritarios: ['Catálogo completo según pipeline de obras'],
          evitar: ['Argumentos puramente técnicos sin precio'],
          angulo: 'Comparativos técnicos para sustitución de marca prescrita, condiciones comerciales (volumen, plazo de pago), informe de equivalencia técnica como entregable.',
          discovery_clave: [
            'Frecuencia de necesidad de sustituir marca prescrita.',
            'Volumen anual estimado por familia de producto.',
            'Acuerdos marco vigentes con otros fabricantes.',
          ],
        },
        'director-tecnico': {
          alias: 'Director técnico de constructora',
          prioritarios: ['Catálogo completo según obras tipo'],
          evitar: [],
          angulo: 'Estabilidad del proveedor, capacidad de informes técnicos para defender ante propiedad y dirección facultativa, banco CIP actualizado.',
          discovery_clave: [
            'Tipos de obra dominantes en cartera.',
            'Frecuencia de modificaciones técnicas en obra.',
            'Si reciben pliegos con marca cerrada por defecto.',
          ],
        },
        comercial: {
          alias: 'Comercial / prescriptor interno en constructora',
          prioritarios: ['Material para apoyar su prescripción interna'],
          evitar: ['Saturarle con catálogo'],
          angulo: 'Aliado interno: necesita material liviano para defender la marca frente a su propio equipo técnico.',
          discovery_clave: [
            'Quién decide finalmente la marca en obra: jefe de obra o director técnico.',
            'Qué le pediría como material para defender la opción GPF.',
          ],
        },
      },
    },
    CICA: {
      default: 'tecnico-investigacion',
      perfiles: {
        'tecnico-investigacion': {
          alias: 'Técnico de centro de investigación / universidad',
          prioritarios: ['Ninguno directo — alianza institucional'],
          evitar: ['Hablar como si fueran a comprar'],
          angulo: 'Colaboración técnica: ensayos comparativos, publicaciones, casos de estudio. Relación a medio plazo, no venta.',
          discovery_clave: [
            'Líneas de investigación activas y posibles puntos de encaje.',
            'Convenios vigentes con otros fabricantes.',
            'Disponibilidad para tutorar TFGs o ensayos.',
          ],
        },
        'director-asociacion': {
          alias: 'Director de asociación sectorial (FERAGUA, COA, CIAC...)',
          prioritarios: ['Catálogo según foco de la asociación'],
          evitar: ['Venta directa'],
          angulo: 'Eventos sectoriales conjuntos, ponencias técnicas, presencia en publicaciones de la asociación, acceso a sus asociados como red de prescripción.',
          discovery_clave: [
            'Calendario de eventos del año.',
            'Qué fabricantes patrocinan habitualmente.',
            'Composición y peso de sus asociados en la zona.',
          ],
        },
      },
    },
    AAPP: {
      default: 'tecnico-municipal',
      perfiles: {
        'tecnico-municipal': {
          alias: 'Técnico municipal',
          prioritarios: ['PE 100', 'ecoSAN', 'CONDUSAN', 'BIOPIPE PVC-O si riego municipal'],
          evitar: ['MUTE', 'EUME'],
          angulo: 'Fabricante andaluz (empleo local pesa muchísimo en municipios rurales), fondos PERTE Ciclo del Agua, criterios sostenibles (DAP, AENOR reciclado), casos de referencia en administraciones cercanas.',
          discovery_clave: [
            'Tamaño del municipio y estado de la red.',
            'Si están en candidatura PERTE o tienen fondos asignados.',
            'Quién redacta los proyectos (técnico propio o ingeniería externa).',
            'Si están en zona protegida (Parque Natural, etc.).',
          ],
        },
        'ingeniero-diputacion': {
          alias: 'Ingeniero de Diputación / Mancomunidad',
          prioritarios: ['PE 100', 'ecoSAN', 'CONDUSAN'],
          evitar: ['MUTE', 'EUME'],
          angulo: 'Estandarización por cuenca, criterios técnicos uniformes para múltiples municipios, soporte para pliegos modelo.',
          discovery_clave: [
            'Municipios bajo su ámbito.',
            'Pliegos modelo que mantienen y marcas que listan.',
            'Próximas convocatorias de obra hidráulica.',
          ],
        },
        'alcalde-concejal': {
          alias: 'Alcalde / Concejal de Obras',
          prioritarios: ['Visión: empleo local + sostenibilidad + fondos europeos'],
          evitar: ['Detalle técnico profundo'],
          angulo: 'Mensaje político: empleo andaluz, sostenibilidad demostrable, alineación con fondos europeos, casos de éxito en otros municipios.',
          discovery_clave: [
            'Prioridades de mandato declaradas.',
            'Relación con la Diputación / Mancomunidad provincial.',
            'Pliegos en marcha que dependen de su firma.',
          ],
        },
        secretario: {
          alias: 'Secretario municipal',
          prioritarios: ['Ninguno — es el filtro normativo'],
          evitar: ['Argumentos políticos o comerciales'],
          angulo: 'Cumplimiento normativo: validez de pliegos, documentación técnica para auditorías, AENOR, DAP, garantías legales del fabricante.',
          discovery_clave: [
            'Última auditoría municipal y hallazgos.',
            'Criterios de evaluación que aplican en concursos.',
          ],
        },
      },
    },
  };

  /**
   * Devuelve el perfil de cargo cruzado con tipo de empresa.
   * Si el cargo exacto no existe, cae al perfil default del tipo.
   * @param {string} type - Tipo de empresa (ARQ, ING, CCRR, OCV, CICA, AAPP).
   * @param {string} cargo - Cargo del interlocutor (ej: 'ingeniero-agronomico').
   * @returns {Object|null} Perfil de cargo o null si el tipo no está mapeado.
   */
  function getCargoOverlay(type, cargo) {
    var block = CARGOS_POR_TIPO[type];
    if (!block) return null;
    var perfil = block.perfiles[cargo] || block.perfiles[block.default];
    return perfil || null;
  }

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

  /**
   * Genera un briefing pre-visita con IA para el studio indicado.
   * @param {string} studioId - ID del studio en la base de datos.
   * @param {string} fechaISO - Fecha de la visita en formato YYYY-MM-DD.
   * @param {Object} opts - Opciones.
   * @param {string} opts.cargoInterlocutor - Cargo del interlocutor previsto (ej: 'ingeniero-agronomico').
   * @param {string} opts.tipoVisita - Tipo de visita: 'primera-frio' | 'primera-con-cita' | 'seguimiento' |
   *   'presentacion-producto' | 'visita-tecnica-proyecto' | 'post-licitacion'.
   * @param {string} [opts.contextoExtra] - Contexto adicional opcional indicado por Manolo.
   */
  async function generateBriefing(studioId, fechaISO, opts) {
    opts = opts || {};
    var cargoInterlocutor = opts.cargoInterlocutor;
    var tipoVisita = opts.tipoVisita;
    var contextoExtra = opts.contextoExtra || '';
    if (!cargoInterlocutor || !tipoVisita) throw new Error('cargoInterlocutor y tipoVisita son obligatorios');

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
    const team = (studio.data && studio.data.team) || [];
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

    // Alerta PLACSP
    const tieneAlertaPlacsp = !!(studio.data && studio.data.tieneAlertaPlacsp);
    const adjPlacsp = (studio.data && studio.data.ultima_adjudicacion_placsp) || null;

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
      tieneAlertaPlacsp && adjPlacsp ? 'ALERTA PLACSP: adjudicación reciente — "' + (adjPlacsp.titulo || '') + '" por ' + (adjPlacsp.organismo || '') + ', importe ' + (adjPlacsp.importe || 'n/d') + ', fecha ' + (adjPlacsp.fecha || '') : null,
      team.length ? 'Equipo conocido: ' + team.map(function (m) { return m.name + (m.role ? ' (' + m.role + ')' : '') + (m.isDecisionMaker ? ' ⭐' : ''); }).join(', ') : null,
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

    // Overlay de cargo
    const overlay = getCargoOverlay(tipoPrincipal, cargoInterlocutor);
    const overlayBlock = overlay
      ? '## MATRIZ CRUZADA — ' + tipoPrincipal + ' × ' + cargoInterlocutor + '\n' +
        '**Alias del perfil**: ' + overlay.alias + '\n' +
        '**Productos prioritarios**: ' + overlay.prioritarios.join(', ') + '\n' +
        '**Productos a evitar mencionar**: ' + (overlay.evitar.length ? overlay.evitar.join(', ') : 'ninguno específico') + '\n' +
        '**Ángulo argumental**: ' + overlay.angulo + '\n' +
        '**Discovery clave**:\n' + overlay.discovery_clave.map(function (q, i) { return (i + 1) + '. ' + q; }).join('\n') + '\n'
      : '## MATRIZ CRUZADA\nPerfil (' + tipoPrincipal + ' × ' + cargoInterlocutor + ') no contemplado en CARGOS_POR_TIPO. Usar CATALOGO_POR_TIPO base y marcar en sección 4: "Perfil no mapeado en matriz; usando catálogo general de ' + tipoPrincipal + '".\n';

    /* Fase B: recopilar contexto web ANTES de llamar a Claude. */
    let webContext = '';
    try {
      webContext = await _gatherWebContext(studio);
    } catch (e) {
      console.warn('[redesign/data] _gatherWebContext falló (no bloqueante):', e.message);
    }
    const tieneWeb = !!webContext;

    /* SYSTEM PROMPT v2 — rol, metodología y reglas. Sin plantilla: la plantilla va en el user message
       para evitar que Claude devuelva los placeholders literalmente. */
    const systemPrompt =
      'Eres un coach comercial sénior especializado en venta por prescripción de materiales de construcción e infraestructura en España. Asesoras a Manolo Fernández, prescriptor de GPF (Grupo Plásticos Ferro) zona sur. Su rol NO es vender directamente sino lograr que los productos GPF (marcas Tuyper, Ferroplast, BIOPIPE PVC-O) se incorporen a las memorias de proyecto antes de que salgan a concurso.\n\n' +
      'Recibes datos estructurados del CRM y una MATRIZ DE PRESCRIPCIÓN CRUZADA por tipo de empresa × cargo del interlocutor. Produces un BRIEFING OPERATIVO listo para que Manolo lo lea en el coche antes de entrar al cliente.\n\n' +
      '## Metodología\n\n' +
      '- **SPIN Selling (Rackham)**: mix orientativo en 30 min → 1-2 Situación, 3-4 Problema, 4-6 Implicación, 2-3 Need-payoff. Minimizar Situación porque lo que se puede investigar se investiga antes.\n' +
      '- **Advance vs Continuation**: el objetivo de cada visita es un Advance concreto (entregable + fecha), nunca una Continuation disfrazada de éxito.\n' +
      '- **Tono**: directo, sin adulación, sin relleno motivacional. Si la visita no tiene valor real, dilo. Cero "interesante oportunidad".\n\n' +
      '## Productos GPF (referencia)\n\n' +
      '- MUTE: saneamiento insonorizado PVC tricapa, requisito DB-HR.\n' +
      '- EUME: canalón de aluminio extruido.\n' +
      '- ecoSAN / CONDUSAN: saneamiento enterrado PVC corrugado / gran diámetro.\n' +
      '- BIOPIPE PVC-O: tubería a presión orientada (regadío + abastecimiento).\n' +
      '- PE 100: polietileno alta densidad para presión.\n' +
      '- TUYPER: gama conducción.\n\n' +
      (tieneWeb
        ? 'El user message incluye un bloque "## CONTEXTO WEB". Úsalo para destilar las secciones 1, 2, 5 y 10. NO lo incluyas literal. Cita la fuente cuando uses una cifra: "según iAgua [fecha]", "web corporativa", etc.\n\n'
        : 'No hay contexto web disponible. Si citas cifras concretas, márcalas como [ESTIMADO] o "comprobar antes de la visita".\n\n') +
      '## Reglas duras\n\n' +
      '1. Etiqueta cada cifra o afirmación fuerte: [VERIFICADO], [ESTIMADO] o [INFERIDO].\n' +
      '2. No inventes proyectos, personas ni cifras. Si una sección no tiene datos, escribe: "Sin datos suficientes — confirmar en visita".\n' +
      '3. Máximo 3-4 productos GPF por briefing.\n' +
      '4. Nunca menciones al cliente el scoring interno ni el cuadrante.\n' +
      '5. Si el contexto apunta a Continuation disfrazada, márcalo en sección 11 y reformula Plan A.\n' +
      '6. Si hay compromisos abiertos, el Plan A debe partir de cerrarlos.\n' +
      '7. Tipo de visita gobierna el tono: primera-frio → descubrimiento; primera-con-cita → concreto; seguimiento → arranca por compromiso anterior; post-licitacion → aprender, no defenderse.\n' +
      '8. Cargo del interlocutor gobierna la matriz. Si no encaja, usa el default del tipo y avísalo en el Aviso de marco.\n' +
      '9. Markdown puro. Sin emojis decorativos (excepto 🔄 para preguntas SPIN que cierran compromisos).\n' +
      '10. Longitud: que quepa en pantalla de iPhone con scroll cómodo. Recorta si una sección se infla.\n' +
      '11. Idioma: español peninsular. Tecnicismos sin traducir (BC3, IFC, AENOR, DAP, BIOPIPE, PE 100, MUTE, EUME, PERTE, SEIASA, PLACSP).\n\n' +
      overlayBlock;

    // Nombre del contacto principal si existe en el equipo
    const contactoPrincipal = team.find(function (m) {
      return m.role && m.role.toLowerCase().includes(cargoInterlocutor.toLowerCase().split('-')[0]);
    }) || (team.length ? team[0] : null);
    const nombreContacto = contactoPrincipal ? ' (' + contactoPrincipal.name + ')' : '';
    const quadrantInfo = studio.priorityQuadrant
      ? 'Q' + studio.priorityQuadrant + (studio.priorityQuadrantName ? ' — ' + studio.priorityQuadrantName : '') + ' · score ' + (studio.score || '?') + '/10'
      : 'sin clasificar';
    const teamList = team.length
      ? team.map(function (m) { return m.name + (m.role ? ' (' + m.role + ')' : '') + (m.isDecisionMaker ? ' ⭐decisor' : ''); }).join(', ')
      : 'sin equipo registrado en el CRM';

    /* USER PROMPT — datos reales del cliente + scaffolding de las 13 secciones.
       La plantilla va aquí (no en el system prompt) para que Claude la rellene con contenido real. */
    const userMsg =
      'Genera el briefing pre-visita con contenido REAL para cada sección. No repitas las instrucciones entre paréntesis: son guías para ti, no texto de salida.\n\n' +
      crmCtx + '\n\n' +
      '## HISTÓRICO RECIENTE (últimas 5 entradas)\n' + histCtx + '\n\n' +
      '## COMPROMISOS ABIERTOS\n' + compromisosCtx + '\n\n' +
      '## RED DE CONEXIONES EN EL CRM\n' + redText + '\n\n' +
      (contextoExtra ? '## CONTEXTO EXTRA INDICADO POR MANOLO\n' + contextoExtra + '\n\n' : '') +
      '## ORIENTACIÓN SECTORIAL\n' +
      'Tipo principal: ' + tipoPrincipal + '\n' +
      'Fuentes habituales: ' + (fuentesSugeridas || '(no mapeado)') + '\n' +
      'Catálogo GPF base:\n' + catalogoSugerido + '\n\n' +
      webContext + '\n' +
      '---\n\n' +
      '# Briefing — ' + studioName + '\n\n' +
      '**Fecha:** ' + fecha + '\n' +
      '**Tipo de visita:** ' + tipoVisita + '\n' +
      '**Interlocutor previsto:** ' + cargoInterlocutor + nombreContacto + '\n' +
      '**Cuadrante estratégico:** ' + quadrantInfo + '\n\n' +
      '> **Aviso de marco**: (escribe aquí una frase que oriente el tono de la visita — ej: "prescripción pura, no venta directa", "cliente puente para la zona", "post-licitación, objetivo aprender")\n\n' +
      '---\n\n' +
      '## 1. Quién es ' + studioName + ' y por qué importa\n' +
      '(3-5 párrafos: identidad, actividad, tamaño, track record verificable, geografía. Etiqueta cada afirmación [VERIFICADO], [ESTIMADO] o [INFERIDO])\n\n' +
      '## 2. Por qué esta visita es estratégica (o no)\n' +
      '(Análisis honesto del cuadrante ' + quadrantInfo + '. ' +
      (tieneAlertaPlacsp && adjPlacsp ? 'Hay alerta PLACSP: adjudicación "' + (adjPlacsp.titulo || '') + '" — cómo cambia la conversación.' : 'Sin alerta PLACSP.') + ')\n\n' +
      '## 3. Persona(s) de contacto\n' +
      '(Equipo conocido: ' + teamList + '. Si ' + cargoInterlocutor + ' no aparece, añade: "Pedir por ' + cargoInterlocutor + ' en recepción" + script de 1 línea)\n\n' +
      '## 4. Productos GPF prescribibles aquí\n' +
      '(Máximo 3-4 productos según la MATRIZ CRUZADA del system prompt. 1 frase de justificación por producto. Sub-sección obligatoria: **No mencionar en esta visita:**)\n\n' +
      '## 5. Ángulo argumental\n' +
      '(3-5 bullets usando el ángulo de la MATRIZ para cargo "' + cargoInterlocutor + '" en empresa tipo ' + tipoPrincipal + ')\n\n' +
      '## 6. Cómo concertar / qué decir al entrar\n' +
      '(Adapta al tipo "' + tipoVisita + '": guion de apertura, qué carpeta llevas, qué NO sueltas todavía)\n\n' +
      '## 7. Preguntas SPIN específicas para esta visita\n\n' +
      '### Situación (1-2 preguntas — solo lo que no se puede investigar antes)\n\n' +
      '### Problema (3-4 preguntas — dolores reales del perfil ' + cargoInterlocutor + ')\n\n' +
      '### Implicación (4-6 preguntas — cuantifica consecuencias; es la sección más rentable)\n\n' +
      '### Need-payoff (2-3 preguntas — que el cliente verbalice el valor)\n\n' +
      (propuestasPendientes.length ? '(Añade 1-2 preguntas 🔄 para cerrar los compromisos abiertos)\n\n' : '') +
      '## 8. Material a llevar\n' +
      '(Lista priorizada, máximo 5-6 elementos relevantes para ' + cargoInterlocutor + '. Sub-sección obligatoria: **No llevar:**)\n\n' +
      '## 9. Objetivo de Advance, por preferencia\n\n' +
      '### Plan A — el más potente\n' +
      '(Frase literal lista para soltar: entregable concreto + fecha + siguiente paso. ' +
      (propuestasPendientes.length ? 'Debe cerrar un compromiso abierto.' : '') + ')\n\n' +
      '### Plan B — conservador\n' +
      '(Frase literal. Patrón "das tú, no pides".)\n\n' +
      '### Plan C — mínimo aceptable\n' +
      '(Frase literal. Siempre TÚ entregas algo.)\n\n' +
      '## 10. Detalles tácticos\n' +
      '(3-5 puntos específicos: cultura del sector, riesgos relacionales, palancas únicas — fabricante andaluz, fábrica Atarfe, PERTE — proyectos del cliente que esperará que conozcas)\n\n' +
      '## 11. Lo que esta visita puede valer\n' +
      '(Retorno esperado si va bien: qué decisiones, qué proyectos, efecto red, plazo. Si la visita NO tiene valor real, dilo aquí sin rodeos)\n\n' +
      '## 12. Checklist pre-visita\n' +
      '(Lista con - [ ] específica para ' + studioName + ')\n\n' +
      '## 13. Checklist post-visita (en el coche, los 10 minutos siguientes)\n' +
      '(Lista con - [ ] de preguntas que Manolo debe poder contestar nada más salir: pliego abierto o cerrado, quién decide marca, qué prometí y cuándo, siguiente acción con fecha, referencias cruzadas detectadas)';

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
        cargo_interlocutor: cargoInterlocutor,
        tipo_visita: tipoVisita,
        markdown: markdown,
        formato: 'markdown_v3',
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

  /**
   * generateReport(studioId, payload)
   *
   * Genera un informe de visita coaching en markdown (formato informe_v2).
   * Análisis SPIN + señales lingüísticas + coaching + guión próxima visita.
   *
   * payload: {
   *   modalidad:          'real' | 'ficticia'  (default: 'real')
   *   fecha:              'YYYY-MM-DD'          (default: hoy)
   *   comercial:          string                (default: 'Manolo Fernández')
   *   prescripcion:       boolean
   *   notes:              string                notas libres o transcripción (con timestamps si hay)
   *   cargoInterlocutor:  string                clave de CARGOS_POR_TIPO (opcional pero recomendado)
   *   tipoVisita:         string                'primera-frio'|'primera-con-cita'|'seguimiento'|...
   * }
   */
  /* Elimina cualquier marca de tiempo / timestamp del markdown del informe.
     Regla global definida en window.Util.stripTimestamps (app.js) — una sola
     fuente de verdad. Fallback local idéntico por si Util no estuviera cargado. */
  function _stripTimestamps(md) {
    if (!md) return md;
    if (window.Util && window.Util.stripTimestamps) return window.Util.stripTimestamps(md);
    var TS = '\\d{1,2}:\\d{2}(?::\\d{2})?';
    var DASH = '\\s*[–—-]\\s*';
    return md
      .replace(new RegExp('\\[\\s*' + TS + '(?:' + DASH + TS + ')?\\s*\\]', 'g'), '')
      .replace(new RegExp('\\(\\s*' + TS + '(?:' + DASH + TS + ')?\\s*\\)', 'g'), '')
      .replace(new RegExp('\\b' + TS + DASH + TS + '\\b', 'g'), '')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\(\s*\)/g, '')
      .replace(/[ \t]+([,.;:)])/g, '$1')
      .replace(/^(\s*(?:[-*•]|\d+\.)\s*)[–—-]\s+/gm, '$1')
      .replace(/[ \t]+$/gm, '')
      .trim();
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
    const cargoInterlocutor = payload.cargoInterlocutor || '';
    const tipoVisita = payload.tipoVisita || 'seguimiento';
    // Formato de salida: 'estandar' (registro comercial de 8 secciones, sin
    // SPIN) o 'spin' (coaching). Por defecto, estándar.
    const formato = payload.formato === 'spin' ? 'spin' : 'estandar';

    if (modalidad === 'real' && !notas.trim()) {
      throw new Error('Necesitas escribir las notas de la visita antes de generar el informe.');
    }

    const studioName = studio.name || 'Empresa';
    const province = _val(studio.province) || '';
    const city = _val(studio.city) || province;
    const contact = (studio.data && studio.data.contact) || {};
    const types = Array.isArray(studio.type) ? studio.type : [studio.type || 'ING'];
    const tipoPrincipal = types[0];
    const team = (studio.data && studio.data.team) || [];
    const activities = (studio.data && studio.data.activities) || [];
    const reports = (studio.data && studio.data.reports) || [];

    // Historial reciente (últimas 5 visitas/actividades)
    const lastEvents = [].concat(reports, activities)
      .filter(function (e) { return e && (e.date || e.createdAt); })
      .sort(function (a, b) {
        return new Date(b.date || b.createdAt || 0).getTime() -
               new Date(a.date || a.createdAt || 0).getTime();
      }).slice(0, 5);

    // Compromisos abiertos
    const propuestasPendientes = [];
    activities.forEach(function (a) {
      const ps = (a && a.registroVisita && a.registroVisita.actualizaciones_propuestas) || [];
      ps.forEach(function (p) {
        if (!p.decision || p.decision === 'pending') propuestasPendientes.push(p);
      });
    });

    // Overlay de cargo para el informe
    const overlay = cargoInterlocutor ? getCargoOverlay(tipoPrincipal, cargoInterlocutor) : null;
    const overlayBlock = overlay
      ? '## OVERLAY DEL INTERLOCUTOR — ' + tipoPrincipal + ' × ' + cargoInterlocutor + '\n' +
        'Alias: ' + overlay.alias + '\n' +
        'Productos prioritarios GPF para este perfil: ' + overlay.prioritarios.join(', ') + '\n' +
        'Productos que NO aplican: ' + (overlay.evitar.length ? overlay.evitar.join(', ') : 'ninguno específico') + '\n' +
        'Ángulo argumental: ' + overlay.angulo + '\n' +
        'Discovery clave (preguntas que debería haber hecho):\n' +
          overlay.discovery_clave.map(function (q, i) { return (i + 1) + '. ' + q; }).join('\n') + '\n'
      : (cargoInterlocutor
          ? '## OVERLAY\nPerfil (' + tipoPrincipal + ' × ' + cargoInterlocutor + ') no mapeado. Usa el catálogo base del tipo ' + tipoPrincipal + '.\n'
          : '## OVERLAY\nCargo del interlocutor no especificado. Análisis basado en tipo de empresa: ' + tipoPrincipal + '.\n');

    const crmCtx = [
      '## DATOS DEL CLIENTE (CRM)',
      'Empresa: ' + studioName,
      'Ciudad / Provincia: ' + (city || '—') + ' / ' + (province || '—'),
      'Tipo: ' + types.join(', '),
      studio.priorityQuadrant ? 'Cuadrante: Q' + studio.priorityQuadrant : null,
      studio.score ? 'Score: ' + studio.score : null,
      _val(contact.phone) ? 'Tel: ' + _val(contact.phone) : null,
      _val(contact.email) ? 'Email: ' + _val(contact.email) : null,
      _val(contact.web) ? 'Web: ' + _val(contact.web) : null,
      team.length ? 'Equipo conocido: ' + team.map(function (m) {
        return m.name + (m.role ? ' (' + m.role + ')' : '') + (m.isDecisionMaker ? ' ⭐' : '');
      }).join(', ') : null,
    ].filter(Boolean).join('\n');

    const histCtx = lastEvents.length === 0
      ? 'Primera visita — cliente nuevo, sin histórico previo en el CRM.'
      : lastEvents.map(function (v, i) {
          const d = (v.date || v.createdAt || '').slice(0, 10);
          const t = v.title || v.type || 'evento';
          const n = (v.notes || '').slice(0, 300);
          return (i + 1) + '. [' + d + '] ' + t + (n ? '\n   Notas: ' + n : '');
        }).join('\n');

    const compromisosCtx = propuestasPendientes.length === 0
      ? 'Sin compromisos abiertos pendientes.'
      : propuestasPendientes.map(function (p) {
          return '- ' + (p.tipo || 'propuesta') + ': ' + (p.propuesta || '');
        }).join('\n');

    /* SYSTEM PROMPT — rol + metodología + reglas. Sin plantilla de output.
       La plantilla va en el user message para evitar que Claude la devuelva literal. */
    const systemPrompt =
      'Eres el analista y coach comercial de Manuel Fernández (Manolo), prescriptor de Grupo Plásticos Ferro (GPF) en Andalucía/Extremadura/Levante. GPF fabrica sistemas de tubería y saneamiento: BIOPIPE PVC-O, ecoSAN, PE 100, CONDUSAN, MUTE, EUME, PVC presión. Plantas en Atarfe (Granada) y Chilches (Valencia).\n\n' +
      'El objetivo de Manolo NO es vender directamente: es que el proyectista especifique la marca GPF en el pliego técnico antes de que salga a concurso. La venta ocurre después, por otro canal.\n\n' +
      '## Metodología SPIN (Neil Rackham)\n' +
      'Mix ideal para 30-45 min con proyectista: 1-2 Situación / 3-4 Problema / 4-6 Implicación / 2-3 Need-payoff.\n' +
      '- Las S establecen contexto pero no crean valor percibido.\n' +
      '- Las I y N son las que mueven el deal en prescripción B2B compleja.\n' +
      '- Minimizar S porque todo lo que se puede investigar se investiga antes.\n\n' +
      '## Advance vs Continuation\n' +
      'Un advance es un compromiso concreto que mueve el deal: fecha de entrega de material, proyecto específico acordado, reunión con técnico fijada. Una continuation es "llamamos cuando haya algo" — se acepta pero no se celebra.\n\n' +
      '## Tu rol en este informe\n' +
      'Transforma las notas o transcripción de la visita en un documento que sirve a la vez como:\n' +
      '(a) registro comercial fiel a lo ocurrido,\n' +
      '(b) diagnóstico SPIN honesto (sin suavizar los fallos),\n' +
      '(c) herramienta de coaching con ejercicios basados en situaciones reales de esta visita,\n' +
      '(d) guía accionable para las próximas 2 semanas.\n\n' +
      '## Reglas absolutas\n' +
      '- Devuelve ÚNICAMENTE el markdown del informe. Sin preámbulo, sin texto introductorio, sin explicaciones.\n' +
      '- No inventes datos que no estén en las notas. Si algo no se puede extraer, usa [SIN DATO] o simplemente no lo pongas.\n' +
      '- PROHIBIDO incluir marcas de tiempo o timestamps de ningún tipo ([MM:SS], [MM:SS–MM:SS], (01:47), "al minuto 2:30", rangos como 01:47–02:34, etc.), AUNQUE aparezcan en el input. El informe es un registro comercial profesional, NO una transcripción: bajo ninguna circunstancia puede parecer que proviene de una reunión grabada. Si las notas traen marcas de tiempo, ignóralas por completo al redactar.\n' +
      '- Las citas del cliente van siempre entre comillas y en cursiva cuando son literales (sin marca de tiempo).\n' +
      '- Los ejercicios de práctica son siempre específicos de esta visita, nunca genéricos.\n' +
      '- El guión para la próxima visita contiene preguntas LITERALES entre comillas, no descripciones de preguntas.\n' +
      '- El JSON de métricas cierra el informe y es siempre válido.\n' +
      '- Tono: analítico, directo, sin condescendencia. Primera persona para la actuación de Manolo. Tercera para el cliente.';

    const tipoVisitaLabel = {
      'primera-frio': 'Primera visita en frío',
      'primera-con-cita': 'Primera visita con cita previa',
      'seguimiento': 'Visita de seguimiento',
      'presentacion-producto': 'Presentación de producto',
      'visita-tecnica-proyecto': 'Visita técnica de proyecto',
      'post-licitacion': 'Post-licitación',
    }[tipoVisita] || tipoVisita;

    const userMsg =
      'Genera el informe completo de esta visita.\n\n' +
      crmCtx + '\n\n' +
      'FECHA: ' + fecha + '\n' +
      'COMERCIAL: ' + comercial + '\n' +
      'TIPO DE VISITA: ' + tipoVisitaLabel + '\n' +
      (prescripcion ? 'CONTEXTO: visita de prescripción\n' : '') +
      (cargoInterlocutor ? 'CARGO DEL INTERLOCUTOR: ' + cargoInterlocutor + '\n' : '') +
      '\n' + overlayBlock + '\n' +
      '## HISTÓRICO DE VISITAS ANTERIORES\n' + histCtx + '\n\n' +
      '## COMPROMISOS PENDIENTES DEL CRM\n' + compromisosCtx + '\n\n' +
      '## NOTAS / TRANSCRIPCIÓN DE LA VISITA\n' + notas + '\n\n' +
      '---\n\n' +
      'Produce el informe con la siguiente estructura EXACTA. Las instrucciones entre paréntesis son para ti — ejecútalas y no las incluyas en el output.\n\n' +
      '# Informe de visita — ' + studioName + '\n\n' +
      '**Fecha:** ' + fecha + '\n' +
      '**Interlocutor:** (nombre y cargo extraído de las notas; o [SIN DATO])\n' +
      '**Tipo:** ' + tipoVisitaLabel + '\n' +
      '**Duración:** (solo si las notas la mencionan explícitamente en minutos; omite la línea si no hay dato. NO la deduzcas de marcas de tiempo)\n\n' +
      '---\n\n' +
      '## Resumen ejecutivo\n\n' +
      '(2-3 párrafos: contexto del cliente, productos GPF más pertinentes para su perfil, resultado real como advance/continuation, y el dato más importante que Manolo debe recordar mañana)\n\n' +
      '---\n\n' +
      '## Contexto del cliente\n\n' +
      '(bullets: especialidades declaradas, herramientas —BC3/Presto/BIM/IFC—, clientes o contratantes mencionados, proyectos activos, volumen estimado, si prescriben o compran directamente)\n\n' +
      '---\n\n' +
      '## Temas tratados\n\n' +
      '(lista numerada cronológica de los temas tratados; NO incluyas marcas de tiempo, minutos ni rangos [MM:SS])\n\n' +
      '---\n\n' +
      '## Productos GPF presentados\n\n' +
      '(tabla: Producto | Cómo se presentó | Pertinencia según overlay ✅ prioritario / ⚠️ secundario / ❌ no aplica)\n\n' +
      '(párrafo de evaluación: ¿productos correctos para el perfil? ¿presentados de forma narrativa sobre necesidades o como catálogo lineal?)\n\n' +
      '---\n\n' +
      '## Señales del cliente\n\n' +
      '**Intereses confirmados (con cita):**\n' +
      '(bullet por cada interés claro; cita literal en cursiva, SIN marca de tiempo)\n\n' +
      '**Dolores insinuados (implícitos, no desarrollados):**\n' +
      '(bullet por dolor detectado pero no profundizado; o "Sin dolores detectados." si no hay)\n\n' +
      '**Engagement:** (nivel: alto/moderado/bajo y justificación breve)\n\n' +
      '**Objeciones:** (si ninguna: "Ninguna explícita.")\n\n' +
      '---\n\n' +
      '## 🔍 Señales lingüísticas detectadas\n\n' +
      '### Evitación o esquiva\n' +
      '(casos concretos con cita; si datos insuficientes: "Sin patrones claros con las notas disponibles.")\n\n' +
      '### Lenguaje de incertidumbre (hedging)\n' +
      '(casos concretos; número de ocurrencias)\n\n' +
      '### Repeticiones temáticas\n' +
      '(qué temas nombró el cliente más de una vez y su significado operativo)\n\n' +
      '### Momentos de alto engagement\n' +
      '(momentos en que el cliente se activó espontáneamente)\n\n' +
      '---\n\n' +
      '## Análisis SPIN\n\n' +
      '(tabla: Tipo | Cantidad | Ejemplos con cita literal)\n\n' +
      '(diagnóstico en 3-4 líneas: mix real vs ideal 1-2S/3-4P/4-6I/2-3N, dónde falló el balance)\n\n' +
      '---\n\n' +
      '## Mi desempeño como prescriptor\n\n' +
      '### Aciertos\n\n' +
      '(bullets numerados)\n\n' +
      '### Áreas de mejora\n\n' +
      '(bullets numerados; concretos y directos, sin suavizar)\n\n' +
      '### Momentos perdidos\n\n' +
      '(para cada momento: qué dijo el cliente, en qué punto, qué no preguntó Manolo, qué pregunta habría valido)\n\n' +
      '---\n\n' +
      '## Cierre — ¿advance o continuation?\n\n' +
      '**Resultado:** (advance firme / soft advance / continuation — elige con criterio SPIN)\n\n' +
      '(párrafo: por qué es ese resultado, qué lo confirma, cuál es el riesgo real si no hay seguimiento activo)\n\n' +
      '---\n\n' +
      '## Acciones de seguimiento\n\n' +
      '(lista de 3-5 acciones concretas con prioridad y fecha límite; formato: **Prioridad N — [cuándo]:** acción accionable)\n\n' +
      '---\n\n' +
      '## 🎯 Guión para la próxima visita\n\n' +
      '(contexto de 1 línea: qué se envió antes, qué ancla usar)\n\n' +
      '**Preguntas de Problema** (dolores insinuados pero no desarrollados):\n\n' +
      '(3-4 preguntas LITERALES en cursiva y comillas, con referencia al tema de la visita que las justifica, sin marca de tiempo)\n\n' +
      '**Preguntas de Implicación** (cuantificar el coste del problema):\n\n' +
      '(3-4 preguntas LITERALES en cursiva y comillas)\n\n' +
      '**Preguntas de Need-payoff** (que el cliente verbalice el valor):\n\n' +
      '(2-3 preguntas LITERALES en cursiva y comillas)\n\n' +
      '**Material a llevar:**\n\n' +
      '(lista numerada con formato específico del material según lo que pidió o necesita el cliente)\n\n' +
      '**Objetivo de advance concreto:**\n\n' +
      '*(una frase en cursiva con el avance medible que se busca conseguir en la próxima visita, con fecha objetivo)*\n\n' +
      '---\n\n' +
      '## 💪 Ejercicios de práctica esta semana\n\n' +
      '(3 ejercicios específicos de esta visita; cada uno con: nombre, objetivo, instrucciones paso a paso, duración estimada entre paréntesis y criterio de éxito)\n\n' +
      '---\n\n' +
      '## Métricas\n\n' +
      '```json\n' +
      '{\n' +
      '  "duracion_min": (número o null),\n' +
      '  "ratio_habla_manolo": (decimal 0-1, estimado; o null),\n' +
      '  "preguntas_situacion": (número),\n' +
      '  "preguntas_problema": (número),\n' +
      '  "preguntas_implicacion": (número),\n' +
      '  "preguntas_need_payoff": (número),\n' +
      '  "productos_gpf_mencionados": ["array"],\n' +
      '  "competencia_mencionada": ["array"],\n' +
      '  "objeciones_cliente": ["array"],\n' +
      '  "casos_referencia_citados": ["array"],\n' +
      '  "n_senales_evitacion": (número),\n' +
      '  "n_lenguaje_hedging": (número),\n' +
      '  "n_momentos_engagement": (número),\n' +
      '  "calidad_discovery": (1-5),\n' +
      '  "calidad_pitch": (1-5),\n' +
      '  "calidad_cierre": (1-5),\n' +
      '  "tipo_advance": "firme|soft|continuation",\n' +
      '  "personalizacion_pitch": (1-5),\n' +
      '  "nivel_interes_cliente": (1-5),\n' +
      '  "siguiente_paso_acordado": "descripción o null"\n' +
      '}\n' +
      '```';

    // ── Formato ESTÁNDAR (registro comercial de 8 secciones, SIN SPIN) ──
    // Sustituye el prompt de coaching cuando el usuario elige "Estándar".
    // Funciona igual con notas, transcripción o ambas (no requiere grabación).
    let _sysPrompt = systemPrompt, _userMsg = userMsg;
    if (formato === 'estandar') {
      _sysPrompt =
        'Eres el asistente que redacta INFORMES DE VISITA COMERCIAL profesionales para Manuel Fernández (Manolo), prescriptor de Grupo Plásticos Ferro (GPF) en Andalucía/Extremadura/Levante. GPF fabrica sistemas de tubería y saneamiento: BIOPIPE PVC-O, ecoSAN, PE 100, CONDUSAN, MUTE, EUME, PVC presión.\n\n' +
        'El objetivo de Manolo es que el proyectista o cliente especifique la marca GPF en el pliego técnico antes del concurso.\n\n' +
        '## Tu tarea\n' +
        'Transforma las notas y/o la transcripción de la visita en un INFORME ESTÁNDAR de registro comercial, claro y profesional, orientado a la ficha del cliente. Sirve igual con solo notas, solo transcripción o ambas.\n\n' +
        '## Reglas absolutas\n' +
        '- Devuelve ÚNICAMENTE el markdown del informe. Sin preámbulo ni explicaciones.\n' +
        '- NO incluyas análisis SPIN, autoevaluación, apartados de "mi desempeño", ejercicios de práctica, ratios de habla, momentos perdidos ni métricas de coaching. Es un registro comercial, NO una herramienta de coaching.\n' +
        '- No inventes datos que no estén en las notas. Si algo no consta, usa [SIN DATO] o simplemente omítelo.\n' +
        '- PROHIBIDO incluir marcas de tiempo de ningún tipo ([MM:SS], rangos como 01:47–02:34, "al minuto 2:30", etc.), AUNQUE aparezcan en el input. El informe es un registro comercial profesional y NO puede parecer una transcripción.\n' +
        '- Tono profesional, directo y claro, en español.';
      _userMsg =
        'Genera el INFORME ESTÁNDAR de esta visita con la estructura EXACTA siguiente. Las indicaciones entre paréntesis son para ti: ejecútalas y no las incluyas en el resultado.\n\n' +
        crmCtx + '\n\n' +
        'FECHA: ' + fecha + '\n' +
        'COMERCIAL: ' + comercial + '\n' +
        'TIPO DE VISITA: ' + tipoVisitaLabel + '\n' +
        (cargoInterlocutor ? 'CARGO DEL INTERLOCUTOR: ' + cargoInterlocutor + '\n' : '') +
        (prescripcion ? 'Visita de prescripción.\n' : '') +
        '\n## HISTÓRICO DE VISITAS ANTERIORES\n' + histCtx + '\n\n' +
        '## NOTAS / TRANSCRIPCIÓN DE LA VISITA\n' + notas + '\n\n' +
        '---\n\n' +
        '# Informe de visita — ' + studioName + '\n\n' +
        '## 1. Datos generales\n' +
        '(tabla markdown de dos columnas Campo | Valor con: Empresa, Tipo, Ciudad / Provincia, Fecha, Tipo de visita, Modalidad, Interlocutor principal, Estado tras la visita)\n\n' +
        '## 2. Personas contactadas\n' +
        '(tabla markdown: Nombre | Cargo | Observaciones. Marca con ⭐ a los decisores o contactos clave. Si no consta el nombre, usa el cargo en su lugar.)\n\n' +
        '## 3. Desarrollo de la visita\n' +
        '(2-4 párrafos narrativos: qué se trató, qué productos GPF se presentaron, reacciones del cliente y resultado de la visita)\n\n' +
        '## 4. Contexto estratégico\n' +
        '(análisis breve: tipo de cliente, focos, por qué es relevante para GPF, ámbitos o proyectos donde puede prescribir)\n\n' +
        '## 5. Oportunidades detectadas\n' +
        '(lista numerada de proyectos u oportunidades concretas con los productos GPF relevantes para cada una; si no hay, escribe "Sin oportunidades concretas detectadas en esta visita.")\n\n' +
        '## 6. Compromisos y próximos pasos\n' +
        '(lista numerada de acciones concretas y accionables: qué hará GPF/Manolo y qué hará el cliente, con responsable cuando se sepa)\n\n' +
        '## 7. Observaciones adicionales\n' +
        '(bullets con datos sueltos relevantes: contactos obtenidos, notas de la empresa, detalles a recordar; omite la sección entera si no hay nada)\n\n' +
        '## 8. Evaluación general\n' +
        '(tabla markdown Campo | Valor con: Nivel de interés, Potencial del cliente, Plazo estimado, Productos prioritarios, Estado de la cuenta)';
    }

    const markdown = _stripTimestamps(
      (await _claudeCall(_sysPrompt, _userMsg, 8192))
        .replace(/^\s*```(?:markdown)?\s*\n?/, '')
        .replace(/\s*```\s*$/, '')
        .trim()
    );

    // Persistir como informe_v2 en data.reports[] del studio
    const isoDate = new Date().toISOString().replace(/[:.]/g, '-');
    // id neutro del informe (no delata nada); sirve para enlazar la clasificación
    // interna sin escribir ninguna marca en el propio documento.
    const rid = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const reportEntry = {
      iso_date: isoDate,
      rid: rid,
      date: fecha,
      generated_at: new Date().toISOString(),
      comercial: comercial,
      prescripcion: prescripcion,
      notes_raw: notas,
      markdown: markdown,
      formato: 'informe_v2',
      tipo_informe: formato,          // 'estandar' | 'spin'
      cargo_interlocutor: cargoInterlocutor || null,
      tipo_visita: tipoVisita || null,
      project_id: payload.projectId || null,        // enlace a data.projects[].id (opcional)
      project_nombre: payload.projectNombre || null,
      title: 'Visita ' + fecha + ' · ' + comercial + (payload.projectNombre ? ' · ' + payload.projectNombre : ''),
    };
    let persisted = false, persistError = null;
    try {
      await _patchDocActive('studios/' + studioId + '/reports/' + isoDate, reportEntry);
      persisted = true;
      // Sincronizar State EN MEMORIA para que la ficha muestre el informe al
      // instante (antes solo se escribía en Supabase y parecía no guardarse
      // hasta recargar la app).
      try {
        const raw = window.State && window.State.studiosById && window.State.studiosById[studioId];
        if (raw) {
          raw.data = raw.data || {};
          raw.data.reports = (raw.data.reports || []).slice();
          raw.data.reports.push(reportEntry);
          raw.reports = raw.data.reports;
        }
        // Invalidar la cache local: una recarga releerá de Supabase (que ya
        // tiene el informe) en vez de servir la copia antigua.
        try { localStorage.removeItem(CACHE_KEY); } catch (_) {}
      } catch (_) {}
    } catch (e) {
      console.warn('[redesign/data] persistencia report falló:', e.message);
      persistError = e.message || String(e);
    }

    // Avanzar el estado del cliente: una visita con informe implica al menos
    // una reunión. Solo avanza (nunca retrocede) ni toca estados terminales.
    let statusChanged = null;
    if (persisted) {
      try {
        const _rank = { nuevo: 0, contactado: 1, reunion: 2, propuesta: 3, negociacion: 4 };
        const _terminal = ['ganado', 'perdido', 'dormido'];
        const _raw = window.State && window.State.studiosById && window.State.studiosById[studioId];
        const _cur = (_raw && _raw.status) || studio.status || 'nuevo';
        const _target = 'reunion';
        if (_terminal.indexOf(_cur) < 0 && (_rank[_target] || 0) > (_rank[_cur] || 0)) {
          await _patchDocActive('studios/' + studioId, { status: _target });
          if (_raw) _raw.status = _target;
          statusChanged = _target;
        }
      } catch (_) {}
    }

    // Clasificación interna OCULTA: si la visita se generó en modo "ficticia",
    // se registra su rid en report_audit (tabla sin lectura para la app). No queda
    // ninguna marca en el documento del informe ni se muestra en ninguna vista.
    if (persisted && modalidad === 'ficticia') {
      try {
        if (window.DataSupabase && window.DataSupabase.flagReportAudit) {
          await window.DataSupabase.flagReportAudit(rid, studioId);
        }
      } catch (_) {}
    }

    return { success: true, markdown: markdown, persisted: persisted, persistError: persistError, statusChanged: statusChanged };
  }

  /* Enlaza un informe a un proyecto del estudio: asegura un id estable en el
     proyecto (perezoso) y, opcionalmente, actualiza su estado. Devuelve
     { projectId, projectNombre } para guardarlos en el informe.
     Usa el MISMO patrón seguro que saveDataField (read full data → patchDoc data). */
  async function updateProjectFromReport(studioId, projectIdx, opts) {
    opts = opts || {};
    const studio = await _getStudio(studioId);
    if (!studio) throw new Error('Studio ' + studioId + ' no encontrado');
    const projects = (((studio.data && studio.data.projects) || [])).slice();
    const idx = parseInt(projectIdx, 10);
    if (!projects[idx]) return null;
    const p = Object.assign({}, projects[idx]);
    if (!p.id) p.id = 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    if (opts.nuevoEstado) p.estado = opts.nuevoEstado;
    projects[idx] = p;
    const newData = Object.assign({}, studio.data || {}, { projects: projects });
    await _patchDocActive('studios/' + studioId, { data: newData });
    // Sincronizar State local
    if (window.State && window.State.studiosById && window.State.studiosById[studioId]) {
      const raw = window.State.studiosById[studioId];
      raw.data = newData;
      raw.projects = projects;
    }
    return { projectId: p.id, projectNombre: p.nombre || p.name || null };
  }

  /* ============================================================
     DELETE DOC
     ============================================================ */
  function _routeDeleteDoc(path) {
    return _sb().deleteDoc(path);
  }

  /* ============================================================
     ENRICH STUDIO — investigación web + IA para rellenar ficha
     Análisis enriquecido: deep scan web (multi-página) + 2 búsquedas DDG
     + Páginas Amarillas + Claude IA para estructurar. Solo sobreescribe
     campos vacíos. Muestra toasts de progreso.
     ============================================================ */
  async function enrichStudio(studioId) {
    const State = window.State;
    const studio = State && State.studiosById && State.studiosById[studioId];
    if (!studio) throw new Error('Studio ' + studioId + ' no encontrado en State');

    const notif = window.showNotification || function () {};

    notif('🔍 Analizando "' + (studio.name || studioId) + '"…', 'info');

    let webContext = '';
    try {
      webContext = await _gatherWebContext(studio);
    } catch (e) {
      console.warn('[enrichStudio] _gatherWebContext falló:', e.message);
    }

    // Umbral mínimo muy bajo (10 chars) para no bloquear cuando Nominatim
    // devuelve sólo la dirección pero DuckDuckGo/web/PA no encontraron nada.
    if (!webContext || webContext.trim().length < 10) {
      notif('⚠️ No se encontró información para "' + (studio.name || studioId) + '" — prueba a añadir la URL de su web', 'warning');
      throw new Error('Sin contexto web para "' + (studio.name || studioId) + '". Añade la URL de su web y vuelve a intentarlo.');
    }

    console.info('[enrichStudio] contexto recopilado: ' + webContext.trim().length + ' chars');

    // Extracción directa de emails, teléfonos y dirección del contexto
    const directEmails = _extractEmails(webContext);
    const directPhones = _extractPhones(webContext);
    // Extraer dirección directamente de la sección Nominatim si existe
    const osmMatch = webContext.match(/DIRECCIÓN \(OpenStreetMap\): ([^\n]+)/);
    const directAddress = osmMatch ? osmMatch[1].trim() : '';

    notif('🤖 Consultando IA para estructurar los datos…', 'info');

    const systemPrompt =
      'Eres un extractor de datos de empresas y organismos españoles. ' +
      'A partir del contexto web, extrae los datos de la organización. ' +
      'Devuelve EXCLUSIVAMENTE un JSON válido (sin markdown, sin texto extra) con esta estructura:\n' +
      '{"city":"","province":"","type":"","description":"","contact":{"address":"","phone":"","email":"","web":""},' +
      '"team":[{"name":"","role":"","phone":"","email":""}]}\n' +
      'Para type usa exactamente uno de: Arquitectura, Ingeniería, C.R. Regantes, Ciclo del agua, ' +
      'Promotora · Constructora, Administración pública, Hotel / Hostelería, Hospital, Distribuidor, Otros. ' +
      'Para entidades públicas (ayuntamientos, diputaciones, consorcios, mancomunidades): usa "Administración pública". ' +
      'description: 2-3 frases resumiendo actividad principal. ' +
      'Usa cadena vacía "" para campos no encontrados. team puede ser array vacío []. ' +
      'IMPORTANTE: Los emails y teléfonos ya aparecen destacados en el contexto con el prefijo EMAILS/TELÉFONOS — ' +
      'úsalos preferentemente para rellenar contact.email y contact.phone.';

    const userMsg =
      'Empresa/organismo: ' + (studio.name || '') + '\n' +
      'Ciudad actual: ' + (_val(studio.city) || '—') + '\n' +
      'Provincia actual: ' + (_val(studio.province) || '—') + '\n\n' +
      'Contexto web:\n' + webContext.slice(0, 8000);

    const raw = await _claudeCall(systemPrompt, userMsg, 1500);

    let parsed;
    try {
      const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const s = cleaned.indexOf('{');
      const e = cleaned.lastIndexOf('}');
      parsed = JSON.parse(s >= 0 && e > s ? cleaned.slice(s, e + 1) : cleaned);
    } catch (_) {
      throw new Error('La IA no devolvió JSON válido. Respuesta: ' + raw.slice(0, 120));
    }

    // Solo actualizar campos vacíos
    const patch = {};
    const _empty = function (v) { return !v || (typeof v === 'string' && !v.trim()) || (typeof v === 'object' && !_val(v)); };

    if (parsed.city     && _empty(studio.city))     patch.city     = parsed.city;
    if (parsed.province && _empty(studio.province)) patch.province = parsed.province;
    if (parsed.type     && _empty(studio.type))     patch.type     = parsed.type;

    // Construir data JSONB completo para no machacar campos existentes al hacer patchDoc.
    // IMPORTANTE: nunca usar patch['data.contact'] con clave literal con punto — eso
    // sobrescribe todo el JSONB con {"data.contact": ...} en internalToRow.
    const rawStudio = State.studiosById[studioId];
    const fullData  = Object.assign({}, (rawStudio && rawStudio.data) || {});

    const ctcOrig = Object.assign({}, fullData.contact || {});
    const ctcNew  = parsed.contact || {};
    let dataChanged = false;

    // Fusión: primero lo que dice Claude, luego los extraídos directamente como fallback
    ['address', 'phone', 'email', 'web'].forEach(function (k) {
      if (ctcNew[k] && _empty(ctcOrig[k])) { ctcOrig[k] = ctcNew[k]; dataChanged = true; }
    });
    // Fallback: email/teléfono/dirección extraídos directamente si Claude no los encontró
    if (_empty(ctcOrig.email) && directEmails.length) {
      ctcOrig.email = directEmails[0]; dataChanged = true;
    }
    if (_empty(ctcOrig.phone) && directPhones.length) {
      ctcOrig.phone = directPhones[0]; dataChanged = true;
    }
    // Dirección de Nominatim (muy fiable para entidades públicas)
    if (_empty(ctcOrig.address) && directAddress) {
      ctcOrig.address = directAddress; dataChanged = true;
    }
    if (dataChanged) fullData.contact = ctcOrig;

    if (parsed.description && _empty(fullData.description)) {
      fullData.description = parsed.description; dataChanged = true;
    }
    if (Array.isArray(parsed.team) && parsed.team.length > 0 && !(fullData.team && fullData.team.length)) {
      fullData.team = parsed.team.filter(function (t) { return t && t.name; });
      dataChanged = true;
    }

    if (dataChanged) patch.data = fullData;

    if (Object.keys(patch).length === 0) {
      notif('ℹ️ Ya tenía todos los datos, no se actualizó nada', 'info');
      return { fieldsUpdated: 0, message: 'Ya tenía todos los datos; no se sobrescribió nada.' };
    }

    await _routePatchDoc('studios/' + studioId, patch);
    // Actualizar State local
    if (!State.studiosById[studioId].data) State.studiosById[studioId].data = {};
    Object.keys(patch).forEach(function (k) {
      if (k === 'data') {
        State.studiosById[studioId].data = patch.data;
      } else {
        State.studiosById[studioId][k] = patch[k];
      }
    });

    const fieldNames = Object.keys(patch).map(function (k) { return k.replace('data.', ''); }).join(', ');
    notif('✅ Empresa enriquecida — ' + Object.keys(patch).length + ' campos: ' + fieldNames, 'success');

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
     BACKEND (Supabase es la ÚNICA fuente de verdad — 2026-06)
     ============================================================
     El fallback a Firestore se retiró: Firestore quedó bloqueado al cerrar
     la RLS/auth (hallazgo C1), así que dejar de leerlo evita errores silenciosos.
     _activeBackend() ignora cualquier override en localStorage. El cliente REST
     de Firestore de este archivo se eliminó por completo (2026-06): ya no hay
     ningún camino que lo invoque. */
  function _activeBackend() { return 'supabase'; }
  function _sb() {
    return window.DataSupabase;
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
    if (_sb()) {
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
  function _routeGetDoc(path) { return _sb().getDoc(path); }
  function _routeListCollection(name, opts) { return _sb().listCollection(name, opts); }
  function _routePatchDoc(path, obj, opts) { return _sb().patchDoc(path, obj, opts); }

  window.Data = {
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
    CARGOS_POR_TIPO: CARGOS_POR_TIPO,
    getCargoOverlay: getCargoOverlay,
    generateReport: generateReport,
    updateProjectFromReport: updateProjectFromReport,
    getBriefingItems: getBriefingItems,
    savePlanificador: savePlanificador,
    // Diagnóstico
    activeBackend: _activeBackend,
  };
})();
