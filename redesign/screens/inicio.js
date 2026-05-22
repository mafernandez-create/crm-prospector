/* CRM Prospector · rediseño v1 · Fase C1 — Pantalla "Hoy" (iPhone-first)
 *
 * Origen: handoff mobile-screens.jsx · ScreenInicio
 *
 * Estructura iPhone (390×844):
 *   - StatusBar (9:41 + signal + wifi + battery)
 *   - Header (eyebrow día + h1 "HOY" + avatar circular)
 *   - Próxima visita hero (azul oscuro + halo + CTA rojo "Cómo llegar")
 *   - Sección "Tareas · N pendientes" (cards con border-left)
 *   - Sección "Objetivos · mes" (card con 2 progress bars)
 *   - TabBar (4 tabs, activo "Hoy")
 *   - Home indicator
 *
 * Datos: por ahora mock fijo. Wireado real en Fase G.
 */
(function () {
  'use strict';

  const I = window.Icon;
  const State = window.State;
  const U = window.Util;
  const escape = U.escapeHtml;

  /* ============================================================
     DATOS — Fase C usa mock. Fase G los sustituirá por lecturas reales.
     ============================================================ */
  function mockData() {
    return {
      proximaVisita: {
        studioId: '3012',
        name: 'J. Huesa Water Technology',
        hora: '10:30',
        tipo: 'Reunión',
        location: 'Av. Valencina 25 · Bollullos',
        enMinutos: 47,
      },
      tareas: [
        { studioId: '2435', empresa: 'ARRAM Consultores',         tarea: 'Conexión LinkedIn',        atrasada: true,  hora: '12:00–14:00' },
        { studioId: '13',   empresa: 'SINGULAB Arq. e Ing.',      tarea: 'Email seguimiento',         atrasada: false, hora: 'Hoy' },
        { studioId: '3027', empresa: 'Estudio Córdoba Levante',   tarea: 'Llamar a Rafael Amador',    atrasada: false, hora: '16:00' },
      ],
      objetivos: [
        { label: 'Visitas presenciales', actual: 109, objetivo: 140, color: 'azul' },
        { label: 'Visitas MUTE',         actual: 4,   objetivo: 30,  color: 'rojo' },
      ],
    };
  }

  /* ============================================================
     RENDER
     ============================================================ */
  function render() {
    const v = document.getElementById('view-inicio');
    if (!v) return;
    document.getElementById('topbar-current').textContent = 'Hoy';

    const data = mockData();
    const isMobile = window.innerWidth < 768;

    v.innerHTML = isMobile
      ? renderMobile(data)
      : renderDesktopColumn(data);

    // Wire CTAs
    wireCTAs(data);
  }

  /* ============================================================
     RENDER MOBILE (iPhone-first, exacto al prototipo)
     ============================================================ */
  function renderMobile(data) {
    return (
      '<div class="iphone-frame">' +
        statusBar() +
        '<div style="padding:8px var(--sp-5) var(--sp-4);">' +
          headerRow() +
        '</div>' +
        '<div style="flex:1; overflow:auto; padding:0 var(--sp-5) 100px; display:flex; flex-direction:column; gap:var(--sp-4);">' +
          heroBlock(data.proximaVisita) +
          tareasSection(data.tareas) +
          objetivosSection(data.objetivos) +
        '</div>' +
        tabBar() +
        '<div class="home-indicator"></div>' +
      '</div>'
    );
  }

  /* ============================================================
     RENDER DESKTOP (mismo contenido, columna centrada sin chrome iPhone)
     ============================================================ */
  function renderDesktopColumn(data) {
    return (
      '<div style="max-width:560px; margin:0 auto;">' +
        '<div style="margin-bottom:var(--sp-5);">' +
          headerRow() +
        '</div>' +
        '<div style="display:flex; flex-direction:column; gap:var(--sp-4);">' +
          heroBlock(data.proximaVisita) +
          tareasSection(data.tareas) +
          objetivosSection(data.objetivos) +
        '</div>' +
      '</div>'
    );
  }

  /* ============================================================
     BLOQUES REUTILIZABLES
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

  function headerRow() {
    const fecha = State.today.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
    const fechaCap = fecha.charAt(0).toUpperCase() + fecha.slice(1);
    return (
      '<div style="display:flex; justify-content:space-between; align-items:flex-start;">' +
        '<div>' +
          '<div class="eyebrow" style="margin-bottom:4px;">' + escape(fechaCap) + '</div>' +
          '<h1 style="font-size:32px; text-transform:uppercase; letter-spacing:0.005em; margin:0;">Hoy</h1>' +
        '</div>' +
        '<div style="width:40px; height:40px; border-radius:50%; background:var(--gpf-blue-900); color:#fff; display:flex; align-items:center; justify-content:center; font-family:var(--font-display); font-weight:600; font-size:14px; letter-spacing:0.02em;">' +
          escape(State.user.initials) +
        '</div>' +
      '</div>'
    );
  }

  function heroBlock(pv) {
    if (!pv) {
      return (
        '<div class="next-visit-hero" style="background:var(--paper-warm); color:var(--fg-2); border:1px solid var(--line);">' +
          '<div style="position:static;">' +
            '<div class="eyebrow" style="margin-bottom:8px;">Próxima visita</div>' +
            '<h2 style="color:var(--fg-2); font-size:22px;">Sin visitas programadas</h2>' +
            '<p style="margin:8px 0 0; font-size:14px; color:var(--fg-3);">No hay próximas visitas. Programa una desde el Planificador.</p>' +
          '</div>' +
        '</div>'
      );
    }
    const tiempoLabel = pv.enMinutos != null
      ? `en ${pv.enMinutos} min`
      : (pv.fecha ? U.formatDateES(pv.fecha) : '');
    return (
      '<div class="next-visit-hero">' +
        '<div class="eyebrow-light">' +
          '<span class="icon-sm">' + I.Target() + '</span>' +
          ' Próxima visita' + (tiempoLabel ? ' · ' + escape(tiempoLabel) : '') +
        '</div>' +
        '<h2 class="h2" style="font-size:26px;">' + escape(pv.name) + '</h2>' +
        '<div class="meta">' +
          '<span class="icon-sm">' + I.Clock() + '</span> ' +
          escape(pv.hora) + ' · ' + escape(pv.tipo) +
        '</div>' +
        '<div class="meta" style="margin-bottom:18px;">' +
          '<span class="icon-sm">' + I.MapPin() + '</span> ' +
          escape(pv.location) +
        '</div>' +
        '<button class="btn btn-strong btn-block btn-lg" style="box-shadow:0 4px 14px rgba(200,16,46,.35);" ' +
          'data-action="como-llegar" data-studio="' + escape(pv.studioId) + '">' +
          I.Navigation() + ' Cómo llegar' +
        '</button>' +
      '</div>'
    );
  }

  function tareasSection(tareas) {
    if (!tareas || !tareas.length) {
      return (
        '<section>' +
          '<div style="display:flex; align-items:baseline; justify-content:space-between; margin-bottom:10px;">' +
            '<span class="eyebrow">Tareas</span>' +
          '</div>' +
          '<div class="card" style="padding:24px; text-align:center; color:var(--fg-3); font-size:14px;">' +
            'Sin tareas pendientes hoy.' +
          '</div>' +
        '</section>'
      );
    }
    const cards = tareas.map(function (t) {
      const borderColor = t.atrasada ? 'var(--mute-red)' : 'var(--line)';
      return (
        '<div class="card" style="padding:14px; display:flex; align-items:center; gap:12px; min-height:64px; border-left:3px solid ' + borderColor + '; cursor:pointer;" ' +
        'data-action="open-detail" data-studio="' + escape(t.studioId) + '">' +
          '<div style="flex:1; min-width:0;">' +
            '<div style="font-weight:600; font-size:15px; color:var(--fg-1); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' +
              escape(t.empresa) +
            '</div>' +
            '<div style="font-size:13px; color:var(--fg-3); display:flex; gap:8px; align-items:center; margin-top:2px;">' +
              (t.atrasada
                ? '<span style="color:var(--mute-red-dark); font-weight:600;">Atrasada</span><span>·</span>'
                : '') +
              '<span>' + escape(t.tarea) + '</span>' +
            '</div>' +
          '</div>' +
          '<div style="font-size:12px; color:var(--fg-3); font-family:var(--font-mono);">' + escape(t.hora) + '</div>' +
          '<span class="icon-sm" style="color:var(--fg-muted);">' + I.ChevronRight() + '</span>' +
        '</div>'
      );
    }).join('');
    return (
      '<section>' +
        '<div style="display:flex; align-items:baseline; justify-content:space-between; margin-bottom:10px;">' +
          '<span class="eyebrow">Tareas · ' + tareas.length + ' pendiente' + (tareas.length === 1 ? '' : 's') + '</span>' +
          '<a href="#bandeja" style="font-size:13px; color:var(--gpf-blue-700); font-weight:600; text-decoration:none;" ' +
             'onclick="event.preventDefault(); showView(\'bandeja\')">Ver todas</a>' +
        '</div>' +
        '<div style="display:flex; flex-direction:column; gap:8px;">' + cards + '</div>' +
      '</section>'
    );
  }

  function objetivosSection(objetivos) {
    const mes = State.today.toLocaleString('es-ES', { month: 'long' });
    const rows = objetivos.map(function (o, i) {
      const pct = Math.min(100, Math.round((o.actual / o.objetivo) * 100));
      return (
        (i > 0 ? '<div style="border-top:1px solid var(--line); margin-top:14px; padding-top:14px;"></div>' : '') +
        '<div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:6px;">' +
          '<span style="font-size:14px; color:var(--fg-2); font-weight:500;">' + escape(o.label) + '</span>' +
          '<span class="t-num" style="font-size:18px;">' + o.actual +
            '<span style="color:var(--fg-3); font-size:13px;"> / ' + o.objetivo + '</span>' +
          '</span>' +
        '</div>' +
        '<div class="progress">' +
          '<div class="fill ' + (o.color === 'rojo' ? 'red' : '') + '" style="width:' + pct + '%;"></div>' +
        '</div>'
      );
    }).join('');

    return (
      '<section>' +
        '<span class="eyebrow" style="display:block; margin-bottom:10px;">Objetivos · ' + escape(mes) + '</span>' +
        '<div class="card" style="padding:16px;">' + rows + '</div>' +
      '</section>'
    );
  }

  function tabBar() {
    const tabs = [
      { id: 'inicio',   label: 'Hoy',     icon: I.Home() },
      { id: 'studios',  label: 'Visitas', icon: I.Calendar() },
      { id: 'studios',  label: 'Empresas',icon: I.Building() },
      { id: 'bandeja',  label: 'Bandeja', icon: I.Layers() },
    ];
    // Marcamos "Hoy" como activo (estamos en inicio)
    const activeIdx = 0;
    return (
      '<div class="tabbar">' +
        tabs.map(function (t, i) {
          return (
            '<a class="tab ' + (i === activeIdx ? 'active' : '') + '" href="#' + t.id + '" ' +
              'onclick="event.preventDefault(); showView(\'' + t.id + '\')">' +
              '<span class="icon icon-lg">' + t.icon + '</span>' +
              '<span class="lbl">' + escape(t.label) + '</span>' +
            '</a>'
          );
        }).join('') +
      '</div>'
    );
  }

  /* ============================================================
     CTAs — event delegation
     ============================================================ */
  function wireCTAs(data) {
    const v = document.getElementById('view-inicio');
    if (!v) return;
    v.querySelectorAll('[data-action]').forEach(function (el) {
      const action = el.getAttribute('data-action');
      const studioId = el.getAttribute('data-studio');
      el.addEventListener('click', function () {
        if (action === 'como-llegar') {
          // Si la pantalla "Cómo llegar" (Fase C3) está disponible, abrirla
          if (window.Screens.comollegar && window.Screens.comollegar.open) {
            window.Screens.comollegar.open(studioId);
          } else {
            // Stub: mostrar alert con los datos
            const pv = data.proximaVisita;
            alert('Cómo llegar a ' + pv.name + '\n' + pv.location + '\n\n(Bottom sheet con Apple/Google/Waze pendiente de Fase C3)');
          }
        } else if (action === 'open-detail') {
          if (studioId) window.showView('detail', { studioId: studioId });
        }
      });
    });
  }

  /* ============================================================
     REGISTRO EN window.Screens
     ============================================================ */
  window.Screens = window.Screens || {};
  window.Screens.inicio = { render: render };
})();
