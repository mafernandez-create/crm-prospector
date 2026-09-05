#!/bin/bash
# Banco de pruebas: lanza las variantes del scout sobre una misma zona, en
# SERIE (el JSON de resultado vive en una ruta fija: en paralelo se pisarian).
#
# El control se corre DOS veces a proposito. Sin suelo de ruido no se puede
# decir si una variante mejora o si es la varianza normal del agente, que esta
# medida y es alta: dos pases identicos de Teruel coincidieron en 6 de 16.
set -uo pipefail
ZONA="${1:-Zaragoza}"
CRM="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$CRM"
# Cada pase escribe en un directorio VACIO y propio. Sin esto los agentes se
# leen entre ellos y la comparacion no vale: medido el 5-sep-2026.
corre() {  # $1=sufijo  $2=guion
    echo "▶ $1 · guion=$2 · $(date '+%H:%M:%S')"
    local dir="agentes/output/_banco/$1"
    rm -rf "$dir"; mkdir -p "$dir"
    SCOUT_OUT_SUFFIX="$1" SCOUT_AGENT_FILE="$2" SCOUT_OUTPUT_DIR="$CRM/$dir" \
        ./scripts/prospector-scout/run-scout.sh --medir "$ZONA" >/dev/null 2>&1
    local rc=$?
    local f="$dir/prospectos-$(date '+%Y-%m-%d')-scout-$(echo "$ZONA" | tr '[:upper:]' '[:lower:]')_$1.md"
    if [ -f "$f" ]; then
        echo "  ✅ $1 · $(grep -c '^### #' "$f") fichas · $(python3 -c "
import json;d=json.load(open('.prospector-scout-last-result.json'))
print('%.2f \$ · %dm%02ds'%(d.get('total_cost_usd') or 0,(d.get('duration_ms') or 0)//60000,((d.get('duration_ms') or 0)%60000)//1000))")"
    else
        echo "  ❌ $1 · SIN INFORME (rc=$rc)"
    fi
}
# Guiones desde el directorio VERSIONADO, no desde la ruta de produccion: al
# implementar una variante, ".claude/agents/prospector-nuevos.md" deja de ser
# el control y el banco no puede reproducir su propia linea base.
corre vA1 "scripts/prospector-scout/guiones/vA-control.md"
corre vA2 "scripts/prospector-scout/guiones/vA-control.md"
corre vB  "scripts/prospector-scout/guiones/vB-censo-anclado.md"
corre vC  "scripts/prospector-scout/guiones/vC-cupo-por-tipo.md"
echo "── fin $(date '+%H:%M:%S') ──"
