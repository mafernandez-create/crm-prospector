#!/bin/bash
# ============================================================
# Prospector Scout — envoltorio LOCAL del agente `prospector-nuevos`
#
# NO reescribe la lógica del agente: invoca Claude Code en modo headless
# (`claude -p`) pidiéndole que delegue en el subagente YA EXISTENTE
# `.claude/agents/prospector-nuevos.md` (mismo mecanismo que usa hoy el
# comando `/pendientes-zona` para su propio subagente — ver
# `.claude/skills/pendientes-zona/SKILL.md`: "tool Agent, subagent_type:
# pendientes-zona"). El prompt de este script solo pide esa delegación; toda
# la lógica de búsqueda, filtros, scoring y formato de salida vive en el
# `.md` del agente, sin tocar.
#
# Patrón calcado de los scripts hermanos de este repo:
#   - `auto-push.sh`            → CRM_DIR derivado de dirname "$0", log propio.
#   - `scripts/auto-qualify.sh` → guard con fichero de marca de tiempo.
#
# ⚠️ ESTADO: pensado para NO dispararse solo. El .plist que lo invocaría
# (`com.crm.prospector-scout.plist.example`) está DESHABILITADO por defecto
# (vive en el repo, no en ~/Library/LaunchAgents/). Ver README.md de esta
# carpeta para el procedimiento de activación.
#
# ⚠️ TODOs marcados explícitamente (NO se han inventado flags/valores):
#   - TODO(permisos headless): NO se ha verificado empíricamente si
#     `--allowedTools`/permisos por defecto bloquean o cuelgan sin TTY para
#     las tools que necesita el agente (Bash, WebSearch, WebFetch). Por eso
#     la ejecución REAL está detrás de un guard explícito
#     (SCOUT_HEADLESS_VERIFIED=1, ver más abajo) que solo debe activarse tras
#     comprobar `--medir` una vez a mano y confirmar que no se queda colgado
#     esperando un permiso que nadie puede aprobar.
#   - TODO(coste real): `--max-budget-usd` y `--output-format json` son
#     flags CONFIRMADOS con `claude --help` (versión 2.1.197 instalada en
#     este Mac), pero el esquema exacto del JSON de salida (nombres de campo
#     de coste/duración/turnos) NO se ha verificado con una llamada real. Se
#     vuelca el JSON completo a fichero para poder inspeccionarlo la primera
#     vez y ajustar el parseo si hace falta.
# ============================================================

set -uo pipefail

# El repo se deriva de la ubicación del script:
# scripts/prospector-scout/run-scout.sh -> dos niveles arriba = raíz del repo
CRM_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
LOG="$CRM_DIR/.prospector-scout.log"
OUTPUT_DIR="$CRM_DIR/agentes/output"   # gitignored — nunca se commitea (PII)
RESULT_JSON="$CRM_DIR/.prospector-scout-last-result.json"

# ── Configuración (override por variable de entorno si hace falta) ─────────
MODEL="${SCOUT_MODEL:-claude-sonnet-4-6}"          # mismo modelo que claude.yml (CONFIRMAR que sigue vivo)
MAX_BUDGET_USD="${SCOUT_MAX_BUDGET_USD:-2.00}"     # flag CONFIRMADO: --max-budget-usd (solo con --print). Default $2: medición real de un scout de provincia = $1.63 (Córdoba, 2026-07-10), $1 truncaba.
TIMEOUT_SECONDS="${SCOUT_TIMEOUT_SECONDS:-1800}"   # parada dura de reloj: 30 min por defecto
ALLOWED_TOOLS="Bash Read Write WebSearch WebFetch" # calcado del frontmatter de prospector-nuevos.md — nada más

# Guard de activación para ejecución REAL no supervisada (la que dispararía
# el launchd, una vez Manolo lo active). Por defecto NO está puesto: obliga a
# pasar por `--medir` (manual, supervisado) al menos una vez antes de dejar
# que esto corra solo. Ver TODO(permisos headless) arriba y README.md.
SCOUT_HEADLESS_VERIFIED="${SCOUT_HEADLESS_VERIFIED:-0}"

# ── Argumentos ───────────────────────────────────────────────────────────
# Uso:
#   run-scout.sh --dry-run "<zona>" ["<foco>"]   # NO llama a la API, solo valida y muestra el plan
#   run-scout.sh --medir   "<zona>" ["<foco>"]   # 1 llamada REAL supervisada, para medir coste/tiempo
#   run-scout.sh           "<zona>" ["<foco>"]   # ejecución real sin supervisión (la que usa el launchd);
#                                                  requiere SCOUT_HEADLESS_VERIFIED=1
MODE="run"
if [ "${1:-}" = "--dry-run" ]; then
    MODE="dry-run"
    shift
elif [ "${1:-}" = "--medir" ]; then
    MODE="medir"
    shift
fi

ZONA="${1:-}"
FOCO="${2:-indistinto}"

if [ -z "$ZONA" ]; then
    echo "Uso: $0 [--dry-run|--medir] \"<zona/provincia>\" [\"<foco>\"]" >&2
    echo "Ej:  $0 --dry-run \"Córdoba\"" >&2
    echo "Ej:  $0 --medir \"Córdoba\" \"MUTE\"" >&2
    exit 1
