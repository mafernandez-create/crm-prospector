#!/usr/bin/env node
// =========================================================================
// batch-qualify · entry point (port de handleBatchQualify de GAS a Node)
// Llamado por .github/workflows/batch-qualify-node.yml.
// Filtra studios, recalcula scoring v2, escribe cambios en Firestore +
// Supabase (dual-write). Idempotente: sólo escribe si cambia cuadrante o
// detecta candidato a puente nuevo.
// =========================================================================

// Firestore retirado por completo (2026-06): el batch lee y escribe SOLO en
// Supabase, incluido el checkpoint (meta_kv). Ya no depende de Firebase.
import { batchUpsert as supabaseBatchUpsert, listStudiosNeedingQuadrant, listAllStudios, saveCheckpoint } from './supabase.mjs';
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

  // v2.1: DRY_RUN = recalcula y reporta el IMPACTO sin escribir nada.
  const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

  log(`Batch Qualify Node · filtro=${FILTRO} · limite=${LIMITE}${DRY_RUN ? ' · DRY-RUN (sin escribir)' : ''}`);
  const t0 = Date.now();

  // Checkpoint inicial (no bloqueante, no en dry-run)
  if (!DRY_RUN) {
    await saveCheckpoint({
      trigger: TRIGGER,
      procesandose_por: 'github_actions_node',
      filtro: FILTRO,
      limite: LIMITE,
      status: 'running',
      startedAt: new Date().toISOString(),
    });
  }

  let pageToken = null;
  let processed = 0;
  let updated = 0;
  let nuevosCandidatosPuente = 0;
  let cambiosCuadrante = 0;
  const errors = [];
  let pendingSupabase = [];
  let lastIdProcessed = null;

  // v2.1: métricas de impacto (para dry-run y log normal)
  const transitions = {};                                   // "Qa → Qb" → conteo
  const confianzaCount = { alta: 0, media: 0, baja: 0 };
  let conEngagement = 0;
  const bajaList = [];                                      // estudios confianza baja (para exportar)

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

        // Métricas de impacto (siempre, también en dry-run)
        const oldQ = studio.priorityQuadrant != null ? studio.priorityQuadrant : 'sin';
        const newQ = v2updates.priorityQuadrant != null ? v2updates.priorityQuadrant : 'sin';
        if (String(oldQ) !== String(newQ)) {
          const k = `Q${oldQ} → Q${newQ}`;
          transitions[k] = (transitions[k] || 0) + 1;
        }
        if (confianzaCount[v2updates.scoringConfianza] != null) confianzaCount[v2updates.scoringConfianza]++;
        if (v2updates.engagementScore > 0) conEngagement++;
        if (v2updates.scoringConfianza === 'baja') {
          bajaList.push([studio.id, (studio.name || '').replace(/\|/g, '/'), getTipoPrincipal(studio),
            (studio.city || ''), (studio.province || '')].join('|'));
        }

        // Idempotencia
        if (cambiaCuadrante || nuevoCandidato || !studio.priorityQuadrant) {
          updated++;
          if (cambiaCuadrante) cambiosCuadrante++;
          if (nuevoCandidato) nuevosCandidatosPuente++;
          if (!DRY_RUN) pendingSupabase.push({ docId: studio.id, updates: v2updates });
        }

        // Flush por batches (solo Supabase, nunca en dry-run)
        if (!DRY_RUN && pendingSupabase.length >= WRITE_BATCH_SIZE) {
          try {
            await supabaseBatchUpsert(pendingSupabase);
          } catch (e) {
            errors.push(`supabase ${pendingSupabase.length}: ${e.message}`);
          }
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

  // Flush final (solo Supabase, nunca en dry-run)
  if (!DRY_RUN && pendingSupabase.length > 0) {
    try { await supabaseBatchUpsert(pendingSupabase); }
    catch (e) { errors.push(`flush supabase: ${e.message}`); }
  }

  const durationSec = Math.round((Date.now() - t0) / 1000);

  // Checkpoint final (no en dry-run)
  if (!DRY_RUN) {
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
  }

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
  log(`Resumen${DRY_RUN ? ' · DRY-RUN (no se escribió nada)' : ''}`);
  log('======================================');
  log(`Procesados:                ${processed}`);
  log(`${DRY_RUN ? 'Cambiarían' : 'Actualizados'}:              ${updated}`);
  log(`Cambios de cuadrante:      ${cambiosCuadrante}`);
  log(`Nuevos candidatos puente:  ${nuevosCandidatosPuente}`);
  log(`Errores:                   ${errors.length}`);
  log(`Duración:                  ${durationSec}s`);

  // v2.1: impacto detallado
  log('--- Confianza (completitud de datos) ---');
  log(`  alta=${confianzaCount.alta} · media=${confianzaCount.media} · baja=${confianzaCount.baja}  (baja = "datos insuficientes, revisar")`);
  log(`  Con engagement (>0):     ${conEngagement} de ${processed}`);
  const transKeys = Object.keys(transitions).sort((a, b) => transitions[b] - transitions[a]);
  log(`--- Transiciones de cuadrante (${transKeys.length} tipos) ---`);
  if (transKeys.length === 0) log('  (ninguna)');
  transKeys.slice(0, 25).forEach(k => log(`  ${k}: ${transitions[k]}`));

  // Volcado parseable de los estudios de confianza baja (solo en dry-run/export)
  if (DRY_RUN) {
    log(`--- BAJACONF list (${bajaList.length}) ---`);
    bajaList.forEach(l => log('BAJACONF ' + l));
  }
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
