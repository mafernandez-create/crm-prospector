/* CRM Prospector — rediseño v1 · renderers
 * Cada vista monta el HTML correspondiente sobre los nodos del shell.
 * Phase 0: shell + inicio + dashboard básicos + cmdk + studios listado.
 * Phase 1+ añadirá: ficha, briefing, informe, cómo llegar, estados…
 */
(function () {
  'use strict';

  const I = window.Icon;
  const M = window.BrandMarks;
  const S = window.State;
  const U = window.Util;
  const escape = U.escapeHtml;

  /* ============================================================
     SHELL — sidebar + topbar + main + overlay cmdk
     ============================================================ */
  function shell() {
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="shell-desktop">
        <aside class="sidebar" id="sidebar">
          ${sidebarHtml()}
        </aside>
        <div class="main">
          ${topbarHtml()}
          <div class="content">
            <!-- Vistas -->
            <section class="view" id="view-inicio"></section>
            <section class="view" id="view-dashboard"></section>
            <section class="view" id="view-studios"></section>
            <section class="view" id="view-detail"></section>
            <section class="view" id="view-briefing"></section>
            <section class="view" id="view-informe"></section>
            <section class="view" id="view-bandeja"></section>
          </div>
        </div>
      </div>

      <!-- Cmd+K overlay -->
      <div class="cmdk-overlay" id="cmdk-overlay" onclick="if(event.target===this) Cmdk.close()">
        <div class="cmdk-palette" onclick="event.stopPropagation()">
          <div class="input-row">
            <span style="color:var(--fg-3)">${I.Search()}</span>
            <input id="cmdk-input" placeholder="Empresa, acción o atajo…" oninput="Cmdk.update(this.value)"/>
            <span class="esc-kbd">esc</span>
          </div>
          <div class="cmdk-results" id="cmdk-results"></div>
          <div class="cmdk-footer">
            <span><span class="kbd-trail">↑</span> <span class="kbd-trail">↓</span> navegar · <span class="kbd-trail">↵</span> abrir · <span class="kbd-trail">tab</span> filtrar tipo</span>
            <span>v5.2 · ⌘K en cualquier pantalla</span>
          </div>
        </div>
      </div>

      <!-- Sheet bottom-up reusable -->
      <div class="sheet-overlay" id="sheet-overlay" onclick="if(event.target===this) closeSheet()">
        <div class="sheet" id="sheet-content"></div>
      </div>
    `;
  }

  function sidebarHtml() {
    const items = [
      { id: 'inicio',   label: 'Hoy',          icon: I.Home() },
      { id: 'studios',  label: 'Empresas',     icon: I.Building() },
      { id: 'bandeja',  label: 'Bandeja',      icon: I.Layers() },
      { id: 'dashboard',label: 'Dashboard',    icon: I.TrendingUp() },
    ];
    const tools = [
      { id: 'planificador', label: 'Planificador',   icon: I.Calendar() },
      { id: 'mapa',         label: 'Mapa caliente',  icon: I.MapPin() },
      { id: 'importar',     label: 'Importar / Exportar', icon: I.Save() },
    ];
    return `
      <div class="sidebar-logo">
        <span class="logo-mark">F</span>
        <div style="margin-left:12px">
          <div class="logo-full">FERROPLAST</div>
          <div class="logo-sub">CRM Prospector · v5</div>
        </div>
      </div>
      <nav class="sidebar-nav">
        ${items.map((it) => `
          <a class="nav-item" data-view="${it.id}" onclick="event.preventDefault(); showView('${it.id}')" href="#${it.id}">
            ${it.icon}
            <span class="nav-label">${it.label}</span>
          </a>
        `).join('')}
        <div class="sidebar-divider"></div>
        <div class="sidebar-section-title">Herramientas</div>
        ${tools.map((it) => `
          <a class="nav-item" href="#${it.id}">
            ${it.icon}
            <span class="nav-label">${it.label}</span>
          </a>
        `).join('')}
      </nav>
      <div class="sidebar-user">
        <div class="avatar">${S.user.initials}</div>
        <div class="user-meta">
          <div class="user-name">${escape(S.user.name)}</div>
          <div class="user-role">${escape(S.user.role)}</div>
        </div>
      </div>
    `;
  }

  function topbarHtml() {
    return `
      <header class="topbar">
        <div class="breadcrumb">
          ${I.Home()}
          <span>/</span>
          <span class="current" id="topbar-current">Dashboard</span>
        </div>
        <div class="search-pill" onclick="Cmdk.open()">
          ${I.Search()}
          <span class="placeholder">Buscar empresas, acciones, atajos…</span>
          <span class="kbd">⌘K</span>
        </div>
        <div class="actions">
          <button class="btn btn-ghost">${I.Calendar()} Calendario</button>
          <button class="btn btn-primary">${I.Plus()} Nuevo análisis</button>
          <button class="icon-btn" aria-label="Notificaciones">
            ${I.Bell()}
            <span class="badge-dot"></span>
          </button>
        </div>
      </header>
    `;
  }

  /* ============================================================
     INICIO (iPhone-like, también renderiza en desktop como hero)
     ============================================================ */
  function inicio() {
    const v = document.getElementById('view-inicio');
    if (!v) return;
    document.getElementById('topbar-current').textContent = 'Hoy';

    const nextVisit = pickNextVisit();
    const tasks = pickPendingTasks();
    const objectives = computeObjectives();

    const fechaHoy = S.today.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
    const fechaHoyCap = fechaHoy.charAt(0).toUpperCase() + fechaHoy.slice(1);

    v.innerHTML = `
      <div style="max-width: 720px; margin: 0 auto; display: flex; flex-direction: column; gap: 18px;">
        <header>
          <div class="eyebrow">${escape(fechaHoyCap)}</div>
          <h1 style="font-family:var(--font-display); font-weight:600; font-size:36px; line-height:1; text-transform:uppercase; letter-spacing:.005em; margin:6px 0 0;">Hoy</h1>
        </header>

        <!-- Próxima visita hero -->
        ${nextVisit ? `
          <div class="next-visit-hero">
            <div class="content-wrap">
              <div class="eyebrow-light">${I.Target()} Próxima visita${nextVisit.distLabel ? ' · ' + escape(nextVisit.distLabel) : ''}</div>
              <h2>${escape(nextVisit.name)}</h2>
              <div class="meta">${I.Clock()} ${escape(nextVisit.hora || '')} · ${escape(nextVisit.tipo || 'Visita')}</div>
              <div class="meta">${I.MapPin()} ${escape(nextVisit.location || '')}</div>
              <div style="display:flex; gap:8px; margin-top:16px;">
                <button class="btn btn-strong btn-lg" style="flex:1; box-shadow:0 4px 14px rgba(200,16,46,.35);" onclick="abrirComoLlegar('${escape(nextVisit.studioId)}')">
                  ${I.Navigation()} Cómo llegar
                </button>
                <button class="btn" style="height:48px; padding:0 16px; background:rgba(255,255,255,.10); color:#fff; border:1px solid rgba(255,255,255,.2);" onclick="showView('briefing', { studioId: '${escape(nextVisit.studioId)}' })">
                  ${I.FileText()} Briefing
                </button>
              </div>
            </div>
          </div>
        ` : `
          <div class="next-visit-hero" style="background: var(--paper-warm); color: var(--fg-2); border: 1px solid var(--line);">
            <div class="content-wrap" style="position: static;">
              <div class="eyebrow" style="margin-bottom: 8px;">Próxima visita</div>
              <h2 style="color: var(--fg-2); font-size: 22px;">Sin visitas programadas</h2>
              <p style="margin: 8px 0 0; font-size: 14px; color: var(--fg-3);">No hay próximas visitas en el planificador. Programa una desde el Planificador.</p>
            </div>
          </div>
        `}

        <!-- Tareas pendientes -->
        <section>
          <div style="display:flex; align-items:baseline; justify-content:space-between; margin-bottom:10px;">
            <span class="eyebrow">Tareas · ${tasks.length} pendiente${tasks.length === 1 ? '' : 's'}</span>
            <a href="#bandeja" style="font-size:13px; color:var(--gpf-blue-700); font-weight:600; text-decoration:none;">Ver todas</a>
          </div>
          ${tasks.length ? `
            <div style="display:flex; flex-direction:column; gap:8px;">
              ${tasks.map((it) => `
                <div class="card" style="padding:14px; display:flex; align-items:center; gap:12px; min-height:64px; border-left: 3px solid ${it.late ? 'var(--mute-red)' : 'var(--line)'}; cursor:pointer;" onclick="showView('detail', { studioId: '${escape(it.studioId)}' })">
                  <div style="flex:1; min-width:0;">
                    <div style="font-weight:600; font-size:15px; color:var(--fg-1); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escape(it.name)}</div>
                    <div style="font-size:13px; color:var(--fg-3); display:flex; gap:8px; align-items:center; margin-top:2px;">
                      ${it.late ? '<span style="color:var(--mute-red-dark); font-weight:600;">Atrasada</span><span>·</span>' : ''}
                      <span>${escape(it.text)}</span>
                    </div>
                  </div>
                  <div style="font-size:12px; color:var(--fg-3); font-family:var(--font-mono);">${escape(it.hour)}</div>
                  <span style="color:var(--fg-muted);">${I.ChevronRight()}</span>
                </div>
              `).join('')}
            </div>
          ` : `
            <div class="card" style="padding: 24px; text-align: center; color: var(--fg-3); font-size: 14px;">
              No hay tareas pendientes hoy. ¡Buen momento para revisar pipeline!
            </div>
          `}
        </section>

        <!-- Objetivos del mes -->
        <section>
          <div class="eyebrow" style="display:block; margin-bottom:10px;">Objetivos · ${escape(S.today.toLocaleString('es-ES', { month: 'long' }))}</div>
          <div class="card" style="padding:16px;">
            ${objectives.map((o, i) => `
              <div style="${i ? 'border-top: 1px solid var(--line); margin-top: 14px; padding-top: 14px;' : ''}">
                <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:6px;">
                  <span style="font-size:14px; color:var(--fg-2); font-weight:500;">${escape(o.label)}</span>
                  <span style="font-family:var(--font-display); font-weight:600; font-variant-numeric:tabular-nums; font-size:18px;">${o.current}<span style="color:var(--fg-3); font-size:13px;"> / ${o.target}</span></span>
                </div>
                <div class="progress"><div class="fill ${o.red ? 'red' : ''}" style="width:${Math.min(100, (o.current / o.target) * 100)}%"></div></div>
              </div>
            `).join('')}
          </div>
        </section>
      </div>
    `;
  }

  function pickNextVisit() {
    // Lee próxima visita del planificador
    if (!S.planificador || !S.planificador.schedule) return null;
    const sched = S.planificador.schedule || {};
    const fechas = Object.keys(sched).filter((f) => f >= S.today.toISOString().slice(0, 10)).sort();
    for (const f of fechas) {
      const arr = sched[f] || [];
      if (arr.length) {
        const v = arr[0];
        const studio = S.studiosById[v.id];
        return {
          studioId: v.id,
          name: v.name || (studio && studio.name) || 'Sin nombre',
          hora: (v.data && v.data.hora) || '',
          tipo: 'Reunión',
          location: [v.city, v.province].filter(Boolean).join(' · ') ||
            (studio && studio.data && studio.data.contact && studio.data.contact.address) || '',
          fecha: f,
          distLabel: null,
        };
      }
    }
    return null;
  }

  function pickPendingTasks() {
    // Tareas: studios con prioridad alta sin tocar >7d, o atrasados de la última semana
    const hace7d = new Date(S.today.getTime() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const out = [];
    for (const s of S.studios) {
      if (out.length >= 5) break;
      const last = U.lastInteraction(s);
      if (!last) continue;
      if (s.priority === 'alta' || (s.score && s.score >= 8)) {
        if (last < hace7d) {
          out.push({
            studioId: s.id,
            name: s.name || s.id,
            text: 'Reactivar contacto',
            hour: U.formatDateES(last),
            late: last < new Date(S.today.getTime() - 14 * 24 * 3600 * 1000).toISOString().slice(0, 10),
          });
        }
      }
    }
    return out;
  }

  function computeObjectives() {
    // Cuenta visitas y MUTE de los reports en el año actual
    const yyyy = S.today.getFullYear();
    let visitas = 0, mute = 0;
    for (const s of S.studios) {
      for (const r of U.reports(s)) {
        if (r && r.date && r.date.startsWith(String(yyyy))) {
          visitas++;
          // Heurística MUTE: si el report menciona "MUTE" en notes o title
          const txt = (r.notes || r.title || r.fileName || '').toUpperCase();
          if (txt.indexOf('MUTE') >= 0) mute++;
        }
      }
    }
    return [
      { label: 'Visitas presenciales', current: visitas, target: 140 },
      { label: 'Visitas MUTE', current: mute, target: 30, red: true },
    ];
  }

  /* ============================================================
     DASHBOARD (desktop completo)
     ============================================================ */
  function dashboard() {
    const v = document.getElementById('view-dashboard');
    if (!v) return;
    document.getElementById('topbar-current').textContent = 'Dashboard';

    const total = S.studios.length;
    const ganados = S.studios.filter((s) => s.status === 'ganado').length;
    const reunion = S.studios.filter((s) => s.status === 'reunion').length;
    const nuevos = S.studios.filter((s) => s.status === 'nuevo').length;
    const alta = S.studios.filter((s) => s.priority === 'alta').length;

    const nextVisit = pickNextVisit();
    const objectives = computeObjectives();
    const atrasos = pickPendingTasks().slice(0, 3);

    v.innerHTML = `
      <div style="max-width:1180px; margin:0 auto;">
        <!-- Header -->
        <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:18px;">
          <div>
            <div class="eyebrow" style="margin-bottom:4px;">${escape(S.today.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' }))} · año en curso</div>
            <h1 style="font-family:var(--font-display); font-weight:600; font-size:36px; line-height:1; text-transform:uppercase; letter-spacing:.005em; margin:0;">Dashboard</h1>
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            <span style="font-size:13px; color:var(--fg-3);">Filtrar:</span>
            <button class="chip">Andalucía</button>
            <button class="chip">2026</button>
            <button class="chip">Todos los cuadrantes</button>
            <button style="width:32px; height:32px; background:transparent; border:1px solid var(--line); border-radius:6px; color:var(--fg-2); cursor:pointer;">${I.Filter()}</button>
          </div>
        </div>

        <!-- KPI strip -->
        <div class="kpi-grid-5" style="margin-bottom:24px;">
          <div class="kpi"><div class="label">Total empresas</div><div class="value">${total.toLocaleString('es-ES')}</div><div class="delta">cartera al día</div></div>
          <div class="kpi"><div class="label">Ganados 2026</div><div class="value">${ganados}</div><div class="delta">objetivo 8</div></div>
          <div class="kpi"><div class="label">En reunión</div><div class="value">${reunion}</div><div class="delta">${total ? Math.round(reunion / total * 100) : 0}% del pipeline</div></div>
          <div class="kpi"><div class="label">Nuevos</div><div class="value">${nuevos.toLocaleString('es-ES')}</div><div class="delta">${nuevos ? '+' : ''}sin cualificar</div></div>
          <div class="kpi"><div class="label" style="color:var(--mute-red-dark);">Prioridad alta</div><div class="value">${alta}</div><div class="delta">${atrasos.length} sin contacto &gt;14d</div></div>
        </div>

        <!-- Main split -->
        <div style="display:grid; grid-template-columns: 1.6fr 1fr; gap:18px;">
          <!-- Objectives -->
          <div class="card" style="padding:20px;">
            <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:14px;">
              <h3 style="font-family:var(--font-display); font-weight:600; font-size:18px; text-transform:uppercase; letter-spacing:.01em; margin:0;">Objetivos 2026 · bloque individual</h3>
              <span style="font-family:var(--font-display); font-weight:600; font-size:22px; color:var(--gpf-blue-700);">${objectives.length ? Math.round(objectives.reduce((a, o) => a + (o.current / o.target) * 100, 0) / objectives.length) : 0}%</span>
            </div>
            ${objectives.map((row, i) => `
              <div style="padding:12px 0; ${i < objectives.length - 1 ? 'border-bottom:1px solid var(--line);' : ''} display:grid; grid-template-columns:1fr auto auto; align-items:center; column-gap:18px;">
                <div>
                  <div style="font-size:14px; font-weight:600; color:var(--fg-1);">${escape(row.label)}</div>
                </div>
                <div style="width:200px;">
                  <div class="progress"><div class="fill ${row.red ? 'red' : ''}" style="width:${Math.min(100, (row.current / row.target) * 100)}%"></div></div>
                </div>
                <div style="min-width:80px; text-align:right; font-family:var(--font-mono); font-size:13px; color:var(--fg-2); font-weight:600;">${row.current}/${row.target}</div>
              </div>
            `).join('')}
          </div>

          <!-- Próxima + atrasos -->
          <div style="display:flex; flex-direction:column; gap:14px;">
            ${nextVisit ? `
              <div style="background:var(--gpf-blue-900); color:#fff; border-radius:10px; padding:18px;">
                <div class="eyebrow" style="color:rgba(255,255,255,.55); margin-bottom:6px;">Próxima visita${nextVisit.hora ? ' · ' + escape(nextVisit.hora) : ''}</div>
                <div style="font-family:var(--font-display); font-size:22px; font-weight:600; line-height:1.1; margin-bottom:6px;">${escape(nextVisit.name)}</div>
                <div style="font-size:13px; color:rgba(255,255,255,.8); margin-bottom:14px; display:flex; align-items:center; gap:6px;">${I.MapPin()} ${escape(nextVisit.location)}</div>
                <div style="display:flex; gap:8px;">
                  <button class="btn btn-strong" style="flex:1; height:40px; font-size:13px;" onclick="abrirComoLlegar('${escape(nextVisit.studioId)}')">${I.Navigation()} Cómo llegar</button>
                  <button class="btn" style="height:40px; padding:0 14px; font-size:13px; background:rgba(255,255,255,.10); color:#fff; border:1px solid rgba(255,255,255,.2);" onclick="showView('briefing', { studioId: '${escape(nextVisit.studioId)}' })">${I.FileText()} Briefing</button>
                </div>
              </div>
            ` : ''}

            <div class="card" style="padding:14px 16px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <div style="display:flex; align-items:center; gap:8px;">
                  <span style="color:var(--mute-red);">${I.AlertTriangle()}</span>
                  <span style="font-size:14px; font-weight:600;">Atrasados</span>
                </div>
                <span class="chip chip-red">${atrasos.length}</span>
              </div>
              ${atrasos.length ? atrasos.map((r, i) => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:9px 0; ${i ? 'border-top:1px solid var(--line);' : ''} cursor:pointer;" onclick="showView('detail', { studioId: '${escape(r.studioId)}' })">
                  <div style="min-width:0;">
                    <div style="font-size:13px; font-weight:600; color:var(--fg-1); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escape(r.name)}</div>
                    <div style="font-size:12px; color:var(--fg-3);">${escape(r.text)}</div>
                  </div>
                  <span style="font-size:12px; color:var(--mute-red-dark); font-family:var(--font-mono); font-weight:600;">${escape(r.hour)}</span>
                </div>
              `).join('') : '<div style="padding:8px 0; color:var(--fg-3); font-size:13px;">Sin atrasos detectados.</div>'}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /* ============================================================
     STUDIOS (listado básico — Fase 0 placeholder)
     ============================================================ */
  function studios() {
    const v = document.getElementById('view-studios');
    if (!v) return;
    document.getElementById('topbar-current').textContent = 'Empresas';
    const sorted = S.studios.slice().sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 50);
    v.innerHTML = `
      <div style="max-width:1180px; margin:0 auto;">
        <h1 style="font-family:var(--font-display); font-weight:600; font-size:32px; text-transform:uppercase; margin:0 0 16px;">Empresas</h1>
        <p style="color:var(--fg-3); font-size:14px; margin:0 0 18px;">Mostrando ${sorted.length} de ${S.studios.length}. Listado completo y filtros en Fase 1.</p>
        <div class="card" style="padding:0; overflow:hidden;">
          <div style="display:grid; grid-template-columns:2fr 1fr 1fr 1fr 80px; padding:10px 16px; background:var(--paper-warm); border-bottom:1px solid var(--line); font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.12em; color:var(--fg-3);">
            <span>Empresa</span><span>Tipo</span><span>Provincia</span><span>Última act.</span><span style="text-align:right;">Días</span>
          </div>
          ${sorted.map((s, i) => {
            const last = U.lastInteraction(s);
            const dias = last ? U.diasDesde(last) : '∞';
            const red = typeof dias === 'number' && dias > 45;
            return `
              <div style="display:grid; grid-template-columns:2fr 1fr 1fr 1fr 80px; padding:11px 16px; ${i < sorted.length - 1 ? 'border-bottom:1px solid var(--line);' : ''} font-size:13px; align-items:center; cursor:pointer;" onclick="showView('detail', { studioId: '${escape(s.id)}' })">
                <span style="font-weight:600; color:var(--fg-1);">${escape(s.name)}</span>
                <span style="color:var(--fg-2);">${escape(s.type || '—')}</span>
                <span style="color:var(--fg-2);">${escape(s.province || '—')}</span>
                <span style="color:var(--fg-2); font-family:var(--font-mono); font-size:12px;">${last ? U.formatDateES(last) : '—'}</span>
                <span style="text-align:right; font-family:var(--font-mono); color:${red ? 'var(--mute-red-dark)' : 'var(--fg-2)'}; font-weight:600;">${dias}d</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  /* ============================================================
     PLACEHOLDERS (Fase 1+)
     ============================================================ */
  function detail() {
    const v = document.getElementById('view-detail');
    const id = S.currentStudioId;
    const s = id && S.studiosById[id];
    if (!v) return;
    document.getElementById('topbar-current').textContent = s ? s.name : 'Ficha';
    v.innerHTML = `
      <div style="max-width:720px; margin:0 auto;">
        <h1 style="font-family:var(--font-display); font-weight:600; font-size:28px; margin:0 0 12px;">${escape(s ? s.name : 'Ficha no encontrada')}</h1>
        <p style="color:var(--fg-3);">Pantalla pendiente en Fase 1.</p>
      </div>
    `;
  }
  function briefing() {
    document.getElementById('topbar-current').textContent = 'Briefing';
    const v = document.getElementById('view-briefing');
    v.innerHTML = `<div style="padding:40px; color:var(--fg-3);">Pantalla de briefing pendiente en Fase 1.</div>`;
  }
  function informe() {
    document.getElementById('topbar-current').textContent = 'Informe';
    const v = document.getElementById('view-informe');
    v.innerHTML = `<div style="padding:40px; color:var(--fg-3);">Formulario de informe pendiente en Fase 1.</div>`;
  }
  function bandeja() {
    document.getElementById('topbar-current').textContent = 'Bandeja del agente';
    const v = document.getElementById('view-bandeja');
    v.innerHTML = `<div style="padding:40px; color:var(--fg-3);">Bandeja del agente pendiente en Fase siguiente.</div>`;
  }

  /* ============================================================
     COMO LLEGAR — bottom sheet (Fase 1 mejorará)
     ============================================================ */
  window.abrirComoLlegar = function (studioId) {
    const s = S.studiosById[studioId];
    if (!s) return;
    const addr = (s.data && s.data.contact && s.data.contact.address) || '';
    const city = s.city || '';
    const province = s.province || '';
    const fullAddr = [addr, city, province].filter(Boolean).join(', ');
    const enc = encodeURIComponent(fullAddr);

    const sheet = document.getElementById('sheet-content');
    sheet.innerHTML = `
      <div class="handle"></div>
      <div style="display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:6px;">
        <div class="eyebrow">Cómo llegar</div>
        <button style="background:transparent; border:0; padding:6px; color:var(--fg-3); cursor:pointer;" onclick="closeSheet()">${I.X()}</button>
      </div>
      <h3 style="font-size:22px; color:var(--fg-1); letter-spacing:-0.01em; line-height:1.15; margin:0 0 4px;">${escape(addr || s.name)}</h3>
      <div style="font-size:14px; color:var(--fg-3); margin-bottom:18px;">${escape([city, province].filter(Boolean).join(', '))}</div>
      <div style="display:flex; flex-direction:column; gap:8px;">
        <a href="maps://maps.apple.com/?q=${enc}" style="display:flex; align-items:center; gap:14px; padding:10px 12px; min-height:64px; background:var(--paper-warm); border:1px solid var(--line); border-radius:12px; text-decoration:none; color:inherit;">
          ${M.AppleMaps(44)}
          <div style="flex:1;">
            <div style="font-size:16px; font-weight:600; color:var(--fg-1);">Apple Maps</div>
            <div style="font-size:13px; color:var(--fg-3);">Predeterminado del sistema</div>
          </div>
          <span style="color:var(--fg-muted);">${I.ChevronRight()}</span>
        </a>
        <a href="https://maps.google.com/?q=${enc}" target="_blank" rel="noopener" style="display:flex; align-items:center; gap:14px; padding:10px 12px; min-height:64px; background:var(--paper-warm); border:1px solid var(--line); border-radius:12px; text-decoration:none; color:inherit;">
          ${M.GoogleMaps(44)}
          <div style="flex:1;">
            <div style="font-size:16px; font-weight:600; color:var(--fg-1);">Google Maps</div>
            <div style="font-size:13px; color:var(--fg-3);">Tráfico en vivo</div>
          </div>
          <span style="color:var(--fg-muted);">${I.ChevronRight()}</span>
        </a>
        <a href="https://waze.com/ul?q=${enc}" target="_blank" rel="noopener" style="display:flex; align-items:center; gap:14px; padding:10px 12px; min-height:64px; background:var(--paper-warm); border:1px solid var(--line); border-radius:12px; text-decoration:none; color:inherit;">
          ${M.Waze(44)}
          <div style="flex:1;">
            <div style="font-size:16px; font-weight:600; color:var(--fg-1);">Waze</div>
            <div style="font-size:13px; color:var(--fg-3);">Rutas alternativas</div>
          </div>
          <span style="color:var(--fg-muted);">${I.ChevronRight()}</span>
        </a>
      </div>
      <button style="margin-top:14px; width:100%; height:44px; background:transparent; border:0; color:var(--fg-3); font-size:14px; font-weight:500; cursor:pointer;" onclick="navigator.clipboard.writeText('${escape(fullAddr).replace(/'/g, '&#39;')}'); this.textContent='Copiada al portapapeles'">
        Copiar dirección
      </button>
    `;
    document.getElementById('sheet-overlay').classList.add('open');
  };
  window.closeSheet = function () {
    document.getElementById('sheet-overlay').classList.remove('open');
  };

  /* ============================================================
     CMD+K · resultados
     ============================================================ */
  function cmdk({ query }) {
    const results = document.getElementById('cmdk-results');
    if (!results) return;
    const q = (query || '').trim().toLowerCase();

    // Empresas
    let empresas = [];
    if (q) {
      empresas = S.studios.filter((s) =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.city || '').toLowerCase().includes(q) ||
        (s.province || '').toLowerCase().includes(q)
      ).slice(0, 5);
    }

    // Acciones rápidas — registradas en window.__cmdkActions para callback
    window.__cmdkActions = {
      nuevoAnalisis: () => alert('TODO: nuevo análisis'),
      nuevoInforme: () => alert('TODO: nuevo informe'),
      generarBriefing: () => alert('TODO: briefing'),
      comoLlegarProximo: () => {
        const nv = pickNextVisit();
        if (nv) { window.abrirComoLlegar(nv.studioId); window.Cmdk.close(); }
      },
    };
    const acciones = [
      { icon: I.Plus(), title: 'Nuevo análisis', trail: 'N', cb: 'nuevoAnalisis' },
      { icon: I.Edit(), title: 'Redactar informe de visita', trail: 'R', cb: 'nuevoInforme' },
      { icon: I.FileText(), title: 'Generar briefing pre-visita', trail: 'B', cb: 'generarBriefing' },
      { icon: I.Navigation(), title: 'Cómo llegar al próximo cliente', trail: 'G', cb: 'comoLlegarProximo' },
    ];

    // Navegar
    const nav = [
      { icon: I.Home(), title: 'Hoy', trail: '⌘1', view: 'inicio' },
      { icon: I.Building(), title: 'Empresas', trail: '⌘2', view: 'studios' },
      { icon: I.TrendingUp(), title: 'Dashboard', trail: '⌘3', view: 'dashboard' },
      { icon: I.Layers(), title: 'Bandeja del agente', trail: '⌘4', view: 'bandeja' },
    ];

    const sections = [];
    if (empresas.length) {
      sections.push(`
        <div class="cmdk-section">
          <div class="cmdk-section-title">Empresas · ${empresas.length} coincidencia${empresas.length === 1 ? '' : 's'}</div>
          ${empresas.map((s, i) => `
            <div class="cmdk-hit ${i === 0 ? 'selected' : ''}" onclick="showView('detail', { studioId: '${escape(s.id)}' }); Cmdk.close();">
              <span class="icon">${I.Building()}</span>
              <div style="flex:1; min-width:0;">
                <div class="title">${escape(s.name)}</div>
                <div class="sub">${escape([s.type, s.city, s.province].filter(Boolean).join(' · '))}</div>
              </div>
            </div>
          `).join('')}
        </div>
      `);
    }
    sections.push(`
      <div class="cmdk-section">
        <div class="cmdk-section-title">Acciones rápidas</div>
        ${acciones.map((a) => `
          <div class="cmdk-hit" onclick="window.__cmdkActions['${a.cb}'](); Cmdk.close();">
            <span class="icon">${a.icon}</span>
            <div style="flex:1;"><div class="title">${escape(a.title)}</div></div>
            <span class="kbd-trail">${escape(a.trail)}</span>
          </div>
        `).join('')}
      </div>
      <div class="cmdk-section">
        <div class="cmdk-section-title">Navegar a…</div>
        ${nav.map((n) => `
          <div class="cmdk-hit" onclick="showView('${n.view}'); Cmdk.close();">
            <span class="icon">${n.icon}</span>
            <div style="flex:1;"><div class="title">${escape(n.title)}</div></div>
            <span class="kbd-trail">${escape(n.trail)}</span>
          </div>
        `).join('')}
      </div>
    `);
    results.innerHTML = sections.join('');
  }

  /* ============================================================
     EXPORT
     ============================================================ */
  window.Renderers = {
    shell, inicio, dashboard, studios, detail, briefing, informe, bandeja, cmdk
  };
})();
