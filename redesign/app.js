/* CRM Prospector — rediseño v1 · app shell + data layer + router
 * Vanilla JS · sin frameworks · sin build.
 *
 * Estructura:
 *   - Data: capa de acceso a Firestore (REST público, mismo proyecto)
 *   - State: estado global (studios, planificador, briefings…)
 *   - Router: showView(name) gestiona la vista activa
 *   - Renderers: cada vista tiene su función render*()
 *
 * Las vistas concretas viven en renderers.js (cargado tras este archivo).
 */
(function () {
  'use strict';

  /* ============================================================
     CONFIG
     ============================================================ */
  const CFG = {
    project: 'ferroplast-crm',
    apiBase: 'https://firestore.googleapis.com/v1/projects/ferroplast-crm/databases/(default)/documents',
  };

  /* ============================================================
     STATE (global, simple)
     ============================================================ */
  const State = {
    studios: [],          // [{ id, name, type, city, province, status, data, ... }]
    studiosById: {},      // index para acceso O(1)
    planificador: null,   // { schedule: { 'YYYY-MM-DD': [...] } }
    metrics: null,        // métricas batch / search
    currentView: 'inicio',
    currentStudioId: null,
    today: new Date(),
    loading: true,
    error: null,
    user: { name: 'Manuel Fernández', initials: 'MA', role: 'Comercial · Andalucía' },
  };
  window.State = State;

  /* ============================================================
     FIRESTORE REST CLIENT (público, sin auth)
     ============================================================ */
  function unwrap(f) {
    if (f === null || f === undefined) return null;
    if ('stringValue' in f) return f.stringValue;
    if ('integerValue' in f) return parseInt(f.integerValue, 10);
    if ('doubleValue' in f) return f.doubleValue;
    if ('booleanValue' in f) return f.booleanValue;
    if ('nullValue' in f) return null;
    if ('timestampValue' in f) return f.timestampValue;
    if ('arrayValue' in f) return (f.arrayValue.values || []).map(unwrap);
    if ('mapValue' in f) {
      const o = {};
      for (const k of Object.keys(f.mapValue.fields || {})) {
        o[k] = unwrap(f.mapValue.fields[k]);
      }
      return o;
    }
    return null;
  }
  function fieldsToObj(fields) {
    const o = {};
    for (const k of Object.keys(fields || {})) o[k] = unwrap(fields[k]);
    return o;
  }

  async function getDoc(path) {
    const r = await fetch(`${CFG.apiBase}/${path}`);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`Firestore ${r.status} ${r.statusText} (${path})`);
    const j = await r.json();
    return { id: j.name.split('/').pop(), ...fieldsToObj(j.fields || {}) };
  }

  async function listCollection(name, opts = {}) {
    const docs = [];
    const pageSize = opts.pageSize || 300;
    const limit = opts.limit || Infinity;
    let pageToken = null;
    do {
      const u = new URL(`${CFG.apiBase}/${name}`);
      u.searchParams.set('pageSize', String(pageSize));
      if (pageToken) u.searchParams.set('pageToken', pageToken);
      const r = await fetch(u);
      if (!r.ok) throw new Error(`Firestore ${r.status} ${r.statusText} (${name})`);
      const j = await r.json();
      (j.documents || []).forEach((d) => {
        if (docs.length >= limit) return;
        docs.push({ id: d.name.split('/').pop(), ...fieldsToObj(d.fields || {}) });
      });
      pageToken = j.nextPageToken || null;
    } while (pageToken && docs.length < limit);
    return docs;
  }

  const Data = { getDoc, listCollection, fieldsToObj, unwrap };
  window.Data = Data;

  /* ============================================================
     CARGA INICIAL
     ============================================================ */
  async function loadAll() {
    State.loading = true;
    State.error = null;
    try {
      const [studios, plan] = await Promise.all([
        listCollection('studios', { pageSize: 300, limit: 5000 }),
        getDoc('_meta/planificador'),
      ]);
      State.studios = studios;
      State.studiosById = {};
      studios.forEach((s) => (State.studiosById[s.id] = s));
      State.planificador = plan;
      State.loading = false;
      console.info(`[redesign] cartera cargada: ${studios.length} estudios`);
    } catch (e) {
      console.error('[redesign] error de carga:', e);
      State.error = e.message || String(e);
      State.loading = false;
    }
  }

  /* ============================================================
     UTILIDADES DE STUDIOS
     ============================================================ */
  function reports(s) { return (s && s.data && s.data.reports) || []; }
  function activities(s) { return (s && s.data && s.data.activities) || []; }
  function lastInteraction(s) {
    const ds = [];
    for (const r of reports(s)) if (r && r.date) ds.push(r.date);
    for (const a of activities(s)) if (a && a.date) ds.push(a.date);
    if (!ds.length) return null;
    return ds.sort().pop();
  }
  function studioInitials(name) {
    if (!name) return '?';
    const parts = name.replace(/[^\w\sáéíóúñÁÉÍÓÚÑ]/g, '').split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /* ============================================================
     ROUTER
     ============================================================ */
  function showView(name, params = {}) {
    State.currentView = name;
    if (params.studioId) State.currentStudioId = params.studioId;
    document.querySelectorAll('.view').forEach((el) => {
      el.classList.toggle('active', el.id === `view-${name}`);
    });
    // Marcar nav activo
    document.querySelectorAll('.nav-item').forEach((el) => {
      el.classList.toggle('active', el.getAttribute('data-view') === name);
    });
    // Render
    if (window.Renderers && typeof window.Renderers[name] === 'function') {
      try {
        window.Renderers[name](params);
      } catch (e) {
        console.error('[redesign] error al renderizar', name, e);
      }
    }
    // Hash para enlace directo
    const hash = name + (params.studioId ? `/${params.studioId}` : '');
    if (location.hash.slice(1) !== hash) location.hash = hash;
  }
  function navigateFromHash() {
    const h = location.hash.slice(1) || 'inicio';
    const [v, ...rest] = h.split('/');
    const studioId = rest[0];
    showView(v, studioId ? { studioId } : {});
  }
  window.addEventListener('hashchange', navigateFromHash);
  window.showView = showView;

  /* ============================================================
     CMD+K PALETTE
     ============================================================ */
  const Cmdk = {
    open() {
      document.getElementById('cmdk-overlay').classList.add('open');
      const input = document.getElementById('cmdk-input');
      if (input) { input.value = ''; input.focus(); this.update(''); }
    },
    close() {
      document.getElementById('cmdk-overlay').classList.remove('open');
    },
    update(q) {
      if (window.Renderers && typeof window.Renderers.cmdk === 'function') {
        window.Renderers.cmdk({ query: q });
      }
    },
  };
  window.Cmdk = Cmdk;

  // Atajos globales
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      Cmdk.open();
      return;
    }
    const overlay = document.getElementById('cmdk-overlay');
    if (overlay && overlay.classList.contains('open') && e.key === 'Escape') {
      Cmdk.close();
    }
  });

  /* ============================================================
     UTILIDADES UI
     ============================================================ */
  function formatDateES(d) {
    if (!d) return '';
    if (typeof d === 'string') {
      const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) {
        const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
        return `${parseInt(m[3], 10)} ${meses[parseInt(m[2], 10) - 1]} ${m[1]}`;
      }
      return d;
    }
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function diasDesde(fechaISO) {
    if (!fechaISO) return '∞';
    const f = new Date(fechaISO);
    if (isNaN(f)) return '?';
    const d = Math.floor((Date.now() - f.getTime()) / (24 * 3600 * 1000));
    return d;
  }
  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const Util = { formatDateES, diasDesde, escapeHtml, studioInitials, reports, activities, lastInteraction };
  window.Util = Util;

  /* ============================================================
     ARRANQUE
     ============================================================ */
  async function init() {
    console.info('[redesign] init…');
    // Mostrar shell
    document.body.classList.remove('is-iphone');
    // Pintar la app (renderShell)
    if (window.Renderers && typeof window.Renderers.shell === 'function') {
      window.Renderers.shell();
    }
    // Cargar datos
    await loadAll();
    // Quitar loader
    document.getElementById('app-loader').classList.add('hidden');
    // Pintar la vista activa según hash o defecto
    navigateFromHash();
  }

  // Auto-init cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
