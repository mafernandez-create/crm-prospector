#!/usr/bin/env node
// =========================================================================
// batch-qualify · entry point (port de handleBatchQualify de GAS a Node)
// Llamado por .github/workflows/batch-qualify-node.yml.
// Filtra studios, recalcula scoring v2, escribe cambios en Firestore +
// Supabase (dual-write). Idempotente: sólo escribe si cambia cuadrante o
// detecta candidato a puente nuevo.
// =========================================================================

import { batchPatch, saveCheckpoint } from './firestore.mjs';
import { batchUpsert as supabaseBatchUpsert, listStudiosNeedingQuadrant, listAllStudios } from './supabase.mjs';
import { buildScoringV2Updates, getTipoPrincipal } from './scoring.mjs';

const FILTRO = process.env.FILTRO || 'sin_cuadrante';
const LIMITE = parseInt(process.env.LIMITE || '200', 10);
const TRIGGER = 'github_actions_node';
const PAGE_SIZE = 100;
const WRITE_BATCH_SIZE = 100;
const MAX_DURATION_MS = 50 * 60 * 1000; // 50 min (timeout workflow 60)

const validFiltros = new Set(['sin_cuadrante', 'todos', 'ARQ', 'ING', 'OCV', 'AAPP', 'CCRR', 'CICA']);

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

