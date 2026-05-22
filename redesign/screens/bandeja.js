/* CRM Prospector · rediseño v1 · Fase D3 — Bandeja del agente
 *
 * Vista crítica del CRM (no estaba en el handoff visual, derivada del DS).
 *
 * Estructura:
 *   - Header con eyebrow fecha + h1 "Bandeja del agente" + tagline
 *   - Matriz 3×3 cuadrantes Q1-Q9 (cada celda con color DS, label, conteo,
 *     conteo de activos en 30 días). Click navega al listado filtrado.
 *   - Grid 2 columnas con 2 cards:
 *     · Cuentas enfriándose (score≥7, lastInteraction <-45d)
 *     · Alto potencial sin visitar (score≥8 sin reports)
 *   - Card span-2: Visitas fallidas / a reprogramar
 *
 * Datos mock Fase D. Fase G hará el cálculo real sobre State.studios.
 */
(function () {
  'use strict';

  const I = window.Icon;
  const State = window.State;
  const U = window.Util;
  const escape = U.escapeHtml;

  /* ============================================================
     MOCK DATA (Fase D)
     ============================================================ */
  function getData() {
    return {
      cuadrantes: [
        { q: 'Q1', label: 'Estratégico',     n: 12,  activos: 5,  color: 'var(--q-estrategico)',    fg: '#fff' },
        { q: 'Q2', label: 'Cliente core',    n: 38,  activos: 14, color: 'var(--q-cliente-core)',   fg: '#fff' },
        { q: 'Q3', label: 'Cliente volumen', n: 84,  activos: 22, color: 'var(--q-cliente-volumen)', fg: '#fff' },
        { q: 'Q4', label: 'Puerta entrada',  n: 47,  activos: 11, color: 'var(--q-puerta)',         fg: '#fff' },
        { q: 'Q5', label: 'Cartera estándar', n: 209, activos: 31, color: 'var(--q-cartera)',       fg: '#fff' },
        { q: 'Q6', label: 'Mantenimiento',   n: 156, activos: 18, color: 'var(--q-mantenimiento)',  fg: '#fff' },
        { q: 'Q7', label: 'Conector',        n: 23,  activos: 6,  color: 'var(--q-conector)',       fg: '#fff' },
        { q: 'Q8', label: 'Seguimiento',     n: 311, activos: 12, color: 'var(--q-seguimiento)',    fg: '#fff' },
        { q: 'Q9', label: 'Congelar',        n: 717, activos: 8,  color: 'var(--q-congelar)',       fg: 'var(--fg-1)' },
      ],
      enfriandose: [
        { studioId: '13',    name: 'SINGULAB Arquitectura e Ingeniería', tipo: 'Arquitectura',         province: 'Málaga',   dias: 124, score: 8 },
        { studioId: '2',     name: 'AMA Arquitectos Málaga',             tipo: 'Arquitectura',         province: 'Málaga',   dias: 125, score: 8 },
        { studioId: '202',   name: 'Hombre de Piedra Arquitectos',       tipo: 'Arquitectura',         province: 'Sevilla',  dias: 117, score: 8 },
        { studioId: '2435',  name: 'ARRAM Consultores',                   tipo: 'Ingeniería',           province: 'Badajoz',  dias: 73,  score: 8 },
        { studioId: '2599',  name: 'Aguas de El Ejido',                   tipo: 'Ciclo del agua',       province: 'Almería',  dias: 64,  score: 8 },
        { studioId: '293',   name: 'INGHO Ingeniería y FM',               tipo: 'Ingeniería',           province: 'Málaga',   dias: 58,  score: 8 },
      ],
      altoPotencialVirgen: [
        { studioId: '179',   name: 'Cruz y Ortiz Arquitectos SL',          tipo: 'Arquitectura', city: 'Sevilla',   province: 'Sevilla', score: 8 },
        { studioId: 'hh9L',  name: 'Proinaqua — Ing. del Agua',            tipo: 'Ingeniería',   city: 'Murcia',    province: 'Murcia',  score: 9 },
        { studioId: '137',   name: 'Consultores Ingeniería UG21',           tipo: 'Ingeniería',   city: 'Sevilla',   province: 'Sevilla', score: 8 },
        { studioId: '101',   name: 'Reina y Asociados Arquitectura',        tipo: 'Arquitectura', city: 'Sevilla',   province: 'Sevilla', score: 8 },
        { studioId: '177',   name: 'Estudio JSDALP SLP',                    tipo: 'Arquitectura', city: 'Sevilla',   province: 'Sevilla', score: 8 },
        { studioId: '126',   name: 'NuVe Arquitectos',                      tipo: 'Arquitectura', city: 'Sevilla',   province: 'Sevilla', score: 8 },
      ],
      visitasFallidas: [
        { studioId: '3016', name: 'ECOFLUVIAL',                  province: 'Sevilla' },
        { studioId: '3017', name: 'AGRIMENSUR',                  province: 'Sevilla' },
        { studioId: '3029', name: 'ININCO',                       province: 'Córdoba' },
      ],
    };
  }

  /* ============================================================
     RENDER
     ============================================================ */
  function render() {
    const v = document.getElementById('view-bandeja');
    if (!v) return;
    document.getElementById('topbar-current').textContent = 'Bandeja del agente';
    const d = getData();
    v.innerHTML = (
      '<div style="max-width:1180px; margin:0 auto;">' +
        header() +
        matrizCuadrantes(d.cuadrantes) +
        twoColumnGrid(d) +
      '</div>'
    );
  }

  function header() {
    const fecha = State.today.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
    const fechaCap = fecha.charAt(0).toUpperCase() + fecha.slice(1);
    return (
      '<header style="margin-bottom:20px;">' +
        '<div class="eyebrow">Agente CRM · ' + escape(fechaCap) + '</div>' +
        '<h1 style="font-family:var(--font-display); font-weight:600; font-size:32px; line-height:1; ' +
          'text-transform:uppercase; letter-spacing:.005em; margin:6px 0 4px;">Bandeja del agente</h1>' +
        '<p style="color:var(--fg-3); font-size:14px; margin:0;">Acciones priorizadas que el agente ha detectado en tu cartera.</p>' +
      '</header>'
    );
  }

  function matrizCuadrantes(cuadrantes) {
    return (
      '<section style="margin-bottom:24px;">' +
        '<div class="eyebrow" style="margin-bottom:10px;">Cuadrantes · scoring por influencia × red</div>' +
        '<div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px;">' +
          cuadrantes.map(function (q) {
            return (
              '<div style="background:' + q.color + '; color:' + q.fg + '; border-radius:8px; padding:12px 14px; cursor:pointer;" ' +
                'onclick="showView(\'studios\')">' +
                '<div style="font-family:var(--font-mono); font-size:11px; opacity:.8; letter-spacing:.08em; font-weight:600;">' + q.q + '</div>' +
                '<div style="font-family:var(--font-display); font-weight:700; font-size:18px; line-height:1.1; margin-top:2px;">' + escape(q.label) + '</div>' +
                '<div style="display:flex; align-items:baseline; gap:6px; margin-top:8px; font-family:var(--font-mono); font-size:12px; opacity:.85;">' +
                  '<span style="font-family:var(--font-display); font-size:22px; font-weight:600;">' + q.n + '</span>' +
                  '<span>empresa' + (q.n === 1 ? '' : 's') + '</span>' +
                  (q.activos > 0 ? '<span>· ' + q.activos + ' activa' + (q.activos === 1 ? '' : 's') + ' (30d)</span>' : '') +
                '</div>' +
              '</div>'
            );
          }).join('') +
        '</div>' +
      '</section>'
    );
  }

  function twoColumnGrid(d) {
    return (
      '<div style="display:grid; grid-template-columns:1fr 1fr; gap:18px;">' +
        cardEnfriandose(d.enfriandose) +
        cardAltoPotencial(d.altoPotencialVirgen) +
        cardVisitasFallidas(d.visitasFallidas) +
      '</div>'
    );
  }

  function cardEnfriandose(rows) {
    return (
      '<div class="card" style="padding:16px;">' +
        cardHeader('Cuentas enfriándose', rows.length, 'var(--mute-red)', 'chip-red', I.AlertTriangle()) +
        '<p style="font-size:13px; color:var(--fg-3); margin:0 0 12px;">+45 días sin contacto con score ≥7. Toca reactivar antes de que se duerman del todo.</p>' +
        rows.map(function (s) {
          return (
            '<div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-top:1px solid var(--line); cursor:pointer;" ' +
              'onclick="showView(\'detail\', { studioId: \'' + escape(s.studioId) + '\' })">' +
              '<div style="min-width:0; flex:1;">' +
                '<div style="font-size:14px; font-weight:600; color:var(--fg-1); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + escape(s.name) + '</div>' +
                '<div style="font-size:12px; color:var(--fg-3);">' + escape(s.tipo + ' · ' + s.province) + '</div>' +
              '</div>' +
              '<div style="text-align:right; flex:0 0 auto;">' +
                '<div style="font-family:var(--font-mono); font-size:12px; color:var(--mute-red-dark); font-weight:600;">' + s.dias + 'd</div>' +
                '<div style="font-size:11px; color:var(--fg-3);">score ' + s.score + '</div>' +
              '</div>' +
            '</div>'
          );
        }).join('') +
      '</div>'
    );
  }

  function cardAltoPotencial(rows) {
    return (
      '<div class="card" style="padding:16px;">' +
        cardHeader('Alto potencial sin visitar', rows.length, 'var(--gpf-blue-700)', 'chip-accent', I.Target()) +
        '<p style="font-size:13px; color:var(--fg-3); margin:0 0 12px;">Score ≥8 que nunca has visitado. Prioridad de calle.</p>' +
        rows.map(function (s) {
          return (
            '<div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-top:1px solid var(--line); cursor:pointer;" ' +
              'onclick="showView(\'detail\', { studioId: \'' + escape(s.studioId) + '\' })">' +
              '<div style="min-width:0; flex:1;">' +
                '<div style="font-size:14px; font-weight:600; color:var(--fg-1); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + escape(s.name) + '</div>' +
                '<div style="font-size:12px; color:var(--fg-3);">' + escape(s.tipo + ' · ' + s.city + ' · ' + s.province) + '</div>' +
              '</div>' +
              '<div style="text-align:right; flex:0 0 auto;">' +
                '<div style="font-family:var(--font-mono); font-size:12px; color:var(--gpf-blue-700); font-weight:600;">score ' + s.score + '</div>' +
              '</div>' +
            '</div>'
          );
        }).join('') +
      '</div>'
    );
  }

  function cardVisitasFallidas(rows) {
    return (
      '<div class="card" style="padding:16px; grid-column:span 2;">' +
        cardHeader('Visitas fallidas o a reprogramar', rows.length, 'var(--fg-2)', 'chip', I.AlertTriangle()) +
        (rows.length
          ? '<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px 24px;">' +
              rows.map(function (s) {
                return (
                  '<div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-top:1px solid var(--line); cursor:pointer;" ' +
                    'onclick="showView(\'detail\', { studioId: \'' + escape(s.studioId) + '\' })">' +
                    '<div style="min-width:0; flex:1;">' +
                      '<div style="font-size:14px; font-weight:600; color:var(--fg-1); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + escape(s.name) + '</div>' +
                      '<div style="font-size:12px; color:var(--fg-3);">' + escape(s.province || '') + '</div>' +
                    '</div>' +
                    '<span style="color:var(--fg-muted);">' + I.ChevronRight() + '</span>' +
                  '</div>'
                );
              }).join('') +
            '</div>'
          : '<div style="padding:16px 0; color:var(--fg-3); font-size:13px; text-align:center;">Sin visitas fallidas recientes.</div>') +
      '</div>'
    );
  }

  function cardHeader(title, n, iconColor, chipClass, iconHtml) {
    return (
      '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">' +
        '<div style="display:flex; align-items:center; gap:8px;">' +
          '<span style="color:' + iconColor + ';">' + iconHtml + '</span>' +
          '<h3 style="font-family:var(--font-display); font-weight:600; font-size:16px; text-transform:uppercase; letter-spacing:.01em; margin:0;">' + escape(title) + '</h3>' +
        '</div>' +
        '<span class="chip ' + chipClass + '">' + n + '</span>' +
      '</div>'
    );
  }

  /* ============================================================
     EXPORT
     ============================================================ */
  window.Screens = window.Screens || {};
  window.Screens.bandeja = { render: render };
})();
