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

    // Cargar schedule del State si no se ha cargado todavía
    if (!Local.schedule) {
      const plan = State.planificador && State.planificador.schedule;
      Local.schedule = plan ? deepClone(plan) : {};
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
      '<div style="display:flex; align-items:center; gap:12px; margin-bottom:16px; ' +
        'padding:10px 12px; background:var(--bg-2); border-radius:8px;">' +
        '<button class="btn btn-ghost" onclick="window.Screens.planificador.cambiarSemana(-7)" title="Semana anterior">' +
          I.ChevronLeft() + '</button>' +
        '<button class="btn btn-ghost" onclick="window.Screens.planificador.irHoy()" style="font-family:var(--font-mono); font-size:12px;">Hoy</button>' +
        '<button class="btn btn-ghost" onclick="window.Screens.planificador.cambiarSemana(7)" title="Semana siguiente">' +
          I.ChevronRight() + '</button>' +
        '<strong style="font-family:var(--font-display); font-size:18px; margin-left:8px;">' + semanaEtiqueta(Local.semanaLunes) + '</strong>' +
        '<span style="color:var(--fg-3); font-size:12px;">· ' + totalSemana + ' visita' + (totalSemana === 1 ? '' : 's') + '</span>' +
        '<div style="flex:1;"></div>' +
        dirtyBadge +
        (Local.dirty
          ? '<button class="btn btn-primary" ' + (Local.guardando ? 'disabled' : '') + ' ' +
            'onclick="window.Screens.planificador.guardar()" style="font-family:var(--font-mono); font-size:12px;">' +
            (Local.guardando ? 'Guardando…' : 'Guardar cambios') +
            '</button>'
          : '') +
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
      '<div style="display:grid; grid-template-columns:repeat(7, 1fr); gap:10px;">' +
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
    const options = studios.slice(0, 1000).map(function (s) {
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
    let id = opts.visita.id || '';
    let province = opts.visita.province || '';
    let cityFinal = city.trim();
    if (!id) {
      const match = (State.studios || []).find(function (s) { return (s.name || '').toLowerCase() === name.trim().toLowerCase(); });
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
     GUARDAR
     ============================================================ */
  async function guardar() {
    if (!Local.dirty || Local.guardando) return;
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
  };
})();
