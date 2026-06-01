/* CRM Prospector · rediseño v1 · Fase F — Estados clave
 *
 * Origen: handoff states-a.jsx (Empty + Loading) + states-b.jsx (Error +
 * Success + Keyboard).
 *
 * 5 helpers que cualquier pantalla puede invocar para pintar un estado
 * sobre su <section class="view"> correspondiente:
 *
 *   States.showEmpty(viewId, { icon, title, body, ctas[] })
 *   States.showLoading(viewId, { title, sub })
 *   States.showError(viewId, { title, body, detail, ctas[] })
 *   States.showSuccess(viewId, { title, body, stats[], ctas[] })
 *   States.showKeyboard(viewId, { studioName, savedSecs, notes })
 *
 * Las pantallas que usan datos async (briefing, informe…) deciden cuándo
 * llamar a estos helpers. Para demo visual: _states.html los pinta todos.
 */
(function () {
  'use strict';

  const I = window.Icon;
  const escape = (window.Util && window.Util.escapeHtml) || function (s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  /* ============================================================
     STATUS BAR + HOME INDICATOR (compartido)
     ============================================================ */
  function statusBar() {
    return (
      '<div class="statusbar">' +
        '<span style="font-variant-numeric:tabular-nums; font-weight:600; font-size:15px;">9:41</span>' +
        '<span class="right">' +
          '<span class="icon" style="width:17px; height:11px;">' + I.Signal() + '</span>' +
          '<span class="icon" style="width:15px; height:11px;">' + I.Wifi() + '</span>' +
          '<span class="icon" style="width:25px; height:12px;">' + I.Battery() + '</span>' +
        '</span>' +
      '</div>'
    );
  }
  function homeIndicator() { return '<div class="home-indicator"></div>'; }

  /* ============================================================
     1. EMPTY — "Hoy" sin tareas
     ============================================================
       props: { icon, title, body, ctas:[{label, icon, onclick}] }
     */
  function showEmpty(viewId, opts) {
    opts = opts || {};
    const el = document.getElementById(viewId);
    if (!el) return;
    const ctas = (opts.ctas || []).map(function (c, i) {
      const cls = i === 0 ? 'btn-primary' : 'btn-ghost';
      return (
        '<button class="btn ' + cls + ' btn-block" onclick="' + escape(c.onclick || '') + '">' +
          (c.icon || '') + ' ' + escape(c.label) +
        '</button>'
      );
    }).join('');

    const isMobile = window.innerWidth < 768;
    const content = (
      '<div style="flex:1; padding:40px 32px; display:flex; flex-direction:column; ' +
        'align-items:center; justify-content:center; text-align:center; gap:18px;">' +
        '<div style="width:88px; height:88px; border-radius:50%; background:var(--gpf-blue-100); ' +
          'display:flex; align-items:center; justify-content:center; color:var(--gpf-blue-700);">' +
          '<span style="display:inline-block; transform:scale(1.8);">' + (opts.icon || I.Calendar()) + '</span>' +
        '</div>' +
        '<div>' +
          '<h2 style="font-family:var(--font-display); font-weight:600; font-size:22px; ' +
            'color:var(--fg-1); letter-spacing:-0.01em; text-transform:none; margin:0 0 8px;">' +
            escape(opts.title || 'Sin contenido') +
          '</h2>' +
          (opts.body ? '<p style="font-size:15px; color:var(--fg-3); line-height:1.5; max-width:280px; margin:0;">' + escape(opts.body) + '</p>' : '') +
        '</div>' +
        (ctas ? '<div style="display:flex; flex-direction:column; gap:8px; width:100%; max-width:280px; margin-top:8px;">' + ctas + '</div>' : '') +
      '</div>'
    );

    el.innerHTML = isMobile
      ? '<div class="iphone-frame">' + statusBar() + content + homeIndicator() + '</div>'
      : '<div style="max-width:380px; margin:0 auto;">' + content + '</div>';
  }

  /* ============================================================
     2. LOADING — briefing generándose (banner + skeleton)
     ============================================================
       props: { title, sub }
     */
  function showLoading(viewId, opts) {
    opts = opts || {};
    const el = document.getElementById(viewId);
    if (!el) return;

    const isMobile = window.innerWidth < 768;
    const body = (
      // Banner azul claro con spinner + texto
      '<div style="background:var(--gpf-blue-100); border:1px solid #c7dcef; ' +
        'border-radius:12px; padding:18px; margin-bottom:20px; ' +
        'display:flex; align-items:center; gap:14px;">' +
        '<div style="width:36px; height:36px; border-radius:50%; ' +
          'border:3px solid var(--gpf-blue-100); border-top-color:var(--gpf-blue-700); ' +
          'animation:skeleton-spin 0.9s linear infinite; flex:0 0 auto;"></div>' +
        '<div>' +
          '<div style="font-size:15px; font-weight:600; color:var(--gpf-blue-900);">' + escape(opts.title || 'Cargando…') + '</div>' +
          (opts.sub ? '<div style="font-size:13px; color:var(--gpf-blue-700); margin-top:2px;">' + escape(opts.sub) + '</div>' : '') +
        '</div>' +
      '</div>' +

      // 3 grupos de skeleton shimmer
      '<div style="display:flex; flex-direction:column; gap:18px;">' +
        skeletonGroup() + skeletonGroup() + skeletonGroup() +
      '</div>'
    );

    el.innerHTML = isMobile
      ? '<div class="iphone-frame">' + statusBar() +
          '<div style="padding:8px 16px 14px; border-bottom:1px solid var(--line); flex:0 0 auto; ' +
            'display:flex; align-items:center; justify-content:space-between;">' +
            '<button aria-label="Cancelar" style="background:transparent; border:0; color:var(--gpf-blue-700); padding:6px; margin-left:-6px; min-width:44px; min-height:44px;">' + I.X() + '</button>' +
            '<span style="font-family:var(--font-display); font-weight:600; font-size:17px;">Briefing pre-visita</span>' +
            '<span style="width:44px;"></span>' +
          '</div>' +
          '<div style="padding:24px 20px; flex:1; overflow:hidden;">' + body + '</div>' +
          homeIndicator() +
        '</div>'
      : '<div style="max-width:440px; margin:60px auto;">' + body + '</div>';
  }
  function skeletonGroup() {
    return (
      '<div>' +
        '<div class="skeleton" style="height:11px; width:40%; margin-bottom:10px;"></div>' +
        '<div class="skeleton" style="height:16px; width:85%; margin-bottom:6px;"></div>' +
        '<div class="skeleton" style="height:16px; width:95%; margin-bottom:6px;"></div>' +
        '<div class="skeleton" style="height:16px; width:70%;"></div>' +
      '</div>'
    );
  }

  /* ============================================================
     3. ERROR — banner rojo + draft local + CTAs + detalle técnico
     ============================================================
       props: { title, body, detail, ctas:[{label, icon, onclick}], draft:{empresa, fecha, chars} }
     */
  function showError(viewId, opts) {
    opts = opts || {};
    const el = document.getElementById(viewId);
    if (!el) return;
    const isMobile = window.innerWidth < 768;

    const ctas = (opts.ctas || []).map(function (c, i) {
      const cls = i === 0 ? 'btn-primary' : 'btn-ghost';
      return (
        '<button class="btn ' + cls + ' btn-block" onclick="' + escape(c.onclick || '') + '">' +
          (c.icon || '') + ' ' + escape(c.label) +
        '</button>'
      );
    }).join('');

    const body = (
      // Banner rojo
      '<div style="background:#fbe4e7; border:1px solid #f0c2c9; border-radius:12px; ' +
        'padding:16px 18px; margin-bottom:24px; display:flex; gap:14px; align-items:flex-start;">' +
        '<span style="color:var(--mute-red-dark); flex:0 0 auto; margin-top:2px;">' + I.AlertTriangle() + '</span>' +
        '<div style="flex:1;">' +
          '<div style="font-size:15px; font-weight:600; color:var(--mute-red-dark);">' + escape(opts.title || 'No se pudo enviar') + '</div>' +
          (opts.body ? '<div style="font-size:14px; color:var(--mute-red-dark); opacity:.85; margin-top:4px; line-height:1.45;">' + escape(opts.body) + '</div>' : '') +
        '</div>' +
      '</div>' +

      // Draft local card (opcional)
      (opts.draft ? (
        '<div class="card" style="padding:14px 16px; margin-bottom:16px;">' +
          '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">' +
            '<span class="eyebrow">Borrador local</span>' +
            '<span style="font-size:12px; color:var(--fg-3); font-family:var(--font-mono);">guardado ' + escape(opts.draft.tiempo || '9:38') + '</span>' +
          '</div>' +
          '<div style="font-size:15px; font-weight:600; color:var(--fg-1); margin-bottom:4px;">' + escape(opts.draft.empresa || '—') + '</div>' +
          '<div style="font-size:13px; color:var(--fg-3);">' + escape(opts.draft.meta || '') + '</div>' +
        '</div>'
      ) : '') +

      // CTAs
      (ctas ? '<div style="display:flex; flex-direction:column; gap:8px;">' + ctas + '</div>' : '') +

      // Detalle técnico expandible
      (opts.detail ? (
        '<div style="margin-top:24px; padding:10px 14px; background:var(--paper-warm); ' +
          'border-radius:8px; font-size:12px; font-family:var(--font-mono); color:var(--fg-3); line-height:1.5;">' +
          '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">' +
            '<span style="font-weight:600;">Detalle técnico</span>' +
            '<span class="icon icon-sm" style="transform:rotate(180deg);">' + I.ChevronDown() + '</span>' +
          '</div>' +
          escape(opts.detail) +
        '</div>'
      ) : '')
    );

    el.innerHTML = isMobile
      ? '<div class="iphone-frame">' + statusBar() +
          '<div style="padding:8px 16px 14px; border-bottom:1px solid var(--line); flex:0 0 auto; ' +
            'display:flex; align-items:center; justify-content:space-between;">' +
            '<button class="back-btn" style="margin-left:-6px;">' + I.ArrowLeft() + ' <span>Atrás</span></button>' +
            '<span style="font-family:var(--font-display); font-weight:600; font-size:17px;">Informe</span>' +
            '<span style="width:60px;"></span>' +
          '</div>' +
          '<div style="flex:1; padding:24px 20px 100px;">' + body + '</div>' +
          homeIndicator() +
        '</div>'
      : '<div style="max-width:440px; margin:60px auto;">' + body + '</div>';
  }

  /* ============================================================
     4. SUCCESS — informe enviado (check + progreso + próximos pasos)
     ============================================================
       props: { title, body, stats:[{label, value}], progress:{pct, label, sub}, ctas[] }
     */
  function showSuccess(viewId, opts) {
    opts = opts || {};
    const el = document.getElementById(viewId);
    if (!el) return;
    const isMobile = window.innerWidth < 768;

    const ctas = (opts.ctas || []).map(function (c, i) {
      const cls = i === 0 ? 'btn-ghost' : 'btn-primary';  // Inverso: Ver informe primero (ghost), Hoy primary
      return (
        '<button class="btn ' + cls + '" style="flex:1;" onclick="' + escape(c.onclick || '') + '">' +
          escape(c.label) +
        '</button>'
      );
    }).join('');

    const body = (
      // Check circular verde
      '<div style="width:88px; height:88px; border-radius:50%; background:#e3f3ec; ' +
        'display:flex; align-items:center; justify-content:center; color:#14704a; margin:0 auto 20px;">' +
        '<span style="display:inline-block; transform:scale(2);">' + I.Check() + '</span>' +
      '</div>' +

      '<h2 style="font-family:var(--font-display); font-weight:600; font-size:24px; ' +
        'color:var(--fg-1); text-transform:none; letter-spacing:-0.01em; margin:0 0 8px;">' +
        escape(opts.title || 'Hecho') +
      '</h2>' +
      (opts.body ? '<p style="font-size:15px; color:var(--fg-3); line-height:1.5; max-width:320px; margin:0 auto 28px;">' + opts.body + '</p>' : '') +

      // Progress (opcional)
      (opts.progress ? (
        '<div style="width:100%; max-width:300px; margin:0 auto 28px;">' +
          '<div style="display:flex; justify-content:space-between; font-size:12px; color:var(--fg-3); margin-bottom:6px; font-family:var(--font-mono);">' +
            '<span>' + escape(opts.progress.label || 'Progreso') + '</span>' +
            '<span>' + escape(opts.progress.sub || '') + '</span>' +
          '</div>' +
          '<div class="progress"><div class="fill" style="width:' + (opts.progress.pct || 0) + '%;"></div></div>' +
        '</div>'
      ) : '') +

      // Stats card (opcional)
      (opts.stats && opts.stats.length ? (
        '<div class="card" style="padding:14px 18px; margin-bottom:24px; text-align:left;">' +
          opts.stats.map(function (row, i) {
            const last = i === opts.stats.length - 1;
            return (
              '<div style="display:flex; justify-content:space-between; padding:8px 0; ' +
                (last ? '' : 'border-bottom:1px solid var(--line);') + ' font-size:14px;">' +
                '<span style="color:var(--fg-3);">' + escape(row.label) + '</span>' +
                '<span style="color:var(--fg-1); font-weight:500;">' + escape(row.value) + '</span>' +
              '</div>'
            );
          }).join('') +
        '</div>'
      ) : '') +

      (ctas ? '<div style="display:flex; gap:10px; width:100%; max-width:380px; margin:0 auto;">' + ctas + '</div>' : '')
    );

    const wrapped = '<div style="padding:48px 28px 100px; display:flex; flex-direction:column; align-items:center; text-align:center;">' + body + '</div>';

    el.innerHTML = isMobile
      ? '<div class="iphone-frame">' + statusBar() +
          '<div style="padding:8px 16px 14px; border-bottom:1px solid var(--line); flex:0 0 auto; ' +
            'display:flex; align-items:center; justify-content:center;">' +
            '<span style="font-family:var(--font-display); font-weight:600; font-size:17px;">Visita registrada</span>' +
          '</div>' +
          '<div style="flex:1;">' + wrapped + '</div>' +
          homeIndicator() +
        '</div>'
      : '<div style="max-width:480px; margin:0 auto;">' + wrapped + '</div>';
  }

  /* ============================================================
     5. KEYBOARD — variante informe con teclado iOS abierto
     ============================================================
       props: { studioName, notes, savedSecs }
     Solo tiene sentido como demo visual; en producción real iOS gestiona
     automáticamente el reposicionado via visualViewport.
     */
  function showKeyboard(viewId, opts) {
    opts = opts || {};
    const el = document.getElementById(viewId);
    if (!el) return;

    el.innerHTML = (
      '<div class="iphone-frame">' +
        statusBar() +

        // Header compacto
        '<div style="padding:6px 16px 10px; border-bottom:1px solid var(--line); flex:0 0 auto; ' +
          'display:flex; align-items:center; justify-content:space-between;">' +
          '<button aria-label="Cancelar" style="background:transparent; border:0; color:var(--gpf-blue-700); padding:6px; margin-left:-6px; min-width:44px;">' + I.X() + '</button>' +
          '<div style="text-align:center;">' +
            '<div style="font-family:var(--font-display); font-weight:600; font-size:15px;">' + escape(opts.studioName || 'Estudio Córdoba Levante') + '</div>' +
            '<div style="font-size:11px; color:#14704a; display:flex; align-items:center; gap:4px; justify-content:center;">' +
              '<span style="width:5px; height:5px; border-radius:50%; background:#14704a;"></span>' +
              'Guardado · hace ' + (opts.savedSecs || 4) + ' s' +
            '</div>' +
          '</div>' +
          '<button style="background:transparent; border:0; color:var(--gpf-blue-700); padding:6px; font-size:14px; font-weight:600;">Listo</button>' +
        '</div>' +

        // Solo el textarea activo visible
        '<div style="flex:1; padding:14px 16px 0; overflow:hidden; display:flex; flex-direction:column;">' +
          '<label class="field-label">Tus notas de la visita</label>' +
          '<textarea class="field" style="flex:1; resize:none; font-size:16px; line-height:1.55; min-height:0;" autofocus>' +
            escape(opts.notes || 'Visita a Juan López (arquitecto jefe). Presentamos Mute y Ecosan. Les llamó la atención los pozos modulares — les flipó.\n\nEstán trabajando con Adequa pero abiertos a probar MUTE en el proyecto de Bollullos (3 plantas + sótano).\n\nPróximo paso: enviarles tarifa MUTE 2025 y ficha técnica BIOPIPE.') +
          '</textarea>' +
          '<div style="display:flex; justify-content:space-between; font-size:12px; color:var(--fg-3); padding:6px 0; font-family:var(--font-mono);">' +
            '<span>290 caracteres</span>' +
            '<span>autoguardado</span>' +
          '</div>' +
        '</div>' +

        // CTA encima del teclado iOS
        '<div style="background:rgba(255,255,255,.96); backdrop-filter:saturate(180%) blur(14px); ' +
          'border-top:1px solid var(--line); padding:10px 16px;">' +
          '<button class="btn btn-primary btn-block" style="height:48px;">' +
            I.Check() + ' Generar informe' +
          '</button>' +
        '</div>' +

        // Teclado iOS simulado
        iosKeyboard() +
      '</div>'
    );
  }

  function iosKeyboard() {
    const row1 = ['q','w','e','r','t','y','u','i','o','p'];
    const row2 = ['a','s','d','f','g','h','j','k','l','ñ'];
    const row3 = ['z','x','c','v','b','n','m'];
    const key = function (c, w, dark) {
      w = w || 32;
      return '<div style="width:' + w + 'px; height:42px; background:' + (dark ? '#aab0bb' : '#fcfcfd') + '; ' +
        'border-radius:5px; display:flex; align-items:center; justify-content:center; ' +
        'font-family:var(--font-sans); font-size:16px; color:#0a0a0a; box-shadow:0 1px 0 rgba(0,0,0,.20);">' + escape(c) + '</div>';
    };
    return (
      '<div style="background:#d1d4db; padding:8px 4px 6px; padding-bottom:calc(var(--safe-bot) + 6px);">' +
        '<div style="display:flex; justify-content:space-around; align-items:center; height:34px; padding:0 4px; margin-bottom:6px; font-size:14px; color:#1a1a1a;">' +
          '<span style="background:#fff; padding:4px 14px; border-radius:6px; font-weight:500;">"comercial"</span>' +
          '<span>comercial</span>' +
          '<span>comerciales</span>' +
        '</div>' +
        '<div style="display:flex; justify-content:center; gap:4px; margin-bottom:6px;">' + row1.map(function (c) { return key(c); }).join('') + '</div>' +
        '<div style="display:flex; justify-content:center; gap:4px; margin-bottom:6px; padding:0 18px;">' + row2.map(function (c) { return key(c); }).join('') + '</div>' +
        '<div style="display:flex; justify-content:center; gap:4px; margin-bottom:6px;">' +
          key('⇧', 42, true) + row3.map(function (c) { return key(c); }).join('') + key('⌫', 42, true) +
        '</div>' +
        '<div style="display:flex; justify-content:center; gap:4px;">' +
          key('123', 56, true) + key('🌐', 32, true) +
          '<div style="flex:1; height:42px; background:#fcfcfd; border-radius:5px; display:flex; align-items:center; justify-content:center; font-size:13px; color:#0a0a0a;">espacio</div>' +
          '<div style="width:64px; height:42px; background:#3478f6; border-radius:5px; display:flex; align-items:center; justify-content:center; font-family:var(--font-sans); font-size:14px; color:#fff; font-weight:500;">intro</div>' +
        '</div>' +
      '</div>'
    );
  }

  /* ============================================================
     EXPORT
     ============================================================ */
  window.States = {
    showEmpty: showEmpty,
    showLoading: showLoading,
    showError: showError,
    showSuccess: showSuccess,
    showKeyboard: showKeyboard,
  };
})();
