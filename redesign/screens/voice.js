/* CRM Prospector · rediseño — Voice FAB (Opción D)
 *
 * Botón flotante de micrófono para registrar notas de voz en campo.
 * Usa la Web Speech API (webkitSpeechRecognition en iOS Safari).
 *
 * Flujo:
 *   1. Tap en el FAB (#voice-fab) → abre bottom sheet
 *   2. Inicia reconocimiento de voz (es-ES)
 *   3. Transcript editable en textarea
 *   4. "Guardar nota" → persiste como actividad en el studio activo
 *
 * Exporta: window.VoiceFab = { open, stopRecognition, saveNote }
 */
(function () {
  'use strict';

  var _recognition = null;
  var _transcript = '';
  var _listening = false;

  /* ============================================================
     APERTURA DEL SHEET
     ============================================================ */
  function open() {
    _transcript = '';
    _listening = false;

    var studioId = window.State && window.State.currentStudioId;
    var studio = studioId && window.State.studiosById && window.State.studiosById[studioId];
    var studioName = studio ? (studio.name || '') : '';

    window.openSheet(buildSheetHTML(studioName, studioId || ''));

    // Solicitar permiso y arrancar con pequeño delay (animación del sheet)
    setTimeout(startRecognition, 350);
  }

  /* ============================================================
     HTML DEL SHEET
     ============================================================ */
  function buildSheetHTML(studioName, studioId) {
    var micIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" style="flex-shrink:0">' +
      '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>' +
      '<path d="M19 10v2a7 7 0 0 1-14 0v-2"/>' +
      '<line x1="12" y1="19" x2="12" y2="22"/>' +
      '<line x1="8" y1="22" x2="16" y2="22"/>' +
    '</svg>';

    return (
      '<div style="padding:20px 20px calc(20px + env(safe-area-inset-bottom, 0px)); display:flex; flex-direction:column; gap:14px;">' +

        /* Header */
        '<div style="display:flex; justify-content:space-between; align-items:flex-start;">' +
          '<div>' +
            '<div style="display:flex; align-items:center; gap:8px; font-size:16px; font-weight:700; color:var(--fg-1);">' +
              micIcon + ' Nota de voz' +
            '</div>' +
            (studioName
              ? '<div style="font-size:13px; color:var(--fg-3); margin-top:4px;">' +
                  escapeHtml(studioName) +
                '</div>'
              : '<div style="font-size:13px; color:var(--fg-3); margin-top:4px;">Sin empresa seleccionada</div>') +
          '</div>' +
          '<button onclick="window.VoiceFab.stopRecognition(); closeSheet();" ' +
            'style="background:none;border:none;cursor:pointer;color:var(--fg-3);font-size:22px;line-height:1;padding:4px;' +
            'touch-action:manipulation;">✕</button>' +
        '</div>' +

        /* Status */
        '<div id="vf-status" style="font-size:13px; font-weight:500; color:var(--gpf-blue-700); ' +
          'display:flex; align-items:center; gap:6px;">' +
          '<span id="vf-dot" style="width:8px;height:8px;border-radius:50%;background:var(--gpf-blue-700);display:inline-block;"></span>' +
          '<span id="vf-status-text">Iniciando…</span>' +
        '</div>' +

        /* Transcript textarea */
        '<textarea id="vf-transcript" rows="5" ' +
          'style="width:100%; padding:12px; border:1px solid var(--line); border-radius:12px; ' +
          'font-size:15px; line-height:1.55; color:var(--fg-1); background:var(--bg-card); ' +
          'box-sizing:border-box; resize:none; font-family:var(--font-body);" ' +
          'placeholder="Habla ahora... el texto aparecerá aquí. Puedes editar antes de guardar.">' +
        '</textarea>' +

        /* Botones */
        '<div style="display:flex; gap:8px;">' +
          '<button id="vf-toggle-btn" ' +
            'onclick="window.VoiceFab.toggleRecognition()" ' +
            'style="flex:1; padding:12px 8px; border:1px solid var(--line); border-radius:10px; ' +
            'background:transparent; color:var(--fg-2); font-size:14px; font-weight:600; cursor:pointer; ' +
            'touch-action:manipulation;">' +
            '⏹ Detener' +
          '</button>' +
          '<button onclick="window.VoiceFab.saveNote(\'' + escapeAttr(studioId) + '\')" ' +
            'style="flex:2; padding:12px 8px; border:none; border-radius:10px; ' +
            'background:var(--gpf-blue-700); color:#fff; font-size:14px; font-weight:600; cursor:pointer; ' +
            'touch-action:manipulation;">' +
            '✓ Guardar nota' +
          '</button>' +
        '</div>' +

      '</div>'
    );
  }

  /* ============================================================
     SPEECH RECOGNITION
     ============================================================ */
  function startRecognition() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      _setStatus('⚠️ Reconocimiento de voz no disponible en este navegador.', 'warning');
      return;
    }

    _recognition = new SR();
    _recognition.lang = 'es-ES';
    _recognition.continuous = false;    // iOS no soporta continuous bien
    _recognition.interimResults = true;
    _transcript = '';
    _listening = true;

    _recognition.onstart = function () {
      _setStatus('🔴 Escuchando…', 'active');
      _updateToggleBtn(true);
    };

    _recognition.onresult = function (e) {
      var interim = '';
      var final = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var t = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          final += t + ' ';
        } else {
          interim += t;
        }
      }
      if (final) _transcript += final;
      var ta = document.getElementById('vf-transcript');
      if (ta) ta.value = _transcript + interim;
    };

    _recognition.onerror = function (e) {
      var msg = {
        'no-speech': 'No se detectó voz. Pulsa 🎤 para reintentar.',
        'audio-capture': 'Sin acceso al micrófono.',
        'not-allowed': 'Permiso de micrófono denegado.',
        'network': 'Sin conexión para reconocimiento de voz.',
      }[e.error] || ('Error: ' + e.error);
      _setStatus('⚠️ ' + msg, 'warning');
      _listening = false;
      _updateToggleBtn(false);
    };

    _recognition.onend = function () {
      _listening = false;
      // Sync final transcript
      var ta = document.getElementById('vf-transcript');
      if (ta && ta.value.trim()) {
        _transcript = ta.value;
        _setStatus('✅ Listo. Edita si quieres y guarda.', 'done');
      } else if (!_transcript) {
        _setStatus('⏹ Detenido. Escribe tu nota o pulsa 🎤 para reintentar.', 'idle');
      } else {
        _setStatus('✅ Listo. Edita si quieres y guarda.', 'done');
      }
      _updateToggleBtn(false);
    };

    try {
      _recognition.start();
    } catch (e) {
      _setStatus('⚠️ Error al iniciar micrófono: ' + e.message, 'warning');
    }
  }

  function stopRecognition() {
    _listening = false;
    if (_recognition) {
      try { _recognition.stop(); } catch (_) {}
      _recognition = null;
    }
    // Sincronizar _transcript con lo que hay en el textarea
    var ta = document.getElementById('vf-transcript');
    if (ta) _transcript = ta.value;
  }

  function toggleRecognition() {
    if (_listening) {
      stopRecognition();
    } else {
      startRecognition();
    }
  }

  /* ============================================================
     GUARDAR NOTA
     ============================================================ */
  async function saveNote(studioId) {
    var ta = document.getElementById('vf-transcript');
    var text = (ta ? ta.value : _transcript).trim();

    if (!text) {
      window.showNotification && window.showNotification('⚠️ No hay texto para guardar', 'warning');
      return;
    }

    stopRecognition();

    if (!studioId) {
      window.closeSheet();
      window.showNotification && window.showNotification('📝 Nota: ' + text.slice(0, 60) + (text.length > 60 ? '…' : ''), 'info');
      return;
    }

    var studio = window.State.studiosById && window.State.studiosById[studioId];
    if (!studio) {
      window.closeSheet();
      window.showNotification && window.showNotification('⚠️ Empresa no encontrada', 'warning');
      return;
    }

    var activity = {
      date:   new Date().toISOString().slice(0, 10),
      type:   'nota',
      notes:  text,
      source: 'voice',
    };

    var activities = ((studio.data && studio.data.activities) || []).concat([activity]);

    try {
      await window.Data.patchDoc('studios/' + studioId, {
        data: Object.assign({}, studio.data, { activities: activities }),
      });

      if (!studio.data) studio.data = {};
      studio.data.activities = activities;

      window.closeSheet();
      window.showNotification && window.showNotification(
        '✅ Nota guardada en ' + (studio.name || studioId), 'success'
      );
      if (navigator && navigator.vibrate) navigator.vibrate(10);

      // Re-render detail si está activo
      if (window.State.currentView === 'detail' &&
          window.State.currentStudioId === studioId &&
          window.Screens.detail) {
        window.Screens.detail.render({ studioId: studioId });
      }
    } catch (e) {
      window.showNotification && window.showNotification('⚠️ Error al guardar: ' + (e.message || e), 'error');
    }

    _transcript = '';
  }

  /* ============================================================
     HELPERS UI
     ============================================================ */
  function _setStatus(msg, type) {
    var el = document.getElementById('vf-status-text');
    var dot = document.getElementById('vf-dot');
    if (el) el.textContent = msg;
    var colors = { active: '#dc2626', warning: '#d97706', done: '#16a34a', idle: 'var(--fg-3)' };
    if (dot) dot.style.background = colors[type] || 'var(--fg-3)';
  }

  function _updateToggleBtn(isListening) {
    var btn = document.getElementById('vf-toggle-btn');
    if (!btn) return;
    btn.textContent = isListening ? '⏹ Detener' : '🎤 Reintentar';
  }

  function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function escapeAttr(s) {
    return escapeHtml(s || '').replace(/'/g, '&#39;');
  }

  /* ============================================================
     EXPORT
     ============================================================ */
  window.VoiceFab = {
    open:              open,
    startRecognition:  startRecognition,
    stopRecognition:   stopRecognition,
    toggleRecognition: toggleRecognition,
    saveNote:          saveNote,
  };
})();
