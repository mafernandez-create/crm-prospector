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

    const id = (params && params.studioId) || State.currentStudioId || '3012';
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
  }

  function renderFull(s) {
    return (
      '<div style="max-width:720px; margin:0 auto; padding-bottom:60px;">' +
        headerBlock(s) +
        tabBar(s) +
        '<div id="detail-panel" style="margin-top:16px;">' +
          renderPanel(s, _tab) +
        '</div>' +
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
              '<span style="font-size:12px; font-weight:600; padding:2px 10px; border-radius:12px; ' +
                'background:' + statusColor + '22; color:' + statusColor + ';">' +
                escape(statusLabel) +
              '</span>' +
            '</div>' +
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

        /* Contacto rápido */
        (s.phone || s.email
          ? '<div style="display:grid; grid-template-columns:' + (s.phone && s.email ? '1fr 1fr' : '1fr') + '; gap:8px; margin-bottom:4px;">' +
              (s.phone ? '<a class="btn btn-ghost" style="height:46px;" href="tel:' + escape(s.phone.replace(/[^\d+]/g, '')) + '">' + I.Phone() + ' Llamar</a>' : '') +
              (s.email ? '<button class="btn btn-ghost" style="height:46px;" data-action="email" data-email="' + escape(s.email) + '">' + I.Mail() + ' Email</button>' : '') +
            '</div>'
          : '') +
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
          (s.briefingFecha ? '<span style="font-size:12px; color:var(--fg-3); font-family:var(--font-mono);">Generado ' + escape(s.briefingFecha) + '</span>' : '') +
        '</div>' +
        '<div class="card" style="padding:16px;">' +
          '<div style="font-size:14px; line-height:1.5; color:var(--fg-2); margin-bottom:12px;">' +
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
          : projs.map(function (p, idx) { return projectCard(p, idx, s.id); }).join('')
        ) +
      '</section>'
    );
  }

  function projectCard(p, idx, studioId) {
    const estadoLabel = PROYECTO_ESTADO[p.estado] || p.estado || '';
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
            (p.url ? '<div style="margin-top:5px;"><a href="' + escape(p.url) + '" target="_blank" rel="noopener" style="font-size:12px; color:var(--gpf-blue-700);">🔗 Perfil del contratante ↗</a></div>' : '') +
          '</div>' +
          '<div style="display:flex; gap:4px; flex:0 0 auto;">' +
            '<button onclick="window.Screens.detail.openEditProject(\'' + escape(studioId) + '\',' + idx + ')" ' +
              'style="background:none; border:1px solid var(--line); border-radius:6px; padding:4px 8px; cursor:pointer; font-size:12px; color:var(--fg-3);">✏️</button>' +
            '<button onclick="window.Screens.detail.deleteProject(\'' + escape(studioId) + '\',' + idx + ')" ' +
              'style="background:none; border:1px solid #fecaca; border-radius:6px; padding:4px 8px; cursor:pointer; font-size:12px; color:#dc2626;">🗑️</button>' +
          '</div>' +
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
            (m.linkedin ? '<div style="font-size:13px;"><a href="' + escape(m.linkedin) + '" target="_blank" rel="noopener" style="color:var(--gpf-blue-700);">💼 LinkedIn ↗</a></div>' : '') +
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
    const type    = act.type || 'nota';
    const color   = ACT_COLORS[type] || '#94a3b8';
    const label   = ACT_LABELS[type] || type;
    const dateStr = U.formatDateES(act.createdAt) || act.date || '—';
    const isVisit = type === 'registro_visita';
    return (
      '<div style="display:flex; gap:12px; align-items:flex-start; margin-bottom:14px; position:relative; z-index:1;">' +
        '<div style="width:36px; height:36px; border-radius:50%; background:' + color + '22; ' +
          'border:2px solid ' + color + '; display:flex; align-items:center; justify-content:center; ' +
          'flex:0 0 auto; font-size:14px;">' +
          actIcon(type) +
        '</div>' +
        '<div class="card" style="flex:1; padding:12px; min-width:0;">' +
          '<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:6px;">' +
            '<div>' +
              '<span style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; ' +
                'color:' + color + ';">' + escape(label) + '</span>' +
              '<span style="font-size:12px; color:var(--fg-3); font-family:var(--font-mono); margin-left:8px;">' + escape(dateStr) + '</span>' +
            '</div>' +
            '<button onclick="window.Screens.detail.deleteActivity(\'' + escape(studioId) + '\',' + idx + ')" ' +
              'style="background:none; border:none; cursor:pointer; color:var(--fg-3); font-size:13px; padding:0; flex:0 0 auto;">✕</button>' +
          '</div>' +
          '<div style="font-size:14px; color:var(--fg-1); line-height:1.5;">' + escape(act.text || act.notes || (isVisit ? 'Visita registrada' : '')) + '</div>' +
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
        '<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:16px;">' +
          actionTile('📋', 'Briefing IA', 'Dossier estratégico pre-visita', 'var(--gpf-blue-700)', 'open-briefing') +
          actionTile('✍️', 'Informe IA', 'Notas → informe estructurado', '#7c3aed', 'open-informe') +
        '</div>' +
        /* Lista */
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">' +
          '<span class="eyebrow">Informes adjuntos</span>' +
          '<span style="font-size:12px; color:var(--fg-3);">' + reps.length + ' archivo' + (reps.length !== 1 ? 's' : '') + '</span>' +
        '</div>' +
        (reps.length === 0
          ? emptyCard('Sin informes', 'Usa "Informe IA" para generar el primero.')
          : reps.map(function (r, idx) { return reportCard(r, idx, s.id); }).join('')
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
    return (
      '<div class="card" style="padding:14px; margin-bottom:10px; border-left:4px solid var(--gpf-blue-500);">' +
        '<div style="display:flex; gap:12px; align-items:flex-start;">' +
          '<div style="font-size:2rem; flex:0 0 auto;">' + fileIcon(r.fileName) + '</div>' +
          '<div style="flex:1; min-width:0;">' +
            '<div style="font-size:14px; font-weight:600; color:var(--fg-1); margin-bottom:3px;">' + escape(r.title || 'Informe') + '</div>' +
            '<div style="font-size:12px; color:var(--fg-3);">📅 ' + escape(U.formatDateES(r.date) || '—') + '</div>' +
            (r.aiGenerated ? '<span style="display:inline-block; margin-top:4px; font-size:11px; padding:2px 8px; border-radius:8px; background:rgba(124,58,237,.15); color:#a78bfa;">✍️ IA</span>' : '') +
            (r.notes ? '<p style="font-size:12px; color:var(--fg-3); margin:6px 0 0; padding:6px; background:var(--gpf-blue-100); border-radius:6px;">' + escape(r.notes) + '</p>' : '') +
          '</div>' +
          '<button onclick="window.Screens.detail.deleteReport(\'' + escape(studioId) + '\',' + idx + ')" ' +
            'style="background:none; border:1px solid #fecaca; border-radius:6px; padding:4px 8px; cursor:pointer; font-size:12px; color:#dc2626; flex:0 0 auto;">🗑️</button>' +
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
                  (l.url_placsp || l.url ? ' <a href="' + escape(l.url_placsp || l.url) + '" target="_blank" rel="noopener" style="font-size:11px; color:var(--gpf-blue-700);">↗</a>' : '') +
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
  function openAddActivity(studioId) {
    const today = new Date().toISOString().slice(0, 10);
    showModal(modalWrap('Nueva actividad',
      field('Tipo', '<select id="m-act-type" style="' + SELECT_STYLE + '">' +
        ['llamada','email','reunion','nota','evento'].map(function (t) {
          return '<option value="' + t + '">' + (ACT_LABELS[t] || t) + '</option>';
        }).join('') +
      '</select>') +
      field('Fecha', '<input type="date" id="m-act-date" value="' + today + '" style="' + INPUT_STYLE + '">') +
      field('Descripción / Notas', '<textarea id="m-act-text" rows="4" placeholder="Qué ocurrió, próximos pasos…" ' +
        'style="' + INPUT_STYLE + ' resize:vertical; min-height:90px;"></textarea>') +
      field('Seguimiento (opcional)', '<input type="date" id="m-act-followup" style="' + INPUT_STYLE + '">'),
      '<button class="btn btn-primary btn-block" ' +
        'onclick="window.Screens.detail.saveActivity(\'' + escape(studioId) + '\')">Guardar actividad</button>'
    ));
  }

  async function saveActivity(studioId) {
    const type = document.getElementById('m-act-type').value;
    const date = document.getElementById('m-act-date').value;
    const text = (document.getElementById('m-act-text').value || '').trim();
    const followup = document.getElementById('m-act-followup').value;
    if (!text) { alert('Escribe una descripción.'); return; }
    const s = getStudio(studioId);
    const activities = arr(s && s.activities).slice();
    activities.unshift({
      id: Date.now(),
      type: type,
      text: text,
      createdAt: date ? date + 'T12:00:00Z' : new Date().toISOString(),
      followupDate: followup ? followup + 'T00:00:00Z' : null,
      studioId: studioId,
    });
    try {
      await saveDataField(studioId, 'activities', activities);
      closeModal();
      notif('Actividad guardada', 'success');
      switchTab('actividades', studioId);
    } catch (e) { alert('Error al guardar: ' + e.message); }
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
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = '✓ Guardar cambios'; }
      if (errEl) { errEl.textContent = '⚠️ Error: ' + (e.message || e); errEl.style.display = 'block'; }
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
     PANEL DE EMAIL — plantillas + historial + Mac Mail
     ============================================================ */

  // 6 plantillas personalizables para cada ocasión de venta
  /* ============================================================
     EMAIL PANEL v2
     ============================================================ */

  var _FROM_EMAIL = 'ma.fernandez@grupogpf.com';

  function _emailTemplates(s) {
    var nombre   = s.name || 'su empresa';
    var ciudad   = (typeof s.city === 'object'     ? (s.city && s.city.valor)       : s.city)     || '';
    var prov     = (typeof s.province === 'object' ? (s.province && s.province.valor) : s.province) || '';
    var loc      = ciudad || prov || 'su localidad';
    var contacto = (s.team && s.team[0] && s.team[0].name) ? s.team[0].name.split(' ')[0] : 'estimado/a';
    var saludo   = 'Estimado/a ' + contacto;
    var firma    = '\n\nUn cordial saludo,\nManuel Fernández\nFerroplast · Delegado Zona Sur\n+34 655 810 836\nma.fernandez@grupogpf.com';

    // Extraer datos del último informe de visita para enriquecer la plantilla de seguimiento
    var informeRep = null;
    var sortedReps = (s.reports || []).slice().sort(function (a, b) {
      return (b.date || b.generated_at || '') > (a.date || a.generated_at || '') ? 1 : -1;
    });
    if (sortedReps.length > 0 && sortedReps[0].report) {
      informeRep = sortedReps[0].report;
    }
    var seguimientoBody = (function () {
      if (!informeRep) {
        return saludo + ',\n\nGracias por recibirme en ' + loc + '. Tal y como comentamos, le adjunto la información solicitada sobre nuestros productos GPF.\n\nQuedo a su disposición para resolver cualquier duda técnica o para facilitar muestras físicas.\n\n¿Le parece bien que retomemos contacto la próxima semana para ver si puedo ayudarles en algún proyecto concreto?' + firma;
      }
      var temasStr = '';
      var temas = informeRep.temas_tratados || [];
      if (temas.length) temasStr = 'Repasamos temas como ' + temas.slice(0, 3).join(', ') + '.';
      var compLines = (informeRep.compromisos || []).filter(function (c) { return c && c.que; }).map(function (c) { return '• ' + c.que; });
      var compStr   = compLines.length ? '\n\nComo acordamos, le confirmo que por nuestra parte procedemos a:\n' + compLines.join('\n') : '';
      var accionStr = informeRep.proxima_accion ? '\n\n' + informeRep.proxima_accion : '';
      return saludo + ',\n\nGracias por recibirme en ' + loc + '. ' +
        (temasStr || 'Fue un placer conocernos y repasar los detalles.') +
        compStr +
        '\n\nQuedo a su disposición para cualquier duda técnica o para facilitar muestras de producto.' +
        accionStr +
        firma;
    })();

    return [
      {
        id: 'primera', icon: '👋', label: 'Primera toma de contacto',
        subject: 'Sistemas de tuberías GPF · ' + nombre,
        body: saludo + ',\n\nMe pongo en contacto con usted desde Ferroplast (Grupo GPF), empresa especializada en sistemas de tuberías y accesorios de polietileno, PVC y fundición para proyectos de infraestructura, edificación y ciclo del agua.\n\nConocemos el trabajo de ' + nombre + ' en ' + loc + ' y nos gustaría presentarles nuestro catálogo técnico y las soluciones que ofrecemos para estudios como el suyo.\n\n¿Tendría disponibilidad para una breve llamada o para recibirme en ' + loc + '? Puedo adaptar la visita a su agenda.\n\nQuedo a su disposición.' + firma,
      },
      {
        id: 'seguimiento', icon: '🔄', label: 'Seguimiento tras visita',
        subject: 'Seguimiento visita · ' + nombre,
        body: seguimientoBody,
      },
      {
        id: 'catalogo', icon: '📋', label: 'Envío de catálogo',
        subject: 'Catálogo técnico GPF · ' + nombre,
        body: saludo + ',\n\nComo le comenté, le hago llegar nuestro catálogo técnico GPF con la gama completa de tubería y accesorios de polietileno, PVC, fundición y materiales especiales.\n\nDestacamos especialmente nuestras soluciones para:\n- Redes de distribución de agua\n- Instalaciones de riego y comunidades de regantes\n- Saneamiento y pluviales\n- Sistemas de presión para edificación\n\nSi necesita fichas técnicas específicas, cálculos o muestras físicas de algún producto, no dude en pedirlo.' + firma,
      },
      {
        id: 'reunion', icon: '📅', label: 'Concertar visita',
        subject: 'Propuesta de visita técnica · ' + nombre,
        body: saludo + ',\n\nMe gustaría concertar una visita para presentarles en detalle las novedades de nuestro catálogo GPF y hablar sobre posibles proyectos en los que podamos colaborar.\n\nEstoy disponible cualquier día de la semana en ' + loc + '. ¿Qué fecha y hora le va mejor?\n\nAlternativamente, si prefiere una videollamada también puedo adaptarme.' + firma,
      },
      {
        id: 'agradecimiento', icon: '🤝', label: 'Agradecimiento reunión',
        subject: 'Gracias por la reunión · ' + nombre,
        body: saludo + ',\n\nGracias por su tiempo en la reunión de hoy. Ha sido un placer conocerles y entender mejor los proyectos en los que están trabajando.\n\nComo acordamos, les haré llegar [documentación / presupuesto / muestras] en los próximos días.\n\nQuedo a su disposición para cualquier consulta. ¡Hasta pronto!' + firma,
      },
      {
        id: 'reactivacion', icon: '💫', label: 'Reactivación',
        subject: 'Retomamos contacto · ' + nombre + ' y Ferroplast',
        body: saludo + ',\n\nHacía tiempo que no teníamos noticias mutuas y quería retomar el contacto. En Ferroplast hemos incorporado nuevos productos a nuestra gama GPF que creo que pueden interesarles.\n\nAdemás, me gustaría ponerme al día sobre los proyectos en los que estén trabajando actualmente para ver si puedo serles de utilidad.\n\n¿Podríamos hablar brevemente esta semana?' + firma,
      },
      {
        id: 'ia', icon: '✨', label: 'Redactar con IA',
        subject: '',   // Se genera con IA
        body: '',      // Idem
        esIA: true,
      },
    ];
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
    var templates = _emailTemplates(studio);
    var tpl       = templates[activeIdx] || templates[0];

    // Para la plantilla IA usamos el texto generado si está disponible
    var subject = tpl.esIA ? (iaSubject || '') : tpl.subject;
    var body    = tpl.esIA ? (iaBody    || '') : tpl.body;

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

    // Zona central — diferente para plantilla IA vs normal
    var previewZone;
    if (tpl.esIA) {
      var iaGenerado = iaSubject || iaBody;
      if (iaGenerado) {
        // Ya hay texto generado — mostrar preview + botón regenerar
        previewZone = (
          '<div style="background:var(--bg-1); border:1.5px solid var(--line); border-radius:10px; padding:14px; margin-bottom:12px;" id="ep-preview">' +
            '<div style="font-size:12px; font-weight:700; color:var(--fg-3); margin-bottom:6px;">Asunto: <span style="color:var(--fg-1); font-weight:400;" id="ep-subject">' + escape(subject) + '</span></div>' +
            '<div style="font-size:13px; color:var(--fg-1); line-height:1.6; white-space:pre-wrap; max-height:200px; overflow-y:auto;" id="ep-body">' + escape(body) + '</div>' +
          '</div>' +
          '<textarea id="ep-ia-input" placeholder="Describe qué quieres decir… ej: «recordarle que me prometió el plano del proyecto del embalse»" ' +
            'style="width:100%; box-sizing:border-box; padding:10px 12px; border:1.5px solid var(--line); border-radius:10px; font-size:13px; ' +
            'background:var(--bg-card); color:var(--fg-1); resize:none; min-height:64px; margin-bottom:10px; font-family:inherit;"></textarea>' +
          '<button class="btn btn-ghost" style="width:100%; margin-bottom:12px;" ' +
            'onclick="window.Screens.detail._emailGenerar()">' +
            '✨ Regenerar con IA' +
          '</button>'
        );
      } else {
        // Primera vez — mostrar solo el textarea
        previewZone = (
          '<div style="background:var(--bg-1); border:1.5px dashed var(--line); border-radius:10px; padding:14px; margin-bottom:12px; ' +
            'text-align:center; color:var(--fg-3); font-size:13px;" id="ep-preview">' +
            '✨ El texto del correo aparecerá aquí una vez generado con IA.' +
          '</div>' +
          '<textarea id="ep-ia-input" placeholder="Describe qué quieres decir… ej: «enviarle el catálogo de tuberías PE100 que me pidió y preguntarle por el proyecto del polígono»" ' +
            'style="width:100%; box-sizing:border-box; padding:10px 12px; border:1.5px solid var(--line); border-radius:10px; font-size:13px; ' +
            'background:var(--bg-card); color:var(--fg-1); resize:none; min-height:80px; margin-bottom:10px; font-family:inherit;"></textarea>' +
          '<button class="btn btn-primary" style="width:100%; margin-bottom:12px;" ' +
            'onclick="window.Screens.detail._emailGenerar()">' +
            '✨ Generar con IA' +
          '</button>'
        );
      }
    } else {
      previewZone = (
        '<div style="background:var(--bg-1); border:1.5px solid var(--line); border-radius:10px; padding:14px; margin-bottom:16px;" id="ep-preview">' +
          '<div style="font-size:12px; font-weight:700; color:var(--fg-3); margin-bottom:6px;">Asunto: <span style="color:var(--fg-1); font-weight:400;" id="ep-subject">' + escape(subject) + '</span></div>' +
          '<div style="font-size:13px; color:var(--fg-1); line-height:1.6; white-space:pre-wrap; max-height:200px; overflow-y:auto;" id="ep-body">' + escape(body) + '</div>' +
        '</div>'
      );
    }

    // Botones de acción — <a href="mailto:"> nativo para que Chrome lo honre siempre
    var tieneTexto = !!(subject || body);
    var copyText = subject + (subject && body ? '\n\n' : '') + body;
    var mailtoHref = (email && tieneTexto) ? escape(_mailtoUrl(email, subject, body)) : '';
    var actionBtns = (
      '<div style="display:flex; gap:10px;">' +
        (email && tieneTexto
          ? '<a href="' + mailtoHref + '" ' +
              'style="flex:1; display:flex; align-items:center; justify-content:center; gap:6px; ' +
              'background:var(--gpf-blue-700); color:#fff; border-radius:8px; padding:10px 16px; ' +
              'font-size:14px; font-weight:600; text-decoration:none; cursor:pointer;">' +
              I.Mail() + ' Abrir en Mail' +
            '</a>'
          : (email
              ? '<span class="btn btn-primary" style="flex:1; opacity:.5; text-align:center;">Sin plantilla seleccionada</span>'
              : '<span class="btn btn-primary" style="flex:1; opacity:.5; text-align:center;">Sin email registrado</span>')) +
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
        // Chips de plantilla
        '<div style="font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:var(--fg-3); margin-bottom:8px;">✍️ Plantilla</div>' +
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

  function openEmailPanel(studio) {
    window._emailPanelStudio  = studio;
    window._emailPanelActive  = 0;
    window._emailPanelIASub   = '';
    window._emailPanelIABody  = '';
    window.openSheet('<div class="handle"></div>');  // abre el sheet vacío para que la animación arranque
    _renderEmailSheet(studio, 0, '', '');
  }

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
        }
      });
    });
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
    closeModal: closeModal,
    // Actividades
    openAddActivity: openAddActivity,
    saveActivity: saveActivity,
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
    // Email panel
    _emailChip: function (idx) {
      var studio = window._emailPanelStudio;
      if (!studio) return;
      window._emailPanelActive = idx;
      var templates = _emailTemplates(studio);
      if (!templates[idx].esIA) { window._emailPanelIASub = ''; window._emailPanelIABody = ''; }
      _renderEmailSheet(studio, idx, window._emailPanelIASub || '', window._emailPanelIABody || '');
    },
    _emailGenerar: async function () {
      var studio = window._emailPanelStudio;
      if (!studio) return;
      var input = document.getElementById('ep-ia-input');
      var instruccion = input ? input.value.trim() : '';
      var preview = document.getElementById('ep-preview');
      if (preview) preview.innerHTML = '<div style="text-align:center; padding:20px; color:var(--fg-3); font-size:13px;">✨ Generando con IA…</div>';
      var nombre  = studio.name || '';
      var ciudad  = (typeof studio.city === 'object' ? (studio.city && studio.city.valor) : studio.city) || '';
      var prov    = (typeof studio.province === 'object' ? (studio.province && studio.province.valor) : studio.province) || '';
      var tipo    = studio.type || '';
      var score   = studio.score || '';
      var ctc     = (studio.team && studio.team[0]) ? (studio.team[0].name || '') + (studio.team[0].role ? ' (' + studio.team[0].role + ')' : '') : '';
      var lastAct = U.lastInteraction(studio);
      var diasSin = lastAct ? U.diasDesde(lastAct) + ' días sin contacto' : 'sin contacto registrado';
      // Buscar el último informe de visita para enriquecer el correo de seguimiento
      var ultimoInformeCtx = '';
      var repsOrdenados = (studio.reports || []).slice().sort(function (a, b) {
        return (b.date || b.generated_at || '') > (a.date || a.generated_at || '') ? 1 : -1;
      });
      if (repsOrdenados.length > 0) {
        var repObj = repsOrdenados[0];
        var repData = repObj.report || {};
        var lineas = [];
        if (repObj.date) lineas.push('Fecha visita: ' + repObj.date);
        if (repData.resumen) lineas.push('Resumen: ' + repData.resumen);
        if (repData.temas_tratados && repData.temas_tratados.length) lineas.push('Temas: ' + repData.temas_tratados.join('; '));
        if (repData.compromisos && repData.compromisos.length) lineas.push('Compromisos: ' + repData.compromisos.map(function (c) { return c.que + (c.quien ? ' (' + c.quien + ')' : ''); }).join('; '));
        if (repData.proxima_accion) lineas.push('Próxima acción: ' + repData.proxima_accion);
        if (repData.nivel_interes) lineas.push('Nivel interés: ' + repData.nivel_interes);
        if (!repData.resumen && repObj.notes_raw) lineas.push('Notas: ' + String(repObj.notes_raw).substring(0, 400));
        if (lineas.length) {
          ultimoInformeCtx = '\n\nÚLTIMO INFORME DE VISITA:\n' + lineas.join('\n');
        }
      }

      var systemPrompt = 'Eres el asistente de redacción de correos de Manuel Fernández, ' +
        'comercial de Ferroplast (Grupo GPF), que vende tuberías y accesorios de polietileno, PVC y fundición ' +
        'a estudios de arquitectura, ingenierías, comunidades de regantes y ciclo del agua en el sur de España. ' +
        'Redacta correos profesionales, directos y cercanos, en español. ' +
        'Si hay un informe de visita, úsalo para personalizar el correo con detalles reales de la reunión. ' +
        'Firma siempre como: Manuel Fernández · Ferroplast · Delegado Zona Sur · +34 655 810 836 · ma.fernandez@grupogpf.com. ' +
        'Devuelve SOLO un JSON con la forma {"subject":"...","body":"..."} sin markdown ni texto extra.';
      var userMsg = 'Redacta un correo para:\n' +
        '- Empresa: ' + nombre + ' (' + tipo + ') · ' + ciudad + ' (' + prov + ')\n' +
        (ctc ? '- Contacto: ' + ctc + '\n' : '') +
        '- Score CRM: ' + score + ' · ' + diasSin + '\n' +
        ultimoInformeCtx +
        '\n- Instrucción: ' + (instruccion || (ultimoInformeCtx ? 'correo de seguimiento personalizado tras la última visita, basándote en el informe adjunto' : 'correo de contacto genérico presentando Ferroplast GPF'));
      try {
        var Data = window.Data;
        if (!Data || !Data.callGAS) throw new Error('Data.callGAS no disponible');
        var res = await Data.callGAS('claudeProxy', {
          model: 'claude-sonnet-4-20250514', max_tokens: 1024,
          system: systemPrompt, messages: [{ role: 'user', content: userMsg }],
        });
        var raw = (res && res.content && res.content[0] && res.content[0].text) || (res && res.text) || '';
        if (res && res.error) throw new Error(typeof res.error === 'string' ? res.error : (res.error.message || 'Error IA'));
        var cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        var parsed;
        try { parsed = JSON.parse(cleaned); } catch (_) {
          var s = cleaned.indexOf('{'), e = cleaned.lastIndexOf('}');
          if (s >= 0 && e > s) parsed = JSON.parse(cleaned.slice(s, e + 1));
          else throw new Error('La IA no devolvió JSON parseable');
        }
        window._emailPanelIASub  = parsed.subject || '';
        window._emailPanelIABody = parsed.body    || '';
        _renderEmailSheet(studio, window._emailPanelActive, window._emailPanelIASub, window._emailPanelIABody);
      } catch (e) {
        if (preview) preview.innerHTML = '<div style="color:var(--mute-red-dark); font-size:13px; padding:10px;">⚠️ Error: ' + escape(e.message) + '</div>';
      }
    },
  };
})();
