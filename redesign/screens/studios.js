/* CRM Prospector · rediseño v1.1 — Listado de empresas
 *
 * Vista #studios — antes era placeholder. Ahora:
 *   - Tabla con sticky header
 *   - Filtros: búsqueda libre + provincia + tipo + status + score min
 *   - Paginación 50/página
 *   - Click en fila → ficha
 *   - Cuenta total + cuenta filtrada
 *
 * Lee de State.studios (Fase G). Si no hay datos, empty state.
 */
(function () {
  'use strict';

  const I = window.Icon;
  const State = window.State;
  const U = window.Util;
  const escape = U.escapeHtml;

  /* ============================================================
     ESTADO LOCAL (filtros + paginación)
     ============================================================ */
  const FILTERS = {
    q: '',
    provincia: '',
    tipo: '',
    status: '',
    scoreMin: 0,
    pagina: 1,
  };
  const POR_PAGINA = 50;

  const TIPO_LABELS = {
    ARQ: 'Arquitectura',
    ING: 'Ingeniería',
    CCRR: 'Comunidad de Regantes',
    OCV: 'Promotora · Constructora',
    CICA: 'Ciclo del agua',
    AAPP: 'Admin. Pública',
  };

  /* ============================================================
     RENDER
     ============================================================ */
  function render() {
    const v = document.getElementById('view-studios');
    if (!v) return;
    document.getElementById('topbar-current').textContent = 'Empresas';

    if (!State.studios || State.studios.length === 0) {
      if (window.States && window.States.showEmpty) {
        window.States.showEmpty('view-studios', {
          icon: I.Building(),
          title: 'Cartera vacía',
          body: 'No hay estudios cargados. ¿Acaba de iniciar la app o hay un problema de conexión?',
          ctas: [{ label: 'Recargar', onclick: 'location.reload()' }],
        });
      } else {
        v.innerHTML = '<div style="padding:40px; text-align:center;">Sin datos. Recarga la página.</div>';
      }
      return;
    }

    v.innerHTML = build();
    wire();
  }

  function build() {
    // Calcular filtros disponibles a partir de la cartera
    const provincias = uniqueSorted(State.studios.map(function (s) { return s.province; }).filter(Boolean));
    const tipos = uniqueSorted(State.studios.map(function (s) { return s.type; }).filter(Boolean));
    const statuses = uniqueSorted(State.studios.map(function (s) { return s.status; }).filter(Boolean));

    // Aplicar filtros y obtener slice paginado
    const filtered = applyFilters(State.studios);
    const totalFiltered = filtered.length;
    const totalGeneral = State.studios.length;
    const totalPaginas = Math.max(1, Math.ceil(totalFiltered / POR_PAGINA));
    if (FILTERS.pagina > totalPaginas) FILTERS.pagina = 1;
    const desde = (FILTERS.pagina - 1) * POR_PAGINA;
    const slice = filtered.slice(desde, desde + POR_PAGINA);

    return (
      '<div style="max-width:1180px; margin:0 auto;">' +
        header(totalFiltered, totalGeneral) +
        filterBar(provincias, tipos, statuses) +
        tabla(slice) +
        paginacion(FILTERS.pagina, totalPaginas, totalFiltered) +
      '</div>'
    );
  }

  /* ============================================================
     SUB-BLOQUES
     ============================================================ */
  function header(filtradas, total) {
    return (
      '<div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:16px;">' +
        '<div>' +
          '<div class="eyebrow" style="margin-bottom:4px;">Cartera</div>' +
          '<h1 style="font-family:var(--font-display); font-weight:600; font-size:32px; line-height:1; ' +
            'text-transform:uppercase; letter-spacing:.005em; margin:0;">Empresas</h1>' +
        '</div>' +
        '<div style="font-family:var(--font-mono); font-size:13px; color:var(--fg-3);">' +
          (filtradas === total
            ? formatNum(total) + ' estudios'
            : formatNum(filtradas) + ' de ' + formatNum(total) + ' (filtrado)') +
        '</div>' +
      '</div>'
    );
  }

  function filterBar(provincias, tipos, statuses) {
    return (
      '<div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:18px; align-items:center;">' +
        // Búsqueda
        '<div style="display:flex; align-items:center; gap:8px; flex:1; min-width:280px; ' +
          'background:var(--bg-card); border:1px solid var(--line); border-radius:8px; padding:6px 10px;">' +
          '<span style="color:var(--fg-3);">' + I.Search() + '</span>' +
          '<input id="studios-q" type="search" placeholder="Buscar por nombre, ciudad…" ' +
            'value="' + escape(FILTERS.q) + '" ' +
            'style="flex:1; border:0; outline:none; font:inherit; font-size:14px; background:transparent; color:var(--fg-1);"/>' +
        '</div>' +
        // Provincia
        selectFilter('studios-prov', 'Provincia', FILTERS.provincia, provincias) +
        // Tipo
        selectFilter('studios-tipo', 'Tipo', FILTERS.tipo, tipos, function (t) { return TIPO_LABELS[t] || t; }) +
        // Status
        selectFilter('studios-status', 'Estado', FILTERS.status, statuses) +
        // Score min
        '<select id="studios-score" class="field" style="height:38px; padding:0 10px; min-height:38px; font-size:13px; width:auto;">' +
          [0, 5, 6, 7, 8, 9].map(function (n) {
            return '<option value="' + n + '"' + (FILTERS.scoreMin === n ? ' selected' : '') + '>' +
              (n === 0 ? 'Cualquier score' : 'Score ≥ ' + n) + '</option>';
          }).join('') +
        '</select>' +
        // Reset
        ((FILTERS.q || FILTERS.provincia || FILTERS.tipo || FILTERS.status || FILTERS.scoreMin)
          ? '<button class="btn btn-ghost" id="studios-reset" style="height:38px; padding:0 12px; font-size:13px;">' +
              I.X() + ' Limpiar' +
            '</button>'
          : '') +
      '</div>'
    );
  }

  function selectFilter(id, label, value, options, mapLabel) {
    return (
      '<select id="' + id + '" class="field" style="height:38px; padding:0 10px; min-height:38px; font-size:13px; width:auto; min-width:140px;">' +
        '<option value="">' + escape(label) + ' (todas)</option>' +
        options.map(function (o) {
          const lab = mapLabel ? mapLabel(o) : o;
          return '<option value="' + escape(o) + '"' + (value === o ? ' selected' : '') + '>' + escape(lab) + '</option>';
        }).join('') +
      '</select>'
    );
  }

  function tabla(rows) {
    if (!rows.length) {
      return (
        '<div class="card" style="padding:48px 20px; text-align:center;">' +
          '<div style="color:var(--fg-3); font-size:14px;">' +
            'Sin resultados con los filtros aplicados.' +
          '</div>' +
        '</div>'
      );
    }
    return (
      '<div class="card" style="padding:0; overflow:hidden;">' +
        // Header
        '<div style="display:grid; grid-template-columns:2fr 1fr 1fr 110px 1fr 70px 60px; ' +
          'padding:10px 14px; background:var(--paper-warm); border-bottom:1px solid var(--line); ' +
          'font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.12em; color:var(--fg-3);">' +
          '<span>Empresa</span>' +
          '<span>Tipo</span>' +
          '<span>Provincia</span>' +
          '<span>Cuadrante</span>' +
          '<span>Última act.</span>' +
          '<span style="text-align:right;">Días</span>' +
          '<span style="text-align:right;">Score</span>' +
        '</div>' +
        // Rows
        rows.map(function (s, i) {
          const last = i === rows.length - 1;
          const lastDate = U.lastInteraction(s);
          const dias = lastDate ? U.diasDesde(lastDate) : null;
          const diasLabel = dias === null ? '—' : (dias > 365 ? '+1a' : dias + 'd');
          const diasColor = dias === null ? 'var(--fg-3)'
                           : dias > 45 ? 'var(--mute-red-dark)'
                           : dias > 14 ? 'var(--ink-700)'
                           : 'var(--ink-500)';
          const score = s.score || 0;
          const scoreColor = score >= 8 ? 'var(--gpf-blue-700)'
                            : score >= 5 ? 'var(--ink-700)'
                            : 'var(--fg-3)';
          return (
            '<div data-studio-id="' + escape(s.id) + '" ' +
              'style="display:grid; grid-template-columns:2fr 1fr 1fr 110px 1fr 70px 60px; ' +
              'padding:11px 14px; ' + (last ? '' : 'border-bottom:1px solid var(--line);') + ' ' +
              'font-size:13px; align-items:center; cursor:pointer; transition:background .12s;" ' +
              'onmouseover="this.style.background=\'var(--ink-100)\'" ' +
              'onmouseout="this.style.background=\'transparent\'">' +
              '<span style="font-weight:600; color:var(--fg-1); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="' + escape(s.name) + '">' +
                escape(s.name || '—') +
              '</span>' +
              '<span style="color:var(--fg-2);">' + escape(TIPO_LABELS[s.type] || s.type || '—') + '</span>' +
              '<span style="color:var(--fg-2);">' + escape(s.province || '—') + '</span>' +
              '<span style="color:var(--fg-2); font-family:var(--font-mono); font-size:12px;" title="' + escape(s.priorityQuadrantName || '') + '">' +
                escape(s.priorityQuadrant || s.cuadrante || s.quadrant || '—') +
              '</span>' +
              '<span style="color:var(--fg-2); font-family:var(--font-mono); font-size:12px;">' +
                (lastDate ? U.formatDateES(lastDate) : '—') +
              '</span>' +
              '<span style="text-align:right; font-family:var(--font-mono); color:' + diasColor + '; font-weight:600;">' +
                escape(diasLabel) +
              '</span>' +
              '<span style="text-align:right; font-family:var(--font-mono); color:' + scoreColor + '; font-weight:600;">' +
                (score || '—') +
              '</span>' +
            '</div>'
          );
        }).join('') +
      '</div>'
    );
  }

  function paginacion(actual, total, totalRows) {
    if (total <= 1) return '';
    return (
      '<div style="display:flex; align-items:center; justify-content:space-between; margin-top:16px; font-size:13px;">' +
        '<div style="color:var(--fg-3);">' +
          'Página ' + actual + ' de ' + total +
          ' · ' + formatNum(totalRows) + ' estudios' +
        '</div>' +
        '<div style="display:flex; gap:8px;">' +
          (actual > 1
            ? '<button class="btn btn-ghost" id="pag-prev" style="height:36px; padding:0 12px; font-size:13px;">' +
                I.ArrowLeft() + ' Anterior</button>'
            : '<button class="btn btn-ghost" disabled style="height:36px; padding:0 12px; font-size:13px; opacity:.4;">' +
                I.ArrowLeft() + ' Anterior</button>') +
          (actual < total
            ? '<button class="btn btn-ghost" id="pag-next" style="height:36px; padding:0 12px; font-size:13px;">' +
                'Siguiente ' + I.ArrowRight() + '</button>'
            : '<button class="btn btn-ghost" disabled style="height:36px; padding:0 12px; font-size:13px; opacity:.4;">' +
                'Siguiente ' + I.ArrowRight() + '</button>') +
        '</div>' +
      '</div>'
    );
  }

  /* ============================================================
     LÓGICA DE FILTRADO + ORDENACIÓN
     ============================================================ */
  function applyFilters(rows) {
    const q = (FILTERS.q || '').trim().toLowerCase();
    const out = rows.filter(function (s) {
      if (q) {
        const hay = ((s.name || '') + ' ' + (s.city || '') + ' ' + (s.province || '')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      if (FILTERS.provincia && s.province !== FILTERS.provincia) return false;
      if (FILTERS.tipo && s.type !== FILTERS.tipo) return false;
      if (FILTERS.status && s.status !== FILTERS.status) return false;
      if (FILTERS.scoreMin > 0 && (s.score || 0) < FILTERS.scoreMin) return false;
      return true;
    });
    // Ordenar por score DESC, luego última actividad DESC
    out.sort(function (a, b) {
      const sa = a.score || 0, sb = b.score || 0;
      if (sa !== sb) return sb - sa;
      const la = U.lastInteraction(a) || '';
      const lb = U.lastInteraction(b) || '';
      if (lb !== la) return lb > la ? 1 : -1;
      return 0;
    });
    return out;
  }

  function uniqueSorted(arr) {
    const seen = {};
    const out = [];
    for (const x of arr) {
      if (!seen[x]) { seen[x] = 1; out.push(x); }
    }
    out.sort();
    return out;
  }

  function formatNum(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  /* ============================================================
     WIRING
     ============================================================ */
  function wire() {
    const v = document.getElementById('view-studios');
    if (!v) return;

    // Filtros
    const q = document.getElementById('studios-q');
    if (q) {
      q.addEventListener('input', debounce(function () {
        FILTERS.q = q.value;
        FILTERS.pagina = 1;
        render();
      }, 250));
    }
    bindSelect('studios-prov',   'provincia');
    bindSelect('studios-tipo',   'tipo');
    bindSelect('studios-status', 'status');
    const score = document.getElementById('studios-score');
    if (score) {
      score.addEventListener('change', function () {
        FILTERS.scoreMin = parseInt(score.value, 10) || 0;
        FILTERS.pagina = 1;
        render();
      });
    }
    const reset = document.getElementById('studios-reset');
    if (reset) reset.addEventListener('click', function () {
      FILTERS.q = '';
      FILTERS.provincia = '';
      FILTERS.tipo = '';
      FILTERS.status = '';
      FILTERS.scoreMin = 0;
      FILTERS.pagina = 1;
      render();
    });

    // Paginación
    const prev = document.getElementById('pag-prev');
    const next = document.getElementById('pag-next');
    if (prev) prev.addEventListener('click', function () { FILTERS.pagina--; render(); window.scrollTo(0, 0); });
    if (next) next.addEventListener('click', function () { FILTERS.pagina++; render(); window.scrollTo(0, 0); });

    // Click en fila
    v.querySelectorAll('[data-studio-id]').forEach(function (row) {
      row.addEventListener('click', function () {
        const id = row.getAttribute('data-studio-id');
        if (id) window.showView('detail', { studioId: id });
      });
    });
  }

  function bindSelect(elId, filterKey) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.addEventListener('change', function () {
      FILTERS[filterKey] = el.value;
      FILTERS.pagina = 1;
      render();
    });
  }

  function debounce(fn, ms) {
    let t = null;
    return function () {
      const a = arguments, x = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(x, a); }, ms);
    };
  }

  /* ============================================================
     EXPORT
     ============================================================ */
  window.Screens = window.Screens || {};
  window.Screens.studios = { render: render };
})();
