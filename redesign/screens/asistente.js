/* CRM Prospector · rediseño v1 — Asistente IA
 *
 * Pantalla de chat con IA integrada en el CRM.
 * Capacidades:
 *  - Consultar cartera en lenguaje natural ("clientes en Cádiz con score ≥7")
 *  - Sugerir ruta optimizada para una zona + origen/destino
 *  - Mostrar resumen de acciones pendientes detectadas en informes
 *  - Añadir studios sugeridos directamente al planificador
 *
 * Usa Data.callGAS('claudeProxy', {...}) como backend de IA.
 * No requiere ninguna dependencia extra más allá de Data + State.
 */
(function () {
  'use strict';

  var State = window.State;
  var U     = window.Util;
  var I     = window.Icon;
  var esc   = U.escapeHtml;

  /* ============================================================
     HISTORIAL DE MENSAJES — persiste en sessionStorage
     ============================================================ */
  var _HIST_KEY = 'crm_asistente_historial_v1';

  function _getHist() {
    try { return JSON.parse(sessionStorage.getItem(_HIST_KEY) || '[]'); } catch (e) { return []; }
  }
  function _saveHist(h) {
    try { sessionStorage.setItem(_HIST_KEY, JSON.stringify(h.slice(-40))); } catch (e) {}
  }
  function _addMsg(role, text, extras) {
    var h = _getHist();
    h.push(Object.assign({ role: role, text: text, ts: new Date().toISOString() }, extras || {}));
    _saveHist(h);
    return h;
  }
  function _clearHist() {
    try { sessionStorage.removeItem(_HIST_KEY); } catch (e) {}
  }

  /* ============================================================
     CHIPS DE ACCESO RÁPIDO
     ============================================================ */
  var CHIPS = [
    { label: '🗺️ Ruta Cádiz esta semana',   text: 'Tengo que visitar la zona de Cádiz la próxima semana. Propónme clientes a visitar, con la ruta optimizada sabiendo que el lunes salgo desde Málaga y duermo en Sevilla.' },
    { label: '📋 Acciones pendientes',       text: '¿Qué acciones tengo pendientes detectadas en mis informes de visita?' },
    { label: '🔥 Clientes calientes',        text: '¿Qué clientes tienen score ≥8 y no he visitado todavía? Dame los 10 más importantes.' },
    { label: '❄️ Cuentas enfriadas',         text: '¿Qué cuentas con alto potencial llevan más de 45 días sin contacto?' },
    { label: '📊 Resumen cartera',           text: 'Dame un resumen rápido de mi cartera: total de clientes, distribución por tipo, los que están más activos y los que necesitan atención urgente.' },
  ];

  /* ============================================================
     CONTEXTO — resume la cartera para el prompt del sistema
     ============================================================ */
  function _buildContext() {
    var studios = State.studios || [];
    var hoy = new Date().toISOString().slice(0, 10);

    // Top 120 por score (suficiente para el contexto sin exceder tokens)
    var sorted = studios.slice().sort(function (a, b) { return (b.score || 0) - (a.score || 0); });
    var top = sorted.slice(0, 120);

    var lines = top.map(function (s) {
      var prov = s.province; if (prov && typeof prov === 'object') prov = prov.valor || '';
      var city = s.city;     if (city && typeof city === 'object') city = city.valor || '';
      var last = U.lastInteraction(s) || '';
      var dias = last ? U.diasDesde(last) : null;
      var lastStr = dias !== null ? ('último contacto: ' + dias + ' días') : 'sin contacto registrado';
      return '[' + s.id + '] ' + (s.name || '?') + ' · ' + (s.type || '?') + ' · ' + (city || '?') + ' (' + (prov || '?') + ')' +
        ' · score=' + (s.score || 0) + ' · estado=' + (s.status || '?') + ' · ' + lastStr;
    });

    // Acciones pendientes en caché
    var accionesCtx = '';
    try {
      var rawAcc = localStorage.getItem('crm_acciones_pendientes_v1');
      if (rawAcc) {
        var parsed = JSON.parse(rawAcc);
        if (parsed && parsed.items && parsed.items.length > 0) {
          var acc = parsed.items.slice(0, 30);
          accionesCtx = '\n\n=== ACCIONES PENDIENTES DETECTADAS EN INFORMES (' + acc.length + ') ===\n' +
            acc.map(function (a) {
              return a.tipoIcon + ' ' + a.tipo.toUpperCase() + ' · ' + a.studioName +
                ' (' + a.studioProvince + ')' +
                (a.fechaLimite ? ' · plazo: ' + a.fechaLimite : '') +
                '\n   "' + a.descripcion.slice(0, 120) + '"';
            }).join('\n');
        }
      }
    } catch (e) {}

    // Planificador próximos 14 días
    var planCtx = '';
    var plan = State.planificador && State.planificador.schedule;
    if (plan) {
      var upcoming = [];
      for (var i = 0; i < 14; i++) {
        var d = new Date(); d.setDate(d.getDate() + i);
        var iso = d.toISOString().slice(0, 10);
        var visitas = plan[iso];
        if (visitas && visitas.length > 0) {
          upcoming.push(iso + ': ' + visitas.map(function (v) { return v.name + ' (' + (v.province || '') + ')'; }).join(', '));
        }
      }
      if (upcoming.length > 0) planCtx = '\n\n=== PLANIFICADOR PRÓXIMOS 14 DÍAS ===\n' + upcoming.join('\n');
    }

    return (
      '=== CARTERA DE CLIENTES (' + studios.length + ' total, mostrando top ' + top.length + ' por score) ===\n' +
      lines.join('\n') +
      accionesCtx +
      planCtx
    );
  }

  function _buildSystemPrompt() {
    return (
      'Eres el asistente de ventas IA de Manuel Fernández, comercial de Ferroplast (Grupo GPF).\n' +
      'Ferroplast vende tubos, accesorios de polietileno, PVC, fundición y sistemas de presión para ' +
      'estudios de arquitectura, ingenierías, comunidades de regantes, ciclo del agua (EDAR, ETAP), ' +
      'promotoras y administraciones públicas en el sur de España (Andalucía, Murcia, Extremadura).\n' +
      'Manuel trabaja desde Málaga. Sus productos estrella son los sistemas GPF de tubería y accesorios.\n\n' +
      'INSTRUCCIONES:\n' +
      '- Responde SIEMPRE en español.\n' +
      '- Cuando sugieras clientes a visitar, incluye: nombre, ciudad, tipo de empresa, score y días sin contacto.\n' +
      '- Cuando optimices rutas, ordena las ciudades geográficamente para minimizar distancias de conducción. ' +
        'Conoces bien la geografía de España, especialmente Andalucía.\n' +
      '- Para rutas: indica el trayecto secuencial (origen → ciudad1 → ciudad2 → … → destino final).\n' +
      '- Si el usuario quiere añadir empresas al planificador, incluye en tu respuesta una lista de JSON como esta:\n' +
        '  [[PLANIFICADOR:{"ids":["3001","3002"],"fecha":"2026-06-02"}]]\n' +
        '  con los IDs de la cartera y la fecha ISO sugerida.\n' +
      '- Sé conciso y práctico. Evita preambles largos.\n\n' +
      'DATOS ACTUALIZADOS A ' + new Date().toISOString().slice(0, 10) + ':\n\n' +
      _buildContext()
    );
  }

  /* ============================================================
     LLAMADA A LA IA
     ============================================================ */
  var _calling = false;

  async function _callAI(userText) {
    if (_calling) return;
    _calling = true;
    var hist = _addMsg('user', userText);
    _renderMessages();
    _showTyping(true);

    // Construir mensajes para Claude (últimos 8 turnos para no exceder tokens)
    var recent = hist.slice(-8);
    var messages = recent.map(function (m) {
      return { role: m.role === 'user' ? 'user' : 'assistant', content: m.text };
    });

    try {
      var Data = window.Data;
      if (!Data || !Data.callGAS) throw new Error('Data.callGAS no disponible');

      var res = await Data.callGAS('claudeProxy', {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: _buildSystemPrompt(),
        messages: messages,
      });

      var text = '';
      if (res && res.content && res.content[0]) {
        text = res.content[0].text || res.content[0].value || '';
      } else if (res && res.text) {
        text = res.text;
      } else if (res && res.error) {
        throw new Error(typeof res.error === 'string' ? res.error : (res.error.message || 'Error IA'));
      }
      if (!text) throw new Error('Respuesta vacía de la IA');

      // Extraer comandos de planificador si los hay
      var planCmd = _extractPlanCmd(text);
      _addMsg('assistant', text, planCmd ? { planCmd: planCmd } : {});
    } catch (e) {
      _addMsg('assistant', '⚠️ Error al contactar con la IA: ' + e.message, { error: true });
    } finally {
      _calling = false;
      _showTyping(false);
      _renderMessages();
    }
  }

  /* Extrae el comando [[PLANIFICADOR:{...}]] de la respuesta de la IA */
  function _extractPlanCmd(text) {
    var m = text.match(/\[\[PLANIFICADOR:(\{[^}]+\})\]\]/);
    if (!m) return null;
    try { return JSON.parse(m[1]); } catch (e) { return null; }
  }

  /* Añade studios al planificador en la fecha sugerida */
  async function _addToPlanificador(cmd) {
    if (!cmd || !cmd.ids || !cmd.fecha) return;
    var plan = (State.planificador && State.planificador.schedule) ? State.planificador.schedule : {};
    if (!plan[cmd.fecha]) plan[cmd.fecha] = [];
    var added = 0;
    cmd.ids.forEach(function (id) {
      var s = State.studiosById && State.studiosById[id];
      if (!s) return;
      var already = plan[cmd.fecha].some(function (v) { return String(v.id) === String(id); });
      if (already) return;
      var prov = s.province; if (prov && typeof prov === 'object') prov = prov.valor || '';
      var city = s.city;     if (city && typeof city === 'object') city = city.valor || '';
      plan[cmd.fecha].push({ id: String(id), name: s.name || id, city: city || '', province: prov || '', data: { hora: '', notas: '' } });
      added++;
    });
    if (added === 0) { window.showNotification && window.showNotification('Ya estaban todos en el planificador', 'info'); return; }
    if (State.planificador) State.planificador.schedule = plan;
    else State.planificador = { schedule: plan };
    try {
      await window.Data.savePlanificador(plan);
      window.showNotification && window.showNotification('✅ ' + added + ' empresa' + (added > 1 ? 's añadidas' : ' añadida') + ' al planificador · ' + cmd.fecha, 'success');
    } catch (e) {
      window.showNotification && window.showNotification('⚠️ Error guardando planificador: ' + e.message, 'error');
    }
  }

  /* ============================================================
     RENDER
     ============================================================ */
  function render() {
    var v = document.getElementById('view-asistente');
    if (!v) return;
    document.getElementById('topbar-current').textContent = 'Asistente IA';
    v.innerHTML = _buildLayout();
    _bindInput();
    _renderMessages();
  }

  function _buildLayout() {
    return (
      '<div style="max-width:860px; margin:0 auto; height:calc(100vh - 64px); display:flex; flex-direction:column; padding:0 0 0 0;">' +
        // Header
        '<div style="padding:20px 20px 12px; flex:0 0 auto;">' +
          '<div class="eyebrow">Ferroplast · CRM Prospector</div>' +
          '<h1 style="font-family:var(--font-display); font-weight:600; font-size:28px; text-transform:uppercase; letter-spacing:.005em; margin:4px 0 2px;">Asistente IA</h1>' +
          '<p style="font-size:13px; color:var(--fg-3); margin:0 0 12px;">Consulta tu cartera, planifica rutas y detecta acciones pendientes con lenguaje natural.</p>' +
          // Chips
          '<div style="display:flex; flex-wrap:wrap; gap:8px;" id="asistente-chips">' +
            CHIPS.map(function (c, idx) {
              return '<button class="btn btn-ghost" style="font-size:12px; padding:6px 12px; border-radius:20px;" ' +
                'onclick="window.Screens.asistente._chip(' + idx + ')">' + esc(c.label) + '</button>';
            }).join('') +
            '<button class="btn btn-ghost" style="font-size:12px; padding:6px 12px; border-radius:20px; color:var(--fg-3);" ' +
              'onclick="window.Screens.asistente._clear()">🗑 Limpiar chat</button>' +
          '</div>' +
        '</div>' +
        // Mensajes
        '<div id="asistente-messages" style="flex:1 1 0; overflow-y:auto; padding:0 20px 8px;">' +
        '</div>' +
        // Typing indicator (oculto por defecto)
        '<div id="asistente-typing" style="display:none; padding:0 20px 4px;">' +
          '<span style="font-size:13px; color:var(--fg-3);">✨ Pensando…</span>' +
        '</div>' +
        // Input
        '<div style="flex:0 0 auto; padding:12px 20px 16px; border-top:1px solid var(--line);">' +
          '<form id="asistente-form" style="display:flex; gap:8px;" onsubmit="return false;">' +
            '<input id="asistente-input" type="text" autocomplete="off" ' +
              'placeholder="Escribe una consulta, ej: «visita Jaén esta semana»…" ' +
              'style="flex:1; padding:10px 14px; border:1.5px solid var(--line); border-radius:10px; ' +
                'font-size:14px; background:var(--bg-card); color:var(--fg-1); outline:none;"/>' +
            '<button type="submit" class="btn btn-primary" style="padding:10px 18px;" ' +
              'onclick="window.Screens.asistente._send()">' + I.ArrowRight() + '</button>' +
          '</form>' +
        '</div>' +
      '</div>'
    );
  }

  function _renderMessages() {
    var el = document.getElementById('asistente-messages');
    if (!el) return;
    var hist = _getHist();
    if (hist.length === 0) {
      el.innerHTML = (
        '<div style="text-align:center; padding:40px 20px; color:var(--fg-3);">' +
          '<div style="font-size:40px; margin-bottom:12px;">🤖</div>' +
          '<div style="font-size:14px; font-weight:600; color:var(--fg-2); margin-bottom:6px;">Asistente listo</div>' +
          '<div style="font-size:13px;">Usa los chips de arriba o escribe tu consulta.<br>Puedo sugerirte clientes, optimizar rutas y recordarte compromisos.</div>' +
        '</div>'
      );
      return;
    }
    el.innerHTML = hist.map(function (m) {
      return m.role === 'user' ? _bubbleUser(m) : _bubbleAI(m);
    }).join('');
    el.scrollTop = el.scrollHeight;
  }

  function _bubbleUser(m) {
    return (
      '<div style="display:flex; justify-content:flex-end; margin:8px 0;">' +
        '<div style="max-width:75%; background:var(--gpf-blue-700); color:#fff; border-radius:12px 12px 2px 12px; ' +
          'padding:10px 14px; font-size:14px; line-height:1.5; white-space:pre-wrap;">' +
          esc(m.text) +
        '</div>' +
      '</div>'
    );
  }

  function _bubbleAI(m) {
    // Convierte el texto IA en HTML básico (negrita, listas, líneas)
    var html = _mdToHtml(m.text);
    // Botón planificador si tiene comando
    var planBtn = '';
    if (m.planCmd && m.planCmd.ids && m.planCmd.ids.length > 0) {
      planBtn = (
        '<div style="margin-top:10px; padding-top:10px; border-top:1px solid var(--line);">' +
          '<button class="btn btn-primary" style="font-size:13px;" ' +
            'onclick="window.Screens.asistente._addPlan(' + JSON.stringify(m.planCmd).replace(/"/g, '&quot;') + ')">' +
            '📅 Añadir ' + m.planCmd.ids.length + ' empresa' + (m.planCmd.ids.length > 1 ? 's' : '') + ' al planificador · ' + (m.planCmd.fecha || '') +
          '</button>' +
        '</div>'
      );
    }
    return (
      '<div style="display:flex; justify-content:flex-start; margin:8px 0; gap:10px;">' +
        '<div style="flex:0 0 32px; width:32px; height:32px; border-radius:50%; background:var(--gpf-blue-100); ' +
          'display:flex; align-items:center; justify-content:center; font-size:16px;">🤖</div>' +
        '<div style="max-width:80%; background:var(--bg-card); border:1px solid var(--line); ' +
          'border-radius:2px 12px 12px 12px; padding:12px 14px; font-size:14px; line-height:1.6;">' +
          (m.error ? '<span style="color:var(--mute-red-dark);">' + html + '</span>' : html) +
          planBtn +
        '</div>' +
      '</div>'
    );
  }

  /* Conversión mínima de Markdown a HTML (negrita, listas, saltos) */
  function _mdToHtml(text) {
    // Eliminar el comando planificador del texto visible
    text = text.replace(/\[\[PLANIFICADOR:\{[^}]+\}\]\]/g, '').trim();
    // Escapar HTML primero
    var s = esc(text);
    // Negrita **...**
    s = s.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Cursiva *...*
    s = s.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // Líneas de lista (- o • o 1.)
    s = s.replace(/^([-•]\s|[0-9]+\.\s)/gm, '<br>$1');
    // Saltos de línea dobles → párrafo
    s = s.replace(/\n\n/g, '</p><p style="margin:8px 0 0;">');
    // Saltos de línea simples
    s = s.replace(/\n/g, '<br>');
    return '<p style="margin:0;">' + s + '</p>';
  }

  function _showTyping(show) {
    var el = document.getElementById('asistente-typing');
    if (el) el.style.display = show ? 'block' : 'none';
  }

  /* ============================================================
     EVENTOS
     ============================================================ */
  function _bindInput() {
    var form = document.getElementById('asistente-form');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        _sendFromInput();
      });
    }
    var input = document.getElementById('asistente-input');
    if (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _sendFromInput(); }
      });
    }
  }

  function _sendFromInput() {
    var input = document.getElementById('asistente-input');
    if (!input) return;
    var text = input.value.trim();
    if (!text) return;
    input.value = '';
    _callAI(text);
  }

  function _chip(idx) {
    var chip = CHIPS[idx];
    if (!chip) return;
    _callAI(chip.text);
  }

  function _clear() {
    _clearHist();
    _renderMessages();
  }

  /* ============================================================
     REGISTRO
     ============================================================ */
  window.Screens = window.Screens || {};
  window.Screens.asistente = {
    render: render,
    _chip: _chip,
    _send: _sendFromInput,
    _clear: _clear,
    _addPlan: _addToPlanificador,
  };
})();
