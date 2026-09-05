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
corre() {  # $1=sufijo  $2=guion
    echo "▶ $1 · guion=$2 · $(date '+%H:%M:%S')"
    SCOUT_OUT_SUFFIX="$1" SCOUT_AGENT_FILE="$2" \
        ./scripts/prospector-scout/run-scout.sh --medir "$ZONA" >/dev/null 2>&1
    local rc=$?
    local f="agentes/output/prospectos-$(date '+%Y-%m-%d')-scout-$(echo "$ZONA" | tr '[:upper:]' '[:lower:]')_$1.md"
    if [ -f "$f" ]; then
        echo "  ✅ $1 · $(grep -c '^### #' "$f") fichas · $(python3 -c "
import json;d=json.load(open('.prospector-scout-last-result.json'))
print('%.2f \$ · %dm%02ds'%(d.get('total_cost_usd') or 0,(d.get('duration_ms') or 0)//60000,((d.get('duration_ms') or 0)%60000)//1000))")"
    else
        echo "  ❌ $1 · SIN INFORME (rc=$rc)"
    fi
}
corre vA1 ".claude/agents/prospector-nuevos.md"
corre vA2 ".claude/agents/prospector-nuevos.md"
corre vB  ".claude/agents/prospector-nuevos-vB.md"
corre vC  ".claude/agents/prospector-nuevos-vC.md"
echo "── fin $(date '+%H:%M:%S') ──"
