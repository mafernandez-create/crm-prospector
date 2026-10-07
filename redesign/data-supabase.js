/* CRM Prospector · rediseño · Fase 1 — adaptador Supabase
 *
 * Implementa la MISMA interfaz que la capa Firestore en data.js:
 *   loadAll, getDoc, listCollection, patchDoc, getBriefingItems,
 *   savePlanificador.
 *
 * Backend único de la web del rediseño: data.js fuerza Supabase
 * (`_activeBackend()` devuelve 'supabase'; el flag 'firebase' quedó muerto al
 * retirar Firestore en 2026-06).
 *
 * Diseño:
 *   - Las pantallas siguen leyendo objetos con la forma "Firestore-like"
 *     (camelCase: priorityQuadrant, data.contact.email, …) por compatibilidad
 *     histórica. Por dentro, este adapter mapea entre el shape Postgres
 *     (snake_case + JSONB data) y el shape interno antes de devolverlo.
 *   - Escrituras: mapeo inverso (studios, meta_planificador, briefings).
 *
 * Endpoints REST de Supabase usados:
 *   GET    /rest/v1/studios?select=*&...filtros
 *   GET    /rest/v1/studios?id=eq.{id}&select=*
 *   PATCH  /rest/v1/studios?id=eq.{id}
 *   POST   /rest/v1/studios  (con Prefer: resolution=merge-duplicates para upsert)
 *   GET    /rest/v1/meta_planificador?id=eq.1
 *   PATCH  /rest/v1/meta_planificador?id=eq.1
 *   GET    /rest/v1/briefings?studio_id=eq.{id}&order=generated_at.desc&limit=N
 *   POST   /rest/v1/briefings
 */
