/* CRM Prospector · rediseño v1 · Fase E — Cmd+K palette
 *
 * Origen: handoff desktop-screens.jsx · CmdK
 *
 * Comportamiento:
 *   - ⌘K abre (registrado en app.js).
 *   - ESC cierra (registrado en app.js).
 *   - ↑ / ↓ navega la selección entre hits.
 *   - ↵ ejecuta el hit seleccionado.
 *   - TAB cicla por las secciones (Empresas / Acciones / Navegar / Filtros).
 *   - Click en hit lo ejecuta también.
 *
 * Estructura del palette (ya montado en shell.js):
 *   <div class="cmdk-overlay">
 *     <div class="cmdk-palette">
 *       <div class="input-row">[Search] <input id="cmdk-input"/> [esc]</div>
 *       <div class="cmdk-results" id="cmdk-results">…SECCIONES…</div>
 *       <div class="cmdk-footer">↑↓ navegar · ↵ abrir · tab filtrar</div>
 *     </div>
 *   </div>
 *
 * Datos: empresas usa State.studios (si Fase G lo llena) o un catálogo
 * mock de ejemplo para que el palette funcione antes de wirear.
 */
(function () {
  'use strict';

  const I = window.Icon;
  const State = window.State;
  const U = window.Util;
  const escape = U.escapeHtml;

  /* ============================================================
     CATÁLOGO DE EJEMPLO (Fase E)
     Cuando State.studios esté cargado (Fase G), priorizamos eso.
     ============================================================ */
  const MOCK_EMPRESAS = [
    { id: '3012', name: 'J. Huesa Water Technology',           type: 'Arquitectura', city: 'Bollullos',           province: 'Sevilla',  cuadrante: 'Q9', score: 9 },
    { id: '2435', name: 'ARRAM Consultores',                    type: 'Ingeniería',   city: 'Badajoz',             province: 'Badajoz',  cuadrante: 'Q4', score: 8 },
    { id: '3014', name: 'NOVA HIDRÁULICA',                       type: 'Ingeniería',   city: 'Alcalá de Guadaíra', province: 'Sevilla',  cuadrante: 'Q3', score: 8 },
    { id: '3009', name: 'INAGEN',                                type: 'Ingeniería',   city: 'Dos Hermanas',        province: 'Sevilla',  cuadrante: 'Q2', score: 8 },
    { id: '3020', name: 'GESER Ingenieros',                       type: 'Ingeniería',   city: 'Sevilla',             province: 'Sevilla',  cuadrante: 'Q1', score: 9 },
    { id: '13',   name: 'SINGULAB Arquitectura e Ingeniería',     type: 'Arquitectura', city: 'Málaga',              province: 'Málaga',   cuadrante: 'Q5', score: 8 },
    { id: '202',  name: 'Hombre de Piedra Arquitectos',            type: 'Arquitectura', city: 'Sevilla',             province: 'Sevilla',  cuadrante: 'Q5', score: 8 },
    { id: '179',  name: 'Cruz y Ortiz Arquitectos SL',             type: 'Arquitectura', city: 'Sevilla',             province: 'Sevilla',  cuadrante: 'Q1', score: 8 },
    { id: '2',    name: 'AMA Arquitectos Málaga',                  type: 'Arquitectura', city: 'Málaga',              province: 'Málaga',   cuadrante: 'Q5', score: 8 },
    { id: '137',  name: 'Consultores Ingeniería UG21',              type: 'Ingeniería',   city: 'Sevilla',             province: 'Sevilla',  cuadrante: 'Q4', score: 8 },
    { id: '3027', name: 'Estudio Córdoba Levante SL',               type: 'Arquitectura', city: 'Córdoba',             province: 'Córdoba',  cuadrante: 'Q3', score: 7 },
    { id: 'hh9L', name: 'Proinaqua — Ing. del Agua',                type: 'Ingeniería',   city: 'Murcia',              province: 'Murcia',   cuadrante: 'Q1', score: 9 },
  ];

  function getEmpresas() {
    if (State.studios && State.studios.length) {
      return State.studios.map(function (s) {
        return {
          id: s.id,
          name: s.name || s.id,
          type: s.type,
          city: s.city,
          province: s.province,
          cuadrante: s.priorityQuadrant || s.cuadrante || s.quadrant,
          score: s.score,
        };
      });
    }
    return MOCK_EMPRESAS;
  }

  /* ============================================================
     STATE LOCAL DEL PALETTE
     ============================================================ */
  let _selectedIdx = 0;
  let _flatHits = [];   // lista plana de hits actualmente visibles
  let _query = '';
  let _sectionFilter = null;  // null = todas; 'empresas'|'acciones'|'navegar'|'filtros'

  /* ============================================================
     UPDATE — re-renderiza resultados
     ============================================================ */
  function update(q) {
    _query = (q || '').trim();
    _selectedIdx = 0;
    repaint();
  }

  function repaint() {
    const results = document.getElementById('cmdk-results');
    if (!results) return;

    // Recolectar hits por sección (respetando filtro si lo hay)
    _flatHits = [];
    const sections = [];

    if (!_sectionFilter || _sectionFilter === 'empresas') {
      const empresas = matchEmpresas(_query);
      if (empresas.length) {
        sections.push({ title: 'Empresas · ' + empresas.length + ' coincidencia' + (empresas.length === 1 ? '' : 's'),
                        hits: empresas.map(hitEmpresa) });
      }
    }
    if (!_sectionFilter || _sectionFilter === 'acciones') {
      const acciones = filterByQuery(buildAcciones(), _query);
      if (acciones.length) sections.push({ title: 'Acciones rápidas', hits: acciones });
    }
    if (!_sectionFilter || _sectionFilter === 'navegar') {
      const nav = filterByQuery(buildNavegar(), _query);
      if (nav.length) sections.push({ title: 'Navegar a…', hits: nav });
    }
    if (!_sectionFilter || _sectionFilter === 'filtros') {
      const filtros = filterByQuery(buildFiltros(), _query);
      if (filtros.length) sections.push({ title: 'Filtros guardados', hits: filtros });
    }

    // Flatten para keyboard nav
    sections.forEach(function (sec) {
      sec.hits.forEach(function (h) { _flatHits.push(h); });
    });

    // Render
    if (!sections.length) {
      results.innerHTML = (
        '<div style="padding:32px; text-align:center; color:var(--fg-3); font-size:13px;">' +
          'Sin coincidencias para <strong style="color:var(--fg-1)">' + escape(_query) + '</strong>' +
        '</div>'
      );
      return;
    }
    results.innerHTML = sections.map(renderSection).join('');

    // Marcar primer hit como selected
    selectIdx(_selectedIdx, false);
  }

  function renderSection(sec) {
    return (
      '<div class="cmdk-section">' +
        '<div class="cmdk-section-title">' + escape(sec.title) + '</div>' +
        sec.hits.map(renderHit).join('') +
      '</div>'
    );
  }

  function renderHit(h, idx) {
    const i = _flatHits.indexOf(h);
    const isSelected = i === _selectedIdx;
    return (
      '<div class="cmdk-hit' + (isSelected ? ' selected' : '') + '" data-idx="' + i + '">' +
        '<span class="icon">' + h.icon + '</span>' +
        '<div style="flex:1; min-width:0;">' +
          '<div class="title">' + escape(h.title) + '</div>' +
          (h.sub ? '<div class="sub">' + escape(h.sub) + '</div>' : '') +
        '</div>' +
        (h.trail
          ? (h.kbd ? '<span class="kbd-trail">' + escape(h.trail) + '</span>'
                   : '<span class="trail">' + escape(h.trail) + '</span>')
          : '') +
      '</div>'
    );
  }

  /* ============================================================
     HITS BUILDERS
     ============================================================ */
  function matchEmpresas(q) {
    if (!q) return [];
    const lo = q.toLowerCase();
    const empresas = getEmpresas();
    const hits = [];
    for (const e of empresas) {
      const score = scoreEmpresa(e, lo);
      if (score > 0) hits.push({ ...e, _score: score });
      if (hits.length >= 50) break;
    }
    hits.sort(function (a, b) { return b._score - a._score; });
    return hits.slice(0, 8);
  }

  function scoreEmpresa(e, lo) {
    let s = 0;
    const name = (e.name || '').toLowerCase();
    const city = (e.city || '').toLowerCase();
    const prov = (e.province || '').toLowerCase();
    if (name.indexOf(lo) === 0) s += 100;
    else if (name.indexOf(lo) >= 0) s += 50;
    if (city.indexOf(lo) >= 0) s += 20;
    if (prov.indexOf(lo) >= 0) s += 15;
    if (s > 0) s += (e.score || 0);  // boost por score interno
    return s;
  }

  function hitEmpresa(e) {
    return {
      key: 'emp:' + e.id,
      icon: I.Building(),
      title: e.name,
      sub: [e.type, e.city, e.cuadrante].filter(Boolean).join(' · '),
      trail: e.score ? 'score ' + e.score : '',
      onExecute: function () { window.showView('detail', { studioId: e.id }); },
    };
  }

  function buildAcciones() {
    return [
      { key: 'a:nuevo',     icon: I.Plus(),       title: 'Nuevo análisis',                trail: 'N', kbd: true, onExecute: function () { alert('TODO: nuevo análisis (Fase G)'); } },
      { key: 'a:informe',   icon: I.Edit(),       title: 'Redactar informe de visita',     trail: 'R', kbd: true, onExecute: function () { if (State.currentStudioId) window.showView('informe', { studioId: State.currentStudioId }); else alert('Selecciona primero un cliente'); } },
      { key: 'a:briefing',  icon: I.FileText(),   title: 'Generar briefing pre-visita',    trail: 'B', kbd: true, onExecute: function () { if (State.currentStudioId) window.showView('briefing', { studioId: State.currentStudioId }); else alert('Selecciona primero un cliente'); } },
      { key: 'a:llegar',    icon: I.Navigation(), title: 'Cómo llegar al próximo cliente', trail: 'G', kbd: true, onExecute: function () {
        if (window.Screens.comollegar && State.currentStudioId) window.Screens.comollegar.open(State.currentStudioId);
        else if (window.Screens.comollegar) window.Screens.comollegar.open('3012');
      } },
    ];
  }

  function buildNavegar() {
    return [
      { key: 'n:hoy',       icon: I.Home(),       title: 'Hoy',       trail: '⌘1', kbd: true, onExecute: function () { window.showView('inicio'); } },
      { key: 'n:empresas',  icon: I.Building(),   title: 'Empresas',  trail: '⌘2', kbd: true, onExecute: function () { window.showView('studios'); } },
      { key: 'n:dashboard', icon: I.TrendingUp(), title: 'Dashboard', trail: '⌘3', kbd: true, onExecute: function () { window.showView('dashboard'); } },
      { key: 'n:bandeja',   icon: I.Layers(),     title: 'Bandeja del agente', trail: '⌘4', kbd: true, onExecute: function () { window.showView('bandeja'); } },
    ];
  }

  function buildFiltros() {
    return [
      { key: 'f:atrasados',   icon: I.Filter(), title: 'Atrasados >14 días',         trail: '8 emp.',  onExecute: function () { alert('TODO: filtro atrasados (Fase G)'); } },
      { key: 'f:q1',          icon: I.Filter(), title: 'Q1 Estratégico · Andalucía', trail: '12 emp.', onExecute: function () { alert('TODO: filtro Q1 (Fase G)'); } },
      { key: 'f:sin-visitar', icon: I.Filter(), title: 'Score ≥8 sin visitar',       trail: '15 emp.', onExecute: function () { alert('TODO: filtro virgen (Fase G)'); } },
    ];
  }

  function filterByQuery(items, q) {
    if (!q) return items;
    const lo = q.toLowerCase();
    return items.filter(function (it) {
      return (it.title || '').toLowerCase().indexOf(lo) >= 0;
    });
  }

  /* ============================================================
     KEYBOARD NAV
     ============================================================ */
  function selectIdx(n, scroll) {
    if (!_flatHits.length) { _selectedIdx = 0; return; }
    const max = _flatHits.length - 1;
    if (n < 0) n = max;
    if (n > max) n = 0;
    _selectedIdx = n;
    const all = document.querySelectorAll('.cmdk-hit');
    all.forEach(function (el, i) {
      el.classList.toggle('selected', i === n);
    });
    if (scroll) {
      const cur = all[n];
      if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
    }
  }

  function executeSelected() {
    const hit = _flatHits[_selectedIdx];
    if (!hit) return;
    if (typeof hit.onExecute === 'function') hit.onExecute();
    window.Cmdk.close();
  }

  function cycleSection() {
    const order = ['empresas', 'acciones', 'navegar', 'filtros'];
    if (_sectionFilter === null) _sectionFilter = order[0];
    else {
      const idx = order.indexOf(_sectionFilter);
      _sectionFilter = idx >= order.length - 1 ? null : order[idx + 1];
    }
    repaint();
  }

  /* ============================================================
     EVENT HANDLERS
     ============================================================ */
  document.addEventListener('keydown', function (e) {
    const overlay = document.getElementById('cmdk-overlay');
    if (!overlay || !overlay.classList.contains('open')) return;

    // Solo interceptamos teclas si el palette está abierto
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectIdx(_selectedIdx + 1, true);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectIdx(_selectedIdx - 1, true);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      executeSelected();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      cycleSection();
    }
  });

  // Click delegation en results
  document.addEventListener('click', function (e) {
    const hitEl = e.target.closest && e.target.closest('.cmdk-hit');
    if (!hitEl) return;
    const overlay = document.getElementById('cmdk-overlay');
    if (!overlay || !overlay.classList.contains('open')) return;
    const idx = parseInt(hitEl.getAttribute('data-idx'), 10);
    if (isNaN(idx)) return;
    _selectedIdx = idx;
    executeSelected();
  });

  /* ============================================================
     OPEN/CLOSE HOOKS (los del shell quedan tal cual; añadimos cleanup)
     ============================================================ */
  // Al abrir, repintamos con query vacío
  const _originalOpen = window.Cmdk && window.Cmdk.open ? window.Cmdk.open : null;
  if (_originalOpen && window.Cmdk) {
    window.Cmdk.open = function () {
      _originalOpen();
      _query = '';
      _selectedIdx = 0;
      _sectionFilter = null;
      repaint();
    };
  }

  /* ============================================================
     EXPORT
     ============================================================ */
  window.Screens = window.Screens || {};
  window.Screens.cmdk = { update: update, repaint: repaint };
})();
