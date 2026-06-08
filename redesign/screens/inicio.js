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
     DATOS — Fase G: lee de State.{studios, planificador} si están cargados.
              Fallback a mock cuando no hay datos (offline o pre-carga).
     ============================================================ */
  function getData() {
    const hasReal = State.studios && State.studios.length > 0;
    if (!hasReal) return mockData();

    return {
      visitasHoy:   computeVisitasHoy(),
      proximaVisita: computeProximaVisita(),
      tareas: computeTareas(),
      objetivos: computeObjetivos(),
    };
  }

  /* Todas las visitas programadas para HOY */
  function computeVisitasHoy() {
    if (!State.planificador || !State.planificador.schedule) return [];
    const hoyISO = State.today.toISOString().slice(0, 10);
    const arr = State.planificador.schedule[hoyISO] || [];
    return arr.map(function (v) {
      const studio = State.studiosById[v.id];
      return {
        studioId: v.id,
        name:  v.name  || (studio && studio.name)  || ('Estudio ' + v.id),
        hora:  (v.data && v.data.hora) || '',
        notas: (v.data && v.data.notas) || '',
        city:  v.city  || (studio && studio.city)  || '',
        done: _visitaRealizada(v.id, hoyISO),
      };
    });
  }

  /* Heurística: si hay un informe con fecha de hoy para ese studio, la visita está realizada */
  function _visitaRealizada(studioId, fechaISO) {
    const s = State.studiosById[studioId];
    if (!s) return false;
    return (U.reports(s) || []).some(function (r) {
      return r && r.date && r.date.slice(0, 10) === fechaISO;
    });
  }

  function computeProximaVisita() {
    if (!State.planificador || !State.planificador.schedule) return null;
    const sched = State.planificador.schedule || {};
    const hoyISO = State.today.toISOString().slice(0, 10);
    const ahora = State.today.getHours() * 60 + State.today.getMinutes();

    // 1. Buscar próxima visita de HOY que no haya pasado aún
    const hoy = sched[hoyISO] || [];
    for (const v of hoy) {
      const hora = (v.data && v.data.hora) || '';
      const [hh, mm] = hora.split(':').map(Number);
      const minutos = (isNaN(hh) ? 0 : hh * 60) + (isNaN(mm) ? 0 : mm);
      if (minutos >= ahora - 30) { // margen de 30 min para visitas "en curso"
        const studio = State.studiosById[v.id];
        const contact = (studio && studio.data && studio.data.contact) || {};
        const addr = U.readField(contact.address) || '';
        return {
          studioId: v.id,
          name: v.name || (studio && studio.name) || ('Estudio ' + v.id),
          hora: hora,
          tipo: 'Reunión',
          location: [addr || v.city || (studio && studio.city) || '',
                     v.province || (studio && studio.province) || ''].filter(Boolean).join(' · '),
          fecha: hoyISO,
          enMinutos: null,
        };
      }
    }

    // 2. Sin visitas pendientes hoy: buscar la próxima fecha futura
    const fechas = Object.keys(sched).filter(function (f) { return f > hoyISO; }).sort();
    for (const f of fechas) {
      const arr = sched[f] || [];
      if (arr.length) {
        const v = arr[0];
        const studio = State.studiosById[v.id];
        const contact = (studio && studio.data && studio.data.contact) || {};
        const addr = U.readField(contact.address) || '';
        return {
          studioId: v.id,
          name: v.name || (studio && studio.name) || ('Estudio ' + v.id),
          hora: (v.data && v.data.hora) || '',
          tipo: 'Reunión',
          location: [addr || v.city || (studio && studio.city) || '',
                     v.province || (studio && studio.province) || ''].filter(Boolean).join(' · '),
          fecha: f,
          enMinutos: null,
        };
      }
    }
    return null;
  }

  function computeTareas() {
    // Heurística: studios con priority alta o score ≥8 cuya última actividad
    // sea hace >7 días (pero <30, para no abrumar)
    const hace7 = new Date(State.today.getTime() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const hace30 = new Date(State.today.getTime() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const out = [];
    for (const s of State.studios) {
      if (out.length >= 5) break;
      const last = U.lastInteraction(s);
      if (!last) continue;
      const esPrio = s.priority === 'alta' || (s.score || 0) >= 8;
      if (!esPrio) continue;
      if (last >= hace7) continue;       // todavía caliente
      if (last < hace30) continue;       // ya muy frío, va a "enfriándose" (bandeja)
      out.push({
        studioId: s.id,
        empresa: s.name || s.id,
        tarea: 'Reactivar contacto',
        atrasada: last < new Date(State.today.getTime() - 14 * 24 * 3600 * 1000).toISOString().slice(0, 10),
        hora: U.formatDateES(last),
      });
    }
    return out;
  }

  function computeObjetivos() {
    const yyyy = State.today.getFullYear();
    let visitas = 0, mute = 0;
    for (const s of State.studios) {
      const reps = U.reports(s);
      for (const r of reps) {
        if (r && r.date && r.date.indexOf(String(yyyy)) === 0) {
          visitas++;
          // Detecta MUTE en el contenido REAL del informe (markdown, notas_raw,
          // productos estructurados…), no solo en notas/título.
          const prods = U.productosEnInforme ? U.productosEnInforme(r) : [];
          if (prods.indexOf('MUTE') >= 0) mute++;
        }
      }
    }
    return [
      { label: 'Visitas presenciales', actual: visitas, objetivo: 140, color: 'azul' },
      { label: 'Visitas MUTE',         actual: mute,    objetivo: 30,  color: 'rojo' },
    ];
  }

  function mockData() {
    return {
      visitasHoy: [
        { studioId: '3013', name: 'INGOAD – Ingeniería y Montaje',            hora: '09:30', city: 'Alcalá de Guadaíra', done: false },
        { studioId: '3012', name: 'J. Huesa Water Technology',                hora: '10:30', city: 'Bollullos',          done: false },
        { studioId: '149',  name: 'Antonio Donaire López (GIA Arquitectos)',   hora: '12:30', city: 'Sevilla',            done: false },
      ],
      proximaVisita: {
        studioId: '3013',
        name: 'INGOAD – Ingeniería y Montaje',
        hora: '09:30',
        tipo: 'Reunión',
        location: 'PI Cabeza Hermosa · Alcalá de Guadaíra',
        enMinutos: 47,
        fecha: State.today.toISOString().slice(0, 10),
      },
      tareas: [
        { studioId: '2435', empresa: 'ARRAM Consultores',         tarea: 'Conexión LinkedIn',     atrasada: true,  hora: '12:00–14:00' },
        { studioId: '13',   empresa: 'SINGULAB Arq. e Ing.',      tarea: 'Email seguimiento',     atrasada: false, hora: 'Hoy' },
        { studioId: '3027', empresa: 'Estudio Córdoba Levante',   tarea: 'Llamar a Rafael Amador', atrasada: false, hora: '16:00' },
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
    const tc = document.getElementById('topbar-current');
    if (tc) tc.textContent = 'Hoy';

    const data = getData();
    const isMobile = window.innerWidth < 700;

    v.innerHTML = isMobile
      ? renderMobileNative(data)
      : renderDesktopDemo(data);

    wireCTAs(data);
  }

  /* ============================================================
     RENDER MOBILE NATIVO (< 700px)
     Sin iphone-frame: usa el tab bar global del shell.
     Tarjeta contextual según hora del día.
     ============================================================ */
  function renderMobileNative(data) {
    const hora = State.today.getHours();
    // Antes de las 9h → modo agenda completa del día
    // 9-18h → hero próxima visita + resto del día
    // Después de 18h → resumen del día
    const modo = hora < 9 ? 'agenda' : hora >= 18 ? 'resumen' : 'campo';

    return (
      '<div style="padding: env(safe-area-inset-top, 12px) var(--sp-5) var(--sp-4); display:flex; flex-direction:column; gap:var(--sp-4);">' +
        mobileHeader(data.visitasHoy) +
        contextualCard(data, modo) +
        visitasHoySection(data.visitasHoy, data.proximaVisita) +
        tareasSection(data.tareas) +
        objetivosSection(data.objetivos) +
      '</div>'
    );
  }

  /* Header compacto mobile: fecha + saludo contextual */
  function mobileHeader(visitasHoy) {
    const fecha = State.today.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
    const fechaCap = fecha.charAt(0).toUpperCase() + fecha.slice(1);
    const n = visitasHoy ? visitasHoy.length : 0;
    const subtitulo = n > 0
      ? n + ' visita' + (n === 1 ? '' : 's') + ' hoy'
      : 'Sin visitas programadas';
    return (
      '<div style="display:flex; justify-content:space-between; align-items:flex-start; padding-top:8px;">' +
        '<div>' +
          '<div style="font-size:12px; color:var(--fg-3); font-weight:500; text-transform:uppercase; letter-spacing:.06em; margin-bottom:3px;">' +
            escape(fechaCap) +
          '</div>' +
          '<div style="font-size:26px; font-weight:800; letter-spacing:-.01em; color:var(--fg-1);">Hoy</div>' +
          '<div style="font-size:13px; color:var(--fg-3); margin-top:1px;">' + escape(subtitulo) + '</div>' +
        '</div>' +
        '<div style="width:38px; height:38px; border-radius:50%; background:var(--gpf-blue-900); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:13px;">' +
          escape(State.user.initials) +
        '</div>' +
      '</div>'
    );
  }

  /* Tarjeta contextual según hora del día */
  function contextualCard(data, modo) {
    if (modo === 'resumen') {
      // Después de las 18h: cuántas visitas hice hoy
      const total = (data.visitasHoy || []).length;
      const hechas = (data.visitasHoy || []).filter(function (v) { return v.done; }).length;
      return (
        '<div class="card" style="padding:16px; background:var(--gpf-blue-900); color:#fff; border-radius:16px;">' +
          '<div style="font-size:11px; text-transform:uppercase; letter-spacing:.06em; opacity:.7; margin-bottom:6px;">Resumen de hoy</div>' +
          '<div style="font-size:28px; font-weight:800;">' + hechas + '<span style="font-size:16px; opacity:.7;"> / ' + total + '</span></div>' +
          '<div style="font-size:13px; opacity:.8; margin-top:4px;">visitas registradas</div>' +
        '</div>'
      );
    }
    // Modo agenda (< 9h) o campo (9-18h): mostrar próxima visita hero
    return heroBlock(data.proximaVisita);
  }

  /* Lista completa de visitas de HOY */
  function visitasHoySection(visitasHoy, proximaVisita) {
    if (!visitasHoy || visitasHoy.length <= 1) return ''; // hero ya cubre si sólo hay 1
    // Si estamos en campo, el resto (excepto la primera pendiente) va en lista compacta
    const proxId = proximaVisita && proximaVisita.studioId;
    const resto = visitasHoy.filter(function (v) {
      return v.studioId !== proxId;
    });
    if (!resto.length) return '';
    const cards = resto.map(function (v) {
      const alpha = v.done ? '0.45' : '1';
      return (
        '<div onclick="showView(\'detail\', {studioId:\'' + escape(v.studioId) + '\'})" ' +
          'style="display:flex; align-items:center; gap:12px; padding:12px; ' +
          'background:var(--bg-card); border-radius:12px; cursor:pointer; opacity:' + alpha + ';">' +
          '<div style="min-width:40px; text-align:center;">' +
            '<div style="font-size:15px; font-weight:700; color:var(--gpf-blue-700); font-family:var(--font-mono);">' +
              (v.hora || '—') +
            '</div>' +
          '</div>' +
          '<div style="flex:1; min-width:0;">' +
            '<div style="font-size:14px; font-weight:600; color:var(--fg-1); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' +
              escape(v.name) +
            '</div>' +
            (v.city ? '<div style="font-size:12px; color:var(--fg-3); margin-top:2px;">' + escape(v.city) + '</div>' : '') +
          '</div>' +
          (v.done
            ? '<span style="font-size:18px;">✅</span>'
            : '<span style="color:var(--fg-3);">' + I.ChevronRight() + '</span>') +
        '</div>'
      );
    }).join('');
    return (
      '<section>' +
        '<div style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.06em; color:var(--fg-3); margin-bottom:8px;">Resto del día</div>' +
        '<div style="display:flex; flex-direction:column; gap:6px;">' + cards + '</div>' +
      '</section>'
    );
  }

  /* ============================================================
     RENDER DESKTOP (≥ 700px) — layout real de 2 columnas
     ============================================================ */
  function renderDesktopDemo(data) {
    return (
      '<div style="max-width:1100px;">' +
        /* Cabecera */
        '<div style="margin-bottom:24px;">' +
          headerRow() +
        '</div>' +
        /* Grid principal: hero (izq) + visitas/tareas (der) */
        '<div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; align-items:start;">' +
          '<div>' +
            heroBlock(data.proximaVisita) +
          '</div>' +
          '<div style="display:flex; flex-direction:column; gap:20px;">' +
            visitasHoySection(data.visitasHoy, data.proximaVisita) +
            tareasSection(data.tareas) +
          '</div>' +
        '</div>' +
        /* Objetivos — ancho completo */
        '<div style="margin-top:20px;">' +
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
      { id: 'planificador', label: 'Visitas',  icon: I.Calendar() },
      { id: 'studios',      label: 'Empresas', icon: I.Building() },
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
