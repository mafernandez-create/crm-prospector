/* CRM Prospector · rediseño v1 — Pipeline de pliegos (V2 informes por proyecto)
 *
 * Tablero tipo kanban de los PROYECTOS "trabajados" agrupados por estado.
 * "Trabajado" = el proyecto tiene id estable (lo tocó un informe) o tiene
 * informes enlazados → así filtramos el ruido de proyectos scrapeados.
 *
 * La prescripción se gana por pliego/proyecto; esta vista da la foto por estado
 * (En preparación → Ejecutado) y es la base del #5 (validar prescripción real).
 *
 * Lee de State.studios[].data.{projects,reports}. Defensivo: si no hay proyectos
 * trabajados, muestra empty-state (no rompe).
 */
(function () {
  'use strict';

  const State  = window.State;
  const U      = window.Util;
  const escape = U.escapeHtml;

  const ESTADOS = [
    { k: 'en_preparacion', label: 'En preparación', color: '#64748b' },
    { k: 'convocado',      label: 'Convocado',      color: '#0ea5e9' },
    { k: 'adjudicado',     label: 'Adjudicado',     color: '#7c3aed' },
    { k: 'en_ejecucion',   label: 'En ejecución',   color: '#16a34a' },
    { k: 'ejecutado',      label: 'Ejecutado',      color: '#854d0e' },
  ];

  function build() {
    const out = { _otros: [] };
    ESTADOS.forEach(function (e) { out[e.k] = []; });
    const studios = (State && State.studios) || [];
    studios.forEach(function (s) {
      const projs = (s.data && s.data.projects) || [];
      const reps  = (s.data && s.data.reports)  || [];
      projs.forEach(function (p, i) {
        const pNom = p.nombre || p.name || '';
        const linked = reps.filter(function (r) {
          return (p.id && r.project_id === p.id) || (pNom && r.project_nombre === pNom);
        });
        if (!(p.id || linked.length)) return;   // solo proyectos trabajados
        const item = {
          studioId: s.id, studioName: s.name || s.id, idx: i,
          nombre: pNom || ('Proyecto ' + (i + 1)),
          estado: p.estado || null,
          nReports: linked.length,
          lastDate: linked.map(function (r) { return r.date; }).filter(Boolean).sort().pop() || null,
        };
        out[out[p.estado] ? p.estado : '_otros'].push(item);
      });
    });
    // ordenar cada columna por última actividad desc
    Object.keys(out).forEach(function (k) {
      out[k].sort(function (a, b) { return (b.lastDate || '').localeCompare(a.lastDate || ''); });
    });
    return out;
  }

  function card(it) {
    return (
      '<div class="card" style="padding:12px; margin-bottom:10px; cursor:pointer;" ' +
        'onclick="window.showView(\'detail\', { studioId: \'' + escape(String(it.studioId)) + '\' })">' +
        '<div style="font-size:14px; font-weight:600; color:var(--fg-1); line-height:1.25;">' + escape(it.nombre) + '</div>' +
        '<div style="font-size:12px; color:var(--fg-3); margin-top:3px;">🏢 ' + escape(it.studioName) + '</div>' +
        '<div style="display:flex; gap:8px; margin-top:7px; font-size:11px; color:var(--fg-3); flex-wrap:wrap;">' +
          '<span style="background:var(--gpf-blue-100); color:var(--gpf-blue-700); padding:2px 7px; border-radius:8px; font-weight:600;">📁 ' + it.nReports + ' informe' + (it.nReports !== 1 ? 's' : '') + '</span>' +
          (it.lastDate ? '<span>🕑 ' + escape(U.formatDateES(it.lastDate) || it.lastDate) + '</span>' : '') +
        '</div>' +
      '</div>'
    );
  }

  function column(label, color, items) {
    return (
      '<div style="flex:0 0 270px; max-width:270px;">' +
        '<div style="display:flex; align-items:center; gap:8px; margin-bottom:10px; padding-bottom:8px; border-bottom:2px solid ' + color + ';">' +
          '<span style="width:9px; height:9px; border-radius:50%; background:' + color + ';"></span>' +
          '<span style="font-family:var(--font-display); font-weight:600; font-size:14px; text-transform:uppercase; letter-spacing:.02em; color:var(--fg-1);">' + escape(label) + '</span>' +
          '<span style="margin-left:auto; font-size:12px; color:var(--fg-3); font-family:var(--font-mono);">' + items.length + '</span>' +
        '</div>' +
        (items.length ? items.map(card).join('')
          : '<div style="font-size:12px; color:var(--fg-4); padding:14px 4px; text-align:center;">—</div>') +
      '</div>'
    );
  }

  function emptyState() {
    return (
      '<div style="max-width:520px; margin:60px auto; text-align:center; padding:0 24px;">' +
        '<div style="font-size:40px; margin-bottom:12px;">📁</div>' +
        '<h2 style="font-family:var(--font-display); font-weight:600; font-size:22px; margin:0 0 8px;">Pipeline de pliegos</h2>' +
        '<p style="font-size:14px; color:var(--fg-3); line-height:1.6;">Aún no hay proyectos con informes asociados. ' +
          'Cuando generes o importes un informe enlazado a un proyecto concreto, ese pliego aparecerá aquí agrupado por su estado.</p>' +
      '</div>'
    );
  }

  function render() {
    const v = document.getElementById('view-pipeline');
    if (!v) return;
    const tc = document.getElementById('topbar-current'); if (tc) tc.textContent = 'Pipeline de pliegos';
    const data = build();
    const total = ESTADOS.reduce(function (n, e) { return n + data[e.k].length; }, 0) + data._otros.length;
    if (!total) { v.innerHTML = emptyState(); return; }
    v.innerHTML = (
      '<div style="margin-bottom:16px;">' +
        '<div class="eyebrow">Prescripción por proyecto</div>' +
        '<h1 style="font-family:var(--font-display); font-weight:700; font-size:26px; text-transform:uppercase; margin:2px 0 0;">Pipeline de pliegos</h1>' +
        '<p style="font-size:13px; color:var(--fg-3); margin:6px 0 0;">' + total + ' proyecto' + (total !== 1 ? 's' : '') + ' con informes · agrupados por estado</p>' +
      '</div>' +
      '<div style="display:flex; gap:16px; overflow-x:auto; padding-bottom:16px; align-items:flex-start;">' +
        ESTADOS.map(function (e) { return column(e.label, e.color, data[e.k]); }).join('') +
        (data._otros.length ? column('Sin estado', '#94a3b8', data._otros) : '') +
      '</div>'
    );
  }

  window.Screens = window.Screens || {};
  window.Screens.pipeline = { render: render };
})();
