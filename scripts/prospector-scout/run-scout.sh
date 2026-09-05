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
# ✅ Los dos TODO de la primera versión están RESUELTOS empíricamente:
#   - permisos headless: `claude -p` NO se cuelga sin TTY. Medido en Córdoba
#     (10-jul-2026) y reconfirmado en Teruel (5-sep-2026): en ambos pases
#     `permission_denials: []` y exit 0. El guard SCOUT_HEADLESS_VERIFIED se
#     mantiene igualmente, pero ya no por esto: es para no dejar un cron
#     desatendido sin haber decidido antes la cadencia.
#   - esquema del JSON: verificado. `total_cost_usd`, `duration_ms`,
#     `num_turns`, `is_error`, `subtype`, `permission_denials`. Este script ya
#     los parsea al log; no hay que abrir el JSON a mano.
#
# ⚠️ OJO con `usage.server_tool_use` del JSON: cuenta el ÚLTIMO mensaje y solo
#   herramientas de servidor. Marca 0 búsquedas cuando se han hecho 23, y no
#   ve WebFetch (corre en el cliente). Para saber QUÉ hizo de verdad un pase,
#   contar los `tool_use` de ~/.claude/projects/<proyecto>/<session_id>.jsonl.
# ============================================================

set -uo pipefail

# El repo se deriva de la ubicación del script:
# scripts/prospector-scout/run-scout.sh -> dos niveles arriba = raíz del repo
CRM_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
LOG="$CRM_DIR/.prospector-scout.log"
# SCOUT_OUTPUT_DIR aisla la salida de un pase. Hace falta para comparar
# variantes: con el directorio compartido, un pase LEE los informes de los
# anteriores y deja de ser independiente. Medido el 5-sep-2026 — vA2 escribio
# "se incorporan 6 prospectos nuevos no incluidos en vA1" y vB excluyo a
# proposito lo que ya habian encontrado los otros. Dos de cuatro pases
# inservibles como comparacion.
OUTPUT_DIR="${SCOUT_OUTPUT_DIR:-$CRM_DIR/agentes/output}"   # gitignored — nunca se commitea (PII)
RESULT_JSON="$CRM_DIR/.prospector-scout-last-result.json"

# ── Configuración (override por variable de entorno si hace falta) ─────────
MODEL="${SCOUT_MODEL:-claude-sonnet-4-6}"          # mismo modelo que claude.yml. Vigente: resolvió y respondió en Córdoba (10-jul-2026) y Teruel (5-sep-2026)
MAX_BUDGET_USD="${SCOUT_MAX_BUDGET_USD:-3.00}"     # flag CONFIRMADO: --max-budget-usd (solo con --print). Default $3 desde 2026-07-31: un scout sin foco (portfolio completo) gasta ~$2.21 (Granada) y $2 truncaba al cierre; con foco ~$1.63. Sobreescribible con SCOUT_MAX_BUDGET_USD.
TIMEOUT_SECONDS="${SCOUT_TIMEOUT_SECONDS:-1800}"   # parada dura de reloj: 30 min por defecto
ALLOWED_TOOLS="Bash Read Write WebSearch WebFetch" # calcado del frontmatter de prospector-nuevos.md — nada más
# SCOUT_AGENT_FILE permite correr una VARIANTE del guion sin tocar el de
# produccion. Es lo que hace falta para comparar versiones sobre la misma zona
# (banco de pruebas en scripts/prospector-scout/banco/).
AGENT_FILE="${SCOUT_AGENT_FILE:-.claude/agents/prospector-nuevos.md}"
if [ ! -f "$CRM_DIR/$AGENT_FILE" ]; then
    echo "❌ No existe el guion '$AGENT_FILE' en $CRM_DIR" >&2
    exit 1
fi

# Guard de activación para ejecución REAL no supervisada (la que dispararía
# el launchd, una vez Manolo lo active). Por defecto NO está puesto: obliga a
# pasar por `--medir` (manual, supervisado) al menos una vez antes de dejar
# que esto corra solo, sin haber decidido antes la cadencia. Ver README.md.
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

