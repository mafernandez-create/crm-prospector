# STATE.md — crm

> El agente olvida; este archivo no. Actualízalo al final de cada sesión.

## Última ejecución
2026-07-06 · **Chat IA (chat.html): 2 fixes en producción.** (1) Header respeta
`safe-area-inset-top` de iOS — ya no lo tapa el reloj/batería del iPhone (notch/
Dynamic Island); `header` con `height: calc(var(--header) + env(safe-area-inset-top))`
+ `padding-top` y `#messages` `top` equivalente (commit `9123baa`). (2) **Login
propio e independiente del CRM**: si no hay sesión, `initBackend` llama a
`promptLogin()` (formulario email+contraseña que usa `Auth.signIn` de auth.js);
al entrar, la sesión Supabase queda en localStorage (mismo origen) y conecta sin
abrir el CRM (commit `37fed33`). `sw` v37→v38→v39. Deploy verde (gate `--unit`
235/235). Reabrir la PWA en el iPhone para coger el SW nuevo.

## Anterior
2026-07-06 · **Ola A (seguridad): CERRADO el proxy GAS de Claude.** Guard en el
Apps Script "CRM Prospector API" (`Código.gs` → `handleRequest`) que valida el
`sbToken` de Supabase (`/auth/v1/user`) en las acciones `claudeProxy` y `fetchUrl`;
helper `_verificarSupabaseAuth`. Desplegado en el deployment **AKfycbzh2 → v62**
(los `/exec` sirven versiones fijadas; hubo que reimplementar, no basta con guardar).
Consolidación de deployments: `data.js` repuntado de `AKfycbxx6` (huérfano/desalineado)
a `AKfycbzh2` (el mismo que chat.html) y **arreglado `callGAS`** para mandar
`?action=...&sbToken=...` en la QUERY con body limpio (antes la action iba solo en el
body → el GAS respondía "Acción no válida: undefined"). `sw` v36→v37 para propagar.
Verificado en vivo: chat.html Y el asistente del rediseño responden con sesión y
devuelven "No autorizado" sin ella.
**Cierre total del proxy (07-06):** los 3 web apps del CRM están guardados —
`AKfycbzh2` (v62), `AKfycbwsYsbo` (v63) y `AKfycbz3humr` (v47→v64) reimplantados a
versión con guard; verificado por curl que los tres rechazan `claudeProxy` sin token.
Nota: `AKfycbxx6` (la URL vieja de data.js) es de OTRO proyecto (calculadora de
hipoteca), no del CRM → no era un proxy de Claude.
PENDIENTE menor: `_testAuth` (test) sigue en la versión desplegada `AKfycbzh2` v62
(quitada del código fuente; se irá en el próximo redeploy de esa). Inofensiva.
Olas B/C/D de la auditoría cerradas por mi parte (queda el modal del planificador,
que trabaja otra rama).

## Anterior²
2026-07-05 · Auditoría completa (verificador + código + UX) y remediación:
cerrada la fuga de PII (B1), arreglos de robustez del chat.html (fallo silencioso,
re-login al caducar sesión, concurrencia) y preparado el lado cliente de B2
(token al GAS). Informe en `AUDITORIA.md` (gitignored, no se publica).

## Anterior³
2026-06-30 · Loop engineering Ola 1: gate de CI en `deploy-pages.yml` (job `test`
con `--unit`, Node 20; `deploy` con `needs: test`), Stop hook en `.claude/settings.json`
(`run-all.js --unit || exit 2`), y sub-agente `verifier`. Antes: arreglado el
model-id de Claude muerto (`claude-sonnet-4-20250514` → `claude-sonnet-4-6`).

## En curso
- (nada en curso ahora mismo — rellenar al empezar la próxima tarea)

## Completado recientemente
- **Auditoría 2026-07-05 (commits `6f5395a`→`fd391fa`):**
  - **B1 · Fuga de PII CERRADA:** `planning_*.html` y `agentes/output/prospectos-*.md`
    estaban en gh-pages públicos (HTTP 200, emails reales). Sacados del repo
    (`git rm --cached`, copias locales conservadas) + `.gitignore` (incl. `AUDITORIA.md`)
    + **purga de historial** (`git filter-repo` + force-push; backup en `~/Downloads/`).
    URLs → 404 en main y gh-pages.
  - chat.html: **fallo silencioso** corregido (si falla la consulta al CRM, avisa
    en vez de responder con datos vacíos); accesibilidad (zoom + `aria-label`).
  - **Re-login al caducar sesión:** `Auth.expire()` (auth.js) + intercepción del
    401 en `sbFetch` (data-supabase.js) → repinta la verja en vez de un 401 crudo.
  - **B2 lado cliente:** token de sesión en `?sbToken=` en las 7 llamadas al GAS
    (data.js `callGAS` + helper `gasUrl` en chat.html). Compatible hacia atrás.
  - **Concurrencia chat.html:** `addActivity` mergea sobre `data` fresco (getDoc
    antes del patch); `addStudio` usa cartera fresca + suelo 3000 + IDs string-numéricos.
