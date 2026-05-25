/* CRM Prospector · rediseño v1 — librería de iconos Lucide stroke 1.75
 *
 * Traducido literal desde el handoff (icons.jsx). Cada icono es una función
 * que devuelve string SVG inline, para inyectar con .innerHTML.
 *
 * Uso:   element.innerHTML = Icon.MapPin();
 *        element.innerHTML = `<button>${Icon.Plus()} Añadir</button>`;
 *
 * Tamaño: por defecto 20×20 (var --icon-size si quieres modificarlo a nivel
 * página). Para sm: añadir class "icon-sm" (16×16). Para lg: "icon-lg" (24×24).
 *
 * Brand marks: window.BrandMarks.{AppleMaps,GoogleMaps,Waze}(size) → div con SVG.
 */
(function () {
  'use strict';

  const _ = (path) =>
    `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;

  const Icon = {
    /* Navegación + acción */
    Menu:       () => _('<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/>'),
    Search:     () => _('<circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/>'),
    Filter:     () => _('<polygon points="3 5 21 5 14 13 14 19 10 21 10 13 3 5"/>'),
    Plus:       () => _('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
    X:          () => _('<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>'),
    Check:      () => _('<polyline points="4 12 10 18 20 6"/>'),
    Edit:       () => _('<path d="M3 21l3-1 12-12-2-2L4 18z"/><path d="M14 6l4 4"/>'),
    Save:       () => _('<path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><polyline points="7 4 7 10 15 10"/>'),
    Printer:    () => _('<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>'),
    Download:   () => _('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),

    /* Cursores */
    ArrowLeft:    () => _('<line x1="20" y1="12" x2="4" y2="12"/><polyline points="10 6 4 12 10 18"/>'),
    ArrowRight:   () => _('<line x1="4" y1="12" x2="20" y2="12"/><polyline points="14 6 20 12 14 18"/>'),
    ChevronRight: () => _('<polyline points="9 6 15 12 9 18"/>'),
    ChevronDown:  () => _('<polyline points="6 9 12 15 18 9"/>'),

    /* Contacto y campo */
    MapPin:     () => _('<path d="M12 22s-7-7.5-7-13a7 7 0 1 1 14 0c0 5.5-7 13-7 13z"/><circle cx="12" cy="9" r="2.5"/>'),
    Navigation: () => _('<polygon points="3 11 22 2 13 21 11 13 3 11"/>'),
    Phone:      () => _('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8 9.5a16 16 0 0 0 6 6l1.1-1.1a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2z"/>'),
    Mail:       () => _('<rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="3 7 12 13 21 7"/>'),

    /* Tiempo */
    Calendar: () => _('<rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/>'),
    Clock:    () => _('<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/>'),

    /* Entidades CRM */
    Building:   () => _('<rect x="4" y="3" width="16" height="18" rx="1.5"/><line x1="9" y1="8" x2="9" y2="8"/><line x1="15" y1="8" x2="15" y2="8"/><line x1="9" y1="12" x2="9" y2="12"/><line x1="15" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="15" y2="16"/>'),
    Briefcase:  () => _('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><line x1="3" y1="13" x2="21" y2="13"/>'),
    User:       () => _('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
    FileText:   () => _('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="14 3 14 9 20 9"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>'),

    /* Layout */
    Home:       () => _('<path d="M3 11.5L12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z"/>'),
    Layers:     () => _('<polygon points="12 3 22 8 12 13 2 8 12 3"/><polyline points="2 13 12 18 22 13"/><polyline points="2 18 12 23 22 18"/>'),
    Target:     () => _('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>'),

    /* Sistema y estado */
    Bell:           () => _('<path d="M18 16V11a6 6 0 1 0-12 0v5l-2 3h16z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
    AlertTriangle:  () => _('<path d="M12 3l10 18H2L12 3z"/><line x1="12" y1="10" x2="12" y2="14"/><line x1="12" y1="17.5" x2="12" y2="17.6"/>'),
    Activity:       () => _('<polyline points="3 12 7 12 10 4 14 20 17 12 21 12"/>'),
    TrendingUp:     () => _('<polyline points="3 17 9 11 13 15 21 7"/><polyline points="15 7 21 7 21 13"/>'),
    Cmd:            () => _('<path d="M9 9V6.5a2.5 2.5 0 1 0-2.5 2.5H9zm0 0v6m0 0H6.5A2.5 2.5 0 1 0 9 17.5V15zm0 0h6m0 0V6.5a2.5 2.5 0 1 1 2.5 2.5H15zm0 0v6m0 0v2.5a2.5 2.5 0 1 0 2.5-2.5H15z"/>'),
    Sun:            () => _('<circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/><line x1="5" y1="5" x2="7" y2="7"/><line x1="17" y1="17" x2="19" y2="19"/><line x1="5" y1="19" x2="7" y2="17"/><line x1="17" y1="7" x2="19" y2="5"/>'),

    /* Indicadores iOS status bar */
    Wifi:    () => _('<path d="M2 9a16 16 0 0 1 20 0"/><path d="M5 12.5a11 11 0 0 1 14 0"/><path d="M8.5 16a6 6 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1"/>'),
    Battery: () => _('<rect x="2" y="8" width="18" height="8" rx="1.5"/><rect x="3.5" y="9.5" width="13" height="5" rx="0.5" fill="currentColor" stroke="none"/><line x1="22" y1="11" x2="22" y2="13"/>'),
    Signal:  () => _('<rect x="3" y="15" width="3" height="5" fill="currentColor" stroke="none"/><rect x="9" y="11" width="3" height="9" fill="currentColor" stroke="none"/><rect x="15" y="7" width="3" height="13" fill="currentColor" stroke="none"/><rect x="20" y="3" width="3" height="17" fill="currentColor" stroke="none" opacity="0.35"/>'),
  };

  /* Marcas de apps de navegación — usados en bottom sheet "Cómo llegar" */
  const BrandMarks = {
    AppleMaps: (size = 44) => `
      <div class="brand-mark" style="width:${size}px;height:${size}px;border-radius:10px;background:linear-gradient(180deg,#7ed957,#3da95f 55%,#1a6cd6);display:flex;align-items:center;justify-content:center;box-shadow:inset 0 -1px 0 rgba(0,0,0,.15);">
        <svg width="${Math.round(size * 0.55)}" height="${Math.round(size * 0.55)}" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 22s-7-7.5-7-13a7 7 0 1 1 14 0c0 5.5-7 13-7 13z" stroke="#fff" stroke-width="1.75"/>
          <circle cx="12" cy="9" r="2.5" stroke="#fff" stroke-width="1.75"/>
        </svg>
      </div>`,
    GoogleMaps: (size = 44) => `
      <div class="brand-mark" style="width:${size}px;height:${size}px;border-radius:10px;background:#fff;border:1px solid #e3e6ea;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;">
        <div style="position:absolute;inset:0;background:linear-gradient(135deg,#34a853 0 30%,#fbbc04 30% 55%,#ea4335 55% 80%,#4285f4 80% 100%);opacity:.18;"></div>
        <svg width="${Math.round(size * 0.55)}" height="${Math.round(size * 0.55)}" viewBox="0 0 24 24" fill="none" style="position:relative;" aria-hidden="true">
          <path d="M12 22s-7-7.5-7-13a7 7 0 1 1 14 0c0 5.5-7 13-7 13z" fill="#ea4335"/>
          <circle cx="12" cy="9" r="2.5" fill="#fff"/>
        </svg>
      </div>`,
    Waze: (size = 44) => `
      <div class="brand-mark" style="width:${size}px;height:${size}px;border-radius:10px;background:#33ccff;display:flex;align-items:center;justify-content:center;">
        <svg width="${Math.round(size * 0.6)}" height="${Math.round(size * 0.6)}" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
          <path d="M12 3c4.5 0 8 3.2 8 7.2 0 1.4-.4 2.7-1.2 3.9.6.6 1 1.4 1 2.2 0 1.6-1.3 2.8-3 2.8-.6 0-1.2-.2-1.7-.5-.5.1-1 .2-1.6.2-.7 0-1.4-.1-2-.3-1 .8-2.4 1.3-3.8 1.3-1.8 0-3-1.1-3-2.6 0-.6.2-1.2.5-1.6C3.6 14.3 3 12.3 3 10.2 3 6.2 7 3 12 3z"/>
          <circle cx="9.5" cy="10" r="1" fill="#33ccff"/>
          <circle cx="14.5" cy="10" r="1" fill="#33ccff"/>
        </svg>
      </div>`,
  };

  window.Icon = Icon;
  window.BrandMarks = BrandMarks;
})();
