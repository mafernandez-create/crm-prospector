# STATE.md — crm

> El agente olvida; este archivo no. Actualízalo al final de cada sesión.

## Última ejecución
2026-06-28 · Aligerado el CLAUDE.md (arquitectura detallada movida a
`docs/CLAUDE-reference.md`) y ajustado el umbral de un test (placsp-feed a >10).

## En curso
- (nada en curso ahora mismo — rellenar al empezar la próxima tarea)

## Completado recientemente
- Email desde la ficha: botón siempre visible y, si la ficha no tiene email, se
  pide el destinatario al enviar.
- Actividades + calendario: editar una actividad actualiza su evento en vez de
  duplicarlo; arreglado el `redirect_uri` canónico (evitaba el mismatch de OAuth).
- Enlace CRM del export a calendario apunta a `#detail/{id}`.

## Escalado a humanos (necesita decisión de Manolo)
- ⚠️ `chat.html` (asistente IA móvil, accesible por URL en GitHub Pages) usa
  Firebase Firestore directamente y está CASI CON SEGURIDAD ROTO desde 2026-06:
  una lectura anónima a Firestore (igual que hace chat.html, sin login) devuelve
  HTTP 403 PERMISSION_DENIED — los permisos se cerraron en la migración. No lee
  studios ni escribe su ping `_meta/ping`. DECISIÓN: reconstruirlo sobre Supabase
  (no es "migrar código que funciona") o retirarlo. Es el último resto vivo de
  Firebase y ahora mismo es una página caída.
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
