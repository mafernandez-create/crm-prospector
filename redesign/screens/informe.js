/* CRM Prospector · rediseño v1 · Fase C5 — Formulario Informe de visita
 *
 * Origen: handoff mobile-screens.jsx · ScreenInforme
 *
 * Estructura:
 *   - Header (border-bottom): X cerrar · "Informe de visita" + autosave indicator · spacer
 *   - Body scroll:
 *     · "Empresa" label + chip azul claro con icono Building + nombre
 *     · field-label "Modalidad" + segmented control 2 cols (Visita real / Ficticia)
 *     · field-label "Fecha de la visita" + input date
 *     · field-label "Comercial de zona" + select con opciones
 *     · checkbox panel paper-warm "Visita iniciada por prescripción"
 *     · field-label "Tus notas de la visita" + textarea grande con placeholder
 *     · contador caracteres + "autoguardado activo"
 *   - Sticky bottom CTA bar: Borrador (ghost) + Generar informe (primary 54h)
 *
 * Autosave a localStorage en key 'redesign:informe:draft:{studioId}' cada
 * keystroke. Recarga el borrador al volver a la pantalla. TTL informativo:
 * 30 días (limpieza pendiente Fase G).
 *
 * "Generar informe" mostrará alert hasta Fase G (cuando wireemos el
 * endpoint GAS).
 */