# Guard de erratas: el 31-jul-2026 un pase gastó 2,21 $ buscando en 'Granda'.
# Si la zona no es una provincia conocida puede ser legítimo (comarcas, zonas
# como "Bajo Aragón"), así que solo se avisa y se pide confirmación, y solo si
# hay terminal: en headless no hay nadie a quien preguntar.
PROVINCIAS="alava araba albacete alicante alacant almeria asturias avila badajoz barcelona burgos caceres cadiz cantabria castellon castello ceuta ciudad-real cordoba cuenca girona gerona granada guadalajara guipuzcoa gipuzkoa huelva huesca jaen leon lleida lerida lugo madrid malaga melilla murcia navarra nafarroa ourense orense palencia pontevedra rioja la-rioja salamanca segovia sevilla soria tarragona tenerife santa-cruz-de-tenerife teruel toledo valencia valencia-comunitat valladolid vizcaya bizkaia zamora zaragoza baleares illes-balears islas-baleares palmas las-palmas coruna a-coruna la-coruna"
# El `sed` de macOS cuenta BYTES en `y///`, asi que con acentos falla con
# "transform strings are not the same length" y dejaba ZONA_NORM vacio: el
# aviso saltaba con TODAS las zonas, incluidas las validas. Un aviso que salta
# siempre es un aviso que se ignora. Se normaliza con python3, que este script
# ya necesita mas abajo.
ZONA_NORM="$(printf '%s' "$ZONA" | python3 -c "
import sys, unicodedata
s = unicodedata.normalize('NFD', sys.stdin.read().strip().lower())
s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
print(s.replace(' ', '-'))
")"
if ! echo " $PROVINCIAS " | grep -q " $ZONA_NORM "; then
    echo "⚠️  '$ZONA' no es una provincia española conocida." >&2
    echo "    Puede ser correcto (comarca, zona) o una errata: un pase con" >&2
    echo "    la zona mal escrita gasta lo mismo y no sirve de nada." >&2
    if [ -t 0 ]; then
        printf "    ¿Seguimos con '%s'? [s/N] " "$ZONA" >&2
        read -r RESP
        case "$RESP" in
            [sS]|[sS][iI]) ;;
            *) echo "    Cancelado." >&2; exit 1 ;;
        esac
    else
        echo "    (sin terminal: sigo adelante, pero queda avisado en el log)" >&2
    fi
fi

TIMESTAMP="$(date '+%Y-%m-%d %H:%M:%S')"
STAMP_FILE="$(date '+%Y-%m-%d')"
# SCOUT_OUT_SUFFIX permite pasar la MISMA zona el MISMO dia sin que un pase
# pise al anterior. Sin el, dos ejecuciones de Zaragoza hoy escriben las dos en
# el mismo fichero y la segunda borra a la primera — que es justo lo que hay
# que evitar al comparar variantes.
SUFIJO="${SCOUT_OUT_SUFFIX:+_$SCOUT_OUT_SUFFIX}"
OUT_FILE="$OUTPUT_DIR/prospectos-${STAMP_FILE}-scout-${ZONA_NORM}${SUFIJO}.md"

echo "[$TIMESTAMP] === Scout iniciado — modo=$MODE zona='$ZONA' foco='$FOCO' ===" >> "$LOG"

# ── Prompt: SOLO delega en el agente existente, no reimplementa nada ───────
PROMPT="Eres el prospector de estudios nuevos del CRM. LEE con Read el fichero \
$AGENT_FILE de este repo y actúa EXACTAMENTE según sus \
reglas, haciéndolo TÚ MISMO en este mismo proceso. NO delegues en ningún subagente \
ni uses el Task tool: en modo headless el proceso termina y el subagente muere sin \
escribir nada. Petición: busca prospectos en la zona '$ZONA', foco de producto \
'$FOCO', en sus DOS orígenes: (a) estudios NUEVOS fuera del CRM y (b) estudios YA en \
el CRM pero SIN visitar (sin informe, 'cartera dormida'). Cruza contra Supabase con \
crm_query.py (--accion candidatos, campo tiene_informe) y descarta solo lo ya \
visitado. IMPORTANTE: NO termines tu turno hasta haber COMPLETADO la búsqueda y \
ESCRITO el informe con Write en '$OUT_FILE' (ruta ya gitignored, NUNCA propongas \
commitearla); no respondas 'sigo trabajando' ni prometas avisar después. \
NO LEAS ningun otro informe de prospeccion de esta carpeta ni de otra: \
tienes que buscar por ti mismo, no continuar el trabajo de nadie. \
Regla dura: NO des de alta nada en Supabase, NO envíes correos, \
NO ejecutes ninguna escritura en el CRM — solo el informe en ese fichero."

