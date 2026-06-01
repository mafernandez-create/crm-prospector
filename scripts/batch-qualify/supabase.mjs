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
