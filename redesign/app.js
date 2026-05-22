/* CRM Prospector · rediseño v1 — app shell
 *
 * Esqueleto mínimo:
 *   - Estado global window.State (studios, planificador, currentView, …)
 *   - Router con hash (#inicio, #detail/3012, etc.)
 *   - Función showView(name, params) que cambia .active entre <section.view>
 *   - Handler global ⌘K para abrir el palette (Fase E lo implementará)
 *   - Loader inicial visible hasta que init() complete
 *
 * Esta fase (B) NO carga datos reales todavía. Solo monta el shell. La capa
 * de datos llega en Fase G.
 *
 * Cada pantalla se registra en window.Screens.{name} con un .render(params)
 * function. Las pantallas se van añadiendo en Fases C–F.
 */
(function () {
  'use strict';

  /* ============================================================
     STATE
     ============================================================ */
  const State = {
    studios: [],
    studiosById: {},
    planificador: null,
    currentView: 'inicio',
    currentStudioId: null,
    today: new Date(),
    loading: true,
    error: null,
    user: {
      name: 'Manuel Fernández',
      initials: 'MF',
      role: 'Comercial · Andalucía',
    },
  };
  window.State = State;

  /* ============================================================
     SCREENS REGISTRY
     ============================================================ */
  /* Cada pantalla se registrará en window.Screens al cargar su .js. Ejemplo:
   *   window.Screens.inicio = { render(params) { ... } };
   *   window.Screens.detail = { render(params) { ... } };
   */
  window.Screens = window.Screens || {};

  /* ============================================================
     ROUTER
     ============================================================ */
  function showView(name, params) {
    params = params || {};
    State.currentView = name;
    if (params.studioId) State.currentStudioId = params.studioId;

    // Toggle .active entre todas las <section class="view">
    document.querySelectorAll('.view').forEach(function (el) {
      el.classList.toggle('active', el.id === 'view-' + name);
    });

    // Marcar nav-item activo
    document.querySelectorAll('.nav-item').forEach(function (el) {
      const v = el.getAttribute('data-view');
      el.classList.toggle('active', v === name);
    });

    // Render
    const screen = window.Screens[name];
    if (screen && typeof screen.render === 'function') {
      try {
        screen.render(params);
      } catch (e) {
        console.error('[redesign] render error en', name, e);
      }
    } else {
      console.warn('[redesign] pantalla no registrada todavía:', name);
    }

    // Hash sync
    const hash = name + (params.studioId ? '/' + params.studioId : '');
    if (location.hash.slice(1) !== hash) {
      // Evita disparar hashchange en bucle
      history.replaceState(null, '', '#' + hash);
    }
  }

  function navigateFromHash() {
    const h = location.hash.slice(1) || 'inicio';
    const [v, ...rest] = h.split('/');
    const studioId = rest[0];
    showView(v, studioId ? { studioId: studioId } : {});
  }
  window.addEventListener('hashchange', navigateFromHash);
  window.showView = showView;

  /* ============================================================
     CMD+K (Fase E lo implementa, aquí solo el handler global)
     ============================================================ */
  const Cmdk = {
    open() {
      const overlay = document.getElementById('cmdk-overlay');
      if (!overlay) return;
      overlay.classList.add('open');
      const input = document.getElementById('cmdk-input');
      if (input) {
        input.value = '';
        input.focus();
      }
      if (window.Screens.cmdk && window.Screens.cmdk.update) {
        window.Screens.cmdk.update('');
      }
    },
    close() {
      const overlay = document.getElementById('cmdk-overlay');
      if (overlay) overlay.classList.remove('open');
    },
  };
  window.Cmdk = Cmdk;

  window.addEventListener('keydown', function (e) {
    // ⌘K / Ctrl+K abre palette
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      Cmdk.open();
      return;
    }
    // ESC cierra palette / sheet
    if (e.key === 'Escape') {
      const cmdk = document.getElementById('cmdk-overlay');
      const sheet = document.getElementById('sheet-overlay');
      if (cmdk && cmdk.classList.contains('open')) Cmdk.close();
      if (sheet && sheet.classList.contains('open')) sheet.classList.remove('open');
    }
  });

  /* ============================================================
     SHEET (helper para bottom sheet, Fase C3 lo usa)
     ============================================================ */
  window.openSheet = function (innerHtml) {
    const overlay = document.getElementById('sheet-overlay');
    const content = document.getElementById('sheet-content');
    if (!overlay || !content) return;
    content.innerHTML = innerHtml;
    overlay.classList.add('open');
  };
  window.closeSheet = function () {
    const overlay = document.getElementById('sheet-overlay');
    if (overlay) overlay.classList.remove('open');
  };

  /* ============================================================
     UTILIDADES UI (usadas en múltiples pantallas)
     ============================================================ */
  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function formatDateES(d) {
    if (!d) return '';
    if (typeof d === 'string') {
      const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) {
        const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
        return parseInt(m[3], 10) + ' ' + meses[parseInt(m[2], 10) - 1] + ' ' + m[1];
      }
      return d;
    }
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function diasDesde(fechaISO) {
    if (!fechaISO) return null;
    const f = new Date(fechaISO);
    if (isNaN(f)) return null;
    return Math.floor((Date.now() - f.getTime()) / (24 * 3600 * 1000));
  }

  function studioInitials(name) {
    if (!name) return '?';
    const parts = String(name).replace(/[^\w\sáéíóúñÁÉÍÓÚÑ]/g, '').split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function reports(s) { return (s && s.data && s.data.reports) || []; }
  function activities(s) { return (s && s.data && s.data.activities) || []; }
  function lastInteraction(s) {
    const ds = [];
    reports(s).forEach(function (r) { if (r && r.date) ds.push(r.date); });
    activities(s).forEach(function (a) { if (a && a.date) ds.push(a.date); });
    if (!ds.length) return null;
    return ds.sort().pop();
  }

  /* Normaliza campos contact que pueden venir como string o {valor, fuente_url, ...} */
  function readField(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'object' && 'valor' in v) return v.valor || '';
    return String(v);
  }

  window.Util = {
    escapeHtml: escapeHtml,
    formatDateES: formatDateES,
    diasDesde: diasDesde,
    studioInitials: studioInitials,
    reports: reports,
    activities: activities,
    lastInteraction: lastInteraction,
    readField: readField,
  };

  /* ============================================================
     INIT
     ============================================================ */
  function init() {
    console.info('[redesign] init…');

    // Pintar shell si el HTML aún no lo tiene
    if (window.Shell && typeof window.Shell.render === 'function') {
      window.Shell.render();
    } else {
      console.warn('[redesign] Shell.render no disponible. Asegúrate de cargar shell.js antes de app.js');
    }

    // Cargar datos (Fase G — todavía no hace nada real, solo placeholder)
    if (window.Data && typeof window.Data.loadAll === 'function') {
      window.Data.loadAll().then(function () {
        State.loading = false;
        hideLoader();
        navigateFromHash();
      }).catch(function (e) {
        State.error = e.message || String(e);
        State.loading = false;
        hideLoader();
        navigateFromHash();
      });
    } else {
      // Sin capa de datos aún (Fase B no tiene Data.loadAll) — pinta vacío
      State.loading = false;
      hideLoader();
      navigateFromHash();
    }
  }

  function hideLoader() {
    const loader = document.getElementById('app-loader');
    if (loader) loader.classList.add('hidden');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