(function () {
  'use strict';

  const I = window.Icon;
  const State = window.State;
  const U = window.Util;
  const escape = U.escapeHtml;

  /* ============================================================
     MOCK CATALOG — nombres para chip "Empresa"
     ============================================================ */
  const NOMBRES = {
    '3012': 'J. Huesa Water Technology',
    '2435': 'ARRAM Consultores',
    '3014': 'NOVA HIDRÁULICA',
    '3009': 'INAGEN',
    '3020': 'GESER Ingenieros',
    '3027': 'Estudio Córdoba Levante SL',
  };

  function getName(id) {
    if (State.studiosById && State.studiosById[id]) {
      return State.studiosById[id].name || id;
    }
    return NOMBRES[id] || ('Estudio ' + id);
  }

  /* ============================================================
     COMERCIALES — opciones del select
     ============================================================ */
  const COMERCIALES = [
    { id: 'manuel',     label: 'Ferroplast · Manuel Fernández' },
    { id: 'rafael',     label: 'Ferroplast · Rafael Jurado' },
    { id: 'joseba',     label: 'Tuyper · Joseba Robles' },
    { id: 'sayago',     label: 'Ferroplast · Manuel Sayago' },
  ];

  /* ============================================================
     PERSISTENCIA
     ============================================================ */
  function draftKey(id) {
    return 'redesign:informe:draft:' + id;
  }
  function loadDraft(id) {
    try {
      const raw = localStorage.getItem(draftKey(id));
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }
  function saveDraft(id, draft) {
    try {
      draft.savedAt = new Date().toISOString();
      localStorage.setItem(draftKey(id), JSON.stringify(draft));
      return true;
    } catch (e) {
      return false;
    }
  }
  function clearDraft(id) {
    try { localStorage.removeItem(draftKey(id)); } catch (e) {}
  }

  /* ============================================================
     RENDER
     ============================================================ */
  function render(params) {
    const v = document.getElementById('view-informe');
    if (!v) return;
    const id = (params && params.studioId) || State.currentStudioId;
    if (!id) {
      v.innerHTML = emptyState();
      return;
    }
    State.currentStudioId = id;
    const empresa = getName(id);
    document.getElementById('topbar-current').textContent = 'Informe · ' + empresa;

    const draft = loadDraft(id);
    const isMobile = window.innerWidth < 768;
    v.innerHTML = isMobile ? renderMobile(id, empresa, draft) : renderDesktopColumn(id, empresa, draft);
    wireForm(id, draft);
  }

  function emptyState() {
    return (
      '<div style="max-width:380px; margin:80px auto; text-align:center;">' +
        '<h2 style="font-family:var(--font-display); font-weight:600; font-size:20px; margin:0 0 8px;">Sin cliente seleccionado</h2>' +
        '<p style="font-size:14px; color:var(--fg-3);">Abre la ficha de un cliente y pulsa "Redactar informe de visita".</p>' +
        '<button class="btn btn-ghost btn-block" style="margin-top:16px;" onclick="showView(\'studios\')">Ver listado</button>' +
      '</div>'
    );
  }

  /* ============================================================
     MOBILE — iPhone frame
     ============================================================ */
  function renderMobile(id, empresa, draft) {
    return (
      '<div class="iphone-frame">' +
        statusBar() +
        headerBar(id, draft) +
        '<div style="flex:1; overflow:auto; padding:20px var(--sp-5) 140px;">' +
          formBody(id, empresa, draft) +
        '</div>' +
        stickyCta(id) +
        '<div class="home-indicator"></div>' +
      '</div>'
    );
  }

  function renderDesktopColumn(id, empresa, draft) {
    return (
      '<div style="max-width:560px; margin:0 auto; padding-bottom:120px;">' +
        '<div style="padding-bottom:18px; border-bottom:1px solid var(--line); margin-bottom:24px;">' +
          headerBar(id, draft) +
        '</div>' +
        formBody(id, empresa, draft) +
        '<div style="position:sticky; bottom:0; padding:16px 0 24px; ' +
          'background:linear-gradient(to bottom, transparent, var(--bg-app) 30%); display:flex; gap:10px;">' +
          stickyCtaBtns(id) +
        '</div>' +
      '</div>'
    );
  }

  /* ============================================================
     BLOQUES
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

  function headerBar(id, draft) {
    const hasDraft = !!(draft && draft.savedAt);
    const indicador = hasDraft
      ? '<div id="autosave-indicator" style="font-size:11px; color:#14704a; display:flex; align-items:center; gap:4px; justify-content:center; margin-top:1px;">' +
          '<span style="width:6px; height:6px; border-radius:50%; background:#14704a;"></span>' +
          'Borrador local · cargado' +
        '</div>'
      : '<div id="autosave-indicator" style="font-size:11px; color:var(--fg-3); display:flex; align-items:center; gap:4px; justify-content:center; margin-top:1px;">' +
          '<span style="width:6px; height:6px; border-radius:50%; background:var(--fg-muted);"></span>' +
          'Sin borrador aún' +
        '</div>';
    return (
      '<div style="padding:8px var(--sp-4) 14px; border-bottom:1px solid var(--line); flex:0 0 auto; ' +
        'display:flex; align-items:center; justify-content:space-between; background:var(--paper-warm);">' +
        '<button aria-label="Cerrar informe" ' +
          'style="background:transparent; border:0; color:var(--gpf-blue-700); display:flex; align-items:center; ' +
                  'gap:4px; padding:6px; min-width:44px; min-height:44px; font-size:16px; cursor:pointer; ' +
                  'margin-left:-6px;" ' +
          'onclick="confirm(\'¿Cerrar sin guardar?\\nEl borrador queda en local de todas formas.\') && showView(\'detail\', { studioId: \'' + escape(id) + '\' })">' +
          I.X() +
        '</button>' +
        '<div style="text-align:center;">' +
          '<div style="font-family:var(--font-display); font-weight:600; font-size:17px; color:var(--fg-1);">Informe de visita</div>' +
          indicador +
        '</div>' +
        '<span style="width:44px;"></span>' +
      '</div>'
    );
  }

  function formBody(id, empresa, draft) {
    const modalidad = draft.modalidad || 'real';
    const fecha = draft.fecha || new Date().toISOString().slice(0, 10);
    const comercial = draft.comercial || 'manuel';
    const prescripcion = !!draft.prescripcion;
    const notas = draft.notes || '';

    return (
      // Empresa chip
      '<div style="margin-bottom:6px; font-size:14px; color:var(--fg-3);">Empresa</div>' +
      '<div style="background:var(--gpf-blue-100); padding:12px 14px; border-radius:10px; margin-bottom:22px; ' +
        'display:flex; align-items:center; gap:10px;">' +
        '<span style="color:var(--gpf-blue-700);">' + I.Building() + '</span>' +
        '<span style="font-size:16px; font-weight:600; color:var(--gpf-blue-900);">' + escape(empresa) + '</span>' +
      '</div>' +

      // Modalidad segmented
      '<label class="field-label">Modalidad</label>' +
      '<div id="seg-modalidad" style="display:grid; grid-template-columns:1fr 1fr; gap:0; ' +
        'background:var(--ink-100); border-radius:10px; padding:4px; margin-bottom:20px;">' +
        segBtn('real',     'Visita real', modalidad === 'real') +
        segBtn('ficticia', 'Ficticia',     modalidad === 'ficticia') +
      '</div>' +

      // Fecha
      '<label class="field-label" for="inf-fecha">Fecha de la visita</label>' +
      '<input id="inf-fecha" type="date" class="field" value="' + escape(fecha) + '" style="margin-bottom:20px;"/>' +

      // Comercial
      '<label class="field-label" for="inf-comercial">Comercial de zona</label>' +
      '<select id="inf-comercial" class="field" style="margin-bottom:20px;">' +
        COMERCIALES.map(function (c) {
          return '<option value="' + escape(c.id) + '"' + (comercial === c.id ? ' selected' : '') + '>' + escape(c.label) + '</option>';
        }).join('') +
      '</select>' +

      // Checkbox prescripción
      '<label style="display:flex; align-items:center; gap:12px; padding:12px 14px; ' +
        'background:var(--paper-warm); border:1px solid var(--line); border-radius:10px; ' +
        'margin-bottom:24px; cursor:pointer; min-height:48px;">' +
        '<input id="inf-prescripcion" type="checkbox"' + (prescripcion ? ' checked' : '') + ' ' +
          'style="width:22px; height:22px; accent-color: var(--gpf-blue-700); flex:0 0 auto;"/>' +
        '<span style="font-size:15px; color:var(--fg-1); flex:1;">Visita iniciada por prescripción</span>' +
      '</label>' +

      // Notas textarea
      '<label class="field-label" for="inf-notas">Tus notas de la visita</label>' +
      '<textarea id="inf-notas" class="field" style="min-height:200px;" ' +
        'placeholder="Escribe libremente lo que recuerdes de la visita: con quién hablaste, qué se mostró, qué reacciones tuvieron, próximos pasos…">' +
        escape(notas) +
      '</textarea>' +
      '<div style="display:flex; justify-content:space-between; font-size:12px; color:var(--fg-3); ' +
        'margin-top:8px; font-family:var(--font-mono);">' +
        '<span id="char-count">≈ ' + notas.length + ' caracteres</span>' +
        '<span>autoguardado activo</span>' +
      '</div>'
    );
  }

  function segBtn(val, label, active) {
    if (active) {
      return (
        '<button data-modalidad="' + val + '" style="padding:12px; text-align:center; font-size:15px; ' +
          'font-weight:600; background:#fff; border-radius:7px; color:var(--gpf-blue-900); ' +
          'box-shadow:0 1px 2px rgba(10,45,82,.08); border:0; cursor:pointer; min-height:44px;">' +
          escape(label) +
        '</button>'
      );
    }
    return (
      '<button data-modalidad="' + val + '" style="padding:12px; text-align:center; font-size:15px; ' +
        'font-weight:500; background:transparent; color:var(--fg-3); border:0; cursor:pointer; min-height:44px;">' +
        escape(label) +
      '</button>'
    );
  }

  function stickyCta(id) {
    return (
      '<div style="position:absolute; left:0; right:0; bottom:0; ' +
        'background:rgba(255,255,255,.96); backdrop-filter:saturate(180%) blur(14px); ' +
        '-webkit-backdrop-filter:saturate(180%) blur(14px); ' +
        'border-top:1px solid var(--line); padding:12px var(--sp-5) calc(var(--safe-bot) + 12px); ' +
        'display:flex; gap:10px;">' +
        stickyCtaBtns(id) +
      '</div>'
    );
  }
  function stickyCtaBtns(id) {
    return (
      '<button class="btn btn-ghost" style="flex:0 0 auto;" id="btn-borrador">Borrador</button>' +
      '<button class="btn btn-primary" style="flex:1; height:54px; font-size:17px;" id="btn-generar">' +
        I.Check() + ' Generar informe' +
      '</button>'
    );
  }

  /* ============================================================
     WIRING
     ============================================================ */
  function wireForm(id, initialDraft) {
    const draft = Object.assign({}, initialDraft);
    if (!draft.modalidad) draft.modalidad = 'real';
    if (!draft.fecha) draft.fecha = new Date().toISOString().slice(0, 10);
    if (!draft.comercial) draft.comercial = 'manuel';
    if (typeof draft.prescripcion === 'undefined') draft.prescripcion = false;
    if (typeof draft.notes === 'undefined') draft.notes = '';

    // Modalidad segmented
    const seg = document.getElementById('seg-modalidad');
    if (seg) {
      seg.querySelectorAll('[data-modalidad]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const v = btn.getAttribute('data-modalidad');
          if (v === draft.modalidad) return;
          draft.modalidad = v;
          updateSeg(v);
          autosave(id, draft);
        });
      });
    }

    bindInput('inf-fecha',       'input',  function (e) { draft.fecha = e.target.value; autosave(id, draft); });
    bindInput('inf-comercial',   'change', function (e) { draft.comercial = e.target.value; autosave(id, draft); });
    bindInput('inf-prescripcion','change', function (e) { draft.prescripcion = e.target.checked; autosave(id, draft); });
    bindInput('inf-notas',       'input',  function (e) {
      draft.notes = e.target.value;
      const cc = document.getElementById('char-count');
      if (cc) cc.textContent = '≈ ' + draft.notes.length + ' caracteres';
      autosaveDebounced(id, draft);
    });

    const btnBor = document.getElementById('btn-borrador');
    if (btnBor) btnBor.addEventListener('click', function () {
      autosave(id, draft);
      const ind = document.getElementById('autosave-indicator');
      if (ind) {
        ind.innerHTML = '<span style="width:6px; height:6px; border-radius:50%; background:#14704a;"></span> Borrador guardado · hace 0 s';
        ind.style.color = '#14704a';
      }
    });

    const btnGen = document.getElementById('btn-generar');
    if (btnGen) btnGen.addEventListener('click', function () { generarInforme(id, draft); });
  }

  /* ============================================================
     GENERACIÓN INFORME IA (vía endpoint GAS)
     ============================================================ */
  async function generarInforme(id, draft) {
    if (!draft.notes || draft.notes.length < 20) {
      alert('Escribe primero unas notas (mínimo 20 caracteres) para que la IA pueda estructurar el informe.');
      return;
    }
    autosave(id, draft);

    if (!window.Data || !window.Data.generateReport) {
      alert('Capa de datos no disponible. Revisa la conexión.');
      return;
    }

    // Mostrar estado loading sobre la vista
    if (window.States && window.States.showLoading) {
      window.States.showLoading('view-informe', {
        title: 'Generando informe con IA',
        sub: 'Enviando notas al servidor… puede tardar 10-30 s',
      });
    }

    try {
      const payload = {
        modalidad: draft.modalidad || 'real',
        fecha: draft.fecha,
        comercial: draft.comercial,
        prescripcion: !!draft.prescripcion,
        notes: draft.notes,
      };
      const res = await window.Data.generateReport(id, payload);

      // Éxito: limpiar borrador local y mostrar éxito
      if (res && (res.success || res.ok || res.url || res.fileUrl)) {
        clearDraft(id);
        if (window.States && window.States.showSuccess) {
          window.States.showSuccess('view-informe', {
            title: 'Informe enviado',
            body: getName(id) + ' registrado. Has subido a <strong style="color:var(--fg-1)">visitas+1</strong> este año.',
            stats: [
              { label: 'Caracteres enviados', value: String(draft.notes.length) },
              { label: 'Modalidad',           value: draft.modalidad },
            ],
            ctas: [
              { label: 'Ver ficha', onclick: 'showView(\'detail\', { studioId: \'' + escapeJs(id) + '\' })' },
              { label: 'Hoy',       onclick: 'showView(\'inicio\')' },
            ],
          });
        }
      } else {
        // Respuesta inesperada del GAS
        throw new Error((res && (res.error || res.message)) || 'Respuesta no reconocida del servidor');
      }
    } catch (e) {
      console.error('[redesign/informe] error generando informe:', e);
      if (window.States && window.States.showError) {
        window.States.showError('view-informe', {
          title: 'No se pudo generar el informe',
          body: 'El servidor no respondió correctamente. Tu borrador queda guardado localmente y puedes reintentar.',
          draft: {
            empresa: getName(id),
            meta: (draft.modalidad || 'real') + ' · ' + (draft.fecha || '—') + ' · ' + (draft.notes ? draft.notes.length : 0) + ' caracteres',
            tiempo: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
          },
          detail: (e.message || String(e)).slice(0, 200),
          ctas: [
            { label: 'Reintentar envío', onclick: 'window.Screens.informe.render({ studioId: \'' + escapeJs(id) + '\' }); setTimeout(function(){ document.getElementById(\'btn-generar\') && document.getElementById(\'btn-generar\').click(); }, 200);' },
            { label: 'Seguir editando',  onclick: 'window.Screens.informe.render({ studioId: \'' + escapeJs(id) + '\' })' },
          ],
        });
      }
    }
  }

  function escapeJs(s) { return String(s || '').replace(/'/g, "\\'"); }

  function bindInput(id, evt, handler) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(evt, handler);
  }

  function updateSeg(value) {
    const seg = document.getElementById('seg-modalidad');
    if (!seg) return;
    seg.innerHTML = segBtn('real', 'Visita real', value === 'real') +
                    segBtn('ficticia', 'Ficticia',  value === 'ficticia');
    // Re-bind clicks
    seg.querySelectorAll('[data-modalidad]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const v = btn.getAttribute('data-modalidad');
        // Refresh será al actualizar
        // El listener original ya cubre la lógica vía wireForm — pero
        // como acabamos de reemplazar el innerHTML, los listeners antiguos
        // se perdieron. Mejor: solo cambiamos la apariencia y delegamos
        // al cambio en draft via wireForm que se encargará vía nuevo render.
        // Para Fase C5 lo más simple: re-llamar a render() del studio actual
        // mantiene el draft cargado.
        const cur = (typeof State.currentStudioId === 'string') ? State.currentStudioId : null;
        if (cur) {
          // Guardar draft con la nueva modalidad antes de re-renderizar
          const d = loadDraft(cur);
          d.modalidad = v;
          saveDraft(cur, d);
          render({ studioId: cur });
        }
      });
    });
  }

  let _autosaveTimer = null;
  function autosave(id, draft) {
    saveDraft(id, draft);
    const ind = document.getElementById('autosave-indicator');
    if (ind) {
      ind.innerHTML = '<span style="width:6px; height:6px; border-radius:50%; background:#14704a;"></span> Guardado · hace 0 s';
      ind.style.color = '#14704a';
    }
  }
  function autosaveDebounced(id, draft) {
    clearTimeout(_autosaveTimer);
    _autosaveTimer = setTimeout(function () { autosave(id, draft); }, 400);
  }

  /* ============================================================
     EXPORT
     ============================================================ */
  window.Screens = window.Screens || {};
  window.Screens.informe = { render: render };
})();
