/* CRM Prospector · rediseño v1 — Candidatos PLACSP
 *
 * Vista #candidatos. El cron diario de PLACSP (scripts/placsp-fetch.js) da de
 * alta cada adjudicatario de un contrato público que no está en el CRM, con
 * data.revision_placsp = { estado: 'pendiente', creada }. Hasta que Manolo los
 * revisa aquí NO son cartera (viven en State.candidatosPlacsp, ver data.js
 * indexarCartera): así Dragados o TYPSA no aparecen en Empresas, en el mapa ni
 * en el dashboard por haber ganado una obra en Madrid.
 *
 * Decisiones: Aceptar como cliente (provincia + ciudad/tipo opcionales → pasa a
 * cartera con status 'nuevo') · Descartar (queda en la pestaña «Descartadas»,
 * reversible; el cron no la recrea porque el cruce por nombre la encuentra).
 */
(function () {
  'use strict';
  const State = window.State;
  const U = window.Util;
  const escape = U.escapeHtml;

  const TIPOS = [
    ['ING', 'Ingeniería'], ['ARQ', 'Arquitectura'], ['OCV', 'Constructora · Promotora'],
    ['CICA', 'Ciclo del agua'], ['CCRR', 'C.R. Regantes'], ['AAPP', 'Administración pública'],
  ];
  const Local = { tab: 'pendientes', abierto: null };

  function candidatos(estado) {
    return (State.candidatosPlacsp || []).filter(function (s) {
      return s.data && s.data.revision_placsp && s.data.revision_placsp.estado === estado;
    }).sort(function (a, b) {
      const fa = _fechaOrden(a), fb = _fechaOrden(b);
      return fa < fb ? 1 : fa > fb ? -1 : 0;
    });
  }
  function _fechaOrden(s) {
    const r = s.data.revision_placsp || {};
    return r.estado === 'descartada' ? (r.fecha || '') : (r.creada || (s.data.ultima_adjudicacion_placsp || {}).fecha || '');
  }
  /* Provincia sugerida a partir del lugar de la obra, solo si coincide con una capital/provincia conocida. */
  function provinciaSugerida(lugar) {
    if (!lugar) return '';
    const l = U.normProv(String(lugar).replace(/\s*\(.*\)\s*$/, ''));
    const hit = U.PROVINCIAS.find(function (p) { return U.normProv(p) === l; });
    return hit || '';
  }

  function render(params) {
    const v = document.getElementById('view-candidatos');
    if (!v) return;
    const tc = document.getElementById('topbar-current'); if (tc) tc.textContent = 'Candidatos PLACSP';
    if (params && params.tab) Local.tab = params.tab;
    const pend = candidatos('pendiente'), desc = candidatos('descartada');
    const lista = Local.tab === 'descartadas' ? desc : pend;
    v.innerHTML = (
      '<div style="margin-bottom:16px;">' +
        '<div class="eyebrow">Descubrimiento automático</div>' +
        '<h1 style="font-family:var(--font-display); font-weight:700; font-size:26px; text-transform:uppercase; margin:2px 0 0;">Candidatos PLACSP</h1>' +
        '<p style="font-size:13px; color:var(--fg-3); margin:6px 0 0; max-width:720px;">Empresas que han ganado un contrato público y no estaban en el CRM. ' +
          'No cuentan como cartera hasta que las aceptes: decide si te interesan como cliente o descártalas.</p>' +
      '</div>' +
      '<div style="display:flex; gap:8px; margin-bottom:16px;">' +
        _tab('pendientes', 'Por revisar', pend.length) + _tab('descartadas', 'Descartadas', desc.length) +
      '</div>' +
      (lista.length
        ? '<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(340px, 1fr)); gap:12px;">' + lista.map(card).join('') + '</div>'
        : '<div class="card" style="padding:32px; text-align:center; color:var(--fg-3);">' +
            (Local.tab === 'descartadas' ? 'No has descartado ninguna.' : '🎉 Nada por revisar. El cron de PLACSP añadirá aquí los adjudicatarios nuevos.') +
          '</div>')
    );
  }
  function _tab(id, label, n) {
    const on = Local.tab === id;
    return '<button class="btn ' + (on ? 'btn-primary' : 'btn-ghost') + '" onclick="window.Screens.candidatos.setTab(\'' + id + '\')">' +
      label + ' <span style="font-family:var(--font-mono); opacity:.8;">' + n + '</span></button>';
  }

  function card(s) {
    const adj = s.data.ultima_adjudicacion_placsp || {};
    const r = s.data.revision_placsp || {};
    const importe = adj.importe ? Math.round(adj.importe / 1000).toLocaleString('es-ES') + ' k€' : '';
    const desc = r.estado === 'descartada';
    const abierto = Local.abierto === s.id;
    return (
      '<div class="card" style="padding:14px; border-left:4px solid ' + (desc ? '#94a3b8' : '#f59e0b') + ';">' +
        '<div style="display:flex; justify-content:space-between; gap:8px; align-items:flex-start;">' +
          '<div style="font-weight:700; font-size:15px; line-height:1.25;">' + escape(s.name || s.id) + '</div>' +
          '<span style="font-size:11px; color:var(--fg-3); font-family:var(--font-mono); white-space:nowrap;">' + escape(r.creada || adj.fecha || '') + '</span>' +
        '</div>' +
        '<div style="font-size:13px; color:var(--fg-2); margin-top:6px;" title="' + escape(adj.titulo || '') + '">🏆 ' + escape((adj.titulo || '').slice(0, 140)) + ((adj.titulo || '').length > 140 ? '…' : '') + '</div>' +
        '<div style="display:flex; flex-wrap:wrap; gap:10px; margin-top:8px; font-size:12px; color:var(--fg-3); font-family:var(--font-mono);">' +
          (adj.organismo ? '<span>' + escape(adj.organismo) + '</span>' : '') +
          (importe ? '<span style="color:#d97706; font-weight:600;">' + escape(importe) + '</span>' : '') +
          (adj.lugar ? '<span>📍 obra en ' + escape(adj.lugar) + '</span>' : '') +
          (adj.url ? '<a href="' + escape(U.safeHref ? U.safeHref(adj.url) : adj.url) + '" target="_blank" rel="noopener" style="color:var(--gpf-blue-700);">Ver en PLACSP ↗</a>' : '') +
        '</div>' +
        (r.nota ? '<div style="font-size:12px; color:var(--fg-3); margin-top:6px; font-style:italic;">' + escape(r.nota) + '</div>' : '') +
        '<div style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap;">' +
          (desc
            ? '<button class="btn btn-ghost" onclick="window.Screens.candidatos.decidir(\'' + escape(s.id) + '\', \'pendiente\')">↩ Volver a revisar</button>'
            : '<button class="btn btn-primary" onclick="window.Screens.candidatos.abrirAceptar(\'' + escape(s.id) + '\')">✓ Aceptar como cliente</button>' +
              '<button class="btn btn-ghost" onclick="window.Screens.candidatos.decidir(\'' + escape(s.id) + '\', \'descartada\')">✕ Descartar</button>') +
          '<a href="#detail/' + escape(s.id) + '" class="btn btn-ghost" onclick="event.preventDefault(); showView(\'detail\', {studioId: \'' + escape(s.id) + '\'})">Ver ficha</a>' +
        '</div>' +
        (abierto && !desc ? _formAceptar(s, adj) : '') +
      '</div>'
    );
  }
  function _formAceptar(s, adj) {
    const sug = provinciaSugerida(adj.lugar);
    const fld = 'style="width:100%; padding:7px 9px; border:1px solid var(--line); border-radius:6px; font:inherit; background:var(--bg-card); color:var(--fg-1);"';
    return (
      '<div style="margin-top:12px; padding:12px; background:var(--bg-2); border-radius:8px; display:grid; gap:8px;">' +
        '<div style="font-size:12px; color:var(--fg-3);">Al aceptar pasa a Empresas con estado «nuevo». La provincia es la de la <strong>sede</strong> (no la de la obra' + (sug ? '; se sugiere ' + escape(sug) + ' porque la obra está allí' : '') + ').</div>' +
        '<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">' +
          '<label><span style="font-size:11px; text-transform:uppercase; color:var(--fg-3);">Provincia *</span>' +
            '<select id="cand-prov-' + escape(s.id) + '" ' + fld + '><option value="">— elige —</option>' +
              U.PROVINCIAS.map(function (p) { return '<option value="' + escape(p) + '"' + (p === sug ? ' selected' : '') + '>' + escape(p) + '</option>'; }).join('') +
            '</select></label>' +
          '<label><span style="font-size:11px; text-transform:uppercase; color:var(--fg-3);">Tipo</span>' +
            '<select id="cand-tipo-' + escape(s.id) + '" ' + fld + '>' +
              TIPOS.map(function (t) { return '<option value="' + t[0] + '"' + ((Array.isArray(s.type) ? s.type[0] : s.type) === t[0] ? ' selected' : '') + '>' + t[1] + '</option>'; }).join('') +
            '</select></label>' +
        '</div>' +
        '<label><span style="font-size:11px; text-transform:uppercase; color:var(--fg-3);">Ciudad (sede)</span>' +
          '<input id="cand-city-' + escape(s.id) + '" ' + fld + ' placeholder="opcional"></label>' +
        '<label><span style="font-size:11px; text-transform:uppercase; color:var(--fg-3);">Nota</span>' +
          '<input id="cand-nota-' + escape(s.id) + '" ' + fld + ' placeholder="por qué interesa (opcional)"></label>' +
        '<div style="display:flex; gap:8px; justify-content:flex-end;">' +
          '<button class="btn btn-ghost" onclick="window.Screens.candidatos.cerrarAceptar()">Cancelar</button>' +
          '<button class="btn btn-primary" onclick="window.Screens.candidatos.confirmarAceptar(\'' + escape(s.id) + '\')">Aceptar</button>' +
        '</div>' +
      '</div>'
    );
  }

  function setTab(t) { Local.tab = t; Local.abierto = null; render(); }
  function abrirAceptar(id) { Local.abierto = id; render(); setTimeout(function () { const el = document.getElementById('cand-prov-' + id); if (el) el.focus(); }, 30); }
  function cerrarAceptar() { Local.abierto = null; render(); }
  async function confirmarAceptar(id) {
    const g = function (k) { const el = document.getElementById('cand-' + k + '-' + id); return el ? el.value.trim() : ''; };
    const province = g('prov');
    if (!province) { if (window.showNotification) window.showNotification('Indica la provincia de la sede', 'warning'); return; }
    await decidir(id, 'aceptada', { province: province, city: g('city'), type: g('tipo'), nota: g('nota') });
  }
  async function decidir(id, estado, extra) {
    try {
      const obj = await window.Data.revisarCandidatoPlacsp(id, estado, extra || {});
      Local.abierto = null;
      const msg = estado === 'aceptada' ? '✅ «' + obj.name + '» ya es cartera' : estado === 'descartada' ? '«' + obj.name + '» descartada' : '«' + obj.name + '» vuelve a pendientes';
      if (window.showNotification) window.showNotification(msg, estado === 'aceptada' ? 'success' : 'info');
      render();
    } catch (e) {
      if (window.showNotification) window.showNotification('No se pudo guardar: ' + (e.message || e), 'error');
    }
  }

  window.Screens = window.Screens || {};
  window.Screens.candidatos = { render: render, setTab: setTab, abrirAceptar: abrirAceptar, cerrarAceptar: cerrarAceptar, confirmarAceptar: confirmarAceptar, decidir: decidir, provinciaSugerida: provinciaSugerida };
})();