async function main() {
  if (!validFiltros.has(FILTRO)) {
    throw new Error(`FILTRO inválido: ${FILTRO}. Permitidos: ${[...validFiltros].join(', ')}`);
  }

  log(`Batch Qualify Node · filtro=${FILTRO} · limite=${LIMITE}`);
  const t0 = Date.now();

  // Checkpoint inicial (no bloqueante)
  await saveCheckpoint({
    trigger: TRIGGER,
    procesandose_por: 'github_actions_node',
    filtro: FILTRO,
    limite: LIMITE,
    status: 'running',
    startedAt: new Date().toISOString(),
  });

  let pageToken = null;
  let processed = 0;
  let updated = 0;
  let nuevosCandidatosPuente = 0;
  let cambiosCuadrante = 0;
  const errors = [];
  let pendingFirestore = [];
  let pendingSupabase = [];
  let lastIdProcessed = null;

  while (processed < LIMITE) {
    if (Date.now() - t0 > MAX_DURATION_MS) {
      log('Timeout próximo, deteniendo paginación.');
      break;
    }

    let page;
    try {
      // Todo se lee de Supabase (fuente de verdad). sin_cuadrante filtra
      // server-side por priority_quadrant IS NULL; el resto (todos / por tipo)
      // lee la cartera completa. El filtro por tipo se aplica abajo (client-side).
      const off = pageToken ? parseInt(pageToken, 10) : 0;
      const pageLim = Math.min(PAGE_SIZE, LIMITE - processed);
      const r = FILTRO === 'sin_cuadrante'
        ? await listStudiosNeedingQuadrant(off, pageLim)
        : await listAllStudios(off, pageLim);
      page = { studios: r.studios, nextPageToken: r.nextOffset != null ? String(r.nextOffset) : null };
    } catch (e) {
      errors.push(`list page: ${e.message}`);
      break;
    }

    for (const studio of page.studios) {
      if (processed >= LIMITE) break;
      processed++;
      lastIdProcessed = studio.id;

      // Filtros
      if (FILTRO === 'sin_cuadrante' && studio.priorityQuadrant) continue;
      if (['ARQ','ING','OCV','AAPP','CCRR','CICA'].includes(FILTRO)) {
        if (getTipoPrincipal(studio) !== FILTRO) continue;
      }

      try {
        const v2updates = buildScoringV2Updates(studio, TRIGGER);
        const cambiaCuadrante = (studio.priorityQuadrant || null) !== (v2updates.priorityQuadrant || null);
        const nuevoCandidato = !studio.es_candidato_puente && v2updates.es_candidato_puente === true;

        // Idempotencia
        if (cambiaCuadrante || nuevoCandidato || !studio.priorityQuadrant) {
          pendingFirestore.push({ docId: studio.id, updates: v2updates });
          pendingSupabase.push({ docId: studio.id, updates: v2updates });
          updated++;
          if (cambiaCuadrante) cambiosCuadrante++;
          if (nuevoCandidato) nuevosCandidatosPuente++;
        }

        // Flush por batches
        if (pendingFirestore.length >= WRITE_BATCH_SIZE) {
          try {
            await batchPatch(pendingFirestore);
          } catch (e) {
            errors.push(`batchPatch ${pendingFirestore.length}: ${e.message}`);
          }
          try {
            await supabaseBatchUpsert(pendingSupabase);
          } catch (e) {
            errors.push(`supabase ${pendingSupabase.length}: ${e.message}`);
          }
          pendingFirestore = [];
          pendingSupabase = [];

          await saveCheckpoint({
            trigger: TRIGGER,
            procesandose_por: 'github_actions_node',
            processed,
            updated,
            lastId: String(lastIdProcessed || ''),
            updatedAt: new Date().toISOString(),
          });
        }
      } catch (e) {
        errors.push(`studio ${studio.id}: ${e.message}`);
      }
    }

    if (!page.nextPageToken) break;
    pageToken = page.nextPageToken;
  }

  // Flush final
  if (pendingFirestore.length > 0) {
    try { await batchPatch(pendingFirestore); }
    catch (e) { errors.push(`flush firestore: ${e.message}`); }
  }
  if (pendingSupabase.length > 0) {
    try { await supabaseBatchUpsert(pendingSupabase); }
    catch (e) { errors.push(`flush supabase: ${e.message}`); }
  }

  const durationSec = Math.round((Date.now() - t0) / 1000);

  // Checkpoint final
  await saveCheckpoint({
    trigger: TRIGGER,
    procesandose_por: null,
    filtro: FILTRO,
    limite: LIMITE,
    processed,
    updated,
    cambiosCuadrante,
    nuevosCandidatosPuente,
    lastId: String(lastIdProcessed || ''),
    status: 'done',
    finishedAt: new Date().toISOString(),
    durationSec,
    errorsCount: errors.length,
  });

  const summary = {
    success: errors.length === 0,
    processed,
    updated,
    cambiosCuadrante,
    nuevosCandidatosPuente,
    errors: errors.slice(0, 10),
    durationSec,
  };

  log('======================================');
  log('Resumen');
  log('======================================');
  log(`Procesados:                ${processed}`);
  log(`Actualizados:              ${updated}`);
  log(`Cambios de cuadrante:      ${cambiosCuadrante}`);
  log(`Nuevos candidatos puente:  ${nuevosCandidatosPuente}`);
  log(`Errores:                   ${errors.length}`);
  log(`Duración:                  ${durationSec}s`);
  if (errors.length > 0) {
    log('Primeros errores:');
    errors.slice(0, 5).forEach(e => log(`  - ${e}`));
  }

  // GitHub Actions summary
  if (process.env.GITHUB_STEP_SUMMARY) {
    const fs = await import('node:fs/promises');
    const md = [
      `# Batch Qualify Node — ${new Date().toISOString()}`,
      '',
      `| Métrica | Valor |`,
      `|---|---|`,
      `| Procesados | ${processed} |`,
      `| Actualizados | ${updated} |`,
      `| Cambios de cuadrante | ${cambiosCuadrante} |`,
      `| Nuevos candidatos puente | ${nuevosCandidatosPuente} |`,
      `| Errores | ${errors.length} |`,
      `| Duración | ${durationSec}s |`,
      `| Filtro | ${FILTRO} |`,
      `| Límite | ${LIMITE} |`,
      '',
    ];
    if (errors.length > 0) {
      md.push('## Errores (primeros 10)');
      md.push('');
      errors.slice(0, 10).forEach(e => md.push(`- ${e}`));
    }
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, md.join('\n') + '\n');
  }

  // Exit non-zero si todos los writes fallaron
  if (errors.length > 0 && updated === 0 && processed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Batch qualify falló:', err);
  process.exit(1);
});
