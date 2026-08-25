/* CRM Prospector · rediseño v1 · Ficha completa del cliente
 *
 * 2026-05-25 — Versión con todas las secciones del legacy integradas:
 *   Resumen · Proyectos · Equipo · Actividades · Informes · Pipeline
 *
 * Datos reales desde State.studiosById[id].data.*
 * Escrituras via window.Data.patchDoc('studios/{id}', { data: {...} })
 */
(function () {
  'use strict';

  const I = window.Icon;
  const State = window.State;
  const U = window.Util;
  const escape = U.escapeHtml;

  /* ============================================================
     ESTADO DEL MÓDULO
     ============================================================ */
  let _tab = 'resumen';
  let _studioId = null;
  let _importState = null; // { yaml, fileName, validationErrors, warnings }

  var TIPOS_VISITA_VALIDOS = ['primera_visita','seguimiento','demo','propuesta','negociacion','cierre','postventa'];
  var ESTADOS_VALIDOS = ['nuevo','contactado','reunion','propuesta','negociacion','ganado','perdido','dormido'];

  /* ============================================================
     MOCK CATALOG (fallback cuando no hay datos reales)
     ============================================================ */
  const MOCK = {
    '3012': {
      id: '3012', name: 'J. Huesa Water Technology', type: 'ARQ',
      cuadrante: 'Q9', priority: null, city: 'Bollullos de la Mitación',
      province: 'Sevilla', address: 'Av. Valencina 25',
      phone: '+34 955 600 808', email: 'jhuesa@jhuesa.com', web: 'jhuesa.com',
      comercial: 'Manuel Sayago', tecnico: 'Rafael Amador', createdAt: '2026-05-07',
      briefingPreview: 'Empresa en Bollullos. Cuadrante Q9 — primera reunión.',
      briefingFecha: '22 may 2026', data: { team: [], activities: [], projects: [], reports: [] },
    },
    '2435': {
      id: '2435', name: 'ARRAM Consultores', type: 'ING',
      cuadrante: 'Q4', priority: 'alta', city: 'Badajoz', province: 'Badajoz',
      address: 'Av. Sinforiano Madroñero 5', phone: '+34 924 244 200',
      email: 'arram@arram.es', web: 'arram.es',
      comercial: 'Manuel Fernández', tecnico: 'Joseba Robles', createdAt: '2026-03-10',
      briefingPreview: 'Consultora extremeña con histórico en proyectos PRTR.',
      briefingFecha: '21 may 2026', data: { team: [], activities: [], projects: [], reports: [] },
    },
  };

  /* ============================================================
     LABELS
     ============================================================ */
  const TIPO_LABELS = {
    ARQ: 'Arquitectura', ING: 'Ingeniería', CCRR: 'C.R. Regantes',
    OCV: 'Promotora · Constructora', CICA: 'Ciclo del agua', AAPP: 'Admin. Pública',
  };
  const CUADRANTE_LABELS = {
    Q1: 'Q1 · Estratégico', Q2: 'Q2 · Core', Q3: 'Q3 · Volumen',
    Q4: 'Q4 · Puerta', Q5: 'Q5 · Estándar', Q6: 'Q6 · Mantenimiento',
    Q7: 'Q7 · Conector', Q8: 'Q8 · Seguimiento', Q9: 'Q9 · Congelar',
  };
  const STATUS_LABELS = {
    nuevo: 'Nuevo', contactado: 'Contactado', reunion: 'Reunión',
    propuesta: 'Propuesta', ganado: 'Ganado', perdido: 'Perdido', dormido: 'Dormido',
  };
  const STATUS_COLORS = {
    nuevo: '#1f72c7', contactado: '#0ea5e9', reunion: '#7c3aed',
    propuesta: '#f59e0b', ganado: '#22c55e', perdido: '#ef4444', dormido: '#94a3b8',
  };
  const ACT_LABELS = {
    llamada: 'Llamada', email: 'Email', reunion: 'Reunión',
    nota: 'Nota', evento: 'Evento', registro_visita: 'Visita',
  };
  const ACT_COLORS = {
    llamada: '#1f72c7', email: '#0ea5e9', reunion: '#7c3aed',
    nota: '#f59e0b', evento: '#22c55e', registro_visita: '#c8102e',
  };
  const PROYECTO_ESTADO = {
    en_preparacion: 'En preparación', convocado: 'Convocado',
    adjudicado: 'Adjudicado', en_ejecucion: 'En ejecución', ejecutado: 'Ejecutado',
  };

  /* ============================================================
     HELPERS DE DATOS
     ============================================================ */
  function arr(v) { return Array.isArray(v) ? v : []; }

  function getStudio(id) {
    if (State.studiosById && State.studiosById[id]) return normalizarReal(State.studiosById[id]);
    if (MOCK[id]) return MOCK[id];
    return null;
  }

  function normalizeQ(v) {
    if (v == null) return null;
    if (typeof v === 'string' && /^Q[1-9]$/.test(v)) return v;
    if (typeof v === 'number' && v >= 1 && v <= 9) return 'Q' + v;
    if (typeof v === 'string' && /^[1-9]$/.test(v)) return 'Q' + v;
    return null;
  }

  function normalizarReal(s) {
    const contact = (s.data && s.data.contact) || {};
    const studio  = (s.data && s.data.studio)  || {};
    return {
      id: s.id,
      name: s.name || s.id,
      type: s.type,
      cuadrante: normalizeQ(s.priorityQuadrant) || s.cuadrante || s.quadrant,
      cuadranteName: s.priorityQuadrantName || null,
      scoringConfianza: s.scoringConfianza || null,
      recommendedAction: s.priorityRecommendedAction || null,
      scoreDirect: s.priorityDirectScore || null,
      scoreNetwork: s.priorityNetworkScore || null,
      priority: s.priority,
      status: s.status,
      city: s.city,
      province: s.province,
      address: U.readField(contact.address),
      phone: U.readField(contact.phone),
      email: U.readField(contact.email),
      web: U.readField(contact.web),
      founded: U.readField(studio.founded),
      description: s.description || studio.description || (s.data && s.data.description) || null,
      comercial: s.comercialAsignado || s.comercial || '—',
      tecnico: s.tecnicoAsignado || s.tecnico || '—',
      createdAt: s.createdAt,
      briefingPreview: null,
      briefingFecha: null,
      // Arrays
      team:       arr((s.data && s.data.team) || s.team),
      activities: arr((s.data && s.data.activities) || s.activities),
      projects:   arr((s.data && s.data.projects)   || s.projects),
      reports:    arr((s.data && s.data.reports)     || s.reports),
      // Pipeline
      b2bTimeline: s.b2bTimeline || null,
      // Raw data (para saves)
      _data: s.data || {},
      _raw: s,
    };
  }

  /* ============================================================
     SAVES — actualizan data JSONB completo
     ============================================================ */
  async function saveDataField(studioId, field, value) {
    const raw = State.studiosById && State.studiosById[studioId];
    if (!raw) throw new Error('Studio no encontrado en State');
    const currentData = Object.assign({}, raw.data || {});
    currentData[field] = value;
    const updated = await window.Data.patchDoc('studios/' + studioId, { data: currentData });
    // Actualizar State local
    if (raw) {
      raw.data = currentData;
      raw[field] = value;
      if (State.studiosById) State.studiosById[studioId] = raw;
    }
    return updated;
  }

  async function saveTopFields(studioId, obj) {
    const updated = await window.Data.patchDoc('studios/' + studioId, obj);
    if (State.studiosById && State.studiosById[studioId]) {
      Object.assign(State.studiosById[studioId], obj);
    }
    return updated;
  }

  function notif(msg, type) {
    if (window.States && window.States.showToast) window.States.showToast(msg, type);
    else console.info('[detail]', msg);
  }

  /* ============================================================
     RENDER PRINCIPAL
     ============================================================ */
  function render(params) {
    const v = document.getElementById('view-detail');
    if (!v) return;

    // Sin fallback a una ficha demo: si no llega un studioId válido, getStudio
    // devolverá null y se mostrará el emptyState (antes caía a '3012' = J. Huesa,
    // por lo que pernoctas/entradas sin ficha abrían esa tarjeta por error).
    const id = (params && params.studioId) || State.currentStudioId || '';
    if (params && params.tab) _tab = params.tab;
    _studioId = id;

    const studio = getStudio(id);

    document.getElementById('topbar-current').textContent = studio ? studio.name : 'Ficha cliente';

    if (!studio) {
      v.innerHTML = emptyState(id);
      return;
    }

    State.currentStudioId = studio.id;
    v.innerHTML = renderFull(studio);
    wireCTAs(studio);

    // Carga asíncrona del briefing más reciente para actualizar la preview
    if (window.Data && window.Data.getBriefingItems) {
      var _renderedId = id;
      window.Data.getBriefingItems(_renderedId, 1).then(function (items) {
        // Verificar que el usuario sigue en la misma ficha
        if (State.currentStudioId !== _renderedId) return;
        if (!items || !items.length) return;
        var latest = items[0];
        if (!latest.markdown && !(latest.briefing && typeof latest.briefing === 'object')) return;
        var previewEl = document.getElementById('detail-briefing-preview');
        var fechaEl = document.getElementById('detail-briefing-fecha');
        if (previewEl) {
          var previewText = latest.markdown
            ? latest.markdown.replace(/^#+\s*/mg, '').replace(/\*\*/g, '').replace(/\n+/g, ' ').slice(0, 220).trim() + '…'
            : 'Briefing disponible';
          previewEl.innerHTML = '<span style="color:var(--fg-2);">' + previewText + '</span>';
        }
        if (fechaEl && (latest.generated_at || latest.fecha_visita)) {
          var d = latest.generated_at || latest.fecha_visita;
          fechaEl.textContent = 'Generado ' + (typeof U !== 'undefined' ? U.formatDateES(d) : d.slice(0, 10));
        }
      }).catch(function () {});
    }
  }

  /* Aviso persistente: ficha nueva sin datos de investigación (la auto-
     investigación falló o no encontró nada — típicamente una URL incorrecta).
     Se muestra en la ficha hasta que tenga equipo o descripción. */
  function _enrichBanner(s) {
    var team = (s.data && s.data.team) || s.team || [];
    var desc = (s.data && s.data.description) || s.description || '';
    var status = s.status || s.estado || '';
    if (status !== 'nuevo') return '';
    if ((team && team.length) || String(desc).trim()) return '';   // ya investigada
    var c = (s.data && s.data.contact) || {};
    var web = (c.web && c.web.valor) || c.web || s.web || '';
    var hint = web
      ? 'Revisa que la URL de la web sea correcta (<strong>' + escape(web) + '</strong>) y vuelve a investigar.'
      : 'Añade la URL de su web para que la investigación pueda completar la ficha.';
    return (
      '<div style="background:#fffbeb; border:1px solid #fde68a; border-radius:12px; padding:14px 16px; margin:12px 0;">' +
        '<div style="display:flex; gap:10px; align-items:flex-start;">' +
          '<span style="font-size:20px; flex:0 0 auto;">🔍</span>' +
          '<div style="flex:1; min-width:0;">' +
            '<div style="font-size:14px; font-weight:700; color:#92400e; margin-bottom:2px;">Ficha sin investigar</div>' +
            '<div style="font-size:13px; color:#92400e; line-height:1.45;">No hay equipo ni descripción: la investigación automática no encontró datos. ' + hint + '</div>' +
            '<div style="margin-top:10px;">' +
              '<button class="btn btn-primary" data-action="enrich" style="font-size:13px; padding:6px 12px;">🔍 Investigar ahora</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function renderFull(s) {
    const isMobile = window.innerWidth < 700;
    return (
      '<div style="max-width:720px; margin:0 auto; padding-bottom:60px;">' +
        headerBlock(s) +
        _enrichBanner(s) +
        tabBar(s) +
        '<div id="detail-panel" style="margin-top:16px;">' +
          renderPanel(s, _tab) +
        '</div>' +
      '</div>' +
      /* Barra de acción sticky — sólo en móvil (<700px) */
      (isMobile ? stickyActionBar(s) : '')
    );
  }

  /* Barra fija con las 3 acciones más usadas en campo */
  function stickyActionBar(s) {
    const phone = s.phone ? s.phone.replace(/[^\d+]/g, '') : '';
    const I = window.Icon;
    return (
      '<div class="detail-action-bar">' +
        (phone
          ? '<a class="dab-btn" href="tel:' + escape(phone) + '">' + I.Phone() + ' Llamar</a>'
          : '<button class="dab-btn" style="opacity:.4" disabled>' + I.Phone() + ' Llamar</button>') +
        '<button class="dab-btn" onclick="showView(\'briefing\', {studioId:\'' + escape(s.id) + '\'})">' +
          I.Sparkles() + ' Briefing' +
        '</button>' +
        '<button class="dab-btn primary" onclick="showView(\'informe\', {studioId:\'' + escape(s.id) + '\'})">' +
          I.FileText() + ' Informe' +
        '</button>' +
      '</div>'
    );
  }

  function renderPanel(s, tab) {
    switch (tab) {
      case 'proyectos':   return panelProyectos(s);
      case 'equipo':      return panelEquipo(s);
      case 'actividades': return panelActividades(s);
      case 'informes':    return panelInformes(s);
      case 'pipeline':    return panelPipeline(s);
      default:            return panelResumen(s);
    }
  }

  /* ============================================================
     HEADER — identidad + contacto rápido (sin botón legacy)
     ============================================================ */
  function headerBlock(s) {
    const initials    = U.studioInitials(s.name);
    const tipoLabel   = TIPO_LABELS[s.type] || (s.type || '—');
    const cuadLabel   = CUADRANTE_LABELS[s.cuadrante] || (s.cuadrante || '—');
    const statusColor = STATUS_COLORS[s.status] || '#94a3b8';
    const statusLabel = STATUS_LABELS[s.status] || (s.status || 'Nuevo');
    const fullAddr    = [s.address, s.city, s.province].filter(Boolean).join(', ');

    return (
      '<div style="margin-bottom:4px;">' +
        /* Avatar + nombre + chips */
        '<div style="display:flex; gap:14px; align-items:flex-start; margin-bottom:14px;">' +
          '<div style="width:56px; height:56px; border-radius:10px; background:var(--gpf-blue-900); color:#fff; ' +
            'display:flex; align-items:center; justify-content:center; font-family:var(--font-display); ' +
            'font-weight:700; font-size:20px; letter-spacing:0.02em; flex:0 0 auto;">' +
            escape(initials) +
          '</div>' +
          '<div style="flex:1; min-width:0;">' +
            '<h2 style="font-family:var(--font-display); font-weight:600; font-size:24px; line-height:1.1; ' +
              'color:var(--fg-1); letter-spacing:-0.01em; margin:0; text-transform:none;">' +
              escape(s.name) +
            '</h2>' +
            '<div style="display:flex; gap:6px; margin-top:6px; flex-wrap:wrap; align-items:center;">' +
              '<span class="chip chip-accent">' + escape(tipoLabel) + '</span>' +
              '<span class="chip">' + escape(cuadLabel) + '</span>' +
              (s.scoringConfianza === 'baja'
                ? '<span class="chip chip-red" title="Faltan datos (proyectos/contacto) para clasificar con fiabilidad. Enriquece la ficha y se reclasificará en el recálculo diario.">⚠ Datos insuficientes</span>'
                : '') +
              '<span style="font-size:12px; font-weight:600; padding:2px 10px; border-radius:12px; ' +
                'background:' + statusColor + '22; color:' + statusColor + ';">' +
                escape(statusLabel) +
              '</span>' +
            '</div>' +
            /* Productos GPF tratados (extraídos de los informes de visita) */
            (function () {
              var prods = (U.productosEstudio ? U.productosEstudio(s) : []);
              if (!prods.length) return '';
              return '<div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap; align-items:center;">' +
                '<span style="font-size:11px; color:var(--fg-3); font-weight:600;">Productos tratados:</span>' +
                prods.map(function (p) {
                  return '<span style="font-size:11px; font-weight:600; padding:2px 9px; border-radius:10px; ' +
                    'background:var(--gpf-blue-100); color:var(--gpf-blue-700);">' + escape(p) + '</span>';
                }).join('') +
              '</div>';
            })() +
          '</div>' +
          /* Botones header */
          '<div style="display:flex; flex-direction:column; gap:6px; flex:0 0 auto;">' +
            '<button data-action="change-status" style="background:none; border:1px solid var(--line); ' +
              'border-radius:8px; padding:6px 10px; font-size:12px; color:var(--fg-3); cursor:pointer;">' +
              '⇄ Estado' +
            '</button>' +
            '<button onclick="window.Screens.detail.openEditarFicha(\'' + escape(s.id) + '\')" ' +
              'style="background:none; border:1px solid var(--line); ' +
              'border-radius:8px; padding:6px 10px; font-size:12px; color:var(--fg-3); cursor:pointer;">' +
              '✏️ Editar' +
            '</button>' +
          '</div>' +
        '</div>' +

        /* Dirección */
        (fullAddr ? (
          '<div style="background:var(--gpf-blue-100); border-radius:12px; padding:12px 14px; margin-bottom:10px; ' +
            'border:1px solid #c7dcef; display:flex; gap:10px; align-items:center;">' +
            '<span style="color:var(--gpf-blue-700); flex:0 0 auto;">' + I.MapPin() + '</span>' +
            '<div style="flex:1; min-width:0;">' +
              '<div style="font-size:14px; font-weight:600; color:var(--gpf-blue-900);">' + escape(s.address || '—') + '</div>' +
              '<div style="font-size:13px; color:var(--gpf-blue-700);">' +
                escape([s.city, s.province].filter(Boolean).join(' · ')) +
              '</div>' +
            '</div>' +
            '<button class="btn btn-strong" style="height:38px; font-size:13px; flex:0 0 auto;" data-action="como-llegar">' +
              I.Navigation() + ' Ruta' +
            '</button>' +
          '</div>'
        ) : '') +

        /* Contacto rápido — el botón Email se muestra SIEMPRE (aunque no haya email
           guardado): abre el panel de correo igualmente. */
        '<div style="display:grid; grid-template-columns:' + (s.phone ? '1fr 1fr' : '1fr') + '; gap:8px; margin-bottom:4px;">' +
          (s.phone ? '<a class="btn btn-ghost" style="height:46px;" href="tel:' + escape(s.phone.replace(/[^\d+]/g, '')) + '">' + I.Phone() + ' Llamar</a>' : '') +
          '<button class="btn btn-ghost" style="height:46px;" data-action="email" data-email="' + escape(s.email || '') + '">' + I.Mail() + ' Email</button>' +
        '</div>' +

        /* Sincronizar con Google Contacts (→ iPhone/Mac vía la cuenta de Google). */
        (function () {
          var synced = s._data && s._data.contactSync && s._data.contactSync.resourceName;
          return '<button class="btn ' + (synced ? 'btn-strong' : 'btn-ghost') +
            '" style="height:44px; width:100%; margin-top:4px;" data-action="toggle-contact-sync">' +
            I.User() + ' ' + (synced ? 'En tus Contactos ✓ · quitar' : 'Añadir a mis Contactos (iPhone)') +
          '</button>';
        })() +
      '</div>'
    );
  }

  /* ============================================================
     TAB BAR
     ============================================================ */
  function tabBar(s) {
    const tabs = [
      { id: 'resumen',      label: 'Resumen' },
      { id: 'proyectos',    label: 'Proyectos' + (s.projects.length ? ' (' + s.projects.length + ')' : '') },
      { id: 'equipo',       label: 'Equipo' + (s.team.length ? ' (' + s.team.length + ')' : '') },
      { id: 'actividades',  label: 'Actividades' + (s.activities.length ? ' (' + s.activities.length + ')' : '') },
      { id: 'informes',     label: 'Informes' + (s.reports.length ? ' (' + s.reports.length + ')' : '') },
      { id: 'pipeline',     label: 'Pipeline' },
    ];
    return (
      '<div style="display:flex; gap:6px; overflow-x:auto; padding-bottom:2px; margin-top:16px; ' +
        '-webkit-overflow-scrolling:touch; scrollbar-width:none;">' +
        tabs.map(function (t) {
          const active = t.id === _tab;
          return (
            '<button data-tab="' + t.id + '" onclick="window.Screens.detail.switchTab(\'' + t.id + '\',' + '\'' + escape(s.id) + '\')" ' +
              'style="flex:0 0 auto; white-space:nowrap; padding:7px 14px; border-radius:20px; font-size:13px; ' +
              'font-weight:' + (active ? '600' : '500') + '; cursor:pointer; border:1.5px solid; transition:all .15s; ' +
              'background:' + (active ? 'var(--gpf-blue-900)' : 'var(--bg-card)') + '; ' +
              'color:' + (active ? '#fff' : 'var(--fg-2)') + '; ' +
              'border-color:' + (active ? 'var(--gpf-blue-900)' : 'var(--line)') + ';">' +
              escape(t.label) +
            '</button>'
          );
        }).join('') +
      '</div>'
    );
  }

  function switchTab(tab, studioId) {
    _tab = tab;
    const studio = getStudio(studioId);
    if (!studio) return;
    // Actualizar botones del tab bar
    document.querySelectorAll('[data-tab]').forEach(function (btn) {
      const isActive = btn.getAttribute('data-tab') === tab;
      btn.style.background = isActive ? 'var(--gpf-blue-900)' : 'var(--bg-card)';
      btn.style.color = isActive ? '#fff' : 'var(--fg-2)';
      btn.style.borderColor = isActive ? 'var(--gpf-blue-900)' : 'var(--line)';
      btn.style.fontWeight = isActive ? '600' : '500';
    });
    // Actualizar panel
    const panel = document.getElementById('detail-panel');
    if (panel) {
      panel.innerHTML = renderPanel(studio, tab);
      wireCTAs(studio);
    }
  }

  /* ============================================================
     PANEL: RESUMEN (info general + scoring + briefing)
     ============================================================ */
  function panelResumen(s) {
    const rows = [
      ['Comercial', escape(s.comercial || '—')],
      ['Técnico',   escape(s.tecnico || '—')],
      ['Teléfono',  s.phone ? '<a href="tel:' + escape(s.phone.replace(/[^\d+]/g,'')) + '" style="color:var(--gpf-blue-700);">' + escape(s.phone) + '</a>' : '<span style="color:var(--fg-3);">—</span>'],
      ['Email',     s.email ? '<a href="mailto:' + escape(s.email) + '" style="color:var(--gpf-blue-700);">' + escape(s.email) + '</a>' : '<span style="color:var(--fg-3);">—</span>'],
      ['Web',       s.web ? '<a href="https://' + escape(s.web.replace(/^https?:\/\//,'')) + '" target="_blank" ' +
        'style="color:var(--gpf-blue-700);">' + escape(s.web) + ' ↗</a>' : '<span style="color:var(--fg-3);">—</span>'],
      ['Fundación', escape(s.founded || '—')],
      ['Creado',    escape(U.formatDateES(s.createdAt) || '—')],
    ];

    return (
      /* Datos clave */
      '<section style="margin-bottom:16px;">' +
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">' +
          '<span class="eyebrow">Contacto y ficha</span>' +
          '<div style="display:flex; gap:6px;">' +
            '<button class="btn btn-ghost" id="btn-enrich-' + escape(s.id) + '" data-action="enrich" ' +
              'style="height:30px; font-size:12px; padding:0 10px;" title="Buscar datos de contacto en la web">🔍 Enrich</button>' +
            '<button class="btn btn-ghost" style="height:30px; font-size:12px; padding:0 10px;" ' +
              'onclick="window.Screens.detail.openEditContact(\'' + escape(s.id) + '\')">✏️ Editar</button>' +
          '</div>' +
        '</div>' +
        '<div class="card" style="padding:4px 0;">' +
          rows.map(function (r, i) {
            return '<div class="row"' + (i === rows.length - 1 ? ' style="border-bottom:0;"' : '') + '>' +
              '<span class="label">' + r[0] + '</span>' +
              '<span class="value">' + r[1] + '</span>' +
            '</div>';
          }).join('') +
        '</div>' +
      '</section>' +

      /* Descripción */
      (s.description
        ? '<section style="margin-bottom:16px;">' +
            '<span class="eyebrow" style="display:block; margin-bottom:8px;">Perfil</span>' +
            '<div class="card" style="padding:14px;">' +
              '<p style="font-size:14px; color:var(--fg-2); line-height:1.6; margin:0;">' + escape(s.description) + '</p>' +
            '</div>' +
          '</section>'
        : '') +

      /* Scoring */
      scoringBlock(s) +

      /* Briefing preview */
      briefingSection(s) +

      /* CTA informe */
      '<button class="btn btn-primary btn-block" style="height:52px; margin-top:8px;" data-action="open-informe">' +
        I.Edit() + ' Redactar informe de visita' +
      '</button>'
    );
  }

  function scoringBlock(s) {
    if (!s.cuadrante && !s.scoreDirect) return '';
    const cName = s.cuadranteName || CUADRANTE_LABELS[s.cuadrante] || s.cuadrante || '—';
    return (
      '<section style="margin-bottom:16px;">' +
        '<span class="eyebrow" style="display:block; margin-bottom:8px;">Scoring v2</span>' +
        '<div class="card" style="padding:14px;">' +
          '<div style="display:flex; gap:10px; align-items:center; margin-bottom:10px;">' +
            '<div style="width:40px; height:40px; border-radius:8px; background:var(--gpf-blue-900); color:#fff; ' +
              'display:flex; align-items:center; justify-content:center; font-family:var(--font-display); ' +
              'font-weight:700; font-size:18px;">' +
              escape(s.cuadrante || '?') +
            '</div>' +
            '<div>' +
              '<div style="font-weight:600; font-size:14px; color:var(--fg-1);">' + escape(cName) + '</div>' +
              (s.scoreDirect != null && s.scoreNetwork != null
                ? '<div style="font-size:12px; color:var(--fg-3); font-family:var(--font-mono);">' +
                    'Directo: ' + s.scoreDirect + ' · Red: ' + s.scoreNetwork +
                  '</div>'
                : '') +
            '</div>' +
          '</div>' +
          (s.recommendedAction
            ? '<p style="font-size:13px; color:var(--fg-2); line-height:1.5; margin:0; padding:10px; ' +
                'background:var(--gpf-blue-100); border-radius:8px;">' +
                '🎯 ' + escape(s.recommendedAction) +
              '</p>'
            : '') +
        '</div>' +
      '</section>'
    );
  }

  function briefingSection(s) {
    return (
      '<section style="margin-bottom:16px;">' +
        '<div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:8px;">' +
          '<span class="eyebrow">Briefing pre-visita</span>' +
          '<span id="detail-briefing-fecha" style="font-size:12px; color:var(--fg-3); font-family:var(--font-mono);">' +
            (s.briefingFecha ? 'Generado ' + escape(s.briefingFecha) : '') +
          '</span>' +
        '</div>' +
        '<div class="card" style="padding:16px;">' +
          '<div id="detail-briefing-preview" style="font-size:14px; line-height:1.5; color:var(--fg-2); margin-bottom:12px;">' +
            (s.briefingPreview || '<span style="color:var(--fg-3);">Sin briefing previo. Genera uno con IA antes de visitar este cliente.</span>') +
          '</div>' +
          '<div style="display:grid; grid-template-columns:1fr auto; gap:8px;">' +
            '<button class="btn btn-primary" data-action="open-briefing">' + I.FileText() + ' Leer briefing</button>' +
            '<button class="btn btn-ghost" data-action="regenerar-briefing" title="Generar nuevo con IA">' + I.Plus() + ' IA</button>' +
          '</div>' +
        '</div>' +
      '</section>'
    );
  }

  /* ============================================================
     PANEL: PROYECTOS
     ============================================================ */
  function panelProyectos(s) {
    const projs = s.projects;
    return (
      '<section>' +
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">' +
          '<span class="eyebrow">Proyectos del cliente</span>' +
          '<button class="btn btn-ghost" style="height:34px; font-size:13px;" ' +
            'onclick="window.Screens.detail.openAddProject(\'' + escape(s.id) + '\')">' +
            I.Plus() + ' Añadir' +
          '</button>' +
        '</div>' +
        (projs.length === 0
          ? emptyCard('Sin proyectos registrados', 'Añade los proyectos relevantes del cliente para mejorar el scoring.')
          : projs.map(function (p, idx) { return projectCard(p, idx, s.id, s.reports || []); }).join('')
        ) +
      '</section>'
    );
  }

  function projectCard(p, idx, studioId, reps) {
    const estadoLabel = PROYECTO_ESTADO[p.estado] || p.estado || '';
    const pNom = p.nombre || p.name || '';
    const linked = (reps || []).filter(function (r) {
      return (p.id && r.project_id === p.id) || (pNom && r.project_nombre === pNom);
    });
    return (
      '<div class="card" style="padding:14px; margin-bottom:10px; position:relative;">' +
        '<div style="display:flex; gap:10px; align-items:flex-start;">' +
          '<div style="flex:1; min-width:0;">' +
            '<div style="font-size:15px; font-weight:600; color:var(--fg-1); margin-bottom:4px;">' +
              escape(p.name || p.nombre || '—') +
              (estadoLabel ? ' <span style="font-size:11px; font-weight:600; padding:2px 7px; border-radius:8px; ' +
                'background:#e0f2fe; color:#0369a1; margin-left:4px;">' + escape(estadoLabel) + '</span>' : '') +
            '</div>' +
            '<div style="font-size:13px; color:var(--fg-3); line-height:1.5;">' +
              (p.location ? '📍 ' + escape(p.location) + ' · ' : '') +
              (p.year ? '📅 ' + escape(p.year) : '') +
              (p.presupuesto ? ' · 💰 ' + escape(p.presupuesto) : '') +
            '</div>' +
            (p.norma ? '<div style="margin-top:4px;"><span style="font-size:11px; padding:2px 7px; border-radius:8px; background:#fef3c7; color:#92400e;">' + escape(p.norma) + '</span></div>' : '') +
            (p.url ? '<div style="margin-top:5px;"><a href="' + escape(U.safeHref(p.url)) + '" target="_blank" rel="noopener" style="font-size:12px; color:var(--gpf-blue-700);">🔗 Perfil del contratante ↗</a></div>' : '') +
          '</div>' +
          '<div style="display:flex; gap:4px; flex:0 0 auto;">' +
            '<button onclick="window.Screens.detail.openEditProject(\'' + escape(studioId) + '\',' + idx + ')" ' +
              'style="background:none; border:1px solid var(--line); border-radius:6px; padding:4px 8px; cursor:pointer; font-size:12px; color:var(--fg-3);">✏️</button>' +
            '<button onclick="window.Screens.detail.deleteProject(\'' + escape(studioId) + '\',' + idx + ')" ' +
              'style="background:none; border:1px solid #fecaca; border-radius:6px; padding:4px 8px; cursor:pointer; font-size:12px; color:#dc2626;">🗑️</button>' +
          '</div>' +
        '</div>' +
        /* Footer: informes del proyecto + nuevo informe */
        '<div style="margin-top:10px; padding-top:10px; border-top:1px solid var(--line); display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">' +
          '<span style="font-size:12px; color:var(--fg-3);">' +
            (linked.length ? '📁 ' + linked.length + ' informe' + (linked.length !== 1 ? 's' : '') + ' de este proyecto' : 'Sin informes de este proyecto') +
          '</span>' +
          '<button class="btn btn-ghost" style="height:30px; font-size:12px;" ' +
            'onclick="window.showView(\'informe\', { studioId: \'' + escape(studioId) + '\', projectIdx: ' + idx + ' })">' +
            I.Plus() + ' Nuevo informe' +
          '</button>' +
        '</div>' +
      '</div>'
    );
  }

  /* ============================================================
     PANEL: EQUIPO
     ============================================================ */
  function panelEquipo(s) {
    const members = s.team;
    return (
      '<section>' +
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">' +
          '<span class="eyebrow">Equipo del cliente</span>' +
          '<button class="btn btn-ghost" style="height:34px; font-size:13px;" ' +
            'onclick="window.Screens.detail.openAddTeamMember(\'' + escape(s.id) + '\')">' +
            I.Plus() + ' Añadir' +
          '</button>' +
        '</div>' +
        (members.length === 0
          ? emptyCard('Sin contactos registrados', 'Añade personas clave del cliente: socios, directores, decisores.')
          : members.map(function (m, idx) { return teamCard(m, idx, s.id); }).join('')
        ) +
      '</section>'
    );
  }

  function teamCard(m, idx, studioId) {
    return (
      '<div class="card" style="padding:14px; margin-bottom:10px; position:relative;">' +
        '<div style="display:flex; gap:12px; align-items:flex-start;">' +
          '<div style="width:40px; height:40px; border-radius:50%; background:var(--gpf-blue-100); ' +
            'color:var(--gpf-blue-700); display:flex; align-items:center; justify-content:center; ' +
            'font-weight:700; font-size:14px; flex:0 0 auto;">' +
            escape((m.name || '?').charAt(0).toUpperCase()) +
          '</div>' +
          '<div style="flex:1; min-width:0;">' +
            '<div style="font-size:15px; font-weight:600; color:var(--fg-1);">' +
              escape(m.name || '—') +
              (m.isDecisionMaker ? ' <span style="font-size:11px; padding:2px 7px; border-radius:8px; background:#fef3c7; color:#92400e;">⭐ Decisor</span>' : '') +
            '</div>' +
            '<div style="font-size:13px; color:var(--gpf-blue-700); margin-bottom:6px;">' + escape(m.role || '—') + '</div>' +
            (m.email ? '<div style="font-size:13px; color:var(--fg-2);"><a href="mailto:' + escape(m.email) + '" style="color:var(--gpf-blue-700);">📧 ' + escape(m.email) + '</a></div>' : '') +
            (m.phone ? '<div style="font-size:13px; color:var(--fg-2);"><a href="tel:' + escape(m.phone.replace(/[^\d+]/g,'')) + '" style="color:var(--fg-2);">📞 ' + escape(m.phone) + '</a></div>' : '') +
            (m.linkedin ? '<div style="font-size:13px;"><a href="' + escape(U.safeHref(m.linkedin)) + '" target="_blank" rel="noopener" style="color:var(--gpf-blue-700);">💼 LinkedIn ↗</a></div>' : '') +
            (m.notes ? '<div style="margin-top:6px; font-size:12px; color:var(--fg-3); padding:6px; background:var(--gpf-blue-100); border-radius:6px;">' + escape(m.notes) + '</div>' : '') +
          '</div>' +
          '<div style="display:flex; gap:4px; flex:0 0 auto;">' +
            '<button onclick="window.Screens.detail.openEditTeamMember(\'' + escape(studioId) + '\',' + idx + ')" ' +
              'style="background:none; border:1px solid var(--line); border-radius:6px; padding:4px 8px; cursor:pointer; font-size:12px; color:var(--fg-3);">✏️</button>' +
            '<button onclick="window.Screens.detail.deleteTeamMember(\'' + escape(studioId) + '\',' + idx + ')" ' +
              'style="background:none; border:1px solid #fecaca; border-radius:6px; padding:4px 8px; cursor:pointer; font-size:12px; color:#dc2626;">🗑️</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  /* ============================================================
     PANEL: ACTIVIDADES
     ============================================================ */
  function panelActividades(s) {
    const acts = s.activities.slice().sort(function (a, b) {
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
    return (
      '<section>' +
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">' +
          '<span class="eyebrow">Historial de actividades</span>' +
          '<button class="btn btn-primary" style="height:34px; font-size:13px;" ' +
            'onclick="window.Screens.detail.openAddActivity(\'' + escape(s.id) + '\')">' +
            I.Plus() + ' Añadir' +
          '</button>' +
        '</div>' +
        (acts.length === 0
          ? emptyCard('Sin actividades', 'Registra llamadas, emails, reuniones y notas de seguimiento.')
          : '<div style="position:relative;">' +
              /* Línea de tiempo vertical */
              '<div style="position:absolute; left:17px; top:0; bottom:0; width:2px; background:var(--line); z-index:0;"></div>' +
              acts.map(function (act, idx) { return activityItem(act, idx, s.id); }).join('') +
            '</div>'
        ) +
      '</section>'
    );
  }

  function activityItem(act, idx, studioId) {
    const type      = act.type || 'nota';
    const isBandeja = !!act.bandeja;
    const isHecho   = isBandeja && !!act.completada;
    const color     = isHecho ? '#94a3b8' : (isBandeja ? '#16a34a' : (ACT_COLORS[type] || '#94a3b8'));
    const label     = isBandeja ? (isHecho ? 'HECHO ✓' : 'BANDEJA') : (ACT_LABELS[type] || type);
    const dateStr   = (U.formatDateES(act.createdAt) || act.date || '—') + (act.hora ? ' · ' + act.hora : '');
    const isVisit   = type === 'registro_visita';
    const textContent = act.title || act.text || act.notes || (isVisit ? 'Visita registrada' : '');
    return (
      '<div style="display:flex; gap:12px; align-items:flex-start; margin-bottom:14px; position:relative; z-index:1;' +
        (isHecho ? ' opacity:0.55;' : '') + '">' +
        '<div style="width:36px; height:36px; border-radius:50%; background:' + color + '22; ' +
          'border:2px solid ' + color + '; display:flex; align-items:center; justify-content:center; ' +
          'flex:0 0 auto; font-size:14px;">' +
          (isBandeja ? (isHecho ? '✓' : '✅') : actIcon(type)) +
        '</div>' +
        '<div class="card" style="flex:1; padding:12px; min-width:0;' + (isBandeja && !isHecho ? ' border-left:3px solid #16a34a;' : '') + '">' +
          '<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:6px;">' +
            '<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">' +
              '<span style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; ' +
                'color:' + color + ';">' + escape(label) + '</span>' +
              '<span style="font-size:12px; color:var(--fg-3); font-family:var(--font-mono);">' + escape(dateStr) + '</span>' +
              (act.fecha_limite ? '<span style="font-size:11px; color:#1e40af; background:#eff6ff; padding:1px 6px; border-radius:5px;">📅 ' + escape(act.fecha_limite) + '</span>' : '') +
            '</div>' +
            '<div style="display:flex; gap:4px; flex-shrink:0;">' +
              /* Toggle hecho/pendiente para items de bandeja */
              (isBandeja
                ? '<button onclick="window.Screens.detail.toggleBandeja(\'' + escape(studioId) + '\',' + idx + ')" ' +
                    'style="background:none; border:1px solid ' + (isHecho ? '#16a34a' : 'var(--line)') + '; border-radius:6px; padding:3px 7px; cursor:pointer; font-size:11px; color:' + (isHecho ? '#16a34a' : 'var(--fg-3)') + ';" ' +
                    'title="' + (isHecho ? 'Marcar como pendiente' : 'Marcar como hecho') + '">' +
                    (isHecho ? '↩ Reabrir' : '✓ Hecho') +
                  '</button>'
                : '') +
              (!isBandeja && act.id != null
                ? '<button onclick="window.Screens.detail.openEditActivity(\'' + escape(studioId) + '\',\'' + escape(String(act.id)) + '\')" ' +
                    'title="Ver / editar" style="background:none; border:none; cursor:pointer; color:var(--fg-3); font-size:13px; padding:0;">✏️</button>'
                : '') +
              '<button onclick="window.Screens.detail.deleteActivity(\'' + escape(studioId) + '\',' + idx + ')" ' +
                'style="background:none; border:none; cursor:pointer; color:var(--fg-3); font-size:13px; padding:0;">✕</button>' +
            '</div>' +
          '</div>' +
          '<div style="font-size:14px; color:var(--fg-1); line-height:1.5;' + (isHecho ? ' text-decoration:line-through; color:var(--fg-3);' : '') + '">' +
            escape(textContent) +
          '</div>' +
          (act.followupDate ? '<div style="margin-top:6px; font-size:12px; color:var(--fg-3);">📅 Seguimiento: ' + escape(U.formatDateES(act.followupDate) || act.followupDate) + '</div>' : '') +
        '</div>' +
      '</div>'
    );
  }

  function actIcon(type) {
    switch (type) {
      case 'llamada':         return '📞';
      case 'email':           return '📧';
      case 'reunion':         return '🤝';
      case 'evento':          return '📅';
      case 'registro_visita': return '🚗';
      default:                return '📝';
    }
  }

  /* ============================================================
     PANEL: INFORMES
     ============================================================ */
  function panelInformes(s) {
    const reps = s.reports;
    return (
      '<section>' +
        /* CTAs principales */
        '<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">' +
          actionTile('📋', 'Briefing IA', 'Dossier estratégico pre-visita', 'var(--gpf-blue-700)', 'open-briefing') +
          actionTile('✍️', 'Informe IA', 'Notas → informe estructurado', '#7c3aed', 'open-informe') +
        '</div>' +
        /* Botón importar visita .yaml */
        '<div data-action="importar-visita" style="border:1.5px dashed var(--border-2); border-radius:10px; ' +
          'padding:12px 14px; cursor:pointer; display:flex; align-items:center; gap:12px; ' +
          'margin-bottom:16px; background:var(--bg-1); transition:background .15s;" ' +
          'onmouseenter="this.style.background=\'var(--bg-2)\'" onmouseleave="this.style.background=\'var(--bg-1)\'">' +
          '<div style="font-size:1.5rem; flex:0 0 auto;">📥</div>' +
          '<div>' +
            '<div style="font-size:13px; font-weight:600; color:var(--fg-1);">Importar visita desde archivo</div>' +
            '<div style="font-size:11px; color:var(--fg-3); margin-top:1px;">Sube un .yaml generado por la app de transcripción</div>' +
          '</div>' +
        '</div>' +
        /* Lista */
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; gap:8px; flex-wrap:wrap;">' +
          '<span class="eyebrow">Informes adjuntos</span>' +
          (function () {
            var provs = []; reps.forEach(function (r) { if (r.project_nombre && provs.indexOf(r.project_nombre) === -1) provs.push(r.project_nombre); });
            if (!provs.length) return '<span style="font-size:12px; color:var(--fg-3);">' + reps.length + ' archivo' + (reps.length !== 1 ? 's' : '') + '</span>';
            return '<select class="field" style="width:auto; padding:4px 8px; font-size:12px; height:auto;" ' +
              'onchange="window.Screens.detail._filtrarInformes(this.value)">' +
              '<option value="">Todos los informes (' + reps.length + ')</option>' +
              provs.map(function (p) { return '<option value="' + escape(p) + '">📁 ' + escape(p) + '</option>'; }).join('') +
            '</select>';
          })() +
        '</div>' +
        (reps.length === 0
          ? emptyCard('Sin informes', 'Usa "Informe IA" para generar el primero.')
          : reps.slice().reverse().map(function (r, idx) { return reportCard(r, reps.length - 1 - idx, s.id); }).join('')
        ) +
      '</section>'
    );
  }

  function actionTile(emoji, title, sub, color, action) {
    return (
      '<div data-action="' + action + '" style="background:' + color + '; border-radius:12px; padding:16px; cursor:pointer;">' +
        '<div style="font-size:2rem; margin-bottom:6px;">' + emoji + '</div>' +
        '<div style="color:#fff; font-size:14px; font-weight:600;">' + title + '</div>' +
        '<div style="color:rgba(255,255,255,.75); font-size:12px; margin-top:2px;">' + sub + '</div>' +
      '</div>'
    );
  }

  function reportCard(r, idx, studioId) {
    const isImported = r.formato === 'visita_importada';
    const borderColor = isImported ? '#f59e0b' : 'var(--gpf-blue-500)';
    const tipo_labels = { primera_visita:'Primera visita', seguimiento:'Seguimiento', demo:'Demo',
      propuesta:'Propuesta', negociacion:'Negociación', cierre:'Cierre', postventa:'Postventa' };
    const tempIco = r.temperatura != null
      ? (r.temperatura >= 8 ? '🔥' : r.temperatura >= 5 ? '🌤️' : '❄️') + ' ' + r.temperatura
      : null;
    return (
      '<div class="card" data-report-proj="' + escape(r.project_nombre || '') + '" style="padding:14px; margin-bottom:10px; border-left:4px solid ' + borderColor + ';">' +
        '<div style="display:flex; gap:12px; align-items:flex-start;">' +
          '<div style="font-size:2rem; flex:0 0 auto;">' + (isImported ? '📥' : fileIcon(r.fileName)) + '</div>' +
          '<div style="flex:1; min-width:0;">' +
            '<div style="font-size:14px; font-weight:600; color:var(--fg-1); margin-bottom:3px;">' + escape(r.title || 'Informe') + '</div>' +
            '<div style="font-size:12px; color:var(--fg-3); display:flex; gap:8px; flex-wrap:wrap; align-items:center;">' +
              '📅 ' + escape(U.formatDateES(r.date) || '—') +
              (r.duracion_minutos ? ' · ⏱ ' + r.duracion_minutos + ' min' : '') +
            '</div>' +
            '<div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:5px;">' +
              (isImported ? '<span style="font-size:11px; padding:2px 8px; border-radius:8px; background:#fef9c3; color:#854d0e; font-weight:600;">📥 Importada</span>' : '') +
              (r.aiGenerated ? '<span style="font-size:11px; padding:2px 8px; border-radius:8px; background:rgba(124,58,237,.15); color:#a78bfa;">✍️ IA</span>' : '') +
              (r.tipo_visita ? '<span style="font-size:11px; padding:2px 8px; border-radius:8px; background:var(--bg-2); color:var(--fg-3);">' + escape(tipo_labels[r.tipo_visita] || r.tipo_visita) + '</span>' : '') +
              (r.project_nombre ? '<span style="font-size:11px; padding:2px 8px; border-radius:8px; background:var(--gpf-blue-100); color:var(--gpf-blue-700); font-weight:600;">📁 ' + escape(r.project_nombre) + '</span>' : '') +
              (tempIco ? '<span style="font-size:11px; padding:2px 8px; border-radius:8px; background:var(--bg-2); color:var(--fg-2); font-family:var(--font-mono);">' + tempIco + '</span>' : '') +
            '</div>' +
            (r.resumen_ejecutivo
              ? '<p style="font-size:12px; color:var(--fg-2); margin:6px 0 0; padding:7px 8px; ' +
                  'background:var(--gpf-blue-100); border-radius:6px; line-height:1.4; ' +
                  'display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">' +
                  escape(r.resumen_ejecutivo) +
                '</p>'
              : (r.notes ? '<p style="font-size:12px; color:var(--fg-3); margin:6px 0 0; padding:6px; background:var(--gpf-blue-100); border-radius:6px;">' + escape(r.notes) + '</p>' : '')) +
          '</div>' +
          /* Acciones */
          '<div style="display:flex; flex-direction:column; gap:5px; flex-shrink:0; align-items:flex-end;">' +
            (isImported
              ? '<button onclick="window.Screens.detail.openReportSheet(\'' + escape(studioId) + '\',' + idx + ')" ' +
                  'style="background:var(--gpf-blue-100); border:none; border-radius:6px; padding:4px 10px; cursor:pointer; font-size:12px; color:var(--gpf-blue-700); font-weight:600; white-space:nowrap;">👁 Ver</button>' +
                '<button onclick="window.Screens.detail.openEditReportModal(\'' + escape(studioId) + '\',' + idx + ')" ' +
                  'style="background:#fef9c3; border:none; border-radius:6px; padding:4px 10px; cursor:pointer; font-size:12px; color:#854d0e; font-weight:600; white-space:nowrap;">✏️ Editar</button>' +
                '<button onclick="window.Screens.detail.downloadReportWord(\'' + escape(studioId) + '\',' + idx + ')" ' +
                  'style="background:#f0fdf4; border:none; border-radius:6px; padding:4px 10px; cursor:pointer; font-size:12px; color:#16a34a; font-weight:600; white-space:nowrap;">📄 Word</button>'
              : (r.markdown
                ? '<button onclick="window.Screens.detail.openReportMarkdownSheet(\'' + escape(studioId) + '\',' + idx + ')" ' +
                    'style="background:var(--gpf-blue-100); border:none; border-radius:6px; padding:4px 10px; cursor:pointer; font-size:12px; color:var(--gpf-blue-700); font-weight:600; white-space:nowrap;">👁 Ver</button>' +
                  '<button onclick="window.Screens.detail.openEditReportMarkdownModal(\'' + escape(studioId) + '\',' + idx + ')" ' +
                    'style="background:#fef9c3; border:none; border-radius:6px; padding:4px 10px; cursor:pointer; font-size:12px; color:#854d0e; font-weight:600; white-space:nowrap;">✏️ Editar</button>' +
                  '<button onclick="window.Screens.detail.downloadReportMarkdownWord(\'' + escape(studioId) + '\',' + idx + ')" ' +
                    'style="background:#f0fdf4; border:none; border-radius:6px; padding:4px 10px; cursor:pointer; font-size:12px; color:#16a34a; font-weight:600; white-space:nowrap;">📄 Word</button>'
                : '')) +
            '<button onclick="window.Screens.detail.deleteReport(\'' + escape(studioId) + '\',' + idx + ')" ' +
              'style="background:none; border:1px solid #fecaca; border-radius:6px; padding:4px 8px; cursor:pointer; font-size:12px; color:#dc2626;">🗑️</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function fileIcon(name) {
    if (!name) return '📄';
    if (/\.docx?$/i.test(name)) return '📝';
    if (/\.pdf$/i.test(name)) return '📋';
    if (/\.xlsx?$/i.test(name)) return '📊';
    return '📄';
  }

  /* ============================================================
     PANEL: PIPELINE B2B
     ============================================================ */
  function panelPipeline(s) {
    const b2b = s.b2bTimeline;
    const statusColor = STATUS_COLORS[s.status] || '#94a3b8';
    const statusLabel = STATUS_LABELS[s.status] || 'Nuevo';
    const adjudicaciones = (s._data && s._data.adjudicaciones && s._data.adjudicaciones.valor) || [];

    return (
      '<section>' +
        /* Estado comercial */
        '<span class="eyebrow" style="display:block; margin-bottom:8px;">Estado comercial</span>' +
        '<div class="card" style="padding:14px; margin-bottom:16px;">' +
          '<div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">' +
            '<div style="width:48px; height:48px; border-radius:12px; display:flex; align-items:center; ' +
              'justify-content:center; font-size:20px; background:' + statusColor + '22; color:' + statusColor + '; font-weight:700;">' +
              escape(statusLabel.charAt(0)) +
            '</div>' +
            '<div>' +
              '<div style="font-size:16px; font-weight:600; color:' + statusColor + ';">' + escape(statusLabel) + '</div>' +
              (s.scoreDirect != null ? '<div style="font-size:12px; color:var(--fg-3);">Scoring directo: ' + s.scoreDirect + ' · Red: ' + s.scoreNetwork + '</div>' : '') +
            '</div>' +
          '</div>' +
          /* Cambiar estado */
          '<div style="display:grid; grid-template-columns:repeat(4,1fr); gap:6px;">' +
            ['nuevo','contactado','reunion','propuesta','ganado','perdido','dormido'].slice(0,7).map(function (st) {
              const active = st === s.status;
              const c = STATUS_COLORS[st] || '#94a3b8';
              const l = STATUS_LABELS[st] || st;
              return (
                '<button onclick="window.Screens.detail.changeStatus(\'' + escape(s.id) + '\',\'' + st + '\')" ' +
                  'style="padding:6px 4px; border-radius:8px; font-size:11px; font-weight:' + (active ? '700' : '500') + '; ' +
                  'cursor:pointer; border:1.5px solid ' + (active ? c : 'var(--line)') + '; ' +
                  'background:' + (active ? c + '22' : 'transparent') + '; color:' + (active ? c : 'var(--fg-3)') + ';">' +
                  escape(l) +
                '</button>'
              );
            }).join('') +
          '</div>' +
        '</div>' +

        /* Acción recomendada */
        (s.recommendedAction
          ? '<div class="card" style="padding:14px; margin-bottom:16px; border-left:4px solid var(--gpf-blue-700);">' +
              '<div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; ' +
                'color:var(--gpf-blue-700); margin-bottom:6px;">Acción recomendada</div>' +
              '<p style="font-size:14px; color:var(--fg-1); line-height:1.5; margin:0;">' + escape(s.recommendedAction) + '</p>' +
            '</div>'
          : '') +

        /* B2B Timeline — si existe */
        (b2b && b2b.steps && b2b.steps.length > 0
          ? b2bTimelineBlock(b2b, s)
          : '<div class="card" style="padding:20px; text-align:center;">' +
              '<div style="font-size:2.5rem; margin-bottom:8px;">🎯</div>' +
              '<p style="font-size:14px; color:var(--fg-2); margin:0 0 4px;">Sin proceso B2B iniciado</p>' +
              '<p style="font-size:13px; color:var(--fg-3); margin:0;">Inicia el seguimiento desde la vista clásica.</p>' +
            '</div>'
        ) +

        /* Adjudicaciones PLACSP */
        (adjudicaciones.length > 0
          ? placspBlock(adjudicaciones)
          : '') +
      '</section>'
    );
  }

  function b2bTimelineBlock(b2b, s) {
    const steps = b2b.steps || [];
    const currentStep = b2b.currentStep || 0;
    return (
      '<span class="eyebrow" style="display:block; margin-bottom:8px;">Proceso B2B</span>' +
      '<div class="card" style="padding:14px; margin-bottom:16px;">' +
        steps.slice(0, 6).map(function (step, idx) {
          const completed = !!(step.completedAt);
          const isCurrent = !completed && idx === currentStep;
          const color = completed ? '#22c55e' : (isCurrent ? 'var(--gpf-blue-700)' : 'var(--fg-3)');
          return (
            '<div style="display:flex; gap:10px; align-items:flex-start; margin-bottom:10px; ' +
              (idx < steps.length - 1 ? 'padding-bottom:10px; border-bottom:1px solid var(--line);' : '') + '">' +
              '<div style="width:28px; height:28px; border-radius:50%; background:' + color + '22; ' +
                'border:2px solid ' + color + '; display:flex; align-items:center; justify-content:center; ' +
                'font-size:12px; font-weight:700; color:' + color + '; flex:0 0 auto;">' +
                (completed ? '✓' : (idx + 1)) +
              '</div>' +
              '<div style="flex:1;">' +
                '<div style="font-size:13px; font-weight:600; color:' + color + ';">' +
                  escape(step.name || ('Paso ' + (idx + 1))) +
                '</div>' +
                (step.completedAt ? '<div style="font-size:12px; color:var(--fg-3);">✅ Completado: ' + escape(U.formatDateES(step.completedAt) || '') + '</div>' : '') +
              '</div>' +
            '</div>'
          );
        }).join('') +
      '</div>'
    );
  }

  function placspBlock(adjudicaciones) {
    return (
      '<span class="eyebrow" style="display:block; margin-bottom:8px;">Adjudicaciones PLACSP</span>' +
      '<div class="card" style="padding:0; overflow:hidden; margin-bottom:16px;">' +
        adjudicaciones.slice(0, 8).map(function (l) {
          const importeStr = l.importe ? (l.importe / 1000).toFixed(0) + ' k€' : '—';
          const fecha = (l.fecha_publicacion || l.fecha || '').substring(0, 10);
          return (
            '<div style="padding:10px 14px; border-bottom:1px solid var(--line); display:flex; gap:10px; align-items:center;">' +
              '<div style="flex:1; min-width:0;">' +
                '<div style="font-size:13px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' +
                  escape((l.titulo || '').substring(0, 80)) +
                  (l.url_placsp || l.url ? ' <a href="' + escape(U.safeHref(l.url_placsp || l.url)) + '" target="_blank" rel="noopener" style="font-size:11px; color:var(--gpf-blue-700);">↗</a>' : '') +
                '</div>' +
                '<div style="font-size:11px; color:var(--fg-3);">' + escape(l.organismo || '') + (fecha ? ' · ' + fecha : '') + '</div>' +
              '</div>' +
              '<div style="font-size:13px; font-variant-numeric:tabular-nums; font-weight:600; white-space:nowrap;">' + importeStr + '</div>' +
            '</div>'
          );
        }).join('') +
      '</div>'
    );
  }

  /* ============================================================
     MODALES — sistema universal
     ============================================================ */
  function showModal(html) {
    let ov = document.getElementById('detail-modal-ov');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'detail-modal-ov';
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;' +
        'display:flex;align-items:center;justify-content:center;padding:16px;';
      ov.addEventListener('click', function (e) { if (e.target === ov) closeModal(); });
      document.body.appendChild(ov);
    }
    ov.innerHTML = html;
    ov.style.display = 'flex';
  }

  function closeModal() {
    const ov = document.getElementById('detail-modal-ov');
    if (ov) ov.style.display = 'none';
  }

  function modalWrap(title, body, actionHtml) {
    return (
      '<div style="background:var(--bg-card); border-radius:14px; padding:24px; width:100%; ' +
        'max-width:480px; max-height:85vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,.3);">' +
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px;">' +
          '<h3 style="margin:0; font-family:var(--font-display); font-size:20px; font-weight:700;">' + title + '</h3>' +
          '<button onclick="window.Screens.detail.closeModal()" ' +
            'style="background:none; border:none; cursor:pointer; font-size:20px; color:var(--fg-3); padding:0;">✕</button>' +
        '</div>' +
        body +
        (actionHtml ? '<div style="margin-top:18px;">' + actionHtml + '</div>' : '') +
      '</div>'
    );
  }

  function field(label, inputHtml) {
    return (
      '<div style="margin-bottom:14px;">' +
        '<label style="display:block; font-size:12px; font-weight:600; color:var(--fg-3); text-transform:uppercase; ' +
          'letter-spacing:.05em; margin-bottom:5px;">' + label + '</label>' +
        inputHtml +
      '</div>'
    );
  }

  const INPUT_STYLE = 'width:100%; padding:10px 12px; border:1.5px solid var(--line); border-radius:8px; ' +
    'font-size:14px; background:var(--bg-card); color:var(--fg-1); outline:none; box-sizing:border-box;';
  const SELECT_STYLE = INPUT_STYLE + 'cursor:pointer;';

  /* ---- ACTIVIDAD ---- */
  // Cuerpo compartido del modal (alta y edición). v = actividad existente (o {}).
  function _actModalBody(v, opts) {
    v = v || {}; opts = opts || {};
    const today = new Date().toISOString().slice(0, 10);
    const cdat = v.createdAt ? String(v.createdAt) : '';
    const date = v.date || (cdat ? cdat.slice(0, 10) : today);
    const hora = v.hora || (/T(\d\d:\d\d)/.test(cdat) ? cdat.match(/T(\d\d:\d\d)/)[1] : '09:00');
    const followup = v.followupDate ? String(v.followupDate).slice(0, 10) : '';
    const sel = v.type || 'llamada';
    return (
      field('Tipo', '<select id="m-act-type" style="' + SELECT_STYLE + '">' +
        ['llamada','email','reunion','nota','evento'].map(function (t) {
          return '<option value="' + t + '"' + (t === sel ? ' selected' : '') + '>' + (ACT_LABELS[t] || t) + '</option>';
        }).join('') +
      '</select>') +
      '<div style="display:flex; gap:10px;">' +
        '<div style="flex:1;">' + field('Fecha', '<input type="date" id="m-act-date" value="' + date + '" style="' + INPUT_STYLE + '">') + '</div>' +
        '<div style="flex:0 0 130px;">' + field('Hora', '<input type="time" id="m-act-hora" value="' + hora + '" style="' + INPUT_STYLE + '">') + '</div>' +
      '</div>' +
      field('Descripción / Notas', '<textarea id="m-act-text" rows="4" placeholder="Qué ocurrió, próximos pasos…" ' +
        'style="' + INPUT_STYLE + ' resize:vertical; min-height:90px;">' + escape(v.text || '') + '</textarea>') +
      field('Seguimiento (opcional)', '<input type="date" id="m-act-followup" value="' + followup + '" style="' + INPUT_STYLE + '">') +
      '<div style="display:flex; align-items:center; gap:8px; margin:2px 0 14px;">' +
        '<input type="checkbox" id="m-act-sync"' + (opts.syncChecked ? ' checked' : '') + ' style="width:16px;height:16px;">' +
        '<label for="m-act-sync" style="font-size:14px; color:var(--fg-2);">📅 ' +
          (opts.syncLabel || 'Añadir a mi Google Calendar (con enlace a la ficha)') + '</label>' +
      '</div>'
    );
  }

  function openAddActivity(studioId) {
    showModal(modalWrap('Nueva actividad',
      _actModalBody({}, { syncChecked: true }),
      '<button class="btn btn-primary btn-block" ' +
        'onclick="window.Screens.detail.saveActivity(\'' + escape(studioId) + '\')">Guardar actividad</button>'
    ));
  }

  // Ver detalle / editar una actividad existente (localizada por id estable).
  function openEditActivity(studioId, actId) {
    const s = getStudio(studioId);
    const act = arr(s && s.activities).filter(function (a) { return String(a.id) === String(actId); })[0];
    if (!act) { alert('No se encontró la actividad.'); return; }
    const tieneEvento = !!act.gcalEventId;
    showModal(modalWrap('Editar actividad',
      _actModalBody(act, {
        syncChecked: tieneEvento,
        syncLabel: tieneEvento ? 'Actualizar el evento en mi Google Calendar' : 'Crear un evento en mi Google Calendar con estos datos',
      }),
      '<button class="btn btn-primary btn-block" ' +
        'onclick="window.Screens.detail.updateActivity(\'' + escape(studioId) + '\',\'' + escape(String(actId)) + '\')">Guardar cambios</button>'
    ));
  }

  async function saveActivity(studioId) {
    const type = document.getElementById('m-act-type').value;
    const date = document.getElementById('m-act-date').value;
    const horaEl = document.getElementById('m-act-hora');
    const hora = (horaEl && horaEl.value || '').trim();
    const text = (document.getElementById('m-act-text').value || '').trim();
    const followup = document.getElementById('m-act-followup').value;
    const syncEl = document.getElementById('m-act-sync');
    const sync = !!(syncEl && syncEl.checked);
    if (!text) { alert('Escribe una descripción.'); return; }
    const s = getStudio(studioId);
    // createdAt con la hora indicada (Europe/Madrid); si no hay hora, mediodía local.
    const at = date ? (date + 'T' + (hora || '12:00') + ':00') : new Date().toISOString();
    const newId = Date.now();
    const activities = arr(s && s.activities).slice();
    activities.unshift({
      id: newId,
      type: type,
      text: text,
      createdAt: at,
      hora: hora || null,
      followupDate: followup ? followup + 'T00:00:00Z' : null,
      studioId: studioId,
    });
    try {
      await saveDataField(studioId, 'activities', activities);
      closeModal();
      notif('Actividad guardada', 'success');
      // Sincronizar con Google Calendar (con enlace a la ficha) si se marcó.
      // Al crearse el evento, guardamos su id en la actividad para poder ACTUALIZARLO al editar.
      if (sync && date && window.Screens.planificador && window.Screens.planificador.agendarActividadCalendar) {
        try { await window.Screens.planificador.agendarActividadCalendar(s, { date: date, hora: hora || '09:00', tipo: type, text: text, onResult: function (info) { _persistGcalId(studioId, newId, info && info.eventId); } }); } catch (_) {}
      }
      switchTab('actividades', studioId);
    } catch (e) { alert('Error al guardar: ' + e.message); }
  }

  async function updateActivity(studioId, actId) {
    const type = document.getElementById('m-act-type').value;
    const date = document.getElementById('m-act-date').value;
    const horaEl = document.getElementById('m-act-hora');
    const hora = (horaEl && horaEl.value || '').trim();
    const text = (document.getElementById('m-act-text').value || '').trim();
    const followup = document.getElementById('m-act-followup').value;
    const syncEl = document.getElementById('m-act-sync');
    const sync = !!(syncEl && syncEl.checked);
    if (!text) { alert('Escribe una descripción.'); return; }
    const s = getStudio(studioId);
    const activities = arr(s && s.activities).slice();
    let i = -1;
    for (let k = 0; k < activities.length; k++) { if (String(activities[k].id) === String(actId)) { i = k; break; } }
    if (i < 0) { alert('No se encontró la actividad.'); return; }
    const at = date ? (date + 'T' + (hora || '12:00') + ':00') : (activities[i].createdAt || new Date().toISOString());
    const eventId = activities[i].gcalEventId || null;
    activities[i] = Object.assign({}, activities[i], {
      type: type,
      text: text,
      createdAt: at,
      hora: hora || null,
      followupDate: followup ? followup + 'T00:00:00Z' : null,
    });
    try {
      await saveDataField(studioId, 'activities', activities);
      closeModal();
      notif('Actividad actualizada', 'success');
      // Si se marca el check: actualiza el evento existente (eventId) o crea uno nuevo si no había.
      if (sync && date && window.Screens.planificador && window.Screens.planificador.agendarActividadCalendar) {
        try { await window.Screens.planificador.agendarActividadCalendar(s, { date: date, hora: hora || '09:00', tipo: type, text: text, eventId: eventId, onResult: function (info) { _persistGcalId(studioId, actId, info && info.eventId); } }); } catch (_) {}
      }
      switchTab('actividades', studioId);
    } catch (e) { alert('Error al guardar: ' + e.message); }
  }

  // Guarda en la actividad (por id) el id del evento de Google Calendar, para poder
  // actualizarlo en futuras ediciones en lugar de crear duplicados.
  async function _persistGcalId(studioId, actId, eventId) {
    if (!eventId) return;
    const s = getStudio(studioId);
    const activities = arr(s && s.activities).slice();
    let changed = false;
    for (let k = 0; k < activities.length; k++) {
      if (String(activities[k].id) === String(actId) && activities[k].gcalEventId !== eventId) {
        activities[k] = Object.assign({}, activities[k], { gcalEventId: eventId });
        changed = true; break;
      }
    }
    if (changed) { try { await saveDataField(studioId, 'activities', activities); } catch (_) {} }
  }

  async function deleteActivity(studioId, idx) {
    if (!confirm('¿Eliminar esta actividad?')) return;
    const s = getStudio(studioId);
    const activities = arr(s && s.activities).slice();
    activities.splice(idx, 1);
    try {
      await saveDataField(studioId, 'activities', activities);
      notif('Actividad eliminada', 'info');
      switchTab('actividades', studioId);
    } catch (e) { alert('Error: ' + e.message); }
  }

  /* ---- EQUIPO ---- */
  function openAddTeamMember(studioId) { _openTeamModal(studioId, null, null); }
  function openEditTeamMember(studioId, idx) {
    const s = getStudio(studioId);
    const m = s && s.team[idx];
    _openTeamModal(studioId, idx, m);
  }

  function _openTeamModal(studioId, idx, m) {
    m = m || {};
    const isEdit = idx != null;
    showModal(modalWrap(isEdit ? 'Editar contacto' : 'Nuevo contacto',
      field('Nombre', '<input id="m-tm-name" type="text" placeholder="Ej: María García" value="' + escape(m.name || '') + '" style="' + INPUT_STYLE + '">') +
      field('Cargo / Rol', '<input id="m-tm-role" type="text" placeholder="Arquitecta, Director..." value="' + escape(m.role || '') + '" style="' + INPUT_STYLE + '">') +
      field('Email', '<input id="m-tm-email" type="email" placeholder="email@ejemplo.com" value="' + escape(m.email || '') + '" style="' + INPUT_STYLE + '">') +
      field('Teléfono', '<input id="m-tm-phone" type="tel" placeholder="+34 600 000 000" value="' + escape(m.phone || '') + '" style="' + INPUT_STYLE + '">') +
      field('LinkedIn', '<input id="m-tm-li" type="url" placeholder="https://linkedin.com/in/..." value="' + escape(m.linkedin || '') + '" style="' + INPUT_STYLE + '">') +
      '<div style="display:flex; align-items:center; gap:8px; margin-bottom:14px;">' +
        '<input type="checkbox" id="m-tm-dm"' + (m.isDecisionMaker ? ' checked' : '') + ' style="width:16px;height:16px;">' +
        '<label for="m-tm-dm" style="font-size:14px; color:var(--fg-2);">Es decisor de compra ⭐</label>' +
      '</div>' +
      field('Notas', '<textarea id="m-tm-notes" rows="2" placeholder="Observaciones…" style="' + INPUT_STYLE + ' resize:vertical;">' + escape(m.notes || '') + '</textarea>'),
      '<button class="btn btn-primary btn-block" ' +
        'onclick="window.Screens.detail.saveTeamMember(\'' + escape(studioId) + '\''  + (isEdit ? ',' + idx : '') + ')">' +
        (isEdit ? 'Guardar cambios' : 'Añadir contacto') +
      '</button>'
    ));
  }

  async function saveTeamMember(studioId, idx) {
    const m = {
      name:          (document.getElementById('m-tm-name').value  || '').trim(),
      role:          (document.getElementById('m-tm-role').value  || '').trim(),
      email:         (document.getElementById('m-tm-email').value || '').trim(),
      phone:         (document.getElementById('m-tm-phone').value || '').trim(),
      linkedin:      (document.getElementById('m-tm-li').value    || '').trim(),
      isDecisionMaker: document.getElementById('m-tm-dm').checked,
      notes:         (document.getElementById('m-tm-notes').value || '').trim(),
    };
    if (!m.name) { alert('El nombre es obligatorio.'); return; }
    const s = getStudio(studioId);
    const team = arr(s && s.team).slice();
    if (idx != null) team.splice(idx, 1, m); else team.push(m);
    try {
      await saveDataField(studioId, 'team', team);
      closeModal();
      notif('Contacto guardado', 'success');
      switchTab('equipo', studioId);
    } catch (e) { alert('Error: ' + e.message); }
  }

  async function deleteTeamMember(studioId, idx) {
    if (!confirm('¿Eliminar este contacto?')) return;
    const s = getStudio(studioId);
    const team = arr(s && s.team).slice();
    team.splice(idx, 1);
    try {
      await saveDataField(studioId, 'team', team);
      notif('Contacto eliminado', 'info');
      switchTab('equipo', studioId);
    } catch (e) { alert('Error: ' + e.message); }
  }

  /* ---- PROYECTOS ---- */
  function openAddProject(studioId) { _openProjectModal(studioId, null, null); }
  function openEditProject(studioId, idx) {
    const s = getStudio(studioId);
    const p = s && s.projects[idx];
    _openProjectModal(studioId, idx, p);
  }

  function _openProjectModal(studioId, idx, p) {
    p = p || {};
    const isEdit = idx != null;
    showModal(modalWrap(isEdit ? 'Editar proyecto' : 'Nuevo proyecto',
      field('Nombre del proyecto', '<input id="m-pr-name" type="text" placeholder="Ej: EDAR Málaga Sur" value="' + escape(p.name || p.nombre || '') + '" style="' + INPUT_STYLE + '">') +
      field('Localización', '<input id="m-pr-loc" type="text" placeholder="Málaga / Sevilla…" value="' + escape(p.location || '') + '" style="' + INPUT_STYLE + '">') +
      '<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">' +
        field('Año', '<input id="m-pr-year" type="number" min="2000" max="2035" placeholder="2026" value="' + escape(p.year || '') + '" style="' + INPUT_STYLE + '">') +
        field('Presupuesto', '<input id="m-pr-budget" type="text" placeholder="1.2M€" value="' + escape(p.presupuesto || '') + '" style="' + INPUT_STYLE + '">') +
      '</div>' +
      field('Estado', '<select id="m-pr-estado" style="' + SELECT_STYLE + '">' +
        '<option value="">— Sin estado —</option>' +
        Object.keys(PROYECTO_ESTADO).map(function (k) {
          return '<option value="' + k + '"' + (p.estado === k ? ' selected' : '') + '>' + PROYECTO_ESTADO[k] + '</option>';
        }).join('') +
      '</select>') +
      field('Norma / Certificación', '<input id="m-pr-norma" type="text" placeholder="UNE-EN 1401, ISO 9001…" value="' + escape(p.norma || '') + '" style="' + INPUT_STYLE + '">') +
      field('URL (perfil contratante)', '<input id="m-pr-url" type="url" placeholder="https://..." value="' + escape(p.url || '') + '" style="' + INPUT_STYLE + '">'),
      '<button class="btn btn-primary btn-block" ' +
        'onclick="window.Screens.detail.saveProject(\'' + escape(studioId) + '\'' + (isEdit ? ',' + idx : '') + ')">' +
        (isEdit ? 'Guardar cambios' : 'Añadir proyecto') +
      '</button>'
    ));
  }

  async function saveProject(studioId, idx) {
    const p = {
      name:       (document.getElementById('m-pr-name').value   || '').trim(),
      location:   (document.getElementById('m-pr-loc').value    || '').trim(),
      year:       (document.getElementById('m-pr-year').value   || '').trim(),
      presupuesto:(document.getElementById('m-pr-budget').value || '').trim(),
      estado:     document.getElementById('m-pr-estado').value  || null,
      norma:      (document.getElementById('m-pr-norma').value  || '').trim(),
      url:        (document.getElementById('m-pr-url').value    || '').trim(),
    };
    if (!p.name) { alert('El nombre del proyecto es obligatorio.'); return; }
    const s = getStudio(studioId);
    const projects = arr(s && s.projects).slice();
    if (idx != null) projects.splice(idx, 1, p); else projects.push(p);
    try {
      await saveDataField(studioId, 'projects', projects);
      closeModal();
      notif('Proyecto guardado', 'success');
      switchTab('proyectos', studioId);
    } catch (e) { alert('Error: ' + e.message); }
  }

  async function deleteProject(studioId, idx) {
    if (!confirm('¿Eliminar este proyecto?')) return;
    const s = getStudio(studioId);
    const projects = arr(s && s.projects).slice();
    projects.splice(idx, 1);
    try {
      await saveDataField(studioId, 'projects', projects);
      notif('Proyecto eliminado', 'info');
      switchTab('proyectos', studioId);
    } catch (e) { alert('Error: ' + e.message); }
  }

  /* ---- CONTACTO ---- */
  function openEditContact(studioId) {
    const s = getStudio(studioId);
    if (!s) return;
    const PROVS = ['Álava','Albacete','Alicante','Almería','Asturias','Ávila','Badajoz','Baleares',
      'Barcelona','Burgos','Cáceres','Cádiz','Cantabria','Castellón','Ciudad Real','Córdoba',
      'Cuenca','Girona','Granada','Guadalajara','Guipúzcoa','Huelva','Huesca','Jaén','La Coruña',
      'La Rioja','Las Palmas','León','Lleida','Lugo','Madrid','Málaga','Murcia','Navarra','Orense',
      'Palencia','Pontevedra','Salamanca','Santa Cruz de Tenerife','Segovia','Sevilla','Soria',
      'Tarragona','Teruel','Toledo','Valencia','Valladolid','Vizcaya','Zamora','Zaragoza',
      'Ceuta','Melilla'];
    showModal(modalWrap('Editar contacto',
      field('Dirección', '<input id="m-ct-addr" type="text" placeholder="C/ Ejemplo, 12" value="' + escape(s.address || '') + '" style="' + INPUT_STYLE + '">') +
      '<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">' +
        field('Población', '<input id="m-ct-city" type="text" placeholder="Sevilla" value="' + escape(s.city || '') + '" style="' + INPUT_STYLE + '">') +
        field('Provincia', '<select id="m-ct-prov" style="' + SELECT_STYLE + '">' +
          '<option value="">— Provincia —</option>' +
          PROVS.map(function (p) { return '<option value="' + escape(p) + '"' + (s.province === p ? ' selected' : '') + '>' + escape(p) + '</option>'; }).join('') +
        '</select>') +
      '</div>' +
      field('Teléfono', '<input id="m-ct-phone" type="tel" placeholder="+34 600 000 000" value="' + escape(s.phone || '') + '" style="' + INPUT_STYLE + '">') +
      field('Email', '<input id="m-ct-email" type="email" placeholder="contacto@ejemplo.com" value="' + escape(s.email || '') + '" style="' + INPUT_STYLE + '">') +
      field('Web', '<input id="m-ct-web" type="url" placeholder="https://www.ejemplo.com" value="' + escape(s.web || '') + '" style="' + INPUT_STYLE + '">') +
      field('Año de fundación', '<input id="m-ct-founded" type="number" min="1900" max="2030" placeholder="2005" value="' + escape(s.founded || '') + '" style="' + INPUT_STYLE + '">'),
      '<button class="btn btn-primary btn-block" onclick="window.Screens.detail.saveContact(\'' + escape(studioId) + '\')">Guardar contacto</button>'
    ));
  }

  async function saveContact(studioId) {
    const addr    = (document.getElementById('m-ct-addr').value    || '').trim();
    const city    = (document.getElementById('m-ct-city').value    || '').trim();
    const prov    = (document.getElementById('m-ct-prov').value    || '').trim();
    const phone   = (document.getElementById('m-ct-phone').value   || '').trim();
    const email   = (document.getElementById('m-ct-email').value   || '').trim();
    const web     = (document.getElementById('m-ct-web').value     || '').trim();
    const founded = (document.getElementById('m-ct-founded').value || '').trim();

    const raw = State.studiosById && State.studiosById[studioId];
    if (!raw) { alert('Studio no encontrado.'); return; }
    const currentData = Object.assign({}, raw.data || {});
    currentData.contact = Object.assign({}, currentData.contact || {}, {
      address: addr, phone: phone, email: email, web: web,
    });
    currentData.studio = Object.assign({}, currentData.studio || {}, { founded: founded });

    const topFields = { city: city, province: prov };
    try {
      // Actualizar data + campos planos ciudad/provincia
      await window.Data.patchDoc('studios/' + studioId, Object.assign({ data: currentData }, topFields));
      // Sync local State
      raw.data = currentData;
      raw.city = city;
      raw.province = prov;
      if (State.studiosById) State.studiosById[studioId] = raw;
      closeModal();
      notif('Contacto actualizado', 'success');
      render({ studioId: studioId, tab: _tab });
    } catch (e) { alert('Error al guardar: ' + e.message); }
  }

  /* ---- INFORMES ---- */
  async function deleteReport(studioId, idx) {
    if (!confirm('¿Eliminar este informe?')) return;
    const s = getStudio(studioId);
    const reports = arr(s && s.reports).slice();
    reports.splice(idx, 1);
    try {
      await saveDataField(studioId, 'reports', reports);
      notif('Informe eliminado', 'info');
      switchTab('informes', studioId);
    } catch (e) { alert('Error: ' + e.message); }
  }

  /* ---- CAMBIO DE ESTADO ---- */
  async function changeStatus(studioId, newStatus) {
    try {
      await saveTopFields(studioId, { status: newStatus });
      notif('Estado actualizado: ' + (STATUS_LABELS[newStatus] || newStatus), 'success');
      // Re-render header y pipeline
      render({ studioId: studioId, tab: _tab });
    } catch (e) { alert('Error: ' + e.message); }
  }

  /* ---- EDITAR FICHA PRINCIPAL ---- */
  var _EDIT_TIPOS = [
    'Arquitectura', 'Ingeniería', 'C.R. Regantes', 'Ciclo del agua',
    'Promotora · Constructora', 'Administración pública', 'Hotel / Hostelería',
    'Hospital', 'Distribuidor', 'Otros',
  ];
  var _EDIT_PROVINCIAS = [
    'Almería', 'Cádiz', 'Córdoba', 'Granada', 'Huelva',
    'Jaén', 'Málaga', 'Sevilla', 'Murcia', 'Badajoz', 'Otras',
  ];
  var _EDIT_ESTADOS = Object.keys(STATUS_LABELS);
  var _EDIT_PRIORIDADES = ['alta', 'media', 'baja'];

  function openEditarFicha(studioId) {
    var s = State.studiosById && State.studiosById[studioId];
    if (!s) { notif('Empresa no encontrada', 'error'); return; }

    var tipoActual    = s.type || '';
    var provinciaActual = typeof s.province === 'object' ? (s.province && s.province.valor || '') : (s.province || '');
    var ciudadActual  = typeof s.city === 'object' ? (s.city && s.city.valor || '') : (s.city || '');
    var scoreActual   = s.score || 5;
    var prioActual    = s.priority || 'media';
    var statusActual  = s.status || 'nuevo';
    var ctc           = s.data && s.data.contact ? s.data.contact : {};
    var telActual     = typeof ctc.phone === 'object' ? (ctc.phone && ctc.phone.valor || '') : (ctc.phone || '');
    var emailActual   = typeof ctc.email === 'object' ? (ctc.email && ctc.email.valor || '') : (ctc.email || '');
    var webActual     = typeof ctc.web === 'object' ? (ctc.web && ctc.web.valor || '') : (ctc.web || '');
    var addressActual = typeof ctc.address === 'object' ? (ctc.address && ctc.address.valor || '') : (ctc.address || '');

    var fld = 'style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;' +
              'background:var(--bg-input,var(--bg-card));color:var(--fg-1);font-size:14px;box-sizing:border-box;"';

    function sel(id, opts, current) {
      return '<select id="' + id + '" ' + fld + '>' +
        opts.map(function (o) {
          var val   = typeof o === 'object' ? o.value : o;
          var label = typeof o === 'object' ? o.label : o;
          return '<option value="' + escape(val) + '"' + (val === current ? ' selected' : '') + '>' + label + '</option>';
        }).join('') +
      '</select>';
    }

    window.openSheet(
      '<div style="display:flex;flex-direction:column;height:100%;overflow:hidden;padding:0;">' +

        '<div style="flex-shrink:0;padding:16px 20px 12px;border-bottom:1px solid var(--line);' +
              'display:flex;align-items:center;justify-content:space-between;">' +
          '<div style="font-size:16px;font-weight:700;color:var(--fg-1);">✏️ Editar ficha</div>' +
          '<button onclick="closeSheet()" style="background:none;border:none;cursor:pointer;' +
                  'color:var(--fg-3);font-size:20px;line-height:1;padding:4px;">✕</button>' +
        '</div>' +

        '<div style="flex:1;overflow-y:auto;padding:16px 20px;min-height:0;">' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +

            '<div style="grid-column:1/-1;">' +
              '<label style="font-size:12px;color:var(--fg-3);display:block;margin-bottom:4px;">Nombre *</label>' +
              '<input id="ef-nombre" ' + fld + ' value="' + escape(s.name || '') + '"/>' +
            '</div>' +

            '<div>' +
              '<label style="font-size:12px;color:var(--fg-3);display:block;margin-bottom:4px;">Tipo</label>' +
              sel('ef-tipo', _EDIT_TIPOS, tipoActual) +
            '</div>' +

            '<div>' +
              '<label style="font-size:12px;color:var(--fg-3);display:block;margin-bottom:4px;">Estado</label>' +
              sel('ef-status', _EDIT_ESTADOS.map(function(k){ return { value: k, label: STATUS_LABELS[k] || k }; }), statusActual) +
            '</div>' +

            '<div>' +
              '<label style="font-size:12px;color:var(--fg-3);display:block;margin-bottom:4px;">Provincia</label>' +
              '<input id="ef-provincia" ' + fld + ' value="' + escape(provinciaActual) + '" list="ef-prov-list"/>' +
              '<datalist id="ef-prov-list">' + _EDIT_PROVINCIAS.map(function(p){ return '<option value="' + escape(p) + '">'; }).join('') + '</datalist>' +
            '</div>' +

            '<div>' +
              '<label style="font-size:12px;color:var(--fg-3);display:block;margin-bottom:4px;">Ciudad</label>' +
              '<input id="ef-ciudad" ' + fld + ' value="' + escape(ciudadActual) + '"/>' +
            '</div>' +

            '<div>' +
              '<label style="font-size:12px;color:var(--fg-3);display:block;margin-bottom:4px;">Score (1–10)</label>' +
              '<input id="ef-score" type="number" min="1" max="10" ' + fld + ' value="' + scoreActual + '"/>' +
            '</div>' +

            '<div>' +
              '<label style="font-size:12px;color:var(--fg-3);display:block;margin-bottom:4px;">Prioridad</label>' +
              sel('ef-prioridad', _EDIT_PRIORIDADES, prioActual) +
            '</div>' +

            '<div>' +
              '<label style="font-size:12px;color:var(--fg-3);display:block;margin-bottom:4px;">Teléfono</label>' +
              '<input id="ef-tel" ' + fld + ' value="' + escape(telActual) + '"/>' +
            '</div>' +

            '<div>' +
              '<label style="font-size:12px;color:var(--fg-3);display:block;margin-bottom:4px;">Email</label>' +
              '<input id="ef-email" type="email" ' + fld + ' value="' + escape(emailActual) + '"/>' +
            '</div>' +

            '<div style="grid-column:1/-1;">' +
              '<label style="font-size:12px;color:var(--fg-3);display:block;margin-bottom:4px;">Web</label>' +
              '<input id="ef-web" ' + fld + ' value="' + escape(webActual) + '"/>' +
            '</div>' +

            '<div style="grid-column:1/-1;">' +
              '<label style="font-size:12px;color:var(--fg-3);display:block;margin-bottom:4px;">Dirección</label>' +
              '<input id="ef-address" ' + fld + ' placeholder="C/ Ejemplo, 12, CP 41470, Peñaflor" value="' + escape(addressActual) + '"/>' +
            '</div>' +

          '</div>' +
          '<div id="ef-error" style="margin-top:10px;color:var(--mute-red-dark,#c0392b);font-size:13px;display:none;"></div>' +
        '</div>' +

        '<div style="flex-shrink:0;padding:12px 20px 4px;border-top:1px solid var(--line);display:flex;gap:10px;">' +
          '<button onclick="closeSheet()" ' +
                  'style="flex:1;padding:10px;border:1px solid var(--line);border-radius:8px;' +
                  'background:transparent;color:var(--fg-2);font-size:14px;font-weight:600;cursor:pointer;">' +
            'Cancelar' +
          '</button>' +
          '<button onclick="window.Screens.detail.guardarFicha(\'' + escape(studioId) + '\')" ' +
                  'style="flex:2;padding:10px;border:none;border-radius:8px;' +
                  'background:var(--gpf-blue-700,#1d4ed8);color:#fff;font-size:14px;font-weight:600;cursor:pointer;"' +
                  'id="ef-save-btn">' +
            '✓ Guardar cambios' +
          '</button>' +
        '</div>' +
        /* Zona de peligro — eliminar empresa */
        '<div style="padding:8px 20px 16px; text-align:center;">' +
          '<button id="ef-delete-btn" ' +
            'onclick="window.Screens.detail._confirmDelete(\'' + escape(studioId) + '\')" ' +
            'style="background:none;border:none;cursor:pointer;font-size:12px;color:var(--fg-4,#94a3b8);' +
            'text-decoration:underline;padding:4px 8px;">' +
            '🗑️ Eliminar empresa' +
          '</button>' +
        '</div>' +

      '</div>'
    );

    setTimeout(function () { var el = document.getElementById('ef-nombre'); if (el) el.focus(); }, 120);
  }

  async function guardarFicha(studioId) {
    var nombre = ((document.getElementById('ef-nombre') || {}).value || '').trim();
    var errEl  = document.getElementById('ef-error');
    if (!nombre) {
      if (errEl) { errEl.textContent = '⚠️ El nombre es obligatorio.'; errEl.style.display = 'block'; }
      return;
    }
    if (errEl) errEl.style.display = 'none';

    var btn = document.getElementById('ef-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

    var tipo      = (document.getElementById('ef-tipo')      || {}).value || '';
    var status    = (document.getElementById('ef-status')    || {}).value || 'nuevo';
    var provincia = ((document.getElementById('ef-provincia') || {}).value || '').trim();
    var ciudad    = ((document.getElementById('ef-ciudad')   || {}).value || '').trim();
    var score     = parseInt((document.getElementById('ef-score')    || {}).value || '5', 10);
    var prioridad = (document.getElementById('ef-prioridad') || {}).value || 'media';
    var tel       = ((document.getElementById('ef-tel')      || {}).value || '').trim();
    var email     = ((document.getElementById('ef-email')    || {}).value || '').trim();
    var web       = ((document.getElementById('ef-web')      || {}).value || '').trim();
    var address   = ((document.getElementById('ef-address')  || {}).value || '').trim();
    if (web && !/^https?:\/\//i.test(web)) web = 'https://' + web;

    // Construir data JSONB completo para no machacar campos existentes
    var s = State.studiosById && State.studiosById[studioId];
    var currentData = Object.assign({}, (s && s.data) || {});
    var ctc = Object.assign({}, currentData.contact || {});
    if (tel)     ctc.phone   = tel;
    if (email)   ctc.email   = email;
    if (web)     ctc.web     = web;
    if (address) ctc.address = address;
    currentData.contact = ctc;

    var patch = {
      name: nombre, type: tipo, status: status,
      province: provincia, city: ciudad,
      score: score, priority: prioridad,
      data: currentData,
    };

    try {
      await saveTopFields(studioId, patch);
      window.closeSheet();
      notif('Ficha actualizada ✓', 'success');
      render({ studioId: studioId, tab: _tab });
      _resyncContactIfNeeded(studioId);   // si estaba en Contactos, re-empuja a Google
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = '✓ Guardar cambios'; }
      if (errEl) { errEl.textContent = '⚠️ Error: ' + (e.message || e); errEl.style.display = 'block'; }
    }
  }

  /* Si el estudio ya está sincronizado con Google Contacts, re-empuja los datos
     actualizados (fire-and-forget: no bloquea el guardado de la ficha). */
  async function _resyncContactIfNeeded(studioId) {
    try {
      const raw = State.studiosById && State.studiosById[studioId];
      const sync = raw && raw.data && raw.data.contactSync;
      if (!sync || !sync.resourceName) return;
      const res = await window.Data.syncContact('upsert', _contactSyncPayload(getStudio(studioId)), sync.resourceName);
      await saveDataField(studioId, 'contactSync', {
        resourceName: res.resourceName, etag: res.etag, syncedAt: new Date().toISOString(),
      });
      notif('Contacto actualizado en tu agenda de Google', 'success');
    } catch (e) {
      notif('No se pudo actualizar el contacto en Google: ' + (e && e.message || e), 'error');
    }
  }

  /* ---- CONFIRMACIÓN Y ELIMINACIÓN ---- */
  function _confirmDelete(studioId) {
    var btn = document.getElementById('ef-delete-btn');
    if (!btn) return;
    // Si ya está en modo confirmación, ejecutar
    if (btn.getAttribute('data-confirming') === '1') {
      window.Screens.detail.eliminarEmpresa(studioId);
      return;
    }
    // Primer click — modo confirmación
    btn.setAttribute('data-confirming', '1');
    btn.textContent = '⚠️ ¿Seguro? Pulsa de nuevo para eliminar definitivamente';
    btn.style.color = '#ef4444';
    btn.style.fontWeight = '600';
    // Reset automático si no confirma en 5 s
    setTimeout(function () {
      if (btn && btn.getAttribute('data-confirming') === '1') {
        btn.removeAttribute('data-confirming');
        btn.textContent = '🗑️ Eliminar empresa';
        btn.style.color = '';
        btn.style.fontWeight = '';
      }
    }, 5000);
  }

  async function eliminarEmpresa(studioId) {
    var btn = document.getElementById('ef-delete-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Eliminando…'; }
    try {
      await window.Data.deleteDoc('studios/' + studioId);
      // Limpiar State
      if (State.studiosById) delete State.studiosById[studioId];
      if (State.studios) {
        State.studios = State.studios.filter(function (s) { return s.id !== studioId; });
      }
      window.closeSheet();
      notif('Empresa eliminada', 'info');
      window.showView('studios');
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = '🗑️ Eliminar empresa'; btn.removeAttribute('data-confirming'); }
      notif('Error al eliminar: ' + (e.message || e), 'error');
    }
  }

  /* ============================================================
     CTAs
     ============================================================ */
  /* ============================================================
     PANEL DE EMAIL v3 — ARQUETIPOS, no plantillas
     ------------------------------------------------------------
     Antes aquí había 6 textos enlatados. Se quitaron por dos razones:
     ignoraban al destinatario (el mismo párrafo para un arquitecto que
     para una comunidad de regantes) y contradecían las preferencias del
     propio Manolo — saludaban por nombre de pila cuando pide apellido,
     firmaban "Delegado Zona Sur" sin Tuyper, y la de catálogo colaba un
     "no dude en pedirlo", que está en su lista de muletillas prohibidas.

     Ahora cada chip es un ARQUETIPO de CoachDoctrine: el correo lo
     redacta el coach con la doctrina, el perfil detectado del
     destinatario y el historial de la ficha. No queda texto fijo.
     ============================================================ */

  var _FROM_EMAIL = 'ma.fernandez@grupogpf.com';

  /* Los ids coinciden con las claves de CoachDoctrine.TIPOS, salvo 'libre',
     que no fija arquetipo: deja que se deduzca de la instrucción y del
     historial (_inferirTipoCorreo). La `pista` es el placeholder del campo
     de instrucción, y va redactada para empujar hacia lo que ese arquetipo
     necesita saber. */
  function _emailArquetipos() {
    return [
      { id: 'libre',          icon: '✨', label: 'Libre',
        pista: 'Describe qué quieres decir… ej: «recordarle que me prometió el plano del embalse»' },
      { id: 'primera',        icon: '👋', label: 'Primer contacto',
        pista: 'Algo concreto y verificable de ellos: una obra suya, su especialidad, su zona' },
      { id: 'seguimiento',    icon: '🔄', label: 'Seguimiento',
        pista: 'Qué aporta de nuevo este correo (un «¿lo vio?» no es un seguimiento)' },
      { id: 'catalogo',       icon: '📋', label: 'Fichas técnicas',
        pista: 'Qué fichas le mandas y para qué proyecto suyo' },
      { id: 'documentacion',  icon: '📎', label: 'Lo que me pidió',
        pista: 'Qué documentos envías y para qué le sirve cada uno' },
      { id: 'herramienta',    icon: '🛠️', label: 'Herramienta útil',
        pista: 'Qué le resuelve la hoja o la herramienta que le mandas' },
      { id: 'reunion',        icon: '📅', label: 'Pedir visita',
        pista: 'Motivo real de la visita y qué gana él con ella' },
      { id: 'agradecimiento', icon: '🤝', label: 'Agradecimiento',
        pista: 'Qué agradeces exactamente (específico gana a genérico)' },
      { id: 'reactivacion',   icon: '💫', label: 'Reactivación',
        pista: 'Qué ha cambiado desde la última vez y justifica escribir ahora' },
    ];
  }

  /* Devuelve el arquetipo activo del panel. */
  function _arquetipoActivo() {
    var arqs = _emailArquetipos();
    return arqs[window._emailPanelActive] || arqs[0];
  }
  /* Modelo para la redacción con IA. Aislado aquí para poder cambiarlo de un
     tirón (el proxy GAS es passthrough, así que acepta cualquier id válido). */
  var _IA_MODEL = 'claude-opus-5';

  /* Esfuerzo de razonamiento. En Opus 5 el pensamiento va ACTIVADO por defecto,
     y con el esfuerzo por defecto (high) se comía el presupuesto de tokens antes
     de escribir el correo (stop_reason: max_tokens).
     Medido en vivo sobre el mismo caso (KR Arquitectura, arquetipo reunion):
       medium → 38,3 s · low → 30,8 s (1.100 tokens de pensamiento, 231 palabras)
     Se deja en 'medium': son correos a cliente real y 7 segundos no compensan
     arriesgar calidad. Bájalo a 'low' si prefieres velocidad. */
  var _IA_EFFORT = 'medium';

  /* Deduce el arquetipo de correo (claves de CoachDoctrine.TIPOS) a partir de lo
     que Manolo escribe en el campo de instrucción y del historial del estudio.
     Sin historial → primer contacto en frío, que es el caso con reglas propias. */
  function _inferirTipoCorreo(studio, instruccion) {
    var txt = String(instruccion || '').toLowerCase();
    if (/gracias|agradec/.test(txt))                                        return 'agradecimiento';
    if (/hoja de c[aá]lculo|calculadora|herramienta|te calcula/.test(txt))   return 'herramienta';
    if (/cat[aá]logo|ficha|dossier|documentaci[oó]n/.test(txt)) {
      return /me pidi|solicit|ped[ií]a?\b|hab[ií]a pedido|que me pidi/.test(txt) ? 'documentacion' : 'catalogo';
    }
    if (/visita|reuni[oó]n|cita|vernos|quedar|pasarme a verle/.test(txt))    return 'reunion';
    if (/retomar|hace tiempo|reactivar|volver a contactar/.test(txt))        return 'reactivacion';
    var tieneHistorial =
      ((studio.reports    || []).length > 0) ||
      ((studio.activities || []).length > 0);
    return tieneHistorial ? 'seguimiento' : 'primera';
  }

  /* Construye la URL mailto con from= para Apple Mail */
  function _mailtoUrl(toEmail, subject, body) {
    return 'mailto:' + encodeURIComponent(toEmail) +
      '?from=' + encodeURIComponent(_FROM_EMAIL) +
      '&subject=' + encodeURIComponent(subject) +
      '&body=' + encodeURIComponent(body);
  }

  /* Renderiza el sheet completo y lo mete en #sheet-content */
  function _renderEmailSheet(studio, activeIdx, iaSubject, iaBody) {
    var email     = studio.email || '';
    var templates = _emailArquetipos();
    var tpl       = templates[activeIdx] || templates[0];

    // Ya no hay texto enlatado: todo correo se genera. Vacío = aún sin generar.
    var subject = iaSubject || '';
    var body    = iaBody    || '';
    // Guardar el texto activo para poder enviarlo aunque la ficha no tenga email
    // (el usuario indica el destinatario en el momento).
    window._emailPanelSubject = subject;
    window._emailPanelBody    = body;

    // Historial de emails registrados como actividades
    var emailActs = (studio.activities || [])
      .filter(function (a) { return a.type === 'email'; })
      .sort(function (a, b) { return (b.createdAt || b.date || '') > (a.createdAt || a.date || '') ? 1 : -1; });

    var histHtml = emailActs.length === 0
      ? '<p style="font-size:13px; color:var(--fg-3); margin:0; padding:8px 0;">Sin emails registrados en el CRM para este cliente.</p>'
      : emailActs.slice(0, 5).map(function (a) {
          return (
            '<div style="display:flex; gap:10px; padding:10px 0; border-bottom:1px solid var(--line);">' +
              '<span style="font-size:18px; flex:0 0 auto;">📧</span>' +
              '<div style="min-width:0;">' +
                '<div style="font-size:13px; font-weight:600; color:var(--fg-1); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + escape(a.text || '(sin asunto)') + '</div>' +
                '<div style="font-size:12px; color:var(--fg-3);">' + escape(U.formatDateES(a.createdAt) || a.date || '—') + '</div>' +
              '</div>' +
            '</div>'
          );
        }).join('');

    var chip = function (active) {
      return 'padding:6px 10px; border-radius:20px; font-size:12px; cursor:pointer; border:1.5px solid; white-space:nowrap; ' +
        (active ? 'background:var(--gpf-blue-700);color:#fff;border-color:var(--gpf-blue-700);'
                : 'background:transparent;color:var(--fg-2);border-color:var(--line);');
    };

    /* Zona central. Un solo camino: o hay correo generado, o hay que generarlo.
       Antes había una rama distinta para las plantillas fijas; ya no existen. */
    var previewZone;
    var yaGenerado = !!(subject || body);

    // Aviso del coach: canal equivocado, descuadre de adjuntos o suposición
    // relevante. La doctrina obliga a decirlo en vez de redactar por inercia,
    // así que va ARRIBA, donde no se pueda pasar por alto.
    var avisoHtml = (yaGenerado && window._emailPanelIAAviso)
      ? '<div style="background:#fffbeb; border:1.5px solid #fcd34d; border-radius:10px; padding:10px 12px; margin-bottom:10px; ' +
          'font-size:12.5px; color:#92400e; line-height:1.5;">' +
          '<strong>⚠️ Aviso del coach:</strong> ' + escape(window._emailPanelIAAviso) +
        '</div>'
      : '';
    var metaHtml = (yaGenerado && window._emailPanelIAMeta)
      ? '<div style="font-size:11px; color:var(--fg-3); margin-bottom:8px; letter-spacing:.02em;">' +
          escape(window._emailPanelIAMeta) +
        '</div>'
      : '';

    var cajaTexto = yaGenerado
      ? '<div style="background:var(--bg-1); border:1.5px solid var(--line); border-radius:10px; padding:14px; margin-bottom:12px;" id="ep-preview">' +
          '<div style="font-size:12px; font-weight:700; color:var(--fg-3); margin-bottom:6px;">Asunto: <span style="color:var(--fg-1); font-weight:400;" id="ep-subject">' + escape(subject) + '</span></div>' +
          '<div style="font-size:13px; color:var(--fg-1); line-height:1.6; white-space:pre-wrap; max-height:200px; overflow-y:auto;" id="ep-body">' + escape(body) + '</div>' +
        '</div>'
      : '<div style="background:var(--bg-1); border:1.5px dashed var(--line); border-radius:10px; padding:16px; margin-bottom:12px; ' +
          'text-align:center; color:var(--fg-3); font-size:13px; line-height:1.5;" id="ep-preview">' +
          escape(tpl.icon + ' ' + tpl.label) + '<br>' +
          '<span style="font-size:12px;">El coach escribirá el correo con tu doctrina, el perfil del destinatario y lo que haya en la ficha.</span>' +
        '</div>';

    previewZone = (
      avisoHtml + metaHtml + cajaTexto +
      '<textarea id="ep-ia-input" placeholder="' + escape(tpl.pista) + '" ' +
        'style="width:100%; box-sizing:border-box; padding:10px 12px; border:1.5px solid var(--line); border-radius:10px; font-size:13px; ' +
        'background:var(--bg-card); color:var(--fg-1); resize:none; min-height:' + (yaGenerado ? '64' : '80') + 'px; margin-bottom:10px; font-family:inherit;">' +
        escape(yaGenerado ? '' : (window._emailPanelSeed || '')) +
      '</textarea>' +
      '<button class="btn ' + (yaGenerado ? 'btn-ghost' : 'btn-primary') + '" style="width:100%; margin-bottom:12px;" ' +
        'onclick="window.Screens.detail._emailGenerar()">' +
        (yaGenerado ? '✨ Regenerar' : '✨ Escribir con el coach') +
      '</button>'
    );

    // Botones de acción — <a href="mailto:"> nativo para que Chrome lo honre siempre
    var tieneTexto = !!(subject || body);
    var copyText = subject + (subject && body ? '\n\n' : '') + body;
    var mailtoHref = (email && tieneTexto) ? escape(_mailtoUrl(email, subject, body)) : '';
    var actionBtns = (
      '<div style="display:flex; gap:10px;">' +
        (tieneTexto
          ? (email
              ? '<a href="' + mailtoHref + '" ' +
                  'style="flex:1; display:flex; align-items:center; justify-content:center; gap:6px; ' +
                  'background:var(--gpf-blue-700); color:#fff; border-radius:8px; padding:10px 16px; ' +
                  'font-size:14px; font-weight:600; text-decoration:none; cursor:pointer;">' +
                  I.Mail() + ' Abrir en Mail' +
                '</a>'
              : '<button class="btn btn-primary" style="flex:1; display:flex; align-items:center; justify-content:center; gap:6px;" ' +
                  'onclick="window.Screens.detail._emailPedirDestinatario()">' +
                  I.Mail() + ' Enviar (indicar email)' +
                '</button>')
          : '<span class="btn btn-primary" style="flex:1; opacity:.5; text-align:center;">' +
              'Genera el correo para poder enviarlo' + '</span>') +
        (tieneTexto
          ? '<button class="btn btn-ghost" style="flex:0 0 auto;" ' +
              'onclick="navigator.clipboard && navigator.clipboard.writeText(' + JSON.stringify(copyText).replace(/"/g, '&quot;') + ').then(function(){window.showNotification(\'📋 Texto copiado\', \'success\')})">' +
              I.FileText() + ' Copiar' +
            '</button>'
          : '') +
      '</div>'
    );

    // Layout flex: cabecera fija + cuerpo scrollable + botones siempre visibles abajo
    var content = document.getElementById('sheet-content');
    if (!content) return;
    content.style.cssText = 'display:flex; flex-direction:column; height:100%; overflow:hidden; padding:0;';
    content.innerHTML = (
      // Cabecera fija
      '<div style="flex-shrink:0; padding:16px 20px 12px; border-bottom:1px solid var(--line);">' +
        '<div style="display:flex; align-items:flex-start; justify-content:space-between;">' +
          '<div>' +
            '<div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:var(--fg-3);">Correo electrónico</div>' +
            '<div style="font-size:18px; font-weight:700; color:var(--fg-1); margin-top:2px;">' + escape(studio.name) + '</div>' +
            (email
              ? '<div style="font-size:13px; color:var(--gpf-blue-700); margin-top:1px;">' + escape(email) + '</div>'
              : '<div style="font-size:13px; color:var(--fg-3);">Sin email registrado</div>') +
          '</div>' +
          '<button onclick="window.closeSheet()" style="background:none; border:none; cursor:pointer; font-size:22px; color:var(--fg-3); padding:4px; margin-top:-4px;">✕</button>' +
        '</div>' +
      '</div>' +
      // Cuerpo scrollable
      '<div style="flex:1; overflow-y:auto; padding:16px 20px; min-height:0;">' +
        // Historial
        '<div style="margin-bottom:16px;">' +
          '<div style="font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:var(--fg-3); margin-bottom:6px;">📬 Historial</div>' +
          histHtml +
        '</div>' +
        // Chips de arquetipo
        '<div style="font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:var(--fg-3); margin-bottom:8px;">✍️ Tipo de correo</div>' +
        '<div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:16px;">' +
          templates.map(function (t, i) {
            return '<button style="' + chip(i === activeIdx) + '" onclick="window.Screens.detail._emailChip(' + i + ')">' + t.icon + ' ' + escape(t.label) + '</button>';
          }).join('') +
        '</div>' +
        // Preview / zona IA
        previewZone +
      '</div>' +
      // Botones — siempre visibles, pegados al fondo
      '<div style="flex-shrink:0; padding:12px 20px 16px; border-top:1px solid var(--line);">' +
        actionBtns +
      '</div>'
    );
  }

  function openEmailPanel(studio, seedInstruction) {
    window._emailPanelStudio  = studio;
    window._emailPanelSeed    = seedInstruction || '';
    window._emailPanelIASub   = '';
    window._emailPanelIABody  = '';
    window._emailPanelIAAviso = '';
    window._emailPanelIAMeta  = '';
    // Se abre siempre en 'libre' (índice 0): si llega una semilla desde la
    // Bandeja, el coach deduce el arquetipo de ese texto; y si no llega, lo
    // deduce del historial de la ficha. Elegir chip es opcional, no un paso.
    window._emailPanelActive = 0;
    window.openSheet('<div class="handle"></div>');  // abre el sheet vacío para que la animación arranque
    _renderEmailSheet(studio, window._emailPanelActive, '', '');
  }

  /* ============================================================
     IMPORTAR VISITA DESDE .YAML (app de transcripción)
     ============================================================ */

  /* --- Carga diferida de js-yaml (igual que XLSX) --- */
  function _loadYamlLib(cb) {
    if (typeof jsyaml !== 'undefined') { cb(); return; }
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.min.js';
    s.onload = cb;
    s.onerror = function () {
      alert('No se pudo cargar el parser YAML. Comprueba la conexión e inténtalo de nuevo.');
    };
    document.head.appendChild(s);
  }

  /* --- Abre el modal inicial con dropzone --- */
  function openImportarVisitaModal(studio) {
    _importState = null;
    showModal(
      '<div style="background:var(--bg-card); border-radius:14px; padding:24px; width:100%; ' +
        'max-width:540px; max-height:88vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,.3);">' +
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">' +
          '<h3 style="margin:0; font-family:var(--font-display); font-size:20px; font-weight:700;">📥 Importar visita</h3>' +
          '<button onclick="window.Screens.detail.closeModal()" ' +
            'style="background:none; border:none; cursor:pointer; font-size:20px; color:var(--fg-3); padding:0;">✕</button>' +
        '</div>' +
        '<p style="font-size:13px; color:var(--fg-3); margin:0 0 14px;">' +
          'Se asociará al estudio actualmente seleccionado: <strong>' + escape(studio.name) + '</strong>' +
        '</p>' +
        '<div id="yaml-dropzone" style="border:2px dashed var(--border-2); border-radius:8px; padding:32px; ' +
          'text-align:center; cursor:pointer; background:var(--bg-1); transition:background .2s;">' +
          '<div style="font-size:2.5rem; line-height:1; margin-bottom:8px;">📂</div>' +
          '<div style="font-weight:600; font-size:14px;">Arrastra el archivo .yaml aquí</div>' +
          '<div style="font-size:12px; color:var(--fg-3); margin-top:4px;">o pulsa para abrir el selector</div>' +
          '<input id="yaml-input" type="file" accept=".yaml,.yml" style="display:none;">' +
        '</div>' +
        '<div id="yaml-validation-msg" style="margin-top:10px;"></div>' +
      '</div>'
    );
    // Wire dropzone
    setTimeout(function () {
      var dz  = document.getElementById('yaml-dropzone');
      var inp = document.getElementById('yaml-input');
      if (!dz || !inp) return;
      dz.onclick  = function () { inp.click(); };
      dz.ondragover  = function (e) { e.preventDefault(); dz.style.background = 'rgba(10,45,82,.05)'; };
      dz.ondragleave = function ()  { dz.style.background = 'var(--bg-1)'; };
      dz.ondrop = function (e) {
        e.preventDefault(); dz.style.background = 'var(--bg-1)';
        if (e.dataTransfer.files && e.dataTransfer.files[0]) _procesarArchivoYaml(e.dataTransfer.files[0], studio);
      };
      inp.onchange = function (e) {
        if (e.target.files && e.target.files[0]) _procesarArchivoYaml(e.target.files[0], studio);
      };
    }, 50);
    // Pre-carga silenciosa del parser
    _loadYamlLib(function () {});
  }

  /* --- Valida y parsea el archivo seleccionado --- */
  function _procesarArchivoYaml(file, studio) {
    if (!file.name.match(/\.(yaml|yml)$/i)) {
      var msg = document.getElementById('yaml-validation-msg');
      if (msg) msg.innerHTML = '<div style="color:#dc2626; font-size:13px; padding:8px; ' +
        'background:#fef2f2; border-radius:6px;">⚠️ Solo se aceptan archivos .yaml o .yml</div>';
      return;
    }
    _loadYamlLib(function () {
      var reader = new FileReader();
      reader.onload = function (e) {
        var yaml;
        try { yaml = jsyaml.load(e.target.result); }
        catch (err) {
          var msg = document.getElementById('yaml-validation-msg');
          if (msg) msg.innerHTML = '<div style="color:#dc2626; font-size:13px; padding:8px; ' +
            'background:#fef2f2; border-radius:6px;">⚠️ YAML inválido: ' + escape(err.message) + '</div>';
          return;
        }

        var errors   = [];
        var warnings = [];

        // Schema version
        var sv = yaml && yaml._meta && yaml._meta.schema_version;
        if (!sv)           warnings.push('No se encontró _meta.schema_version en el archivo');
        else if (sv !== '1.0.0') warnings.push('Schema version ' + sv + ' ≠ 1.0.0 — puede haber campos incompatibles');

        // Campos requeridos
        var v    = yaml && yaml.visita;
        var inter = yaml && yaml.interlocutores && yaml.interlocutores.principal;
        var dev  = yaml && yaml.desarrollo;
        var ev   = yaml && yaml.evaluacion;

        function req(val, label) {
          if (!val && val !== 0) errors.push(label + ' es obligatorio');
        }
        req(v && v.fecha,                          'visita.fecha');
        req(v && v.duracion_minutos != null ? true : null, 'visita.duracion_minutos');
        req(v && v.tipo_visita,                    'visita.tipo_visita');
        req(inter && inter.nombre,                 'interlocutores.principal.nombre');
        req(inter && inter.cargo,                  'interlocutores.principal.cargo');
        req(dev && dev.resumen_ejecutivo,           'desarrollo.resumen_ejecutivo');
        req(ev && ev.temperatura != null ? true : null, 'evaluacion.temperatura');
        req(ev && ev.nuevo_status,                 'evaluacion.nuevo_status');

        // Enums
        if (v && v.tipo_visita && TIPOS_VISITA_VALIDOS.indexOf(v.tipo_visita) === -1)
          errors.push('visita.tipo_visita "' + v.tipo_visita + '" no es válido. Valores: ' + TIPOS_VISITA_VALIDOS.join(', '));
        if (ev && ev.nuevo_status && ESTADOS_VALIDOS.indexOf(ev.nuevo_status) === -1)
          errors.push('evaluacion.nuevo_status "' + ev.nuevo_status + '" no es válido. Valores: ' + ESTADOS_VALIDOS.join(', '));

        // Temperatura en rango
        if (ev && ev.temperatura != null) {
          var t = Number(ev.temperatura);
          if (isNaN(t) || t < 1 || t > 10) warnings.push('evaluacion.temperatura (' + ev.temperatura + ') debería estar entre 1 y 10');
        }

        // Idempotencia
        var existingReps = (studio.reports || []);
        var dup = existingReps.find(function (r) { return r.imported_from === file.name; });
        if (dup) warnings.push('⚠️ Ya hay una visita importada desde "' + file.name + '" (' + (dup.date || dup.imported_at || '') + '). Si continúas se creará un duplicado');

        _importState = { yaml: yaml, fileName: file.name, validationErrors: errors, warnings: warnings };
        _mostrarPreviewImport(studio);
      };
      reader.readAsText(file, 'UTF-8');
    });
  }

  /* --- Renderiza la previsualización dentro del modal --- */
  function _mostrarPreviewImport(studio) {
    if (!_importState) return;
    var ov = document.getElementById('detail-modal-ov');
    if (!ov) return;

    var st   = _importState;
    var yaml = st.yaml;
    var v    = yaml.visita || {};
    var inter = (yaml.interlocutores && yaml.interlocutores.principal) || {};
    var dev  = yaml.desarrollo || {};
    var ev   = yaml.evaluacion || {};
    var comprNos    = arr((dev.compromisos && dev.compromisos.por_nuestra_parte) || []).filter(function(c) { return c && c.accion; });
    var comprClient = arr((dev.compromisos && dev.compromisos.por_parte_del_cliente) || []).filter(function(c) { return c && c.accion; });
    var nObjeciones  = arr(dev.objeciones || []).filter(function(o) { return o && o.objecion; }).length;
    var nProyectos   = arr((yaml.oportunidades_detectadas && yaml.oportunidades_detectadas.proyectos) || []).filter(function(p) { return p && p.nombre; }).length;
    var nCompetid    = arr((yaml.intel_competitiva && yaml.intel_competitiva.competidores) || []).filter(function(c) { return c && c.nombre; }).length;
    var contextExt   = yaml.contexto_extra_ia;

    var TIPO_L  = { primera_visita:'Primera visita', seguimiento:'Seguimiento', demo:'Demo',
      propuesta:'Propuesta', negociacion:'Negociación', cierre:'Cierre', postventa:'Postventa' };
    var MODAL_L = { presencial:'Presencial', videollamada:'Videollamada', telefonica:'Telefónica' };

    // Bloques de errores y advertencias
    var errBlock = '';
    if (st.validationErrors.length) {
      errBlock = '<div style="background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:12px; margin-bottom:12px;">' +
        '<div style="font-weight:600; color:#dc2626; font-size:13px; margin-bottom:6px;">⛔ El archivo tiene errores bloqueantes (' + st.validationErrors.length + ')</div>' +
        st.validationErrors.map(function(e) { return '<div style="font-size:12px; color:#dc2626; margin-bottom:2px;">• ' + escape(e) + '</div>'; }).join('') +
      '</div>';
    }
    var warnBlock = '';
    if (st.warnings.length) {
      warnBlock = '<div style="background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:10px; margin-bottom:12px;">' +
        '<div style="font-weight:600; color:#b45309; font-size:13px; margin-bottom:4px;">⚠ Advertencias</div>' +
        st.warnings.map(function(w) { return '<div style="font-size:12px; color:#92400e; margin-bottom:2px;">• ' + escape(w) + '</div>'; }).join('') +
      '</div>';
    }

    // Previsualización (solo si no hay errores bloqueantes)
    var previewBlock = '';
    if (!st.validationErrors.length) {
      var tempN   = ev.temperatura != null ? Number(ev.temperatura) : null;
      var tempIco = tempN != null ? (tempN >= 8 ? '🔥' : tempN >= 5 ? '🌤️' : '❄️') + ' ' + tempN + '/10' : '—';
      var statusL = STATUS_LABELS[ev.nuevo_status] || ev.nuevo_status || '—';
      var dmText  = inter.es_decision_maker === true ? ' · ✅ DM' : inter.es_decision_maker === false ? ' · ❌ no DM' : '';

      function row(label, val) {
        if (!val && val !== 0) return '';
        return '<div style="display:flex; flex-direction:column; gap:1px;">' +
          '<span style="font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:.04em; color:var(--fg-3);">' + label + '</span>' +
          '<span style="font-size:13px; color:var(--fg-1);">' + val + '</span>' +
        '</div>';
      }

      previewBlock = (
        '<div style="background:var(--bg-2); border-radius:10px; padding:14px; margin-bottom:12px;">' +
          '<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px 16px; margin-bottom:12px;">' +
            row('Fecha', escape(v.fecha || '—')) +
            row('Duración', v.duracion_minutos ? v.duracion_minutos + ' min' : '—') +
            row('Tipo de visita', escape(TIPO_L[v.tipo_visita] || v.tipo_visita || '—')) +
            row('Interlocutor', escape((inter.nombre || '—') + ' · ' + (inter.cargo || '—') + dmText)) +
            row('Temperatura', tempIco) +
            row('Estado tras visita', escape(statusL)) +
            (comprNos.length + comprClient.length ? row('Compromisos', (comprNos.length + comprClient.length) + ' (' + comprNos.length + ' nuestros, ' + comprClient.length + ' del cliente)') : '') +
            (nObjeciones ? row('Objeciones', nObjeciones + '') : '') +
            (nProyectos  ? row('Oportunidades', nProyectos + '') : '') +
            (nCompetid   ? row('Competidores', nCompetid + '') : '') +
          '</div>' +
          /* Resumen ejecutivo */
          '<div style="background:var(--gpf-blue-100); border-left:3px solid var(--gpf-blue-500); ' +
            'padding:10px 12px; border-radius:0 6px 6px 0;">' +
            '<div style="font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; ' +
              'color:var(--gpf-blue-700); margin-bottom:4px;">Resumen ejecutivo</div>' +
            '<p style="font-size:13px; color:var(--fg-1); margin:0; line-height:1.5;">' +
              escape(dev.resumen_ejecutivo || '') +
            '</p>' +
          '</div>' +
          /* Nota IA si viene */
          (contextExt && contextExt !== null && String(contextExt).trim() !== ''
            ? '<div style="margin-top:10px; background:#fefce8; border-left:3px solid #eab308; ' +
                'padding:10px 12px; border-radius:0 6px 6px 0;">' +
                '<div style="font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; ' +
                  'color:#854d0e; margin-bottom:4px;">💡 Nota IA</div>' +
                '<p style="font-size:12px; color:#713f12; margin:0; line-height:1.5;">' + escape(String(contextExt)) + '</p>' +
              '</div>'
            : '') +
        '</div>'
      );
    }

    var actionHtml = st.validationErrors.length
      ? '<button class="btn btn-ghost btn-block" onclick="window.Screens.detail.closeModal()">Cerrar</button>'
      : '<div style="display:flex; gap:8px;">' +
          '<button id="btn-confirmar-import" class="btn btn-primary" style="flex:1;" ' +
            'onclick="window.Screens.detail._confirmarImportarVisita(\'' + escape(studio.id) + '\')">' +
            '✅ Confirmar e importar' +
          '</button>' +
          '<button class="btn btn-ghost" onclick="window.Screens.detail.closeModal()">Cancelar</button>' +
        '</div>';

    var _impProys = arr(studio.projects);
    var _proySelector = (!st.validationErrors.length && _impProys.length) ? (
      '<div style="margin-top:14px; padding:12px; background:var(--paper-warm); border:1px solid var(--line); border-radius:10px;">' +
        '<label class="field-label" for="import-proyecto" style="margin-bottom:6px;">Asociar a un proyecto (opcional)</label>' +
        '<select id="import-proyecto" class="field" ' +
          'onchange="var w=document.getElementById(\'import-proy-estado-wrap\'); if(w) w.style.display=(this.value===\'\'?\'none\':\'\');">' +
          '<option value="">— Sin proyecto (visita general) —</option>' +
          _impProys.map(function (p, i) { return '<option value="' + i + '">' + escape(p.nombre || p.name || ('Proyecto ' + (i + 1))) + '</option>'; }).join('') +
        '</select>' +
        '<div id="import-proy-estado-wrap" style="display:none; margin-top:10px;">' +
          '<label class="field-label" for="import-proy-estado" style="margin-bottom:6px;">Estado del proyecto tras esta visita</label>' +
          '<select id="import-proy-estado" class="field">' +
            '<option value="">— sin cambiar —</option>' +
            Object.keys(PROYECTO_ESTADO).map(function (k) { return '<option value="' + k + '">' + escape(PROYECTO_ESTADO[k]) + '</option>'; }).join('') +
          '</select>' +
        '</div>' +
      '</div>'
    ) : '';

    ov.innerHTML = (
      '<div style="background:var(--bg-card); border-radius:14px; padding:24px; width:100%; ' +
        'max-width:540px; max-height:88vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,.3);">' +
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">' +
          '<h3 style="margin:0; font-family:var(--font-display); font-size:18px; font-weight:700; ' +
            'overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:88%;">' +
            '📥 ' + escape(st.fileName) +
          '</h3>' +
          '<button onclick="window.Screens.detail.closeModal()" ' +
            'style="background:none; border:none; cursor:pointer; font-size:20px; color:var(--fg-3); padding:0; flex-shrink:0;">✕</button>' +
        '</div>' +
        '<p style="font-size:13px; color:var(--fg-3); margin:0 0 14px;">' +
          'Asociado a: <strong>' + escape(studio.name) + '</strong>' +
        '</p>' +
        errBlock + warnBlock + previewBlock + _proySelector +
        '<div id="import-error-block"></div>' +
        '<div style="margin-top:14px;">' + actionHtml + '</div>' +
      '</div>'
    );
  }

  /* --- Ejecuta la importación tras confirmación del usuario --- */
  async function _confirmarImportarVisita(studioId) {
    if (!_importState || _importState.validationErrors.length) return;
    var st     = _importState;
    var studio = getStudio(studioId);
    if (!studio) { notif('Studio no encontrado', 'error'); return; }

    var btn = document.getElementById('btn-confirmar-import');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Importando…'; }

    try {
      var _pSel = document.getElementById('import-proyecto');
      var _eSel = document.getElementById('import-proy-estado');
      var _linkOpts = (_pSel && _pSel.value !== '')
        ? { projectIdx: _pSel.value, nuevoEstado: (_eSel && _eSel.value) || null }
        : null;
      var result = await _ejecutarImportacion(studioId, st.yaml, st.fileName, _linkOpts);
      closeModal();
      _importState = null;

      // Toast detallado
      var parts = ['✅ Visita importada'];
      if (result.newContacts) parts.push(result.newContacts + ' contacto' + (result.newContacts > 1 ? 's' : '') + ' nuevo' + (result.newContacts > 1 ? 's' : ''));
      if (result.activities)  parts.push(result.activities + ' tarea' + (result.activities > 1 ? 's' : '') + ' creada' + (result.activities > 1 ? 's' : ''));
      if (result.projects)    parts.push(result.projects + ' oportunidad' + (result.projects > 1 ? 'es' : '') + ' añadida' + (result.projects > 1 ? 's' : ''));
      notif(parts.join(' · '), 'success');

      render({ studioId: studioId, tab: 'informes' });
      // Panel de acciones post-importación (500ms de delay para que el render termine)
      setTimeout(function () { _openPostImportSheet(studioId, st.yaml); }, 500);
    } catch (e) {
      var errBlock = document.getElementById('import-error-block');
      var msg = '⛔ Error al importar: ' + (e.message || 'Error desconocido');
      if (errBlock) errBlock.innerHTML = '<div style="margin-top:8px; color:#dc2626; font-size:13px; ' +
        'padding:8px; background:#fef2f2; border-radius:6px;">' + escape(msg) + '</div>';
      if (btn) { btn.disabled = false; btn.textContent = '✅ Confirmar e importar'; }
    }
  }

  /* --- Lógica central de importación (escritura a Supabase) ---
   *
   * ATOMICIDAD: todos los arrays (reports, activities, projects, team, notes)
   * se fusionan en memoria y se envían en una sola llamada patchDoc, que en
   * Supabase se traduce a un único UPSERT. Solo si esa llamada falla, nada se
   * persiste. Una segunda llamada (saveTopFields) actualiza status/score/priority;
   * si falla, únicamente esos 3 campos quedan sin actualizar (impacto menor).
   */
  async function _ejecutarImportacion(studioId, yaml, fileName, linkOpts) {
    // REGLA GLOBAL: ningún informe puede contener marcas de tiempo de la
    // transcripción. Limpiamos el YAML completo antes de derivar campos, así
    // reportEntry, raw_yaml y las actividades quedan sin timestamps.
    if (window.Util && window.Util.stripTimestampsDeep) {
      yaml = window.Util.stripTimestampsDeep(yaml);
    }
    var v    = yaml.visita  || {};
    var inter = (yaml.interlocutores && yaml.interlocutores.principal) || {};
    var dev  = yaml.desarrollo || {};
    var ev   = yaml.evaluacion || {};
    var actEmp = yaml.actualizacion_empresa || {};
    var today  = new Date().toISOString().slice(0, 10);
    var isoTs  = new Date().toISOString().replace(/[:.]/g, '-');

    function sv(val) { // solo valores reales (no null, "", "N/A")
      if (val === null || val === undefined || val === '' || val === 'N/A') return null;
      return val;
    }

    // --- Leer estado actual del studio ---
    var raw = State.studiosById && State.studiosById[studioId];
    if (!raw) throw new Error('Studio no disponible en State');
    var curData = Object.assign({}, raw.data || {});

    // --- Enlace opcional a un proyecto existente (selector del preview) ---
    var _projId = null, _projNom = null;
    if (linkOpts && linkOpts.projectIdx != null && linkOpts.projectIdx !== '') {
      var _pjs = arr(curData.projects).slice();
      var _p = _pjs[parseInt(linkOpts.projectIdx, 10)];
      if (_p) {
        var _np = Object.assign({}, _p);
        if (!_np.id) _np.id = 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        if (linkOpts.nuevoEstado) _np.estado = linkOpts.nuevoEstado;
        _pjs[parseInt(linkOpts.projectIdx, 10)] = _np;
        curData.projects = _pjs;        // se escribe junto al report más abajo
        _projId = _np.id; _projNom = _np.nombre || _np.name || null;
      }
    }

    // ------ 1. Registro de la visita → reports[] ------
    var reportEntry = {
      iso_date:            isoTs,
      date:                sv(v.fecha) || today,
      generated_at:        new Date().toISOString(),
      imported_at:         new Date().toISOString(),
      imported_from:       fileName,
      formato:             'visita_importada',
      title:               'Visita ' + (sv(v.fecha) || today) + ' · ' + (sv(inter.nombre) || 'Interlocutor'),
      tipo_visita:         sv(v.tipo_visita),
      modalidad:           sv(v.modalidad),
      duracion_minutos:    v.duracion_minutos != null ? Number(v.duracion_minutos) : null,
      hora_inicio:         sv(v.hora_inicio),
      hora_fin:            sv(v.hora_fin),
      lugar:               sv(v.lugar),
      ciudad:              sv(v.ciudad),
      cargo_interlocutor:  sv(inter.cargo),
      interlocutor_nombre: sv(inter.nombre),
      es_decision_maker:   inter.es_decision_maker != null ? inter.es_decision_maker : null,
      resumen_ejecutivo:   sv(dev.resumen_ejecutivo),
      puntos_clave:        arr(dev.puntos_clave),
      spin:                dev.spin || null,
      senales_de_compra:   arr(dev.senales_de_compra),
      objeciones:          arr(dev.objeciones).filter(function(o) { return o && sv(o.objecion); }),
      compromisos:         dev.compromisos || null,
      proxima_accion:      sv(dev.proxima_accion),
      fecha_proxima_visita: sv(dev.fecha_proxima_visita),
      temperatura:         ev.temperatura != null ? Number(ev.temperatura) : null,
      probabilidad_cierre_pct: ev.probabilidad_cierre_pct != null ? ev.probabilidad_cierre_pct : null,
      importe_estimado_eur:    ev.importe_estimado_eur != null ? ev.importe_estimado_eur : null,
      plazo_estimado:      sv(ev.plazo_estimado),
      nuevo_status:        sv(ev.nuevo_status),
      autoevaluacion:      yaml.autoevaluacion || null,
      intel_competitiva:   yaml.intel_competitiva || null,
      raw_yaml:            yaml,   // audit trail completo
      project_id:          _projId,
      project_nombre:      _projNom,
    };
    if (_projNom) reportEntry.title += ' · ' + _projNom;
    var reports = arr(curData.reports).slice();
    reports.push(reportEntry);
    curData.reports = reports;

    // ------ 2. Compromisos → activities[] ------
    var comprNos    = arr(dev.compromisos && dev.compromisos.por_nuestra_parte).filter(function(c) { return c && sv(c.accion); });
    var comprClient = arr(dev.compromisos && dev.compromisos.por_parte_del_cliente).filter(function(c) { return c && sv(c.accion); });
    var activities  = arr(curData.activities).slice();
    var newActivities = 0;
    comprNos.forEach(function(c) {
      activities.push({
        type: 'tarea', date: today,
        title: c.accion,
        notes: 'Plazo: ' + (sv(c.plazo) || 'no especificado') + (sv(c.responsable) ? ' · Responsable: ' + c.responsable : ''),
        source_yaml: fileName,
      });
      newActivities++;
    });
    comprClient.forEach(function(c) {
      activities.push({
        type: 'tarea', date: today,
        title: 'Esperar: ' + c.accion + (sv(c.contacto) ? ' de ' + c.contacto : ''),
        notes: 'Compromiso del cliente. Plazo: ' + (sv(c.plazo) || 'no especificado'),
        source_yaml: fileName,
      });
      newActivities++;
    });
    // Próxima visita como evento (si es fecha ISO estricta)
    if (sv(dev.fecha_proxima_visita) && /^\d{4}-\d{2}-\d{2}$/.test(dev.fecha_proxima_visita)) {
      activities.push({
        type: 'evento', date: dev.fecha_proxima_visita,
        title: 'Próxima visita (importada: ' + fileName + ')',
        notes: sv(dev.proxima_accion) || '',
        source_yaml: fileName,
      });
    }
    curData.activities = activities;

    // ------ 3. Oportunidades → projects[] ------
    var proyectos = arr(yaml.oportunidades_detectadas && yaml.oportunidades_detectadas.proyectos)
      .filter(function(p) { return p && sv(p.nombre); });
    var projects  = arr(curData.projects).slice();
    var newProjects = 0;
    proyectos.forEach(function(p) {
      projects.push({
        name:     p.nombre,
        status:   sv(p.fase_actual)  || 'En preparación',
        type:     sv(p.tipo)         || '',
        promotor: sv(p.promotor)     || '',
        importe:  p.importe_estimado || null,
        adjudicacion: sv(p.adjudicacion_prevista) || '',
        productos: arr(p.productos_relevantes),
        fuente:   sv(p.fuente) || 'Visita importada',
        source_yaml: fileName,
      });
      newProjects++;
    });
    curData.projects = projects;

    // ------ 4. Nuevos contactos → team[] ------
    var team      = arr(curData.team).slice();
    var teamNames = team.map(function(m) { return (m.name || '').toLowerCase(); });
    var otrosAsist   = arr(yaml.interlocutores && yaml.interlocutores.otros_asistentes);
    var nuevosCont   = arr(actEmp.nuevos_contactos);
    var addedContacts = 0;

    // 4a. Interlocutor principal — guardar tel/email/cargo en team si tiene datos
    if (sv(inter.nombre)) {
      var interIdx = teamNames.indexOf(inter.nombre.toLowerCase());
      if (interIdx === -1) {
        if (sv(inter.telefono) || sv(inter.email) || sv(inter.cargo)) {
          team.push({ name: inter.nombre, role: sv(inter.cargo) || '', phone: sv(inter.telefono) || '', email: sv(inter.email) || '', source_yaml: fileName });
          teamNames.push(inter.nombre.toLowerCase());
          addedContacts++;
        }
      } else {
        // Ya existe: completar campos vacíos
        var tm = team[interIdx];
        var tmChanged = false;
        if (!tm.phone && sv(inter.telefono)) { tm.phone = inter.telefono; tmChanged = true; }
        if (!tm.email && sv(inter.email))    { tm.email = inter.email;    tmChanged = true; }
        if (!tm.role  && sv(inter.cargo))    { tm.role  = inter.cargo;    tmChanged = true; }
        if (tmChanged) team[interIdx] = tm;
      }
    }

    // 4b. Otros asistentes + contactos mencionados por el cliente
    otrosAsist.concat(nuevosCont).forEach(function(c) {
      if (!c || !sv(c.nombre)) return;
      if (teamNames.indexOf(c.nombre.toLowerCase()) !== -1) return;
      team.push({ name: c.nombre, role: sv(c.cargo) || '', phone: sv(c.telefono) || '', email: sv(c.email) || '', source_yaml: fileName });
      teamNames.push(c.nombre.toLowerCase());
      addedContacts++;
    });
    curData.team = team;

    // ------ 5. Intel competitiva → notes (append) ------
    var competidores = arr(yaml.intel_competitiva && yaml.intel_competitiva.competidores)
      .filter(function(c) { return c && sv(c.nombre); });
    if (competidores.length) {
      var intelLines = ['--- Intel competitiva (visita ' + (sv(v.fecha) || today) + ' · ' + fileName + ') ---'];
      competidores.forEach(function(c) {
        var line = '• ' + c.nombre;
        if (sv(c.producto))   line += ' · ' + c.producto;
        if (sv(c.fortaleza))  line += ' [✓ ' + c.fortaleza + ']';
        if (sv(c.debilidad))  line += ' [✗ ' + c.debilidad + ']';
        intelLines.push(line);
      });
      curData.notes = ((curData.notes || '').trim() + '\n\n' + intelLines.join('\n')).trim();
    }

    // ------ 6. Actualización datos empresa ------
    if (!curData.studio) curData.studio = {};
    if (sv(actEmp.num_empleados)   != null) curData.studio.num_empleados   = actEmp.num_empleados;
    if (sv(actEmp.facturacion_anual))        curData.studio.facturacion_anual = actEmp.facturacion_anual;
    if (actEmp.usa_bim != null)              curData.studio.usa_bim          = actEmp.usa_bim;
    if (sv(actEmp.proceso_compra) && !curData.studio.proceso_compra)
      curData.studio.proceso_compra = actEmp.proceso_compra;
    if (arr(actEmp.tipos_de_proyecto).length) {
      var tipos = arr(curData.studio.tipos_de_proyecto);
      arr(actEmp.tipos_de_proyecto).forEach(function(t) { if (t && tipos.indexOf(t) === -1) tipos.push(t); });
      curData.studio.tipos_de_proyecto = tipos;
    }
    if (arr(actEmp.zona_de_actuacion).length) {
      var zonas = arr(curData.studio.zona_de_actuacion);
      arr(actEmp.zona_de_actuacion).forEach(function(z) { if (z && zonas.indexOf(z) === -1) zonas.push(z); });
      curData.studio.zona_de_actuacion = zonas;
    }
    if (sv(actEmp.notas_empresa)) {
      var notaActual = (curData.studio.notas_empresa || '').trim();
      curData.studio.notas_empresa = (notaActual + '\n\n[' + today + '] ' + actEmp.notas_empresa).trim();
    }

    // ------ ESCRITURA PRINCIPAL (un solo UPSERT) ------
    await window.Data.patchDoc('studios/' + studioId, { data: curData });
    // Actualizar State local
    raw.data = curData;
    if (State.studiosById) State.studiosById[studioId] = raw;

    // ------ CAMPOS TOP-LEVEL (segunda llamada, impacto menor si falla) ------
    var topPatch = {};
    if (sv(ev.nuevo_status))  topPatch.status   = ev.nuevo_status;
    if (sv(ev.nueva_prioridad)) topPatch.priority = ev.nueva_prioridad;
    if (ev.nuevo_score != null && !isNaN(Number(ev.nuevo_score))) topPatch.score = Number(ev.nuevo_score);
    if (Object.keys(topPatch).length) await saveTopFields(studioId, topPatch);

    return { newContacts: addedContacts, activities: newActivities, projects: newProjects };
  }

  /* --- Panel de acciones post-importación (bottom sheet) ---
   * Se abre automáticamente después de una importación exitosa para
   * que el comercial pueda actuar de inmediato sobre los datos de la visita.
   */
  /* Panel post-importación con checkboxes para seleccionar qué va a la bandeja */
  function _openPostImportSheet(studioId, yaml) {
    var studio = getStudio(studioId);
    if (!studio) return;

    var v     = (yaml && yaml.visita)  || {};
    var inter = (yaml && yaml.interlocutores && yaml.interlocutores.principal) || {};
    var dev   = (yaml && yaml.desarrollo) || {};

    function sv(val) { return (val === null || val === undefined || val === '' || val === 'N/A') ? null : val; }
    function ph(p)   { return p ? p.replace(/[^\d+]/g, '') : ''; }

    var comprNos    = arr(dev.compromisos && dev.compromisos.por_nuestra_parte).filter(function(c) { return c && sv(c.accion); });
    var comprClient = arr(dev.compromisos && dev.compromisos.por_parte_del_cliente).filter(function(c) { return c && sv(c.accion); });
    var otrosAsist  = arr(yaml && yaml.interlocutores && yaml.interlocutores.otros_asistentes).filter(function(c) { return c && sv(c.nombre); });
    var nuevosCont  = arr(yaml && yaml.actualizacion_empresa && yaml.actualizacion_empresa.nuevos_contactos).filter(function(c) { return c && sv(c.nombre); });
    var proyectos   = arr(yaml && yaml.oportunidades_detectadas && yaml.oportunidades_detectadas.proyectos).filter(function(p) { return p && sv(p.nombre); });

    function sectionHead(emoji, title, count) {
      return '<div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; ' +
        'color:var(--fg-3); margin:16px 0 8px; display:flex; align-items:center; gap:6px;">' +
        emoji + ' ' + title + (count ? ' <span style="background:var(--bg-2); border-radius:8px; padding:1px 6px; font-size:10px;">' + count + '</span>' : '') +
      '</div>';
    }
    function contactCard(name, role, phone, email, tag) {
      var tel = ph(phone);
      return '<div style="background:var(--bg-2); border-radius:8px; padding:10px 12px; margin-bottom:7px; ' +
        'display:flex; align-items:center; justify-content:space-between; gap:10px;">' +
        '<div style="flex:1; min-width:0;">' +
          '<div style="font-size:13px; font-weight:600; color:var(--fg-1);">' + escape(name) + '</div>' +
          '<div style="font-size:11px; color:var(--fg-3);">' + escape(role || '—') + (tag ? ' · <span style="color:#854d0e;">' + tag + '</span>' : '') + '</div>' +
        '</div>' +
        '<div style="display:flex; gap:6px; flex-shrink:0;">' +
          (tel ? '<a href="tel:' + tel + '" style="padding:5px 9px; border-radius:7px; background:var(--gpf-blue-100); color:var(--gpf-blue-700); font-size:12px; font-weight:600; text-decoration:none;">📞</a>' : '') +
          (sv(email) ? '<a href="mailto:' + escape(email) + '" style="padding:5px 9px; border-radius:7px; background:#f0fdf4; color:#16a34a; font-size:12px; font-weight:600; text-decoration:none;">✉️</a>' : '') +
        '</div>' +
      '</div>';
    }

    /* Fila con checkbox — todos pre-seleccionados */
    var _cbIdx = 0;
    function checkRow(key, text, plazo, tipo) {
      var id = 'cb-bandeja-' + (_cbIdx++);
      return '<label style="display:flex; align-items:flex-start; gap:10px; padding:8px 0; ' +
        'border-bottom:1px solid var(--border-1); cursor:pointer;">' +
        '<input type="checkbox" id="' + id + '" data-key="' + escape(key) + '" ' +
          'data-title="' + escape(text) + '" data-plazo="' + escape(sv(plazo) || '') + '" data-tipo="' + escape(tipo) + '" ' +
          'checked style="margin-top:2px; width:16px; height:16px; flex-shrink:0; accent-color:var(--gpf-blue-700);">' +
        '<div style="flex:1;">' +
          '<div style="font-size:13px; color:var(--fg-1); line-height:1.4;">' + escape(text) + '</div>' +
          (sv(plazo) ? '<div style="font-size:11px; color:var(--fg-3); margin-top:2px;">⏰ ' + escape(plazo) + '</div>' : '') +
        '</div>' +
      '</label>';
    }

    var hasContacts = sv(inter.nombre) || otrosAsist.length || nuevosCont.length;
    var hasProx     = sv(dev.proxima_accion) || sv(dev.fecha_proxima_visita);
    var totalAcciones = comprNos.length + comprClient.length + proyectos.length + (hasProx ? 1 : 0);

    var html = (
      '<div class="handle"></div>' +
      '<div id="post-import-sheet" style="padding:0 16px 32px; flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch;">' +

        /* Cabecera */
        '<div style="display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:4px;">' +
          '<div>' +
            '<div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--fg-3);">Visita · ' + escape(v.fecha || 'hoy') + '</div>' +
            '<h3 style="font-family:var(--font-display); font-size:20px; font-weight:700; margin:2px 0 0; color:var(--fg-1);">Qué hacer ahora</h3>' +
          '</div>' +
          '<button onclick="window.closeSheet()" style="background:none; border:none; cursor:pointer; font-size:20px; color:var(--fg-3); padding:4px; margin-top:2px;">✕</button>' +
        '</div>' +
        '<p style="font-size:13px; color:var(--fg-3); margin:0 0 12px;">' + escape(studio.name) + '</p>' +

        /* Botón principal — añadir a bandeja */
        (totalAcciones > 0
          ? '<div id="bandeja-add-wrap" style="background:#dcfce7; border:1px solid #86efac; border-radius:10px; padding:12px 14px; margin-bottom:14px;">' +
              '<div style="font-size:13px; color:#166534; font-weight:600; margin-bottom:8px;">✅ Selecciona las acciones que quieres añadir a la bandeja:</div>' +
              '<button id="btn-add-bandeja" class="btn btn-primary" ' +
                'style="background:#16a34a; border-color:#16a34a; width:100%; font-size:14px;" ' +
                'onclick="window.Screens.detail._guardarEnBandeja(\'' + escape(studioId) + '\')">' +
                'Añadir seleccionadas a bandeja' +
              '</button>' +
            '</div>'
          : '') +

        /* ---- Próxima acción (checkbox) ---- */
        (hasProx
          ? sectionHead('🎯', 'Próxima acción', null) +
            checkRow('proxima', sv(dev.proxima_accion) || ('Próxima visita · ' + sv(dev.fecha_proxima_visita)), sv(dev.fecha_proxima_visita), 'reunion')
          : '') +

        /* ---- Contactos (sin checkbox, solo informativo) ---- */
        (hasContacts
          ? sectionHead('📞', 'Contactos de la visita', null) +
            (sv(inter.nombre) ? contactCard(inter.nombre, sv(inter.cargo), sv(inter.telefono), sv(inter.email), inter.es_decision_maker ? 'Decisor' : null) : '') +
            otrosAsist.map(function(c) { return contactCard(c.nombre, sv(c.cargo), sv(c.telefono), sv(c.email), 'Asistente'); }).join('') +
            nuevosCont.map(function(c) { return contactCard(c.nombre, sv(c.cargo), sv(c.telefono), sv(c.email), 'Contacto sugerido'); }).join('') +
            '<button onclick="window.Screens.detail.switchTab(\'equipo\',\'' + escape(studioId) + '\'); window.closeSheet();" ' +
              'style="font-size:12px; color:var(--gpf-blue-700); background:none; border:none; cursor:pointer; padding:2px 0; margin-bottom:4px;">Ver todos en la pestaña Equipo →</button>'
          : '') +

        /* ---- Nuestros compromisos (checkboxes) ---- */
        (comprNos.length
          ? sectionHead('✅', 'Nuestros compromisos', comprNos.length) +
            '<div>' + comprNos.map(function(c) { return checkRow('comprN', c.accion, sv(c.plazo), 'tarea'); }).join('') + '</div>'
          : '') +

        /* ---- Pendiente del cliente (checkboxes) ---- */
        (comprClient.length
          ? sectionHead('📬', 'Pendiente del cliente', comprClient.length) +
            '<div>' + comprClient.map(function(c) {
              var txt = 'Esperar: ' + c.accion + (sv(c.contacto) ? ' (' + c.contacto + ')' : '');
              return checkRow('comprC', txt, sv(c.plazo), 'tarea');
            }).join('') + '</div>'
          : '') +

        /* ---- Oportunidades (checkboxes) ---- */
        (proyectos.length
          ? sectionHead('🏗', 'Oportunidades detectadas', proyectos.length) +
            '<div>' + proyectos.map(function(p) {
              var sub = [sv(p.tipo), sv(p.fase_actual), p.importe_estimado ? (p.importe_estimado / 1000).toFixed(0) + ' k€' : null].filter(Boolean).join(', ');
              var txt = p.nombre + (sub ? ' — ' + sub : '');
              return checkRow('opor', txt, null, 'tarea');
            }).join('') + '</div>' +
            '<button onclick="window.Screens.detail.switchTab(\'proyectos\',\'' + escape(studioId) + '\'); window.closeSheet();" ' +
              'style="font-size:12px; color:var(--gpf-blue-700); background:none; border:none; cursor:pointer; padding:2px 0; margin-bottom:4px;">Ver en pestaña Proyectos →</button>'
          : '') +

        '<button onclick="window.closeSheet()" class="btn btn-ghost btn-block" style="margin-top:20px;">Cerrar sin añadir</button>' +
      '</div>'
    );

    if (window.openSheet) window.openSheet(html);
  }

  /* Recoge los checkboxes marcados y escribe en data.activities[] con bandeja:true */
  async function _guardarEnBandeja(studioId) {
    var btn = document.getElementById('btn-add-bandeja');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Guardando…'; }

    var today = new Date().toISOString().slice(0, 10);
    var raw = State.studiosById && State.studiosById[studioId];
    if (!raw) { notif('Studio no encontrado', 'error'); return; }

    var curData = Object.assign({}, raw.data || {});
    var activities = arr(curData.activities).slice();

    // Leer checkboxes marcados
    var checks = document.querySelectorAll('#post-import-sheet input[type=checkbox]:checked');
    var nuevas = [];
    checks.forEach(function(cb) {
      var title = cb.getAttribute('data-title') || '';
      var plazo = cb.getAttribute('data-plazo') || null;
      var tipo  = cb.getAttribute('data-tipo') || 'tarea';
      if (!title) return;
      // ID estable para poder sincronizar
      var bid = 'b' + Math.abs((function(s){var h=0;for(var i=0;i<s.length;i++)h=((h<<5)-h+s.charCodeAt(i))|0;return h;})(studioId+'|'+title+'|'+today)).toString(36);
      nuevas.push({
        type: 'tarea',
        date: today,
        title: title,
        notes: plazo ? 'Plazo: ' + plazo : '',
        bandeja: true,
        completada: false,
        tipo_accion: tipo,
        fecha_limite: plazo && /^\d{4}-\d{2}-\d{2}$/.test(plazo) ? plazo : null,
        plazo: plazo || null,
        bandeja_id: bid,
        studioId: studioId,
      });
    });

    if (!nuevas.length) {
      if (btn) { btn.disabled = false; btn.textContent = 'Añadir seleccionadas a bandeja'; }
      notif('No hay acciones seleccionadas', 'info');
      return;
    }

    activities = activities.concat(nuevas);
    curData.activities = activities;

    try {
      await window.Data.patchDoc('studios/' + studioId, { data: curData });
      raw.data = curData;
      if (State.studiosById) State.studiosById[studioId] = raw;
      // Invalidar caché de acciones
      if (window.AccionesEngine) window.AccionesEngine.invalidarCache();
      window.closeSheet();
      notif('✅ ' + nuevas.length + ' acción' + (nuevas.length > 1 ? 'es añadidas' : ' añadida') + ' a la bandeja', 'success');
      render({ studioId: studioId, tab: 'actividades' });
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = 'Añadir seleccionadas a bandeja'; }
      notif('Error: ' + e.message, 'error');
    }
  }

  /* ============================================================
     VER INFORME IMPORTADO — sheet con las 8 secciones del formato real
     Sin SPIN, sin citas, sin autoevaluación. Igual que los informes anteriores.
     ============================================================ */
  function openReportSheet(studioId, idx) {
    var raw = State.studiosById && State.studiosById[studioId];
    if (!raw) return;
    var reports = arr((raw.data && raw.data.reports) || []);
    var r = reports[idx];
    if (!r) return;
    var studio = getStudio(studioId);

    function sv(v) { return (v === null || v === undefined || v === '' || v === 'N/A') ? null : v; }
    function arrF(v) { return Array.isArray(v) ? v : []; }

    var spin     = r.spin || {};
    var puntos   = arrF(r.puntos_clave).filter(Boolean);
    var comprNos = arrF(r.compromisos && r.compromisos.por_nuestra_parte).filter(function(c) { return c && sv(c.accion); });
    var comprCli = arrF(r.compromisos && r.compromisos.por_parte_del_cliente).filter(function(c) { return c && sv(c.accion); });
    var proyectos = arrF(r.oportunidades_detectadas && r.oportunidades_detectadas.proyectos).filter(function(p) { return p && sv(p.nombre); });
    var competid  = arrF(r.intel_competitiva && r.intel_competitiva.competidores).filter(function(c) { return c && sv(c.nombre); });
    var objeciones = arrF(r.objeciones).filter(function(o) { return o && sv(o.objecion); });

    var TIPO_L  = { primera_visita:'Primera visita', seguimiento:'Seguimiento', demo:'Demo',
      propuesta:'Propuesta', negociacion:'Negociación', cierre:'Cierre', postventa:'Postventa' };
    var STATUS_L = { nuevo:'Nuevo', contactado:'Contactado', reunion:'Reunión',
      propuesta:'Propuesta', negociacion:'Negociación', ganado:'Ganado', perdido:'Perdido', dormido:'Dormido' };

    var tempN = r.temperatura != null ? Number(r.temperatura) : null;
    var interes = tempN != null ? (tempN >= 8 ? 'Alto' : tempN >= 5 ? 'Medio' : 'Bajo') : '—';

    function sec(title) {
      return '<div style="font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.07em; ' +
        'color:#fff; background:var(--gpf-blue-900); padding:5px 10px; margin:18px 0 8px; border-radius:4px;">' +
        title + '</div>';
    }
    function pill(text, bg, color) {
      return '<span style="display:inline-flex; font-size:11px; padding:2px 9px; border-radius:10px; ' +
        'background:' + bg + '; color:' + color + '; font-weight:600; margin:2px;">' + escape(text) + '</span>';
    }
    function tRow(label, value) {
      if (!sv(value)) return '';
      return '<tr><td style="font-size:12px; color:var(--fg-3); font-weight:600; padding:3px 8px 3px 0; white-space:nowrap; vertical-align:top;">' +
        label + '</td><td style="font-size:13px; color:var(--fg-1); padding:3px 0;">' + escape(String(value)) + '</td></tr>';
    }

    /* Desarrollo: resumen + puntos clave + contexto (de spin.situacion) */
    var desarrolloHtml = '';
    if (sv(r.resumen_ejecutivo)) {
      desarrolloHtml += '<p style="font-size:13px; color:var(--fg-1); line-height:1.6; margin:0 0 8px;">' + escape(r.resumen_ejecutivo) + '</p>';
    }
    if (sv(spin.situacion)) {
      desarrolloHtml += '<p style="font-size:13px; color:var(--fg-1); line-height:1.6; margin:0 0 8px;">' + escape(spin.situacion) + '</p>';
    }
    if (sv(spin.problema)) {
      desarrolloHtml += '<p style="font-size:13px; color:var(--fg-1); line-height:1.6; margin:0 0 8px;">' + escape(spin.problema) + '</p>';
    }
    if (sv(spin.implicacion) || sv(spin.necesidad_beneficio)) {
      desarrolloHtml += '<p style="font-size:13px; color:var(--fg-1); line-height:1.6; margin:0;">' +
        escape([sv(spin.implicacion), sv(spin.necesidad_beneficio)].filter(Boolean).join(' ')) + '</p>';
    }

    /* Observaciones: objeciones + intel competitiva como bullets */
    var obsItems = [];
    objeciones.forEach(function(o) {
      var txt = '— ' + o.objecion;
      if (sv(o.respuesta_dada)) txt += '. ' + o.respuesta_dada;
      obsItems.push(txt);
    });
    competid.forEach(function(c) {
      var txt = '— ' + c.nombre;
      if (sv(c.producto)) txt += ' (' + c.producto + ')';
      if (sv(c.fortaleza)) txt += '. Fortaleza: ' + c.fortaleza;
      if (sv(c.debilidad))  txt += '. Debilidad: '  + c.debilidad;
      obsItems.push(txt);
    });
    if (sv(r.plazo_estimado)) obsItems.push('— Plazo estimado: ' + r.plazo_estimado);
    if (r.importe_estimado_eur) obsItems.push('— Importe estimado: ' + (r.importe_estimado_eur/1000).toFixed(0) + ' k€');

    var html = (
      '<div class="handle"></div>' +
      '<div style="padding:0 16px 32px; flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch;">' +

        /* Cabecera */
        '<div style="display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:8px;">' +
          '<div style="flex:1; min-width:0;">' +
            '<div style="font-size:11px; color:var(--fg-3); font-weight:600; text-transform:uppercase; letter-spacing:.05em;">Informe de visita</div>' +
            '<h3 style="font-family:var(--font-display); font-size:18px; font-weight:700; margin:2px 0 4px; color:var(--fg-1);">' +
              escape(studio ? studio.name : studioId) + '</h3>' +
            '<div style="font-size:12px; color:var(--fg-3);">Manuel Fernández · Prescriptor GPF · Ferroplast & Tuyper</div>' +
          '</div>' +
          '<button onclick="window.closeSheet()" style="background:none; border:none; cursor:pointer; font-size:20px; color:var(--fg-3); padding:4px; flex-shrink:0;">✕</button>' +
        '</div>' +

        /* Botón descarga */
        '<button onclick="window.Screens.detail.downloadReportWord(\'' + escape(studioId) + '\',' + idx + '); window.closeSheet();" ' +
          'class="btn btn-ghost" style="width:100%; margin-bottom:14px; font-size:13px;">📄 Descargar como Word</button>' +

        /* 1. Datos generales */
        sec('1. Datos generales') +
        '<table style="width:100%; border-collapse:collapse;">' +
          tRow('Empresa', studioName(studio, studioId)) +
          tRow('Tipo', studio && studio.type ? (studio.type) : null) +
          tRow('Fecha', r.date) +
          tRow('Hora', r.hora_inicio) +
          tRow('Duración', r.duracion_minutos ? r.duracion_minutos + ' min' : null) +
          tRow('Tipo de visita', TIPO_L[r.tipo_visita] || r.tipo_visita) +
          tRow('Estado tras visita', STATUS_L[r.nuevo_status] || r.nuevo_status) +
        '</table>' +

        /* 2. Personas contactadas */
        (sv(r.interlocutor_nombre)
          ? sec('2. Personas contactadas') +
            '<table style="width:100%; border-collapse:collapse;">' +
              '<tr style="border-bottom:1px solid var(--border-1);">' +
                '<td style="font-size:12px; font-weight:700; color:var(--fg-3); padding:4px 0;">Nombre</td>' +
                '<td style="font-size:12px; font-weight:700; color:var(--fg-3); padding:4px 8px;">Cargo</td>' +
                '<td style="font-size:12px; font-weight:700; color:var(--fg-3); padding:4px 0;">Obs.</td>' +
              '</tr>' +
              '<tr>' +
                '<td style="font-size:13px; padding:5px 0;">' + escape(r.interlocutor_nombre || '—') + (r.es_decision_maker ? ' ⭐' : '') + '</td>' +
                '<td style="font-size:13px; padding:5px 8px;">' + escape(r.cargo_interlocutor || '—') + '</td>' +
                '<td style="font-size:13px; padding:5px 0;">' + (r.es_decision_maker ? '⭐ Decisor' : '—') + '</td>' +
              '</tr>' +
            '</table>'
          : '') +

        /* 3. Desarrollo */
        (desarrolloHtml
          ? sec('3. Desarrollo de la visita') + desarrolloHtml
          : '') +

        /* 4. Contexto estratégico — puntos clave */
        (puntos.length
          ? sec('4. Contexto estratégico') +
            '<ul style="margin:0; padding-left:18px;">' +
              puntos.map(function(p) { return '<li style="font-size:13px; color:var(--fg-1); margin-bottom:4px; line-height:1.4;">— ' + escape(p) + '</li>'; }).join('') +
            '</ul>'
          : '') +

        /* 5. Oportunidades */
        (proyectos.length
          ? sec('5. Oportunidades detectadas') +
            '<ol style="margin:0; padding-left:18px;">' +
              proyectos.map(function(p, i) {
                var sub = [sv(p.tipo), sv(p.fase_actual), p.importe_estimado ? (p.importe_estimado/1000).toFixed(0) + ' k€' : null].filter(Boolean).join(' · ');
                return '<li style="font-size:13px; color:var(--fg-1); margin-bottom:5px;">' +
                  '<strong>' + escape(p.nombre) + '</strong>' + (sub ? '<br><span style="color:var(--fg-3); font-size:12px;">' + escape(sub) + '</span>' : '') + '</li>';
              }).join('') +
            '</ol>'
          : '') +

        /* 6. Compromisos */
        (comprNos.length || comprCli.length || sv(r.proxima_accion)
          ? sec('6. Compromisos y próximos pasos') +
            '<ol style="margin:0; padding-left:18px;">' +
              comprNos.map(function(c) {
                return '<li style="font-size:13px; color:var(--fg-1); margin-bottom:4px;">' + escape(c.accion) +
                  (sv(c.plazo) ? ' <span style="color:var(--fg-3); font-size:12px;">— ' + escape(c.plazo) + '</span>' : '') + '</li>';
              }).join('') +
              comprCli.map(function(c) {
                return '<li style="font-size:13px; color:var(--fg-1); margin-bottom:4px;">' +
                  '<em>(Pendiente cliente)</em> ' + escape(c.accion) +
                  (sv(c.plazo) ? ' <span style="color:var(--fg-3); font-size:12px;">— ' + escape(c.plazo) + '</span>' : '') + '</li>';
              }).join('') +
              (sv(r.proxima_accion)
                ? '<li style="font-size:13px; color:var(--fg-1); margin-bottom:4px;"><strong>' + escape(r.proxima_accion) + '</strong>' +
                  (sv(r.fecha_proxima_visita) ? ' — ' + escape(r.fecha_proxima_visita) : '') + '</li>'
                : '') +
            '</ol>'
          : '') +

        /* 7. Observaciones */
        (obsItems.length
          ? sec('7. Observaciones adicionales') +
            obsItems.map(function(o) {
              return '<p style="font-size:13px; color:var(--fg-1); margin:3px 0; line-height:1.4;">' + escape(o) + '</p>';
            }).join('')
          : '') +

        /* 8. Evaluación */
        sec('8. Evaluación general') +
        '<table style="width:100%; border-collapse:collapse;">' +
          tRow('Nivel de interés', interes) +
          tRow('Potencial', r.probabilidad_cierre_pct != null ? r.probabilidad_cierre_pct + '% probabilidad' : null) +
          tRow('Importe estimado', r.importe_estimado_eur ? (r.importe_estimado_eur/1000).toFixed(0) + ' k€' : null) +
          tRow('Plazo estimado', r.plazo_estimado) +
          tRow('Estado de la cuenta', STATUS_L[r.nuevo_status] || r.nuevo_status) +
        '</table>' +

        '<button onclick="window.closeSheet()" class="btn btn-ghost btn-block" style="margin-top:20px;">Cerrar</button>' +
      '</div>'
    );

    if (window.openSheet) window.openSheet(html);
  }

  function studioName(studio, id) {
    var n = studio && studio.name;
    return (typeof n === 'string' ? n : (n && n.valor) || '') || id;
  }

  /* ============================================================
     DESCARGAR INFORME IMPORTADO COMO WORD (.doc)
     Formato idéntico a los informes anteriores: 8 secciones, prosa
     narrativa, sin SPIN, sin citas, sin autoevaluación.
     ============================================================ */
  /* ============================================================
     INFORMES MARKDOWN (informe_v2) — ver / descargar .md / editar
     openReportSheet/downloadReportWord son para informes ESTRUCTURADOS
     (visita_importada). Los informe_v2 guardan todo en r.markdown.
     ============================================================ */
  function openReportMarkdownSheet(studioId, idx) {
    var raw = State.studiosById && State.studiosById[studioId];
    if (!raw) return;
    var reports = arr((raw.data && raw.data.reports) || []);
    var r = reports[idx];
    if (!r || !r.markdown) return;
    var studio = getStudio(studioId);
    var nombre = (studio && studio.name) || studioId;
    var mdHtml = (window.Screens.informe && window.Screens.informe._md2html)
      ? window.Screens.informe._md2html(r.markdown)
      : '<pre style="white-space:pre-wrap;">' + escape(r.markdown) + '</pre>';
    var html = (
      '<div class="handle"></div>' +
      '<div style="padding:0 16px 32px; flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch;">' +
        '<div style="display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:8px;">' +
          '<div style="flex:1; min-width:0;">' +
            '<div style="font-size:11px; color:var(--fg-3); font-weight:600; text-transform:uppercase; letter-spacing:.05em;">Informe de visita</div>' +
            '<h3 style="font-family:var(--font-display); font-size:18px; font-weight:700; margin:2px 0 4px; color:var(--fg-1);">' + escape(nombre) + '</h3>' +
            '<div style="font-size:12px; color:var(--fg-3);">' + escape(U.formatDateES(r.date) || r.date || '') + (r.comercial ? ' · ' + escape(r.comercial) : '') + '</div>' +
          '</div>' +
          '<button onclick="window.closeSheet()" style="background:none; border:none; cursor:pointer; font-size:20px; color:var(--fg-3); padding:4px; flex-shrink:0;">✕</button>' +
        '</div>' +
        '<div style="display:flex; gap:8px; margin-bottom:14px;">' +
          '<button onclick="window.Screens.detail.downloadReportMd(\'' + escape(studioId) + '\',' + idx + ')" class="btn btn-ghost" style="flex:1; font-size:13px;">⬇ .md</button>' +
          '<button onclick="window.Screens.detail.downloadReportMarkdownWord(\'' + escape(studioId) + '\',' + idx + ')" class="btn btn-ghost" style="flex:1; font-size:13px;">📄 Word</button>' +
          '<button onclick="window.Screens.detail.printReportMarkdown(\'' + escape(studioId) + '\',' + idx + ')" class="btn btn-ghost" style="flex:1; font-size:13px;">🖨 Imprimir</button>' +
        '</div>' +
        '<div class="briefing-content" style="font-size:14px; line-height:1.6;">' + mdHtml + '</div>' +
      '</div>'
    );
    if (window.openSheet) window.openSheet(html);
  }

  function downloadReportMd(studioId, idx) {
    var raw = State.studiosById && State.studiosById[studioId];
    if (!raw) return;
    var reports = arr((raw.data && raw.data.reports) || []);
    var r = reports[idx];
    if (!r || !r.markdown) return;
    var studio = getStudio(studioId);
    var nombre = (studio && studio.name) || String(studioId);
    var safe = String(nombre).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    var blob = new Blob([r.markdown], { type: 'text/markdown;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = safe + '_' + (r.date || 'informe') + '.md';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function openEditReportMarkdownModal(studioId, idx) {
    var raw = State.studiosById && State.studiosById[studioId];
    if (!raw) return;
    var reports = arr((raw.data && raw.data.reports) || []);
    var r = reports[idx];
    if (!r) return;
    showModal(
      '<div style="background:var(--bg-card); border-radius:14px; padding:20px; width:100%; max-width:680px; max-height:88vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,.3);">' +
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">' +
          '<h3 style="margin:0; font-family:var(--font-display); font-size:18px; font-weight:700;">✏️ Editar informe</h3>' +
          '<button onclick="window.Screens.detail.closeModal()" style="background:none; border:none; cursor:pointer; font-size:20px; color:var(--fg-3);">✕</button>' +
        '</div>' +
        '<textarea id="edit-report-md" style="width:100%; box-sizing:border-box; min-height:50vh; padding:12px; border:1.5px solid var(--line); border-radius:10px; font-family:var(--font-mono); font-size:13px; line-height:1.5; background:var(--bg-1); color:var(--fg-1);">' + escape(r.markdown || '') + '</textarea>' +
        '<div style="display:flex; gap:10px; margin-top:12px;">' +
          '<button onclick="window.Screens.detail.closeModal()" class="btn btn-ghost" style="flex:1;">Cancelar</button>' +
          '<button onclick="window.Screens.detail.saveReportMarkdown(\'' + escape(studioId) + '\',' + idx + ')" class="btn btn-primary" style="flex:1;">Guardar</button>' +
        '</div>' +
      '</div>'
    );
  }

  async function saveReportMarkdown(studioId, idx) {
    var ta = document.getElementById('edit-report-md');
    if (!ta) return;
    var nuevo = ta.value || '';
    // Regla del proyecto: los informes nunca llevan marcas de tiempo.
    if (window.Util && window.Util.stripTimestamps) nuevo = window.Util.stripTimestamps(nuevo);
    var raw = State.studiosById && State.studiosById[studioId];
    if (!raw) return;
    var reports = arr((raw.data && raw.data.reports) || []).slice();
    if (!reports[idx]) return;
    reports[idx] = Object.assign({}, reports[idx], { markdown: nuevo, edited_at: new Date().toISOString() });
    try {
      await saveDataField(studioId, 'reports', reports);
      closeModal();
      if (window.showNotification) window.showNotification('✓ Informe actualizado', 'success');
      switchTab('informes', studioId);
    } catch (e) {
      if (window.showNotification) window.showNotification('Error al guardar: ' + (e.message || e), 'error');
    }
  }

  // Resuelve las variables CSS de _md2html a colores concretos (Word no
  // soporta CSS custom properties; el navegador sí, pero las unificamos).
  function _resolveReportVars(html) {
    var MAP = {
      '--gpf-blue-900': '#0a2d52', '--gpf-blue-700': '#124b8a', '--gpf-blue-500': '#1f72c7',
      '--gpf-blue-100': '#e6f0fa', '--mute-red': '#c8102e', '--paper-warm': '#f7f5f1',
      '--fg-1': '#101418', '--fg-2': '#2a3138', '--fg-3': '#5b6672', '--line': '#d7dde3', '--ink-50': '#f2f4f6'
    };
    return String(html).replace(/var\((--[a-z0-9\-]+)\)/gi, function (m, n) { return MAP[n] || 'inherit'; });
  }

  // Documento HTML completo (plantilla GPF) para Word e impresión de un informe_v2.
  function _reportMarkdownDoc(r, sName) {
    var rawHtml = (window.Screens.informe && window.Screens.informe._md2html)
      ? window.Screens.informe._md2html(r.markdown || '')
      : '<pre>' + escape(r.markdown || '') + '</pre>';
    var body = _resolveReportVars(rawHtml);
    var fechaTxt = (U && U.formatDateES ? U.formatDateES(r.date) : null) || r.date || '';
    var header =
      '<div style="border-bottom:2px solid #124b8a; padding-bottom:8px; margin-bottom:16px;">' +
        '<div style="font-size:20px; font-weight:700; color:#0a2d52;">Informe de visita</div>' +
        '<div style="font-size:13px; color:#2a3138; margin-top:2px;">' + escape(sName) +
          (fechaTxt ? ' · ' + escape(fechaTxt) : '') + (r.comercial ? ' · ' + escape(r.comercial) : '') + '</div>' +
        '<div style="font-size:11px; color:#5b6672;">Manuel Fernández · Prescriptor GPF · Ferroplast &amp; Tuyper</div>' +
      '</div>';
    return '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
      'xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">' +
      '<head><meta charset="utf-8"><title>Informe de visita · ' + escape(sName) + '</title>' +
      '<style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.5;color:#101418;margin:24px;}' +
      'table{border-collapse:collapse;}a{color:#124b8a;}@media print{body{margin:0;}}</style></head>' +
      '<body>' + header + body + '</body></html>';
  }

  /* ============================================================
     .docx REAL (OOXML vía JSZip) — markdown → Word nativo
     Antes generábamos HTML disfrazado de .doc: Word lo trataba como
     "página web" y al guardar creaba una carpeta _files y no dejaba
     guardar con el mismo nombre. Un .docx real evita ambos problemas.
     ============================================================ */
  function _docxEsc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function _docxRuns(text, baseRpr) {
    baseRpr = baseRpr || '';
    var parts = String(text || '').split(/(\*\*[^*]+\*\*)/g);
    var out = '';
    parts.forEach(function (p) {
      if (!p) return;
      var bold = /^\*\*[\s\S]+\*\*$/.test(p);
      var t = (bold ? p.slice(2, -2) : p)
        .replace(/\*([^*]+)\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
      var rpr = baseRpr + (bold ? '<w:b/>' : '');
      out += '<w:r>' + (rpr ? '<w:rPr>' + rpr + '</w:rPr>' : '') + '<w:t xml:space="preserve">' + _docxEsc(t) + '</w:t></w:r>';
    });
    return out || '<w:r><w:t xml:space="preserve"></w:t></w:r>';
  }
  function _docxP(runs, pPr) { return '<w:p>' + (pPr ? '<w:pPr>' + pPr + '</w:pPr>' : '') + runs + '</w:p>'; }
  function _docxHeading(text, level) {
    var sz = level <= 1 ? '34' : level === 2 ? '28' : '24';
    var color = level === 2 ? '124B8A' : '0A2D52';
    var t = String(text || '').replace(/\*\*/g, '').replace(/\*([^*]+)\*/g, '$1');
    return _docxP('<w:r><w:rPr><w:b/><w:color w:val="' + color + '"/><w:sz w:val="' + sz + '"/></w:rPr><w:t xml:space="preserve">' + _docxEsc(t) + '</w:t></w:r>',
      '<w:spacing w:before="240" w:after="80"/>');
  }
  function _docxCell(text, header) {
    return '<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>' + (header ? '<w:shd w:val="clear" w:fill="0A2D52"/>' : '') + '</w:tcPr>' +
      _docxP(_docxRuns(text, header ? '<w:b/><w:color w:val="FFFFFF"/>' : '')) + '</w:tc>';
  }
  function _docxTable(headerCells, rows) {
    var borders = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function (b) {
      return '<w:' + b + ' w:val="single" w:sz="4" w:space="0" w:color="D7DDE3"/>';
    }).join('') + '</w:tblBorders>';
    var tbl = '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>' + borders + '</w:tblPr>';
    tbl += '<w:tr>' + headerCells.map(function (c) { return _docxCell(c, true); }).join('') + '</w:tr>';
    rows.forEach(function (row) { tbl += '<w:tr>' + row.map(function (c) { return _docxCell(c, false); }).join('') + '</w:tr>'; });
    return tbl + '</w:tbl>' + _docxP('');
  }
  function _markdownToDocxBody(markdown) {
    var lines = String(markdown || '').split('\n'), body = '', i = 0;
    function isSep(l) { return /^\|?[\s:\-]+(\|[\s:\-]+)+\|?$/.test((l || '').trim()); }
    while (i < lines.length) {
      var line = lines[i].replace(/\s+$/, '');
      if (/^\s*\|/.test(line) && i + 1 < lines.length && isSep(lines[i + 1])) {
        var hdr = line.trim().replace(/^\||\|$/g, '').split('|').map(function (c) { return c.trim(); });
        i += 2; var rows = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) {
          rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map(function (c) { return c.trim(); })); i++;
        }
        body += _docxTable(hdr, rows); continue;
      }
      var h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) { body += _docxHeading(h[2], h[1].length); i++; continue; }
      if (/^\s*---+\s*$/.test(line)) { body += _docxP('', '<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="D7DDE3"/></w:pBdr>'); i++; continue; }
      var ul = line.match(/^\s*[-*]\s+(.*)$/);
      if (ul) { body += _docxP('<w:r><w:t xml:space="preserve">• </w:t></w:r>' + _docxRuns(ul[1]), '<w:ind w:left="360"/>'); i++; continue; }
      var ol = line.match(/^\s*(\d+)\.\s+(.*)$/);
      if (ol) { body += _docxP('<w:r><w:t xml:space="preserve">' + ol[1] + '. </w:t></w:r>' + _docxRuns(ol[2]), '<w:ind w:left="360"/>'); i++; continue; }
      var bq = line.match(/^\s*>\s?(.*)$/);
      if (bq) { body += _docxP(_docxRuns(bq[1], '<w:i/><w:color w:val="5B6672"/>'), '<w:ind w:left="360"/>'); i++; continue; }
      if (line.trim() === '') { i++; continue; }
      body += _docxP(_docxRuns(line)); i++;
    }
    return body;
  }
  function _markdownToDocxBlob(markdown, titulo, subtitulo) {
    if (typeof JSZip === 'undefined') return null;
    var header = '';
    if (titulo) header += _docxP('<w:r><w:rPr><w:b/><w:color w:val="0A2D52"/><w:sz w:val="40"/></w:rPr><w:t xml:space="preserve">' + _docxEsc(titulo) + '</w:t></w:r>');
    if (subtitulo) header += _docxP('<w:r><w:rPr><w:color w:val="5B6672"/><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">' + _docxEsc(subtitulo) + '</w:t></w:r>',
      '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="124B8A"/></w:pBdr><w:spacing w:after="200"/>');
    var documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      header + _markdownToDocxBody(markdown) +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>' +
      '</w:body></w:document>';
    var contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
    var rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
    var zip = new JSZip();
    zip.file('[Content_Types].xml', contentTypes);
    zip.file('_rels/.rels', rels);
    zip.file('word/document.xml', documentXml);
    return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }
  function _triggerDownload(blob, filename) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 1000);
  }

  async function downloadReportMarkdownWord(studioId, idx) {
    var raw = State.studiosById && State.studiosById[studioId];
    if (!raw) return;
    var reports = arr((raw.data && raw.data.reports) || []);
    var r = reports[idx];
    if (!r || !r.markdown) return;
    var studio = getStudio(studioId);
    var sName = (studio && studio.name) || String(studioId);
    var safe = String(sName).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    var fechaTxt = (U && U.formatDateES ? U.formatDateES(r.date) : null) || r.date || '';
    var subtitulo = (fechaTxt ? fechaTxt + ' · ' : '') + 'Manuel Fernández · Prescriptor GPF · Ferroplast & Tuyper';
    var blob = null;
    try { blob = await _markdownToDocxBlob(r.markdown, 'Informe de visita — ' + sName, subtitulo); } catch (e) { blob = null; }
    if (blob) {
      _triggerDownload(blob, 'Informe_Visita_' + safe + '_' + (r.date || 'sin_fecha').replace(/[^0-9-]/g, '') + '.docx');
    } else {
      // Fallback (JSZip ausente): HTML-as-doc como antes.
      _triggerDownload(new Blob(['﻿', _reportMarkdownDoc(r, sName)], { type: 'application/msword' }),
        'Informe_Visita_' + safe + '_' + (r.date || 'sin_fecha').replace(/[^0-9-]/g, '') + '.doc');
    }
  }

  function printReportMarkdown(studioId, idx) {
    var raw = State.studiosById && State.studiosById[studioId];
    if (!raw) return;
    var reports = arr((raw.data && raw.data.reports) || []);
    var r = reports[idx];
    if (!r || !r.markdown) return;
    var studio = getStudio(studioId);
    var sName = (studio && studio.name) || String(studioId);
    var w = window.open('', '_blank');
    if (!w) { if (window.showNotification) window.showNotification('Permite las ventanas emergentes para imprimir', 'error'); return; }
    w.document.open();
    w.document.write(_reportMarkdownDoc(r, sName));
    w.document.close();
    w.focus();
    setTimeout(function () { try { w.print(); } catch (_) {} }, 350);
  }

  // Convierte un informe estructurado (visita_importada) a markdown de 8
  // secciones, para generar el .docx real con el mismo conversor.
  function _visitaImportadaToMd(r, studio) {
    function sv(v) { return (v === null || v === undefined || v === '' || v === 'N/A') ? null : v; }
    function arrF(v) { return Array.isArray(v) ? v : []; }
    var y = r.raw_yaml || {};
    var vis = y.visita || {}, inter = y.interlocutores || {}, dev = y.desarrollo || {};
    var ev = y.evaluacion || {}, emp = y.actualizacion_empresa || {};
    var nombre = (studio && studio.name) || vis.studio_nombre || r.title || '';
    var tipo = studio && studio.type ? (Array.isArray(studio.type) ? studio.type.join(', ') : studio.type) : '';
    var ciudad = vis.ciudad || (studio && ((studio.city && studio.city.valor) || studio.city)) || '';
    var prov = vis.provincia || (studio && ((studio.province && studio.province.valor) || studio.province)) || '';
    var L = [];
    L.push('# Informe de visita — ' + nombre, '');
    // 1
    L.push('## 1. Datos generales', '', '| Campo | Valor |', '|---|---|');
    L.push('| Empresa | ' + nombre + ' |');
    if (tipo) L.push('| Tipo | ' + tipo + ' |');
    L.push('| Ciudad / Provincia | ' + [ciudad, prov].filter(Boolean).join(' / ') + ' |');
    if (sv(r.date || vis.fecha)) L.push('| Fecha | ' + (r.date || vis.fecha) + ' |');
    if (sv(vis.hora_inicio || r.hora_inicio)) L.push('| Hora | ' + (vis.hora_inicio || r.hora_inicio) + ' |');
    var dur = (vis.duracion_minutos != null ? vis.duracion_minutos : r.duracion_minutos);
    if (sv(dur)) L.push('| Duración | ' + dur + ' min |');
    if (sv(vis.tipo_visita || r.tipo_visita)) L.push('| Tipo de visita | ' + (vis.tipo_visita || r.tipo_visita) + ' |');
    if (sv(ev.nuevo_status || r.nuevo_status)) L.push('| Estado tras visita | ' + (ev.nuevo_status || r.nuevo_status) + ' |');
    L.push('');
    // 2
    L.push('## 2. Personas contactadas', '', '| Nombre | Cargo | Observaciones |', '|---|---|---|');
    var prin = inter.principal || {};
    L.push('| ' + (sv(prin.nombre) || sv(r.interlocutor_nombre) || sv(prin.cargo) || '—') +
      ((prin.es_decision_maker || r.es_decision_maker) ? ' ⭐' : '') + ' | ' +
      (sv(prin.cargo) || sv(r.cargo_interlocutor) || '—') + ' | ' +
      (sv(prin.perfil_comunicacion) || 'Interlocutor principal') + ' |');
    arrF(inter.otros_asistentes).forEach(function (a) {
      if (!a || (!sv(a.nombre) && !sv(a.cargo))) return;
      L.push('| ' + (sv(a.nombre) || sv(a.cargo) || '—') + (a.es_decision_maker ? ' ⭐' : '') + ' | ' + (sv(a.cargo) || '—') + ' | — |');
    });
    L.push('');
    // 3
    L.push('## 3. Desarrollo de la visita', '');
    if (sv(dev.resumen_ejecutivo) || sv(r.resumen_ejecutivo)) L.push(sv(dev.resumen_ejecutivo) || sv(r.resumen_ejecutivo), '');
    // 4
    var puntos = arrF(dev.puntos_clave || r.puntos_clave).filter(Boolean);
    if (puntos.length || sv(emp.notas_empresa)) {
      L.push('## 4. Contexto estratégico', '');
      puntos.forEach(function (p) { L.push('- ' + p); });
      if (sv(emp.notas_empresa)) { L.push(''); L.push(emp.notas_empresa); }
      L.push('');
    }
    // 5
    var proys = arrF(y.oportunidades_detectadas && y.oportunidades_detectadas.proyectos).filter(function (p) { return p && sv(p.nombre); });
    L.push('## 5. Oportunidades detectadas', '');
    if (proys.length) proys.forEach(function (p, i) {
      var prod = arrF(p.productos_relevantes).length ? ' — Productos GPF: ' + arrF(p.productos_relevantes).join(', ') : '';
      L.push((i + 1) + '. **' + p.nombre + '**' + (sv(p.tipo) ? ' (' + p.tipo + ')' : '') + (sv(p.promotor) ? ' · ' + p.promotor : '') + prod);
    });
    else L.push('Sin oportunidades concretas detectadas en esta visita.');
    L.push('');
    // 6
    var cn = arrF(dev.compromisos && dev.compromisos.por_nuestra_parte).filter(function (c) { return c && sv(c.accion); });
    var cc = arrF(dev.compromisos && dev.compromisos.por_parte_del_cliente).filter(function (c) { return c && sv(c.accion); });
    L.push('## 6. Compromisos y próximos pasos', '');
    var n = 0;
    cn.forEach(function (c) { n++; L.push(n + '. ' + c.accion + (sv(c.responsable) ? ' (' + c.responsable + ')' : '') + (sv(c.plazo) ? ' — ' + c.plazo : '')); });
    cc.forEach(function (c) { n++; L.push(n + '. (Cliente) ' + c.accion); });
    if (sv(dev.proxima_accion || r.proxima_accion)) { n++; L.push(n + '. ' + (sv(dev.proxima_accion) || r.proxima_accion)); }
    if (!n) L.push('Sin compromisos registrados.');
    L.push('');
    // 7
    var obs = [];
    arrF(emp.nuevos_contactos).forEach(function (c) {
      if (!c || !sv(c.nombre)) return;
      obs.push('Contacto: ' + c.nombre + (sv(c.cargo) ? ' — ' + c.cargo : '') + (sv(c.email) ? ' · ' + c.email : '') + (sv(c.telefono) ? ' · ' + c.telefono : ''));
    });
    if (sv(r.importe_estimado_eur)) obs.push('Volumen estimado: ' + (r.importe_estimado_eur / 1000).toFixed(0) + ' k€');
    if (obs.length) { L.push('## 7. Observaciones adicionales', ''); obs.forEach(function (o) { L.push('- ' + o); }); L.push(''); }
    // 8
    L.push('## 8. Evaluación general', '', '| Campo | Valor |', '|---|---|');
    var tempN = (ev.temperatura != null ? ev.temperatura : r.temperatura);
    L.push('| Nivel de interés | ' + (tempN != null ? (tempN >= 8 ? 'Alto' : tempN >= 5 ? 'Medio' : 'Bajo') + ' (' + tempN + '/10)' : '—') + ' |');
    if (sv(ev.plazo_estimado || r.plazo_estimado)) L.push('| Plazo estimado | ' + (sv(ev.plazo_estimado) || r.plazo_estimado) + ' |');
    var prods = arrF(dev.productos && dev.productos.de_interes);
    if (!prods.length) prods = arrF(dev.productos && dev.productos.presentados);
    if (prods.length) L.push('| Productos prioritarios | ' + prods.join(', ') + ' |');
    if (sv(ev.nuevo_status || r.nuevo_status)) L.push('| Estado de la cuenta | ' + (ev.nuevo_status || r.nuevo_status) + ' |');
    return L.join('\n');
  }

  async function downloadReportWord(studioId, idx) {
    var raw = State.studiosById && State.studiosById[studioId];
    if (!raw) return;
    var reports = arr((raw.data && raw.data.reports) || []);
    var r = reports[idx];
    if (!r) return;
    var studio = getStudio(studioId);
    // .docx REAL (OOXML) desde el informe estructurado → markdown. Retorno
    // temprano; el builder HTML-as-doc de abajo queda solo como fallback.
    try {
      if (typeof JSZip !== 'undefined') {
        var _sN = (studio && studio.name) || String(studioId);
        var _sf = String(_sN).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
        var _ft = (U && U.formatDateES ? U.formatDateES(r.date) : null) || r.date || '';
        var _sub = (_ft ? _ft + ' · ' : '') + 'Manuel Fernández · Prescriptor GPF · Ferroplast & Tuyper';
        var _blob = await _markdownToDocxBlob(_visitaImportadaToMd(r, studio), 'Informe de visita — ' + _sN, _sub);
        if (_blob) { _triggerDownload(_blob, 'Informe_Visita_' + _sf + '_' + (r.date || 'sin_fecha').replace(/[^0-9-]/g, '') + '.docx'); return; }
      }
    } catch (e) { console.warn('[detail] docx (importada) falló, uso fallback HTML:', e && e.message); }
    var rawName = studio && studio.name;
    var sName = (typeof rawName === 'string' ? rawName : (rawName && rawName.valor) || '') || String(studioId);

    function sv(v) { return (v === null || v === undefined || v === '' || v === 'N/A') ? null : v; }
    function arrF(v) { return Array.isArray(v) ? v : []; }
    function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    /* ── Datos derivados ── */
    var spin     = r.spin || {};
    var puntos   = arrF(r.puntos_clave).filter(Boolean);
    var comprNos = arrF(r.compromisos && r.compromisos.por_nuestra_parte).filter(function(c){return c&&sv(c.accion);});
    var comprCli = arrF(r.compromisos && r.compromisos.por_parte_del_cliente).filter(function(c){return c&&sv(c.accion);});
    var proyect  = arrF(r.oportunidades_detectadas && r.oportunidades_detectadas.proyectos).filter(function(p){return p&&sv(p.nombre);});
    var compet   = arrF(r.intel_competitiva && r.intel_competitiva.competidores).filter(function(c){return c&&sv(c.nombre);});
    var objs     = arrF(r.objeciones).filter(function(o){return o&&sv(o.objecion);});
    var senales  = arrF(r.senales_de_compra).filter(Boolean);

    var tempN   = r.temperatura != null ? Number(r.temperatura) : null;
    var interesLabel = tempN != null ? (tempN >= 8 ? 'ALTO' : tempN >= 5 ? 'MEDIO' : 'BAJO') : '—';
    var interesDesc  = tempN != null
      ? (tempN >= 8 ? 'ALTO — interés explícito manifestado durante la visita'
        : tempN >= 5 ? 'MEDIO — receptivo, sin compromiso inmediato'
        : 'BAJO — sin interés claro por el momento')
      : '—';

    /* Estado con emoji y descripción */
    var statusEmoji = { ganado:'🟢', reunion:'🟢', propuesta:'🟡', negociacion:'🟡',
      contactado:'🟡', nuevo:'⬜', perdido:'🔻', dormido:'🟡' };
    var statusDesc  = { ganado:'ACTIVO — Cliente confirmado',
      reunion:'ACTIVO — ' + (sv(r.proxima_accion) ? r.proxima_accion.slice(0,60) : 'Segunda visita pendiente'),
      propuesta:'ACTIVO — Propuesta en mesa', negociacion:'ACTIVO — Negociación en curso',
      contactado:'ACTIVO — En seguimiento', nuevo:'NUEVO — Primer contacto realizado',
      perdido:'PERDIDO', dormido:'DORMIDO — Retomar contacto próximamente' };
    var estado = (statusEmoji[r.nuevo_status] || '') + ' ' + (statusDesc[r.nuevo_status] || r.nuevo_status || '—');

    /* Tipo de visita — texto natural */
    var tipoDesc = { primera_visita:'Primera visita — prospección',
      seguimiento:'Visita de seguimiento', demo:'Demostración de producto',
      propuesta:'Presentación de propuesta', negociacion:'Negociación de condiciones',
      cierre:'Visita de cierre', postventa:'Visita postventa' };
    var tipoVisita = tipoDesc[r.tipo_visita] || r.tipo_visita || '—';

    /* Datos del studio */
    var hoy     = new Date().toLocaleDateString('es-ES', {day:'numeric', month:'long', year:'numeric'});
    var ciudad  = (studio && studio.city) ? studio.city : '';
    var prov    = (studio && studio.province) ? studio.province : '';
    var lugarH  = [ciudad, prov].filter(Boolean).join(', ');
    var tipoStudio = (studio && studio.type) ? studio.type : '';
    var stPhone = sv(studio && studio.phone) || null;
    var stEmail = sv(studio && studio.email) || null;
    var stWeb   = sv(studio && studio.web) || null;
    var stAddr  = sv(studio && studio.address) || null;

    /* ── Helpers de generación ── */
    function h2(t) {
      return '<h2>' + t + '</h2>';
    }
    function tdR(label, val) {
      if (!sv(val) && val !== 0) return '';
      return '<tr><td class="lbl">' + esc(label) + '</td><td>' + esc(String(val)) + '</td></tr>';
    }

    /* ── §3 Desarrollo — prosa narrativa en párrafos ── */
    var desarrolloParrafos = [];
    // Párrafo 1: apertura de visita con datos concretos
    /* Párrafo de apertura — SIN hora ni referencias de tiempo concretas */
    var aperturaTxt = 'Visita';
    if (sv(r.tipo_visita)) aperturaTxt += ' de ' + tipoVisita.toLowerCase();
    if (sv(r.date)) {
      aperturaTxt += ' el ' + (function() {
        try { return new Date(r.date + 'T12:00:00').toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long',year:'numeric'}); }
        catch(e){ return r.date; }
      })();
    }
    aperturaTxt += '.';
    if (sv(r.interlocutor_nombre)) {
      aperturaTxt += ' Atendido por ' + r.interlocutor_nombre;
      if (sv(r.cargo_interlocutor)) aperturaTxt += ', ' + r.cargo_interlocutor;
      if (sv(r.duracion_minutos)) aperturaTxt += ', durante aproximadamente ' + r.duracion_minutos + ' minutos';
      if (ciudad) aperturaTxt += ' en las instalaciones de ' + ciudad;
      aperturaTxt += '.';
    }
    desarrolloParrafos.push(aperturaTxt);
    // Párrafos adicionales desde el resumen y el SPIN
    if (sv(r.resumen_ejecutivo)) desarrolloParrafos.push(r.resumen_ejecutivo);
    if (sv(spin.situacion) && spin.situacion !== r.resumen_ejecutivo) desarrolloParrafos.push(spin.situacion);
    if (sv(spin.problema)) desarrolloParrafos.push(spin.problema);
    var conclusionPartes = [sv(spin.implicacion), sv(spin.necesidad_beneficio)].filter(Boolean);
    if (conclusionPartes.length) desarrolloParrafos.push(conclusionPartes.join(' '));

    /* ── §4 Contexto estratégico — análisis y puntos clave ── */
    var contextoParrafos = [];
    if (puntos.length) {
      // Convertir lista en prosa contextual
      contextoParrafos = puntos.map(function(p) { return p; });
    }
    // Añadir señales de compra como contexto estratégico
    if (senales.length) {
      contextoParrafos.push('Señales de interés detectadas durante la visita: ' + senales.join('; ') + '.');
    }

    /* ── §7 Observaciones — bullets con em-dash ── */
    var obs = [];
    objs.forEach(function(o) {
      var t = '— ' + o.objecion;
      if (sv(o.respuesta_dada)) t += '. ' + o.respuesta_dada;
      if (o.resuelta === true) t += ' (resuelta)';
      else if (o.resuelta === false) t += ' (pendiente de resolver)';
      obs.push(t);
    });
    compet.forEach(function(c) {
      var t = '— ' + c.nombre;
      if (sv(c.producto)) t += ' (' + c.producto + ')';
      if (sv(c.fortaleza)) t += '. Punto fuerte: ' + c.fortaleza;
      if (sv(c.debilidad))  t += '. Punto débil: '  + c.debilidad;
      obs.push(t);
    });
    if (r.importe_estimado_eur)    obs.push('— Volumen estimado de negocio: ' + (r.importe_estimado_eur/1000).toFixed(0) + ' k€');
    if (r.probabilidad_cierre_pct) obs.push('— Probabilidad de cierre estimada: ' + r.probabilidad_cierre_pct + '%');

    /* ── §8 Acciones prioritarias (bullets en negrita bajo la tabla) ── */
    var accionesPrio = [];
    if (sv(r.proxima_accion)) {
      var acc = '— Acción inmediata: ' + r.proxima_accion;
      if (sv(r.fecha_proxima_visita)) acc += ' (' + r.fecha_proxima_visita + ')';
      accionesPrio.push(acc);
    }
    comprNos.slice(0, 3).forEach(function(c) {
      accionesPrio.push('— ' + c.accion + (sv(c.plazo) ? ' · ' + c.plazo : ''));
    });

    /* ── Construir cuerpo del documento ── */
    var body =
      /* CABECERA */
      '<table style="width:100%;background:#0a2d52;color:white;padding:8pt 14pt;margin-bottom:0;">' +
        '<tr><td style="color:#aed6f1;font-size:9pt;letter-spacing:.08em;font-weight:700;">FERROPLAST · TUYPER</td>' +
        '<td style="text-align:right;font-size:10pt;font-weight:700;letter-spacing:.04em;text-transform:uppercase;">Informe de Visita</td></tr>' +
      '</table>' +

      /* TÍTULO */
      '<h1 style="color:#0a2d52;font-size:20pt;font-weight:700;margin:10pt 0 2pt;font-family:Calibri,sans-serif;">' +
        'INFORME DE VISITA</h1>' +
      '<h2 style="color:#0a2d52;font-size:15pt;font-weight:700;margin:0 0 4pt;font-family:Calibri,sans-serif;background:none;padding:0;">' +
        esc(sName) + '</h2>' +
      '<p style="color:#444;font-size:10pt;margin:0 0 3pt;">' +
        esc(r.date ? (function(){try{return new Date(r.date+'T12:00:00').toLocaleDateString('es-ES',{day:'numeric',month:'long',year:'numeric'});}catch(e){return r.date;}}()) : hoy) +
        (lugarH ? ' · ' + esc(lugarH) : '') +
      '</p>' +
      '<p style="color:#444;font-size:10pt;margin:0 0 10pt;">Manuel Fernández · Prescriptor GPF · Ferroplast &amp; Tuyper</p>' +
      '<hr style="border:0;border-top:1.5pt solid #0a2d52;margin:0 0 14pt;">' +

      /* §1 DATOS GENERALES */
      '<h2 class="sec">1. DATOS GENERALES</h2>' +
      '<table class="dt"><tbody>' +
        tdR('Empresa', sName) +
        (tipoStudio ? tdR('Tipo', tipoStudio) : '') +
        (stAddr ? tdR('Dirección', stAddr + (lugarH ? ', ' + lugarH : '')) : '') +
        (stPhone ? tdR('Teléfono', stPhone) : '') +
        (stEmail ? tdR('Email', stEmail) : '') +
        (stWeb ? tdR('Web', stWeb) : '') +
        tdR('Fecha de visita', (function(){try{return new Date((r.date||'')+'T12:00:00').toLocaleDateString('es-ES',{day:'numeric',month:'long',year:'numeric'});}catch(e){return r.date;}})()) +
        (sv(r.hora_inicio) ? tdR('Hora', r.hora_inicio + ' h') : '') +
        (sv(r.duracion_minutos) ? tdR('Duración', 'Aprox. ' + r.duracion_minutos + ' minutos') : '') +
        tdR('Tipo de visita', tipoVisita) +
        tdR('Estado tras visita', estado) +
        /* Comercial y origen */
        tdR('Comercial / Prescriptor', (function() {
          var cb = sv(r.imported_by) || 'Manuel Fernández';
          // Normalizar nombre si viene como email
          if (cb && cb.indexOf('@') !== -1) cb = 'Manuel Fernández';
          return cb + ' · Prescriptor GPF · Ferroplast & Tuyper';
        })()) +
        tdR('Origen de la visita', (function() {
          var origenMap = {
            primera_visita: 'Prospección directa — primera visita comercial',
            seguimiento:    'Seguimiento a visita anterior',
            demo:           'Demostración de producto GPF',
            propuesta:      'Presentación de propuesta técnica',
            negociacion:    'Visita de negociación',
            cierre:         'Visita de cierre',
            postventa:      'Visita de seguimiento postventa',
          };
          return origenMap[r.tipo_visita] || tipoVisita;
        })()) +
      '</tbody></table>' +

      /* §2 PERSONAS CONTACTADAS */
      (sv(r.interlocutor_nombre)
        ? '<h2 class="sec">2. PERSONAS CONTACTADAS</h2>' +
          '<table class="ct"><thead><tr>' +
            '<th>Nombre</th><th>Cargo</th><th>Observaciones</th>' +
          '</tr></thead><tbody>' +
          '<tr>' +
            '<td><strong>' + esc(r.interlocutor_nombre) + '</strong>' + (r.es_decision_maker ? ' ⭐' : '') + '</td>' +
            '<td>' + esc(r.cargo_interlocutor || '—') + '</td>' +
            '<td>' + (sv((r.raw_yaml && r.raw_yaml.interlocutores && r.raw_yaml.interlocutores.principal && r.raw_yaml.interlocutores.principal.perfil_comunicacion) || '') ||
              (r.es_decision_maker === true ? 'Decisor. ' : '') +
              'Interlocutor principal en la visita.') + '</td>' +
          '</tr>' +
          '</tbody></table>'
        : '') +

      /* §3 DESARROLLO DE LA VISITA */
      (desarrolloParrafos.length
        ? '<h2 class="sec">3. DESARROLLO DE LA VISITA</h2>' +
          desarrolloParrafos.filter(Boolean).map(function(p){ return '<p>' + esc(p) + '</p>'; }).join('')
        : '') +

      /* §4 CONTEXTO ESTRATÉGICO */
      (contextoParrafos.length
        ? '<h2 class="sec">4. CONTEXTO ESTRATÉGICO</h2>' +
          contextoParrafos.map(function(p){ return '<p>' + esc(p) + '</p>'; }).join('')
        : '') +

      /* §5 OPORTUNIDADES DETECTADAS */
      (proyect.length
        ? '<h2 class="sec">5. OPORTUNIDADES DETECTADAS</h2><ol>' +
          proyect.map(function(p) {
            var det = [sv(p.tipo), sv(p.fase_actual),
              p.importe_estimado ? (p.importe_estimado/1000).toFixed(0)+' k€' : null,
              sv(p.promotor)].filter(Boolean).join(', ');
            return '<li><strong>' + esc(p.nombre) + '</strong>' +
              (det ? ': ' + esc(det) + '.' : '.') +
              (arrF(p.productos_relevantes).length
                ? ' Productos GPF aplicables: ' + esc(arrF(p.productos_relevantes).join(', ')) + '.'
                : '') +
            '</li>';
          }).join('') + '</ol>'
        : '') +

      /* §6 COMPROMISOS Y PRÓXIMOS PASOS */
      (comprNos.length || comprCli.length || sv(r.proxima_accion)
        ? '<h2 class="sec">6. COMPROMISOS Y PRÓXIMOS PASOS</h2><ol>' +
          comprNos.map(function(c){
            return '<li>' + esc(c.accion) +
              (sv(c.plazo) ? ' — <em>' + esc(c.plazo) + '</em>' : '') +
              (sv(c.responsable) ? ' (' + esc(c.responsable) + ')' : '') + '</li>';
          }).join('') +
          comprCli.map(function(c){
            return '<li><em>(Por parte del cliente)</em> ' + esc(c.accion) +
              (sv(c.plazo) ? ' — <em>' + esc(c.plazo) + '</em>' : '') + '</li>';
          }).join('') +
          (sv(r.proxima_accion)
            ? '<li><strong>' + esc(r.proxima_accion) + '</strong>' +
              (sv(r.fecha_proxima_visita) ? ' — ' + esc(r.fecha_proxima_visita) : '') + '</li>'
            : '') +
          '</ol>'
        : '') +

      /* §7 OBSERVACIONES ADICIONALES */
      (obs.length
        ? '<h2 class="sec">7. OBSERVACIONES ADICIONALES</h2>' +
          obs.map(function(o){ return '<p>' + esc(o) + '</p>'; }).join('')
        : '') +

      /* §8 EVALUACIÓN GENERAL */
      '<h2 class="sec">8. EVALUACIÓN GENERAL</h2>' +
      '<table class="et"><tbody>' +
        tdR('Nivel de interés', interesDesc) +
        tdR('Potencial del cliente', (function(){
          var parts = [];
          if (tipoStudio) parts.push(tipoStudio);
          if (tempN >= 7) parts.push('Potencial ALTO');
          else if (tempN >= 4) parts.push('Potencial MEDIO');
          if (r.importe_estimado_eur) parts.push('~' + (r.importe_estimado_eur/1000).toFixed(0) + ' k€ estimados');
          return parts.join(' · ') || null;
        })()) +
        tdR('Plazo estimado', sv(r.plazo_estimado)) +
        tdR('Productos prioritarios', (function(){
          var pp = proyect.map(function(p){ return p.nombre; });
          return pp.length ? pp.join(' · ') : null;
        })()) +
        tdR('Estado de la cuenta', estado) +
      '</tbody></table>' +
      (accionesPrio.length
        ? accionesPrio.map(function(a){ return '<p><strong>' + esc(a) + '</strong></p>'; }).join('')
        : '');

    var wordHTML =
      '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
            'xmlns:w="urn:schemas-microsoft-com:office:word" ' +
            'xmlns="http://www.w3.org/TR/REC-html40">' +
        '<head><meta charset="utf-8"><title>Informe Visita · ' + esc(sName) + '</title>' +
        '<style>' +
          'body{font-family:Calibri,Arial,sans-serif;font-size:10.5pt;line-height:1.5;color:#222;margin:0;}' +
          'h2.sec{background:#1f3a5a;color:white;padding:5pt 10pt;font-size:11pt;font-weight:700;' +
            'margin:14pt 0 6pt;font-family:Calibri,sans-serif;letter-spacing:.04em;}' +
          'p{margin:3pt 0 6pt;}' +
          'ol{margin:4pt 0 8pt 20pt;}li{margin:3pt 0 3pt;}' +
          'strong{color:#0a2d52;font-weight:700;}em{color:#555;}' +
          /* Tabla datos generales */
          '.dt{width:100%;border-collapse:collapse;font-size:10pt;margin-bottom:8pt;}' +
          '.dt .lbl{color:#333;font-weight:700;padding:4pt 12pt 4pt 0;white-space:nowrap;width:28%;' +
            'border-bottom:0.5pt solid #d0d8e8;vertical-align:top;}' +
          '.dt td{padding:4pt 0;border-bottom:0.5pt solid #d0d8e8;vertical-align:top;}' +
          /* Tabla contactos */
          '.ct{width:100%;border-collapse:collapse;font-size:10pt;margin-bottom:8pt;}' +
          '.ct th{background:#0a2d52;color:white;font-weight:700;padding:5pt 8pt;text-align:left;' +
            'font-size:10pt;letter-spacing:.03em;}' +
          '.ct td{padding:5pt 8pt;border-bottom:0.5pt solid #d0d8e8;vertical-align:top;}' +
          /* Tabla evaluación */
          '.et{width:100%;border-collapse:collapse;font-size:10pt;margin-bottom:8pt;}' +
          '.et .lbl{color:#333;font-weight:700;padding:4pt 12pt 4pt 0;white-space:nowrap;width:32%;' +
            'border-bottom:0.5pt solid #d0d8e8;vertical-align:top;}' +
          '.et td{padding:4pt 0;border-bottom:0.5pt solid #d0d8e8;vertical-align:top;}' +
        '</style></head>' +
        '<body>' + body + '</body>' +
      '</html>';

    var safeName = sName.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    var filename = 'Informe_Visita_' + safeName + '_' + (r.date || 'sin_fecha').replace(/[^0-9-]/g, '') + '.doc';
    var blob = new Blob(['﻿', wordHTML], { type: 'application/msword' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function() { URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 1000);
  }

  /* ============================================================
     EDITAR INFORME IMPORTADO
     ============================================================ */
  function openEditReportModal(studioId, idx) {
    var raw = State.studiosById && State.studiosById[studioId];
    if (!raw) return;
    var reports = arr((raw.data && raw.data.reports) || []);
    var r = reports[idx];
    if (!r) return;

    var spin = r.spin || {};
    var fld = 'width:100%; padding:8px 10px; border:1px solid var(--line); border-radius:8px; ' +
              'background:var(--bg-input,var(--bg-card)); color:var(--fg-1); font-size:13px; box-sizing:border-box;';
    var lbl = 'display:block; font-size:11px; font-weight:700; text-transform:uppercase; ' +
              'letter-spacing:.05em; color:var(--fg-3); margin-bottom:4px;';

    function field(id, labelText, value, rows) {
      var tag = rows ? 'textarea' : 'input';
      var extra = rows ? ' rows="' + rows + '" style="' + fld + ' resize:vertical;"' : ' style="' + fld + '"';
      return '<label style="display:block; margin-bottom:12px;">' +
        '<span style="' + lbl + '">' + labelText + '</span>' +
        '<' + tag + ' id="er-' + id + '"' + extra + '>' +
        (rows ? escape(value || '') + '</' + tag + '>' : '') +
        (rows ? '' : ' value="' + (value || '').toString().replace(/"/g, '&quot;') + '">') +
      '</label>';
    }

    var puntosTxt = arr(r.puntos_clave).filter(Boolean).join('\n');
    var TIPO_L = { primera_visita:'Primera visita', seguimiento:'Seguimiento', demo:'Demo',
      propuesta:'Propuesta', negociacion:'Negociación', cierre:'Cierre', postventa:'Postventa' };

    showModal(
      '<div style="background:var(--bg-card); border-radius:14px; padding:24px; width:100%; ' +
        'max-width:560px; max-height:88vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,.3);">' +
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">' +
          '<h3 style="margin:0; font-family:var(--font-display); font-size:18px; font-weight:700;">✏️ Editar visita</h3>' +
          '<button onclick="window.Screens.detail.closeModal()" style="background:none;border:none;cursor:pointer;font-size:20px;color:var(--fg-3);">✕</button>' +
        '</div>' +

        /* Metadatos básicos */
        '<div style="display:grid; grid-template-columns:1fr 1fr; gap:0 14px;">' +
          field('fecha', 'Fecha', r.date || '') +
          field('duracion', 'Duración (min)', r.duracion_minutos || '') +
          field('tipo', 'Tipo de visita', TIPO_L[r.tipo_visita] || r.tipo_visita || '') +
          field('temperatura', 'Temperatura (1–10)', r.temperatura != null ? r.temperatura : '') +
        '</div>' +
        field('interlocutor', 'Interlocutor · Cargo', (r.interlocutor_nombre || '') + (r.cargo_interlocutor ? ' · ' + r.cargo_interlocutor : '')) +

        /* Resumen */
        field('resumen', 'Resumen ejecutivo', r.resumen_ejecutivo || '', 4) +

        /* Puntos clave */
        '<label style="display:block; margin-bottom:12px;">' +
          '<span style="' + lbl + '">Puntos clave (uno por línea)</span>' +
          '<textarea id="er-puntos" rows="3" style="' + fld + ' resize:vertical;">' + escape(puntosTxt) + '</textarea>' +
        '</label>' +

        /* SPIN */
        '<div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:var(--fg-3); margin:4px 0 10px;">Análisis SPIN</div>' +
        field('spin-s', 'Situación', spin.situacion || '', 2) +
        field('spin-p', 'Problema', spin.problema || '', 2) +
        field('spin-i', 'Implicación', spin.implicacion || '', 2) +
        field('spin-n', 'Beneficio reconocido', spin.necesidad_beneficio || '', 2) +

        /* Próxima acción */
        '<div style="display:grid; grid-template-columns:1fr 1fr; gap:0 14px;">' +
          field('proxima-accion', 'Próxima acción', r.proxima_accion || '') +
          field('proxima-fecha', 'Fecha próxima visita', r.fecha_proxima_visita || '') +
        '</div>' +

        /* Notas libres */
        field('notas', 'Notas adicionales', r.notas_libres || '', 2) +

        '<div id="edit-report-error" style="display:none; color:#dc2626; font-size:13px; margin-bottom:8px; ' +
          'padding:8px; background:#fef2f2; border-radius:6px;"></div>' +

        '<div style="display:flex; gap:8px;">' +
          '<button id="btn-save-report" class="btn btn-primary" style="flex:1;" ' +
            'onclick="window.Screens.detail.saveEditReport(\'' + escape(studioId) + '\',' + idx + ')">Guardar cambios</button>' +
          '<button class="btn btn-ghost" onclick="window.Screens.detail.closeModal()">Cancelar</button>' +
        '</div>' +
      '</div>'
    );
  }

  async function saveEditReport(studioId, idx) {
    var raw = State.studiosById && State.studiosById[studioId];
    if (!raw) return;
    var reports = arr((raw.data && raw.data.reports) || []).slice();
    var r = Object.assign({}, reports[idx]);
    if (!r) return;

    var btn = document.getElementById('btn-save-report');
    var errEl = document.getElementById('edit-report-error');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

    function gv(id) {
      var el = document.getElementById('er-' + id);
      return el ? el.value.trim() : null;
    }

    // Validar temperatura
    var tempRaw = gv('temperatura');
    var tempVal = tempRaw !== '' && tempRaw !== null ? Number(tempRaw) : null;
    if (tempVal !== null && (isNaN(tempVal) || tempVal < 1 || tempVal > 10)) {
      if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'La temperatura debe ser un número entre 1 y 10.'; }
      if (btn) { btn.disabled = false; btn.textContent = 'Guardar cambios'; }
      return;
    }

    // Actualizar campos del informe
    var resumen = gv('resumen');
    if (resumen !== null) r.resumen_ejecutivo = resumen;

    var puntosTxt = gv('puntos');
    if (puntosTxt !== null) r.puntos_clave = puntosTxt ? puntosTxt.split('\n').map(function(l){ return l.trim(); }).filter(Boolean) : [];

    r.spin = Object.assign({}, r.spin || {}, {
      situacion:          gv('spin-s') || r.spin && r.spin.situacion || null,
      problema:           gv('spin-p') || r.spin && r.spin.problema || null,
      implicacion:        gv('spin-i') || r.spin && r.spin.implicacion || null,
      necesidad_beneficio: gv('spin-n') || r.spin && r.spin.necesidad_beneficio || null,
    });

    var proximaAccion = gv('proxima-accion');
    if (proximaAccion !== null) r.proxima_accion = proximaAccion || null;

    var proximaFecha = gv('proxima-fecha');
    if (proximaFecha !== null) r.fecha_proxima_visita = proximaFecha || null;

    if (tempVal !== null) r.temperatura = tempVal;
    else if (tempRaw === '') r.temperatura = null;

    var notas = gv('notas');
    if (notas !== null) r.notas_libres = notas || null;

    reports[idx] = r;

    try {
      await saveDataField(studioId, 'reports', reports);
      closeModal();
      notif('Informe actualizado', 'success');
      render({ studioId: studioId, tab: 'informes' });
    } catch (e) {
      if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'Error al guardar: ' + (e.message || e); }
      if (btn) { btn.disabled = false; btn.textContent = 'Guardar cambios'; }
    }
  }

  /* ============================================================
     FIN BLOQUE IMPORTAR VISITA
     ============================================================ */

  function wireCTAs(studio) {
    const v = document.getElementById('view-detail');
    if (!v) return;
    v.querySelectorAll('[data-action]').forEach(function (el) {
      const action = el.getAttribute('data-action');
      el.addEventListener('click', function (e) {
        e.preventDefault();
        if (action === 'email') {
          openEmailPanel(studio);
        } else if (action === 'como-llegar') {
          if (window.Screens && window.Screens.comollegar && window.Screens.comollegar.open) {
            window.Screens.comollegar.open(studio.id);
          }
        } else if (action === 'open-briefing') {
          window.showView('briefing', { studioId: studio.id });
        } else if (action === 'open-informe') {
          window.showView('informe', { studioId: studio.id });
        } else if (action === 'regenerar-briefing') {
          regenerarBriefingIA(studio);
        } else if (action === 'change-status') {
          // Scroll al tab Pipeline y muestra el selector de estado
          switchTab('pipeline', studio.id);
          _tab = 'pipeline';
        } else if (action === 'enrich') {
          _enrichStudioUI(el, studio);
        } else if (action === 'importar-visita') {
          openImportarVisitaModal(studio);
        } else if (action === 'toggle-contact-sync') {
          _toggleContactSync(el, studio);
        }
      });
    });
  }

  /* Payload plano que consume el GAS de contactos (People API). */
  function _contactSyncPayload(s) {
    return {
      id: s.id, name: s.name, type: s.type,
      phone: s.phone, email: s.email, web: s.web,
      address: s.address, city: s.city, province: s.province,
      team: s.team,
    };
  }

  /* Añade/quita el estudio de Google Contacts (y por tanto del iPhone/Mac).
     Guarda resourceName+etag en studio.data.contactSync para poder actualizar
     o borrar después. Actualiza el botón in situ sin re-render completo. */
  async function _toggleContactSync(btn, studio) {
    const raw = State.studiosById && State.studiosById[studio.id];
    const existing = raw && raw.data && raw.data.contactSync;
    const orig = btn.innerHTML;
    btn.disabled = true;
    try {
      if (existing && existing.resourceName) {
        btn.innerHTML = '⏳ Quitando…';
        await window.Data.syncContact('delete', { id: studio.id }, existing.resourceName);
        await saveDataField(studio.id, 'contactSync', null);
        btn.className = 'btn btn-ghost';
        btn.innerHTML = I.User() + ' Añadir a mis Contactos (iPhone)';
        notif('Contacto quitado de tu agenda de Google', 'success');
      } else {
        btn.innerHTML = '⏳ Añadiendo…';
        const res = await window.Data.syncContact('upsert', _contactSyncPayload(studio), null);
        await saveDataField(studio.id, 'contactSync', {
          resourceName: res.resourceName, etag: res.etag, syncedAt: new Date().toISOString(),
        });
        btn.className = 'btn btn-strong';
        btn.innerHTML = I.User() + ' En tus Contactos ✓ · quitar';
        notif('Añadido a tus Contactos — llegará al iPhone en unos minutos', 'success');
      }
    } catch (e) {
      notif('Error al sincronizar contacto: ' + (e && e.message || e), 'error');
      btn.innerHTML = orig;
    } finally {
      btn.disabled = false;
    }
  }

  /* Lanza enrichStudio con feedback visual en el botón.
     enrichStudio ya muestra sus propios toasts de progreso y resultado;
     aquí sólo gestionamos el estado del botón y el re-render final. */
  async function _enrichStudioUI(btn, studio) {
    if (!window.Data || !window.Data.enrichStudio) {
      window.showNotification('Data.enrichStudio no disponible', 'error'); return;
    }
    btn.disabled = true;
    btn.innerHTML = '⏳ Analizando…';
    try {
      await window.Data.enrichStudio(studio.id);
      // Re-renderizar la ficha para mostrar los datos que se hayan rellenado
      render({ studioId: studio.id });
    } catch (e) {
      window.showNotification('⚠️ ' + (e.message || 'Error en enrich'), 'error');
      btn.disabled = false;
      btn.innerHTML = '🔍 Enrich';
    }
  }

  /* ============================================================
     GENERACIÓN BRIEFING IA
     ============================================================ */
  function regenerarBriefingIA(studio) {
    if (!window.Data || !window.Data.generateBriefing) { alert('Capa de datos no disponible.'); return; }

    // Construir opciones de cargo según tipo del studio
    var tipoPrincipal = Array.isArray(studio.type) ? studio.type[0] : (studio.type || 'ARQ');
    var cargosPorTipo = (window.Data.CARGOS_POR_TIPO && window.Data.CARGOS_POR_TIPO[tipoPrincipal]) || null;
    var perfilesDelTipo = cargosPorTipo ? Object.keys(cargosPorTipo.perfiles) : [];
    var defaultCargo = cargosPorTipo ? cargosPorTipo.default : '';

    // Roles del equipo conocido (sugerir primero)
    var teamRoles = [];
    var team = (studio.data && studio.data.team) || [];
    team.forEach(function (m) {
      if (m.role && teamRoles.indexOf(m.role) === -1) teamRoles.push(m.role);
    });

    // Construir <option> para cargo
    function buildCargoOptions() {
      var html = '<option value="">— seleccionar cargo —</option>';
      if (teamRoles.length) {
        html += '<optgroup label="Equipo conocido del cliente">';
        teamRoles.forEach(function (r) {
          html += '<option value="' + r + '">' + r + '</option>';
        });
        html += '</optgroup>';
      }
      if (perfilesDelTipo.length) {
        html += '<optgroup label="Perfiles ' + tipoPrincipal + ' (matriz GPF)">';
        perfilesDelTipo.forEach(function (k) {
          var perfil = cargosPorTipo.perfiles[k];
          var label = perfil ? perfil.alias : k;
          var sel = k === defaultCargo ? ' selected' : '';
          html += '<option value="' + k + '"' + sel + '>' + label + '</option>';
        });
        html += '</optgroup>';
      }
      if (!perfilesDelTipo.length && !teamRoles.length) {
        html += '<option value="otro">Otro / no especificado</option>';
      }
      return html;
    }

    var today = new Date().toISOString().slice(0, 10);
    var modalId = 'modal-briefing-gen';

    // Eliminar modal previo si existe
    var prev = document.getElementById(modalId);
    if (prev) prev.remove();

    var modalHtml =
      '<div id="' + modalId + '" style="position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);" onclick="if(event.target===this){this.remove()}">' +
        '<div style="background:var(--surface,#fff);border-radius:16px;padding:28px 24px;width:min(440px,92vw);box-shadow:0 20px 60px rgba(0,0,0,.3);" onclick="event.stopPropagation()">' +
          '<div style="font-size:17px;font-weight:700;margin-bottom:4px;">Generar briefing con IA</div>' +
          '<div style="font-size:13px;color:var(--fg-2,#666);margin-bottom:20px;">' + (studio.name || studio.id) + '</div>' +

          '<label style="display:block;margin-bottom:12px;">' +
            '<span style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--fg-2,#888);display:block;margin-bottom:4px;">Cargo del interlocutor *</span>' +
            '<select id="brief-gen-cargo" style="width:100%;padding:9px 12px;border:1px solid var(--border,#e5e7eb);border-radius:8px;font-size:14px;background:var(--surface,#fff)">' +
              buildCargoOptions() +
            '</select>' +
          '</label>' +

          '<label style="display:block;margin-bottom:12px;">' +
            '<span style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--fg-2,#888);display:block;margin-bottom:4px;">Tipo de visita *</span>' +
            '<select id="brief-gen-tipo" style="width:100%;padding:9px 12px;border:1px solid var(--border,#e5e7eb);border-radius:8px;font-size:14px;background:var(--surface,#fff)">' +
              '<option value="">— seleccionar —</option>' +
              '<option value="primera-frio">Primera visita (en frío)</option>' +
              '<option value="primera-con-cita">Primera visita (con cita)</option>' +
              '<option value="seguimiento" selected>Seguimiento</option>' +
              '<option value="visita-tecnica-proyecto">Visita técnica de proyecto</option>' +
              '<option value="presentacion-producto">Presentación de producto</option>' +
              '<option value="post-licitacion">Post-licitación</option>' +
            '</select>' +
          '</label>' +

          '<label style="display:block;margin-bottom:12px;">' +
            '<span style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--fg-2,#888);display:block;margin-bottom:4px;">Fecha de visita</span>' +
            '<input id="brief-gen-fecha" type="date" value="' + today + '" style="width:100%;padding:9px 12px;border:1px solid var(--border,#e5e7eb);border-radius:8px;font-size:14px;background:var(--surface,#fff);box-sizing:border-box">' +
          '</label>' +

          '<label style="display:block;margin-bottom:20px;">' +
            '<span style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--fg-2,#888);display:block;margin-bottom:4px;">Contexto extra (opcional)</span>' +
            '<textarea id="brief-gen-ctx" rows="2" placeholder="Ej: llevan 6 meses sin comprar, proyecto en fase anteproyecto…" style="width:100%;padding:9px 12px;border:1px solid var(--border,#e5e7eb);border-radius:8px;font-size:14px;background:var(--surface,#fff);resize:vertical;box-sizing:border-box"></textarea>' +
          '</label>' +

          '<div id="brief-gen-error" style="display:none;font-size:13px;color:#ef4444;margin-bottom:12px;padding:8px 12px;background:#fef2f2;border-radius:8px;"></div>' +

          '<div style="display:flex;gap:10px;justify-content:flex-end;">' +
            '<button onclick="document.getElementById(\'' + modalId + '\').remove()" style="padding:9px 18px;border:1px solid var(--border,#e5e7eb);border-radius:8px;background:transparent;font-size:14px;cursor:pointer">Cancelar</button>' +
            '<button id="brief-gen-submit" style="padding:9px 18px;border:none;border-radius:8px;background:var(--accent,#2563eb);color:#fff;font-size:14px;font-weight:600;cursor:pointer">Generar briefing</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.getElementById('brief-gen-submit').addEventListener('click', function () {
      var cargo = document.getElementById('brief-gen-cargo').value.trim();
      var tipo = document.getElementById('brief-gen-tipo').value;
      var fecha = document.getElementById('brief-gen-fecha').value || today;
      var ctx = (document.getElementById('brief-gen-ctx').value || '').trim();
      var errEl = document.getElementById('brief-gen-error');

      if (!cargo) {
        errEl.textContent = 'Selecciona el cargo del interlocutor.';
        errEl.style.display = 'block';
        return;
      }
      if (!tipo) {
        errEl.textContent = 'Selecciona el tipo de visita.';
        errEl.style.display = 'block';
        return;
      }
      errEl.style.display = 'none';

      var modal = document.getElementById(modalId);
      if (modal) modal.remove();

      // Scroll al top para que el indicador de carga sea visible
      var _content = document.querySelector('.crm-root .content');
      if (_content) _content.scrollTop = 0;

      if (window.States && window.States.showLoading) {
        window.States.showLoading('view-detail', {
          title: 'Generando briefing con IA',
          sub: 'Analizando licitaciones, red profesional y compromisos…',
        });
      }

      window.Data.generateBriefing(studio.id, fecha, {
        cargoInterlocutor: cargo,
        tipoVisita: tipo,
        contextoExtra: ctx,
      }).then(function (res) {
        if (res && (res.success || res.ok || res.briefing)) {
          render({ studioId: studio.id });
          setTimeout(function () { window.showView('briefing', { studioId: studio.id }); }, 300);
        } else {
          throw new Error((res && (res.error || res.message)) || 'Respuesta no reconocida');
        }
      }).catch(function (e) {
        console.error('[redesign/detail] error briefing:', e);
        if (window.States && window.States.showError) {
          window.States.showError('view-detail', {
            title: 'No se pudo generar el briefing',
            body: 'El servidor no respondió. Inténtalo de nuevo.',
            detail: (e.message || '').slice(0, 200),
            ctas: [{ label: 'Volver', onclick: 'window.Screens.detail.render({ studioId: \'' + studio.id + '\' })' }],
          });
        }
      });
    });
  }

  /* ============================================================
     HELPERS VISUALES
     ============================================================ */
  function emptyCard(title, sub) {
    return (
      '<div class="card" style="padding:32px 20px; text-align:center;">' +
        '<div style="font-size:2.5rem; margin-bottom:10px; opacity:.4;">📭</div>' +
        '<div style="font-size:14px; font-weight:600; color:var(--fg-2); margin-bottom:4px;">' + escape(title) + '</div>' +
        '<div style="font-size:13px; color:var(--fg-3);">' + escape(sub) + '</div>' +
      '</div>'
    );
  }

  function emptyState(id) {
    return (
      '<div style="max-width:380px; margin:80px auto; text-align:center;">' +
        '<div style="width:88px; height:88px; border-radius:50%; background:var(--gpf-blue-100); ' +
          'display:flex; align-items:center; justify-content:center; color:var(--gpf-blue-700); margin:0 auto 18px;">' +
          I.Building() +
        '</div>' +
        '<h2 style="font-family:var(--font-display); font-weight:600; font-size:22px; margin:0 0 8px;">Ficha no encontrada</h2>' +
        '<p style="font-size:15px; color:var(--fg-3); line-height:1.5; margin:0 0 24px;">' +
          'El estudio con id <code>' + escape(id) + '</code> no está disponible.' +
        '</p>' +
        '<button class="btn btn-ghost btn-block" onclick="showView(\'studios\')">' + I.Building() + ' Ver listado</button>' +
      '</div>'
    );
  }

  /* ============================================================
     EXPORT
     ============================================================ */
  window.Screens = window.Screens || {};
  window.Screens.detail = {
    render: render,
    switchTab: switchTab,
    _filtrarInformes: function (val) {
      document.querySelectorAll('[data-report-proj]').forEach(function (el) {
        el.style.display = (!val || el.getAttribute('data-report-proj') === val) ? '' : 'none';
      });
    },
    closeModal: closeModal,
    // Actividades
    openAddActivity: openAddActivity,
    saveActivity: saveActivity,
    openEditActivity: openEditActivity,
    updateActivity: updateActivity,
    deleteActivity: deleteActivity,
    // Equipo
    openAddTeamMember: openAddTeamMember,
    openEditTeamMember: openEditTeamMember,
    saveTeamMember: saveTeamMember,
    deleteTeamMember: deleteTeamMember,
    // Proyectos
    openAddProject: openAddProject,
    openEditProject: openEditProject,
    saveProject: saveProject,
    deleteProject: deleteProject,
    // Informes
    deleteReport: deleteReport,
    // Importar visita .yaml
    openImportarVisitaModal: openImportarVisitaModal,
    _confirmarImportarVisita: _confirmarImportarVisita,
    _guardarEnBandeja: _guardarEnBandeja,
    // Toggle completada en actividades de bandeja
    toggleBandeja: async function(studioId, idx) {
      var raw = State.studiosById && State.studiosById[studioId];
      if (!raw) return;
      var curData = Object.assign({}, raw.data || {});
      var acts = arr(curData.activities).slice();
      if (!acts[idx]) return;
      acts[idx] = Object.assign({}, acts[idx], { completada: !acts[idx].completada });
      curData.activities = acts;
      await window.Data.patchDoc('studios/' + studioId, { data: curData });
      raw.data = curData;
      if (State.studiosById) State.studiosById[studioId] = raw;
      if (window.AccionesEngine) window.AccionesEngine.invalidarCache();
      render({ studioId: studioId, tab: 'actividades' });
    },
    // Ver, editar y descargar informe importado
    openReportSheet: openReportSheet,
    openEditReportModal: openEditReportModal,
    saveEditReport: saveEditReport,
    downloadReportWord: downloadReportWord,
    // Informes markdown (informe_v2)
    openReportMarkdownSheet: openReportMarkdownSheet,
    downloadReportMd: downloadReportMd,
    downloadReportMarkdownWord: downloadReportMarkdownWord,
    printReportMarkdown: printReportMarkdown,
    openEditReportMarkdownModal: openEditReportMarkdownModal,
    saveReportMarkdown: saveReportMarkdown,
    // Contacto
    openEditContact: openEditContact,
    saveContact: saveContact,
    // Pipeline
    changeStatus: changeStatus,
    // Editar ficha + eliminar
    openEditarFicha: openEditarFicha,
    guardarFicha: guardarFicha,
    _confirmDelete: _confirmDelete,
    eliminarEmpresa: eliminarEmpresa,
    // Briefing IA
    regenerarBriefingIA: regenerarBriefingIA,
    // Resolver una acción pendiente (desde la Bandeja o la ficha)
    openEmailPanel: openEmailPanel,
    resolverAccion: function (studioId, tipo, descripcion) {
      var studio = getStudio(studioId);
      if (!studio) { window.showView('detail', { studioId: studioId }); return; }
      if (tipo === 'llamada') {
        var tel = studio.phone ? String(studio.phone).split('/')[0].replace(/[^\d+]/g, '') : '';
        if (tel) { window.location.href = 'tel:' + tel; }
        else {
          if (window.showNotification) window.showNotification('Sin teléfono registrado — abro la ficha', 'info');
          window.showView('detail', { studioId: studioId });
        }
        return;
      }
      var seed;
      if (tipo === 'reunion')       seed = 'Proponer una reunión o visita técnica. Contexto de la acción pendiente: ' + descripcion;
      else if (tipo === 'material') seed = 'Coordinar por correo la entrega de la muestra/material. Contexto: ' + descripcion;
      else                          seed = descripcion;   // email (y cualquier otro tipo)
      openEmailPanel(studio, seed);
    },
    // Email panel
    // Cuando la ficha no tiene email guardado: pide el destinatario y abre el correo.
    _emailPedirDestinatario: function () {
      var to = (window.prompt('¿A qué email enviamos este correo?') || '').trim();
      if (!to) return;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
        if (window.showNotification) window.showNotification('Ese email no parece válido', 'error');
        return;
      }
      var subject = window._emailPanelSubject || '';
      var body    = window._emailPanelBody || '';
      window.location.href = _mailtoUrl(to, subject, body);
    },
    _emailChip: function (idx) {
      var studio = window._emailPanelStudio;
      if (!studio) return;
      // Cambiar de arquetipo invalida lo generado: un agradecimiento y una
      // petición de visita no son el mismo correo con otro título. Se limpia
      // para no dejar en pantalla un texto que ya no corresponde al chip.
      if (window._emailPanelActive !== idx) {
        window._emailPanelIASub   = '';
        window._emailPanelIABody  = '';
        window._emailPanelIAAviso = '';
        window._emailPanelIAMeta  = '';
      }
      window._emailPanelActive = idx;
      _renderEmailSheet(studio, idx, window._emailPanelIASub || '', window._emailPanelIABody || '');
    },
    _emailGenerar: async function () {
      var studio = window._emailPanelStudio;
      if (!studio) return;
      var input       = document.getElementById('ep-ia-input');
      var instruccion = input ? input.value.trim() : '';
      var preview     = document.getElementById('ep-preview');
      if (preview) preview.innerHTML = '<div style="text-align:center; padding:20px; color:var(--fg-3); font-size:13px;">✨ Generando con FerroCom Coach…</div>';

      var C = window.CoachDoctrine;
      if (!C) {
        if (preview) preview.innerHTML = '<div style="color:var(--mute-red-dark); font-size:13px; padding:10px;">⚠️ CoachDoctrine no cargado. Revisa que index.html incluya redesign/coach-doctrine.js.</div>';
        return;
      }

      /* ---- Contexto del estudio ---- */
      var nombre  = studio.name || '';
      var ciudad  = (typeof studio.city === 'object' ? (studio.city && studio.city.valor) : studio.city) || '';
      var prov    = (typeof studio.province === 'object' ? (studio.province && studio.province.valor) : studio.province) || '';
      var tipoOrg = studio.type || '';
      var ctc     = (studio.team && studio.team[0]) ? (studio.team[0].name || '') + (studio.team[0].role ? ' (' + studio.team[0].role + ')' : '') : '';
      var lastAct = U.lastInteraction(studio);
      var diasSin = lastAct ? U.diasDesde(lastAct) + ' días sin contacto' : 'sin contacto registrado';

      /* ---- Último informe de visita (personaliza el seguimiento) ---- */
      var ultimoInformeCtx = '';
      var repsOrdenados = (studio.reports || []).slice().sort(function (a, b) {
        return (b.date || b.generated_at || '') > (a.date || a.generated_at || '') ? 1 : -1;
      });
      if (repsOrdenados.length > 0) {
        var repObj  = repsOrdenados[0];
        var repData = repObj.report || {};
        var lineas  = [];
        if (repObj.date) lineas.push('Fecha visita: ' + repObj.date);
        if (repData.resumen) lineas.push('Resumen: ' + repData.resumen);
        if (repData.temas_tratados && repData.temas_tratados.length) lineas.push('Temas: ' + repData.temas_tratados.join('; '));
        if (repData.compromisos && repData.compromisos.length) lineas.push('Compromisos: ' + repData.compromisos.map(function (c) { return c.que + (c.quien ? ' (' + c.quien + ')' : ''); }).join('; '));
        if (repData.proxima_accion) lineas.push('Próxima acción: ' + repData.proxima_accion);
        if (repData.nivel_interes) lineas.push('Nivel interés: ' + repData.nivel_interes);
        if (!repData.resumen && repObj.notes_raw) lineas.push('Notas: ' + String(repObj.notes_raw).substring(0, 400));
        if (lineas.length) ultimoInformeCtx = '\n\nÚLTIMO INFORME DE VISITA:\n' + lineas.join('\n');
      }

      /* ---- Doctrina: perfil + arquetipo ---- */
      var perfil = C.detectarPerfil(studio);
      // El chip manda; 'libre' delega la decisión en la instrucción y el historial.
      var arq  = _arquetipoActivo();
      var tipo = (arq.id === 'libre') ? _inferirTipoCorreo(studio, instruccion) : arq.id;
      var doc  = C.build({ tipo: tipo, perfil: perfil });

      /* Regla del proyecto: ningún texto que venga de un informe puede arrastrar
         marcas de tiempo de la transcripción. Se limpia ANTES de mandarlo a la IA
         para que no las reproduzca en el correo. */
      var strip = (window.Util && window.Util.stripTimestamps) ? window.Util.stripTimestamps : function (s) { return s; };

      var userMsg = strip(
        'Redacta un correo para:\n' +
        '- Empresa: ' + nombre + (tipoOrg ? ' (' + tipoOrg + ')' : '') + ' · ' + ciudad + (prov ? ' (' + prov + ')' : '') + '\n' +
        (ctc ? '- Contacto: ' + ctc + '\n' : '- Contacto: sin persona identificada\n') +
        '- Estado en el CRM: ' + diasSin + '\n' +
        '- Arquetipo detectado: ' + doc.tipo + (doc.esFrio ? ' (PRIMER CONTACTO EN FRÍO)' : '') + '\n' +
        ultimoInformeCtx +
        '\n\n- Instrucción de Manolo: ' +
        (instruccion || (ultimoInformeCtx
          ? 'correo de seguimiento personalizado tras la última visita, apoyándote en el informe de arriba'
          : 'primer contacto para pedir una cita, siguiendo la estructura obligatoria'))
      );

      /* ---- Llamada al proxy. Se intenta con `system` como ARRAY (permite
         prompt caching del núcleo). Si el GAS no lo reenvía bien, se reintenta
         una vez con `system` como string plano. ---- */
      async function _pedir(systemPayload) {
        var res = await window.Data.callGAS('claudeProxy', {
          model: _IA_MODEL,
          max_tokens: 8192,
          output_config: { effort: _IA_EFFORT },
          system: systemPayload,
          messages: [{ role: 'user', content: userMsg }],
        });
        if (res && res.error) {
          throw new Error(typeof res.error === 'string' ? res.error : (res.error.message || 'Error IA'));
        }
        return res;
      }

      try {
        if (!window.Data || !window.Data.callGAS) throw new Error('Data.callGAS no disponible');

        var res, via = 'array (con caché)';
        try {
          res = await _pedir(doc.system);
        } catch (eArray) {
          // El proxy no ha digerido el array → reintento plano, sin caché.
          if (window.debugLog) window.debugLog('[coach] system-array rechazado (' + eArray.message + '); reintento en plano');
          via = 'plano (sin caché)';
          res = await _pedir(C.buildPlano({ tipo: tipo, perfil: perfil }).system);
        }
        if (window.debugLog) window.debugLog('[coach] generado vía ' + via + ' · arquetipo=' + doc.tipo + ' · perfil=' + perfil);

        /* El texto NO está siempre en content[0]: con pensamiento activado (por
           defecto en Opus 5) el bloque 0 es de tipo "thinking" y el correo viene
           después. Centralizado en Util.extractClaudeText. */
        var raw = U.extractClaudeText(res);
        var cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        var parsed;
        try { parsed = JSON.parse(cleaned); } catch (_) {
          var s = cleaned.indexOf('{'), e2 = cleaned.lastIndexOf('}');
          if (s >= 0 && e2 > s) parsed = JSON.parse(cleaned.slice(s, e2 + 1));
          else throw new Error('La IA no devolvió JSON parseable');
        }

        // Cinturón: el correo tampoco puede llevar marcas de tiempo.
        window._emailPanelIASub   = strip(parsed.subject || '');
        window._emailPanelIABody  = strip(parsed.body    || '');
        window._emailPanelIAAviso = parsed.aviso || '';
        window._emailPanelIAMeta  = 'Arquetipo: ' + doc.tipo + ' · Perfil: ' + (parsed.perfil || perfil);
        _renderEmailSheet(studio, window._emailPanelActive, window._emailPanelIASub, window._emailPanelIABody);
      } catch (e) {
        if (preview) preview.innerHTML = '<div style="color:var(--mute-red-dark); font-size:13px; padding:10px;">⚠️ Error: ' + escape(e.message) + '</div>';
      }
    },
  };
})();