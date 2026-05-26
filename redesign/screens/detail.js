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
          /* Botón cambiar estado */
          '<button data-action="change-status" style="flex:0 0 auto; background:none; border:1px solid var(--line); ' +
            'border-radius:8px; padding:6px 10px; font-size:12px; color:var(--fg-3); cursor:pointer;">' +
            '⇄ Estado' +
          '</button>' +
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
          '<button class="btn btn-ghost" style="height:30px; font-size:12px; padding:0 10px;" ' +
            'onclick="window.Screens.detail.openEditContact(\'' + escape(s.id) + '\')">✏️ Editar</button>' +
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

  /* ============================================================
     CTAs
     ============================================================ */
  function wireCTAs(studio) {
    const v = document.getElementById('view-detail');
    if (!v) return;
    v.querySelectorAll('[data-action]').forEach(function (el) {
      const action = el.getAttribute('data-action');
      el.addEventListener('click', function (e) {
        e.preventDefault();
        if (action === 'email') {
          const email = el.getAttribute('data-email') || '';
          // Intentar abrir cliente de correo
          window.open('mailto:' + email);
          // Copiar al portapapeles como fallback
          if (navigator.clipboard) {
            navigator.clipboard.writeText(email).then(function () {
              window.showNotification('📋 Email copiado: ' + email, 'success');
            }).catch(function () {});
          }
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
        }
      });
    });
  }

  /* ============================================================
     GENERACIÓN BRIEFING IA
     ============================================================ */
  async function regenerarBriefingIA(studio) {
    if (!window.Data || !window.Data.generateBriefing) { alert('Capa de datos no disponible.'); return; }
    const fecha = prompt('Fecha de la visita (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
    if (!fecha) return;
    const contexto = prompt('Contexto extra (opcional):', '') || '';
    if (window.States && window.States.showLoading) {
      window.States.showLoading('view-detail', {
        title: 'Generando briefing con IA',
        sub: 'Analizando licitaciones, red profesional y compromisos…',
      });
    }
    try {
      const res = await window.Data.generateBriefing(studio.id, fecha, contexto);
      if (res && (res.success || res.ok || res.briefing)) {
        render({ studioId: studio.id });
        setTimeout(function () { window.showView('briefing', { studioId: studio.id }); }, 300);
      } else {
        throw new Error((res && (res.error || res.message)) || 'Respuesta no reconocida');
      }
    } catch (e) {
      console.error('[redesign/detail] error briefing:', e);
      if (window.States && window.States.showError) {
        window.States.showError('view-detail', {
          title: 'No se pudo generar el briefing',
          body: 'El servidor no respondió. Inténtalo de nuevo.',
          detail: (e.message || '').slice(0, 200),
          ctas: [{ label: 'Volver', onclick: 'window.Screens.detail.render({ studioId: \'' + studio.id + '\' })' }],
        });
      }
    }
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
    // Briefing IA
    regenerarBriefingIA: regenerarBriefingIA,
  };
})();
