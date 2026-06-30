# STATE.md — crm

> El agente olvida; este archivo no. Actualízalo al final de cada sesión.

## Última ejecución
2026-06-30 · Loop engineering Ola 1: gate de CI en `deploy-pages.yml` (job `test`
con `--unit`, Node 20; `deploy` con `needs: test`), Stop hook en `.claude/settings.json`
(`run-all.js --unit || exit 2`), y sub-agente `verifier`. Antes: arreglado el
model-id de Claude muerto (`claude-sonnet-4-20250514` → `claude-sonnet-4-6`).

## En curso
- (nada en curso ahora mismo — rellenar al empezar la próxima tarea)

## Completado recientemente
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

## Escalado a humanos (necesita decisión de Manolo)
- ✅ RESUELTO (2026-06-29/30): `chat.html` se reconstruyó sobre Supabase (ya no
  usa Firebase; reutiliza la sesión autenticada del rediseño) y el 2026-06-30 se
  le arregló el model-id de Claude que daba 404. Pendiente solo que Manolo
  verifique el camino autenticado end-to-end (login → "CRM conectado ✓" → consulta).
- Resto de Firebase (web rediseño, batch nocturno, cruce PLACSP) ya es solo
  Supabase. Limpieza pendiente de código/textos muertos: `firestore.mjs`,
  `postToGAS()`, scripts de migración/export, tests de Firestore, el workflow
  desactivado `batch-qualify.yml`, y comentarios/prompts desactualizados
  (`placsp-daily.yml`, `data-supabase.js`, `claude.yml`).
- Rellenar este STATE al cierre de cada sesión de trabajo en el CRM.

## Lecciones aprendidas (aquí, no en el chat)
- 2026-06: Firebase retirado de la web del rediseño, el batch nocturno y el cruce
  PLACSP (verificado: `data.js` backend hardcoded a Supabase, `index.mjs` no
  importa firestore, `placsp-fetch.js` no llama a `postToGAS`). EXCEPCIÓN:
  `chat.html` sigue en Firebase. No fiarse de los comentarios "Firestore retirado":
  son parciales — verificar SIEMPRE página por página (chat.html se me escapó).
- 2026: el Service Worker cachea agresivamente. Si un cambio no aparece en
  cliente, hay que subir `CACHE_NAME` en `sw.js` (no es un bug, es la caché).
- Cambiar `location.hash` por JS no dispara el render; usar `window.showView()`.
