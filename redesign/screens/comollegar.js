/* CRM Prospector · rediseño v1 · Fase C3 — Bottom sheet "Cómo llegar"
 *
 * Origen: handoff mobile-screens.jsx · ScreenComoLlegar
 *
 * Estructura del sheet:
 *   - Handle visual (drag indicator)
 *   - Eyebrow "Cómo llegar" + botón X cerrar
 *   - h3 dirección + sub ciudad·CP
 *   - Map preview SVG decorativo (calles + pin rojo)
 *   - 3 opciones con brand marks:
 *       · Apple Maps  → maps://maps.apple.com/?q=…  (predeterminado iOS)
 *       · Google Maps → https://maps.google.com/?q=…  (tráfico)
 *       · Waze        → https://waze.com/ul?q=…  (alternativas)
 *   - Botón "Copiar dirección" con feedback inline
 *
 * Cómo abrir desde otra pantalla:
 *   window.Screens.comollegar.open(studioId);
 *
 * El sheet se cierra al pulsar X, hacer click fuera (en el overlay)
 * o pulsar ESC (manejado en app.js).
 */
(function () {
  'use strict';

  const I = window.Icon;
  const M = window.BrandMarks;
  const State = window.State;
  const U = window.Util;
  const escape = U.escapeHtml;

  /* ============================================================
     CATÁLOGO MOCK (compartido con detail.js — Fase C2)
     Fase G: leemos de State.studiosById[id] como fallback.
     ============================================================ */
  const MOCK = {
    '3012': { name: 'J. Huesa Water Technology', address: 'Av. Valencina 25', city: 'Bollullos de la Mitación', province: 'Sevilla', cp: '41110' },
    '2435': { name: 'ARRAM Consultores',         address: 'Av. Sinforiano Madroñero 5', city: 'Badajoz', province: 'Badajoz', cp: '06011' },
    '3014': { name: 'NOVA HIDRÁULICA',           address: 'C/ Voluntad 6-8, P.I. Cabeza Hermosa', city: 'Alcalá de Guadaíra', province: 'Sevilla', cp: '41500' },
    '3009': { name: 'INAGEN',                    address: 'C/ Río Viejo, 89, P.I. Ctra. de la Isla', city: 'Dos Hermanas', province: 'Sevilla', cp: '41703' },
    '3020': { name: 'GESER Ingenieros',          address: 'Sevilla',                    city: 'Sevilla',          province: 'Sevilla', cp: '' },
  };

  function getLocation(id) {
    // Preferimos datos reales si la capa está cargada (Fase G)
    if (State.studiosById && State.studiosById[id]) {
      const s = State.studiosById[id];
      const contact = (s.data && s.data.contact) || {};
      return {
        name: s.name || s.id,
        address: U.readField(contact.address) || '',
        city: s.city || '',
        province: s.province || '',
        cp: s.cp || (s.data && s.data.cp) || '',
      };
    }
    return MOCK[id] || null;
  }

  /* ============================================================
     OPEN — pinta y muestra el sheet
     ============================================================ */
  function open(studioId) {
    const loc = getLocation(studioId);
    if (!loc) {
      console.warn('[comollegar] location no encontrada para id=', studioId);
      return;
    }
    const html = buildHtml(loc);
    window.openSheet(html);
    // Pequeña animación: el .sheet-overlay.open ya tiene transition
    // Listeners delegados:
    wireSheetActions(loc);
  }

  /* ============================================================
     HTML del sheet
     ============================================================ */
  function buildHtml(loc) {
    const fullAddr = [loc.address, loc.city, loc.province, loc.cp].filter(Boolean).join(', ');
    const enc = encodeURIComponent(fullAddr);

    const apps = [
      {
        id: 'apple',
        name: 'Apple Maps',
        sub: 'Predeterminado del sistema',
        href: 'maps://maps.apple.com/?q=' + enc,
        brand: M.AppleMaps(44),
      },
      {
        id: 'google',
        name: 'Google Maps',
        sub: 'Tráfico en vivo',
        href: 'https://maps.google.com/?q=' + enc,
        target: '_blank',
        brand: M.GoogleMaps(44),
      },
      {
        id: 'waze',
        name: 'Waze',
        sub: 'Rutas alternativas',
        href: 'https://waze.com/ul?q=' + enc,
        target: '_blank',
        brand: M.Waze(44),
      },
    ];

    return (
      '<div class="handle"></div>' +

      // Header del sheet
      '<div style="display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:6px;">' +
        '<div class="eyebrow">Cómo llegar</div>' +
        '<button style="background:transparent; border:0; padding:6px; min-width:44px; min-height:44px; ' +
          'display:flex; align-items:center; justify-content:center; color:var(--fg-3); cursor:pointer;" ' +
          'onclick="closeSheet()" aria-label="Cerrar">' +
          I.X() +
        '</button>' +
      '</div>' +

      // Dirección
      '<h3 style="font-family:var(--font-display); font-weight:600; font-size:22px; color:var(--fg-1); ' +
        'letter-spacing:-0.01em; line-height:1.15; margin:0 0 4px;">' +
        escape(loc.address || loc.name) +
      '</h3>' +
      '<div style="font-size:14px; color:var(--fg-3); margin-bottom:18px;">' +
        escape([loc.city, loc.province, loc.cp].filter(Boolean).join(', ')) +
      '</div>' +

      // Map preview SVG decorativo
      mapPreview() +

      // 3 opciones de navegación
      '<div style="display:flex; flex-direction:column; gap:8px;">' +
        apps.map(function (a) {
          return (
            '<a href="' + a.href + '"' +
              (a.target ? ' target="' + a.target + '"' : '') +
              ' rel="noopener" data-app="' + a.id + '"' +
              ' style="display:flex; align-items:center; gap:14px; padding:10px 12px; min-height:64px; ' +
                'background:var(--paper-warm); border:1px solid var(--line); border-radius:12px; ' +
                'text-decoration:none; color:inherit;">' +
              a.brand +
              '<div style="flex:1; min-width:0;">' +
                '<div style="font-size:16px; font-weight:600; color:var(--fg-1);">' + escape(a.name) + '</div>' +
                '<div style="font-size:13px; color:var(--fg-3);">' + escape(a.sub) + '</div>' +
              '</div>' +
              '<span style="color:var(--fg-muted);">' + I.ChevronRight() + '</span>' +
            '</a>'
          );
        }).join('') +
      '</div>' +

      // Copiar dirección
      '<button id="copy-addr-btn" data-addr="' + escape(fullAddr.replace(/"/g, '&quot;')) + '" ' +
        'style="margin-top:14px; width:100%; height:44px; background:transparent; border:0; ' +
          'color:var(--fg-3); font-size:14px; font-weight:500; cursor:pointer;">' +
        'Copiar dirección' +
      '</button>'
    );
  }

  function mapPreview() {
    // SVG decorativo de calles con pin rojo (no es un mapa real)
    return (
      '<div style="height:120px; border-radius:10px; margin-bottom:18px; ' +
        'background:linear-gradient(135deg, #d9e8f5 0%, #c2dcef 50%, #e6f0fa 100%); ' +
        'position:relative; overflow:hidden; border:1px solid var(--line);">' +
        '<svg width="100%" height="100%" viewBox="0 0 350 120" preserveAspectRatio="none" style="position:absolute; inset:0;" aria-hidden="true">' +
          '<path d="M0 60 L350 30" stroke="#fff" stroke-width="14"/>' +
          '<path d="M120 0 L180 120" stroke="#fff" stroke-width="10"/>' +
          '<path d="M0 90 L350 95" stroke="#fff" stroke-width="8"/>' +
          '<path d="M0 60 L350 30" stroke="#a7b0ba" stroke-width="0.5"/>' +
          '<path d="M120 0 L180 120" stroke="#a7b0ba" stroke-width="0.5"/>' +
          '<rect x="30" y="65" width="60" height="20" fill="#e8eaef"/>' +
          '<rect x="200" y="40" width="80" height="35" fill="#e8eaef"/>' +
          '<rect x="240" y="80" width="60" height="25" fill="#e8eaef"/>' +
        '</svg>' +
        '<div style="position:absolute; left:52%; top:48%; transform:translate(-50%,-100%); color:var(--mute-red);">' +
          '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
            '<path d="M12 22s-7-7.5-7-13a7 7 0 1 1 14 0c0 5.5-7 13-7 13z" fill="currentColor" stroke="#fff" stroke-width="1.5"/>' +
            '<circle cx="12" cy="9" r="2.5" fill="#fff"/>' +
          '</svg>' +
        '</div>' +
      '</div>'
    );
  }

  /* ============================================================
     ACCIONES DEL SHEET (copy + cierre tras tap en app)
     ============================================================ */
  function wireSheetActions(loc) {
    const copyBtn = document.getElementById('copy-addr-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        const addr = copyBtn.getAttribute('data-addr');
        if (!addr) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(addr).then(
            function () {
              copyBtn.textContent = '✓ Copiada al portapapeles';
              copyBtn.style.color = '#14704a';
            },
            function () {
              fallbackCopy(addr, copyBtn);
            }
          );
        } else {
          fallbackCopy(addr, copyBtn);
        }
      });
    }

    // Cuando se pulsa una app, cerrar el sheet (la navegación nativa se ocupa)
    const sheet = document.getElementById('sheet-content');
    if (sheet) {
      sheet.querySelectorAll('a[data-app]').forEach(function (a) {
        a.addEventListener('click', function () {
          // Mini delay para que el href se dispare antes del close
          setTimeout(function () { window.closeSheet(); }, 50);
        });
      });
    }
  }

  function fallbackCopy(text, btn) {
    const tmp = document.createElement('textarea');
    tmp.value = text;
    tmp.style.position = 'fixed';
    tmp.style.opacity = '0';
    document.body.appendChild(tmp);
    tmp.select();
    try {
      document.execCommand('copy');
      btn.textContent = '✓ Copiada';
      btn.style.color = '#14704a';
    } catch (e) {
      btn.textContent = 'No se pudo copiar';
    }
    document.body.removeChild(tmp);
  }

  /* ============================================================
     EXPORT
     ============================================================ */
  window.Screens = window.Screens || {};
  window.Screens.comollegar = { open: open };
})();
