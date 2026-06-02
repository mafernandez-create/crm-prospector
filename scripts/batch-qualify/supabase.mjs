// =========================================================================
// supabase.mjs — REST helpers para dual-write
// Port de supabaseBatchUpsert (gas-batch-qualify.gs:494) en Node.js.
//
// IMPORTANTE: este script corre en GH Actions (no browser), por lo que las
// nuevas Secret keys `sb_secret_*` SÍ son válidas aquí (Supabase no las
// rechaza como "browser" como sí hace con UrlFetchApp del GAS).
// =========================================================================

// Mismo FIELD_MAP que el GAS — debe mantenerse sincronizado
const FIELD_MAP = {
  priorityQuadrant: 'priority_quadrant',
  priorityQuadrantName: 'priority_quadrant_name',
  priorityDirect: 'priority_direct',
  priorityDirectScore: 'priority_direct_score',
  priorityNetwork: 'priority_network',
  priorityNetworkScore: 'priority_network_score',
  priorityDirectScoreNatural: 'priority_direct_score_natural',
  priorityNetworkScoreNatural: 'priority_network_score_natural',
  score: 'score',
  priority: 'priority',
  status: 'status',
  es_cliente_puente: 'es_cliente_puente',
  fuente_descubrimiento: 'fuente_descubrimiento',
};

// Columnas planas snake_case → camelCase del shape interno (inversa de FIELD_MAP
// para lectura). El resto vive en el JSONB `data`.
const READ_FLAT = [
  ['priority_quadrant', 'priorityQuadrant'],
  ['priority_quadrant_name', 'priorityQuadrantName'],
  ['priority_direct', 'priorityDirect'],
  ['priority_direct_score', 'priorityDirectScore'],
  ['priority_network', 'priorityNetwork'],
  ['priority_network_score', 'priorityNetworkScore'],
];

// Mapea una fila Supabase (columnas + JSONB data) al shape interno
// "Firestore-like" que consume buildScoringV2Updates (type/data/scoringHistory/…).
function rowToInternal(row) {
  const o = (row.data && typeof row.data === 'object') ? { ...row.data } : {};
  o.id = row.id;
  o.name = row.name;
  o.type = row.type;
  o.score = row.score;
  o.priority = row.priority;
  o.status = row.status;
  o.es_cliente_puente = row.es_cliente_puente === true;
  o.fuente_descubrimiento = row.fuente_descubrimiento || null;
  for (const [pg, js] of READ_FLAT) { if (row[pg] != null) o[js] = row[pg]; }
  o.data = (row.data && typeof row.data === 'object') ? row.data : {};
  return o;
}

/**
 * Lee de Supabase los studios SIN cuadrante (priority_quadrant IS NULL), filtrado
 * server-side. Paginado por offset. Supabase es la fuente de verdad; Firestore
 * (list endpoint) no puede filtrar por campo ausente, de ahí este lector.
 *
 * @param {number} offset
 * @param {number} limit
 * @returns {Promise<{studios: object[], nextOffset: number|null}>}
 */
export async function listStudiosNeedingQuadrant(offset, limit) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no definidos');
  const off = offset || 0;
  const lim = limit || 100;
  const q = `${url.replace(/\/$/, '')}/rest/v1/studios` +
    `?select=*&priority_quadrant=is.null&order=id.asc&offset=${off}&limit=${lim}`;
  const res = await fetch(q, { headers: { apikey: key, Authorization: 'Bearer ' + key } });
  if (!res.ok) throw new Error(`Supabase list HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const rows = await res.json();
  const studios = rows.map(rowToInternal);
  const nextOffset = studios.length === lim ? off + lim : null;
  return { studios, nextOffset };
}

/**
 * Lee de Supabase TODA la cartera (paginado por offset), para el recálculo
 * completo (FILTRO=todos / filtros por tipo). Supabase es la fuente de verdad:
 * la app escribe ahí los enriquecimientos, así que el scoring debe leer de aquí
 * (no de Firestore, que queda desactualizado).
 *
 * @param {number} offset
 * @param {number} limit
 * @returns {Promise<{studios: object[], nextOffset: number|null}>}
 */
export async function listAllStudios(offset, limit) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no definidos');
  const off = offset || 0;
  const lim = limit || 100;
  const q = `${url.replace(/\/$/, '')}/rest/v1/studios` +
    `?select=*&order=id.asc&offset=${off}&limit=${lim}`;
  const res = await fetch(q, { headers: { apikey: key, Authorization: 'Bearer ' + key } });
  if (!res.ok) throw new Error(`Supabase list HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const rows = await res.json();
  const studios = rows.map(rowToInternal);
  const nextOffset = studios.length === lim ? off + lim : null;
  return { studios, nextOffset };
}

/**
 * Upserta los updates en Supabase studios. Idempotente vía on_conflict=id.
 * No-op si SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no están definidos.
 *
 * @param {Array<{docId: string, updates: object}>} updatesArray
 * @returns {Promise<{written: number} | null>}
 */
export async function batchUpsert(updatesArray) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn('[supabase] SUPABASE_URL / KEY no definidos — dual-write skipped');
    return null;
  }
  if (!updatesArray || updatesArray.length === 0) return { written: 0 };

  const rows = updatesArray.map(item => {
    const row = { id: String(item.docId) };
    for (const k in item.updates) {
      if (FIELD_MAP[k]) {
        row[FIELD_MAP[k]] = item.updates[k];
      }
    }
    return row;
  });

  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/studios?on_conflict=id`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    throw new Error(`Supabase upsert HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return { written: rows.length };
}
