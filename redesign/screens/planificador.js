/* CRM Prospector · rediseño v1.1 — Planificador editor
 *
 * Vista #planificador. Lee y escribe _meta/planificador en Firestore.
 *
 * Datos:
 *   planificador.schedule[YYYY-MM-DD] = [
 *     { id, name, city, province, data: { hora, notas } }, …
 *   ]
 *
 * UI:
 *   - Selector de semana (◀ semana actual ▶)
 *   - 7 columnas (lun…dom) con tarjetas de visita
 *   - Botón + en cada día → modal añadir
 *   - Click tarjeta → editar/eliminar
 *   - Botón "Guardar cambios" → Data.savePlanificador()
 *   - Drag-drop entre días (HTML5 drag API)
 *
 * Estado local en el módulo: snapshot del schedule (mutable, sin guardar
 * hasta que el usuario pulse Guardar).
 */
(function () {
  'use strict';

  const I = window.Icon;
  const State = window.State;
  const U = window.Util;
  const escape = U.escapeHtml;

  /* ============================================================
     ESTADO LOCAL
     ============================================================ */
  const Local = {
    // Lunes de la semana actualmente mostrada (Date)
    semanaLunes: lunesDe(new Date()),
    // Copia mutable del schedule (key = YYYY-MM-DD, val = array visitas)
    schedule: null,
    // Flag dirty: true si hay cambios sin guardar
    dirty: false,
    // Mientras guarda
    guardando: false,
  };

  /* ============================================================
     BÚSQUEDA DIFUSA DE STUDIO POR NOMBRE
     Orden de preferencia:
       1. Exacto (case-insensitive, sin acentos)
       2. El CRM empieza por la query  (ej: "GTA" → "GTA INGENIERÍA")
       3. La query empieza por el CRM  (ej: "INGOAD – Ingeniería" → query "Ingoad")
       4. Contiene la query completa
       5. Overlap de palabras ≥ 50 %  (ej: "Hombre Piedra" → "Hombre de Piedra Arquitectos")
     Devuelve el studio con mejor puntuación o null.
     ============================================================ */
  function _normalize(s) {
    return (s || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')  // quita acentos
      .replace(/[^a-z0-9\s]/g, ' ')           // elimina puntuación
      .replace(/\s+/g, ' ').trim();
  }

  function _fuzzyFindStudio(query, studios) {
    if (!query || !studios.length) return null;
    var q = _normalize(query);
    var qWords = q.split(' ').filter(function (w) { return w.length > 2; });

    var best = null;
    var bestScore = -1;

    studios.forEach(function (s) {
      var n = _normalize(s.name || '');
      var score = 0;

      if (n === q)                        score = 100;  // 1. exacto
      else if (n.startsWith(q))           score = 80;   // 2. CRM empieza por query
      else if (q.startsWith(n))           score = 75;   // 3. query empieza por CRM
      else if (n.includes(q))             score = 60;   // 4. CRM contiene query
      else if (q.includes(n) && n.length > 4) score = 55; // query contiene CRM
      else if (qWords.length) {
        // 5. overlap de palabras
        var nWords = n.split(' ').filter(function (w) { return w.length > 2; });
        var hits = qWords.filter(function (w) { return nWords.some(function (nw) { return nw.startsWith(w) || w.startsWith(nw); }); }).length;
        var overlap = hits / Math.max(qWords.length, 1);
        if (overlap >= 0.5) score = Math.round(40 * overlap);
      }

      if (score > bestScore) { bestScore = score; best = s; }
    });

    return bestScore > 0 ? best : null;
  }

  /* ============================================================
     UTILIDADES DE FECHA
     ============================================================ */
  function lunesDe(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay(); // 0=dom, 1=lun, …
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  }
  function toISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }
  function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }
  function formatoDia(date) {
    return date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function semanaEtiqueta(lunes) {
    const dom = addDays(lunes, 6);
    const sameMonth = lunes.getMonth() === dom.getMonth();
    const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    if (sameMonth) {
      return lunes.getDate() + '–' + dom.getDate() + ' ' + meses[lunes.getMonth()] + ' ' + lunes.getFullYear();
    }
    return lunes.getDate() + ' ' + meses[lunes.getMonth()] + ' – ' +
           dom.getDate() + ' ' + meses[dom.getMonth()] + ' ' + lunes.getFullYear();
  }

  /* ============================================================
     RENDER
     ============================================================ */
  function render() {
    const v = document.getElementById('view-planificador');
    if (!v) return;
    document.getElementById('topbar-current').textContent = 'Planificador';

    // Cargar schedule del State.
    // Reglas:
    //   · Si hay cambios locales sin guardar (dirty), respetar Local.schedule.
    //   · Si no hay datos todavía (cargando), no inicializar: evita sobreescribir
    //     con {} en caso de race condition al abrir la pantalla antes de que
    //     loadAll() complete.
    //   · En cualquier otro caso, refrescar desde State para recoger cambios
    //     hechos desde otra sesión/dispositivo.
    if (!Local.dirty) {
      if (State.loading) {
        // Datos aún en vuelo: mostrar skeleton y salir sin tocar Local.schedule
        v.innerHTML = '<div style="padding:40px; text-align:center; color:var(--fg-3);">Cargando planificador…</div>';
        return;
      }
      const plan = State.planificador && State.planificador.schedule;
      Local.schedule = plan ? deepClone(plan) : (Local.schedule || {});
    }

    const dias = [];
    for (let i = 0; i < 7; i++) {
      const fecha = addDays(Local.semanaLunes, i);
      dias.push({ fecha: fecha, iso: toISO(fecha) });
    }

    v.innerHTML = (
      '<div style="max-width:1280px; margin:0 auto;">' +
        header() +
        toolbar() +
        weekGrid(dias) +
      '</div>'
    );

    // Wire drag-drop
    wireDragDrop(v);
  }

  function header() {
    return (
      '<header style="margin-bottom:16px;">' +
        '<div class="eyebrow">Visitas planificadas</div>' +
        '<h1 style="font-family:var(--font-display); font-weight:600; font-size:32px; line-height:1; ' +
          'text-transform:uppercase; letter-spacing:.005em; margin:6px 0 4px;">Planificador</h1>' +
        '<p style="color:var(--fg-3); font-size:14px; margin:0;">Organiza la semana de visitas. Arrastra entre días o pulsa una tarjeta para editar.</p>' +
      '</header>'
    );
  }

  function toolbar() {
    const totalSemana = countSemana();
    const dirtyBadge = Local.dirty
      ? '<span style="font-size:12px; color:#b45309; background:#fef3c7; padding:3px 8px; border-radius:999px; font-weight:500;">Cambios sin guardar</span>'
      : '<span style="font-size:12px; color:var(--fg-3);">Sin cambios pendientes</span>';
    return (
      '<div class="planner-toolbar" style="display:flex; align-items:center; gap:12px; margin-bottom:16px; ' +
        'padding:10px 12px; background:var(--bg-2); border-radius:8px;">' +
        '<button class="btn btn-ghost" onclick="window.Screens.planificador.cambiarSemana(-7)" title="Semana anterior">' +
          I.ChevronLeft() + '</button>' +
        '<button class="btn btn-ghost" onclick="window.Screens.planificador.irHoy()" style="font-family:var(--font-mono); font-size:12px;">Hoy</button>' +
        '<button class="btn btn-ghost" onclick="window.Screens.planificador.cambiarSemana(7)" title="Semana siguiente">' +
          I.ChevronRight() + '</button>' +
        '<strong class="planner-week-label" style="font-family:var(--font-display); font-size:18px; margin-left:8px;">' + semanaEtiqueta(Local.semanaLunes) +
          '<span style="color:var(--fg-3); font-size:12px; font-weight:400; margin-left:8px;">· ' + totalSemana + ' visita' + (totalSemana === 1 ? '' : 's') + '</span>' +
        '</strong>' +
        '<div style="flex:1;"></div>' +
        dirtyBadge +
        (Local.dirty
          ? '<button class="btn btn-primary" ' + (Local.guardando ? 'disabled' : '') + ' ' +
            'onclick="window.Screens.planificador.guardar()" style="font-family:var(--font-mono); font-size:12px;">' +
            (Local.guardando ? 'Guardando…' : 'Guardar cambios') +
            '</button>'
          : '') +
        '<button class="btn btn-ghost" onclick="window.Screens.planificador.subirSheet()" ' +
          'title="Subir visitas al Google Sheet del jefe" ' +
          'style="font-family:var(--font-mono); font-size:12px; color:var(--fg-2);">☁️ Sheet Jefe</button>' +
        '<button class="btn btn-ghost" onclick="window.Screens.planificador.subirCalendario()" ' +
          'title="Exportar visitas a Google Calendar" ' +
          'style="font-family:var(--font-mono); font-size:12px; color:var(--fg-2);">📅 Calendario</button>' +
      '</div>'
    );
  }

  function countSemana() {
    let n = 0;
    for (let i = 0; i < 7; i++) {
      const iso = toISO(addDays(Local.semanaLunes, i));
      n += (Local.schedule[iso] || []).length;
    }
    return n;
  }

  function weekGrid(dias) {
    return (
      '<div class="planner-week-grid">' +
        dias.map(diaCol).join('') +
      '</div>'
    );
  }

  function diaCol(d) {
    const visitas = Local.schedule[d.iso] || [];
    const isToday = d.iso === toISO(new Date());
    const headerBg = isToday ? 'var(--gpf-blue-900)' : 'var(--bg-2)';
    const headerFg = isToday ? '#fff' : 'var(--fg-1)';
    return (
      '<div class="planner-col" data-day="' + d.iso + '" ' +
        'style="background:var(--bg-1); border:1px solid var(--border-1); border-radius:8px; ' +
        'min-height:300px; display:flex; flex-direction:column;">' +
        '<div style="background:' + headerBg + '; color:' + headerFg + '; ' +
          'padding:8px 10px; border-radius:8px 8px 0 0; font-family:var(--font-mono); ' +
          'font-size:11px; text-transform:uppercase; letter-spacing:.06em; display:flex; ' +
          'justify-content:space-between; align-items:center;">' +
          '<span>' + escape(formatoDia(d.fecha)) + '</span>' +
          '<button onclick="window.Screens.planificador.addVisita(\'' + d.iso + '\')" ' +
            'title="Añadir visita" style="background:none; border:0; color:inherit; cursor:pointer; ' +
            'font-size:16px; line-height:1; padding:0 4px;">+</button>' +
        '</div>' +
        '<div class="planner-drop" data-day="' + d.iso + '" ' +
          'style="flex:1; padding:8px; display:flex; flex-direction:column; gap:6px;">' +
          (visitas.length === 0
            ? '<div style="color:var(--fg-4); font-size:12px; text-align:center; padding:24px 4px;">Sin visitas</div>'
            : visitas.map(function (v, idx) { return visitaCard(d.iso, idx, v); }).join('')
          ) +
        '</div>' +
      '</div>'
    );
  }

  function visitaCard(iso, idx, v) {
    const hora = (v.data && v.data.hora) || '';
    const notas = (v.data && v.data.notas) || '';
    return (
      '<div class="planner-card" draggable="true" data-day="' + iso + '" data-idx="' + idx + '" ' +
        'onclick="window.Screens.planificador.editVisita(\'' + iso + '\', ' + idx + ')" ' +
        'style="background:var(--bg-2); border:1px solid var(--border-1); border-radius:6px; ' +
        'padding:8px 10px; cursor:grab; font-size:12px;">' +
        (hora ? '<div style="font-family:var(--font-mono); font-weight:600; color:var(--gpf-blue-700); font-size:11px;">' + escape(hora) + '</div>' : '') +
        '<div style="font-weight:600; line-height:1.2; margin-top:2px;">' + escape(v.name || v.id) + '</div>' +
        (v.city ? '<div style="color:var(--fg-3); font-size:11px; margin-top:2px;">' + escape(v.city) + (v.province ? ' · ' + escape(v.province) : '') + '</div>' : '') +
        (notas ? '<div style="color:var(--fg-3); font-size:11px; margin-top:4px; font-style:italic;">' + escape(notas.slice(0, 60)) + (notas.length > 60 ? '…' : '') + '</div>' : '') +
      '</div>'
    );
  }

  /* ============================================================
     DRAG-DROP
     ============================================================ */
  function wireDragDrop(root) {
    const cards = root.querySelectorAll('.planner-card');
    const drops = root.querySelectorAll('.planner-drop');
    let dragData = null;
    cards.forEach(function (c) {
      c.addEventListener('dragstart', function (e) {
        dragData = { day: c.dataset.day, idx: parseInt(c.dataset.idx, 10) };
        e.dataTransfer.effectAllowed = 'move';
        c.style.opacity = '0.4';
      });
      c.addEventListener('dragend', function () { c.style.opacity = '1'; });
    });
    drops.forEach(function (d) {
      d.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        d.style.background = 'rgba(10, 45, 82, 0.06)';
      });
      d.addEventListener('dragleave', function () { d.style.background = ''; });
      d.addEventListener('drop', function (e) {
        e.preventDefault();
        d.style.background = '';
        if (!dragData) return;
        const destDay = d.dataset.day;
        if (destDay === dragData.day) return;
        // Mover entre días
        const src = Local.schedule[dragData.day] || [];
        const visita = src[dragData.idx];
        if (!visita) return;
        src.splice(dragData.idx, 1);
        if (src.length === 0) delete Local.schedule[dragData.day];
        else Local.schedule[dragData.day] = src;
        Local.schedule[destDay] = Local.schedule[destDay] || [];
        Local.schedule[destDay].push(visita);
        Local.dirty = true;
        render();
      });
    });
  }

  /* ============================================================
     ACCIONES (modales)
     ============================================================ */
  function addVisita(iso) {
    showModal({
      titulo: 'Añadir visita · ' + iso,
      visita: { id: '', name: '', city: '', province: '', data: { hora: '', notas: '' } },
      onSave: function (v) {
        Local.schedule[iso] = Local.schedule[iso] || [];
        Local.schedule[iso].push(v);
        Local.dirty = true;
        render();
      },
    });
  }

  function editVisita(iso, idx) {
    const v = (Local.schedule[iso] || [])[idx];
    if (!v) return;
    showModal({
      titulo: 'Editar visita · ' + iso,
      visita: deepClone(v),
      conBorrar: true,
      onSave: function (out) {
        Local.schedule[iso][idx] = out;
        Local.dirty = true;
        render();
      },
      onDelete: function () {
        Local.schedule[iso].splice(idx, 1);
        if (Local.schedule[iso].length === 0) delete Local.schedule[iso];
        Local.dirty = true;
        render();
      },
    });
  }

  function showModal(opts) {
    const v = opts.visita;
    const studios = State.studios || [];
    // Sugerencias datalist
    const options = studios.map(function (s) {
      return '<option value="' + escape(s.name || '') + '" data-id="' + escape(s.id) + '" data-city="' + escape(s.city || '') + '" data-province="' + escape(s.province || '') + '">';
    }).join('');

    const html = (
      '<div class="planner-modal-overlay" onclick="if(event.target===this)window.Screens.planificador.cerrarModal()" ' +
        'style="position:fixed; inset:0; background:rgba(0,0,0,0.4); display:flex; align-items:center; ' +
        'justify-content:center; z-index:1000;">' +
        '<div style="background:var(--bg-1); border-radius:8px; padding:20px; min-width:380px; max-width:480px; box-shadow:0 12px 40px rgba(0,0,0,0.2);">' +
          '<h3 style="margin:0 0 16px; font-family:var(--font-display); font-size:18px;">' + escape(opts.titulo) + '</h3>' +
          '<div style="display:grid; gap:10px;">' +
            '<label style="display:block;">' +
              '<span style="font-size:11px; color:var(--fg-3); text-transform:uppercase; letter-spacing:.05em;">Empresa</span>' +
              '<input id="pmod-name" list="pmod-list" value="' + escape(v.name || '') + '" ' +
                'style="width:100%; margin-top:2px; padding:6px 8px; border:1px solid var(--border-1); border-radius:4px; font:inherit;">' +
              '<datalist id="pmod-list">' + options + '</datalist>' +
            '</label>' +
            '<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">' +
              '<label>' +
                '<span style="font-size:11px; color:var(--fg-3); text-transform:uppercase; letter-spacing:.05em;">Hora</span>' +
                '<input id="pmod-hora" type="time" value="' + escape((v.data && v.data.hora) || '') + '" ' +
                  'style="width:100%; margin-top:2px; padding:6px 8px; border:1px solid var(--border-1); border-radius:4px; font:inherit;">' +
              '</label>' +
              '<label>' +
                '<span style="font-size:11px; color:var(--fg-3); text-transform:uppercase; letter-spacing:.05em;">Ciudad</span>' +
                '<input id="pmod-city" value="' + escape(v.city || '') + '" ' +
                  'style="width:100%; margin-top:2px; padding:6px 8px; border:1px solid var(--border-1); border-radius:4px; font:inherit;">' +
              '</label>' +
            '</div>' +
            '<label>' +
              '<span style="font-size:11px; color:var(--fg-3); text-transform:uppercase; letter-spacing:.05em;">Notas</span>' +
              '<textarea id="pmod-notas" rows="3" ' +
                'style="width:100%; margin-top:2px; padding:6px 8px; border:1px solid var(--border-1); border-radius:4px; font:inherit; resize:vertical;">' +
                escape((v.data && v.data.notas) || '') +
              '</textarea>' +
            '</label>' +
          '</div>' +
          '<div style="display:flex; gap:8px; margin-top:16px; justify-content:flex-end;">' +
            (opts.conBorrar
              ? '<button class="btn btn-ghost" onclick="window.Screens.planificador.confirmarBorrar()" style="color:#c8102e; margin-right:auto;">Eliminar</button>'
              : '') +
            '<button class="btn btn-ghost" onclick="window.Screens.planificador.cerrarModal()">Cancelar</button>' +
            '<button class="btn btn-primary" onclick="window.Screens.planificador.confirmarGuardarModal()">Guardar</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
    const host = document.createElement('div');
    host.id = 'planner-modal-host';
    host.innerHTML = html;
    document.body.appendChild(host);
    Local._modalOpts = opts;
    setTimeout(function () { const n = document.getElementById('pmod-name'); if (n) n.focus(); }, 50);
  }

  function cerrarModal() {
    const h = document.getElementById('planner-modal-host');
    if (h) h.remove();
    Local._modalOpts = null;
  }

  function confirmarGuardarModal() {
    const opts = Local._modalOpts;
    if (!opts) return;
    const name = (document.getElementById('pmod-name') || {}).value || '';
    const hora = (document.getElementById('pmod-hora') || {}).value || '';
    const city = (document.getElementById('pmod-city') || {}).value || '';
    const notas = (document.getElementById('pmod-notas') || {}).value || '';
    if (!name.trim()) {
      alert('Indica al menos el nombre de la empresa.');
      return;
    }
    // Intentar localizar studio por nombre para enlazar id/provincia
    // Usa matching difuso: exacto → empieza por → contiene → primera palabra clave
    let id = opts.visita.id || '';
    let province = opts.visita.province || '';
    let cityFinal = city.trim();
    if (!id) {
      const match = _fuzzyFindStudio(name.trim(), State.studios || []);
      if (match) {
        id = match.id;
        if (!cityFinal) cityFinal = match.city || '';
        province = match.province || '';
      }
    }
    const out = {
      id: id || ('manual-' + Date.now()),
      name: name.trim(),
      city: cityFinal,
      province: province,
      data: { hora: hora, notas: notas },
    };
    opts.onSave(out);
    cerrarModal();
  }

  function confirmarBorrar() {
    const opts = Local._modalOpts;
    if (!opts || !opts.onDelete) return;
    if (!confirm('¿Eliminar esta visita?')) return;
    opts.onDelete();
    cerrarModal();
  }

  /* ============================================================
     PEDIR CLIENT ID (overlay inline cuando no está configurado)
     ============================================================ */
  function _pedirClientId(onSave) {
    // Eliminar overlay previo si existe
    var prev = document.getElementById('_client-id-overlay');
    if (prev) prev.remove();

    var overlay = document.createElement('div');
    overlay.id = '_client-id-overlay';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:9999',
      'background:rgba(0,0,0,.55)', 'display:flex',
      'align-items:center', 'justify-content:center',
    ].join(';');

    overlay.innerHTML = [
      '<div style="background:var(--bg-card,#1e2130);border:1px solid var(--border,#2d3148);',
        'border-radius:12px;padding:28px 32px;max-width:480px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.5)">',
        '<h3 style="margin:0 0 8px;font-size:16px;color:var(--fg,#e2e8f0)">🔑 Client ID de Google OAuth</h3>',
        '<p style="margin:0 0 16px;font-size:13px;color:var(--fg-2,#94a3b8);line-height:1.5">',
          'Para sincronizar con Google Calendar y la hoja del jefe necesitas un ',
          '<strong>Client ID</strong> de Google Cloud Console. ',
          'Puedes encontrarlo en <em>APIs &amp; Services → Credentials</em> de tu proyecto.',
        '</p>',
        '<input id="_client-id-input" type="text" placeholder="xxxxxx.apps.googleusercontent.com"',
          ' style="width:100%;box-sizing:border-box;padding:9px 12px;border-radius:8px;',
          'border:1px solid var(--border,#2d3148);background:var(--bg,#151728);',
          'color:var(--fg,#e2e8f0);font-size:13px;font-family:var(--font-mono,monospace);',
          'outline:none;margin-bottom:16px"/>',
        '<div style="display:flex;gap:10px;justify-content:flex-end">',
          '<button onclick="document.getElementById(\'_client-id-overlay\').remove()"',
            ' style="padding:8px 16px;border-radius:8px;border:1px solid var(--border,#2d3148);',
            'background:transparent;color:var(--fg-2,#94a3b8);cursor:pointer;font-size:13px">',
            'Cancelar',
          '</button>',
          '<button id="_client-id-confirm"',
            ' style="padding:8px 18px;border-radius:8px;border:none;',
            'background:var(--accent,#6366f1);color:#fff;cursor:pointer;font-size:13px;font-weight:600">',
            'Guardar y continuar',
          '</button>',
        '</div>',
      '</div>',
    ].join('');

    document.body.appendChild(overlay);

    // Pre-rellenar si ya hay algo guardado
    var existing = '';
    try {
      var cs = JSON.parse(localStorage.getItem('ferroplast_test_calendar_settings') || '{}');
      existing = cs.clientId || cs.client_id || '';
    } catch (e) { /* ignore */ }
    var input = document.getElementById('_client-id-input');
    if (existing) input.value = existing;
    input.focus();

    document.getElementById('_client-id-confirm').addEventListener('click', function () {
      var val = (document.getElementById('_client-id-input').value || '').trim();
      if (!val) {
        document.getElementById('_client-id-input').style.borderColor = '#ef4444';
        return;
      }
      // Guardar en calendar_settings y también en sheets_settings por si acaso
      var cs = {};
      try { cs = JSON.parse(localStorage.getItem('ferroplast_test_calendar_settings') || '{}'); } catch (e) { cs = {}; }
      cs.clientId = val;
      localStorage.setItem('ferroplast_test_calendar_settings', JSON.stringify(cs));
      overlay.remove();
      onSave(val);
    });

    // Confirmar con Enter
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') document.getElementById('_client-id-confirm').click();
    });
  }

  /* ============================================================
     SUBIR VISITAS AL SHEET DEL JEFE
     Porta exactamente la función subirVisitasSheet() del legacy.
     ============================================================ */
  const _SHEET_JEFE_ID  = '1vgTEqYYfgpP-dvla_hV6HIaz32kP3OPgxqn8YR_QqpQ';
  const _SHEET_NAME     = 'CALENDARIO 2026 MANOLO';
  const _COL_LETTERS    = ['C', 'H', 'M'];

  /* ============================================================
     HELPER: OAuth popup (evita redirect completo de página)
     Abre una ventana popup hacia Google OAuth. Cuando Google
     redirige de vuelta al CRM, app.js detecta window.opener y
     envía postMessage({type:'crm_oauth_done', state}) → el popup
     se cierra y aquí llamamos onSuccess() para continuar.
     Si el navegador bloquea el popup, cae en redirect normal.
     ============================================================ */
  function _abrirOAuthPopup(authUrl, onSuccess) {
    var w = 520, h = 660;
    var left = Math.max(0, Math.round((screen.width  - w) / 2));
    var top  = Math.max(0, Math.round((screen.height - h) / 2));
    var popup = window.open(
      authUrl, 'crm_oauth',
      'width=' + w + ',height=' + h + ',left=' + left + ',top=' + top +
      ',toolbar=no,menubar=no,location=no,status=no,scrollbars=yes'
    );

    if (!popup || popup.closed) {
      // Popup bloqueado por el navegador → fallback a redirect completo
      window.location.href = authUrl;
      return;
    }

    // Escuchar el mensaje del popup cuando termine la auth
    function onMsg(evt) {
      if (!evt.data || evt.data.type !== 'crm_oauth_done') return;
      window.removeEventListener('message', onMsg);
      clearInterval(pollClosed);
      try { if (popup && !popup.closed) popup.close(); } catch (_) {}
      setTimeout(onSuccess, 250);
    }
    window.addEventListener('message', onMsg);

    // Limpiar si el usuario cierra el popup manualmente
    var pollClosed = setInterval(function () {
      if (popup.closed) {
        clearInterval(pollClosed);
        window.removeEventListener('message', onMsg);
      }
    }, 800);
  }

  function _getCellRef(dateStr) {
    const parts = dateStr.split('-').map(Number);
    const year = parts[0]; const month = parts[1]; const day = parts[2];
    if (year !== 2026) return null;
    const m   = month - 1;
    const col = _COL_LETTERS[m % 3];
    const row = (2 + Math.floor(m / 3) * 35) + day;
    return col + row;
  }

  function _cellTo0Based(ref) {
    return { row: parseInt(ref.slice(1), 10) - 1, col: ref.charCodeAt(0) - 65 };
  }

  function _buildFormatRuns(links, textLen) {
    if (!links.length) return [];
    const runs = [];
    links.sort(function (a, b) { return a[0] - b[0]; });
    links.forEach(function (lnk, i) {
      runs.push({ startIndex: lnk[0], format: { link: { uri: lnk[2] } } });
      const nextStart = links[i + 1] ? links[i + 1][0] : undefined;
      if ((nextStart === undefined || nextStart > lnk[1]) && lnk[1] < textLen) {
        runs.push({ startIndex: lnk[1], format: {} });
      }
    });
    return runs;
  }

  async function subirVisitasSheet() {
    const schedule = Local.schedule || {};
    const days = Object.keys(schedule).filter(function (d) {
      return (schedule[d] || []).some(function (s) { return !s.reserva; });
    }).sort();

    if (!days.length) {
      window.showNotification('⚠️ No hay visitas planificadas', 'warning');
      return;
    }

    // 1. Comprobar token Sheets
    let sheetsSettings;
    try { sheetsSettings = JSON.parse(localStorage.getItem('ferroplast_sheets_settings') || '{}'); } catch (e) { sheetsSettings = {}; }
    const tokenValido = sheetsSettings.accessToken && sheetsSettings.tokenExpiry > Date.now();

    if (!tokenValido) {
      // Necesitamos el Client ID — lo sacamos de calendar_settings (mismo proyecto OAuth)
      let calSettings;
      try { calSettings = JSON.parse(localStorage.getItem('ferroplast_test_calendar_settings') || '{}'); } catch (e) { calSettings = {}; }
      const clientId = calSettings.clientId || calSettings.client_id || '';
      if (!clientId) {
        _pedirClientId(function (id) { subirVisitasSheet(); });
        return;
      }
      const redirectUri = window.location.href.split('?')[0].split('#')[0];
      const scope = 'https://www.googleapis.com/auth/spreadsheets';
      const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' +
        'client_id=' + encodeURIComponent(clientId) +
        '&redirect_uri=' + encodeURIComponent(redirectUri) +
        '&response_type=token' +
        '&scope=' + encodeURIComponent(scope) +
        '&state=sheets_auth' +
        '&prompt=consent';
      _abrirOAuthPopup(authUrl, function () { subirVisitasSheet(); });
      return;
    }

    // 2. Mapa web/provincia por studio id
    const allStudios = State.studios || [];
    const studioUrlMap = {};
    const studioProvMap = {};
    allStudios.forEach(function (s) {
      if (s.id == null) return;
      const sid = String(s.id);
      const webRaw = (s.data && s.data.contact && s.data.contact.web) || '';
      const web = typeof webRaw === 'object' ? (webRaw.valor || '') : String(webRaw || '');
      if (web) studioUrlMap[sid] = web.startsWith('http') ? web : 'https://' + web;
      const provRaw = s.province || '';
      studioProvMap[sid] = typeof provRaw === 'object' ? (provRaw.valor || '') : String(provRaw || '');
    });

    // 3. Construir texto + hipervínculos por día
    const visitasDia = [];
    days.forEach(function (dateStr) {
      const studios = (schedule[dateStr] || []).filter(function (s) { return !s.reserva; });
      if (!studios.length) return;
      const byProv = {};
      studios.forEach(function (s) {
        function _str(v) { return v && typeof v === 'object' ? (v.valor || '') : String(v || ''); }
        const prov = _str(s.province) || studioProvMap[String(s.id || '')] || 'Sin provincia';
        if (!byProv[prov]) byProv[prov] = [];
        byProv[prov].push({ name: _str(s.name), url: studioUrlMap[String(s.id || '')] || '' });
      });
      let text = '';
      const links = [];
      const provEntries = Object.entries(byProv);
      provEntries.forEach(function (entry, pi) {
        const prov = entry[0]; const provStudios = entry[1];
        text += prov + ': ';
        provStudios.forEach(function (s, si) {
          const start = text.length;
          text += s.name;
          if (s.url) links.push([start, text.length, s.url]);
          if (si < provStudios.length - 1) text += ', ';
        });
        if (pi < provEntries.length - 1) text += ' | ';
      });
      const cellRef = _getCellRef(dateStr);
      if (cellRef) visitasDia.push({ dateStr: dateStr, cellRef: cellRef, text: text, links: links });
    });

    if (!visitasDia.length) {
      window.showNotification('⚠️ No hay celdas que actualizar (solo hay visitas de años ≠ 2026)', 'warning');
      return;
    }

    window.showNotification('☁️ Subiendo ' + visitasDia.length + ' días al Sheet del jefe…', 'info');

    try {
      // 4. Obtener gid de la hoja CALENDARIO 2026 MANOLO
      const metaResp = await fetch(
        'https://sheets.googleapis.com/v4/spreadsheets/' + _SHEET_JEFE_ID +
        '?fields=sheets(properties(sheetId,title))',
        { headers: { 'Authorization': 'Bearer ' + sheetsSettings.accessToken } }
      );
      if (!metaResp.ok) {
        const err = await metaResp.json();
        throw new Error(err.error && err.error.message ? err.error.message : metaResp.statusText);
      }
      const meta = await metaResp.json();
      const sheetObj = (meta.sheets || []).find(function (s) { return s.properties.title === _SHEET_NAME; });
      const sheetGid = sheetObj ? sheetObj.properties.sheetId : 0;

      // 5. Construir requests batchUpdate
      const requests = visitasDia.map(function (vd) {
        const pos = _cellTo0Based(vd.cellRef);
        return {
          updateCells: {
            rows: [{ values: [{
              userEnteredValue: { stringValue: vd.text },
              textFormatRuns: _buildFormatRuns(vd.links, vd.text.length),
            }] }],
            fields: 'userEnteredValue,textFormatRuns',
            range: {
              sheetId: sheetGid,
              startRowIndex: pos.row, endRowIndex: pos.row + 1,
              startColumnIndex: pos.col, endColumnIndex: pos.col + 1,
            },
          },
        };
      });

      // 6. Llamar batchUpdate
      const resp = await fetch(
        'https://sheets.googleapis.com/v4/spreadsheets/' + _SHEET_JEFE_ID + ':batchUpdate',
        {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + sheetsSettings.accessToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests: requests }),
        }
      );
      if (!resp.ok) {
        const err2 = await resp.json();
        throw new Error(err2.error && err2.error.message ? err2.error.message : resp.statusText);
      }

      // 7. Resumen
      const resumen = visitasDia.map(function (vd) {
        const partes = vd.dateStr.split('-').map(Number);
        const fechaObj = new Date(partes[0], partes[1] - 1, partes[2]);
        const label = fechaObj.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
        const n = (schedule[vd.dateStr] || []).filter(function (s) { return !s.reserva; }).length;
        return label + ' → ' + n + ' visita' + (n === 1 ? '' : 's') + ' (' + vd.cellRef + ')';
      }).join('\n');

      window.showNotification('✅ Sheet del jefe actualizado · ' + visitasDia.length + ' días', 'success');
      console.info('[planificador] Sheet jefe OK:\n' + resumen);

      // Abrir sheet en nueva pestaña para confirmación visual
      window.open('https://docs.google.com/spreadsheets/d/' + _SHEET_JEFE_ID, '_blank');

    } catch (e) {
      console.error('[planificador] subirVisitasSheet error:', e);
      // Si el token expiró, limpiar para forzar reauth la próxima vez
      if (String(e.message).includes('401') || String(e.message).toLowerCase().includes('invalid')) {
        sheetsSettings.accessToken = null;
        sheetsSettings.tokenExpiry = 0;
        localStorage.setItem('ferroplast_sheets_settings', JSON.stringify(sheetsSettings));
      }
      window.showNotification('❌ Error al subir al Sheet: ' + (e.message || e), 'error');
    }
  }

  /* ============================================================
     EXPORTAR VISITAS A GOOGLE CALENDAR
     ============================================================ */
  async function subirCalendario() {
    const schedule = Local.schedule || {};
    const hoyISO = new Date().toISOString().slice(0, 10);
    const days = Object.keys(schedule).filter(function (d) {
      return d >= hoyISO && (schedule[d] || []).some(function (s) { return !s.reserva; });
    }).sort();

    if (!days.length) {
      window.showNotification('⚠️ No hay visitas futuras para exportar al calendario', 'warning');
      return;
    }

    // 1. Comprobar token Calendar
    let calSettings;
    try { calSettings = JSON.parse(localStorage.getItem('ferroplast_test_calendar_settings') || '{}'); } catch (e) { calSettings = {}; }
    const tokenValido = calSettings.accessToken && calSettings.tokenExpiry > Date.now();

    if (!tokenValido) {
      const clientId = calSettings.clientId || calSettings.client_id || '';
      if (!clientId) {
        _pedirClientId(function (id) { subirCalendario(); });
        return;
      }
      const redirectUri = window.location.href.split('?')[0].split('#')[0];
      const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' +
        'client_id=' + encodeURIComponent(clientId) +
        '&redirect_uri=' + encodeURIComponent(redirectUri) +
        '&response_type=token' +
        '&scope=' + encodeURIComponent('https://www.googleapis.com/auth/calendar.events') +
        '&state=gcal_auth' +
        '&prompt=consent';
      _abrirOAuthPopup(authUrl, function () { subirCalendario(); });
      return;
    }

    // 2. Construir mapa id→studio para obtener contacto
    const allStudios = State.studios || [];
    const byId = {};
    allStudios.forEach(function (s) { if (s.id != null) byId[String(s.id)] = s; });

    function _rf(v) {
      if (!v) return '';
      if (typeof v === 'object') return v.valor || '';
      return String(v);
    }

    const calendarId = calSettings.calendarId || 'primary';
    const total = days.reduce(function (n, d) {
      return n + (schedule[d] || []).filter(function (s) { return !s.reserva; }).length;
    }, 0);

    window.showNotification('📅 Exportando ' + total + ' visitas a Google Calendar…', 'info');

    let created = 0; let errors = 0;

    for (const dateStr of days) {
      const visits = (schedule[dateStr] || []).filter(function (v) { return !v.reserva; });
      for (const v of visits) {
        const sid    = String(v.id || '');
        const s      = byId[sid] || {};
        const ctc    = (s.data && s.data.contact) || {};
        const addr   = _rf(ctc.address);
        const phone  = _rf(ctc.phone);
        const email  = _rf(ctc.email);
        const web    = _rf(ctc.web);
        const city   = v.city  || _rf(s.city)     || '';
        const prov   = v.province || _rf(s.province) || '';
        const hora   = (v.data && v.data.hora) || '09:00';
        const notas  = (v.data && v.data.notas) || '';
        const nombre = v.name || s.name || sid;

        // Hora fin +60 min
        const [hh, mm] = hora.split(':').map(Number);
        const endTot   = hh * 60 + mm + 60;
        const endHora  = String(Math.floor(endTot / 60)).padStart(2, '0') + ':' + String(endTot % 60).padStart(2, '0');

        const location = addr || [city, prov].filter(Boolean).join(', ');
        const crmLink  = 'https://mafernandez-create.github.io/crm-prospector/#detail/' + sid;

        let desc = '🏢 ' + nombre + '\n📍 ' + (location || '—');
        if (phone)  desc += '\n📞 ' + phone;
        if (email)  desc += '\n📧 ' + email;
        if (web)    desc += '\n🌐 ' + web;
        if (notas)  desc += '\n\n📝 ' + notas;
        desc += '\n\n🔗 Ver en CRM:\n' + crmLink;
        desc += '\n\n🎯 Ferroplast CRM – Ferroplast/GPF';

        const event = {
          summary:     '🏢 Visita · ' + nombre,
          location:    location,
          description: desc,
          start: { dateTime: dateStr + 'T' + hora   + ':00', timeZone: 'Europe/Madrid' },
          end:   { dateTime: dateStr + 'T' + endHora + ':00', timeZone: 'Europe/Madrid' },
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'popup', minutes: 60 },
              { method: 'popup', minutes: 15 },
            ],
          },
        };

        try {
          const resp = await fetch(
            'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(calendarId) + '/events',
            {
              method: 'POST',
              headers: {
                'Authorization': 'Bearer ' + calSettings.accessToken,
                'Content-Type':  'application/json',
              },
              body: JSON.stringify(event),
            }
          );
          if (resp.status === 401) {
            // Token expirado durante la operación
            calSettings.accessToken = null; calSettings.tokenExpiry = 0;
            localStorage.setItem('ferroplast_test_calendar_settings', JSON.stringify(calSettings));
            throw new Error('Token expirado. Vuelve a pulsar 📅 Calendario para reautenticar.');
          }
          if (!resp.ok) {
            const err = await resp.json();
            throw new Error((err.error && err.error.message) || resp.statusText);
          }
          created++;
        } catch (e) {
          console.error('[planificador] calendar error:', nombre, e.message);
          errors++;
          if (e.message && e.message.includes('Token expirado')) {
            window.showNotification('⚠️ ' + e.message, 'warning');
            return;
          }
        }
      }
    }

    if (errors) {
      window.showNotification('⚠️ ' + created + ' eventos creados, ' + errors + ' con error. Revisa la consola.', 'warning');
    } else {
      window.showNotification('✅ ' + created + ' visitas añadidas a Google Calendar', 'success');
    }
  }

  /* ============================================================
     GUARDAR
     ============================================================ */
  async function guardar() {
    if (!Local.dirty || Local.guardando) return;

    // Protección anti-borrado accidental: no guardar un schedule vacío si
    // el servidor tiene datos. Esto evita sobreescribir con {} en caso de
    // race condition (datos aún cargando cuando se abrió la pantalla).
    const localCount = Object.keys(Local.schedule || {}).length;
    const serverCount = Object.keys(
      (State.planificador && State.planificador.schedule) || {}
    ).length;
    if (localCount === 0 && serverCount > 0) {
      console.warn('[planificador] Guardado bloqueado: schedule local vacío pero servidor tiene ' + serverCount + ' fechas. Posible race condition.');
      Local.dirty = false;
      Local.schedule = deepClone(State.planificador.schedule);
      render();
      return;
    }

    Local.guardando = true;
    render();
    try {
      await window.Data.savePlanificador(Local.schedule);
      Local.dirty = false;
      Local.guardando = false;
      console.info('[planificador] guardado OK');
      render();
    } catch (e) {
      Local.guardando = false;
      console.error('[planificador] error guardando:', e);
      alert('No se pudo guardar:\n' + (e.message || e));
      render();
    }
  }

  /* ============================================================
     NAVEGACIÓN
     ============================================================ */
  function cambiarSemana(dias) {
    Local.semanaLunes = addDays(Local.semanaLunes, dias);
    render();
  }
  function irHoy() {
    Local.semanaLunes = lunesDe(new Date());
    render();
  }

  /* ============================================================
     HELPERS
     ============================================================ */
  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ============================================================
     REGISTRO
     ============================================================ */
  window.Screens = window.Screens || {};
  /* ------------------------------------------------------------
     Alta de UN evento en Google Calendar desde una actividad de la
     ficha (llamada desde detail.js). Reutiliza el mismo token/OAuth
     que subirCalendario. opts = { date, hora, durMin?, tipo, text }.
     El evento incluye un enlace directo a la ficha del cliente en el CRM.
     ------------------------------------------------------------ */
  async function agendarActividadCalendar(studio, opts) {
    opts = opts || {};
    const dateStr = opts.date;
    const hora = opts.hora || '09:00';
    if (!dateStr) { window.showNotification('⚠️ Falta la fecha para el calendario', 'warning'); return false; }

    let calSettings;
    try { calSettings = JSON.parse(localStorage.getItem('ferroplast_test_calendar_settings') || '{}'); } catch (e) { calSettings = {}; }
    const tokenValido = calSettings.accessToken && calSettings.tokenExpiry > Date.now();
    if (!tokenValido) {
      const clientId = calSettings.clientId || calSettings.client_id || '';
      if (!clientId) { _pedirClientId(function () { agendarActividadCalendar(studio, opts); }); return false; }
      const redirectUri = window.location.href.split('?')[0].split('#')[0];
      const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' +
        'client_id=' + encodeURIComponent(clientId) +
        '&redirect_uri=' + encodeURIComponent(redirectUri) +
        '&response_type=token' +
        '&scope=' + encodeURIComponent('https://www.googleapis.com/auth/calendar.events') +
        '&state=gcal_auth&prompt=consent';
      window.showNotification('🔐 Conecta tu Google Calendar para sincronizar…', 'info');
      _abrirOAuthPopup(authUrl, function () { agendarActividadCalendar(studio, opts); });
      return false;
    }

    function _rf(v) { if (!v) return ''; if (typeof v === 'object') return v.valor || ''; return String(v); }
    const s = studio || {};
    const sid = String(s.id != null ? s.id : '');
    const ctc = (s.data && s.data.contact) || s.contact || {};
    const addr = _rf(ctc.address);
    const city = _rf(s.city); const prov = _rf(s.province);
    const nombre = s.name || sid;
    const tipoLabel = ({ llamada: 'Llamada', email: 'Email', reunion: 'Reunión', nota: 'Nota', evento: 'Evento', visita: 'Visita' })[opts.tipo] || (opts.tipo || 'Actividad');

    const durMin = opts.durMin || 60;
    const parts = hora.split(':').map(Number);
    const endTot = parts[0] * 60 + parts[1] + durMin;
    const endHora = String(Math.floor(endTot / 60)).padStart(2, '0') + ':' + String(endTot % 60).padStart(2, '0');
    const location = addr || [city, prov].filter(Boolean).join(', ');
    const crmLink = 'https://mafernandez-create.github.io/crm-prospector/#detail/' + sid;

    let desc = '🏢 ' + nombre;
    if (location) desc += '\n📍 ' + location;
    if (opts.text) desc += '\n\n📝 ' + opts.text;
    desc += '\n\n🔗 Ver ficha en el CRM:\n' + crmLink;

    const event = {
      summary: '📌 ' + tipoLabel + ' · ' + nombre,
      location: location,
      description: desc,
      start: { dateTime: dateStr + 'T' + hora + ':00', timeZone: 'Europe/Madrid' },
      end:   { dateTime: dateStr + 'T' + endHora + ':00', timeZone: 'Europe/Madrid' },
      reminders: { useDefault: false, overrides: [ { method: 'popup', minutes: 60 }, { method: 'popup', minutes: 15 } ] },
    };
    const calendarId = calSettings.calendarId || 'primary';
    try {
      const resp = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(calendarId) + '/events',
        { method: 'POST', headers: { 'Authorization': 'Bearer ' + calSettings.accessToken, 'Content-Type': 'application/json' }, body: JSON.stringify(event) }
      );
      if (resp.status === 401) {
        calSettings.accessToken = null; calSettings.tokenExpiry = 0;
        localStorage.setItem('ferroplast_test_calendar_settings', JSON.stringify(calSettings));
        window.showNotification('⚠️ Sesión de calendario caducada. Vuelve a guardar la actividad para reconectar.', 'warning');
        return false;
      }
      if (!resp.ok) { const err = await resp.json().catch(function () { return {}; }); throw new Error((err.error && err.error.message) || resp.statusText); }
      window.showNotification('📅 Añadido a tu Google Calendar', 'success');
      return true;
    } catch (e) {
      window.showNotification('No se pudo añadir al calendario: ' + e.message, 'error');
      return false;
    }
  }

  window.Screens.planificador = {
    render: render,
    cambiarSemana: cambiarSemana,
    irHoy: irHoy,
    addVisita: addVisita,
    editVisita: editVisita,
    guardar: guardar,
    cerrarModal: cerrarModal,
    confirmarGuardarModal: confirmarGuardarModal,
    confirmarBorrar: confirmarBorrar,
    subirSheet: subirVisitasSheet,
    subirCalendario: subirCalendario,
    agendarActividadCalendar: agendarActividadCalendar,
  };
})();
