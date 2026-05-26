/* CRM Prospector · rediseño v1 — Motor de Acciones Pendientes
 *
 * Detecta compromisos adquiridos en los informes de visita (.docx).
 * Portado del legacy (index-legacy.html §28000-28060).
 *
 * Requiere JSZip en window (para descomprimir .docx).
 * Exporta window.AccionesEngine.
 */
(function () {
  'use strict';

  var _CACHE_KEY       = 'crm_acciones_pendientes_v1';
  var _DESCARTADAS_KEY = 'crm_acciones_descartadas';
  var _TTL_MS          = 24 * 60 * 60 * 1000;

  /* Patrones de detección por tipo de acción */
  var _TIPOS = {
    llamada:  { icon: '📱', detectRe: /\b(?:llamar(?:\s+(?:en|a|al))?|hacer\s+(?:una\s+)?llamada|contactar\s+(?:telef[óo]nicamente|por\s+tel[ée]fono)|seguimiento\s+telef[óo]nico)\b[\s\S]{0,100}/gi },
    email:    { icon: '📧', detectRe: /\b(?:enviar|env[íi]o\s+de|mandar|remitir|hacer\s+llegar|adjuntar)\s+(?:el\s+|la\s+|los\s+|las\s+|un\s+|una\s+)?(?:cat[áa]logo|documentaci[óo]n(?:\s+t[ée]cnica)?|presupuesto|info(?:rmaci[óo]n)?|propuesta(?:\s+t[ée]cnica)?|email|correo|mail|fichas?(?:\s+t[ée]cnicas?)?|certificad[oa]s?|archivo|presto|familias?\s+BIM|caso\s+de\s+[ée]xito|DAP|estudio\s+comparativo|memoria\s+t[ée]cnica)\b[\s\S]{0,150}/gi },
    material: { icon: '📦', detectRe: /\b(?:entregar|llevar|dejar|hacer\s+llegar)\s+(?:la\s+|el\s+|las\s+|los\s+|una\s+|un\s+)?(?:muestra|prototipo|material|piezas?\s+f[íi]sicas?|tubo|muestrario)\b[\s\S]{0,150}/gi },
    reunion:  { icon: '📅', detectRe: /\b(?:concertar|agendar|cerrar|programar|fijar|organizar)\s+(?:una\s+|la\s+|otra\s+|nueva\s+)?(?:reuni[óo]n|visita|cita|llamada\s+t[ée]cnica|prueba|encuentro|sesi[óo]n)\b[\s\S]{0,150}/gi },
  };

  /* Extrae texto plano de un .docx en base64 usando JSZip */
  async function _extractDocxText(b64) {
    if (!b64 || typeof b64 !== 'string') return '';
    var c = b64.indexOf(',');
    if (b64.startsWith('data:') && c > 0) b64 = b64.slice(c + 1);
    b64 = b64.replace(/\s/g, '');
    if (b64.length < 1000) return '';
    try {
      var binStr = atob(b64);
      var bytes = new Uint8Array(binStr.length);
      for (var i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
      if (typeof JSZip === 'undefined') return '';
      var zip = await JSZip.loadAsync(bytes);
      var file = zip.file('word/document.xml');
      if (!file) return '';
      var xml = await file.async('string');
      return xml.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
    } catch (e) { return ''; }
  }

  /* Detecta plazo en texto (urgente/horas/días/semanas/fecha explícita) */
  function _detectarPlazo(texto, baseDate) {
    var base = baseDate ? new Date(baseDate + (baseDate.length === 10 ? 'T00:00:00Z' : '')) : new Date();
    if (isNaN(base.getTime())) return { plazoTexto: null, fechaLimite: null };
    var t = texto.toLowerCase();
    var toISO = function (d) { return d.toISOString().slice(0, 10); };
    var addDays = function (d, n) { var x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };
    if (/\b(inmediato|urgente|cuanto antes|asap)\b/i.test(t))
      return { plazoTexto: 'urgente (24h)', fechaLimite: toISO(addDays(base, 1)) };
    var horasM = t.match(/(\d{1,3})(?:\s*-\s*\d{1,3})?\s*h(?:oras?)?\b/);
    if (horasM) {
      var x2 = new Date(base); x2.setUTCHours(x2.getUTCHours() + parseInt(horasM[1]));
      return { plazoTexto: horasM[0].trim(), fechaLimite: toISO(x2) };
    }
    var diasM = t.match(/(\d{1,2})(?:\s*-\s*\d{1,2})?\s*d(?:[íi]as?)?\b/);
    if (diasM) return { plazoTexto: diasM[0].trim(), fechaLimite: toISO(addDays(base, parseInt(diasM[1]))) };
    var semM = t.match(/(\d{1,2})\s*semanas?\b/);
    if (semM) return { plazoTexto: semM[0], fechaLimite: toISO(addDays(base, parseInt(semM[1]) * 7)) };
    if (/\b(una|1)\s+semana\b/i.test(t)) return { plazoTexto: '1 semana', fechaLimite: toISO(addDays(base, 7)) };
    var meses = { enero:0,febrero:1,marzo:2,abril:3,mayo:4,junio:5,julio:6,agosto:7,septiembre:8,octubre:9,noviembre:10,diciembre:11 };
    var fm = texto.match(/(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s+de\s+(\d{4}))?/i);
    if (fm) {
      var d2 = parseInt(fm[1]), mes = meses[fm[2].toLowerCase()];
      var yr = fm[3] ? parseInt(fm[3]) : base.getUTCFullYear();
      var fo = new Date(Date.UTC(yr, mes, d2));
      if (!fm[3] && fo < base) fo = new Date(Date.UTC(yr + 1, mes, d2));
      return { plazoTexto: fm[0], fechaLimite: toISO(fo) };
    }
    return { plazoTexto: null, fechaLimite: null };
  }

  function _hash(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return Math.abs(h).toString(36);
  }

  function _getDescartadas() {
    try { return JSON.parse(localStorage.getItem(_DESCARTADAS_KEY) || '{}'); } catch (e) { return {}; }
  }
  function _descartar(id) {
    var m = _getDescartadas(); m[id] = { ts: Date.now() };
    localStorage.setItem(_DESCARTADAS_KEY, JSON.stringify(m));
  }

  /* Procesa todos los studios y devuelve array de acciones detectadas */
  async function procesarTodos(studios) {
    var items = [];
    for (var si = 0; si < studios.length; si++) {
      var studio = studios[si];
      var reports = studio.data && Array.isArray(studio.data.reports) ? studio.data.reports : [];
      for (var ri = 0; ri < reports.length; ri++) {
        var rep = reports[ri];
        var bin = rep.fileData || rep.data;
        if (!bin || bin.length < 1000) continue;
        var text = await _extractDocxText(bin);
        if (!text || text.length < 100) continue;
        var fechaReport = (rep.date || '').substring(0, 10);
        for (var tipo in _TIPOS) {
          var def = _TIPOS[tipo];
          var re = new RegExp(def.detectRe.source, def.detectRe.flags);
          var m, vistos = new Set();
          while ((m = re.exec(text)) !== null) {
            var matchText = m[0].trim();
            if (matchText.length < 20 || matchText.length > 400) continue;
            var key = matchText.slice(0, 60).toLowerCase();
            if (vistos.has(key)) continue;
            vistos.add(key);
            var start = Math.max(0, m.index - 30);
            var end = Math.min(text.length, m.index + matchText.length);
            var contexto = text.slice(start, end).replace(/\s+/g, ' ').trim();
            var plazo = _detectarPlazo(contexto, fechaReport);
            var id = _hash(studio.id + '|' + fechaReport + '|' + tipo + '|' + key);
            var prov = studio.province;
            if (prov && typeof prov === 'object') prov = prov.valor || '';
            items.push({
              id: id,
              studioId: String(studio.id),
              studioName: studio.name || '',
              studioProvince: prov || '',
              tipo: tipo,
              tipoIcon: def.icon,
              descripcion: contexto.length > 280 ? contexto.slice(0, 280) + '…' : contexto,
              plazoTexto: plazo.plazoTexto,
              fechaLimite: plazo.fechaLimite,
              fechaInforme: fechaReport,
            });
          }
        }
      }
    }
    // Deduplicar
    var seen = new Set();
    var dedup = items.filter(function (it) {
      return seen.has(it.id) ? false : (seen.add(it.id), true);
    });
    // Ordenar por fechaLimite asc, luego fechaInforme desc
    dedup.sort(function (a, b) {
      if (a.fechaLimite && b.fechaLimite) return a.fechaLimite.localeCompare(b.fechaLimite);
      if (a.fechaLimite) return -1;
      if (b.fechaLimite) return 1;
      return (b.fechaInforme || '').localeCompare(a.fechaInforme || '');
    });
    return dedup;
  }

  /* Carga acciones con caché localStorage (TTL 24h) */
  async function cargarAcciones(studios, force) {
    if (!force) {
      try {
        var raw = localStorage.getItem(_CACHE_KEY);
        if (raw) {
          var j = JSON.parse(raw);
          if (j.ts && (Date.now() - j.ts) < _TTL_MS) return j.items || [];
        }
      } catch (e) {}
    }
    var items = await procesarTodos(studios);
    try { localStorage.setItem(_CACHE_KEY, JSON.stringify({ ts: Date.now(), items: items })); } catch (e) {}
    return items;
  }

  /* Filtra las descartadas y las ya aceptadas (por activities en studios) */
  function filtrarVigentes(items, studios) {
    var desc = _getDescartadas();
    // Recoger IDs de actividades aceptadas
    var aceptadasIds = new Set();
    if (Array.isArray(studios)) {
      studios.forEach(function (s) {
        var acts = s.data && Array.isArray(s.data.activities) ? s.data.activities : [];
        acts.forEach(function (a) { if (a.accionDetectadaId) aceptadasIds.add(a.accionDetectadaId); });
      });
    }
    return items.filter(function (it) { return !desc[it.id] && !aceptadasIds.has(it.id); });
  }

  /* Invalida la caché manualmente */
  function invalidarCache() {
    try { localStorage.removeItem(_CACHE_KEY); } catch (e) {}
  }

  window.AccionesEngine = {
    cargarAcciones: cargarAcciones,
    procesarTodos: procesarTodos,
    filtrarVigentes: filtrarVigentes,
    descartar: _descartar,
    invalidarCache: invalidarCache,
  };
})();
