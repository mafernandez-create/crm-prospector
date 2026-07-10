# Decisión — Retirada de automatización local redundante (C4, Fase 2)

**Fecha:** 2026-07-10 · **Estado:** ✅ EJECUTADO (con autorización explícita de Manolo, 2026-07-10) · **Aprobó pasar a Fase 2:** Manolo (candidatos C2 y C4 exclusivamente)

> **Nota de ejecución:** en el primer intento (subagente `optimizador-agentes`)
> el clasificador de "auto mode" de Claude Code denegó `launchctl bootout` + `mv`
> sobre `com.crm.batch-qualify`, por tratarse de un job `launchd` que la sesión
> no creó. Manolo autorizó después explícitamente la acción y **se ejecutó en la
> sesión principal el 2026-07-10**. Resultado verificado con `launchctl list`:
> `com.crm.batch-qualify` ya **no aparece** (descargado), su `.plist` se movió a
> `~/Library/LaunchAgents/_retirados-crm/com.crm.batch-qualify.plist.retirado-2026-07-10`
> (no se borró), y `com.crm.autopush` sigue **cargado e intacto**. Los comandos
> de abajo son los que se ejecutaron.

## Verificación empírica previa (principio "lee la traza antes de teorizar")

Antes de tocar nada se comprobó, con el sistema real (no de memoria):

```
$ launchctl list | grep -i crm
-	0	com.crm.batch-qualify
-	0	com.crm.autopush
```

Ambos jobs estaban cargados (el `-` es el PID, normal en jobs que no están
ejecutándose en ese instante; `0` es el último exit status, sin error).

### `com.crm.autopush` (→ `auto-push.sh`) — **NO SE TOCA**

La memoria del proyecto `crm-repo-concurrencia` advierte de un *"cron de
auto-guardado: hace `git add -A && git commit` periódicamente a `main`
(mensajes tipo `Auto-guardado CRM 2026-07-04 13:31:59`)"* que hay que respetar
para no perder trabajo por concurrencia.

Se confirmó, no se supuso:
- `auto-push.sh` construye el mensaje exactamente como
  `git commit -m "Auto-guardado CRM $TIMESTAMP"` con
  `TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')` — coincide carácter a carácter con
  el formato citado en la memoria.
- `git log --grep="Auto-guardado"` muestra el commit real
  `ba2934e "Auto-guardado CRM 2026-07-04 13:31:59"`, con ese formato exacto.
- Historial completo de commits "Auto-guardado" por fecha: actividad alta en
  abril-mayo (hasta 103 commits en un día, 2026-05-18) y descenso progresivo
  hasta un único commit el 2026-07-04. El watcher solo vigila `index.html`
  (`WatchPaths` del `.plist`); `index.html` es el *loader* del rediseño y ya
  casi no se edita directamente (el grueso de desarrollo activo está en
  `redesign/`) — el descenso de commits es coherente con eso, **no** con que
  el mecanismo esté roto.
- `.auto-push.log` está vacío (0 bytes) pero eso es consistente con que
  `index.html` no ha cambiado desde el 2026-07-07 (mtime del fichero) y con
  que el script solo escribe log cuando `git diff --quiet index.html` detecta
  cambio.

**Conclusión con evidencia, no con duda:** `auto-push.sh` **ES** el cron de
auto-guardado que protege la concurrencia descrita en la memoria del
proyecto. Sigue activo y funcional; simplemente dispara poco porque
`index.html` apenas cambia ahora. **No se retira.** Sigue cargado en
`launchctl` sin cambios.

### `com.crm.batch-qualify` (→ `scripts/auto-qualify.sh`) — **RETIRADO**

Evidencia de redundancia/obsolescencia, verificada, no supuesta:

1. El script abre `file://.../index.html?auto-qualify=1` en Chrome — depende
   de que ese *query param* dispare algo en el código.
   `grep -rn "auto-qualify" --include="*.js" --include="*.html" .` (excluyendo
   `node_modules`) **no devuelve ningún resultado**. El parámetro no está
   implementado en ningún sitio del código actual: **el mecanismo es un
   no-op**, no solo redundante.
2. La cualificación real (recálculo de scoring/cuadrantes) ya corre en
   servidor: `.github/workflows/batch-qualify-node.yml`, cron diario
   `30 2 * * *` UTC, confirmado en el propio comentario del workflow: *"port
   de `gas-batch-qualify.gs`... reemplaza al cron GAS/Firestore retirado en
   2026-06"*. El historial de commits confirma la migración
   (`4fd5d9d feat(batch): migrar batch nocturno de GAS a Node.js`,
   `b184355 chore: deshabilitar cron GAS batch-qualify (sustituido por Node)`,
   `dea00df crm: retirar bloque GAS/Firestore del batch antiguo`).
3. `.auto-qualify.log` solo tiene **2 líneas en toda su vida**
   (2026-07-07 12:51:45 y 2026-07-08 18:59:14), pese a `RunAtLoad: true` +
   guard de 20h — es decir, debería haberse disparado en casi cada arranque
   del Mac y no lo ha hecho, u ocurre pero no hace nada útil (coherente con el
   punto 1: abre una pestaña de Chrome que no dispara ninguna lógica real).

**Conclusión:** `com.crm.batch-qualify` es redundante con
`batch-qualify-node.yml` (que sí funciona, en servidor) y además su mecanismo
local (`?auto-qualify=1`) está muerto en el código actual. Es seguro
retirarlo.

## Comandos ejecutados (reversibles, sin destruir nada)

```bash
mkdir -p ~/Library/LaunchAgents/_retirados-crm

# 1) Descargar el job de la sesión actual (no falla si ya no corre)
launchctl bootout gui/$(id -u)/com.crm.batch-qualify 2>/dev/null || true

# 2) Mover (NO borrar) el .plist fuera de LaunchAgents para que no se
#    vuelva a cargar en el próximo login, conservando copia íntegra
mv ~/Library/LaunchAgents/com.crm.batch-qualify.plist \
   ~/Library/LaunchAgents/_retirados-crm/com.crm.batch-qualify.plist.retirado-2026-07-10
```

`com.crm.autopush` **no se ha tocado**: sigue en
`~/Library/LaunchAgents/com.crm.autopush.plist`, cargado y activo.

## Cómo revertir

Si Manolo decide que quiere recuperar `com.crm.batch-qualify` (por ejemplo,
si en el futuro el query param `?auto-qualify=1` vuelve a implementarse):

```bash
mv ~/Library/LaunchAgents/_retirados-crm/com.crm.batch-qualify.plist.retirado-2026-07-10 \
   ~/Library/LaunchAgents/com.crm.batch-qualify.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.crm.batch-qualify.plist
```

## Qué NO se ha tocado

- `com.crm.autopush` / `auto-push.sh` — verificado como el auto-guardado real,
  se mantiene sin cambios.
- `.github/workflows/batch-qualify-node.yml` — la cualificación real sigue
  corriendo ahí, sin cambios.
- El fichero `scripts/auto-qualify.sh` en el repo — se deja en el repo tal
  cual (no se borra código; solo se ha retirado el disparador `launchd` local
  que lo invocaba). Si Manolo confirma que quiere borrarlo del repo, es una
  acción aparte que requiere su aprobación explícita (borrar código no estaba
  en el alcance aprobado para esta Fase 2).
