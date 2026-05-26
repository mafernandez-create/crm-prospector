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
     NOTIFICACIONES TOAST — usadas por toda la app con showNotification()
     ============================================================ */
  (function () {
    // Inyectar CSS una sola vez
    var styleId = 'crm-toast-style';
    if (!document.getElementById(styleId)) {
      var s = document.createElement('style');
      s.id = styleId;
      s.textContent = [
        '.crm-toast-wrap{position:fixed;bottom:24px;right:24px;z-index:9999;',
          'display:flex;flex-direction:column;gap:8px;pointer-events:none;}',
        '.crm-toast{display:flex;align-items:center;gap:10px;',
          'padding:12px 16px;border-radius:10px;font-size:14px;font-weight:500;',
          'color:#fff;max-width:360px;box-shadow:0 4px 16px rgba(0,0,0,.25);',
          'pointer-events:auto;cursor:default;',
          'animation:crm-toast-in .22s ease;}',
        '.crm-toast.hide{animation:crm-toast-out .22s ease forwards;}',
        '.crm-toast.success{background:#166534;}',
        '.crm-toast.error{background:#991b1b;}',
        '.crm-toast.warning{background:#92400e;}',
        '.crm-toast.info{background:#1e40af;}',
        '@keyframes crm-toast-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}',
        '@keyframes crm-toast-out{from{opacity:1}to{opacity:0;transform:translateY(8px)}}',
      ].join('');
      document.head.appendChild(s);
    }

    function getWrap() {
      var w = document.querySelector('.crm-toast-wrap');
      if (!w) {
        w = document.createElement('div');
        w.className = 'crm-toast-wrap';
        document.body.appendChild(w);
      }
      return w;
    }

    window.showNotification = function (msg, type) {
      type = type || 'info';
      var wrap = getWrap();
      var el = document.createElement('div');
      el.className = 'crm-toast ' + type;
      el.textContent = msg;
      wrap.appendChild(el);
      var dur = type === 'error' ? 6000 : type === 'warning' ? 5000 : 4000;
      setTimeout(function () {
        el.classList.add('hide');
        setTimeout(function () { el.remove(); }, 250);
      }, dur);
    };
  })();

  /* ============================================================
     NUEVO ANÁLISIS — sheet de alta rápida de empresa
     ============================================================ */
  window.openNuevoAnalisis = function () {
    var TIPOS = ['Arquitectura', 'Ingeniería', 'C.R. Regantes', 'Ciclo del agua',
                 'Promotora · Constructora', 'Administración pública', 'Hotel / Hostelería',
                 'Hospital', 'Distribuidor', 'Otros'];
    var PROVINCIAS = ['Almería', 'Cádiz', 'Córdoba', 'Granada', 'Huelva',
                      'Jaén', 'Málaga', 'Sevilla', 'Murcia', 'Badajoz', 'Otras'];

    var tipoOpts = TIPOS.map(function (t) {
      return '<option value="' + t + '">' + t + '</option>';
    }).join('');
    var provOpts = PROVINCIAS.map(function (p) {
      return '<option value="' + p + '">' + p + '</option>';
    }).join('');

    var fld = 'style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;' +
              'background:var(--bg-input,var(--bg-card));color:var(--fg-1);font-size:14px;box-sizing:border-box;"';

    window.openSheet(
      '<div style="display:flex;flex-direction:column;height:100%;overflow:hidden;padding:0;">' +

        // Header
        '<div style="flex-shrink:0;padding:16px 20px 12px;border-bottom:1px solid var(--line);' +
              'display:flex;align-items:center;justify-content:space-between;">' +
          '<div style="font-size:16px;font-weight:700;color:var(--fg-1);">➕ Nueva empresa</div>' +
          '<button onclick="closeSheet()" style="background:none;border:none;cursor:pointer;' +
                  'color:var(--fg-3);font-size:20px;line-height:1;padding:4px;">✕</button>' +
        '</div>' +

        // Cuerpo scrollable
        '<div style="flex:1;overflow-y:auto;padding:16px 20px;min-height:0;">' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +

            // Nombre — ocupa toda la fila
            '<div style="grid-column:1/-1;">' +
              '<label style="font-size:12px;color:var(--fg-3);display:block;margin-bottom:4px;">Nombre *</label>' +
              '<input id="na-nombre" ' + fld + ' placeholder="Ej. Estudio Ruiz Arquitectos"/>' +
            '</div>' +

            // Tipo
            '<div>' +
              '<label style="font-size:12px;color:var(--fg-3);display:block;margin-bottom:4px;">Tipo</label>' +
              '<select id="na-tipo" ' + fld + '>' + tipoOpts + '</select>' +
            '</div>' +

            // Provincia
            '<div>' +
              '<label style="font-size:12px;color:var(--fg-3);display:block;margin-bottom:4px;">Provincia</label>' +
              '<select id="na-provincia" ' + fld + '><option value="">— Selecciona —</option>' + provOpts + '</select>' +
            '</div>' +

            // Ciudad
            '<div>' +
              '<label style="font-size:12px;color:var(--fg-3);display:block;margin-bottom:4px;">Ciudad</label>' +
              '<input id="na-ciudad" ' + fld + ' placeholder="Ej. Sevilla"/>' +
            '</div>' +

            // Score
            '<div>' +
              '<label style="font-size:12px;color:var(--fg-3);display:block;margin-bottom:4px;">Score (1–10)</label>' +
              '<input id="na-score" type="number" min="1" max="10" value="5" ' + fld + '/>' +
            '</div>' +

            // Teléfono
            '<div>' +
              '<label style="font-size:12px;color:var(--fg-3);display:block;margin-bottom:4px;">Teléfono</label>' +
              '<input id="na-tel" ' + fld + ' placeholder="Ej. 955 000 000"/>' +
            '</div>' +

            // Email
            '<div>' +
              '<label style="font-size:12px;color:var(--fg-3);display:block;margin-bottom:4px;">Email</label>' +
              '<input id="na-email" type="email" ' + fld + ' placeholder="Ej. info@estudio.com"/>' +
            '</div>' +

            // Web — ocupa toda la fila
            '<div style="grid-column:1/-1;">' +
              '<label style="font-size:12px;color:var(--fg-3);display:block;margin-bottom:4px;">Web</label>' +
              '<input id="na-web" ' + fld + ' placeholder="Ej. https://estudio.com"/>' +
            '</div>' +

          '</div>' +
          '<div id="na-error" style="margin-top:10px;color:var(--mute-red-dark,#c0392b);font-size:13px;display:none;"></div>' +
        '</div>' +

        // Footer con botones
        '<div style="flex-shrink:0;padding:12px 20px 16px;border-top:1px solid var(--line);' +
              'display:flex;gap:10px;">' +
          '<button onclick="closeSheet()" ' +
                  'style="flex:1;padding:10px;border:1px solid var(--line);border-radius:8px;' +
                  'background:transparent;color:var(--fg-2);font-size:14px;font-weight:600;cursor:pointer;">' +
            'Cancelar' +
          '</button>' +
          '<button onclick="window._guardarNuevoAnalisis()" ' +
                  'style="flex:2;padding:10px;border:none;border-radius:8px;' +
                  'background:var(--gpf-blue-700,#1d4ed8);color:#fff;font-size:14px;font-weight:600;cursor:pointer;"' +
                  'id="na-save-btn">' +
            '✓ Crear empresa' +
          '</button>' +
        '</div>' +

      '</div>'
    );

    // Focus en el nombre
    setTimeout(function () {
      var el = document.getElementById('na-nombre');
      if (el) el.focus();
    }, 120);
  };

  window._guardarNuevoAnalisis = async function () {
    var nombre = (document.getElementById('na-nombre') || {}).value || '';
    nombre = nombre.trim();
    var errEl = document.getElementById('na-error');

    if (!nombre) {
      if (errEl) { errEl.textContent = '⚠️ El nombre es obligatorio.'; errEl.style.display = 'block'; }
      var n = document.getElementById('na-nombre'); if (n) n.focus();
      return;
    }
    if (errEl) errEl.style.display = 'none';

    var btn = document.getElementById('na-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

    // Calcular siguiente ID
    var maxId = 3000;
    (State.studios || []).forEach(function (s) {
      var n = parseInt(s.id, 10);
      if (!isNaN(n) && n > maxId) maxId = n;
    });
    var newId = String(maxId + 1);

    var tipo     = (document.getElementById('na-tipo')     || {}).value || 'Arquitectura';
    var ciudad   = ((document.getElementById('na-ciudad')   || {}).value || '').trim();
    var provincia= (document.getElementById('na-provincia') || {}).value || '';
    var score    = parseInt((document.getElementById('na-score') || {}).value || '5', 10);
    var tel      = ((document.getElementById('na-tel')     || {}).value || '').trim();
    var email    = ((document.getElementById('na-email')   || {}).value || '').trim();
    var web      = ((document.getElementById('na-web')     || {}).value || '').trim();
    if (web && !/^https?:\/\//i.test(web)) web = 'https://' + web;

    var studioObj = {
      name: nombre,
      type: tipo,
      city: ciudad,
      province: provincia,
      score: score,
      priority: score >= 7 ? 'alta' : score >= 4 ? 'media' : 'baja',
      status: 'nuevo',
      data: {
        contact: { address: '', phone: tel, email: email, web: web },
        team: [],
        projects: [],
        notes: '',
        description: '',
        comms: { callPitch: '', openingLine: '' },
        activities: [],
        reports: [],
      },
    };

    try {
      await window.Data.patchDoc('studios/' + newId, studioObj);

      // Actualizar State local sin recargar todo
      var full = Object.assign({ id: newId }, studioObj);
      State.studios = State.studios || [];
      State.studios.push(full);
      State.studiosById = State.studiosById || {};
      State.studiosById[newId] = full;

      window.closeSheet();
      if (window.showNotification) window.showNotification('✅ Empresa "' + nombre + '" creada (#' + newId + ')', 'success');
      window.showView('detail', { studioId: newId });

      // Auto-investigación en background — rellena campos desde web + IA
      if (window.Data && typeof window.Data.enrichStudio === 'function') {
        setTimeout(async function () {
          try {
            if (window.showNotification) window.showNotification('🔍 Investigando "' + nombre + '" en la web…', 'info');
            var result = await window.Data.enrichStudio(newId);
            var n = result && result.fieldsUpdated;
            if (n > 0) {
              if (window.showNotification) window.showNotification('✨ ' + n + ' campos completados automáticamente', 'success');
              // Re-render la ficha si sigue siendo la activa
              if (window.State.currentStudioId === newId && window.Screens.detail) {
                window.Screens.detail.render({ studioId: newId });
              }
            } else {
              if (window.showNotification) window.showNotification('ℹ️ No se encontraron datos adicionales en web', 'info');
            }
          } catch (e) {
            console.warn('[enrichStudio]', e.message);
            if (window.showNotification) window.showNotification('⚠️ Investigación web: ' + (e.message || 'sin datos'), 'warning');
          }
        }, 800);
      }
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = '✓ Crear empresa'; }
      if (errEl) { errEl.textContent = '⚠️ Error al guardar: ' + (e.message || e); errEl.style.display = 'block'; }
    }
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

    // Procesar OAuth callback de Google (Sheets / Calendar) si hay access_token en el hash
    _handleOAuthCallback();

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

  /* ============================================================
     OAUTH CALLBACK (Google Sheets / Calendar)
     Procesa el fragment #access_token=... que Google devuelve
     tras el redirect implicit flow.
     ============================================================ */
  function _handleOAuthCallback() {
    const hash = window.location.hash;
    if (!hash || !hash.includes('access_token')) return;
    try {
      const params = new URLSearchParams(hash.substring(1));
      const accessToken = params.get('access_token');
      const state      = params.get('state');
      const expiresIn  = parseInt(params.get('expires_in') || '3600', 10);
      if (!accessToken) return;

      if (state === 'sheets_auth') {
        const s = JSON.parse(localStorage.getItem('ferroplast_sheets_settings') || '{}');
        s.accessToken  = accessToken;
        s.tokenExpiry  = Date.now() + expiresIn * 1000;
        localStorage.setItem('ferroplast_sheets_settings', JSON.stringify(s));
        history.replaceState(null, '', window.location.pathname);
        // Notificar una vez que el DOM esté listo
        setTimeout(function () {
          if (window.showNotification) {
            window.showNotification('✅ Conectado a Google Sheets. Vuelve a pulsar "☁️ Sheet Jefe" para subir las visitas.', 'success');
          }
          // Re-render planificador si está activo
          if (State.currentView === 'planificador' && window.Screens.planificador) {
            window.Screens.planificador.render();
          }
        }, 600);
      } else if (state === 'gcal_auth') {
        const c = JSON.parse(localStorage.getItem('ferroplast_test_calendar_settings') || '{}');
        c.accessToken  = accessToken;
        c.tokenExpiry  = Date.now() + expiresIn * 1000;
        localStorage.setItem('ferroplast_test_calendar_settings', JSON.stringify(c));
        history.replaceState(null, '', window.location.pathname);
        setTimeout(function () {
          if (window.showNotification) {
            window.showNotification('✅ Conectado a Google Calendar.', 'success');
          }
        }, 600);
      }
    } catch (e) {
      console.warn('[app] OAuth callback parse error:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
