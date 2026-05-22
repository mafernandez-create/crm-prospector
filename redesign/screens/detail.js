/* CRM Prospector · rediseño v1 · Fase C2 — Ficha del cliente (iPhone-first)
 *
 * Origen: handoff mobile-screens.jsx · ScreenFicha
 *
 * Estructura iPhone (390×844):
 *   - StatusBar
 *   - TopAppBar: ← Atrás · "Ficha cliente" · ✎ Editar
 *   - Content scrollable:
 *     · Identidad: avatar 56×56 + h2 nombre + chips (tipo, cuadrante, [prioridad])
 *     · Bloque dirección azul-claro: icono MapPin + dirección + CTA strong "Cómo llegar"
 *     · Grid 2 cols: Llamar (tel:) + Email (mailto:)
 *     · Briefing preview: eyebrow + timestamp + card con resumen + CTA primary "Leer briefing"
 *     · Tabla datos clave (Comercial, Técnico, Prioridad, Creado)
 *     · CTA bottom block: "Redactar informe de visita"
 *   - Home indicator
 *
 * Datos: por ahora mock catalog. Fase G sustituirá por lecturas de
 *        State.studiosById[currentStudioId] vía Firestore.
 */
(function () {
  'use strict';

  const I = window.Icon;
  const State = window.State;
  const U = window.Util;
  const escape = U.escapeHtml;

  /* ============================================================
     MOCK CATALOG (Fase C2)
     ============================================================ */
  const MOCK = {
    '3012': {
      id: '3012',
      name: 'J. Huesa Water Technology',
      type: 'ARQ',
      cuadrante: 'Q9',
      priority: null,
      city: 'Bollullos de la Mitación',
      province: 'Sevilla',
      address: 'Av. Valencina 25',
      phone: '+34 955 600 808',
      email: 'jhuesa@jhuesa.com',
      web: 'jhuesa.com',
      comercial: 'Manuel Sayago',
      tecnico: 'Rafael Amador',
      createdAt: '2026-05-07',
      briefingPreview: 'Empresa de arquitectura en Bollullos. Cuadrante Q9 — primera reunión. Sin historial previo. Foco esperado: presentación MUTE y BIOPIPE para proyecto en redacción.',
      briefingFecha: '22 may 2026',
    },
    '2435': {
      id: '2435',
      name: 'ARRAM Consultores',
      type: 'ING',
      cuadrante: 'Q4',
      priority: 'alta',
      city: 'Badajoz',
      province: 'Badajoz',
      address: 'Av. Sinforiano Madroñero 5',
      phone: '+34 924 244 200',
      email: 'arram@arram.es',
      web: 'arram.es',
      comercial: 'Manuel Fernández',
      tecnico: 'Joseba Robles',
      createdAt: '2026-03-10',
      briefingPreview: 'Consultora extremeña con histórico en proyectos PRTR. Cuadrante Q4 (puerta de entrada). Pendiente reactivar tras conexión LinkedIn aceptada.',
      briefingFecha: '21 may 2026',
    },
    // Fallback si llega un id desconocido: mostramos J. Huesa con un aviso
  };

  function getStudio(id) {
    // Preferimos datos reales (Fase G), si no, fallback mock
    if (State.studiosById && State.studiosById[id]) {
      return normalizarReal(State.studiosById[id]);
    }
    if (MOCK[id]) return MOCK[id];
    return null;
  }

  function normalizarReal(s) {
    const contact = (s.data && s.data.contact) || {};
    return {
      id: s.id,
      name: s.name || s.id,
      type: s.type,
      cuadrante: s.cuadrante || s.quadrant,
      priority: s.priority,
      city: s.city,
      province: s.province,
      address: U.readField(contact.address),
      phone: U.readField(contact.phone),
      email: U.readField(contact.email),
      web: U.readField(contact.web),
      comercial: s.comercialAsignado || s.comercial || '—',
      tecnico: s.tecnicoAsignado || s.tecnico || '—',
      createdAt: s.createdAt,
      briefingPreview: null,  // async fetch en Fase G
      briefingFecha: null,
    };
  }

  /* ============================================================
     LABELS LEGIBLES
     ============================================================ */
  const TIPO_LABELS = {
    ARQ: 'Arquitectura',
    ING: 'Ingeniería',
    CCRR: 'Comunidad de Regantes',
    OCV: 'Promotora · Constructora',
    CICA: 'Ciclo del agua',
    AAPP: 'Admin. Pública',
  };
  const CUADRANTE_LABELS = {
    Q1: 'Q1 · Estratégico',
    Q2: 'Q2 · Cliente core',
    Q3: 'Q3 · Cliente volumen',
    Q4: 'Q4 · Puerta de entrada',
    Q5: 'Q5 · Cartera estándar',
    Q6: 'Q6 · Mantenimiento',
    Q7: 'Q7 · Conector',
    Q8: 'Q8 · Seguimiento ligero',
    Q9: 'Q9 · Congelar',
  };

  /* ============================================================
     RENDER
     ============================================================ */
  function render(params) {
    const v = document.getElementById('view-detail');
    if (!v) return;

    const id = (params && params.studioId) || State.currentStudioId || '3012';
    const studio = getStudio(id);

    document.getElementById('topbar-current').textContent =
      studio ? studio.name : 'Ficha cliente';

    if (!studio) {
      v.innerHTML = emptyState(id);
      return;
    }

    State.currentStudioId = studio.id;
    const isMobile = window.innerWidth < 768;

    v.innerHTML = isMobile
      ? renderMobile(studio)
      : renderDesktopColumn(studio);

    wireCTAs(studio);
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
        '<button class="btn btn-ghost btn-block" onclick="showView(\'studios\')">' + I.Building() + ' Ver listado de empresas</button>' +
      '</div>'
    );
  }

  /* ============================================================
     MOBILE (iPhone exact)
     ============================================================ */
  function renderMobile(s) {
    return (
      '<div class="iphone-frame">' +
        statusBar() +
        topAppBar(s) +
        '<div style="flex:1; overflow:auto; padding:16px var(--sp-5) 100px; display:flex; flex-direction:column; gap:18px;">' +
          identidadBlock(s) +
          briefingPreview(s) +
          datosClaveBlock(s) +
          ctaBottom(s) +
        '</div>' +
        '<div class="home-indicator"></div>' +
      '</div>'
    );
  }

  function renderDesktopColumn(s) {
    return (
      '<div style="max-width:560px; margin:0 auto;">' +
        '<div style="margin-bottom:24px; display:flex; align-items:center; gap:12px;">' +
          '<button class="back-btn" onclick="history.back()">' +
            I.ArrowLeft() + ' <span>Atrás</span>' +
          '</button>' +
          '<span style="flex:1;"></span>' +
          '<button class="action-btn" aria-label="Editar ficha">' + I.Edit() + '</button>' +
        '</div>' +
        '<div style="display:flex; flex-direction:column; gap:18px;">' +
          identidadBlock(s) +
          briefingPreview(s) +
          datosClaveBlock(s) +
          ctaBottom(s) +
        '</div>' +
      '</div>'
    );
  }

  /* ============================================================
     BLOQUES
     ============================================================ */
  function statusBar() {
    return (
      '<div class="statusbar">' +
        '<span style="font-variant-numeric:tabular-nums; font-weight:600; font-size:15px;">9:41</span>' +
        '<span class="right">' +
          '<span class="icon" style="width:17px; height:11px;">' + I.Signal() + '</span>' +
          '<span class="icon" style="width:15px; height:11px;">' + I.Wifi() + '</span>' +
          '<span class="icon" style="width:25px; height:12px;">' + I.Battery() + '</span>' +
        '</span>' +
      '</div>'
    );
  }

  function topAppBar(s) {
    return (
      '<div class="topapp">' +
        '<button class="back-btn" onclick="showView(\'inicio\')">' +
          I.ArrowLeft() + ' <span>Atrás</span>' +
        '</button>' +
        '<span class="title">Ficha cliente</span>' +
        '<button class="action-btn" aria-label="Editar ficha">' + I.Edit() + '</button>' +
      '</div>'
    );
  }

  function identidadBlock(s) {
    const fullAddr = [s.address, s.city, s.province].filter(Boolean).join(', ');
    const initials = U.studioInitials(s.name);
    const tipoLabel = TIPO_LABELS[s.type] || (s.type || '—');
    const cuadranteLabel = CUADRANTE_LABELS[s.cuadrante] || (s.cuadrante || '—');

    return (
      '<div>' +
        // Avatar + nombre + chips
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
            '<div style="display:flex; gap:6px; margin-top:6px; flex-wrap:wrap;">' +
              '<span class="chip chip-accent">' + escape(tipoLabel) + '</span>' +
              '<span class="chip">' + escape(cuadranteLabel) + '</span>' +
              (s.priority === 'alta'
                ? '<span class="chip chip-red">Alta prioridad</span>'
                : '') +
            '</div>' +
          '</div>' +
        '</div>' +

        // Dirección + CTA destacado
        (fullAddr ? (
          '<div style="background:var(--gpf-blue-100); border-radius:12px; padding:14px; margin-bottom:10px; border:1px solid #c7dcef;">' +
            '<div style="display:flex; gap:10px; align-items:flex-start; margin-bottom:12px;">' +
              '<span style="color:var(--gpf-blue-700); margin-top:2px;">' + I.MapPin() + '</span>' +
              '<div style="flex:1;">' +
                '<div style="font-size:15px; font-weight:600; color:var(--gpf-blue-900); line-height:1.3;">' +
                  escape(s.address || '—') +
                '</div>' +
                '<div style="font-size:14px; color:var(--gpf-blue-700);">' +
                  escape([s.city, s.province].filter(Boolean).join(' · ')) +
                '</div>' +
              '</div>' +
            '</div>' +
            '<button class="btn btn-strong btn-block btn-lg" style="box-shadow:0 4px 14px rgba(200,16,46,.30);" ' +
              'data-action="como-llegar">' +
              I.Navigation() + ' Cómo llegar' +
            '</button>' +
          '</div>'
        ) : '') +

        // Contacto rápido
        (s.phone || s.email
          ? '<div style="display:grid; grid-template-columns:' + (s.phone && s.email ? '1fr 1fr' : '1fr') + '; gap:8px;">' +
            (s.phone
              ? '<a class="btn btn-ghost" style="height:52px;" href="tel:' + escape(s.phone.replace(/[^\d+]/g, '')) + '">' +
                I.Phone() + ' Llamar' + '</a>'
              : '') +
            (s.email
              ? '<a class="btn btn-ghost" style="height:52px;" href="mailto:' + escape(s.email) + '">' +
                I.Mail() + ' Email' + '</a>'
              : '') +
            '</div>'
          : '') +
      '</div>'
    );
  }

  function briefingPreview(s) {
    return (
      '<section>' +
        '<div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:8px;">' +
          '<span class="eyebrow">Briefing pre-visita</span>' +
          (s.briefingFecha
            ? '<span style="font-size:12px; color:var(--fg-3); font-family:var(--font-mono);">Generado ' + escape(s.briefingFecha) + '</span>'
            : '') +
        '</div>' +
        '<div class="card" style="padding:16px;">' +
          '<div style="font-size:15px; line-height:1.5; color:var(--fg-2); margin-bottom:12px;">' +
            (s.briefingPreview
              ? escape(s.briefingPreview)
              : '<span style="color:var(--fg-3);">Sin briefing previo. Genera uno con IA cuando vayas a visitar este cliente.</span>'
            ) +
          '</div>' +
          '<button class="btn btn-primary" style="width:100%;" data-action="open-briefing">' +
            I.FileText() + ' Leer briefing completo' +
          '</button>' +
        '</div>' +
      '</section>'
    );
  }

  function datosClaveBlock(s) {
    return (
      '<section>' +
        '<span class="eyebrow" style="display:block; margin-bottom:8px;">Equipo</span>' +
        '<div class="card" style="padding:4px 0;">' +
          row('Comercial', escape(s.comercial || '—')) +
          row('Técnico', escape(s.tecnico || '—')) +
          row('Prioridad',
            s.priority === 'alta'
              ? '<span class="chip chip-red">Alta</span>'
              : '<span style="color:var(--fg-3);">' + escape(s.priority || 'Bajo') + '</span>') +
          row('Creado', escape(U.formatDateES(s.createdAt) || '—'), true) +
        '</div>' +
      '</section>'
    );
  }

  function row(label, valueHtml, last) {
    return (
      '<div class="row"' + (last ? ' style="border-bottom:0;"' : '') + '>' +
        '<span class="label">' + label + '</span>' +
        '<span class="value">' + valueHtml + '</span>' +
      '</div>'
    );
  }

  function ctaBottom(s) {
    return (
      '<button class="btn btn-primary btn-block" style="height:54px;" data-action="open-informe">' +
        I.Edit() + ' Redactar informe de visita' +
      '</button>'
    );
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
        if (action === 'como-llegar') {
          e.preventDefault();
          if (window.Screens.comollegar && window.Screens.comollegar.open) {
            window.Screens.comollegar.open(studio.id);
          } else {
            // Stub Fase C2: alert con los datos
            alert('Cómo llegar a ' + studio.name + '\n' +
                  [studio.address, studio.city, studio.province].filter(Boolean).join(', ') +
                  '\n\n(Bottom sheet con Apple/Google/Waze pendiente de Fase C3)');
          }
        } else if (action === 'open-briefing') {
          window.showView('briefing', { studioId: studio.id });
        } else if (action === 'open-informe') {
          window.showView('informe', { studioId: studio.id });
        }
      });
    });
  }

  /* ============================================================
     EXPORT
     ============================================================ */
  window.Screens = window.Screens || {};
  window.Screens.detail = { render: render };
})();
