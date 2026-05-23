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
     DATOS — Fase G/v1.1: lee de State.studios real.
              Si la cartera no está cargada, mock fallback.
     ============================================================ */
  // Normaliza priorityQuadrant a "Q{n}" (Firestore lo guarda como número 1-9)
  function normalizeQ(v) {
    if (v == null) return null;
    if (typeof v === 'string' && /^Q[1-9]$/.test(v)) return v;
    if (typeof v === 'number' && v >= 1 && v <= 9) return 'Q' + v;
    if (typeof v === 'string' && /^[1-9]$/.test(v)) return 'Q' + v;
    return null;
  }

  const TIPO_LABELS = {
    ARQ: 'Arquitectura',
    ING: 'Ingeniería',
    CCRR: 'Comunidad de Regantes',
    OCV: 'Promotora · Constructora',
    CICA: 'Ciclo del agua',
    AAPP: 'Admin. Pública',
  };

  function getData() {
    const hasReal = State.studios && State.studios.length > 0;
    if (!hasReal) return mockData();

    // Cuadrantes Q1-Q9 con cuenta real
    const conteoQ = {};
    const conteoQActivos = {};
    const hace30 = new Date(State.today.getTime() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    for (const s of State.studios) {
      const q = normalizeQ(s.priorityQuadrant) || s.cuadrante || s.quadrant;
      if (!q) continue;
      conteoQ[q] = (conteoQ[q] || 0) + 1;
      const last = U.lastInteraction(s);
      if (last && last >= hace30) {
        conteoQActivos[q] = (conteoQActivos[q] || 0) + 1;
      }
    }
    const cuadrantes = [
      { q: 'Q1', label: 'Estratégico',      color: 'var(--q-estrategico)',    fg: '#fff' },
      { q: 'Q2', label: 'Cliente core',     color: 'var(--q-cliente-core)',   fg: '#fff' },
      { q: 'Q3', label: 'Cliente volumen',  color: 'var(--q-cliente-volumen)', fg: '#fff' },
      { q: 'Q4', label: 'Puerta entrada',   color: 'var(--q-puerta)',         fg: '#fff' },
      { q: 'Q5', label: 'Cartera estándar', color: 'var(--q-cartera)',        fg: '#fff' },
      { q: 'Q6', label: 'Mantenimiento',    color: 'var(--q-mantenimiento)',  fg: '#fff' },
      { q: 'Q7', label: 'Conector',         color: 'var(--q-conector)',       fg: '#fff' },
      { q: 'Q8', label: 'Seguimiento',      color: 'var(--q-seguimiento)',    fg: '#fff' },
      { q: 'Q9', label: 'Congelar',         color: 'var(--q-congelar)',       fg: 'var(--fg-1)' },
    ].map(function (c) {
      return Object.assign({}, c, {
        n: conteoQ[c.q] || 0,
        activos: conteoQActivos[c.q] || 0,
      });
    });

    // Cuántos studios SIN cuadrante (para mostrar advertencia)
    const sinCuadrante = State.studios.filter(function (s) { return !(normalizeQ(s.priorityQuadrant) || s.cuadrante || s.quadrant); }).length;

    return {
      cuadrantes: cuadrantes,
      sinCuadrante: sinCuadrante,
      enfriandose: pickEnfriandose(),
      altoPotencialVirgen: pickAltoPotencialVirgen(),
      visitasFallidas: pickVisitasFallidas(),
    };
  }

  function pickEnfriandose() {
    // score ≥7 con última interacción >45 días pero <365 (no nunca)
    const hace45 = new Date(State.today.getTime() - 45 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const hace365 = new Date(State.today.getTime() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const out = [];
    for (const s of State.studios) {
      if ((s.score || 0) < 7) continue;
      const last = U.lastInteraction(s);
      if (!last) continue;
      if (last >= hace45) continue;
      if (last < hace365) continue;
      out.push({
        studioId: s.id,
        name: s.name || s.id,
        tipo: TIPO_LABELS[s.type] || s.type || '—',
        province: s.province || '',
        dias: U.diasDesde(last),
        score: s.score || 0,
      });
    }
    out.sort(function (a, b) { return b.score - a.score || a.dias - b.dias; });
    return out.slice(0, 8);
  }

  function pickAltoPotencialVirgen() {
    const out = [];
    for (const s of State.studios) {
      if ((s.score || 0) < 8) continue;
      if (U.reports(s).length > 0) continue;
      out.push({
        studioId: s.id,
        name: s.name || s.id,
        tipo: TIPO_LABELS[s.type] || s.type || '—',
        city: s.city || '',
        province: s.province || '',
        score: s.score || 0,
      });
    }
    out.sort(function (a, b) { return b.score - a.score; });
    return out.slice(0, 8);
  }

  function pickVisitasFallidas() {
    const out = [];
    const re = /fallid|plantón|cancel|reprogram|no\s+pud|no\s+realiz/i;
    for (const s of State.studios) {
      const reps = U.reports(s);
      const hit = reps.some(function (r) {
        const txt = ((r && (r.notes || '')) + ' ' + (r && (r.title || '')) + ' ' + (r && (r.fileName || '')));
        return re.test(txt);
      });
      if (hit) {
        out.push({
          studioId: s.id,
          name: s.name || s.id,
          province: s.province || '',
        });
      }
    }
    return out.slice(0, 8);
  }

  function mockData() {
    return {
      cuadrantes: [
        { q: 'Q1', label: 'Estratégico',     n: 0, activos: 0, color: 'var(--q-estrategico)',    fg: '#fff' },
        { q: 'Q2', label: 'Cliente core',    n: 0, activos: 0, color: 'var(--q-cliente-core)',   fg: '#fff' },
        { q: 'Q3', label: 'Cliente volumen', n: 0, activos: 0, color: 'var(--q-cliente-volumen)', fg: '#fff' },
        { q: 'Q4', label: 'Puerta entrada',  n: 0, activos: 0, color: 'var(--q-puerta)',         fg: '#fff' },
        { q: 'Q5', label: 'Cartera estándar', n: 0, activos: 0, color: 'var(--q-cartera)',       fg: '#fff' },
        { q: 'Q6', label: 'Mantenimiento',   n: 0, activos: 0, color: 'var(--q-mantenimiento)',  fg: '#fff' },
        { q: 'Q7', label: 'Conector',        n: 0, activos: 0, color: 'var(--q-conector)',       fg: '#fff' },
        { q: 'Q8', label: 'Seguimiento',     n: 0, activos: 0, color: 'var(--q-seguimiento)',    fg: '#fff' },
        { q: 'Q9', label: 'Congelar',        n: 0, activos: 0, color: 'var(--q-congelar)',       fg: 'var(--fg-1)' },
      ],
      sinCuadrante: 0,
      enfriandose: [],
      altoPotencialVirgen: [],
      visitasFallidas: [],
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
        (d.sinCuadrante > 0 ? bannerSinCuadrante(d.sinCuadrante) : '') +
        matrizCuadrantes(d.cuadrantes) +
        twoColumnGrid(d) +
      '</div>'
    );
  }

  function bannerSinCuadrante(n) {
    return (
      '<div style="background:var(--gpf-blue-100); border:1px solid #c7dcef; border-radius:8px; ' +
        'padding:10px 14px; margin-bottom:16px; font-size:13px; color:var(--gpf-blue-900); ' +
        'display:flex; align-items:center; gap:8px;">' +
        '<span style="color:var(--gpf-blue-700);">' + I.AlertTriangle() + '</span>' +
        '<span><strong>' + n + ' estudios todavía sin clasificar en cuadrante</strong> · ' +
        'el batch nocturno los va asignando progresivamente. ' +
        'La cuenta total bajará a medida que se completen.</span>' +
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