(function () {
  'use strict';

  /* ============================================================
     CONFIG
     ============================================================ */
  const SUPABASE_URL = 'https://zmelqffrkwxkbzzutjrg.supabase.co';
  // Anon key — PÚBLICA, va al frontend igual que apiKey de Firebase
  const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
    '.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptZWxxZmZya3d4a2J6enV0anJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1Mjg2MzAsImV4cCI6MjA5NTEwNDYzMH0' +
    '.v1_Isxz6-mZtz_DJs3k6qoH9mV9FNW21Z94tiew9cQE';

  const REST_BASE = SUPABASE_URL + '/rest/v1';

  /* ============================================================
     MAPEOS Postgres ↔ interno (Firestore-like)
     ============================================================ */
  // Campos planos de la tabla studios que tienen equivalente camelCase
  // en el shape interno. El JSONB `data` contiene el resto.
  const STUDIO_FLAT_MAP = [
    ['priority_quadrant', 'priorityQuadrant'],
    ['priority_quadrant_name', 'priorityQuadrantName'],
    ['priority_direct', 'priorityDirect'],
    ['priority_direct_score', 'priorityDirectScore'],
    ['priority_network', 'priorityNetwork'],
    ['priority_network_score', 'priorityNetworkScore'],
    ['priority_direct_score_natural', 'priorityDirectScoreNatural'],
    ['priority_network_score_natural', 'priorityNetworkScoreNatural'],
    ['scoring_confianza', 'scoringConfianza'],   // v2.1: alta|media|baja
  ];

  function rowToInternal(row) {
    if (!row) return null;
    const o = {
      id: row.id,
      name: row.name,
      type: row.type,
      city: row.city,
      province: row.province,
      score: row.score,
      priority: row.priority,
      status: row.status,
      es_cliente_puente: row.es_cliente_puente === true,
      fuente_descubrimiento: row.fuente_descubrimiento || null,
    };
    // Campos del scoring v2 (snake → camel)
    for (const [pg, js] of STUDIO_FLAT_MAP) {
      if (row[pg] != null) o[js] = row[pg];
    }
    // Lo que vive en data JSONB se aplana en el objeto interno
    if (row.data && typeof row.data === 'object') {
      // Importante: NO sobreescribir los campos planos que ya vienen.
      // El JSONB data contiene cosas como contact, team, reports, activities,
      // projects, notes, comms, description, studio, etc.
      Object.assign(o, row.data);
      // Pero la mayoría del rediseño espera s.data.contact.email,
      // s.data.reports, etc. → para compatibilidad mantenemos también data:
      o.data = row.data;
    } else {
      o.data = {};
    }
    return o;
  }

  function internalToRow(obj) {
    // Inversa: separa campos planos del resto del data JSONB.
    // Solo incluimos las columnas que el caller envía explícitamente. Antes se
    // ponían score:null / es_cliente_puente:false / fuente_descubrimiento:null
    // por defecto, de modo que un patch parcial (cambiar estado, guardar un
    // informe → patch de data) BORRABA esos campos. Ahora un patch parcial solo
    // toca lo que trae.
    const row = { id: obj.id != null ? String(obj.id) : undefined };
    if ('name' in obj) row.name = obj.name;
    if ('type' in obj) row.type = Array.isArray(obj.type) ? obj.type[0] : obj.type;
    if ('city' in obj) row.city = (typeof obj.city === 'object' && obj.city && 'valor' in obj.city) ? obj.city.valor : obj.city;
    if ('province' in obj) row.province = (typeof obj.province === 'object' && obj.province && 'valor' in obj.province) ? obj.province.valor : obj.province;
    if ('score' in obj) row.score = typeof obj.score === 'number' ? obj.score : (parseInt(obj.score, 10) || null);
    if ('priority' in obj) row.priority = obj.priority;
    if ('status' in obj) row.status = obj.status;
    if ('es_cliente_puente' in obj) row.es_cliente_puente = obj.es_cliente_puente === true;
    if ('fuente_descubrimiento' in obj) row.fuente_descubrimiento = obj.fuente_descubrimiento || null;
    for (const [pg, js] of STUDIO_FLAT_MAP) {
      if (obj[js] != null) row[pg] = obj[js];
    }
    // JSONB data: SOLO se incluye si obj.data viene explícito.
    // Si el caller no manda data (ej. saveTopFields solo manda status/score),
    // NO incluimos data en el row — así el merge de Supabase no toca el campo
    // y no sobreescribe datos existentes con {}.
    // Escenario "studio entero": obj.data existe → se usa directamente.
    // Escenario "campos planos extra": data objeto vacío → se calcula.
    if ('data' in obj) {
      if (obj.data && typeof obj.data === 'object') {
        row.data = obj.data;
      } else {
        // data explícito pero no es objeto (raro) → vaciar sin perder la key
        row.data = {};
      }
    }
    // Si 'data' NO está en obj, row.data queda undefined → JSON.stringify lo omite
    // → Supabase merge-duplicates NO toca la columna data. ✓
    return row;
  }

  /* ============================================================
     HTTP helper — anon key + headers correctos
     ============================================================ */
  async function sbFetch(pathQ, opts) {
    opts = opts || {};
    // Bearer = access_token de sesión (rol authenticated) si hay login; si no,
    // cae a la anon key (con RLS exigiendo authenticated, esas peticiones serán
    // rechazadas → la verja de login en app.js garantiza sesión antes de leer/escribir).
    let bearer = SUPABASE_ANON_KEY;
    if (window.Auth && typeof window.Auth.getValidToken === 'function') {
      const tok = await window.Auth.getValidToken();
      if (tok) bearer = tok;
    }
    const headers = Object.assign({
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + bearer,
      'Accept-Profile': 'public',
    }, opts.headers || {});
    if (opts.method && opts.method !== 'GET') {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }
    const res = await fetch(REST_BASE + pathQ, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body,
    });
    if (!res.ok) {
      // 401 = JWT ausente/inválido/caducado (el RLS filtra con [] , no con 401):
      // la sesión ha muerto a mitad de uso → repintar la verja de login en vez
      // de dejar que el error crudo de Supabase acabe en un toast incomprensible.
      if (res.status === 401 && window.Auth && typeof window.Auth.expire === 'function') {
        window.Auth.expire();
        throw new Error('Sesión caducada. Vuelve a iniciar sesión.');
      }
      const txt = await res.text().catch(function () { return ''; });
      throw new Error('Supabase ' + res.status + ' ' + res.statusText + ' (' + pathQ + ') ' + txt.slice(0, 300));
    }
    return res;
  }

  /* GET autenticado para tablas auxiliares de solo lectura (atlas_municipios).
     Expone la sesión y los headers sin exponer sbFetch, que también escribe. */
  async function sbGet(pathQ) {
    const res = await sbFetch(pathQ, { method: 'GET' });
    return res.json();
  }

  /* Pagina todos los rows de una tabla con Range header.
     PostgREST limita por defecto a 1000 rows/req → iterar hasta vacío.
     Las páginas se piden de 3 en 3 EN PARALELO (antes iban una detrás de otra:
     con ~2.200 studios eran 3 viajes seguidos por la red del móvil). Si la
     última página de una tanda viene llena, se pide la siguiente tanda. */
  async function _fetchAllRows(pathQ, pageSize) {
    pageSize = pageSize || 1000;
    const PARALELO = 3;
    const out = [];
    let from = 0;
    while (true) {
      const tanda = [];
      for (let k = 0; k < PARALELO; k++) {
        const ini = from + k * pageSize;
        tanda.push(sbFetch(pathQ, {
          headers: { 'Range-Unit': 'items', 'Range': ini + '-' + (ini + pageSize - 1) },
        }).then(function (res) { return res.json(); }));
      }
      const lotes = await Promise.all(tanda);
      let fin = false;
      for (const batch of lotes) {
        if (!Array.isArray(batch) || batch.length === 0) { fin = true; break; }
        out.push.apply(out, batch);
        if (batch.length < pageSize) { fin = true; break; }
      }
      if (fin) break;
      from += PARALELO * pageSize;
      if (from > 50000) break;  // sanity guard
    }
    return out;
  }

  /* ============================================================
     Versión ligera de la cartera (vista studios_ligero)
     ============================================================
     La vista devuelve studios sin los .docx en base64 de data.reports[]
     (claves fileData/file/data) y deja en cada informe afectado "_bin": índice
     original. Era ~4,9 MB de binario que no se comprime al viajar y que la
     carga inicial no usa (solo acciones.js, que lo pide con getReportsCompletos).
     Migración: supabase/migrations/20261007160000_studios_ligero.sql.
     Si la vista no existe todavía, se cae a la tabla completa como antes. */
  const BIN_KEYS = ['fileData', 'file', 'data'];
  const ID_KEYS = ['iso_date', 'date', 'fileName', 'title', 'tipo_informe'];

  function _tieneBin(r) {
    return !!r && typeof r === 'object' && r._bin != null;
  }
  function _mismoInforme(a, b) {
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
    for (const k of ID_KEYS) {
      if ((a[k] == null ? null : String(a[k])) !== (b[k] == null ? null : String(b[k]))) return false;
    }
    return true;
  }
  function _binDe(r) {
    const o = {};
    if (!r || typeof r !== 'object') return o;
    for (const k of BIN_KEYS) if (typeof r[k] === 'string') o[k] = r[k];
    return o;
  }

  /* Antes de escribir data de un studio cargado en versión ligera, vuelve a
     poner los binarios que la vista quitó. Sin esto, guardar cualquier cosa
     de la ficha (una actividad, un contacto…) mandaría data.reports SIN los
     Word y los borraría de la base de datos. Si no puede casar un informe
     con su original, NO guarda: lanza un error (mejor no guardar que perder
     el adjunto). Devuelve una copia; no toca el objeto del State. */
  async function _restaurarBinarios(studioId, data) {
    const reps = data && Array.isArray(data.reports) ? data.reports : null;
    if (!reps || !reps.some(_tieneBin)) return data;
    const r = await sbFetch('/studios?id=eq.' + encodeURIComponent(studioId) + '&select=reports:data->reports');
    const arr = await r.json();
    const dbReps = (arr[0] && Array.isArray(arr[0].reports)) ? arr[0].reports : [];
    const usados = new Set();
    const nuevos = reps.map(function (rep) {
      if (!_tieneBin(rep)) return rep;
      const copia = Object.assign({}, rep);
      delete copia._bin;
      let idx = -1;
      const i = parseInt(rep._bin, 10);
      // Mismo número de informes que en la BD → no se ha añadido ni quitado
      // ninguno y la posición manda (así se puede editar el título o la fecha
      // de un informe sin perder su Word). Si el número cambia, hay que casar
      // por identidad.
      const mismaLongitud = dbReps.length === reps.length;
      if (i >= 0 && i < dbReps.length && (mismaLongitud || _mismoInforme(dbReps[i], rep))) idx = i;
      if (idx < 0) {
        idx = dbReps.findIndex(function (d, j) {
          return !usados.has(j) && _mismoInforme(d, rep) && Object.keys(_binDe(d)).length > 0;
        });
      }
      if (idx < 0) {
        // ¿Hay algún informe en la BD con binario que no esté ya en la lista?
        // Si no lo hay, no hay nada que perder y se guarda sin más.
        const quedanBins = dbReps.some(function (d, j) { return !usados.has(j) && Object.keys(_binDe(d)).length > 0; });
        if (!quedanBins) return copia;
        throw new Error('No se ha guardado: no se pudo conservar el Word adjunto de un informe (' +
          (rep.date || rep.iso_date || rep.title || '?') + '). Recarga la página y vuelve a intentarlo.');
      }
      usados.add(idx);
      return Object.assign(copia, _binDe(dbReps[idx]));
    });
    return Object.assign({}, data, { reports: nuevos });
  }

  /* Informes completos (con binarios) de varios studios, para acciones.js.
     Devuelve { [studioId]: reports[] }. Pide de 50 en 50 ids. */
  async function getReportsCompletos(ids) {
    const out = {};
    const lista = Array.from(new Set((ids || []).map(String)));
    for (let i = 0; i < lista.length; i += 50) {
      const trozo = lista.slice(i, i + 50).map(function (id) { return '"' + id.replace(/"/g, '') + '"'; }).join(',');
      const r = await sbFetch('/studios?id=in.(' + encodeURIComponent(trozo) + ')&select=id,reports:data->reports');
      const arr = await r.json();
      (arr || []).forEach(function (row) { out[String(row.id)] = Array.isArray(row.reports) ? row.reports : []; });
    }
    return out;
  }

  /* ============================================================
     loadAll — equivalente al de data.js pero contra Supabase
     ============================================================ */
  async function loadAll() {
    const t0 = Date.now();
    const [rows, planRes] = await Promise.all([
      _fetchAllRows('/studios_ligero?select=*').catch(function (e) {
        // Vista aún no creada (migración sin aplicar) → tabla completa, como antes.
        console.warn('[redesign/data-supabase] studios_ligero no disponible, cargo studios completo: ' + e.message);
        return _fetchAllRows('/studios?select=*');
      }),
      sbFetch('/meta_planificador?id=eq.1&select=schedule,updated_at').catch(function () { return null; }),
    ]);
    const studios = rows.map(rowToInternal);
    let planificador = null;
    if (planRes) {
      const pj = await planRes.json();
      if (pj && pj[0]) planificador = { schedule: pj[0].schedule || {} };
    }
    console.info('[redesign/data-supabase] cartera cargada: ' + studios.length + ' studios · ' + (Date.now() - t0) + 'ms');
    return { studios: studios, planificador: planificador };
  }

  /* ============================================================
     getDoc — emula la API de Firestore: getDoc('studios/{id}')
     ============================================================ */
  async function getDoc(path) {
    const parts = path.split('/');
    if (parts[0] === 'studios' && parts[1] && parts.length === 2) {
      const r = await sbFetch('/studios?id=eq.' + encodeURIComponent(parts[1]) + '&select=*');
      const arr = await r.json();
      return rowToInternal(arr[0]);
    }
    if (parts[0] === '_meta' && parts[1] === 'planificador') {
      const r = await sbFetch('/meta_planificador?id=eq.1&select=schedule,updated_at');
      const arr = await r.json();
      return arr[0] ? { schedule: arr[0].schedule || {} } : null;
    }
    if (parts[0] === '_meta' && parts[1]) {
      const r = await sbFetch('/meta_kv?key=eq.' + encodeURIComponent(parts[1]) + '&select=value');
      const arr = await r.json();
      return arr[0] ? arr[0].value : null;
    }
    throw new Error('Supabase getDoc no soporta path: ' + path);
  }

  /* ============================================================
     listCollection — emula listado de Firestore
     ============================================================ */
  async function listCollection(name, opts) {
    opts = opts || {};
    const limit = opts.limit || 5000;
    if (name === 'studios') {
      // Usar paginación para superar el límite de 1000 de PostgREST
      const rows = await _fetchAllRows('/studios?select=*');
      return rows.slice(0, limit).map(rowToInternal);
    }
    if (/^briefings\/[^/]+\/items$/.test(name)) {
      const studioId = name.split('/')[1];
      const r = await sbFetch('/briefings?studio_id=eq.' + encodeURIComponent(studioId) +
        '&select=*&order=generated_at.desc&limit=' + Math.min(limit, 1000));
      const arr = await r.json();
      return arr.map(function (b) {
        return Object.assign({}, b, { id: b.iso_date });
      });
    }
    throw new Error('Supabase listCollection no soporta: ' + name);
  }

  /* ============================================================
     archivarVisitas — histórico que el schedule no guarda
     ============================================================ */
  // Se llama en segundo plano: si falla, el guardado del planificador NO debe
  // fallar con ella. Las entradas marcadas `reserva` se omiten — son clientes
  // de reserva y notas de logística (pernoctas, regresos), no visitas.
  function visitasDeSchedule(schedule) {
    const filas = [];
    Object.keys(schedule || {}).forEach(function (fecha) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return;
      const dia = schedule[fecha];
      if (!Array.isArray(dia)) return;
      dia.forEach(function (v) {
        if (!v || v.reserva === true) return;
        const nombre = String(v.name || '').trim();
        if (!nombre) return;
        filas.push({
          fecha: fecha,
          studio_id: v.id || null,
          empresa: nombre,
          ruta: v.province ? 'Planificador · ' + v.province : null,
        });
      });
    });
    return filas;
  }

  function archivarVisitas(schedule) {
    try {
      const filas = visitasDeSchedule(schedule);
      if (!filas.length) return Promise.resolve(0);
      return sbFetch('/rpc/archivar_visitas', {
        method: 'POST',
        body: JSON.stringify({ p: filas }),
      }).then(function (res) { return res.json(); })
        .then(function (n) {
          if (n) console.info('[visitas] ' + n + ' visita(s) nuevas al histórico');
          return n;
        })
        .catch(function (e) {
          console.warn('[visitas] no se pudo archivar el histórico:', e && e.message);
          return 0;
        });
    } catch (e) {
      console.warn('[visitas] no se pudo archivar el histórico:', e && e.message);
      return Promise.resolve(0);
    }
  }

  /* ============================================================
     Cierre de semana — visitas de una semana y resumen semanal
     ============================================================ */
  async function listVisitasSemana(lunesISO, domingoISO) {
    const r = await sbFetch('/visitas?fecha=gte.' + lunesISO + '&fecha=lte.' + domingoISO +
      '&estado=neq.anulada&select=*&order=fecha.asc,id.asc');
    return r.json();
  }
  /* Visitas no anuladas de unos estudios entre dos fechas (exclusiva la primera):
     el cierre de semana las usa para no asignar a una visita el informe de la
     siguiente del mismo estudio. */
  async function listVisitasPosteriores(desdeExclusivoISO, hastaISO, studioIds) {
    if (!studioIds || !studioIds.length) return [];
    const inList = studioIds.map(function (id) { return '"' + String(id).replace(/"/g, '') + '"'; }).join(',');
    const r = await sbFetch('/visitas?fecha=gt.' + desdeExclusivoISO + '&fecha=lte.' + hastaISO +
      '&estado=neq.anulada&studio_id=in.(' + inList + ')&select=id,studio_id,fecha,estado&order=fecha.asc');
    return r.json();
  }
  async function updateVisita(id, patch) {
    const r = await sbFetch('/visitas?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify(Object.assign({}, patch, { updated_at: new Date().toISOString() })),
    });
    const arr = await r.json();
    return arr[0] || null;
  }
  async function getResumenSemanal(lunesISO) {
    const r = await sbFetch('/resumenes_semanales?semana=eq.' + lunesISO + '&select=*');
    const arr = await r.json();
    return arr[0] || null;
  }
  async function saveResumenSemanal(row) {
    const r = await sbFetch('/resumenes_semanales', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(Object.assign({}, row, { updated_at: new Date().toISOString() })),
    });
    const arr = await r.json();
    return arr[0] || null;
  }

  /* ============================================================
     patchDoc — UPSERT
     ============================================================ */
  async function patchDoc(path, obj /*, opts */) {
    const parts = path.split('/');

    // studios/{id}
    if (parts[0] === 'studios' && parts[1] && parts.length === 2) {
      const row = internalToRow(Object.assign({ id: parts[1] }, obj));
      if (row.data) row.data = await _restaurarBinarios(parts[1], row.data);
      const r = await sbFetch('/studios?on_conflict=id', {
        method: 'POST',
        headers: {
          'Prefer': 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify([row]),
      });
      const arr = await r.json();
      return rowToInternal(arr[0]);
    }

    // _meta/planificador
    if (parts[0] === '_meta' && parts[1] === 'planificador') {
      const body = {
        schedule: obj.schedule || {},
        updated_at: new Date().toISOString(),
      };
      const r = await sbFetch('/meta_planificador?id=eq.1', {
        method: 'PATCH',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(body),
      });
      const arr = await r.json();
      // El schedule se reescribe entero en cada guardado, así que no sirve de
      // historia: al replanificar, las semanas viejas desaparecen. Por eso cada
      // guardado vuelca además las visitas a la tabla `visitas`, que solo añade.
      // Sin esto, "¿qué visitas no tienen informe?" no se puede contestar desde
      // el CRM: el único rastro de una reunión sería su informe.
      archivarVisitas(body.schedule);
      return arr[0] ? { schedule: arr[0].schedule || {} } : null;
    }

    // _meta/* genérico → meta_kv
    if (parts[0] === '_meta' && parts[1] && parts.length === 2) {
      const body = { key: parts[1], value: obj, updated_at: new Date().toISOString() };
      const r = await sbFetch('/meta_kv?on_conflict=key', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify([body]),
      });
      const arr = await r.json();
      return arr[0] ? arr[0].value : null;
    }

    // briefings/{studioId}/items/{iso}
    const briefMatch = path.match(/^briefings\/([^/]+)\/items\/(.+)$/);
    if (briefMatch) {
      const studioId = briefMatch[1];
      const isoDate = briefMatch[2];
      const body = {
        studio_id: studioId,
        iso_date: isoDate,
        fecha_visita: obj.fecha_visita || null,
        briefing: obj.briefing || null,
        markdown: obj.markdown || null,
        formato: obj.formato || (obj.markdown ? 'markdown_v2' : 'json_v1'),
        contexto_extra: obj.contexto_extra || null,
        studio_snapshot: obj.studio_snapshot || null,
        generated_at: obj.generated_at || new Date().toISOString(),
      };
      const r = await sbFetch('/briefings?on_conflict=studio_id,iso_date', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify([body]),
      });
      const arr = await r.json();
      return arr[0] || null;
    }

    // studios/{id}/reports/{iso} — en Supabase NO hay tabla aparte; los
    // metemos en data.reports[] del studio. Append append-only.
    const reportMatch = path.match(/^studios\/([^/]+)\/reports\/(.+)$/);
    if (reportMatch) {
      const studioId = reportMatch[1];
      const isoDate = reportMatch[2];
      // Lee studio actual
      const cur = await getDoc('studios/' + studioId);
      const reports = (cur && cur.data && cur.data.reports) || [];
      // Append (o reemplaza si ya hay uno con el mismo iso)
      const idx = reports.findIndex(function (r) { return r.iso_date === isoDate; });
      const reportEntry = Object.assign({ iso_date: isoDate }, obj);
      if (idx >= 0) reports[idx] = reportEntry;
      else reports.push(reportEntry);
      // Re-escribe el studio
      const newData = Object.assign({}, cur && cur.data ? cur.data : {}, { reports: reports });
      return patchDoc('studios/' + studioId, { data: newData });
    }

    throw new Error('Supabase patchDoc no soporta path: ' + path);
  }

  /* ============================================================
     Atajos
     ============================================================ */
  async function getBriefingItems(studioId, limit) {
    return listCollection('briefings/' + studioId + '/items', { limit: limit || 10 });
  }
  async function savePlanificador(schedule) {
    return patchDoc('_meta/planificador', { schedule: schedule || {} });
  }

  /* ============================================================
     Export
     ============================================================ */
  async function deleteDoc(path) {
    const parts = path.split('/');
    if (parts[0] === 'studios' && parts[1] && parts.length === 2) {
      const r = await sbFetch('/studios?id=eq.' + encodeURIComponent(parts[1]), {
        method: 'DELETE',
        headers: { 'Prefer': 'return=minimal' },
      });
      if (!r.ok) {
        const txt = await r.text().catch(function () { return ''; });
        throw new Error('Supabase DELETE ' + r.status + ' ' + txt.slice(0, 200));
      }
      return true;
    }
    throw new Error('deleteDoc: ruta no soportada: ' + path);
  }

  /* Registro interno de auditoría de informes. La PRESENCIA de la fila marca el
     informe; no se escribe nada en el documento del studio. Solo INSERT (return
     minimal); la tabla no tiene policy de SELECT, así que la app nunca la lee. */
  async function flagReportAudit(rid, sid) {
    if (!rid) return false;
    try {
      await sbFetch('/report_audit', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ rid: String(rid), sid: sid != null ? String(sid) : null }),
      });
      return true;
    } catch (e) {
      // Silencioso: no debe afectar al guardado del informe ni dejar rastro visible.
      return false;
    }
  }

  window.DataSupabase = {
    SUPABASE_URL: SUPABASE_URL,
    REST_BASE: REST_BASE,
    sbGet: sbGet,
    loadAll: loadAll,
    getDoc: getDoc,
    listCollection: listCollection,
    patchDoc: patchDoc,
    deleteDoc: deleteDoc,
    getBriefingItems: getBriefingItems,
    savePlanificador: savePlanificador,
    flagReportAudit: flagReportAudit,
    getReportsCompletos: getReportsCompletos,
    _restaurarBinarios: _restaurarBinarios,
    listVisitasSemana: listVisitasSemana,
    updateVisita: updateVisita,
    listVisitasPosteriores: listVisitasPosteriores,
    getResumenSemanal: getResumenSemanal,
    saveResumenSemanal: saveResumenSemanal,
    // Helpers para tests / debugging
    visitasDeSchedule: visitasDeSchedule,
    rowToInternal: rowToInternal,
    internalToRow: internalToRow,
  };
})();
