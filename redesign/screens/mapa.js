/* CRM Prospector · rediseño v1.1 — Mapa caliente
 *
 * Vista #mapa. Muestra Leaflet con círculos por provincia
 * dimensionados según el conteo de studios. Los studios no traen
 * lat/lng — agrupamos por provincia usando coordenadas hardcoded
 * de capitales españolas.
 *
 * Filtros:
 *   - Tipo (Arquitectura, Ingeniería, etc.)
 *   - Score mínimo
 *   - Estado (nuevo, contactado, …)
 *
 * Click en círculo → showView('studios') con filtro provincia.
 */
(function () {
  'use strict';

  const I = window.Icon;
  const State = window.State;
  const U = window.Util;
  const escape = U.escapeHtml;

  /* Coordenadas de capitales de provincia (España) — fuente: INE.
     Centradas en la capital, no en el centroide geométrico. */
  const PROV_COORDS = {
    'A Coruña': [43.371, -8.396], 'Coruña': [43.371, -8.396],
    'Álava': [42.847, -2.673], 'Albacete': [38.994, -1.859], 'Alicante': [38.345, -0.481],
    'Almería': [36.834, -2.464], 'Asturias': [43.362, -5.849], 'Ávila': [40.657, -4.700],
    'Badajoz': [38.879, -6.970], 'Balears': [39.570, 2.650], 'Baleares': [39.570, 2.650],
    'Barcelona': [41.387, 2.170], 'Bizkaia': [43.263, -2.935], 'Vizcaya': [43.263, -2.935],
    'Burgos': [42.341, -3.700], 'Cáceres': [39.476, -6.371], 'Cádiz': [36.527, -6.289],
    'Cantabria': [43.463, -3.808], 'Castellón': [39.987, -0.038], 'Ciudad Real': [38.984, -3.927],
    'Córdoba': [37.892, -4.778], 'Cuenca': [40.072, -2.135], 'Gipuzkoa': [43.318, -1.985],
    'Guipúzcoa': [43.318, -1.985], 'Girona': [41.984, 2.825], 'Gerona': [41.984, 2.825],
    'Granada': [37.176, -3.598], 'Guadalajara': [40.633, -3.166], 'Huelva': [37.262, -6.945],
    'Huesca': [42.137, -0.408], 'Jaén': [37.769, -3.789], 'León': [42.598, -5.567],
    'Lleida': [41.617, 0.620], 'Lérida': [41.617, 0.620], 'La Rioja': [42.466, -2.450],
    'Rioja': [42.466, -2.450], 'Logroño': [42.466, -2.450], 'Lugo': [43.012, -7.555],
    'Madrid': [40.416, -3.703], 'Málaga': [36.721, -4.421], 'Murcia': [37.984, -1.128],
    'Navarra': [42.812, -1.645], 'Ourense': [42.336, -7.864], 'Orense': [42.336, -7.864],
    'Palencia': [42.012, -4.532], 'Las Palmas': [28.099, -15.413], 'Pontevedra': [42.430, -8.648],
    'Salamanca': [40.965, -5.664], 'Santa Cruz de Tenerife': [28.463, -16.251], 'Tenerife': [28.463, -16.251],
    'Segovia': [40.948, -4.118], 'Sevilla': [37.388, -5.982], 'Soria': [41.764, -2.466],
    'Tarragona': [41.118, 1.245], 'Teruel': [40.344, -1.107], 'Toledo': [39.857, -4.024],
    'Valencia': [39.469, -0.376], 'València': [39.469, -0.376], 'Valladolid': [41.652, -4.724],
    'Zamora': [41.503, -5.744], 'Zaragoza': [41.648, -0.889],
    'Ceuta': [35.889, -5.323], 'Melilla': [35.293, -2.939],
  };

  /* Estado local */
  const Local = {
    map: null,         // Instancia Leaflet
    layer: null,       // LayerGroup con círculos
    filters: { tipo: '', status: '', scoreMin: 0 },
  };

  function provinciaCoord(prov) {
    if (!prov) return null;
    // Normaliza: quita acentos para fallback, prueba exact match primero
    if (PROV_COORDS[prov]) return PROV_COORDS[prov];
    const noAcc = prov.normalize('NFD').replace(/[̀-ͯ]/g, '');
    for (const k in PROV_COORDS) {
      const k2 = k.normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (k2.toLowerCase() === noAcc.toLowerCase()) return PROV_COORDS[k];
    }
    return null;
  }

  function normalizeQ(v) {
    if (v == null) return null;
    if (typeof v === 'number' && v >= 1 && v <= 9) return 'Q' + v;
    if (typeof v === 'string' && /^Q[1-9]$/.test(v)) return v;
    if (typeof v === 'string' && /^[1-9]$/.test(v)) return 'Q' + v;
    return null;
  }

  function colorPorScore(score) {
    if (score >= 8) return '#0a2d52';   // gpf-blue-900
    if (score >= 6) return '#3478b8';   // gpf-blue-500
    if (score >= 4) return '#7eb0d5';   // gpf-blue-300
    return '#c8d6e3';
  }

  function aplicaFiltros(studios) {
    return studios.filter(function (s) {
      if (Local.filters.tipo && s.type !== Local.filters.tipo) return false;
      if (Local.filters.status && s.status !== Local.filters.status) return false;
      if (Local.filters.scoreMin && (s.score || 0) < Local.filters.scoreMin) return false;
      return true;
    });
  }

  function agruparPorProvincia(studios) {
    const map = {};
    for (const s of studios) {
      const p = s.province || '—';
      if (!map[p]) map[p] = { provincia: p, n: 0, scoreSum: 0, studios: [] };
      map[p].n++;
      map[p].scoreSum += (s.score || 0);
      map[p].studios.push(s);
    }
    return Object.values(map);
  }

  /* ============================================================
     RENDER
     ============================================================ */
  function render() {
    const v = document.getElementById('view-mapa');
    if (!v) return;
    document.getElementById('topbar-current').textContent = 'Mapa caliente';

    v.innerHTML = (
      '<div style="max-width:1280px; margin:0 auto;">' +
        header() +
        toolbar() +
        '<div id="mapa-canvas" style="width:100%; height:65vh; border:1px solid var(--border-1); border-radius:8px; background:#eef3f8;"></div>' +
        leyenda() +
      '</div>'
    );

    setTimeout(initMap, 30);
  }

  function header() {
    return (
      '<header style="margin-bottom:12px;">' +
        '<div class="eyebrow">Distribución geográfica</div>' +
        '<h1 style="font-family:var(--font-display); font-weight:600; font-size:32px; line-height:1; ' +
          'text-transform:uppercase; letter-spacing:.005em; margin:6px 0 4px;">Mapa caliente</h1>' +
        '<p style="color:var(--fg-3); font-size:14px; margin:0;">Concentración de cartera por provincia. Tamaño del círculo proporcional al número de estudios.</p>' +
      '</header>'
    );
  }

  function toolbar() {
    const tipos = ['', 'ARQ', 'ING', 'CCRR', 'OCV', 'CICA', 'AAPP'];
    const status = ['', 'nuevo', 'contactado', 'reunion', 'ganado'];
    const tipoOpts = tipos.map(function (t) {
      return '<option value="' + escape(t) + '" ' + (Local.filters.tipo === t ? 'selected' : '') + '>' +
        (t === '' ? 'Todos los tipos' : escape(t)) + '</option>';
    }).join('');
    const statusOpts = status.map(function (s) {
      return '<option value="' + escape(s) + '" ' + (Local.filters.status === s ? 'selected' : '') + '>' +
        (s === '' ? 'Cualquier estado' : escape(s)) + '</option>';
    }).join('');
    return (
      '<div style="display:flex; gap:10px; align-items:center; margin-bottom:12px; padding:10px 12px; background:var(--bg-2); border-radius:8px; flex-wrap:wrap;">' +
        '<select onchange="window.Screens.mapa.setFiltro(\'tipo\', this.value)" style="padding:6px 8px; border:1px solid var(--border-1); border-radius:4px; font:inherit; font-size:13px;">' +
          tipoOpts +
        '</select>' +
        '<select onchange="window.Screens.mapa.setFiltro(\'status\', this.value)" style="padding:6px 8px; border:1px solid var(--border-1); border-radius:4px; font:inherit; font-size:13px;">' +
          statusOpts +
        '</select>' +
        '<label style="font-size:12px; color:var(--fg-3); display:flex; align-items:center; gap:6px;">' +
          'Score min: <input type="number" min="0" max="10" value="' + Local.filters.scoreMin + '" ' +
            'onchange="window.Screens.mapa.setFiltro(\'scoreMin\', parseInt(this.value)||0)" ' +
            'style="width:60px; padding:4px 6px; border:1px solid var(--border-1); border-radius:4px; font:inherit;">' +
        '</label>' +
        '<div style="flex:1;"></div>' +
        '<span id="mapa-count" style="font-size:12px; color:var(--fg-3);"></span>' +
      '</div>'
    );
  }

  function leyenda() {
    return (
      '<div style="display:flex; gap:14px; margin-top:8px; font-size:12px; color:var(--fg-3); flex-wrap:wrap;">' +
        '<span><span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:#0a2d52; vertical-align:middle; margin-right:4px;"></span> score ≥ 8</span>' +
        '<span><span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:#3478b8; vertical-align:middle; margin-right:4px;"></span> 6–7</span>' +
        '<span><span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:#7eb0d5; vertical-align:middle; margin-right:4px;"></span> 4–5</span>' +
        '<span><span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:#c8d6e3; vertical-align:middle; margin-right:4px;"></span> &lt; 4</span>' +
        '<span style="margin-left:auto;">Tamaño = nº empresas en la provincia</span>' +
      '</div>'
    );
  }

  /* ============================================================
     LEAFLET INIT
     ============================================================ */
  function initMap() {
    if (typeof L === 'undefined') {
      const c = document.getElementById('mapa-canvas');
      if (c) c.innerHTML = '<div style="padding:40px; text-align:center; color:var(--fg-3);">Cargando Leaflet…</div>';
      setTimeout(initMap, 200);
      return;
    }
    const canvas = document.getElementById('mapa-canvas');
    if (!canvas) return;

    if (!Local.map) {
      Local.map = L.map(canvas, { center: [40.0, -3.7], zoom: 6, scrollWheelZoom: true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 18,
      }).addTo(Local.map);
    } else {
      // Re-render — el canvas se acaba de re-crear, pero la instancia Leaflet
      // estaba apuntando al canvas viejo. Hay que destruir y crear nueva.
      try { Local.map.remove(); } catch (_) {}
      Local.map = L.map(canvas, { center: [40.0, -3.7], zoom: 6, scrollWheelZoom: true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 18,
      }).addTo(Local.map);
    }

    repintar();
  }

  function repintar() {
    if (!Local.map || typeof L === 'undefined') return;
    if (Local.layer) { Local.map.removeLayer(Local.layer); }
    Local.layer = L.layerGroup().addTo(Local.map);

    const filtrados = aplicaFiltros(State.studios || []);
    const grupos = agruparPorProvincia(filtrados).sort(function (a, b) { return b.n - a.n; });

    let plotted = 0;
    let unmapped = 0;
    for (const g of grupos) {
      const coord = provinciaCoord(g.provincia);
      if (!coord) { unmapped += g.n; continue; }
      const scoreMedio = g.n ? g.scoreSum / g.n : 0;
      const radio = Math.max(8, Math.min(50, Math.sqrt(g.n) * 4));
      const color = colorPorScore(scoreMedio);
      const provEsc = (g.provincia || '').replace(/'/g, '');
      const c = L.circleMarker(coord, {
        radius: radio,
        color: color,
        fillColor: color,
        fillOpacity: 0.55,
        weight: 1.5,
      }).bindPopup(
        '<div style="font-family:Inter,sans-serif;">' +
          '<strong>' + escape(g.provincia) + '</strong><br>' +
          escape(String(g.n)) + ' empresa' + (g.n === 1 ? '' : 's') + '<br>' +
          'Score medio: ' + scoreMedio.toFixed(1) + '<br>' +
          '<a href="#studios" onclick="setTimeout(function(){window.Screens.studios&&window.Screens.studios.setFiltro&&window.Screens.studios.setFiltro(\'provincia\',\'' + provEsc + '\')},50)" style="color:#0a2d52; font-weight:600;">Ver listado →</a>' +
        '</div>'
      );
      c.addTo(Local.layer);
      plotted += g.n;
    }

    const total = filtrados.length;
    const counter = document.getElementById('mapa-count');
    if (counter) {
      counter.textContent = total + ' empresa' + (total === 1 ? '' : 's') +
        ' · ' + plotted + ' geolocalizadas' +
        (unmapped > 0 ? ' · ' + unmapped + ' sin coords' : '');
    }
  }

  function setFiltro(k, v) {
    Local.filters[k] = v;
    repintar();
  }

  /* ============================================================
     REGISTRO
     ============================================================ */
  window.Screens = window.Screens || {};
  window.Screens.mapa = {
    render: render,
    setFiltro: setFiltro,
  };
})();
