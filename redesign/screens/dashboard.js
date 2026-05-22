/* CRM Prospector · rediseño v1 · Fase D1+D2 — Desktop Dashboard
 *
 * Origen: handoff desktop-screens.jsx · DesktopDashboard (1280) + Desktop900
 *
 * Estructura:
 *   - Title row (eyebrow fecha + h1 DASHBOARD + chips filtro + botón filter)
 *   - KPI strip (5 cols, colapsa a 3 cols en <1000px)
 *   - Main split (1.6fr 1fr):
 *     · Card "Objetivos 2026 · bloque individual" con % grande + 5 rows
 *       cada uno con barra de progreso + valor x/y
 *     · Sub-columna: card próxima visita azul oscuro + card "Atrasados"
 *
 * Responsive: <1000px sidebar colapsada (CSS) + KPI 3 cols + en <700px
 * mobile pure (sin sidebar/topbar via @media).
 *
 * Datos: mock fijo Fase D. Fase G wireará cálculos reales sobre State.studios.
 */
(function () {
  'use strict';

  const I = window.Icon;
  const State = window.State;
  const U = window.Util;
  const escape = U.escapeHtml;

  /* ============================================================
     DATOS — Fase G: computa de State.studios si está cargado.
              Fallback a mock cuando no hay datos.
     ============================================================ */
  function getMetrics() {
    const hasReal = State.studios && State.studios.length > 0;
    if (!hasReal) return mockMetrics();

    const totalEmpresas = State.studios.length;
    const ganados      = State.studios.filter(function (s) { return s.status === 'ganado'; }).length;
    const enReunion    = State.studios.filter(function (s) { return s.status === 'reunion'; }).length;
    const nuevos       = State.studios.filter(function (s) { return s.status === 'nuevo'; }).length;
    const prioridadAlta = State.studios.filter(function (s) { return s.priority === 'alta'; }).length;

    // Atrasos: alta priority o score≥8 con últ. activ. >14 días
    const hace14 = new Date(State.today.getTime() - 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const hace45 = new Date(State.today.getTime() - 45 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const sinContacto14 = State.studios.filter(function (s) {
      const last = U.lastInteraction(s);
      return last && last < hace14 && (s.priority === 'alta' || (s.score || 0) >= 8);
    }).length;

    // Objetivos del año actual
    const yyyy = State.today.getFullYear();
    let visitas = 0, mute = 0;
    for (const s of State.studios) {
      for (const r of U.reports(s)) {
        if (r && r.date && r.date.indexOf(String(yyyy)) === 0) {
          visitas++;
          const txt = ((r.notes || '') + ' ' + (r.title || '') + ' ' + (r.fileName || '')).toUpperCase();
          if (txt.indexOf('MUTE') >= 0) mute++;
        }
      }
    }

    const proxima = pickProximaVisita();
    const atrasados = pickAtrasos();

    return {
      totalEmpresas: totalEmpresas,
      ganados: ganados,
      enReunion: enReunion,
      nuevos1349: nuevos,
      prioridadAlta: prioridadAlta,
      sinContacto14: sinContacto14,
      objetivos2026Pct: Math.round(((visitas / 140) + (mute / 30)) / 2 * 100),
      objetivos: [
        { l: 'Visitas presenciales',  current: visitas, target: 140, peso: '10%', tag: Math.round(visitas / 140 * 100) + '%', color: 'azul' },
        { l: 'Visitas MUTE',          current: mute,    target: 30,  peso: '10%', tag: Math.round(mute / 30 * 100) + '%',     color: 'rojo' },
        { l: 'Ponencias en colegios', current: 0,       target: 2,   peso: '5%',  tag: '0%',                                    color: 'gris' },
        { l: 'Catálogo MUTE',         current: '—',     target: '1 entregable', peso: '30%', tag: 'Pendiente',                  color: 'rojo-dark' },
        { l: 'Soporte técnico',       current: 0,       target: 'registros',    peso: '30%', tag: '0',                          color: 'gris' },
      ],
      proximaVisita: proxima,
      atrasados: atrasados,
    };
  }

  function pickProximaVisita() {
    if (!State.planificador || !State.planificador.schedule) return null;
    const sched = State.planificador.schedule || {};
    const hoyISO = State.today.toISOString().slice(0, 10);
    const fechas = Object.keys(sched).filter(function (f) { return f >= hoyISO; }).sort();
    for (const f of fechas) {
      const arr = sched[f] || [];
      if (arr.length) {
        const v = arr[0];
        const studio = State.studiosById[v.id];
        return {
          studioId: v.id,
          name: v.name || (studio && studio.name) || ('Estudio ' + v.id),
          hora: (v.data && v.data.hora) || '',
          location: [v.city || (studio && studio.city) || '',
                     v.province || (studio && studio.province) || ''].filter(Boolean).join(' · ') || 'Sin ubicación',
        };
      }
    }
    return null;
  }

  function pickAtrasos() {
    const hace14 = new Date(State.today.getTime() - 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const out = [];
    for (const s of State.studios) {
      if (out.length >= 3) break;
      const last = U.lastInteraction(s);
      if (!last) continue;
      if (last >= hace14) continue;
      if (!(s.priority === 'alta' || (s.score || 0) >= 8)) continue;
      const dias = U.diasDesde(last);
      out.push({
        studioId: s.id,
        empresa: s.name || s.id,
        tarea: 'Sin contacto',
        diasLabel: dias + ' día' + (dias === 1 ? '' : 's'),
      });
    }
    return out;
  }

  function mockMetrics() {
    return {
      totalEmpresas: 1597,
      ganados: 0,
      enReunion: 229,
      nuevos1349: 1349,
      prioridadAlta: 4,
      sinContacto14: 2,

      objetivos2026Pct: 85,
      objetivos: [
        { l: 'Visitas presenciales',  current: 109, target: 140, peso: '10%', tag: '78%', color: 'azul' },
        { l: 'Visitas MUTE',          current: 4,   target: 30,  peso: '10%', tag: '13%', color: 'rojo' },
        { l: 'Ponencias en colegios', current: 0,   target: 2,   peso: '5%',  tag: '0%',  color: 'gris' },
        { l: 'Catálogo MUTE',         current: '—', target: '1 entregable', peso: '30%', tag: 'Pendiente', color: 'rojo-dark' },
        { l: 'Soporte técnico',       current: 0,   target: 'registros',     peso: '30%', tag: '0',         color: 'gris' },
      ],

      proximaVisita: {
        studioId: '3012',
        name: 'J. Huesa Water Technology',
        hora: '10:30',
        location: 'Bollullos · 32 min en coche',
      },

      atrasados: [
        { studioId: '2435', empresa: 'ARRAM Consultores', tarea: 'Conexión LinkedIn', diasLabel: '7 días' },
        { studioId: '13',   empresa: 'SINGULAB Arq.',     tarea: 'Email seguimiento', diasLabel: '3 días' },
        { studioId: '101',  empresa: 'CIUDAD 2020 SL',    tarea: 'Llamar a contacto', diasLabel: '1 día' },
      ],
    };
  }

  /* ============================================================
     RENDER
     ============================================================ */
  function render() {
    const v = document.getElementById('view-dashboard');
    if (!v) return;
    document.getElementById('topbar-current').textContent = 'Dashboard';

    const m = getMetrics();
    const isNarrow = window.innerWidth < 1000;
    const isMobile = window.innerWidth < 700;

    if (isMobile) {
      // En móvil mostramos versión compacta tipo "Hoy" (recomendamos navegar a #inicio)
      v.innerHTML = mobileFallback();
      return;
    }

    v.innerHTML = isNarrow ? render900(m) : render1280(m);
  }

  function mobileFallback() {
    return (
      '<div style="padding:40px 20px; text-align:center;">' +
        '<div style="width:64px; height:64px; margin:0 auto 16px; border-radius:50%; background:var(--gpf-blue-100); color:var(--gpf-blue-700); display:flex; align-items:center; justify-content:center;">' +
          I.TrendingUp() +
        '</div>' +
        '<h2 style="font-family:var(--font-display); font-size:22px; margin:0 0 8px;">Dashboard</h2>' +
        '<p style="color:var(--fg-3); font-size:14px; margin:0 0 20px;">El dashboard está pensado para pantalla grande. En el iPhone usa <strong>Hoy</strong> que tiene un resumen optimizado.</p>' +
        '<button class="btn btn-primary btn-block" onclick="showView(\'inicio\')">' + I.Home() + ' Ir a Hoy</button>' +
      '</div>'
    );
  }

  /* ============================================================
     RENDER 1280 — Dashboard completo
     ============================================================ */
  function render1280(m) {
    return (
      '<div style="max-width:1180px; margin:0 auto;">' +
        titleRow(false) +
        kpiStrip(m, 5) +
        mainSplit(m, false) +
      '</div>'
    );
  }

  /* ============================================================
     RENDER 900 — sidebar colapsada por CSS + KPI 3+2 + tabla compacta
     ============================================================ */
  function render900(m) {
    return (
      '<div style="max-width:880px; margin:0 auto;">' +
        titleRow(true) +
        kpiStripCompact(m) +
        proximaVisitaCompact(m) +
        tablaCompacta() +
      '</div>'
    );
  }

  /* ============================================================
     BLOQUES COMUNES
     ============================================================ */
  function titleRow(tight) {
    const fecha = State.today.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
    const fechaCap = fecha.charAt(0).toUpperCase() + fecha.slice(1);
    return (
      '<div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:' + (tight ? '14px' : '18px') + ';">' +
        '<div>' +
          '<div class="eyebrow" style="margin-bottom:4px;">' + escape(fechaCap) + (tight ? '' : ' · año en curso') + '</div>' +
          '<h1 style="font-family:var(--font-display); font-weight:600; font-size:' + (tight ? '28px' : '36px') + '; line-height:1; text-transform:uppercase; letter-spacing:.005em; margin:0;">Dashboard</h1>' +
        '</div>' +
        (tight ? '' :
          '<div style="display:flex; gap:8px; align-items:center;">' +
            '<span style="font-size:13px; color:var(--fg-3);">Filtrar:</span>' +
            '<button class="chip">Andalucía</button>' +
            '<button class="chip">2026</button>' +
            '<button class="chip">Todos los cuadrantes</button>' +
            '<button style="width:32px; height:32px; background:transparent; border:1px solid var(--line); border-radius:6px; color:var(--fg-2); cursor:pointer; display:flex; align-items:center; justify-content:center;">' +
              I.Filter() +
            '</button>' +
          '</div>'
        ) +
      '</div>'
    );
  }

  function kpiStrip(m, cols) {
    const data = [
      { label: 'Total empresas',   value: formatNum(m.totalEmpresas), delta: '+12 vs semana pasada' },
      { label: 'Ganados 2026',     value: m.ganados,                  delta: 'objetivo 8' },
      { label: 'En reunión',       value: m.enReunion,                delta: Math.round(m.enReunion / m.totalEmpresas * 100) + '% del pipeline' },
      { label: 'Nuevos (7d)',      value: formatNum(m.nuevos1349),    delta: '+84 ayer' },
      { label: 'Prioridad alta',   value: m.prioridadAlta,            delta: m.sinContacto14 + ' sin contacto &gt;14d', accent: 'var(--mute-red-dark)' },
    ];
    return (
      '<div class="kpi-grid-' + cols + '" style="margin-bottom:24px;">' +
        data.map(kpiCard).join('') +
      '</div>'
    );
  }
  function kpiCard(d) {
    return (
      '<div class="kpi">' +
        '<div class="label"' + (d.accent ? ' style="color:' + d.accent + ';"' : '') + '>' + escape(d.label) + '</div>' +
        '<div class="value">' + d.value + '</div>' +
        '<div class="delta">' + d.delta + '</div>' +
      '</div>'
    );
  }
  function kpiStripCompact(m) {
    return (
      '<div class="kpi-grid-3" style="margin-bottom:10px;">' +
        kpiCard({ label: 'Empresas',    value: formatNum(m.totalEmpresas), delta: 'cartera' }) +
        kpiCard({ label: 'En reunión',  value: m.enReunion,                delta: '14% pipeline' }) +
        kpiCard({ label: 'Atrasados',   value: m.atrasados.length,         delta: '+45d sin contacto', accent: 'var(--mute-red-dark)' }) +
      '</div>' +
      '<div class="kpi-grid-2" style="margin-bottom:16px;">' +
        kpiCard({ label: 'Visitas (78%)', value: '109/140', delta: 'objetivo 140' }) +
        kpiCard({ label: 'MUTE (13%)',    value: '4/30',    delta: 'objetivo 30', accent: 'var(--mute-red-dark)' }) +
      '</div>'
    );
  }

  function mainSplit(m, tight) {
    return (
      '<div style="display:grid; grid-template-columns: 1.6fr 1fr; gap:18px;">' +
        objetivosCard(m) +
        '<div style="display:flex; flex-direction:column; gap:14px;">' +
          proximaVisitaCard(m.proximaVisita) +
          atrasosCard(m.atrasados) +
        '</div>' +
      '</div>'
    );
  }

  function objetivosCard(m) {
    return (
      '<div class="card" style="padding:20px;">' +
        '<div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:14px;">' +
          '<h3 style="font-family:var(--font-display); font-weight:600; font-size:18px; text-transform:uppercase; letter-spacing:.01em; margin:0;">Objetivos 2026 · bloque individual</h3>' +
          '<span style="font-family:var(--font-display); font-weight:600; font-size:22px; color:var(--gpf-blue-700);">' + m.objetivos2026Pct + '%</span>' +
        '</div>' +
        m.objetivos.map(function (o, i) {
          const last = i === m.objetivos.length - 1;
          const pct = typeof o.tag === 'string' && o.tag.endsWith('%') ? o.tag : '0%';
          const colorClass = o.color === 'rojo' ? 'red' : (o.color === 'gris' ? 'gray' : '');
          const valueStr = typeof o.current === 'number'
            ? o.current + '/' + o.target
            : (o.tag || '—');
          return (
            '<div style="padding:12px 0; ' + (last ? '' : 'border-bottom:1px solid var(--line);') + ' ' +
              'display:grid; grid-template-columns:1fr auto auto; align-items:center; column-gap:18px;">' +
              '<div>' +
                '<div style="font-size:14px; font-weight:600; color:var(--fg-1);">' + escape(o.l) + '</div>' +
                '<div style="font-size:11px; color:var(--fg-3); margin-top:2px; font-family:var(--font-mono);">peso ' + escape(o.peso) + '</div>' +
              '</div>' +
              '<div style="width:200px; height:6px; background:var(--ink-100); border-radius:3px; overflow:hidden;">' +
                '<div style="width:' + pct + '; height:100%; background:' + colorBar(o.color) + ';"></div>' +
              '</div>' +
              '<div style="min-width:80px; text-align:right; font-family:var(--font-mono); font-size:13px; color:var(--fg-2); font-weight:600;">' +
                escape(valueStr) +
              '</div>' +
            '</div>'
          );
        }).join('') +
      '</div>'
    );
  }
  function colorBar(c) {
    return c === 'rojo' ? 'var(--mute-red)'
         : c === 'rojo-dark' ? 'var(--mute-red-dark)'
         : c === 'gris' ? 'var(--ink-300)'
         : c === 'gris-fg' ? 'var(--fg-3)'
         : 'var(--gpf-blue-700)';
  }

  function proximaVisitaCard(pv) {
    if (!pv) {
      return (
        '<div class="card" style="padding:18px;">' +
          '<div class="eyebrow" style="margin-bottom:6px;">Próxima visita</div>' +
          '<div style="font-size:14px; color:var(--fg-3);">Sin visitas programadas.</div>' +
        '</div>'
      );
    }
    return (
      '<div style="background:var(--gpf-blue-900); color:#fff; border-radius:10px; padding:18px; position:relative; overflow:hidden;">' +
        '<div class="eyebrow" style="color:rgba(255,255,255,.55); margin-bottom:6px;">Próxima visita · ' + escape(pv.hora) + '</div>' +
        '<div style="font-family:var(--font-display); font-size:22px; font-weight:600; line-height:1.1; margin-bottom:6px;">' +
          escape(pv.name) +
        '</div>' +
        '<div style="font-size:13px; color:rgba(255,255,255,.8); margin-bottom:14px; display:flex; align-items:center; gap:6px;">' +
          I.MapPin() + escape(pv.location) +
        '</div>' +
        '<div style="display:flex; gap:8px;">' +
          '<button class="btn btn-strong" style="flex:1; height:40px; font-size:13px;" onclick="if(window.Screens.comollegar) Screens.comollegar.open(\'' + escape(pv.studioId) + '\')">' +
            I.Navigation() + ' Cómo llegar' +
          '</button>' +
          '<button class="btn" style="height:40px; padding:0 14px; font-size:13px; background:rgba(255,255,255,.10); color:#fff; border:1px solid rgba(255,255,255,.2);" onclick="showView(\'briefing\', { studioId: \'' + escape(pv.studioId) + '\' })">' +
            I.FileText() + ' Briefing' +
          '</button>' +
        '</div>' +
      '</div>'
    );
  }
  function proximaVisitaCompact(m) {
    const pv = m.proximaVisita;
    if (!pv) return '';
    return (
      '<div style="background:var(--gpf-blue-900); color:#fff; border-radius:10px; padding:14px 16px; ' +
        'display:grid; grid-template-columns:1fr auto; column-gap:18px; align-items:center; margin-bottom:14px;">' +
        '<div>' +
          '<div class="eyebrow" style="color:rgba(255,255,255,.55); margin-bottom:3px;">Próxima · ' + escape(pv.hora) + '</div>' +
          '<div style="font-family:var(--font-display); font-size:18px; font-weight:600;">' + escape(pv.name) + ' · Bollullos</div>' +
        '</div>' +
        '<button class="btn btn-strong" style="height:38px; font-size:13px; padding:0 14px;" onclick="if(window.Screens.comollegar) Screens.comollegar.open(\'' + escape(pv.studioId) + '\')">' +
          I.Navigation() + ' Cómo llegar' +
        '</button>' +
      '</div>'
    );
  }

  function atrasosCard(rows) {
    return (
      '<div class="card" style="padding:14px 16px;">' +
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">' +
          '<div style="display:flex; align-items:center; gap:8px;">' +
            '<span style="color:var(--mute-red);">' + I.AlertTriangle() + '</span>' +
            '<span style="font-size:14px; font-weight:600;">Atrasados</span>' +
          '</div>' +
          '<span class="chip chip-red">' + rows.length + '</span>' +
        '</div>' +
        rows.map(function (r, i) {
          return (
            '<div style="display:flex; justify-content:space-between; align-items:center; padding:9px 0; ' +
              (i > 0 ? 'border-top:1px solid var(--line);' : '') + ' cursor:pointer;" ' +
              'onclick="showView(\'detail\', { studioId: \'' + escape(r.studioId) + '\' })">' +
              '<div style="min-width:0;">' +
                '<div style="font-size:13px; font-weight:600; color:var(--fg-1); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' +
                  escape(r.empresa) +
                '</div>' +
                '<div style="font-size:12px; color:var(--fg-3);">' + escape(r.tarea) + '</div>' +
              '</div>' +
              '<span style="font-size:12px; color:var(--mute-red-dark); font-family:var(--font-mono); font-weight:600;">' +
                escape(r.diasLabel) +
              '</span>' +
            '</div>'
          );
        }).join('') +
      '</div>'
    );
  }

  function tablaCompacta() {
    const filas = [
      ['Varda Desarrollo Sostenible', 'Ingeniería',   '20 may 2026', '2d'],
      ['Estudio 3 Ingeniería',        'Ingeniería',   '19 may 2026', '3d'],
      ['Proinco Ingeniería SLP',      'Ingeniería',   '19 may 2026', '3d'],
      ['CIUDAD 2020 SL',              'Ingeniería',   '19 may 2026', '3d'],
      ['ARRAM Consultores',           'Arquitectura', '15 may 2026', '7d'],
    ];
    return (
      '<div class="card" style="padding:0; overflow:hidden;">' +
        '<div style="display:grid; grid-template-columns:1.4fr 1fr 1fr 80px; padding:10px 14px; ' +
          'background:var(--paper-warm); border-bottom:1px solid var(--line); font-size:11px; font-weight:700; ' +
          'text-transform:uppercase; letter-spacing:.12em; color:var(--fg-3);">' +
          '<span>Empresa</span><span>Tipo</span><span>Última actividad</span><span style="text-align:right;">Días</span>' +
        '</div>' +
        filas.map(function (r, i) {
          const last = i === filas.length - 1;
          const colorDias = r[3] === '7d' ? 'var(--mute-red-dark)' : 'var(--fg-2)';
          return (
            '<div style="display:grid; grid-template-columns:1.4fr 1fr 1fr 80px; padding:11px 14px; ' +
              (last ? '' : 'border-bottom:1px solid var(--line);') + ' font-size:13px; align-items:center;">' +
              '<span style="font-weight:600; color:var(--fg-1);">' + escape(r[0]) + '</span>' +
              '<span style="color:var(--fg-2);">' + escape(r[1]) + '</span>' +
              '<span style="color:var(--fg-2); font-family:var(--font-mono); font-size:12px;">' + escape(r[2]) + '</span>' +
              '<span style="text-align:right; font-family:var(--font-mono); color:' + colorDias + '; font-weight:600;">' + escape(r[3]) + '</span>' +
            '</div>'
          );
        }).join('') +
      '</div>'
    );
  }

  function formatNum(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  /* ============================================================
     EXPORT
     ============================================================ */
  window.Screens = window.Screens || {};
  window.Screens.dashboard = { render: render };
})();
