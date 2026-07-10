# Prospector Scout — envoltorio local del agente `prospector-nuevos`

**Estado: STUB de Fase 2. No hay ningún `launchd` cargado. Nada se ejecuta solo.**

Este directorio envuelve el agente ya existente `.claude/agents/prospector-nuevos.md`
en un disparador programable **local** (no GitHub Actions — ver
`docs/decisiones/2026-07-10-scout-prospector-nuevos.md` para el porqué). No
reescribe la lógica del agente: el script solo le pide a Claude Code, en modo
headless, que delegue en ese subagente exactamente como ya lo hace
`/pendientes-zona` con el suyo.

## Ficheros

- `run-scout.sh` — el envoltorio. Deriva la ruta del repo de su propia
  ubicación (mismo patrón que `auto-push.sh` / `scripts/auto-qualify.sh`).
- `com.crm.prospector-scout.plist.example` — plantilla de `launchd`,
  **deshabilitada** (vive aquí, no en `~/Library/LaunchAgents/`).

## 1. Probar en dry-run (no gasta nada, no llama a la API)

```bash
cd ~/Proyectos/Trabajo_GPF/crm
./scripts/prospector-scout/run-scout.sh --dry-run "Córdoba"
```

Esto valida argumentos, construye el prompt y el nombre del fichero de salida,
y escribe el plan completo en `.prospector-scout.log` — sin tocar la API.

## 2. Medir el prototipo desechable (regla del ecosistema: medir, no estimar)

> ### ✅ Medición ya realizada — Córdoba, 2026-07-10
> Primera ejecución `--medir` real (foco MUTE), resultados verificados en
> `.prospector-scout-last-result.json`:
> - **Coste real: $1.63** por un scout completo de una provincia. Por eso el
>   `--max-budget-usd` por defecto se subió de $1 (truncaba) a **$2** (margen).
> - **Duración:** ~6 min de reloj (búsqueda web + cruce + redacción).
> - **`claude -p` headless NO se cuelga** sin TTY: `permission_denials: []`,
>   exit 0. Este era el gran TODO de permisos — resuelto.
> - **Modelo `claude-sonnet-4-6`: confirmado vigente** (resolvió y respondió).
> - Informe generado en `agentes/output/prospectos-2026-07-10-scout-córdoba.md`
>   (10 prospectos, formato idéntico al del agente manual).
>
> Repite este paso para una zona nueva solo si quieres re-medir; el harness ya
> está validado de punta a punta.

**Antes de programar cualquier cadencia**, ejecuta una vez el modo `--medir`,
en primer plano, para ver con tus propios ojos si `claude -p` headless se
comporta bien (no se cuelga pidiendo un permiso que nadie puede aprobar) y
cuánto cuesta/tarda de verdad:

```bash
cd ~/Proyectos/Trabajo_GPF/crm
SCOUT_MAX_BUDGET_USD=2.00 ./scripts/prospector-scout/run-scout.sh --medir "Córdoba" "MUTE"
```

Esto SÍ invoca la API (acotado por `--max-budget-usd`, por defecto 2,00 $ —
medido: un scout de provincia cuesta ~$1,63 —, y por un timeout de proceso de
30 min por defecto; ambos configurables por variable de entorno, ver cabecera
de `run-scout.sh`). Al terminar:

1. Revisa `.prospector-scout.log` (en la raíz del repo, ya gitignored).
2. Abre `.prospector-scout-last-result.json` (también gitignored) y anota
   coste real, duración y nº de turnos. Campos verificados en el JSON de
   `--output-format json`: `total_cost_usd`, `duration_ms`, `num_turns`,
   `is_error`, `subtype`, `permission_denials`, `errors`.
3. Comprueba que el informe apareció en `agentes/output/prospectos-<fecha>-scout-<zona>.md`
   con el mismo formato que ya produce el agente cuando lo invoca Manolo a mano.
4. **Verifica los prospectos antes de actuar**: son datos de búsqueda web sin
   contrastar. Pásalos por el subagente `verificador-resultados` (o revisa la
   sección "Pendientes de verificar" del propio informe) antes de llamar a
   nadie. El scout descubre; no confirma.

## 3. Activar la ejecución real sin supervisión (solo cuando el paso 2 salga bien)

`run-scout.sh` bloquea a propósito la ejecución real por defecto (modo sin
`--dry-run`/`--medir`) hasta que se confirme `SCOUT_HEADLESS_VERIFIED=1`. Esto
existe para no dejar un cron desatendido corriendo algo que nunca se ha visto
funcionar sin supervisión.

Cuando decidas cadencia y confirmes el paso 2:

```bash
# 1) Copia la plantilla (NO la edites in-place en el repo)
cp ~/Proyectos/Trabajo_GPF/crm/scripts/prospector-scout/com.crm.prospector-scout.plist.example \
   ~/Library/LaunchAgents/com.crm.prospector-scout.plist

# 2) Edita ~/Library/LaunchAgents/com.crm.prospector-scout.plist:
#    - fija la zona en ProgramArguments (o apunta a un rotador propio),
#    - descomenta/ajusta StartCalendarInterval con la cadencia real,
#    - añade SCOUT_HEADLESS_VERIFIED=1 en EnvironmentVariables (los tres TODO
#      están marcados dentro del propio fichero).

# 3) Carga el job
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.crm.prospector-scout.plist
```

## Desactivación / reversión

```bash
launchctl bootout gui/$(id -u)/com.crm.prospector-scout 2>/dev/null || true
mv ~/Library/LaunchAgents/com.crm.prospector-scout.plist \
   ~/Library/LaunchAgents/_retirados-crm/com.crm.prospector-scout.plist.retirado-$(date +%Y-%m-%d)
```

(La carpeta `~/Library/LaunchAgents/_retirados-crm/` ya existe como convención
de este proyecto para retiradas reversibles — ver
`docs/decisiones/2026-07-10-retiro-launchd-local.md`.)

## Reglas duras que este envoltorio respeta (heredadas del agente, no relajadas)

1. **Nunca da de alta nada en el CRM/Supabase en automático** — el propio
   agente lo prohíbe (regla dura 10 de `prospector-nuevos.md`); el prompt de
   `run-scout.sh` lo repite explícitamente.
2. **Nunca envía correos ni escribe en producción.** Solo deposita un
   `.md` en `agentes/output/` (gitignored, protección de PII).
3. **Nunca se commitea el output.** `agentes/output/` está en `.gitignore` a
   propósito (ver hallazgo B1 de `AUDITORIA.md`, fuga de PII ya remediada).
4. **Presupuesto acotado**: `--max-budget-usd` (flag real, confirmado con
   `claude --help`) + timeout de proceso propio (no depende de `timeout`/
   `gtimeout`: verificado que ninguno está instalado en este Mac).
5. **Tools mínimas**: `--allowedTools "Bash Read Write WebSearch WebFetch"`,
   calcado exactamente del frontmatter de `prospector-nuevos.md` — nada más.

## Lo que queda pendiente (decisión de Manolo, no técnico)

- Confirmar el paso 2 (medición real) antes de activar nada.
- Decidir la cadencia (el uso actual es en ráfagas antes de cada ruta, no
  constante).
- Decidir si la zona es fija o rotativa (no hay rotador construido).
- (Re)confirmar `claude-sonnet-4-6` si pasa mucho tiempo hasta activarlo — a
  2026-07-10 está confirmado vigente (mismo modelo que `claude.yml`).