- Loop engineering: deploy gateado por `--unit` (offline, sin secretos); Stop hook
  que bloquea el fin de turno si el rojo unitario; `verifier` (maker/checker).
- Fix model-id de Claude (`claude-sonnet-4-20250514` daba 404 y rompía el asistente
  IA). Sustituido por `claude-sonnet-4-6` en chat.html, redesign/{data,asistente,detail}
  y claude.yml (también `claude-haiku-4-20250514` → `claude-haiku-4-5`). Bump sw v35.
- Email desde la ficha: botón siempre visible y, si la ficha no tiene email, se
  pide el destinatario al enviar.
- Actividades + calendario: editar una actividad actualiza su evento en vez de
  duplicarlo; arreglado el `redirect_uri` canónico (evitaba el mismatch de OAuth).
- Enlace CRM del export a calendario apunta a `#detail/{id}`.

## Escalado a humanos (necesita decisión / acción de Manolo)
- **B2 · proxy GAS** — el cliente ya manda el token de sesión (`?sbToken=`), pero
  falta VALIDARLO en el Apps Script (script.google.com): verificar el token contra
  `…/auth/v1/user` al inicio del handler y rechazar si no es 200, en TODAS las
  acciones (claudeProxy, fetchUrl, createCalendarEvent, getCalendarEvents). Hasta
  entonces el proxy de Claude sigue abierto (riesgo de coste API + SSRF).
- **B3 · rotar la anon key** de Supabase en el dashboard (la migración RLS la marcó
  como comprometida). Actualizar `auth.js`/`data-supabase.js` tras rotar.
- **Verificar chat.html logueado** end-to-end (login → "CRM conectado ✓" → consulta
  + una escritura de prueba). No se pudo probar sin credenciales.
- Firebase: retirado de TODA la ejecución (web rediseño, batch, PLACSP y chat.html).
  Limpieza de código muerto YA HECHA (`firestore.mjs`, `postToGAS`, `gas-batch-qualify.gs`,
  `batch-qualify.yml`, `test-gas-endpoint.js` borrados; verificado 2026-07-05).
- Follow-ups menores (baja prioridad, ver `AUDITORIA.md`): auditar interpolaciones
  `innerHTML`/XSS, `alert()`→toast en `detail.js`, `aria-live` en toasts, a11y del
  modal del planificador, contraste `--fg-4`.
- Rellenar este STATE al cierre de cada sesión de trabajo en el CRM.

## Lecciones aprendidas (aquí, no en el chat)
- 2026-06: Firebase retirado de la web del rediseño, el batch nocturno y el cruce
  PLACSP (verificado: `data.js` backend hardcoded a Supabase, `index.mjs` no
  importa firestore, `placsp-fetch.js` no llama a `postToGAS`). EXCEPCIÓN:
  `chat.html` sigue en Firebase. No fiarse de los comentarios "Firestore retirado":
  son parciales — verificar SIEMPRE página por página (chat.html se me escapó).
- 2026-07-05: una auditoría puede reflejar un estado PASADO — logout, `manifest.json`
  y `offline.html` figuraban como fallos pero ya estaban resueltos por trabajo
  posterior. Verificar CADA hallazgo contra el código actual antes de "arreglarlo".
- 2026-07-05: token de auth al GAS va en la QUERY (`?sbToken=`), NUNCA en el body:
  el body de `claudeProxy` es el payload de Anthropic y rechazaría campos extra.
  El GAS no pasa headers custom de forma fiable, por eso query.
- 2026-07-05: `patchDoc('studios/{id}', {data})` REEMPLAZA el JSONB `data` entero
  (no mergea por clave). Para no pisar cambios concurrentes, releer con `getDoc`
  justo antes y mergear sobre el estado fresco.
- 2026: el Service Worker cachea agresivamente. Si un cambio no aparece en
  cliente, hay que subir `CACHE_NAME` en `sw.js` (no es un bug, es la caché).
- Cambiar `location.hash` por JS no dispara el render; usar `window.showView()`.
