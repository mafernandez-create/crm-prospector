/* CRM Prospector · rediseño v1.1 — Importar / Exportar
 *
 * Vista #importar. Permite:
 *   - Drag-drop o pick de un .xlsx
 *   - Parser con XLSX.js (carga diferida desde CDN)
 *   - Mapeo automático de columnas (heurística por header)
 *   - Vista previa con resumen y warnings
 *   - Commit a Firestore via Data.patchDoc('studios/{id}', obj)
 *   - Exportar cartera actual a XLSX y a JSON
 *
 * El importer respeta las reglas:
 *   - Si la fila trae id existente → patch
 *   - Si no trae id o el id no existe → genera nuevo (siguiente id libre)
 *   - Campos desconocidos se ignoran (con warning)
 */
(function () {
  'use strict';

  const I = window.Icon;
  const State = window.State;
  const U = window.Util;
  const escape = U.escapeHtml;

  /* Heurísticas de mapeo: header lowercased → field path */
  const HEADER_MAP = {
    'id': 'id', 'nº': 'id', 'numero': 'id', 'número': 'id',
    'nombre': 'name', 'empresa': 'name', 'name': 'name',
    'tipo': 'type', 'type': 'type',
    'ciudad': 'city', 'localidad': 'city', 'city': 'city',
    'provincia': 'province', 'province': 'province',
    'cp': 'data.contact.cp', 'código postal': 'data.contact.cp', 'codigo postal': 'data.contact.cp',
    'score': 'score',
    'prioridad': 'priority', 'priority': 'priority',
    'estado': 'status', 'status': 'status',
    'teléfono': 'data.contact.phone', 'telefono': 'data.contact.phone', 'tel': 'data.contact.phone', 'phone': 'data.contact.phone',
    'email': 'data.contact.email', 'correo': 'data.contact.email', 'e-mail': 'data.contact.email',
    'web': 'data.contact.web', 'website': 'data.contact.web', 'url': 'data.contact.web',
    'dirección': 'data.contact.address', 'direccion': 'data.contact.address', 'address': 'data.contact.address',
    'notas': 'data.notes', 'notes': 'data.notes', 'observaciones': 'data.notes',
  };

  const Local = {
    rows: null,         // Array de filas crudas de la hoja
    headers: null,      // Headers tal cual
    mapping: null,      // header → field path (auto + user)
    parsed: null,       // Array de objetos { id?, name, ... } listo para commit
    warnings: [],
    importando: false,
    importResult: null, // { ok, ko, log }
  };

  /* ============================================================
     RENDER
     ============================================================ */
  function render() {
    const v = document.getElementById('view-importar');
    if (!v) return;
    document.getElementById('topbar-current').textContent = 'Importar / Exportar';

    v.innerHTML = (
      '<div style="max-width:1100px; margin:0 auto;">' +
        header() +
        seccionExportar() +
        '<hr style="border:0; border-top:1px solid var(--border-1); margin:24px 0;">' +
        seccionImportar() +
        (Local.rows ? previewBlock() : '') +
        (Local.importResult ? resultadoBlock() : '') +
      '</div>'
    );

    wireDropzone();
  }

  function header() {
    return (
      '<header style="margin-bottom:16px;">' +
        '<div class="eyebrow">Datos</div>' +
        '<h1 style="font-family:var(--font-display); font-weight:600; font-size:32px; line-height:1; ' +
          'text-transform:uppercase; letter-spacing:.005em; margin:6px 0 4px;">Importar / Exportar</h1>' +
        '<p style="color:var(--fg-3); font-size:14px; margin:0;">Sube un Excel con altas y actualizaciones, o exporta la cartera actual.</p>' +
      '</header>'
    );
  }

  function seccionExportar() {
    const total = (State.studios || []).length;
    return (
      '<section style="background:var(--bg-2); padding:14px 16px; border-radius:8px;">' +
        '<h2 style="margin:0 0 8px; font-family:var(--font-display); font-size:18px;">Exportar cartera</h2>' +
        '<p style="margin:0 0 12px; font-size:13px; color:var(--fg-3);">Descarga los ' + total + ' estudios cargados.</p>' +
        '<div style="display:flex; gap:8px;">' +
          '<button class="btn btn-primary" onclick="window.Screens.importar.exportXLSX()">Descargar XLSX</button>' +
          '<button class="btn btn-ghost" onclick="window.Screens.importar.exportJSON()">Descargar JSON</button>' +
        '</div>' +
      '</section>'
    );
  }

  function seccionImportar() {
    return (
      '<section>' +
        '<h2 style="margin:0 0 8px; font-family:var(--font-display); font-size:18px;">Importar Excel</h2>' +
        '<p style="margin:0 0 12px; font-size:13px; color:var(--fg-3);">Arrastra un .xlsx aquí o pulsa para seleccionarlo. Headers reconocidos: <code style="font-size:11px;">nombre, tipo, ciudad, provincia, cp, score, teléfono, email, web, dirección, notas</code>. La columna <code style="font-size:11px;">id</code> se usa para actualizar; si está vacía se crea nuevo.</p>' +
        '<div id="dz" style="border:2px dashed var(--border-2); border-radius:8px; padding:36px; text-align:center; cursor:pointer; background:var(--bg-1); transition:background .2s;">' +
          '<div style="font-size:36px; line-height:1; margin-bottom:6px;">📂</div>' +
          '<div style="font-weight:600;">Arrastra el archivo .xlsx aquí</div>' +
          '<div style="font-size:12px; color:var(--fg-3); margin-top:4px;">o pulsa para abrir el selector</div>' +
          '<input id="dz-input" type="file" accept=".xlsx,.xls" style="display:none;">' +
        '</div>' +
      '</section>'
    );
  }

  function wireDropzone() {
    const dz = document.getElementById('dz');
    const input = document.getElementById('dz-input');
    if (!dz || !input) return;
    dz.onclick = function () { input.click(); };
    dz.ondragover = function (e) { e.preventDefault(); dz.style.background = 'rgba(10, 45, 82, 0.04)'; };
    dz.ondragleave = function () { dz.style.background = 'var(--bg-1)'; };
    dz.ondrop = function (e) {
      e.preventDefault();
      dz.style.background = 'var(--bg-1)';
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        cargarArchivo(e.dataTransfer.files[0]);
      }
    };
    input.onchange = function (e) {
      if (e.target.files && e.target.files[0]) cargarArchivo(e.target.files[0]);
    };
  }

  /* ============================================================
     PARSER XLSX
     ============================================================ */
  function cargarArchivo(file) {
    if (typeof XLSX === 'undefined') {
      alert('XLSX.js todavía no se ha cargado, espera un momento e inténtalo de nuevo.');
      return;
    }
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const firstSheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
        if (!json.length) {
          alert('La primera hoja está vacía.');
          return;
        }
        Local.rows = json;
        Local.headers = Object.keys(json[0]);
        Local.mapping = autoMapping(Local.headers);
        Local.warnings = [];
        Local.parsed = mapearFilas(json);
        Local.importResult = null;
        render();
      } catch (err) {
        console.error('[importar] error parseando XLSX:', err);
        alert('No se pudo leer el archivo:\n' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function autoMapping(headers) {
    const out = {};
    for (const h of headers) {
      const key = String(h || '').toLowerCase().trim();
      if (HEADER_MAP[key]) out[h] = HEADER_MAP[key];
    }
    return out;
  }

  function mapearFilas(rows) {
    const out = [];
    const warnings = [];
    rows.forEach(function (r, i) {
      const obj = {};
      let hasContent = false;
      for (const h in r) {
        const path = Local.mapping[h];
        const val = r[h];
        if (!path) continue;
        if (val === '' || val == null) continue;
        hasContent = true;
        setByPath(obj, path, val);
      }
      if (!hasContent) return;
      // Validaciones
      if (!obj.name) warnings.push('Fila ' + (i + 2) + ': sin nombre (se ignorará)');
      else out.push(obj);
    });
    // Headers no mapeados
    for (const h of Local.headers) {
      if (!Local.mapping[h]) warnings.push('Columna "' + h + '" no reconocida (se ignora)');
    }
    Local.warnings = warnings;
    return out;
  }

  function setByPath(obj, path, val) {
    const parts = path.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    const last = parts[parts.length - 1];
    // Coerciones
    if (last === 'score' && val !== '') cur[last] = Number(val) || 0;
    else if (last === 'id' && val !== '') cur[last] = String(val);
    else cur[last] = val;
  }

  /* ============================================================
     PREVIEW
     ============================================================ */
  function previewBlock() {
    const sample = (Local.parsed || []).slice(0, 8);
    const updates = (Local.parsed || []).filter(function (r) { return r.id; }).length;
    const altas = (Local.parsed || []).length - updates;
    const headersOK = Local.headers.filter(function (h) { return Local.mapping[h]; });
    const headersKO = Local.headers.filter(function (h) { return !Local.mapping[h]; });
    return (
      '<section style="margin-top:20px; background:var(--bg-2); padding:14px 16px; border-radius:8px;">' +
        '<h3 style="margin:0 0 8px; font-family:var(--font-display); font-size:16px;">Vista previa</h3>' +
        '<div style="display:flex; gap:16px; margin-bottom:10px; font-size:13px;">' +
          '<span><strong>' + (Local.parsed || []).length + '</strong> filas válidas</span>' +
          '<span style="color:var(--fg-3);">·</span>' +
          '<span><strong>' + altas + '</strong> nuevos</span>' +
          '<span style="color:var(--fg-3);">·</span>' +
          '<span><strong>' + updates + '</strong> actualizaciones</span>' +
        '</div>' +
        '<div style="font-size:12px; color:var(--fg-3); margin-bottom:10px;">' +
          'Columnas detectadas: ' + headersOK.map(escape).join(', ') + '. ' +
          (headersKO.length ? 'Ignoradas: ' + headersKO.map(escape).join(', ') + '.' : '') +
        '</div>' +
        (Local.warnings.length
          ? '<details style="margin-bottom:10px;"><summary style="cursor:pointer; font-size:12px; color:#b45309;">⚠ ' + Local.warnings.length + ' advertencia' + (Local.warnings.length === 1 ? '' : 's') + '</summary>' +
            '<ul style="margin:6px 0 0 18px; font-size:12px; color:var(--fg-3);">' +
            Local.warnings.slice(0, 30).map(function (w) { return '<li>' + escape(w) + '</li>'; }).join('') +
            '</ul></details>'
          : '') +
        '<div style="overflow:auto; max-height:280px; border:1px solid var(--border-1); border-radius:6px; background:var(--bg-1);">' +
          tablaPreview(sample) +
        '</div>' +
        '<div style="margin-top:12px; display:flex; gap:8px; align-items:center;">' +
          '<button class="btn btn-primary" ' + (Local.importando ? 'disabled' : '') + ' onclick="window.Screens.importar.commit()">' +
            (Local.importando ? 'Importando…' : 'Importar a Firestore') +
          '</button>' +
          '<button class="btn btn-ghost" onclick="window.Screens.importar.cancelar()">Descartar</button>' +
          '<span style="font-size:12px; color:var(--fg-3); margin-left:auto;">Cada fila escribirá un documento. Esto puede tardar unos segundos.</span>' +
        '</div>' +
      '</section>'
    );
  }

  function tablaPreview(sample) {
    if (!sample.length) return '<div style="padding:20px; text-align:center; color:var(--fg-3); font-size:13px;">Sin filas válidas.</div>';
    const cols = ['id', 'name', 'type', 'city', 'province', 'score'];
    return (
      '<table style="width:100%; border-collapse:collapse; font-size:12px;">' +
        '<thead style="position:sticky; top:0; background:var(--bg-2);"><tr>' +
          cols.map(function (c) { return '<th style="text-align:left; padding:6px 8px; border-bottom:1px solid var(--border-1); font-weight:600; text-transform:uppercase; letter-spacing:.05em; font-size:11px;">' + escape(c) + '</th>'; }).join('') +
        '</tr></thead>' +
        '<tbody>' +
          sample.map(function (r) {
            return '<tr>' +
              cols.map(function (c) {
                return '<td style="padding:6px 8px; border-bottom:1px solid var(--border-1); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:160px;">' +
                  escape(String(r[c] != null ? r[c] : '')) +
                '</td>';
              }).join('') +
            '</tr>';
          }).join('') +
        '</tbody>' +
      '</table>'
    );
  }

  function resultadoBlock() {
    const r = Local.importResult;
    return (
      '<section style="margin-top:20px; background:' + (r.ko ? '#fef2f2' : '#ecfdf5') + '; padding:14px 16px; border-radius:8px; border:1px solid ' + (r.ko ? '#fecaca' : '#bbf7d0') + ';">' +
        '<h3 style="margin:0 0 8px;">' + (r.ko ? '⚠ ' : '✓ ') + 'Importación completada</h3>' +
        '<div style="font-size:13px;">' +
          '<strong>' + r.ok + '</strong> filas escritas correctamente · ' +
          '<strong>' + r.ko + '</strong> fallos' +
        '</div>' +
        (r.log && r.log.length
          ? '<details style="margin-top:8px;"><summary style="cursor:pointer; font-size:12px;">Ver log</summary>' +
            '<pre style="margin:6px 0 0; font-size:11px; max-height:200px; overflow:auto; background:var(--bg-1); padding:8px; border-radius:4px;">' +
            escape(r.log.join('\n')) +
            '</pre></details>'
          : '') +
      '</section>'
    );
  }

  /* ============================================================
     COMMIT
     ============================================================ */
  async function commit() {
    if (Local.importando) return;
    if (!Local.parsed || !Local.parsed.length) return;
    if (!confirm('Vas a escribir ' + Local.parsed.length + ' documento(s) a Firestore. ¿Continuar?')) return;
    Local.importando = true;
    render();

    const log = [];
    let ok = 0, ko = 0;
    const nextId = nextStudioId();
    let cursor = nextId;

    for (let i = 0; i < Local.parsed.length; i++) {
      const r = Local.parsed[i];
      let id = r.id;
      if (!id) {
        id = String(cursor);
        cursor++;
      }
      const docCopy = Object.assign({}, r);
      delete docCopy.id; // id es la key, no un campo
      try {
        await window.Data.patchDoc('studios/' + id, docCopy);
        ok++;
        log.push('✓ ' + id + ' · ' + (r.name || '(sin nombre)'));
      } catch (e) {
        ko++;
        log.push('✗ ' + id + ' · ' + (r.name || '(sin nombre)') + ' — ' + (e.message || e));
        console.error('[importar] fallo en', id, e);
      }
    }
    Local.importResult = { ok: ok, ko: ko, log: log };
    Local.importando = false;
    render();
  }

  function nextStudioId() {
    let max = 3000;
    (State.studios || []).forEach(function (s) {
      const n = parseInt(s.id, 10);
      if (!isNaN(n) && n > max) max = n;
    });
    return max + 1;
  }

  function cancelar() {
    Local.rows = null;
    Local.parsed = null;
    Local.mapping = null;
    Local.headers = null;
    Local.warnings = [];
    Local.importResult = null;
    render();
  }

  /* ============================================================
     EXPORT
     ============================================================ */
  function exportXLSX() {
    if (typeof XLSX === 'undefined') { alert('XLSX.js todavía no está cargado, prueba en un instante.'); return; }
    const rows = (State.studios || []).map(function (s) {
      const c = (s.data && s.data.contact) || {};
      return {
        id: s.id,
        nombre: s.name || '',
        tipo: s.type || '',
        ciudad: s.city || '',
        provincia: s.province || '',
        score: s.score || '',
        prioridad: s.priority || '',
        estado: s.status || '',
        teléfono: U.readField(c.phone),
        email: U.readField(c.email),
        web: U.readField(c.web),
        dirección: U.readField(c.address),
        cp: U.readField(c.cp),
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Studios');
    const fecha = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, 'cartera_ferroplast_' + fecha + '.xlsx');
  }

  function exportJSON() {
    const json = JSON.stringify(State.studios || [], null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cartera_ferroplast_' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ============================================================
     REGISTRO
     ============================================================ */
  window.Screens = window.Screens || {};
  window.Screens.importar = {
    render: render,
    commit: commit,
    cancelar: cancelar,
    exportXLSX: exportXLSX,
    exportJSON: exportJSON,
  };
})();