if [ "$MODE" = "dry-run" ]; then
    echo "[$TIMESTAMP] DRY-RUN — no se invoca la API. Plan:" >> "$LOG"
    {
        echo "  modelo:        $MODEL"
        echo "  max-budget:    \$$MAX_BUDGET_USD"
        echo "  timeout:       ${TIMEOUT_SECONDS}s"
        echo "  allowedTools:  $ALLOWED_TOOLS"
        echo "  salida:        $OUT_FILE"
        echo "  sufijo:        ${SCOUT_OUT_SUFFIX:-(ninguno)}"
        echo "  guion:         $AGENT_FILE"
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
    # Matar Y recoger el watchdog en silencio. Sin el `wait`, el shell anuncia
    # "Terminated: 15 ... sleep" al acabar; llevaba meses documentado como
    # "ruido cosmetico" cuando era solo un proceso sin recoger.
    { kill "$watchdog" && wait "$watchdog"; } 2>/dev/null
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

# ── Archivo del resultado ──────────────────────────────────────────────────
# El JSON se sobrescribía en cada pase, así que el coste de cada ejecución se
# perdía y solo quedaba anotado a mano en el README. Ahora se guarda una copia
# fechada y el histórico de gasto es recuperable.
RESULTS_DIR="$CRM_DIR/agentes/output/_ejecuciones"
mkdir -p "$RESULTS_DIR"
cp "$RESULT_JSON" "$RESULTS_DIR/$(date '+%Y%m%d-%H%M%S')-$ZONA_NORM.json" 2>> "$LOG"

# ── Medición al log, sin abrir el JSON a mano ──────────────────────────────
# Campos verificados en dos pases reales. Ojo: `usage.server_tool_use` NO sirve
# para saber qué herramientas se usaron (ver cabecera).
python3 - "$RESULT_JSON" >> "$LOG" 2>/dev/null <<'PYEOF'
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception as e:
    print("           medición: no se pudo leer el JSON (%s)" % e); raise SystemExit
ms = d.get("duration_ms") or 0
print("           coste=%.4f $ · duración=%dm%02ds · turnos=%s · subtype=%s · denegados=%d" % (
    d.get("total_cost_usd") or 0, ms // 60000, (ms % 60000) // 1000,
    d.get("num_turns"), d.get("subtype"), len(d.get("permission_denials") or [])))
for m, v in (d.get("modelUsage") or {}).items():
    print("             %s: %.4f $ · %s búsquedas web" % (
        m, v.get("costUSD") or 0, v.get("webSearchRequests")))
print("           sesión=%s  (traza: ~/.claude/projects/<proyecto>/%s.jsonl)" % (
    d.get("session_id"), d.get("session_id")))
PYEOF

# ── Copia del informe a Descargas ──────────────────────────────────────────
# Solo si la ejecución salió bien (exit 0) y el informe se generó de verdad.
# Descargas es local (el runner ES el Mac de Manolo); no afecta a la regla de
# no commitear PII: agentes/output/ sigue gitignored y esta copia no entra al
# repo. Carpeta configurable por SCOUT_DOWNLOADS_DIR (default ~/Downloads).
DOWNLOADS_DIR="${SCOUT_DOWNLOADS_DIR:-$HOME/Downloads}"
if [ "$EXIT_CODE" -eq 0 ] && [ -f "$OUT_FILE" ]; then
    if cp "$OUT_FILE" "$DOWNLOADS_DIR/" 2>> "$LOG"; then
        echo "[$END_TS] 📥 Copia del informe guardada en $DOWNLOADS_DIR/$(basename "$OUT_FILE")" >> "$LOG"
    else
        echo "[$END_TS] ⚠️  No se pudo copiar el informe a $DOWNLOADS_DIR (ver error arriba)." >> "$LOG"
    fi
else
    echo "[$END_TS] ℹ️  No se copia a Descargas: exit=$EXIT_CODE, informe presente=$([ -f "$OUT_FILE" ] && echo sí || echo no)." >> "$LOG"
fi

# ── Un pase sin informe NO es un pase bueno ────────────────────────────────
# El fallo del 20-ago-2026 pasó desapercibido porque `claude` devolvía exit 0 y
# subtype "success" habiendo escrito nada: el script lo daba por bueno y solo
# una línea perdida del log decía "informe presente=no". El trabajo de este
# script es dejar un informe; si no está, tiene que decirlo y fallar.
if [ ! -f "$OUT_FILE" ]; then
    echo "" >&2
    echo "❌ EL PASE NO HA DEJADO NINGÚN INFORME." >&2
    echo "   Esperado: $OUT_FILE" >&2
    echo "   El proceso terminó con exit=$EXIT_CODE, pero eso no basta: si claude" >&2
    echo "   contestó 'sigo trabajando' o agotó el presupuesto antes de escribir," >&2
    echo "   sale con éxito igualmente. Se ha gastado dinero para nada." >&2
    echo "   Mira la medición en $LOG y, si hace falta, la traza de la sesión." >&2
    echo "[$END_TS] ❌ SIN INFORME — exit del proceso=$EXIT_CODE, pero no hay fichero en $OUT_FILE" >> "$LOG"
    exit 3
fi

echo "✅ Informe en $OUT_FILE"
echo "   Medición y coste, en $LOG"
echo "   ⚠️  Son datos de búsqueda web SIN verificar: pásalos por verificador-resultados"
echo "       antes de llamar a nadie o darlos de alta."

exit $EXIT_CODE
