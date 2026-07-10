# Decisión — Andamiaje "Prospector Scout" (C2, Fase 2)

**Fecha:** 2026-07-10 · **Estado:** **vía LOCAL elegida y andamiada** (la alternativa GitHub Actions se creó y luego se BORRÓ, ver abajo) · **Aprobó pasar a Fase 2:** Manolo (candidatos C2 y C4 exclusivamente)

## ACTUALIZACIÓN 2026-07-10 (misma fecha, tras revisar bloqueos): vía elegida = local

Manolo aprobó construir la **vía local** (`launchd` + `claude -p` headless),
no GitHub Actions, exactamente por los bloqueos descritos más abajo (§"Por qué
no se puede activar todavía"). El andamiaje real vive ahora en
**`scripts/prospector-scout/`**:

- `scripts/prospector-scout/run-scout.sh` — envoltorio que invoca
  `claude -p` pidiéndole que delegue en el subagente `prospector-nuevos` vía
  Task tool (mismo mecanismo que ya usa `/pendientes-zona` con el suyo, ver
  `.claude/skills/pendientes-zona/SKILL.md`). Tres modos: `--dry-run` (no
  llama a la API), `--medir` (1 llamada real supervisada, acotada por
  `--max-budget-usd` + timeout de proceso), y ejecución real sin supervisión
  (bloqueada por defecto detrás de `SCOUT_HEADLESS_VERIFIED=1`).
- `scripts/prospector-scout/com.crm.prospector-scout.plist.example` —
  plantilla de `launchd`, **deshabilitada**, vive en el repo, no en
  `~/Library/LaunchAgents/`.
- `scripts/prospector-scout/README.md` — cómo probar, medir y activar.

Detalle completo de flags verificados (`claude --help`, versión 2.1.197),
TODOs marcados sin inventar, y reglas duras respetadas: ver el README de esa
carpeta.

## Qué se creó antes (GitHub Actions) y por qué se BORRÓ

Se había creado primero `.github/workflows/prospector-scout.yml` — un esqueleto de
GitHub Actions que envolvía al agente `prospector-nuevos` en un disparador
programable (`workflow_dispatch` + `schedule` comentado), deshabilitado por
defecto.

**Decisión (Manolo, 2026-07-10): BORRADO.** Al elegir la vía local, ese workflow
quedaba como un segundo camino en conflicto con bloqueos estructurales reales
(ver §"Por qué no se puede activar…" abajo) que lo hacían inviable tal cual —
mantenerlo solo invitaba a activarlo por error asumiendo que funciona. Su
contenido, su razón de ser y los bloqueos que lo descartan quedan documentados
en este mismo fichero, así que no se pierde el conocimiento al eliminar el YAML.
No se dejó copia como `.txt`: la traza está aquí.

## Por qué no se puede activar todavía (bloqueos reales, no hipotéticos)

Verificado en el repo durante la Fase 1/2 (no es una suposición):

1. **`.claude/` está en `.gitignore`** (línea 22). Confirmado con
   `git check-ignore -v .claude/agents/prospector-nuevos.md` → coincide con la
   regla `.claude/`. Un `actions/checkout` en GitHub Actions **no trae ese
   fichero** porque nunca ha estado en el repo remoto (`git ls-files .claude`
   devuelve vacío). El workflow tal cual fallará en el step "Verificar que el
   agente está disponible" — a propósito, para que el bloqueo sea visible y no
   silencioso.

2. **`agentes/output/` está en `.gitignore`** con el comentario explícito en el
   propio fichero: *"Documentos con datos de clientes — solo local, nunca al
   repo público (el repo se despliega a gh-pages PÚBLICO: nada con PII aquí)"*.
   El scout genera fichas con nombre, cargo, teléfono y email de prospectos
   reales (ver formato de salida en `prospector-nuevos.md`, paso 8). Si el
   workflow corriera en GitHub Actions y commiteara ese output a `main`,
   **reproduciría exactamente el hallazgo B1 de `AUDITORIA.md`** (fuga de PII
   en `agentes/output/prospectos-*.md`, ya remediada con purga de historial).
   Este workflow tiene `permissions: contents: read` a propósito — no puede
   commitear aunque quisiera.

3. Consecuencia de (2): si el destino fuera un **artifact** de GitHub Actions
   en vez de un commit, el propio `supabase-backup-weekly.yml` de este mismo
   repo documenta que *"el repo es PÚBLICO y los artifacts son descargables
   por cualquiera"* — por eso ese workflow cifra el backup con GPG antes de
   subirlo. El scout necesitaría el mismo tratamiento (cifrado con
   `secrets.*`) si se queda en GitHub Actions.

## Por qué la vía local resuelve los dos bloqueos

- El agente se lee del `.claude/` local sin tocar `.gitignore` (el runner ES
  el propio Mac de Manolo, con `.claude/` ya presente).
- El output se queda en `agentes/output/` local, sin riesgo de PII pública,
  sin necesidad de cifrado ni de artifacts de GitHub.

## Antes de activar la vía local (ver también README de `scripts/prospector-scout/`)

1. Ejecutar `--dry-run` para validar el disparador (sin coste).
2. Ejecutar `--medir` **una vez, en primer plano, supervisado** — es la
   medición del **prototipo desechable** que exige la regla operativa del
   ecosistema (`~/Proyectos/CLAUDE.md` §10: "el esfuerzo real se mide, no se
   estima"). Sirve además para confirmar que los permisos headless no dejan
   el proceso colgado (TODO marcado en `run-scout.sh`).
3. Decidir la cadencia con Manolo — el uso actual es en **ráfagas** antes de
   cada ruta (evidencia: 5 días de uso en `agentes/output/` entre 11-may y
   8-jul-2026, no un patrón semanal constante), así que un cron fijo puede no
   encajar con el patrón real de trabajo.
4. Solo entonces: copiar el `.plist.example`, editar zona/cadencia, poner
   `SCOUT_HEADLESS_VERIFIED=1`, y `launchctl bootstrap`.

## Reversión

- **Vía local:** borrar `scripts/prospector-scout/` no afecta a nada más (no
  hay ningún `launchd` cargado todavía). Si ya se activó, ver "Desactivación"
  en el README de esa carpeta.
- **Workflow de GitHub Actions:** ya borrado (ver §"Qué se creó antes…"). No
  queda nada que revertir; si en el futuro se quisiera la vía nube, se
  reconstruye desde la descripción y los bloqueos documentados en este fichero.
