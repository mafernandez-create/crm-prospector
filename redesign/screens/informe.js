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

  // Caché del último informe generado (para la descarga .md)
  var _lastMarkdown = '';

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
    // Proyecto preseleccionado (desde "Nuevo informe de este proyecto")
    if (params && params.projectIdx != null && params.projectIdx !== '') {
      draft.projectIdx = parseInt(params.projectIdx, 10);
      saveDraft(id, draft);
    }
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

  /* ============================================================
     CARGO OPTIONS — lee de CARGOS_POR_TIPO según tipo del studio
     ============================================================ */
  function buildCargoOptions(studioId, selectedCargo) {
    var studioType = 'ING';
    if (State.studiosById && State.studiosById[studioId]) {
      var t = State.studiosById[studioId].type;
      studioType = Array.isArray(t) ? t[0] : (t || 'ING');
    }

    var cargos = window.Data && window.Data.CARGOS_POR_TIPO;
    var block = cargos && cargos[studioType];
    var perfiles = (block && block.perfiles) ? block.perfiles : {};

    // Opciones del tipo actual
    var opts = Object.keys(perfiles).map(function (key) {
      var p = perfiles[key];
      return '<option value="' + escape(key) + '"' + (selectedCargo === key ? ' selected' : '') + '>' +
        escape(p.alias || key) + '</option>';
    });

    // Añadir fallback genérico si no hay matches del tipo
    if (opts.length === 0) {
      opts.push('<option value="">' + escape('— Sin cargo especificado —') + '</option>');
    } else {
      opts.unshift('<option value="">' + escape('— Sin cargo especificado —') + '</option>');
    }
    return opts.join('');
  }

  function formBody(id, empresa, draft) {
    const modalidad = draft.modalidad || 'real';
    const fecha = draft.fecha || new Date().toISOString().slice(0, 10);
    const comercial = draft.comercial || 'manuel';
    const prescripcion = !!draft.prescripcion;
    const notas = draft.notes || '';
    const cargo = draft.cargoInterlocutor || '';
    const tipoVisita = draft.tipoVisita || 'seguimiento';
    // v: informe por proyecto (opcional) — solo proyectos del propio estudio
    const _studioObj = (window.State && window.State.studiosById && window.State.studiosById[id]) || {};
    const _projs = (_studioObj.data && _studioObj.data.projects) || [];
    const projIdx = (draft.projectIdx === 0 || draft.projectIdx) ? String(draft.projectIdx) : '';
    const nuevoEstado = draft.nuevoEstadoProyecto || '';
    const PROY_ESTADOS = { en_preparacion: 'En preparación', convocado: 'Convocado', adjudicado: 'Adjudicado', en_ejecucion: 'En ejecución', ejecutado: 'Ejecutado' };

    const TIPOS_VISITA = [
      { id: 'primera-frio',          label: 'Primera visita en frío' },
      { id: 'primera-con-cita',      label: 'Primera visita con cita' },
      { id: 'seguimiento',           label: 'Seguimiento' },
      { id: 'presentacion-producto', label: 'Presentación de producto' },
      { id: 'visita-tecnica-proyecto', label: 'Visita técnica de proyecto' },
      { id: 'post-licitacion',       label: 'Post-licitación' },
    ];

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

      // Tipo de visita
      '<label class="field-label" for="inf-tipo-visita">Tipo de visita</label>' +
      '<select id="inf-tipo-visita" class="field" style="margin-bottom:20px;">' +
        TIPOS_VISITA.map(function (t) {
          return '<option value="' + escape(t.id) + '"' + (tipoVisita === t.id ? ' selected' : '') + '>' + escape(t.label) + '</option>';
        }).join('') +
      '</select>' +

      // Cargo del interlocutor
      '<label class="field-label" for="inf-cargo">Cargo del interlocutor</label>' +
      '<select id="inf-cargo" class="field" style="margin-bottom:20px;">' +
        buildCargoOptions(id, cargo) +
      '</select>' +

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

      // Proyecto (opcional) — solo si el estudio tiene proyectos
      (_projs.length ? (
        '<label class="field-label" for="inf-proyecto">Proyecto (opcional)</label>' +
        '<select id="inf-proyecto" class="field" style="margin-bottom:20px;">' +
          '<option value="">Visita general (sin proyecto)</option>' +
          _projs.map(function (p, i) {
            return '<option value="' + i + '"' + (projIdx === String(i) ? ' selected' : '') + '>' +
              escape(p.nombre || p.name || ('Proyecto ' + (i + 1))) + '</option>';
          }).join('') +
        '</select>' +
        '<div id="inf-proy-estado-wrap" style="' + (projIdx === '' ? 'display:none; ' : '') + 'margin-bottom:20px;">' +
          '<label class="field-label" for="inf-proy-estado">Estado del proyecto tras esta visita</label>' +
          '<select id="inf-proy-estado" class="field">' +
            '<option value="">— sin cambiar —</option>' +
            Object.keys(PROY_ESTADOS).map(function (k) {
              return '<option value="' + k + '"' + (nuevoEstado === k ? ' selected' : '') + '>' + escape(PROY_ESTADOS[k]) + '</option>';
            }).join('') +
          '</select>' +
        '</div>'
      ) : '') +

      // Notas textarea
      '<label class="field-label" for="inf-notas">Notas o transcripción de la visita</label>' +
      '<textarea id="inf-notas" class="field" style="min-height:200px;" ' +
        'placeholder="Escribe libremente lo que recuerdes: con quién hablaste, qué mostraste, sus reacciones, compromisos, proyectos mencionados, próximos pasos…\n\nSi tienes transcripción del audio (con marcas de tiempo), pégala aquí para un análisis más detallado.">' +
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
    if (!draft.tipoVisita) draft.tipoVisita = 'seguimiento';
    if (typeof draft.cargoInterlocutor === 'undefined') draft.cargoInterlocutor = '';
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

    bindInput('inf-fecha',        'input',  function (e) { draft.fecha = e.target.value; autosave(id, draft); });
    bindInput('inf-tipo-visita',  'change', function (e) { draft.tipoVisita = e.target.value; autosave(id, draft); });
    bindInput('inf-cargo',        'change', function (e) { draft.cargoInterlocutor = e.target.value; autosave(id, draft); });
    bindInput('inf-comercial',    'change', function (e) { draft.comercial = e.target.value; autosave(id, draft); });
    bindInput('inf-prescripcion', 'change', function (e) { draft.prescripcion = e.target.checked; autosave(id, draft); });
    bindInput('inf-proyecto', 'change', function (e) {
      draft.projectIdx = e.target.value === '' ? null : parseInt(e.target.value, 10);
      var w = document.getElementById('inf-proy-estado-wrap');
      if (w) w.style.display = e.target.value === '' ? 'none' : '';
      if (e.target.value === '') draft.nuevoEstadoProyecto = null;
      autosave(id, draft);
    });
    bindInput('inf-proy-estado', 'change', function (e) { draft.nuevoEstadoProyecto = e.target.value || null; autosave(id, draft); });
    bindInput('inf-notas', 'input', function (e) {
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
     GENERACIÓN INFORME IA (vía GAS proxy → Claude)
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

    // Estado loading — helper compartido de states.js (convención del proyecto)
    if (window.States && window.States.showLoading) {
      window.States.showLoading('view-informe', {
        title: 'Analizando visita con IA',
        sub: 'Aplicando metodología SPIN… puede tardar 20–40 s',
      });
    }

    try {
      // Enlace a proyecto (opcional): asegura id estable + actualiza estado, y
      // recupera nombre/id para guardarlos en el informe.
      let _projectId = null, _projectNombre = null;
      if (draft.projectIdx != null && draft.projectIdx !== '' && window.Data.updateProjectFromReport) {
        try {
          const pr = await window.Data.updateProjectFromReport(id, draft.projectIdx, { nuevoEstado: draft.nuevoEstadoProyecto || null });
          if (pr) { _projectId = pr.projectId; _projectNombre = pr.projectNombre; }
        } catch (e) { console.warn('[informe] enlace proyecto falló:', e && e.message); }
      }
      const payload = {
        modalidad:          draft.modalidad || 'real',
        fecha:              draft.fecha,
        comercial:          draft.comercial,
        prescripcion:       !!draft.prescripcion,
        notes:              draft.notes,
        cargoInterlocutor:  draft.cargoInterlocutor || '',
        tipoVisita:         draft.tipoVisita || 'seguimiento',
        projectId:          _projectId,
        projectNombre:      _projectNombre,
      };
      const res = await window.Data.generateReport(id, payload);

      if (res && res.success && res.markdown) {
        clearDraft(id);
        _showInformeResultado(id, res.markdown, draft.fecha || new Date().toISOString().slice(0, 10));
      } else {
        throw new Error((res && (res.error || res.message)) || 'Respuesta no reconocida del servidor');
      }
    } catch (e) {
      console.error('[redesign/informe] error generando informe:', e);
      // El borrador ya está autoguardado (autosave al inicio) → queda a salvo.
      if (window.States && window.States.showError) {
        window.States.showError('view-informe', {
          title: 'No se pudo generar el informe',
          body: 'El servidor no respondió. Tu borrador queda guardado localmente.',
          detail: (e.message || String(e)).slice(0, 300),
          ctas: [
            { label: 'Seguir editando',
              onclick: "window.Screens && window.Screens.informe && window.Screens.informe.render({ studioId: '" + escapeJs(id) + "' })" },
          ],
        });
      }
    }
  }

  /* ============================================================
     MINI-PARSER MARKDOWN → HTML (soporta tablas, además de lo básico)
     ============================================================ */
  function _md2html(src) {
    if (!src) return '';
    var lines = String(src).split('\n');
    var out = [];
    var inList = false, listOrdered = false;
    var inCode = false, codeLang = '', codeLines = [];
    function closeList() {
      if (inList) { out.push(listOrdered ? '</ol>' : '</ul>'); inList = false; }
    }
    function closeCode() {
      if (inCode) {
        out.push('<pre style="background:var(--ink-50); padding:14px 16px; border-radius:8px; ' +
          'overflow-x:auto; font-size:13px; line-height:1.5; margin:12px 0;"><code>' +
          escape(codeLines.join('\n')) + '</code></pre>');
        inCode = false; codeLang = ''; codeLines = [];
      }
    }
    // H3: solo esquemas seguros en href (bloquea javascript:, data:, vbscript:…)
    function safeHref(url) {
      var u = String(url || '').trim();
      if (/^(https?:\/\/|mailto:|tel:|#|\/)/i.test(u)) return u;   // seguro / ancla / relativo
      if (/^[a-z][a-z0-9+.\-]*:/i.test(u)) return '#';             // otro esquema → neutralizar
      return u;                                                    // relativo sin esquema
    }
    function inline(s) {
      s = escape(s);   // H2: neutraliza HTML crudo antes de aplicar markdown
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      s = s.replace(/(^|[\s(])_([^_]+)_([\s.,;:!?)]|$)/g, '$1<em>$2</em>$3');
      s = s.replace(/`([^`]+)`/g, '<code style="background:rgba(10,45,82,.06); padding:0.1em 0.35em; border-radius:3px; font-size:0.9em;">$1</code>');
      // url ya escapada por escape(s); safeHref solo valida el esquema
      s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (m, text, url) {
        return '<a href="' + safeHref(url) + '" target="_blank" rel="noopener">' + text + '</a>';
      });
      return s;
    }
    // Detect table block (consecutive lines starting with |)
    function isTableSep(l) { return /^\|?[\s\-:]+(\|[\s\-:]+)+\|?$/.test(l.trim()); }
    var i = 0;
    while (i < lines.length) {
      var raw = lines[i];
      var line = raw.replace(/\s+$/, '');

      // Code fence
      if (/^```/.test(line)) {
        if (!inCode) {
          closeList(); closeCode();
          inCode = true; codeLang = line.slice(3).trim(); codeLines = [];
        } else {
          closeCode();
        }
        i++; continue;
      }
      if (inCode) { codeLines.push(raw); i++; continue; }

      // Table detection: current line has |, next line is separator
      if (/^\|/.test(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        closeList();
        var headers = line.split('|').filter(function (c, idx, arr) { return idx > 0 && idx < arr.length - 1 || (idx === 0 && c.trim()); }).map(function (c) { return c.trim(); });
        // remove leading/trailing empty from split
        var headerCells = line.trim().replace(/^\||\|$/g, '').split('|');
        i += 2; // skip header + separator
        var rows = [];
        while (i < lines.length && /^\|/.test(lines[i].trim())) {
          rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map(function (c) { return c.trim(); }));
          i++;
        }
        var tbl = '<div style="overflow-x:auto; margin:12px 0;">' +
          '<table style="width:100%; border-collapse:collapse; font-size:14px;">' +
          '<thead><tr>' +
          headerCells.map(function (c) {
            return '<th style="text-align:left; padding:8px 12px; border-bottom:2px solid var(--line); ' +
              'font-weight:600; color:var(--fg-1); background:var(--paper-warm);">' + inline(c.trim()) + '</th>';
          }).join('') +
          '</tr></thead><tbody>' +
          rows.map(function (row) {
            return '<tr>' + row.map(function (c) {
              return '<td style="padding:7px 12px; border-bottom:1px solid var(--line); color:var(--fg-2);">' + inline(c) + '</td>';
            }).join('') + '</tr>';
          }).join('') +
          '</tbody></table></div>';
        out.push(tbl);
        continue;
      }

      if (/^####\s+/.test(line)) { closeList(); out.push('<h5 style="font-size:13px; font-weight:700; color:var(--fg-2); margin:14px 0 4px; text-transform:uppercase; letter-spacing:.06em;">' + inline(line.replace(/^####\s+/, '')) + '</h5>'); i++; continue; }
      if (/^###\s+/.test(line))  { closeList(); out.push('<h4 style="font-family:var(--font-display); font-size:15px; font-weight:600; color:var(--gpf-blue-700); margin:20px 0 6px;">' + inline(line.replace(/^###\s+/, '')) + '</h4>'); i++; continue; }
      if (/^##\s+/.test(line))   { closeList(); out.push('<h3 style="font-family:var(--font-display); font-size:16px; letter-spacing:0.08em; text-transform:uppercase; color:var(--gpf-blue-900); margin:28px 0 10px; font-weight:700; border-bottom:1px solid var(--line); padding-bottom:4px;">' + inline(line.replace(/^##\s+/, '')) + '</h3>'); i++; continue; }
      if (/^#\s+/.test(line))    { closeList(); out.push('<h2 style="font-family:var(--font-display); font-size:22px; font-weight:700; color:var(--fg-1); margin:0 0 18px;">' + inline(line.replace(/^#\s+/, '')) + '</h2>'); i++; continue; }
      if (/^---+\s*$/.test(line)) { closeList(); out.push('<hr style="border:0; border-top:1px solid var(--line); margin:20px 0;">'); i++; continue; }
      if (/^>\s?/.test(line)) {
        closeList();
        out.push('<blockquote style="border-left:3px solid var(--gpf-blue-700); padding:6px 14px; margin:10px 0; background:rgba(10,45,82,.04); color:var(--fg-2); font-style:italic;">' + inline(line.replace(/^>\s?/, '')) + '</blockquote>');
        i++; continue;
      }
      var mUl = line.match(/^[\-\*]\s+(.*)$/);
      var mOl = line.match(/^(\d+)\.\s+(.*)$/);
      if (mUl) {
        if (!inList || listOrdered) { closeList(); out.push('<ul style="margin:6px 0 12px 22px; padding:0;">'); inList = true; listOrdered = false; }
        out.push('<li style="margin:4px 0; line-height:1.55;">' + inline(mUl[1]) + '</li>');
        i++; continue;
      }
      if (mOl) {
        if (!inList || !listOrdered) { closeList(); out.push('<ol style="margin:6px 0 12px 22px; padding:0;">'); inList = true; listOrdered = true; }
        out.push('<li style="margin:4px 0; line-height:1.55;">' + inline(mOl[2]) + '</li>');
        i++; continue;
      }
      if (line.trim() === '') { closeList(); i++; continue; }
      closeList();
      out.push('<p style="margin:0 0 10px; line-height:1.6;">' + inline(line) + '</p>');
      i++;
    }
    closeList(); closeCode();
    return out.join('\n');
  }

  /* ============================================================
     RESULTADO — renderiza el markdown del informe v2
     ============================================================ */
  function _showInformeResultado(id, markdown, fecha) {
    const empresa = getName(id);
    const v = document.getElementById('view-informe');
    if (!v) return;

    _lastMarkdown = markdown; // cachear para descarga
    var html = _md2html(markdown);

    v.innerHTML =
      // Barra superior con botones
      '<div style="position:sticky; top:0; z-index:10; background:var(--bg-app); ' +
        'border-bottom:1px solid var(--line); padding:12px 20px; ' +
        'display:flex; align-items:center; justify-content:space-between; gap:12px;">' +
        '<button class="btn btn-ghost" style="flex:0 0 auto;" ' +
          'onclick="window.Screens && window.Screens.informe && window.Screens.informe.render({ studioId: \'' + escapeJs(id) + '\' })">' +
          '← Editar notas' +
        '</button>' +
        '<div style="font-weight:600; font-size:15px; color:var(--fg-1); text-align:center; flex:1; ' +
          'overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' +
          escape(empresa) + ' · ' + escape(fecha) +
        '</div>' +
        '<div style="display:flex; gap:8px; flex:0 0 auto;">' +
          '<button class="btn btn-ghost" title="Descargar .md" ' +
            'onclick="window.Screens.informe._descargarMd(\'' + escapeJs(id) + '\', \'' + escapeJs(empresa) + '\', \'' + escapeJs(fecha) + '\')">' +
            '⬇ .md' +
          '</button>' +
          '<button class="btn btn-ghost" title="Imprimir" onclick="window.print()">' +
            '🖨' +
          '</button>' +
          '<button class="btn btn-primary" ' +
            'onclick="showView(\'detail\', { studioId: \'' + escapeJs(id) + '\' })">' +
            'Ver ficha' +
          '</button>' +
        '</div>' +
      '</div>' +
      // Contenido markdown
      '<div class="briefing-content" style="max-width:800px; margin:0 auto; padding:32px 24px 80px;">' +
        html +
      '</div>';
  }

  /* descarga el markdown como archivo .md */
  function _descargarMd(id, empresa, fecha) {
    var md = _lastMarkdown;
    // fallback: busca en State si la caché está vacía
    if (!md) {
      var studio = State.studiosById && State.studiosById[id];
      if (studio && studio.data && studio.data.reports) {
        var reps = studio.data.reports.slice().sort(function (a, b) {
          return (b.generated_at || b.date || '') > (a.generated_at || a.date || '') ? 1 : -1;
        });
        if (reps[0] && reps[0].markdown) md = reps[0].markdown;
      }
    }
    if (!md) {
      alert('No hay markdown guardado. Genera el informe primero.');
      return;
    }
    var blob = new Blob([md], { type: 'text/markdown' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = String(empresa || id).replace(/[^a-zA-Z0-9_À-ɏ-]/g, '_') +
      '_' + String(fecha || '').replace(/[^0-9-]/g, '') + '_informe.md';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // L4: dato embebido en una cadena JS de un atributo onclick="" (doble contexto:
  // string JS de comilla simple + atributo HTML de comilla doble). Neutraliza
  // backslash, comilla simple (JS), comilla doble (cierre de atributo), '<'
  // (cierre de <script>) y saltos de línea.
  function escapeJs(s) {
    return String(s == null ? '' : s)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '&quot;')
      .replace(/</g, '\\x3C')
      .replace(/\r?\n/g, ' ');
  }

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
  window.Screens.informe = {
    render: render,
    _descargarMd: _descargarMd,
  };
})();
