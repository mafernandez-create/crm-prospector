#!/usr/bin/env node
/* eslint-disable */
// ──────────────────────────────────────────────────────────────────────
// PLACSP Freshness Check — vigila que la ingesta PLACSP no se "muera en silencio"
//
// Contexto: fetchAtom() hace soft-skip (sale en verde) cuando el servidor del
// Estado (contrataciondelestado.es) bloquea/agota las IPs de los runners de
// GitHub. Eso evita el ruido del rojo diario, PERO si el bloqueo persiste,
// PLACSP dejaría de ingerir adjudicaciones sin que nadie se entere.
//
// Esta comprobación lee el heartbeat meta_kv['placsp_last_success'] (que
// placsp-fetch.js refresca en cada ingesta exitosa) y:
//   · si falta            → lo siembra UNA vez con ts=now (bootstrap), sin alertar.
//   · si está fresco      → si había un Issue de alerta abierto, lo cierra.
//   · si está rancio (>N) → abre (o comenta) un Issue con label "placsp-stale".
//
// SIEMPRE sale 0: la alerta es el Issue, no poner el workflow en rojo (volvería
// a generar el ruido que el soft-skip elimina).
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GH_TOKEN, GITHUB_REPOSITORY,
//      STALE_DAYS (opcional, default 4).
// ──────────────────────────────────────────────────────────────────────

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const REPO = process.env.GITHUB_REPOSITORY || '';
const STALE_DAYS = parseFloat(process.env.STALE_DAYS || '4');
const HEARTBEAT_KEY = 'placsp_last_success';
const LABEL = 'placsp-stale';

function log(...a) { console.log(`[${new Date().toISOString()}]`, ...a); }

async function sb(pathname, opts = {}) {
  const res = await fetch(SUPABASE_URL + pathname, Object.assign({}, opts, {
    headers: Object.assign({
      apikey: KEY,
      Authorization: 'Bearer ' + KEY,
      'Content-Type': 'application/json',
    }, opts.headers || {}),
  }));
  return res;
}

// gh CLI helper. Devuelve stdout (string). Lanza si falla salvo allowFail.
function gh(args, { allowFail = false, input = null } = {}) {
  try {
    return execFileSync('gh', args, {
      encoding: 'utf8',
      input: input || undefined,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (e) {
    if (allowFail) { log(`gh ${args.join(' ')} → ${(e.stderr || e.message || '').toString().slice(0, 200)}`); return ''; }
    throw e;
  }
}

function writeBody(text) {
  const f = path.join(os.tmpdir(), `placsp-stale-${process.pid}.md`);
  fs.writeFileSync(f, text, 'utf8');
  return f;
}

function ensureLabel() {
  gh(['label', 'create', LABEL, '--repo', REPO, '--color', 'D93F0B',
    '--description', 'PLACSP lleva días sin ingerir datos', '--force'], { allowFail: true });
}

function findOpenIssue() {
  const out = gh(['issue', 'list', '--repo', REPO, '--label', LABEL,
    '--state', 'open', '--limit', '1', '--json', 'number'], { allowFail: true });
  try { const arr = JSON.parse(out || '[]'); return arr[0] ? arr[0].number : null; }
  catch { return null; }
}

async function main() {
  if (!SUPABASE_URL || !KEY) { log('⚠️  SUPABASE_URL/KEY ausentes — chequeo omitido.'); return; }
  if (!REPO) { log('⚠️  GITHUB_REPOSITORY ausente — chequeo omitido.'); return; }

  // 1) Leer heartbeat
  const res = await sb(`/rest/v1/meta_kv?key=eq.${HEARTBEAT_KEY}&select=value,updated_at`);
  if (res.status >= 400) { log(`⚠️  No se pudo leer meta_kv: HTTP ${res.status}`); return; }
  const rows = await res.json();
  const row = Array.isArray(rows) ? rows[0] : null;

  // 2) Bootstrap si falta (insert-only: resolution=ignore-duplicates → no
  //    refresca en runs posteriores, así el reloj de staleness sí avanza).
  if (!row) {
    const nowIso = new Date().toISOString();
    const seed = await sb('/rest/v1/meta_kv?on_conflict=key', {
      method: 'POST',
      headers: { Prefer: 'return=minimal,resolution=ignore-duplicates' },
      body: JSON.stringify({ key: HEARTBEAT_KEY, value: { ts: nowIso, bootstrap: true } }),
    });
    log(`Heartbeat ausente → sembrado bootstrap (${nowIso}), HTTP ${seed.status}. Sin alerta esta vez.`);
    return;
  }

  const ts = (row.value && row.value.ts) || row.updated_at;
  const ageMs = Date.now() - new Date(ts).getTime();
  const ageDays = ageMs / 86400000;
  log(`Última ingesta PLACSP: ${ts} (hace ${ageDays.toFixed(1)} días; umbral ${STALE_DAYS}).`);

  const openIssue = findOpenIssue();

  // 3) Fresco → cerrar alerta si estaba abierta
  if (ageDays <= STALE_DAYS) {
    log('✅ Frescura OK.');
    if (openIssue) {
      const body = `✅ PLACSP volvió a ingerir datos el ${ts} (hace ${ageDays.toFixed(1)} días). Cierro la alerta automáticamente.`;
      gh(['issue', 'comment', String(openIssue), '--repo', REPO, '--body-file', writeBody(body)], { allowFail: true });
      gh(['issue', 'close', String(openIssue), '--repo', REPO, '--reason', 'completed'], { allowFail: true });
      log(`Issue #${openIssue} cerrado (recuperado).`);
    }
    return;
  }

  // 4) Rancio → alertar (abrir o comentar)
  ensureLabel();
  const dateStr = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  const body = [
    `**PLACSP lleva ${ageDays.toFixed(1)} días sin ingerir adjudicaciones** (umbral: ${STALE_DAYS} días).`,
    ``,
    `- Última ingesta exitosa: \`${ts}\``,
    `- Comprobado: ${dateStr}`,
    ``,
    `El workflow *PLACSP Daily Crosscheck* sale en **verde** a propósito (soft-skip)`,
    `cuando el servidor del Estado \`contrataciondelestado.es\` bloquea o agota las`,
    `conexiones desde las IPs de los runners de GitHub. Esta alerta significa que el`,
    `bloqueo **persiste** y la cartera no está recibiendo cruces PLACSP nuevos.`,
    ``,
    `**Qué revisar:**`,
    `1. ¿El feed responde desde otra red? \`curl -sI <feed ATOM>\` desde local.`,
    `2. Si GitHub está bloqueado de forma persistente, mover la ingesta a otra`,
    `   infraestructura (p.ej. el GAS, que corre en red de Google) o un proxy.`,
    `3. Esta alerta se **cierra sola** en cuanto vuelva a haber una ingesta exitosa.`,
  ].join('\n');

  if (openIssue) {
    gh(['issue', 'comment', String(openIssue), '--repo', REPO, '--body-file', writeBody(body)], { allowFail: true });
    log(`Issue #${openIssue} actualizado (sigue rancio).`);
  } else {
    const out = gh(['issue', 'create', '--repo', REPO,
      '--title', `🟠 PLACSP lleva ${Math.floor(ageDays)} días sin ingerir datos`,
      '--body-file', writeBody(body), '--label', LABEL], { allowFail: true });
    log(`Issue de alerta creado: ${out || '(ver repo)'}`);
  }
}

main().catch(err => {
  // El chequeo NUNCA debe tumbar el workflow; sólo registra el problema.
  console.error('placsp-freshness error (no crítico):', err && err.message);
  process.exit(0);
});
