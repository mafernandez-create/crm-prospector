/* ============================================================
   CIERRE DE SEMANA — conciliación planificado/realizado/informe,
   resumen semanal (plantilla fija «resumen-semanal-v1») y correo a Javier.
   Reglas de Manolo (12-sep-2026, CLAUDE.md): tantos informes como visitas
   planificadas, justificar las que faltan, entrega el martes siguiente.
   Módulo aparte del planificador (solo añade un botón allí) y con su propio
   exportador Word: el de la plantilla de informe (detail.js) no se toca.
   ============================================================ */
(function () {
  'use strict';
  const U = window.Util;
  const escape = U.escapeHtml;
  const Local = { semana: null, conc: null, resultado: null, generando: false };

  function _fmt(iso) { return (U.formatDateES ? U.formatDateES(iso) : null) || iso; }

  async function abrir(lunesISO) {
    Local.semana = lunesISO;
    Local.resultado = null;
    _renderModal('<p style="color:var(--fg-3);">Cargando visitas de la semana…</p>');
    try {
      Local.conc = await window.Data.conciliarSemana(lunesISO);
      const previo = await window.DataSupabase.getResumenSemanal(lunesISO);
      if (previo && previo.markdown) {
        Local.resultado = { markdown: previo.markdown, correo: _splitCorreo(previo.correo), generated_at: previo.generated_at };
      }
      _renderModal(_htmlConciliacion());
    } catch (e) {
      _renderModal('<p style="color:#c8102e;">No se pudo cargar la semana: ' + escape(e.message || String(e)) + '</p>');
    }
  }
  function _splitCorreo(txt) {
    if (!txt) return null;
    const i = txt.indexOf('\n\n');
    return i > 0 ? { asunto: txt.slice(0, i), cuerpo: txt.slice(i + 2) } : { asunto: '', cuerpo: txt };
  }

  function _htmlConciliacion() {
    const c = Local.conc, cf = c.cifras;
    const motivos = window.Data.MOTIVOS_NO_REALIZADA;
    const filas = c.filas.map(function (f) {
      const ok = !!f.informe;
      const volver = window.Data.debeVolverAPlanificar(f.motivo, f.volver);
      const sel = '<select data-vid="' + f.id + '" class="cs-motivo" onchange="window.Screens.cierreSemana.motivoCambiado(this)" style="font:inherit; padding:3px 6px; border:1px solid var(--border-1); border-radius:4px;">' +
        '<option value="">— motivo —</option>' +
        Object.keys(motivos).map(function (k) { return '<option value="' + k + '"' + (f.motivo === k ? ' selected' : '') + '>' + escape(motivos[k]) + '</option>'; }).join('') +
        '<option value="__anulada">anular: no formó parte de la ruta</option>' +
        '</select> <input data-vid="' + f.id + '" class="cs-nota" placeholder="detalle (quién, cuándo…)" value="' + escape(f.nota || '') + '" style="font:inherit; padding:3px 6px; border:1px solid var(--border-1); border-radius:4px; width:220px;">' +
        (f.studio_id
          ? ' <label title="Crea en la ficha una tarea «pendiente de visitar» que sale en la bandeja y en «Pendiente en la zona» hasta que la vuelvas a planificar" style="font-size:12px; white-space:nowrap; cursor:pointer;">' +
              '<input type="checkbox" data-vid="' + f.id + '" class="cs-volver"' + (volver ? ' checked' : '') + (f.motivo ? '' : ' disabled') + '> volver a planificar</label>'
          : '');
      return '<tr>' +
        '<td style="white-space:nowrap;">' + escape(f.fecha) + '</td>' +
        '<td>' + (f.studio_id ? '<a href="#" onclick="event.preventDefault(); window.showView(\'detail\', {studioId: \'' + escape(f.studio_id) + '\'})">' + escape(f.empresa) + '</a>' : escape(f.empresa)) + '</td>' +
        '<td style="text-align:center;">' + (ok ? '<span title="Informe del ' + escape(f.informe.date) + '" style="color:#16a34a; font-weight:600;">✓ informe</span>' :
          (f.studio_id ? '<a href="#" style="color:#c8102e;" onclick="event.preventDefault(); window.Screens.cierreSemana.cerrar(); window.showView(\'informe\', {studioId: \'' + escape(f.studio_id) + '\'})">✗ redactar</a>' : '<span style="color:#c8102e;">✗ sin ficha</span>')) + '</td>' +
        '<td>' + (ok ? '<span style="color:var(--fg-3);">—</span>' : sel) + '</td>' +
        '</tr>';
    }).join('');
    const cifras = '<div style="display:flex; gap:10px; margin:8px 0 12px;">' +
      [['Planificadas', cf.planificadas, 'var(--fg-1)'], ['Realizadas', cf.realizadas, '#1B4F72'], ['Con informe', cf.informes, '#145A32'], ['No realizadas', cf.no_realizadas, cf.no_realizadas ? '#922B21' : '#145A32']]
        .map(function (x) { return '<div style="flex:1; background:var(--bg-2); border-radius:6px; padding:8px 10px; text-align:center;"><div style="font-size:22px; font-weight:700; color:' + x[2] + ';">' + x[1] + '</div><div style="font-size:11px; color:var(--fg-3); text-transform:uppercase;">' + x[0] + '</div></div>'; }).join('') +
      '</div>';
    const faltan = cf.no_realizadas;
    const aviso = faltan
      ? '<p style="margin:0 0 8px; font-size:13px; color:#922B21;">Faltan ' + faltan + ' informe' + (faltan === 1 ? '' : 's') + ': indica el motivo de cada visita no realizada (irá al resumen y al correo a Javier) o redáctalo si la visita se hizo. Marca <strong>volver a planificar</strong> si hay que repetirla (se propone sola con «reprogramada», «no pudieron recibirme» y «la canceló el cliente»): la empresa queda como pendiente de visitar en su ficha y en «Pendiente en la zona» hasta que la vuelvas a planificar. Si la visita nunca formó parte de la ruta, elige «anular».</p>'
      : '<p style="margin:0 0 8px; font-size:13px; color:#145A32;">Todas las visitas planificadas tienen informe.</p>';
    const res = Local.resultado ? _htmlResultado() : '';
    return (
      '<h3 style="margin:0 0 4px; font-family:var(--font-display); font-size:18px;">Cerrar semana ' + c.num_semana + ' · ' + escape(_fmt(c.semana)) + ' – ' + escape(_fmt(c.domingo)) + '</h3>' +
      '<div style="font-size:12px; color:var(--fg-3);">Entrega a Javier como muy tarde el <strong>' + escape(_fmt(c.fecha_limite)) + '</strong> (martes siguiente).</div>' +
      cifras + aviso +
      '<div style="max-height:260px; overflow:auto; border:1px solid var(--border-1); border-radius:6px;">' +
      '<table style="width:100%; border-collapse:collapse; font-size:13px;"><thead><tr style="background:var(--bg-2);">' +
      '<th style="text-align:left; padding:6px 8px;">Fecha</th><th style="text-align:left; padding:6px 8px;">Empresa</th><th style="padding:6px 8px;">Informe</th><th style="text-align:left; padding:6px 8px;">Motivo si no se realizó</th></tr></thead>' +
      '<tbody>' + (filas || '<tr><td colspan="4" style="padding:12px; color:var(--fg-3);">No hay visitas planificadas esta semana.</td></tr>') + '</tbody></table></div>' +
      '<div style="display:flex; gap:8px; margin-top:12px; justify-content:flex-end; flex-wrap:wrap;">' +
        '<button class="btn btn-ghost" onclick="window.Screens.cierreSemana.cerrar()">Cerrar</button>' +
        '<button class="btn btn-ghost" onclick="window.Screens.cierreSemana.guardarMotivos()">Guardar motivos</button>' +
        '<button class="btn btn-primary" ' + (Local.generando ? 'disabled' : '') + ' onclick="window.Screens.cierreSemana.generar()">' + (Local.generando ? 'Generando…' : (Local.resultado ? 'Regenerar resumen' : 'Generar resumen semanal')) + '</button>' +
      '</div>' + res
    );
  }

  function _htmlResultado() {
    const r = Local.resultado;
    const md2html = window.Screens.informe && window.Screens.informe._md2html;
    const html = md2html ? md2html(r.markdown) : '<pre style="white-space:pre-wrap;">' + escape(r.markdown) + '</pre>';
    return '<div style="margin-top:16px; border-top:1px solid var(--border-1); padding-top:12px;">' +
      '<div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:8px;">' +
        '<strong style="font-family:var(--font-display);">Resumen semanal</strong>' +
        (r.generated_at ? '<span style="font-size:11px; color:var(--fg-3);">generado ' + escape(String(r.generated_at).slice(0, 16).replace('T', ' ')) + '</span>' : '') +
        '<div style="flex:1;"></div>' +
        '<button class="btn btn-ghost" onclick="window.Screens.cierreSemana.descargarWord()">📄 Word del resumen</button>' +
        '<button class="btn btn-ghost" onclick="window.Screens.cierreSemana.copiarCorreo()">✉️ Copiar correo a Javier</button>' +
        '<a class="btn btn-ghost" href="' + _mailto() + '">Abrir en Mail</a>' +
      '</div>' +
      '<div class="report-markdown" style="max-height:340px; overflow:auto; border:1px solid var(--border-1); border-radius:6px; padding:10px 14px; font-size:13px;">' + html + '</div>' +
      '<details style="margin-top:8px;"><summary style="cursor:pointer; font-size:13px;">Correo a Javier (plantilla fija)</summary>' +
        '<pre style="white-space:pre-wrap; font:inherit; font-size:13px; background:var(--bg-2); padding:10px; border-radius:6px;">' + escape((r.correo && r.correo.asunto) ? 'Asunto: ' + r.correo.asunto + '\n\n' + r.correo.cuerpo : '') + '</pre></details>' +
      '</div>';
  }
  function _mailto() {
    const c = Local.resultado && Local.resultado.correo;
    if (!c) return '#';
    return 'mailto:j.vilar@grupogpf.com?subject=' + encodeURIComponent(c.asunto) + '&body=' + encodeURIComponent(c.cuerpo);
  }

  function _renderModal(inner) {
    cerrar();
    const host = document.createElement('div');
    host.id = 'cierre-semana-host';
    host.innerHTML =
      '<div class="planner-modal-overlay" onclick="if(event.target===this)window.Screens.cierreSemana.cerrar()" ' +
        'style="position:fixed; inset:0; background:rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center; z-index:1000;">' +
        '<div style="background:var(--bg-1); border-radius:8px; padding:20px; width:min(920px, 96vw); max-height:92vh; overflow:auto; box-shadow:0 12px 40px rgba(0,0,0,0.2);">' + inner + '</div></div>';
    document.body.appendChild(host);
  }
  function cerrar() { const h = document.getElementById('cierre-semana-host'); if (h) h.remove(); }

  // Al cambiar el motivo, la casilla «volver a planificar» se propone según el motivo.
  function motivoCambiado(sel) {
    const cb = document.querySelector('#cierre-semana-host .cs-volver[data-vid="' + sel.getAttribute('data-vid') + '"]');
    if (!cb) return;
    const motivo = sel.value === '__anulada' ? null : sel.value;
    cb.disabled = !motivo;
    cb.checked = window.Data.debeVolverAPlanificar(motivo, null);
  }
  async function guardarMotivos(silencioso) {
    const sels = document.querySelectorAll('#cierre-semana-host .cs-motivo');
    let n = 0, pendientes = 0, fallos = [];
    Local.fallosGuardado = fallos;
    for (const sel of sels) {
      const vid = sel.getAttribute('data-vid');
      const nota = (document.querySelector('#cierre-semana-host .cs-nota[data-vid="' + vid + '"]') || {}).value || '';
      const cb = document.querySelector('#cierre-semana-host .cs-volver[data-vid="' + vid + '"]');
      const fila = Local.conc.filas.find(function (f) { return String(f.id) === String(vid); });
      if (!fila) continue;
      const anular = sel.value === '__anulada';
      const motivo = anular ? null : (sel.value || null);
      const volver = cb && motivo ? cb.checked : null;
      const estado = anular ? 'anulada' : (motivo ? 'planificada' : null);
      const volverEfectivoFila = motivo ? window.Data.debeVolverAPlanificar(fila.motivo, fila.volver) : null;
      if (!anular && (fila.motivo || '') === (motivo || '') && (fila.nota || '') === nota && volverEfectivoFila === volver) continue;
      const res = await window.Data.guardarMotivoVisita(vid, motivo, nota || null, estado, volver);
      if (!res.row) { fallos.push(fila.empresa); continue; }
      fila.motivo = motivo; fila.nota = nota || null; fila.volver = volver; fila.estado = estado || fila.estado; n++;
      if (res.sync === 'creada' || res.sync === 'actualizada' || res.sync === 'ya-abierta') pendientes++;
    }
    // Si alguna empresa ya está replanificada en el planificador, su deuda se cierra ahora (no en el próximo guardado).
    try { await window.Data.cerrarPendientesVisitaPlanificadas((window.State.planificador || {}).schedule || {}); } catch (e) { console.warn('[cierre] ' + (e && e.message)); }
    if (!silencioso && window.showNotification) {
      if (fallos.length) window.showNotification('⚠️ No se pudo guardar el motivo de: ' + fallos.join(', '), 'warning');
      else window.showNotification(n
        ? '✓ ' + n + ' motivo' + (n === 1 ? '' : 's') + ' guardado' + (n === 1 ? '' : 's') + (pendientes ? ' · ' + pendientes + ' pendiente' + (pendientes === 1 ? '' : 's') + ' de visitar en bandeja' : '')
        : 'Sin cambios', n ? 'success' : 'info');
    }
    // Reconciliar tras guardar: las anuladas salen de la lista y las cifras se recalculan.
    if (n && !silencioso) { Local.conc = await window.Data.conciliarSemana(Local.semana); _renderModal(_htmlConciliacion()); }
    else if (n) Local.conc.filas = Local.conc.filas.filter(function (f) { return f.estado !== 'anulada'; });
    return n;
  }

  async function generar() {
    if (Local.generando) return;
    await guardarMotivos(true);
    if (Local.fallosGuardado && Local.fallosGuardado.length) {
      if (window.showNotification) window.showNotification('⚠️ No se pudo guardar el motivo de: ' + Local.fallosGuardado.join(', ') + '. Revísalo antes de generar.', 'warning');
      return;
    }
    const sinMotivo = Local.conc.filas.filter(function (f) { return !f.informe && !f.motivo; });
    if (sinMotivo.length && !window.confirm(sinMotivo.length + ' visita(s) sin informe no tienen motivo. ¿Generar igualmente? (irán como «no se pudo realizar»)')) return;
    Local.generando = true; _renderModal(_htmlConciliacion());
    try {
      const out = await window.Data.generateWeeklySummary(Local.semana);
      Local.conc = out.conciliacion;
      Local.resultado = { markdown: out.markdown, correo: out.correo, generated_at: new Date().toISOString() };
      if (window.showNotification) window.showNotification('✓ Resumen semanal generado y guardado', 'success');
    } catch (e) {
      if (window.showNotification) window.showNotification('Error al generar el resumen: ' + (e.message || e), 'error');
    } finally {
      Local.generando = false; _renderModal(_htmlConciliacion());
    }
  }

  function copiarCorreo() {
    const c = Local.resultado && Local.resultado.correo; if (!c) return;
    const txt = 'Asunto: ' + c.asunto + '\n\n' + c.cuerpo;
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () {
      if (window.showNotification) window.showNotification('✉️ Correo copiado al portapapeles', 'success');
    }).catch(function () { window.prompt('Copia el correo:', txt); });
  }

  /* ---------- Word del resumen (exportador propio; paleta JRW por resultado en el cuadro) ---------- */
  const PAL = { dark: '1B4F72', mid: '2E86C1', light: 'D6EAF8' };
  const RES_COLORS = { alto: 'D5F5E3', medio: 'D6EAF8', mediobajo: 'EBDEF0', bajo: 'FADBD8' };
  function _resColor(txt) {
    const r = String(txt || '').toUpperCase();
    if (/MEDIO[\s-]*BAJO/.test(r)) return RES_COLORS.mediobajo;
    if (/BAJO/.test(r)) return RES_COLORS.bajo;
    if (/MEDIO/.test(r)) return RES_COLORS.medio;
    if (/ALTO/.test(r)) return RES_COLORS.alto;
    return null;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function runs(text, rpr) {
    rpr = rpr || '';
    return String(text || '').split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map(function (p) {
      const b = /^\*\*[\s\S]+\*\*$/.test(p);
      const t = (b ? p.slice(2, -2) : p).replace(/\*([^*]+)\*/g, '$1');
      const r = rpr + (b ? '<w:b/>' : '');
      return '<w:r>' + (r ? '<w:rPr>' + r + '</w:rPr>' : '') + '<w:t xml:space="preserve">' + esc(t) + '</w:t></w:r>';
    }).join('') || '<w:r><w:t xml:space="preserve"></w:t></w:r>';
  }
  function P(r, ppr) { return '<w:p>' + (ppr ? '<w:pPr>' + ppr + '</w:pPr>' : '') + r + '</w:p>'; }
  function H(text, level) {
    const sz = level <= 1 ? '34' : '26';
    return P('<w:r><w:rPr><w:b/><w:color w:val="' + (level <= 1 ? PAL.dark : PAL.mid) + '"/><w:sz w:val="' + sz + '"/></w:rPr><w:t xml:space="preserve">' + esc(text) + '</w:t></w:r>', '<w:keepNext/><w:spacing w:before="240" w:after="80"/>');
  }
  function cell(text, mode, fill) {
    const shd = fill ? '<w:shd w:val="clear" w:fill="' + fill + '"/>' : (mode === 'header' ? '<w:shd w:val="clear" w:fill="' + PAL.dark + '"/>' : '');
    const rpr = mode === 'header' ? '<w:b/><w:color w:val="FFFFFF"/>' : (mode === 'kv' ? '<w:b/>' : '');
    return '<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>' + shd + '</w:tcPr>' + P(runs(text, rpr), '<w:spacing w:before="40" w:after="40"/>') + '</w:tc>';
  }
  function table(hdr, rows) {
    const borders = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function (b) { return '<w:' + b + ' w:val="single" w:sz="4" w:space="0" w:color="D7DDE3"/>'; }).join('') + '</w:tblBorders>';
    const resIdx = hdr.findIndex(function (h) { return /^resultado$/i.test(h); });
    let t = '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>' + borders + '</w:tblPr>';
    t += '<w:tr><w:trPr><w:tblHeader/></w:trPr>' + hdr.map(function (c) { return cell(c, 'header'); }).join('') + '</w:tr>';
    rows.forEach(function (row) {
      t += '<w:tr>' + row.map(function (c, i) { return cell(c, '', i === resIdx ? _resColor(c) : null); }).join('') + '</w:tr>';
    });
    return t + '</w:tbl>' + P('', '<w:spacing w:after="120"/>');
  }
  function body(md) {
    const lines = String(md || '').split('\n'); let out = '', i = 0, first = true;
    function isSep(l) { return /^\|?[\s:\-]+(\|[\s:\-]+)+\|?$/.test((l || '').trim()); }
    while (i < lines.length) {
      const line = lines[i].replace(/\s+$/, '');
      if (/^\s*\|/.test(line) && i + 1 < lines.length && isSep(lines[i + 1])) {
        const hdr = line.trim().replace(/^\||\|$/g, '').split('|').map(function (c) { return c.trim(); });
        i += 2; const rows = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map(function (c) { return c.trim(); })); i++; }
        out += table(hdr, rows); continue;
      }
      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) { if (h[1].length === 1 && first) { first = false; i++; continue; } out += H(h[2], h[1].length); i++; continue; }
      if (/^\s*---+\s*$/.test(line) || line.trim() === '') { i++; continue; }
      const ul = line.match(/^\s*[-*]\s+(.*)$/);
      if (ul) { out += P('<w:r><w:t xml:space="preserve">• </w:t></w:r>' + runs(ul[1]), '<w:ind w:left="360"/><w:spacing w:after="40"/>'); i++; continue; }
      const ol = line.match(/^\s*(\d+)\.\s+(.*)$/);
      if (ol) { out += P('<w:r><w:t xml:space="preserve">' + ol[1] + '. </w:t></w:r>' + runs(ol[2]), '<w:ind w:left="360"/><w:spacing w:after="40"/>'); i++; continue; }
      out += P(runs(line), '<w:spacing w:after="100"/>'); i++;
    }
    return out;
  }
  async function descargarWord() {
    const r = Local.resultado; if (!r || typeof JSZip === 'undefined') return;
    const c = Local.conc;
    const titulo = 'RESUMEN SEMANAL DE VISITAS';
    const sub = 'Semana ' + c.num_semana + ' · ' + _fmt(c.semana) + ' – ' + _fmt(c.domingo) + ' · Manuel Fernández · Prescriptor GPF';
    const header = P('<w:r><w:rPr><w:b/><w:color w:val="' + PAL.dark + '"/><w:sz w:val="36"/></w:rPr><w:t xml:space="preserve">' + titulo + '</w:t></w:r>', '<w:spacing w:after="40"/>') +
      P('<w:r><w:rPr><w:color w:val="5B6672"/><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">' + esc(sub) + '</w:t></w:r>', '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="' + PAL.mid + '"/></w:pBdr><w:spacing w:after="200"/>');
    const footer = P('', '<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="D7DDE3"/></w:pBdr><w:spacing w:before="200"/>') +
      P('<w:r><w:rPr><w:color w:val="666666"/><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">Elaborado por: Manuel Fernández · Fecha límite de entrega: ' + esc(_fmt(c.fecha_limite)) + '</w:t></w:r>');
    const doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + header + body(r.markdown) + footer +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>';
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file('word/document.xml', doc);
    const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'Resumen_Semana_' + c.num_semana + '_' + c.semana + '.docx';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  window.Screens = window.Screens || {};
  window.Screens.cierreSemana = { abrir: abrir, cerrar: cerrar, guardarMotivos: guardarMotivos, motivoCambiado: motivoCambiado, generar: generar, copiarCorreo: copiarCorreo, descargarWord: descargarWord, _buildDocxBody: body };
})();
