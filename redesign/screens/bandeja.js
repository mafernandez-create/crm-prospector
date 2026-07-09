/* CRM Prospector · rediseño v1 · Fase D3 — Bandeja del agente
 *
 * Vista crítica del CRM (no estaba en el handoff visual, derivada del DS).
 *
 * Estructura:
 *   - Header con eyebrow fecha + h1 "Bandeja del agente" + tagline
 *   - Matriz 3×3 cuadrantes Q1-Q9 (cada celda con color DS, label, conteo,
 *     conteo de activos en 30 días). Click navega al listado filtrado.
 *   - Grid 2 columnas con 2 cards:
 *     · Cuentas enfriándose (score≥7, lastInteraction <-45d)
 *     · Alto potencial sin visitar (score≥8 sin reports)
 *   - Card span-2: Visitas fallidas / a reprogramar
 *
 * Datos mock Fase D. Fase G hará el cálculo real sobre State.studios.
 */
(function () {
  'use strict';

  const I = window.Icon;
  const State = window.State;
  const U = window.Util;
  const escape = U.escapeHtml;

  /* ============================================================
     DATOS — Fase G/v1.1: lee de State.studios real.
              Si la cartera no está cargada, mock fallback.
     ============================================================ */
  // Normaliza priorityQuadrant a "Q{n}" (el backend lo guarda como número 1-9)
  function normalizeQ(v) {
    if (v == null) return null;
    if (typeof v === 'string' && /^Q[1-9]$/.test(v)) return v;
    if (typeof v === 'number' && v >= 1 && v <= 9) return 'Q' + v;
    if (typeof v === 'string' && /^[1-9]$/.test(v)) return 'Q' + v;
    return null;
  }

  const TIPO_LABELS = {
    ARQ: 'Arquitectura',
    ING: 'Ingeniería',
    CCRR: 'Comunidad de Regantes',
    OCV: 'Promotora · Constructora',
    CICA: 'Ciclo del agua',
    AAPP: 'Admin. Pública',
  };

  function getData() {
    const hasReal = State.studios && State.studios.length > 0;
    if (!hasReal) return mockData();

    // Cuadrantes Q1-Q9 con cuenta real
    const conteoQ = {};
    const conteoQActivos = {};
    const hace30 = new Date(State.today.getTime() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    for (const s of State.studios) {
      const q = normalizeQ(s.priorityQuadrant) || s.cuadrante || s.quadrant;
      if (!q) continue;
      conteoQ[q] = (conteoQ[q] || 0) + 1;
      const last = U.lastInteraction(s);
      if (last && last >= hace30) {
        conteoQActivos[q] = (conteoQActivos[q] || 0) + 1;
      }
    }
    const cuadrantes = [
      { q: 'Q1', label: 'Estratégico',      color: 'var(--q-estrategico)',    fg: '#fff' },
      { q: 'Q2', label: 'Cliente core',     color: 'var(--q-cliente-core)',   fg: '#fff' },
      { q: 'Q3', label: 'Cliente volumen',  color: 'var(--q-cliente-volumen)', fg: '#fff' },
      { q: 'Q4', label: 'Puerta entrada',   color: 'var(--q-puerta)',         fg: '#fff' },
      { q: 'Q5', label: 'Cartera estándar', color: 'var(--q-cartera)',        fg: '#fff' },
      { q: 'Q6', label: 'Mantenimiento',    color: 'var(--q-mantenimiento)',  fg: '#fff' },
      { q: 'Q7', label: 'Conector',         color: 'var(--q-conector)',       fg: '#fff' },
      { q: 'Q8', label: 'Seguimiento',      color: 'var(--q-seguimiento)',    fg: '#fff' },
      { q: 'Q9', label: 'Congelar',         color: 'var(--q-congelar)',       fg: 'var(--fg-1)' },
    ].map(function (c) {
      return Object.assign({}, c, {
        n: conteoQ[c.q] || 0,
        activos: conteoQActivos[c.q] || 0,
      });
    });

    // Cuántos studios SIN cuadrante (para mostrar advertencia)
    const sinCuadrante = State.studios.filter(function (s) { return !(normalizeQ(s.priorityQuadrant) || s.cuadrante || s.quadrant); }).length;

    // Diagnóstico — visible en consola del navegador
    console.info('[bandeja] conteoQ:', conteoQ, 'sin cuadrante:', sinCuadrante, 'total:', State.studios.length);

    return {
      cuadrantes: cuadrantes,
      sinCuadrante: sinCuadrante,
      enfriandose: pickEnfriandose(),
      altoPotencialVirgen: pickAltoPotencialVirgen(),
      visitasFallidas: pickVisitasFallidas(),
      refCruz: _getRefCruz(false),
      placspAlerts: pickPlacspAlerts(),
    };
  }

  function pickPlacspAlerts() {
    if (!State.studios) return [];
    var out = [];
    for (var i = 0; i < State.studios.length; i++) {
      var s = State.studios[i];
      if (!(s.data && s.data.tieneAlertaPlacsp)) continue;
      var adj = s.data.ultima_adjudicacion_placsp || {};
      out.push({
        studioId: s.id,
        name: s.name || s.id,
        titulo: adj.titulo || '',
        organismo: adj.organismo || '',
        fecha: adj.fecha || '',
        importe: adj.importe || null,
        lugar: adj.lugar || '',
        url: adj.url || '',
      });
    }
    out.sort(function (a, b) { return (b.fecha || '') > (a.fecha || '') ? 1 : -1; });
    return out;
  }

  function pickEnfriandose() {
    // score ≥7 con última interacción >45 días pero <365 (no nunca)
    const hace45 = new Date(State.today.getTime() - 45 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const hace365 = new Date(State.today.getTime() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const out = [];
    for (const s of State.studios) {
      if ((s.score || 0) < 7) continue;
      const last = U.lastInteraction(s);
      if (!last) continue;
      if (last >= hace45) continue;
      if (last < hace365) continue;
      out.push({
        studioId: s.id,
        name: s.name || s.id,
        tipo: TIPO_LABELS[s.type] || s.type || '—',
        province: s.province || '',
        dias: U.diasDesde(last),
        score: s.score || 0,
      });
    }
    out.sort(function (a, b) { return b.score - a.score || a.dias - b.dias; });
    return out.slice(0, 8);
  }

  function pickAltoPotencialVirgen() {
    const out = [];
    for (const s of State.studios) {
      if ((s.score || 0) < 8) continue;
      if (U.reports(s).length > 0) continue;
      out.push({
        studioId: s.id,
        name: s.name || s.id,
        tipo: TIPO_LABELS[s.type] || s.type || '—',
        city: s.city || '',
        province: s.province || '',
        score: s.score || 0,
      });
    }
    out.sort(function (a, b) { return b.score - a.score; });
    return out.slice(0, 8);
  }

  function pickVisitasFallidas() {
    const out = [];
    const re = /fallid|plantón|planton|cancel|reprogram|no\s+pud|no\s+realiz|no\s+asisti|no\s+contest|nadie\s+en\s+la|cerrad/i;
    for (const s of State.studios) {
      // Buscar en informes (title + notes)
      const reps = U.reports(s);
      const hitRep = reps.some(function (r) {
        const txt = (r.notes || '') + ' ' + (r.title || '') + ' ' + (r.fileName || '');
        return re.test(txt);
      });
      // Buscar en actividades (text + notes) — aquí están los apuntes reales de visita
      const acts = U.activities(s);
      const hitAct = acts.some(function (a) {
        const txt = (a.text || '') + ' ' + (a.notes || '') + ' ' + (a.description || '');
        return re.test(txt);
      });
      if (hitRep || hitAct) {
        const lastDate = (function () {
          const all = reps.concat(acts).map(function (x) { return x.date || x.createdAt || ''; }).filter(Boolean);
          return all.sort().pop() || null;
        })();
        out.push({
          studioId: s.id,
          name: s.name || s.id,
          province: s.province || '',
          lastDate: lastDate,
        });
      }
    }
    out.sort(function (a, b) { return (b.lastDate || '') > (a.lastDate || '') ? 1 : -1; });
    return out.slice(0, 10);
  }

  /* ============================================================
     REFERENCIAS CRUZADAS — detecta menciones de terceros en los
     apuntes de visita y las cruza con la cartera por provincia.
     Puerto del motor del legacy (gas-refcruz).
     ============================================================ */
  var _RC_CACHE_KEY = 'crm_refcruz_redesign_v1';
  var _RC_TTL = 24 * 60 * 60 * 1000;

  // Lista canónica centralizada en window.Util (compartida con el planificador).
  var _RC_PROVINCIAS = U.PROVINCIAS;

  var _RC_PATRONES = [
    { tipo: 'CCRR', re: /\b(Comunidad de Regantes (?:de |del? )?[A-ZÁÉÍÓÚÑ][a-záéíóúñ\-]+(?:[\s\-][A-ZÁÉÍÓÚÑA-Za-z]+){0,4})/g },
    { tipo: 'CCRR', re: /\b(C\.?R\.? de [A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s[A-Za-záéíóúñ]+){0,3})/g },
    { tipo: 'EDAR', re: /\b(EDAR (?:de |del? )?[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:[\s\-][A-Za-záéíóúñ]+)?)/g },
    { tipo: 'EDAR', re: /\b(ETAP (?:de |del? )?[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:[\s\-][A-Za-záéíóúñ]+)?)/g },
    { tipo: 'AAPP', re: /\b(Ayuntamiento (?:de |del? )?[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:[\s\-][A-Za-záéíóúñ]+){0,3})/g },
    { tipo: 'AAPP', re: /\b(Diputación (?:Provincial de |de )?[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)/g },
    { tipo: 'AAPP', re: /\b(Mancomunidad (?:de |del? )?[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s[A-Za-záéíóúñ]+){0,3})/g },
    { tipo: 'CICA', re: /\b(Aqualia|EMASESA|EMACSA|Hidralia|Hidragua|EMASA|EMUASA|EMASAGRA|Giahsa|Aguas de [A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)/g },
    { tipo: 'ARQ',  re: /\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){0,3}\s(?:Arquitectos?|Arquitectura|Interiorismo))\b/g },
    { tipo: 'ING',  re: /\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+ (?:Ingenieros?|Consultores?|Ingeniería|Técnicos?))\b/g },
  ];

  // Normalizador centralizado en window.Util (compartido con el planificador).
  var _rcNorm = U.normProv;

  function _rcInferirProvincia(txt) {
    for (var i = 0; i < _RC_PROVINCIAS.length; i++) {
      var p = _RC_PROVINCIAS[i];
      var re = new RegExp('\\b' + p.replace(/[áéíóúÁÉÍÓÚ]/g, '[a-záéíóúÁÉÍÓÚ]') + '\\b', 'i');
      if (re.test(txt)) return p;
    }
    return null;
  }

  function _rcEsRuido(nombre) {
    if (!nombre || nombre.length < 6) return true;
    if (/(?:de|del?|en|por|para|con|los|las|el|la)$/i.test(nombre)) return true;
    return false;
  }

  function _scanRefCruz(studios) {
    // Mapa nombre normalizado → studioId para cross-check con cartera
    var carteraMap = {};
    for (var i = 0; i < studios.length; i++) {
      var s = studios[i];
      carteraMap[_rcNorm(s.name || '')] = s.id;
    }

    var resultMap = {}; // key = nombre normalizado

    for (var si = 0; si < studios.length; si++) {
      var origen = studios[si];
      // Texto a escanear: actividades + notas de informes
      var textos = [];
      var acts = U.activities(origen);
      for (var ai = 0; ai < acts.length; ai++) {
        var t = (acts[ai].text || '') + ' ' + (acts[ai].notes || '');
        if (t.trim()) textos.push(t);
      }
      var reps = U.reports(origen);
      for (var ri = 0; ri < reps.length; ri++) {
        var rt = (reps[ri].notes || '') + ' ' + (reps[ri].title || '');
        if (rt.trim()) textos.push(rt);
      }

      var textoTotal = textos.join(' ');
      if (!textoTotal.trim()) continue;

      for (var pi = 0; pi < _RC_PATRONES.length; pi++) {
        var pat = _RC_PATRONES[pi];
        var re2 = new RegExp(pat.re.source, 'gi');
        var m;
        while ((m = re2.exec(textoTotal)) !== null) {
          var nombre = (m[1] || m[0]).trim();
          if (_rcEsRuido(nombre)) continue;
          var key = _rcNorm(nombre);
          if (key === _rcNorm(origen.name || '')) continue; // no auto-referencias
          var prov = _rcInferirProvincia(textoTotal.slice(Math.max(0, m.index - 120), m.index + 120));
          if (!resultMap[key]) {
            resultMap[key] = {
              nombre: nombre,
              tipo: pat.tipo,
              provinciaInferida: prov,
              matchStudioId: carteraMap[key] || null,
              origenes: [],
            };
          }
          // Evitar duplicar mismo origen
          var yaEsta = resultMap[key].origenes.some(function (o) { return o.origenId === origen.id; });
          if (!yaEsta) {
            resultMap[key].origenes.push({
              origenId: origen.id,
              origenName: origen.name || origen.id,
              origenProvincia: origen.province || '',
            });
          }
          if (prov && !resultMap[key].provinciaInferida) {
            resultMap[key].provinciaInferida = prov;
          }
        }
      }
    }

    return Object.values(resultMap).filter(function (r) { return r.origenes.length > 0; });
  }

  function _getRefCruz(force) {
    if (!force) {
      try {
        var raw = localStorage.getItem(_RC_CACHE_KEY);
        if (raw) {
          var j = JSON.parse(raw);
          if (j.ts && (Date.now() - j.ts) < _RC_TTL) return j.refs;
        }
      } catch (e) {}
    }
    if (!State.studios || !State.studios.length) return [];
    var refs = _scanRefCruz(State.studios);
    try { localStorage.setItem(_RC_CACHE_KEY, JSON.stringify({ ts: Date.now(), refs: refs })); } catch (e) {}
    return refs;
  }

  function refrescarRefCruz() {
    try { localStorage.removeItem(_RC_CACHE_KEY); } catch (e) {}
    render();
  }

  function mockData() {
    return {
      cuadrantes: [
        { q: 'Q1', label: 'Estratégico',     n: 0, activos: 0, color: 'var(--q-estrategico)',    fg: '#fff' },
        { q: 'Q2', label: 'Cliente core',    n: 0, activos: 0, color: 'var(--q-cliente-core)',   fg: '#fff' },
        { q: 'Q3', label: 'Cliente volumen', n: 0, activos: 0, color: 'var(--q-cliente-volumen)', fg: '#fff' },
        { q: 'Q4', label: 'Puerta entrada',  n: 0, activos: 0, color: 'var(--q-puerta)',         fg: '#fff' },
        { q: 'Q5', label: 'Cartera estándar', n: 0, activos: 0, color: 'var(--q-cartera)',       fg: '#fff' },
        { q: 'Q6', label: 'Mantenimiento',   n: 0, activos: 0, color: 'var(--q-mantenimiento)',  fg: '#fff' },
        { q: 'Q7', label: 'Conector',        n: 0, activos: 0, color: 'var(--q-conector)',       fg: '#fff' },
        { q: 'Q8', label: 'Seguimiento',     n: 0, activos: 0, color: 'var(--q-seguimiento)',    fg: '#fff' },
        { q: 'Q9', label: 'Congelar',        n: 0, activos: 0, color: 'var(--q-congelar)',       fg: 'var(--fg-1)' },
      ],
      sinCuadrante: 0,
      enfriandose: [],
      altoPotencialVirgen: [],
      visitasFallidas: [],
      refCruz: [],
      placspAlerts: [],
    };
  }

  /* ============================================================
     RENDER
     ============================================================ */
  var _provFiltro = '';

  function render(params) {
    const v = document.getElementById('view-bandeja');
    if (!v) return;
    if (params && params.provincia != null) _provFiltro = params.provincia;
    document.getElementById('topbar-current').textContent = 'Bandeja del agente';
    const d = getData();
    v.innerHTML = (
      '<div style="max-width:1180px; margin:0 auto;">' +
        header(d) +
        (d.sinCuadrante > 0 ? bannerSinCuadrante(d.sinCuadrante) : '') +
        (d.placspAlerts && d.placspAlerts.length ? placspSection(d.placspAlerts) : '') +
        matrizCuadrantes(d.cuadrantes) +
        twoColumnGrid(d) +
        accionesPendientesSection() +
      '</div>'
    );
    // Cargar acciones pendientes de forma asíncrona
    _loadAcciones();
  }

  /* ============================================================
     ACCIONES PENDIENTES — detectadas en informes de visita
     ============================================================ */
  function accionesPendientesSection() {
    return (
      '<div style="margin-top:24px;" id="bandeja-acciones-wrap">' +
        '<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">' +
          '<div>' +
            '<div class="eyebrow">Informes de visita</div>' +
            '<h2 style="font-family:var(--font-display); font-weight:600; font-size:20px; text-transform:uppercase; letter-spacing:.005em; margin:4px 0 0;">📋 Acciones pendientes</h2>' +
          '</div>' +
          '<button class="btn btn-ghost" style="font-size:12px;" ' +
            'onclick="window.Screens.bandeja._refrescarAcciones()" title="Re-procesar todos los informes">↺ Refrescar</button>' +
        '</div>' +
        '<div id="bandeja-acciones-list">' +
          '<span style="font-size:13px; color:var(--fg-3);">⏳ Detectando compromisos en los informes…</span>' +
        '</div>' +
      '</div>'
    );
  }

  var _accionesLoading = false;
  var _accionesById = {};   // id → acción, para resolverla desde el botón sin escapar texto en el onclick

  function _loadAcciones(force) {
    if (_accionesLoading && !force) return;
    var engine = window.AccionesEngine;
    if (!engine) {
      // AccionesEngine no disponible (JSZip no cargado o script no incluido)
      var el = document.getElementById('bandeja-acciones-list');
      if (el) el.innerHTML = '<span style="font-size:13px; color:var(--fg-3);">Motor de acciones no disponible (requiere JSZip).</span>';
      return;
    }
    _accionesLoading = true;
    var studios = State.studios || [];
    engine.cargarAcciones(studios, force).then(function (allItems) {
      _accionesLoading = false;
      var vigentes = engine.filtrarVigentes(allItems, studios);
      // Filtrar por provincia si está activo
      if (_provFiltro) {
        var norm = _rcNorm(_provFiltro);
        vigentes = vigentes.filter(function (it) { return _rcNorm(it.studioProvince) === norm; });
      }
      _renderAcciones(vigentes, allItems.length);
    }).catch(function (e) {
      _accionesLoading = false;
      var el = document.getElementById('bandeja-acciones-list');
      if (el) el.innerHTML = '<span style="font-size:13px; color:var(--mute-red-dark);">Error al procesar informes: ' + escape(e.message) + '</span>';
    });
  }

  function _renderAcciones(items, totalSinFiltrar) {
    var el = document.getElementById('bandeja-acciones-list');
    if (!el) return;
    if (items.length === 0) {
      el.innerHTML = '<p style="font-size:13px; color:var(--fg-3); margin:0;">' +
        (totalSinFiltrar === 0
          ? 'Sin compromisos detectados. Asegúrate de tener informes de visita en formato .docx.'
          : 'Sin acciones pendientes para la provincia seleccionada.') +
        '</p>';
      return;
    }
    var hoy = new Date().toISOString().slice(0, 10);
    var tipoBg = { llamada: '#3b82f6', email: '#8b5cf6', material: '#f59e0b', reunion: '#10b981' };
    // Etiqueta del botón de resolución según el tipo de acción.
    var resolveLabels = { email: '✨ Redactar email', reunion: '📅 Proponer fecha', material: '📦 Coordinar entrega', llamada: '📞 Llamar' };
    _accionesById = {};
    el.innerHTML = (
      '<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">' +
        items.slice(0, 30).map(function (it) {
          _accionesById[it.id] = it;
          var bg = tipoBg[it.tipo] || (it._fromActivity ? '#16a34a' : '#64748b');
          var urgente = it.fechaLimite && it.fechaLimite <= hoy;
          var plazoHtml = it.fechaLimite
            ? '<span style="background:' + (urgente ? '#fef2f2' : '#eff6ff') + ';color:' +
              (urgente ? '#991b1b' : '#1e40af') + ';padding:2px 7px;border-radius:6px;font-size:11px;font-weight:600;">' +
              (urgente ? '🔴' : '📅') + ' ' + escape(it.fechaLimite) + '</span>'
            : '';
          // Items de actividad: borde verde + botón "Hecho" que escribe en Supabase
          var esActiv = !!it._fromActivity;
          var borderStyle = esActiv ? 'border-left:3px solid #16a34a;' : (urgente ? 'border-left:3px solid #dc2626;' : '');
          var btnCompletar = esActiv
            ? '<button class="btn btn-primary" style="font-size:11px; padding:4px 10px; background:#16a34a; border-color:#16a34a;" ' +
                'onclick="window.Screens.bandeja._completar(\'' + escape(it._studioId) + '\',' + it._activityIdx + ')">✓ Hecho</button>'
            : '';
          // Botón de resolución directa: email/reunión/material → compositor IA; llamada → tel:
          var resolveLabel = resolveLabels[it.tipo];
          var btnResolver = resolveLabel
            ? '<button class="btn btn-primary" style="font-size:11px; padding:4px 10px;" ' +
                'onclick="window.Screens.bandeja._resolver(\'' + escape(String(it.id)) + '\')">' + resolveLabel + '</button>'
            : '';
          return (
            '<div style="background:var(--bg-card); border:1px solid var(--line); border-radius:10px; padding:12px; ' + borderStyle + '">' +
              '<div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:6px;">' +
                '<span style="background:' + bg + ';color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px;">' +
                  it.tipoIcon + ' ' + it.tipo.toUpperCase() +
                '</span>' +
                (esActiv ? '<span style="background:#dcfce7;color:#166534;font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px;">BANDEJA</span>' : '') +
                '<strong style="font-size:13px; color:var(--gpf-blue-700); cursor:pointer;" ' +
                  'onclick="showView(\'detail\',{studioId:\'' + escape(it.studioId) + '\'})">' +
                  escape(it.studioName) +
                '</strong>' +
                '<span style="font-size:11px; color:var(--fg-3);">(' + escape(it.studioProvince) + ')</span>' +
                plazoHtml +
              '</div>' +
              '<div style="font-size:12px; color:var(--fg-2); margin-bottom:8px; ' + (esActiv ? 'font-weight:500;color:var(--fg-1);' : 'font-style:italic;') + '">' +
                (esActiv ? '' : '"') + escape(it.descripcion) + (esActiv ? '' : '"') +
              '</div>' +
              '<div style="display:flex; gap:6px; flex-wrap:wrap;">' +
                btnResolver +
                btnCompletar +
                '<button class="btn btn-ghost" style="font-size:11px; padding:4px 10px;" ' +
                  'onclick="window.Screens.bandeja._descartar(\'' + it.id + '\'' + (esActiv ? ',\'' + escape(it._studioId) + '\',' + it._activityIdx : '') + ')">✕ Descartar</button>' +
                '<a href="#detail/' + escape(it.studioId) + '" class="btn btn-ghost" style="font-size:11px; padding:4px 10px;" ' +
                  'onclick="showView(\'detail\',{studioId:\'' + escape(it.studioId) + '\'});return false;">Ver ficha →</a>' +
              '</div>' +
            '</div>'
          );
        }).join('') +
      '</div>' +
      (items.length > 30 ? '<p style="font-size:12px; color:var(--fg-3); margin-top:8px; text-align:center;">… y ' + (items.length - 30) + ' más · filtra por provincia para acotar.</p>' : '')
    );
  }

  function _descartarAccion(id, studioId, actIdx) {
    var engine = window.AccionesEngine;
    // Si es una actividad de bandeja, marcarla como completada en Supabase
    if (studioId !== undefined && actIdx !== undefined) {
      engine && engine.completarActividad && engine.completarActividad(studioId, actIdx).then(function () {
        window.showNotification && window.showNotification('✕ Acción descartada', 'info');
        _loadAcciones(true);
        // Re-render actividades si el usuario está en esa ficha
        if (window.Screens && window.Screens.detail && window.State && window.State.currentStudioId === studioId) {
          window.Screens.detail.switchTab('actividades', studioId);
        }
      });
      return;
    }
    if (engine) engine.descartar(id);
    window.showNotification && window.showNotification('✕ Acción descartada', 'info');
    _loadAcciones();
  }

  async function _completarAccion(studioId, actIdx) {
    var engine = window.AccionesEngine;
    if (!engine || !engine.completarActividad) return;
    try {
      await engine.completarActividad(studioId, actIdx);
      window.showNotification && window.showNotification('✓ Acción completada', 'success');
      _loadAcciones(true);
      // Refrescar actividades si la ficha está abierta
      if (window.Screens && window.Screens.detail && window.State && window.State.currentStudioId === studioId) {
        window.Screens.detail.switchTab('actividades', studioId);
      }
    } catch (e) {
      window.showNotification && window.showNotification('Error al completar: ' + e.message, 'error');
    }
  }

  function _refrescarAcciones() {
    var engine = window.AccionesEngine;
    if (engine) engine.invalidarCache();
    _accionesLoading = false;
    window.showNotification && window.showNotification('🔄 Re-procesando informes…', 'info');
    _loadAcciones(true);
  }

  function placspSection(rows) {
    return (
      '<div style="background:#fffbeb; border:1px solid #fcd34d; border-left:4px solid #f59e0b; ' +
        'border-radius:8px; padding:14px 16px; margin-bottom:20px;">' +
        '<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">' +
          '<div style="display:flex; align-items:center; gap:8px;">' +
            '<span style="font-size:18px;">🏆</span>' +
            '<div>' +
              '<div style="font-size:14px; font-weight:700; color:#78350f;">Contratos públicos recientes</div>' +
              '<div style="font-size:12px; color:#92400e;">Empresas de tu cartera que han ganado licitaciones públicas (PLACSP)</div>' +
            '</div>' +
          '</div>' +
          '<span style="background:#fef3c7; color:#92400e; font-size:12px; font-weight:700; ' +
            'padding:3px 10px; border-radius:12px; font-family:var(--font-mono);">' + rows.length + ' alerta' + (rows.length === 1 ? '' : 's') + '</span>' +
        '</div>' +
        '<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:8px;">' +
          rows.map(function (r) {
            var importeStr = r.importe ? ' · ' + Math.round(r.importe / 1000) + 'k€' : '';
            var titleShort = (r.titulo || '').length > 70 ? r.titulo.slice(0, 70) + '…' : r.titulo;
            return (
              '<div style="background:#fff; border:1px solid #fcd34d; border-radius:6px; padding:10px 12px; ' +
                'cursor:pointer; transition:box-shadow .15s;" ' +
                'onclick="showView(\'detail\', { studioId: \'' + escape(r.studioId) + '\' })" ' +
                'onmouseover="this.style.boxShadow=\'0 2px 8px rgba(245,158,11,.25)\'" ' +
                'onmouseout="this.style.boxShadow=\'none\'">' +
                '<div style="font-size:14px; font-weight:600; color:var(--fg-1); margin-bottom:3px;">' +
                  escape(r.name) +
                '</div>' +
                '<div style="font-size:12px; color:var(--fg-3); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" ' +
                  'title="' + escape(r.titulo) + '">' +
                  escape(titleShort || r.organismo) +
                '</div>' +
                '<div style="display:flex; gap:8px; margin-top:6px; font-size:11px; font-family:var(--font-mono);">' +
                  (r.fecha ? '<span style="color:var(--fg-3);">' + escape(r.fecha) + '</span>' : '') +
                  (importeStr ? '<span style="color:#d97706; font-weight:600;">' + escape(importeStr.replace(' · ', '')) + '</span>' : '') +
                  (r.lugar ? '<span style="color:var(--fg-3);">· ' + escape(r.lugar) + '</span>' : '') +
                '</div>' +
              '</div>'
            );
          }).join('') +
        '</div>' +
      '</div>'
    );
  }

  function bannerSinCuadrante(n) {
    return (
      '<div style="background:var(--gpf-blue-100); border:1px solid #c7dcef; border-radius:8px; ' +
        'padding:10px 14px; margin-bottom:16px; font-size:13px; color:var(--gpf-blue-900); ' +
        'display:flex; align-items:center; gap:8px;">' +
        '<span style="color:var(--gpf-blue-700);">' + I.AlertTriangle() + '</span>' +
        '<span><strong>' + n + ' estudios todavía sin clasificar en cuadrante</strong> · ' +
        'el batch nocturno los va asignando progresivamente. ' +
        'La cuenta total bajará a medida que se completen.</span>' +
      '</div>'
    );
  }

  function header(d) {
    const fecha = State.today.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
    const fechaCap = fecha.charAt(0).toUpperCase() + fecha.slice(1);
    const INPUT_STYLE = 'padding:8px 12px; border:1.5px solid var(--line); border-radius:8px; ' +
      'font-size:13px; background:var(--bg-card); color:var(--fg-1); cursor:pointer;';
    return (
      '<header style="margin-bottom:20px; display:flex; flex-wrap:wrap; gap:12px; align-items:flex-end; justify-content:space-between;">' +
        '<div>' +
          '<div class="eyebrow">Agente CRM · ' + escape(fechaCap) + '</div>' +
          '<h1 style="font-family:var(--font-display); font-weight:600; font-size:32px; line-height:1; ' +
            'text-transform:uppercase; letter-spacing:.005em; margin:6px 0 4px;">Bandeja del agente</h1>' +
          '<p style="color:var(--fg-3); font-size:14px; margin:0;">Acciones priorizadas · referencias cruzadas de visitas.</p>' +
        '</div>' +
        '<div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">' +
          '<select style="' + INPUT_STYLE + '" ' +
            'onchange="window.Screens.bandeja.filtrarProvincia(this.value)">' +
            '<option value="">Todas las provincias</option>' +
            _RC_PROVINCIAS.map(function (p) {
              return '<option value="' + escape(p) + '"' + (_provFiltro === p ? ' selected' : '') + '>' + escape(p) + '</option>';
            }).join('') +
          '</select>' +
          '<button style="padding:8px 12px; border:1.5px solid var(--line); border-radius:8px; font-size:13px; ' +
            'background:var(--bg-card); cursor:pointer; color:var(--fg-3);" ' +
            'onclick="window.Screens.bandeja.refrescar()" title="Re-procesar referencias cruzadas">↺ Refrescar</button>' +
        '</div>' +
      '</header>'
    );
  }

  function matrizCuadrantes(cuadrantes) {
    return (
      '<section style="margin-bottom:24px;">' +
        '<div class="eyebrow" style="margin-bottom:10px;">Cuadrantes · scoring por influencia × red</div>' +
        '<div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px;">' +
          cuadrantes.map(function (q) {
            return (
              '<div style="background:' + q.color + '; color:' + q.fg + '; border-radius:8px; padding:12px 14px; cursor:pointer;" ' +
                'onclick="showView(\'studios\')">' +
                '<div style="font-family:var(--font-mono); font-size:11px; opacity:.8; letter-spacing:.08em; font-weight:600;">' + q.q + '</div>' +
                '<div style="font-family:var(--font-display); font-weight:700; font-size:18px; line-height:1.1; margin-top:2px;">' + escape(q.label) + '</div>' +
                '<div style="display:flex; align-items:baseline; gap:6px; margin-top:8px; font-family:var(--font-mono); font-size:12px; opacity:.85;">' +
                  '<span style="font-family:var(--font-display); font-size:22px; font-weight:600;">' + q.n + '</span>' +
                  '<span>empresa' + (q.n === 1 ? '' : 's') + '</span>' +
                  (q.activos > 0 ? '<span>· ' + q.activos + ' activa' + (q.activos === 1 ? '' : 's') + ' (30d)</span>' : '') +
                '</div>' +
              '</div>'
            );
          }).join('') +
        '</div>' +
      '</section>'
    );
  }

  function twoColumnGrid(d) {
    // Filtrar referencias por provincia seleccionada
    var rcFiltradas = d.refCruz || [];
    if (_provFiltro) {
      var provN = _rcNorm(_provFiltro);
      rcFiltradas = rcFiltradas.filter(function (r) {
        if (r.provinciaInferida && _rcNorm(r.provinciaInferida) === provN) return true;
        return (r.origenes || []).some(function (o) { return _rcNorm(o.origenProvincia) === provN; });
      });
    }
    return (
      '<div style="display:grid; grid-template-columns:1fr 1fr; gap:18px;">' +
        cardEnfriandose(d.enfriandose) +
        cardAltoPotencial(d.altoPotencialVirgen) +
        cardVisitasFallidas(d.visitasFallidas) +
        cardReferencias(rcFiltradas, (d.refCruz || []).length) +
      '</div>'
    );
  }

  function cardEnfriandose(rows) {
    return (
      '<div class="card" style="padding:16px;">' +
        cardHeader('Cuentas enfriándose', rows.length, 'var(--mute-red)', 'chip-red', I.AlertTriangle()) +
        '<p style="font-size:13px; color:var(--fg-3); margin:0 0 12px;">+45 días sin contacto con score ≥7. Toca reactivar antes de que se duerman del todo.</p>' +
        rows.map(function (s) {
          return (
            '<div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-top:1px solid var(--line); cursor:pointer;" ' +
              'onclick="showView(\'detail\', { studioId: \'' + escape(s.studioId) + '\' })">' +
              '<div style="min-width:0; flex:1;">' +
                '<div style="font-size:14px; font-weight:600; color:var(--fg-1); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + escape(s.name) + '</div>' +
                '<div style="font-size:12px; color:var(--fg-3);">' + escape(s.tipo + ' · ' + s.province) + '</div>' +
              '</div>' +
              '<div style="text-align:right; flex:0 0 auto;">' +
                '<div style="font-family:var(--font-mono); font-size:12px; color:var(--mute-red-dark); font-weight:600;">' + s.dias + 'd</div>' +
                '<div style="font-size:11px; color:var(--fg-3);">score ' + s.score + '</div>' +
              '</div>' +
            '</div>'
          );
        }).join('') +
      '</div>'
    );
  }

  function cardAltoPotencial(rows) {
    return (
      '<div class="card" style="padding:16px;">' +
        cardHeader('Alto potencial sin visitar', rows.length, 'var(--gpf-blue-700)', 'chip-accent', I.Target()) +
        '<p style="font-size:13px; color:var(--fg-3); margin:0 0 12px;">Score ≥8 que nunca has visitado. Prioridad de calle.</p>' +
        rows.map(function (s) {
          return (
            '<div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-top:1px solid var(--line); cursor:pointer;" ' +
              'onclick="showView(\'detail\', { studioId: \'' + escape(s.studioId) + '\' })">' +
              '<div style="min-width:0; flex:1;">' +
                '<div style="font-size:14px; font-weight:600; color:var(--fg-1); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + escape(s.name) + '</div>' +
                '<div style="font-size:12px; color:var(--fg-3);">' + escape(s.tipo + ' · ' + s.city + ' · ' + s.province) + '</div>' +
              '</div>' +
              '<div style="text-align:right; flex:0 0 auto;">' +
                '<div style="font-family:var(--font-mono); font-size:12px; color:var(--gpf-blue-700); font-weight:600;">score ' + s.score + '</div>' +
              '</div>' +
            '</div>'
          );
        }).join('') +
      '</div>'
    );
  }

  function cardVisitasFallidas(rows) {
    return (
      '<div class="card" style="padding:16px; grid-column:span 2;">' +
        cardHeader('Visitas fallidas o a reprogramar', rows.length, 'var(--fg-2)', 'chip', I.AlertTriangle()) +
        (rows.length
          ? '<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px 24px;">' +
              rows.map(function (s) {
                return (
                  '<div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-top:1px solid var(--line); cursor:pointer;" ' +
                    'onclick="showView(\'detail\', { studioId: \'' + escape(s.studioId) + '\' })">' +
                    '<div style="min-width:0; flex:1;">' +
                      '<div style="font-size:14px; font-weight:600; color:var(--fg-1); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + escape(s.name) + '</div>' +
                      '<div style="font-size:12px; color:var(--fg-3);">' + escape(s.province || '') + '</div>' +
                    '</div>' +
                    '<span style="color:var(--fg-muted);">' + I.ChevronRight() + '</span>' +
                  '</div>'
                );
              }).join('') +
            '</div>'
          : '<div style="padding:16px 0; color:var(--fg-3); font-size:13px; text-align:center;">Sin visitas fallidas recientes.</div>') +
      '</div>'
    );
  }

  function cardReferencias(rows, total) {
    var TIPO_COLORS = {
      CCRR: { bg: '#e0f2fe', fg: '#0369a1', label: 'C.R.' },
      EDAR: { bg: '#ede9fe', fg: '#5b21b6', label: 'EDAR/ETAP' },
      AAPP: { bg: '#fef9c3', fg: '#854d0e', label: 'AAPP' },
      CICA: { bg: '#dcfce7', fg: '#166534', label: 'Ciclo Agua' },
      ARQ:  { bg: '#fff7ed', fg: '#9a3412', label: 'Arquitectura' },
      ING:  { bg: '#fce7f3', fg: '#9d174d', label: 'Ingeniería' },
    };
    var countLabel = rows.length + (total > rows.length ? '/' + total : '');
    var cardH = cardHeader('Referencias cruzadas', countLabel, 'var(--gpf-blue-700)', 'chip-accent', I.Target());
    var subtext = _provFiltro
      ? '<p style="font-size:13px; color:var(--fg-3); margin:0 0 12px;">Entidades mencionadas en apuntes de visita que podrían ser prospectos en <strong>' + escape(_provFiltro) + '</strong>.</p>'
      : '<p style="font-size:13px; color:var(--fg-3); margin:0 0 12px;">Entidades mencionadas en tus apuntes de visita. Filtra por provincia para enfocar tu ruta de captación.</p>';
    var body;
    if (rows.length === 0) {
      body = (
        '<div style="padding:20px 0; color:var(--fg-3); font-size:13px; text-align:center;">' +
          (_provFiltro
            ? 'Sin referencias para <strong>' + escape(_provFiltro) + '</strong>. Prueba otra provincia o pulsa ↺ Refrescar.'
            : 'Sin referencias cruzadas aún. Añade apuntes de visita para que el motor detecte menciones de terceros.') +
        '</div>'
      );
    } else {
      body = (
        '<div style="display:grid; grid-template-columns:1fr 1fr; gap:0 24px;">' +
          rows.slice(0, 20).map(function (r) {
            var tc = TIPO_COLORS[r.tipo] || { bg: '#f0f0f0', fg: '#555', label: r.tipo };
            var badge = (
              '<span style="font-size:10px; font-weight:600; font-family:var(--font-mono); letter-spacing:.04em; ' +
                'padding:2px 6px; border-radius:4px; background:' + tc.bg + '; color:' + tc.fg + '; flex-shrink:0;">' +
                escape(tc.label) +
              '</span>'
            );
            var origenes = r.origenes || [];
            var origDesc = origenes.slice(0, 3).map(function (o) { return o.origenName; }).join(', ');
            if (origenes.length > 3) origDesc += ' +' + (origenes.length - 3);
            var enCartera = r.matchStudioId
              ? '<span style="font-size:11px; color:var(--gpf-blue-600); font-weight:600; margin-left:4px; flex-shrink:0;">↗ cartera</span>'
              : '';
            var rowClick = r.matchStudioId
              ? 'onclick="showView(\'detail\', { studioId: \'' + escape(r.matchStudioId) + '\' })" '
              : '';
            return (
              '<div ' + rowClick + 'style="padding:9px 0; border-top:1px solid var(--line); cursor:' + (r.matchStudioId ? 'pointer' : 'default') + ';">' +
                '<div style="display:flex; align-items:center; gap:6px; min-width:0;">' +
                  badge +
                  '<span style="font-size:13px; font-weight:600; color:var(--fg-1); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;" ' +
                    'title="' + escape(r.nombre) + '">' + escape(r.nombre) + '</span>' +
                  enCartera +
                '</div>' +
                '<div style="font-size:11px; color:var(--fg-3); margin-top:2px;">' +
                  (r.provinciaInferida ? '<span style="color:var(--fg-2); font-weight:500;">' + escape(r.provinciaInferida) + '</span> · ' : '') +
                  'visto en: ' + escape(origDesc) +
                '</div>' +
              '</div>'
            );
          }).join('') +
        '</div>'
      );
    }
    return (
      '<div class="card" style="padding:16px; grid-column:span 2;">' +
        cardH + subtext + body +
      '</div>'
    );
  }

  function cardHeader(title, n, iconColor, chipClass, iconHtml) {
    return (
      '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">' +
        '<div style="display:flex; align-items:center; gap:8px;">' +
          '<span style="color:' + iconColor + ';">' + iconHtml + '</span>' +
          '<h3 style="font-family:var(--font-display); font-weight:600; font-size:16px; text-transform:uppercase; letter-spacing:.01em; margin:0;">' + escape(title) + '</h3>' +
        '</div>' +
        '<span class="chip ' + chipClass + '">' + n + '</span>' +
      '</div>'
    );
  }

  /* ============================================================
     EXPORT
     ============================================================ */
  window.Screens = window.Screens || {};
  window.Screens.bandeja = {
    render: render,
    filtrarProvincia: function (prov) { _provFiltro = prov; render(); },
    refrescar: refrescarRefCruz,
    // Getter de solo lectura del escáner de referencias cruzadas (lo consume el
    // panel "Pendiente en la zona" del planificador). Usa la caché (24h TTL).
    getRefCruz: function () { return _getRefCruz(false); },
    _descartar: _descartarAccion,
    _completar: _completarAccion,
    _refrescarAcciones: _refrescarAcciones,
    _resolver: function (id) {
      var it = _accionesById[id];
      if (!it) return;
      if (window.Screens && window.Screens.detail && window.Screens.detail.resolverAccion) {
        window.Screens.detail.resolverAccion(it.studioId, it.tipo, it.descripcion);
      }
    },
  };
})();
