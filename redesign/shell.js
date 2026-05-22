/* CRM Prospector · rediseño v1 — Shell (sidebar + topbar + main + overlays)
 *
 * Monta la estructura HTML base sobre #app. Las pantallas concretas se
 * inyectan en <section class="view" id="view-{name}"></section> via showView().
 */
(function () {
  'use strict';

  const I = window.Icon;
  const State = window.State;

  function render() {
    const app = document.getElementById('app');
    if (!app) {
      console.error('[redesign] #app no existe en el DOM');
      return;
    }
    app.classList.add('crm-root');
    app.innerHTML = sidebarShell() + mainShell() + overlays();
  }

  function sidebarShell() {
    const itemsMain = [
      { id: 'inicio',     label: 'Hoy',           icon: I.Home() },
      { id: 'studios',    label: 'Empresas',      icon: I.Building() },
      { id: 'bandeja',    label: 'Bandeja',       icon: I.Layers() },
      { id: 'dashboard',  label: 'Dashboard',     icon: I.TrendingUp() },
    ];
    const itemsTools = [
      { id: 'planificador', label: 'Planificador',     icon: I.Calendar() },
      { id: 'mapa',         label: 'Mapa caliente',    icon: I.MapPin() },
      { id: 'importar',     label: 'Importar / Exportar', icon: I.Save() },
    ];

    return (
      '<div class="shell">' +
      '<aside class="sidebar" id="sidebar">' +
        '<div class="sidebar-logo">' +
          '<span class="logo-mark">F</span>' +
          '<div>' +
            '<div class="logo-full">FERROPLAST</div>' +
            '<div class="logo-sub">CRM Prospector · v5</div>' +
          '</div>' +
        '</div>' +
        '<nav>' +
          itemsMain.map(navItem).join('') +
          '<div class="sidebar-divider"></div>' +
          '<div class="sidebar-section-title">Herramientas</div>' +
          itemsTools.map(navItem).join('') +
        '</nav>' +
        '<div class="sidebar-user">' +
          '<div class="avatar">' + State.user.initials + '</div>' +
          '<div class="user-meta">' +
            '<div class="user-name">' + State.user.name + '</div>' +
            '<div class="user-role">' + State.user.role + '</div>' +
          '</div>' +
        '</div>' +
      '</aside>'
    );
  }

  function navItem(it) {
    return (
      '<a class="nav-item" data-view="' + it.id + '" href="#' + it.id + '" ' +
      'onclick="event.preventDefault(); showView(\'' + it.id + '\')">' +
        it.icon +
        '<span class="nav-label">' + it.label + '</span>' +
      '</a>'
    );
  }

  function mainShell() {
    return (
      '<div class="main">' +
        '<header class="topbar">' +
          '<div class="breadcrumb">' +
            I.Home() +
            '<span>/</span>' +
            '<span class="current" id="topbar-current">Dashboard</span>' +
          '</div>' +
          '<div class="search-pill" onclick="Cmdk.open()">' +
            I.Search() +
            '<span class="placeholder">Buscar empresas, acciones, atajos…</span>' +
            '<span class="kbd">⌘K</span>' +
          '</div>' +
          '<div class="actions">' +
            '<button class="btn btn-ghost">' + I.Calendar() + ' Calendario</button>' +
            '<button class="btn btn-primary">' + I.Plus() + ' Nuevo análisis</button>' +
            '<button class="icon-btn" aria-label="Notificaciones">' +
              I.Bell() +
              '<span class="badge-dot"></span>' +
            '</button>' +
          '</div>' +
        '</header>' +

        '<div class="content">' +
          // Vistas — vacías por defecto, las pantallas se renderizan en sus archivos
          '<section class="view active" id="view-inicio"></section>' +
          '<section class="view" id="view-studios"></section>' +
          '<section class="view" id="view-detail"></section>' +
          '<section class="view" id="view-briefing"></section>' +
          '<section class="view" id="view-informe"></section>' +
          '<section class="view" id="view-bandeja"></section>' +
          '<section class="view" id="view-dashboard"></section>' +
          '<section class="view" id="view-planificador"></section>' +
          '<section class="view" id="view-mapa"></section>' +
          '<section class="view" id="view-importar"></section>' +
        '</div>' +
      '</div>' +
      '</div>'  // cierre .shell
    );
  }

  function overlays() {
    return (
      // Cmd+K palette overlay (vacío hasta Fase E)
      '<div class="cmdk-overlay" id="cmdk-overlay" onclick="if(event.target===this) Cmdk.close()">' +
        '<div class="cmdk-palette" onclick="event.stopPropagation()">' +
          '<div class="input-row">' +
            '<span style="color:var(--fg-3)">' + I.Search() + '</span>' +
            '<input id="cmdk-input" placeholder="Empresa, acción o atajo…" ' +
              'oninput="if(window.Screens.cmdk) Screens.cmdk.update(this.value)"/>' +
            '<span class="esc-kbd">esc</span>' +
          '</div>' +
          '<div class="cmdk-results" id="cmdk-results">' +
            '<div style="padding:24px; text-align:center; color:var(--fg-3); font-size:13px;">' +
              'Cmd+K palette pendiente de Fase E.' +
            '</div>' +
          '</div>' +
          '<div class="cmdk-footer">' +
            '<span>navegar · abrir · filtrar</span>' +
            '<span>v5.2 · ⌘K en cualquier pantalla</span>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // Sheet bottom overlay (vacío hasta C3)
      '<div class="sheet-overlay" id="sheet-overlay" onclick="if(event.target===this) closeSheet()">' +
        '<div class="sheet" id="sheet-content"></div>' +
      '</div>'
    );
  }

  window.Shell = { render: render };
})();
