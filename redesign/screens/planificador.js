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
    // Panel "Pendiente en la zona"
    zonaOpen: false,          // plegado por defecto
    zonaProvincias: null,     // null = auto (provincias de la semana); array = manual
    zonaLimitrofes: true,     // incluir provincias limítrofes
    _zonaLoading: false,
  };

  // id → acción, para resolver/completar/descartar desde el botón sin escapar texto
  var _zonaAccionesById = {};

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
        zonaPanel() +
      '</div>'
    );

    // Wire drag-drop
    wireDragDrop(v);

    // Cargar el panel de zona si está abierto (async, patrón bandeja)
    if (Local.zonaOpen) _loadZona();
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
          'title="Subir o retirar días en el Google Sheet del jefe" ' +
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
      '<div style="background:var(--bg-card,#ffffff);border:1px solid var(--border-1,#d7dde3);',
        'border-radius:12px;padding:28px 32px;max-width:480px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.5)">',
        '<h3 style="margin:0 0 8px;font-size:16px;color:var(--fg-1,#101418)">🔑 Client ID de Google OAuth</h3>',
        '<p style="margin:0 0 16px;font-size:13px;color:var(--fg-2,#2a3138);line-height:1.5">',
          'Para sincronizar con Google Calendar y la hoja del jefe necesitas un ',
          '<strong>Client ID</strong> de Google Cloud Console. ',
          'Puedes encontrarlo en <em>APIs &amp; Services → Credentials</em> de tu proyecto.',
        '</p>',
        '<input id="_client-id-input" type="text" placeholder="xxxxxx.apps.googleusercontent.com"',
          ' style="width:100%;box-sizing:border-box;padding:9px 12px;border-radius:8px;',
          'border:1px solid var(--border-1,#d7dde3);background:var(--bg-1,#ffffff);',
          'color:var(--fg-1,#101418);font-size:13px;font-family:var(--font-mono,monospace);',
          'outline:none;margin-bottom:16px"/>',
        '<div style="display:flex;gap:10px;justify-content:flex-end">',
          '<button onclick="document.getElementById(\'_client-id-overlay\').remove()"',
            ' style="padding:8px 16px;border-radius:8px;border:1px solid var(--border-1,#d7dde3);',
            'background:transparent;color:var(--fg-2,#2a3138);cursor:pointer;font-size:13px">',
            'Cancelar',
          '</button>',
          '<button id="_client-id-confirm"',
            ' style="padding:8px 18px;border-radius:8px;border:none;',
            'background:var(--cta,#124b8a);color:#fff;cursor:pointer;font-size:13px;font-weight:600">',
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

  // Fila de la cabecera de cada bloque trimestral en la pestaña 2026. Los bloques
  // NO están equiespaciados: van 2 → 37 → 72 → 106, o sea 35, 35 y 34 filas.
  // Calcularlo como 2 + trimestre*35 desplaza Oct/Nov/Dic una fila hacia abajo y
  // escribe la visita en el día siguiente. Verificado celda a celda contra la hoja.
  const _BLOQUE_BASE = [2, 37, 72, 106];

  function _getCellRef(dateStr) {
    const parts = dateStr.split('-').map(Number);
    const year = parts[0]; const month = parts[1]; const day = parts[2];
    if (year !== 2026) return null;
    if (!(month >= 1 && month <= 12)) return null;
    if (!(day >= 1 && day <= 31)) return null;
    // Rechazar días que no existen (30 de febrero, 31 de abril…): la hoja no tiene
    // casilla para ellos y _cellRefToDate tampoco los reconoce.
    const real = new Date(year, month - 1, day);
    if (real.getMonth() + 1 !== month || real.getDate() !== day) return null;
    const m   = month - 1;
    const col = _COL_LETTERS[m % 3];
    const row = _BLOQUE_BASE[Math.floor(m / 3)] + day;
    return col + row;
  }

  // Inverso de _getCellRef: 'M59' → '2026-06-22'. Devuelve null si la celda no
  // cae en ninguna casilla de día.
  function _cellRefToDate(ref) {
    const col = ref[0];
    const row = parseInt(ref.slice(1), 10);
    const colIdx = _COL_LETTERS.indexOf(col);
    if (colIdx < 0 || !row) return null;
    for (let b = 0; b < _BLOQUE_BASE.length; b++) {
      const day = row - _BLOQUE_BASE[b];
      if (day >= 1 && day <= 31) {
        const month = b * 3 + colIdx + 1;
        const iso = '2026-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
        // Descarta días que no existen (p.ej. 31 de febrero)
        const d = new Date(iso + 'T00:00:00');
        if (d.getMonth() + 1 !== month || d.getDate() !== day) return null;
        return iso;
      }
    }
    return null;
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

  /* ------------------------------------------------------------
     Acceso a la API de Sheets (compartido por subir y vaciar)
     ------------------------------------------------------------ */

  // Resuelve un token con scope spreadsheets y llama a onReady(settings).
  // Si falta el Client ID lo pide; si falta el token abre el popup de OAuth.
  function _conTokenSheets(onReady) {
    let s;
    try { s = JSON.parse(localStorage.getItem('ferroplast_sheets_settings') || '{}'); } catch (e) { s = {}; }
    if (s.accessToken && s.tokenExpiry > Date.now()) { onReady(s); return; }

    // El Client ID vive en calendar_settings (mismo proyecto OAuth)
    let calSettings;
    try { calSettings = JSON.parse(localStorage.getItem('ferroplast_test_calendar_settings') || '{}'); } catch (e) { calSettings = {}; }
    const clientId = calSettings.clientId || calSettings.client_id || '';
    if (!clientId) { _pedirClientId(function () { _conTokenSheets(onReady); }); return; }

    // Normaliza a la URL canónica autorizada en Google (sin query, sin hash y sin
    // "index.html"); si no, abrir la app como …/index.html da redirect_uri_mismatch.
    const redirectUri = window.location.href.split('?')[0].split('#')[0].replace(/index\.html?$/i, '');
    const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' +
      'client_id=' + encodeURIComponent(clientId) +
      '&redirect_uri=' + encodeURIComponent(redirectUri) +
      '&response_type=token' +
      '&scope=' + encodeURIComponent('https://www.googleapis.com/auth/spreadsheets') +
      '&state=sheets_auth' +
      '&prompt=consent';
    _abrirOAuthPopup(authUrl, function () { _conTokenSheets(onReady); });
  }

  function _invalidarTokenSheets(e) {
    const msg = String((e && e.message) || e);
    if (!/401|invalid|unauthor/i.test(msg)) return;
    let s = {};
    try { s = JSON.parse(localStorage.getItem('ferroplast_sheets_settings') || '{}'); } catch (_) {}
    s.accessToken = null; s.tokenExpiry = 0;
    localStorage.setItem('ferroplast_sheets_settings', JSON.stringify(s));
  }

  async function _sheetsFetch(token, url, opts) {
    const o = opts || {};
    o.headers = Object.assign({ Authorization: 'Bearer ' + token }, o.headers || {});
    const resp = await fetch(url, o);
    if (!resp.ok) {
      let detalle = resp.statusText;
      try { const j = await resp.json(); detalle = (j.error && j.error.message) || detalle; } catch (_) {}
      throw new Error(resp.status + ' · ' + detalle);
    }
    return resp.json();
  }

  async function _sheetGid(token) {
    const meta = await _sheetsFetch(token,
      'https://sheets.googleapis.com/v4/spreadsheets/' + _SHEET_JEFE_ID +
      '?fields=sheets(properties(sheetId,title))');
    const hoja = (meta.sheets || []).find(function (s) { return s.properties.title === _SHEET_NAME; });
    if (!hoja) throw new Error('No existe la pestaña "' + _SHEET_NAME + '" en la hoja');
    return hoja.properties.sheetId;
  }

  // Lee las tres columnas de anotación de 2026 y devuelve { '2026-06-22': 'texto', … }
  // Solo incluye celdas con contenido.
  async function _leerAnotaciones(token) {
    const ranges = _COL_LETTERS.map(function (c) {
      return 'ranges=' + encodeURIComponent("'" + _SHEET_NAME + "'!" + c + '1:' + c + '140');
    }).join('&');
    const data = await _sheetsFetch(token,
      'https://sheets.googleapis.com/v4/spreadsheets/' + _SHEET_JEFE_ID +
      '/values:batchGet?majorDimension=COLUMNS&' + ranges);
    const out = {};
    (data.valueRanges || []).forEach(function (vr, i) {
      const col = _COL_LETTERS[i];
      const valores = (vr.values && vr.values[0]) || [];
      valores.forEach(function (texto, idx) {
        if (!texto || !String(texto).trim()) return;
        const iso = _cellRefToDate(col + (idx + 1));
        if (iso) out[iso] = String(texto);
      });
    });
    return out;
  }

  // Escribe celdas. items = [{ cellRef, text, links }]. text '' vacía la celda.
  async function _escribirCeldas(token, items) {
    const gid = await _sheetGid(token);
    const requests = items.map(function (it) {
      const pos = _cellTo0Based(it.cellRef);
      return {
        updateCells: {
          rows: [{ values: [{
            userEnteredValue: { stringValue: it.text },
            textFormatRuns: _buildFormatRuns(it.links || [], it.text.length),
          }] }],
          fields: 'userEnteredValue,textFormatRuns',
          range: {
            sheetId: gid,
            startRowIndex: pos.row, endRowIndex: pos.row + 1,
            startColumnIndex: pos.col, endColumnIndex: pos.col + 1,
          },
        },
      };
    });
    await _sheetsFetch(token,
      'https://sheets.googleapis.com/v4/spreadsheets/' + _SHEET_JEFE_ID + ':batchUpdate',
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: requests }) });
  }

  // Días del schedule con visitas reales (no reserva) que caen en 2026.
  function _diasSubibles() {
    const schedule = Local.schedule || {};
    return Object.keys(schedule).filter(function (d) {
      if (!_getCellRef(d)) return false;
      return (schedule[d] || []).some(function (s) { return !s.reserva; });
    }).sort();
  }

  // Construye el texto y los hipervínculos de un día tal como van a la hoja.
  function _textoDia(dateStr) {
    const schedule = Local.schedule || {};
    const studios = (schedule[dateStr] || []).filter(function (s) { return !s.reserva; });
    if (!studios.length) return null;

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

    function _str(v) { return v && typeof v === 'object' ? (v.valor || '') : String(v || ''); }

    const byProv = {};
    studios.forEach(function (s) {
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
    return { text: text, links: links };
  }

  function _etiquetaDia(dateStr) {
    const p = dateStr.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2])
      .toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  // Sube a la hoja los días indicados. Sin argumento sube todos los subibles.
  async function subirVisitasSheet(dias) {
    const days = (dias && dias.length ? dias.slice() : _diasSubibles()).sort();
    if (!days.length) {
      window.showNotification('⚠️ No hay visitas planificadas de 2026', 'warning');
      return;
    }

    const items = [];
    days.forEach(function (d) {
      const cellRef = _getCellRef(d);
      const contenido = _textoDia(d);
      if (cellRef && contenido) {
        items.push({ dateStr: d, cellRef: cellRef, text: contenido.text, links: contenido.links });
      }
    });
    if (!items.length) {
      window.showNotification('⚠️ No hay celdas que actualizar', 'warning');
      return;
    }

    _conTokenSheets(async function (s) {
      window.showNotification('☁️ Subiendo ' + items.length + ' día' + (items.length === 1 ? '' : 's') + ' al Sheet del jefe…', 'info');
      try {
        await _escribirCeldas(s.accessToken, items);
        const resumen = items.map(function (it) {
          const n = ((Local.schedule || {})[it.dateStr] || []).filter(function (v) { return !v.reserva; }).length;
          return _etiquetaDia(it.dateStr) + ' → ' + n + ' visita' + (n === 1 ? '' : 's') + ' (' + it.cellRef + ')';
        }).join('\n');
        window.showNotification('✅ Sheet del jefe actualizado · ' + items.length + ' día' + (items.length === 1 ? '' : 's'), 'success');
        console.info('[planificador] Sheet jefe OK:\n' + resumen);
        window.open('https://docs.google.com/spreadsheets/d/' + _SHEET_JEFE_ID, '_blank');
      } catch (e) {
        console.error('[planificador] subirVisitasSheet error:', e);
        _invalidarTokenSheets(e);
        window.showNotification('❌ Error al subir al Sheet: ' + (e.message || e), 'error');
      }
    });
  }

  // Vacía en la hoja las celdas de los días indicados.
  async function vaciarDiasSheet(dias) {
    const days = (dias || []).filter(function (d) { return !!_getCellRef(d); }).sort();
    if (!days.length) {
      window.showNotification('⚠️ No hay días seleccionados', 'warning');
      return;
    }

    _conTokenSheets(async function (s) {
      window.showNotification('🧹 Vaciando ' + days.length + ' día' + (days.length === 1 ? '' : 's') + ' en el Sheet del jefe…', 'info');
      try {
        const items = days.map(function (d) {
          return { dateStr: d, cellRef: _getCellRef(d), text: '', links: [] };
        });
        await _escribirCeldas(s.accessToken, items);
        const resumen = items.map(function (it) {
          return _etiquetaDia(it.dateStr) + ' → vaciada (' + it.cellRef + ')';
        }).join('\n');
        window.showNotification('✅ ' + days.length + ' día' + (days.length === 1 ? '' : 's') + ' retirado' + (days.length === 1 ? '' : 's') + ' de la hoja', 'success');
        console.info('[planificador] Sheet jefe vaciado:\n' + resumen);
        window.open('https://docs.google.com/spreadsheets/d/' + _SHEET_JEFE_ID, '_blank');
      } catch (e) {
        console.error('[planificador] vaciarDiasSheet error:', e);
        _invalidarTokenSheets(e);
        window.showNotification('❌ Error al vaciar en el Sheet: ' + (e.message || e), 'error');
      }
    });
  }

  /* ============================================================
     MODAL "SHEET DEL JEFE"
     Elegir qué días se suben y cuáles se vacían, viendo antes lo que
     hay ahora mismo en cada celda. Sin esto la subida iba en bloque:
     una ruta que se caía se reescribía sola en el calendario del jefe.
     ============================================================ */
  const _MODAL_ID = '_sheet-jefe-overlay';
  let _sheetEstado = { anotaciones: {}, filas: [] };

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function abrirModalSheet() {
    _conTokenSheets(async function (s) {
      window.showNotification('📖 Leyendo la hoja del jefe…', 'info');
      try {
        const anotaciones = await _leerAnotaciones(s.accessToken);

        // Días a mostrar: los del planificador + los que ya están escritos en la hoja.
        const delPlan = _diasSubibles();
        const enHoja = Object.keys(anotaciones);
        const todos = [...new Set(delPlan.concat(enHoja))].sort();

        _sheetEstado = {
          anotaciones: anotaciones,
          filas: todos.map(function (iso) {
            const delDia = (Local.schedule || {})[iso] || [];
            const nVisitas = delDia.filter(function (v) { return !v.reserva; }).length;
            return {
              iso: iso,
              cellRef: _getCellRef(iso),
              nVisitas: nVisitas,
              enPlan: delPlan.indexOf(iso) >= 0,
              actual: anotaciones[iso] || '',
            };
          }),
        };
        _pintarModalSheet();
      } catch (e) {
        console.error('[planificador] abrirModalSheet error:', e);
        _invalidarTokenSheets(e);
        window.showNotification('❌ No se pudo abrir el Sheet del jefe: ' + (e.message || e), 'error');
      }
    });
  }

  function _pintarModalSheet() {
    const prev = document.getElementById(_MODAL_ID);
    if (prev) prev.remove();

    const filas = _sheetEstado.filas.map(function (f) {
      // Por defecto solo van marcados los días del planificador: lo que ya está en
      // la hoja y no está planificado suele ser festivos o notas del jefe.
      const checked = f.enPlan ? 'checked' : '';
      const etiqueta = _etiquetaDia(f.iso);
      const estado = f.enPlan
        ? '<span style="color:var(--fg-2,#2a3138)">' + f.nVisitas + ' visita' + (f.nVisitas === 1 ? '' : 's') + ' en el planificador</span>'
        : '<span style="color:#b45309">solo en la hoja — no está en el planificador</span>';
      const actual = f.actual
        ? '<div style="font-size:11px;color:var(--fg-3,#5b6672);margin-top:3px;line-height:1.4;' +
            'overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + _esc(f.actual) + '">' +
            'En la hoja: ' + _esc(f.actual) + '</div>'
        : '<div style="font-size:11px;color:var(--fg-3,#5b6672);margin-top:3px">Celda vacía</div>';
      return (
        '<label style="display:flex;gap:10px;align-items:flex-start;padding:8px 10px;border-radius:8px;' +
          'border:1px solid var(--border-1,#d7dde3);margin-bottom:6px;cursor:pointer">' +
          '<input type="checkbox" class="_sheet-dia" value="' + f.iso + '" ' + checked + ' style="margin-top:3px">' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-size:13px;color:var(--fg-1,#101418)">' +
              '<strong>' + etiqueta + '</strong> ' +
              '<span style="font-family:var(--font-mono,monospace);font-size:11px;color:var(--fg-3,#5b6672)">' + f.cellRef + '</span>' +
              ' · ' + estado +
            '</div>' + actual +
          '</div>' +
        '</label>'
      );
    }).join('');

    const overlay = document.createElement('div');
    overlay.id = _MODAL_ID;
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:9999', 'background:rgba(0,0,0,.55)',
      'display:flex', 'align-items:center', 'justify-content:center',
    ].join(';');
    overlay.innerHTML = [
      '<div style="background:var(--bg-card,#ffffff);border:1px solid var(--border-1,#d7dde3);',
        'border-radius:12px;padding:24px 26px;max-width:640px;width:92%;max-height:82vh;',
        'display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,.5)">',
        '<h3 style="margin:0 0 6px;font-size:16px;color:var(--fg-1,#101418)">☁️ Sheet del jefe · CALENDARIO 2026</h3>',
        '<p style="margin:0 0 14px;font-size:12px;color:var(--fg-2,#2a3138);line-height:1.5">',
          'Elige qué días tocar. <strong>Subir</strong> sobrescribe la celda con lo que haya en el planificador; ',
          '<strong>Vaciar</strong> la deja en blanco. Todo queda en el historial de versiones de la hoja a tu nombre.',
        '</p>',
        (filas
          ? '<div style="flex:1;overflow-y:auto;margin-bottom:14px">' + filas + '</div>'
          : '<p style="font-size:13px;color:var(--fg-2,#2a3138);margin-bottom:14px">No hay días de 2026 ni en el planificador ni en la hoja.</p>'),
        '<div style="display:flex;gap:10px;align-items:center">',
          '<button id="_sheet-none" style="padding:6px 10px;border-radius:8px;border:1px solid var(--border-1,#d7dde3);',
            'background:transparent;color:var(--fg-2,#2a3138);cursor:pointer;font-size:12px">Ninguno</button>',
          '<div style="flex:1"></div>',
          '<button id="_sheet-cancel" style="padding:8px 16px;border-radius:8px;border:1px solid var(--border-1,#d7dde3);',
            'background:transparent;color:var(--fg-2,#2a3138);cursor:pointer;font-size:13px">Cancelar</button>',
          '<button id="_sheet-vaciar" style="padding:8px 16px;border-radius:8px;border:1px solid var(--cta-strong,#c8102e);',
            'background:transparent;color:var(--cta-strong,#c8102e);cursor:pointer;font-size:13px;font-weight:600">🧹 Vaciar</button>',
          '<button id="_sheet-subir" style="padding:8px 18px;border-radius:8px;border:none;',
            'background:var(--cta,#124b8a);color:#fff;cursor:pointer;font-size:13px;font-weight:600">☁️ Subir</button>',
        '</div>',
      '</div>',
    ].join('');
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    document.getElementById('_sheet-cancel').addEventListener('click', function () { overlay.remove(); });
    document.getElementById('_sheet-none').addEventListener('click', function () {
      [...document.querySelectorAll('._sheet-dia')].forEach(function (c) { c.checked = false; });
    });
    document.getElementById('_sheet-subir').addEventListener('click', function () {
      const dias = _diasMarcados();
      if (!dias.length) { window.showNotification('⚠️ No has seleccionado ningún día', 'warning'); return; }
      const sinPlan = dias.filter(function (d) {
        const f = _sheetEstado.filas.find(function (x) { return x.iso === d; });
        return f && !f.enPlan;
      });
      if (sinPlan.length) {
        window.showNotification('⚠️ ' + sinPlan.map(_etiquetaDia).join(', ') + ' no tiene visitas en el planificador — desmárcalo o vacíalo', 'warning');
        return;
      }
      // Si la celda ya tiene algo distinto de lo que vamos a escribir, avisar: puede
      // ser una nota del jefe. Si es idéntico (resubida del mismo día) no molestamos.
      const pisados = dias.filter(function (d) {
        const actual = _sheetEstado.anotaciones[d];
        if (!actual) return false;
        const nuevo = _textoDia(d);
        return !nuevo || actual !== nuevo.text;
      });
      if (pisados.length) {
        const detalle = pisados.map(function (d) {
          const nuevo = _textoDia(d);
          return '· ' + _etiquetaDia(d) + ' (' + _getCellRef(d) + ')\n' +
                 '    ahora: ' + _sheetEstado.anotaciones[d] + '\n' +
                 '    pasará a: ' + (nuevo ? nuevo.text : '(vacío)');
        }).join('\n');
        const ok = window.confirm(
          'En ' + pisados.length + ' celda' + (pisados.length === 1 ? '' : 's') +
          ' ya hay texto distinto del que vas a escribir. Puede ser una nota de tu jefe.\n\n' +
          detalle + '\n\n¿Sobrescribir?'
        );
        if (!ok) return;
      }
      overlay.remove();
      subirVisitasSheet(dias);
    });
    document.getElementById('_sheet-vaciar').addEventListener('click', function () {
      const dias = _diasMarcados();
      if (!dias.length) { window.showNotification('⚠️ No has seleccionado ningún día', 'warning'); return; }
      const conTexto = dias.filter(function (d) { return !!_sheetEstado.anotaciones[d]; });
      const detalle = conTexto.length
        ? conTexto.map(function (d) {
            return '· ' + _etiquetaDia(d) + ' (' + _getCellRef(d) + '): ' + _sheetEstado.anotaciones[d];
          }).join('\n')
        : '(las celdas ya están vacías)';
      const ok = window.confirm(
        'Vas a dejar en blanco ' + dias.length + ' celda' + (dias.length === 1 ? '' : 's') +
        ' en la hoja de tu jefe.\n\nSe borrará esto:\n\n' + detalle +
        '\n\nQueda registrado en el historial de versiones a tu nombre. ¿Continuar?'
      );
      if (!ok) return;
      overlay.remove();
      vaciarDiasSheet(dias);
    });
  }

  function _diasMarcados() {
    return [...document.querySelectorAll('._sheet-dia')]
      .filter(function (c) { return c.checked; })
      .map(function (c) { return c.value; });
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
      // Normaliza a la URL canónica autorizada en Google (sin query, sin hash y sin
      // "index.html"); si no, abrir la app como …/index.html da redirect_uri_mismatch.
      const redirectUri = window.location.href.split('?')[0].split('#')[0].replace(/index\.html?$/i, '');
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
      // Normaliza a la URL canónica autorizada en Google (sin query, sin hash y sin
      // "index.html"); si no, abrir la app como …/index.html da redirect_uri_mismatch.
      const redirectUri = window.location.href.split('?')[0].split('#')[0].replace(/index\.html?$/i, '');
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
    const baseUrl = 'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(calendarId) + '/events';
    const actualizar = !!opts.eventId;
    const url = actualizar ? baseUrl + '/' + encodeURIComponent(opts.eventId) : baseUrl;
    const metodo = actualizar ? 'PATCH' : 'POST';
    try {
      const resp = await fetch(url, {
        method: metodo,
        headers: { 'Authorization': 'Bearer ' + calSettings.accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });
      if (resp.status === 401) {
        calSettings.accessToken = null; calSettings.tokenExpiry = 0;
        localStorage.setItem('ferroplast_test_calendar_settings', JSON.stringify(calSettings));
        window.showNotification('⚠️ Sesión de calendario caducada. Vuelve a guardar la actividad para reconectar.', 'warning');
        return false;
      }
      // Si íbamos a actualizar pero el evento ya no existe → crear uno nuevo.
      if (actualizar && (resp.status === 404 || resp.status === 410)) {
        const nuevoOpts = Object.assign({}, opts, { eventId: null });
        return agendarActividadCalendar(studio, nuevoOpts);
      }
      if (!resp.ok) { const err = await resp.json().catch(function () { return {}; }); throw new Error((err.error && err.error.message) || resp.statusText); }
      const json = await resp.json().catch(function () { return {}; });
      const eventId = json.id || opts.eventId || null;
      window.showNotification(actualizar ? '📅 Evento actualizado en tu Google Calendar' : '📅 Añadido a tu Google Calendar', 'success');
      if (typeof opts.onResult === 'function') { try { opts.onResult({ eventId: eventId, actualizado: actualizar }); } catch (_) {} }
      return eventId || true;
    } catch (e) {
      window.showNotification('No se pudo ' + (actualizar ? 'actualizar' : 'añadir') + ' en el calendario: ' + e.message, 'error');
      return false;
    }
  }

  /* ============================================================
     PANEL "PENDIENTE EN LA ZONA"
     Acotado a la zona de la ruta (provincia + limítrofes) reúne, sin
     duplicar lógica:
       · acciones pendientes de informes y bandeja (AccionesEngine)
       · anotaciones de los informes de clientes de la zona
       · referencias cruzadas (menciones de terceros de la zona)
     ============================================================ */

  // Provincias distintas de las visitas de la semana mostrada (autosugerencia).
  function _provinciasSemana() {
    var set = [];
    for (var i = 0; i < 7; i++) {
      var iso = toISO(addDays(Local.semanaLunes, i));
      (Local.schedule[iso] || []).forEach(function (v) {
        var p = (v.province || '').trim();
        if (p && set.indexOf(p) < 0) set.push(p);
      });
    }
    return set;
  }

  // Provincias activas del panel: manuales si las hay, si no autosugeridas.
  function _zonaProvsActivas() {
    if (Local.zonaProvincias != null) return Local.zonaProvincias;
    return _provinciasSemana();
  }

  function zonaPanel() {
    return '<div id="planner-zona" style="margin-top:24px;">' + _zonaPanelInner() + '</div>';
  }

  function _zonaPanelInner() {
    var chevron = Local.zonaOpen ? '▾' : '▸';
    var head = (
      '<div onclick="window.Screens.planificador.toggleZona()" ' +
        'style="display:flex; align-items:center; gap:8px; cursor:pointer; padding:12px 14px; ' +
        'background:var(--bg-2); border-radius:8px; user-select:none;">' +
        '<span style="font-family:var(--font-mono); color:var(--fg-3);">' + chevron + '</span>' +
        '<span style="font-size:16px;">🧭</span>' +
        '<strong style="font-family:var(--font-display); font-size:16px; text-transform:uppercase; letter-spacing:.01em;">Pendiente en la zona</strong>' +
        '<span style="font-size:12px; color:var(--fg-3);">acciones y anotaciones de informes cercanas a tu ruta</span>' +
      '</div>'
    );
    if (!Local.zonaOpen) return head;
    return head +
      '<div style="border:1px solid var(--line); border-top:none; border-radius:0 0 8px 8px; padding:14px;">' +
        _zonaControls() +
        '<div id="planner-zona-body" style="margin-top:14px;">' +
          '<span style="font-size:13px; color:var(--fg-3);">⏳ Cargando pendientes de la zona…</span>' +
        '</div>' +
      '</div>';
  }

  function _zonaControls() {
    var activas = _zonaProvsActivas();
    var esAuto = Local.zonaProvincias == null;
    var chips = activas.length
      ? activas.map(function (p) {
          return '<span style="display:inline-flex; align-items:center; gap:4px; background:var(--gpf-blue-100); color:var(--gpf-blue-900); font-size:12px; padding:3px 6px 3px 9px; border-radius:999px;">' +
            escape(p) +
            '<button onclick="window.Screens.planificador.zonaRemoveProv(\'' + escape(p) + '\')" title="Quitar" ' +
              'style="border:none; background:none; cursor:pointer; color:var(--gpf-blue-700); font-size:13px; line-height:1; padding:0 2px;">✕</button>' +
          '</span>';
        }).join('')
      : '<span style="font-size:12px; color:var(--fg-3);">Sin provincias en la semana. Añade una →</span>';
    var addOptions = '<option value="">+ Añadir provincia…</option>' +
      U.PROVINCIAS.map(function (p) { return '<option value="' + escape(p) + '">' + escape(p) + '</option>'; }).join('');
    return (
      '<div style="display:flex; flex-wrap:wrap; align-items:center; gap:8px;">' +
        '<span style="font-size:12px; color:var(--fg-3); text-transform:uppercase; letter-spacing:.05em;">Zona' + (esAuto ? ' (auto)' : '') + ':</span>' +
        chips +
        '<select onchange="window.Screens.planificador.zonaAddProv(this.value); this.value=\'\';" ' +
          'style="padding:4px 8px; border:1px solid var(--line); border-radius:6px; font-size:12px; background:var(--bg-card); color:var(--fg-1);">' +
          addOptions +
        '</select>' +
        (esAuto ? '' : '<button class="btn btn-ghost" style="font-size:11px; padding:3px 8px;" onclick="window.Screens.planificador.zonaAuto()">↺ Auto</button>') +
        '<label style="display:inline-flex; align-items:center; gap:5px; font-size:12px; color:var(--fg-2); margin-left:auto; cursor:pointer;">' +
          '<input type="checkbox" ' + (Local.zonaLimitrofes ? 'checked' : '') + ' ' +
            'onchange="window.Screens.planificador.toggleLimitrofes(this.checked)"> incluir limítrofes' +
        '</label>' +
      '</div>'
    );
  }

  function _rerenderZonaPanel() {
    var host = document.getElementById('planner-zona');
    if (host) host.innerHTML = _zonaPanelInner();
  }

  function _loadZona(force) {
    var body = document.getElementById('planner-zona-body');
    if (!body) return;
    var activas = _zonaProvsActivas();
    var zonaSet = U.provinciasCercanas(activas, Local.zonaLimitrofes);
    // Anotaciones (síncronas) — se calculan ya para no dejar el panel vacío
    var anotaciones = _zonaAnotacionesHtml(zonaSet);
    var engine = window.AccionesEngine;
    if (!engine) {
      body.innerHTML = _zonaAccionesVacio('Motor de acciones no disponible (requiere JSZip).') + anotaciones;
      return;
    }
    if (zonaSet.size === 0) {
      body.innerHTML = _zonaAccionesVacio('Define la zona (provincias) para ver lo pendiente.') + anotaciones;
      return;
    }
    body.innerHTML = '<span style="font-size:13px; color:var(--fg-3);">⏳ Detectando pendientes en la zona…</span>';
    Local._zonaLoading = true;
    var studios = State.studios || [];
    engine.cargarAcciones(studios, !!force).then(function (allItems) {
      Local._zonaLoading = false;
      var vigentes = engine.filtrarVigentes(allItems, studios).filter(function (it) {
        return zonaSet.has(U.normProv(it.studioProvince));
      });
      var b = document.getElementById('planner-zona-body');
      if (b) b.innerHTML = _zonaAccionesHtml(vigentes) + anotaciones;
    }).catch(function (e) {
      Local._zonaLoading = false;
      var b = document.getElementById('planner-zona-body');
      if (b) b.innerHTML = _zonaAccionesVacio('Error al procesar informes: ' + escape(e.message)) + anotaciones;
    });
  }

  function _zonaSeccion(titulo, n) {
    return '<div class="eyebrow" style="margin-bottom:8px;">' + escape(titulo) + (n != null ? ' · ' + n : '') + '</div>';
  }

  function _zonaAccionesVacio(msg) {
    return _zonaSeccion('Acciones pendientes') +
      '<p style="font-size:13px; color:var(--fg-3); margin:0 0 16px;">' + escape(msg) + '</p>';
  }

  function _zonaAccionesHtml(items) {
    _zonaAccionesById = {};
    if (!items.length) {
      return _zonaSeccion('Acciones pendientes', 0) +
        '<p style="font-size:13px; color:var(--fg-3); margin:0 0 16px;">Sin acciones pendientes en esta zona. 🎉</p>';
    }
    var hoy = new Date().toISOString().slice(0, 10);
    var tipoBg = { llamada: '#3b82f6', email: '#8b5cf6', material: '#f59e0b', reunion: '#10b981' };
    var resolveLabels = { email: '✨ Redactar email', reunion: '📅 Proponer fecha', material: '📦 Coordinar entrega', llamada: '📞 Llamar' };
    var cards = items.slice(0, 40).map(function (it) {
      _zonaAccionesById[it.id] = it;
      var bg = tipoBg[it.tipo] || (it._fromActivity ? '#16a34a' : '#64748b');
      var urgente = it.fechaLimite && it.fechaLimite <= hoy;
      var plazoHtml = it.fechaLimite
        ? '<span style="background:' + (urgente ? '#fef2f2' : '#eff6ff') + ';color:' + (urgente ? '#991b1b' : '#1e40af') + ';padding:2px 7px;border-radius:6px;font-size:11px;font-weight:600;">' + (urgente ? '🔴' : '📅') + ' ' + escape(it.fechaLimite) + '</span>'
        : '';
      var esActiv = !!it._fromActivity;
      var borderStyle = esActiv ? 'border-left:3px solid #16a34a;' : (urgente ? 'border-left:3px solid #dc2626;' : '');
      var btnCompletar = esActiv
        ? '<button class="btn btn-primary" style="font-size:11px; padding:4px 10px; background:#16a34a; border-color:#16a34a;" onclick="window.Screens.planificador._completarZona(\'' + escape(it._studioId) + '\',' + it._activityIdx + ')">✓ Hecho</button>'
        : '';
      var resolveLabel = resolveLabels[it.tipo];
      var btnResolver = resolveLabel
        ? '<button class="btn btn-primary" style="font-size:11px; padding:4px 10px;" onclick="window.Screens.planificador._resolverZona(\'' + escape(String(it.id)) + '\')">' + resolveLabel + '</button>'
        : '';
      return (
        '<div style="background:var(--bg-card); border:1px solid var(--line); border-radius:10px; padding:12px; ' + borderStyle + '">' +
          '<div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:6px;">' +
            '<span style="background:' + bg + ';color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px;">' + it.tipoIcon + ' ' + escape(it.tipo.toUpperCase()) + '</span>' +
            (esActiv ? '<span style="background:#dcfce7;color:#166534;font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px;">BANDEJA</span>' : '') +
            '<strong style="font-size:13px; color:var(--gpf-blue-700); cursor:pointer;" onclick="showView(\'detail\',{studioId:\'' + escape(it.studioId) + '\'})">' + escape(it.studioName) + '</strong>' +
            '<span style="font-size:11px; color:var(--fg-3);">(' + escape(it.studioProvince) + ')</span>' +
            plazoHtml +
          '</div>' +
          '<div style="font-size:12px; color:var(--fg-2); margin-bottom:8px; ' + (esActiv ? 'font-weight:500;color:var(--fg-1);' : 'font-style:italic;') + '">' + (esActiv ? '' : '"') + escape(it.descripcion) + (esActiv ? '' : '"') + '</div>' +
          '<div style="display:flex; gap:6px; flex-wrap:wrap;">' +
            btnResolver + btnCompletar +
            '<button class="btn btn-ghost" style="font-size:11px; padding:4px 10px;" onclick="window.Screens.planificador._descartarZona(\'' + escape(String(it.id)) + '\'' + (esActiv ? ',\'' + escape(it._studioId) + '\',' + it._activityIdx : '') + ')">✕ Descartar</button>' +
            '<a href="#detail/' + escape(it.studioId) + '" class="btn btn-ghost" style="font-size:11px; padding:4px 10px;" onclick="showView(\'detail\',{studioId:\'' + escape(it.studioId) + '\'});return false;">Ver ficha →</a>' +
          '</div>' +
        '</div>'
      );
    }).join('');
    return _zonaSeccion('Acciones pendientes', items.length) +
      '<div class="planner-zona-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">' + cards + '</div>' +
      (items.length > 40 ? '<p style="font-size:12px; color:var(--fg-3); margin-top:8px; text-align:center;">… y ' + (items.length - 40) + ' más.</p>' : '');
  }

  function _reportSnippet(r) {
    var txt = r.notes || r.resumen_ejecutivo || r.markdown || r.markdownContent || r.notes_raw || '';
    txt = U.stripTimestamps(String(txt))
      .replace(/[#*_>`]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (txt.length > 180) txt = txt.slice(0, 180) + '…';
    return txt;
  }

  function _zonaAnotacionesHtml(zonaSet) {
    // A) Notas de informes de clientes ubicados en la zona
    var studios = State.studios || [];
    var conNotas = [];
    for (var i = 0; i < studios.length; i++) {
      var s = studios[i];
      if (!zonaSet.has(U.normProv(s.province))) continue;
      var reps = U.reports(s);
      if (!reps.length) continue;
      var ordenados = reps.slice().sort(function (a, b) { return (a.date || '') < (b.date || '') ? 1 : -1; });
      var snippet = '', fecha = '';
      for (var ri = 0; ri < ordenados.length; ri++) {
        var sn = _reportSnippet(ordenados[ri]);
        if (sn) { snippet = sn; fecha = ordenados[ri].date || ''; break; }
      }
      if (!snippet) continue;
      conNotas.push({ id: s.id, name: s.name || s.id, province: s.province || '', fecha: fecha, snippet: snippet });
    }
    conNotas.sort(function (a, b) { return (a.fecha || '') < (b.fecha || '') ? 1 : -1; });
    var notasHtml = conNotas.length
      ? '<div class="planner-zona-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">' +
          conNotas.slice(0, 20).map(function (n) {
            return '<div style="background:var(--bg-card); border:1px solid var(--line); border-radius:8px; padding:10px; cursor:pointer;" onclick="showView(\'detail\',{studioId:\'' + escape(n.id) + '\'})">' +
              '<div style="display:flex; gap:6px; align-items:baseline; flex-wrap:wrap;">' +
                '<strong style="font-size:13px; color:var(--gpf-blue-700);">' + escape(n.name) + '</strong>' +
                '<span style="font-size:11px; color:var(--fg-3);">' + escape(n.province) + (n.fecha ? ' · ' + escape(n.fecha) : '') + '</span>' +
              '</div>' +
              '<div style="font-size:12px; color:var(--fg-2); margin-top:4px; font-style:italic;">' + escape(n.snippet) + '</div>' +
            '</div>';
          }).join('') +
        '</div>'
      : '<p style="font-size:13px; color:var(--fg-3); margin:0;">Sin anotaciones de informes en la zona.</p>';

    // B) Referencias cruzadas de la zona (menciones de terceros)
    var refs = [];
    try { refs = (window.Screens.bandeja && window.Screens.bandeja.getRefCruz) ? window.Screens.bandeja.getRefCruz() : []; } catch (e) { refs = []; }
    refs = (refs || []).filter(function (r) {
      if (r.provinciaInferida && zonaSet.has(U.normProv(r.provinciaInferida))) return true;
      return (r.origenes || []).some(function (o) { return zonaSet.has(U.normProv(o.origenProvincia)); });
    });
    var TIPO_COLORS = {
      CCRR: { bg: '#e0f2fe', fg: '#0369a1', label: 'C.R.' },
      EDAR: { bg: '#ede9fe', fg: '#5b21b6', label: 'EDAR/ETAP' },
      AAPP: { bg: '#fef9c3', fg: '#854d0e', label: 'AAPP' },
      CICA: { bg: '#dcfce7', fg: '#166534', label: 'Ciclo Agua' },
      ARQ:  { bg: '#fff7ed', fg: '#9a3412', label: 'Arquitectura' },
      ING:  { bg: '#fce7f3', fg: '#9d174d', label: 'Ingeniería' },
    };
    var refsHtml = refs.length
      ? '<div class="planner-zona-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:0 24px;">' +
          refs.slice(0, 20).map(function (r) {
            var tc = TIPO_COLORS[r.tipo] || { bg: '#f0f0f0', fg: '#555', label: r.tipo };
            var origenes = r.origenes || [];
            var origDesc = origenes.slice(0, 2).map(function (o) { return o.origenName; }).join(', ');
            if (origenes.length > 2) origDesc += ' +' + (origenes.length - 2);
            var enCartera = r.matchStudioId ? '<span style="font-size:11px; color:var(--gpf-blue-600); font-weight:600; margin-left:4px;">↗ cartera</span>' : '';
            var clickable = !!r.matchStudioId;
            return '<div ' + (clickable ? 'onclick="showView(\'detail\',{studioId:\'' + escape(r.matchStudioId) + '\'})" ' : '') +
              'style="padding:8px 0; border-top:1px solid var(--line); cursor:' + (clickable ? 'pointer' : 'default') + ';">' +
              '<div style="display:flex; align-items:center; gap:6px;">' +
                '<span style="font-size:10px; font-weight:600; font-family:var(--font-mono); padding:2px 6px; border-radius:4px; background:' + tc.bg + '; color:' + tc.fg + ';">' + escape(tc.label) + '</span>' +
                '<span style="font-size:13px; font-weight:600; color:var(--fg-1);" title="' + escape(r.nombre) + '">' + escape(r.nombre) + '</span>' +
                enCartera +
              '</div>' +
              '<div style="font-size:11px; color:var(--fg-3); margin-top:2px;">' + (r.provinciaInferida ? '<span style="color:var(--fg-2);">' + escape(r.provinciaInferida) + '</span> · ' : '') + 'visto en: ' + escape(origDesc) + '</div>' +
            '</div>';
          }).join('') +
        '</div>'
      : '<p style="font-size:13px; color:var(--fg-3); margin:0;">Sin menciones de terceros de la zona en tus informes.</p>';

    return (
      '<div style="margin-top:18px;">' + _zonaSeccion('Anotaciones de informes de la zona', conNotas.length) + notasHtml + '</div>' +
      '<div style="margin-top:16px;">' + _zonaSeccion('Referencias cruzadas de la zona', refs.length) + refsHtml + '</div>'
    );
  }

  /* Handlers del panel de zona */
  function toggleZona() {
    Local.zonaOpen = !Local.zonaOpen;
    _rerenderZonaPanel();
    if (Local.zonaOpen) _loadZona();
  }
  function zonaAddProv(prov) {
    if (!prov) return;
    var base = _zonaProvsActivas().slice();
    if (base.indexOf(prov) < 0) base.push(prov);
    Local.zonaProvincias = base;
    _rerenderZonaPanel();
    _loadZona();
  }
  function zonaRemoveProv(prov) {
    Local.zonaProvincias = _zonaProvsActivas().filter(function (p) { return p !== prov; });
    _rerenderZonaPanel();
    _loadZona();
  }
  function zonaAuto() {
    Local.zonaProvincias = null;
    _rerenderZonaPanel();
    _loadZona();
  }
  function toggleLimitrofes(checked) {
    Local.zonaLimitrofes = !!checked;
    _loadZona();
  }
  function _completarZona(studioId, actIdx) {
    var engine = window.AccionesEngine;
    if (!engine || !engine.completarActividad) return;
    engine.completarActividad(studioId, actIdx).then(function () {
      window.showNotification && window.showNotification('✓ Acción completada', 'success');
      _loadZona(true);
    }).catch(function (e) {
      window.showNotification && window.showNotification('Error al completar: ' + e.message, 'error');
    });
  }
  function _descartarZona(id, studioId, actIdx) {
    var engine = window.AccionesEngine;
    if (studioId !== undefined && actIdx !== undefined) {
      engine && engine.completarActividad && engine.completarActividad(studioId, actIdx).then(function () {
        window.showNotification && window.showNotification('✕ Acción descartada', 'info');
        _loadZona(true);
      });
      return;
    }
    if (engine && engine.descartar) engine.descartar(id);
    window.showNotification && window.showNotification('✕ Acción descartada', 'info');
    _loadZona();
  }
  function _resolverZona(id) {
    var it = _zonaAccionesById[id];
    if (!it) return;
    if (window.Screens && window.Screens.detail && window.Screens.detail.resolverAccion) {
      window.Screens.detail.resolverAccion(it.studioId, it.tipo, it.descripcion);
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
    subirSheet: abrirModalSheet,
    subirVisitasSheet: subirVisitasSheet,
    vaciarDiasSheet: vaciarDiasSheet,
    subirCalendario: subirCalendario,
    agendarActividadCalendar: agendarActividadCalendar,
    // Panel "Pendiente en la zona"
    toggleZona: toggleZona,
    zonaAddProv: zonaAddProv,
    zonaRemoveProv: zonaRemoveProv,
    zonaAuto: zonaAuto,
    toggleLimitrofes: toggleLimitrofes,
    _completarZona: _completarZona,
    _descartarZona: _descartarZona,
    _resolverZona: _resolverZona,
  };
})();