fi

TIMESTAMP="$(date '+%Y-%m-%d %H:%M:%S')"
STAMP_FILE="$(date '+%Y-%m-%d')"
OUT_FILE="$OUTPUT_DIR/prospectos-${STAMP_FILE}-scout-$(echo "$ZONA" | tr ' ' '-' | tr '[:upper:]' '[:lower:]').md"

echo "[$TIMESTAMP] === Scout iniciado — modo=$MODE zona='$ZONA' foco='$FOCO' ===" >> "$LOG"

# ── Prompt: SOLO delega en el agente existente, no reimplementa nada ───────
PROMPT="Actúa exactamente como el subagente 'prospector-nuevos' definido en \
.claude/agents/prospector-nuevos.md de este repo (delega en él vía Task tool, \
subagent_type: 'prospector-nuevos', igual que hace /pendientes-zona con el suyo). \
No modifiques ni reinterpretes sus reglas. Petición: busca prospectos NUEVOS en \
la zona '$ZONA', foco de producto '$FOCO'. Al terminar, guarda el resultado con \
Write en '$OUT_FILE' (ruta ya gitignored, NUNCA propongas commitearla). \
Regla dura: NO des de alta nada en Firestore/Supabase, NO envíes correos, \
NO ejecutes ninguna escritura en el CRM — solo el informe en ese fichero."

if [ "$MODE" = "dry-run" ]; then
    echo "[$TIMESTAMP] DRY-RUN — no se invoca la API. Plan:" >> "$LOG"
    {
        echo "  modelo:        $MODEL"
        echo "  max-budget:    \$$MAX_BUDGET_USD"
        echo "  timeout:       ${TIMEOUT_SECONDS}s"
        echo "  allowedTools:  $ALLOWED_TOOLS"
        echo "  salida:        $OUT_FILE"
        echo "  prompt:        $PROMPT"
    } >> "$LOG"
    echo "✅ Dry-run OK. Nada se ha ejecutado. Revisa $LOG para el plan completo."
    exit 0
fi

if [ "$MODE" = "run" ] && [ "$SCOUT_HEADLESS_VERIFIED" != "1" ]; then
    echo "⚠️  Ejecución real sin supervisión BLOQUEADA a propósito." >&2
    echo "    Antes de dejar que esto corra solo (vía launchd), ejecútalo en" >&2
    echo "    modo --medir una vez a mano y confirma que 'claude -p' no se" >&2
    echo "    queda colgado esperando un permiso (TODO permisos headless, ver" >&2
    echo "    cabecera del script). Luego exporta SCOUT_HEADLESS_VERIFIED=1" >&2
    echo "    (p. ej. en el propio .plist, como <key>EnvironmentVariables</key>)." >&2
    echo "[$TIMESTAMP] Modo 'run' bloqueado — falta SCOUT_HEADLESS_VERIFIED=1 (ver TODO permisos)." >> "$LOG"
    exit 1
fi

# ── A partir de aquí SÍ se gasta presupuesto real (--medir, o --run ya ─────
# verificado). Es intencional: --medir es exactamente la medición del
# prototipo desechable que pide la regla del ecosistema ("el esfuerzo real
# se mide, no se estima").
mkdir -p "$OUTPUT_DIR"

# Guard de tiempo duro sin depender de `timeout`/`gtimeout` (verificado con
# `which timeout gtimeout` en este Mac: ninguno de los dos está instalado).
run_with_hard_timeout() {
    local seconds="$1"; shift
    "$@" &
    local pid=$!
    (
        sleep "$seconds"
        if kill -0 "$pid" 2>/dev/null; then
            echo "[$TIMESTAMP] ⏱️  Timeout de ${seconds}s alcanzado — matando PID $pid" >> "$LOG"
            kill -TERM "$pid" 2>/dev/null
        fi
    ) &
    local watchdog=$!
    wait "$pid"
    local exit_code=$?
    kill "$watchdog" 2>/dev/null
    return $exit_code
}

run_with_hard_timeout "$TIMEOUT_SECONDS" \
    claude -p "$PROMPT" \
        --model "$MODEL" \
        --output-format json \
        --max-budget-usd "$MAX_BUDGET_USD" \
        --allowedTools $ALLOWED_TOOLS \
        --add-dir "$CRM_DIR" \
        > "$RESULT_JSON" 2>> "$LOG"
EXIT_CODE=$?

END_TS="$(date '+%Y-%m-%d %H:%M:%S')"
echo "[$END_TS] Scout terminado — exit=$EXIT_CODE. JSON completo en $RESULT_JSON" >> "$LOG"
if [ "$MODE" = "medir" ]; then
    echo "[$END_TS] TODO(medir): abre $RESULT_JSON a mano, anota coste/duración/nº" >> "$LOG"
    echo "[$END_TS]   de turnos reales, y decide con Manolo la cadencia antes de" >> "$LOG"
    echo "[$END_TS]   poner SCOUT_HEADLESS_VERIFIED=1 en el .plist." >> "$LOG"
fi

exit $EXIT_CODE
