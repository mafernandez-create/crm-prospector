# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Regla de trabajo (OBLIGATORIO)
- Todo nuevo desarrollo va al **rediseño** (`redesign/`) y **Supabase**.
- La versión anterior (`index-legacy.html` + Firebase Firestore) **NO se toca** sin permiso explícito.
- Si hay que modificar el legacy o Firestore directamente, pedir permiso antes de actuar.

## Regla de informes (OBLIGATORIO)
- **Ningún informe puede contener marcas de tiempo** de la transcripción del audio
  (`[01:47]`, `[01:47–02:34]`, `(MM:SS)`, rangos `MM:SS–MM:SS`). Un informe es un
  **registro comercial profesional**, NO una transcripción: nunca puede parecer que
  proviene de una reunión grabada.
- Regla centralizada en `window.Util.stripTimestamps` / `stripTimestampsDeep` (`redesign/app.js`).
  Se aplica al **generar** (`Data.generateReport`) y al **importar** YAML (`detail.js → _ejecutarImportacion`).
  NO toca fechas `[YYYY-MM-DD]`, horas sueltas (`10:30`) ni `[SIN DATO]`.
- Cualquier flujo nuevo que cree o muestre informes debe pasar por `stripTimestamps(Deep)`.

## Qué es esto
CRM B2B de prospección para Manuel Fernández ("Manolo"), prescriptor de Grupo Plásticos
Ferro (GPF/Ferroplast) en Andalucía/Extremadura/Levante. El objetivo comercial NO es vender,
sino que el proyectista **especifique la marca GPF en el pliego** antes del concurso.
Sin framework ni build step: HTML + CSS + JS vanilla servido estáticamente.
- **Producción:** https://mafernandez-create.github.io/crm-prospector (GitHub Pages, rama `gh-pages`).

## Comandos

```bash
# Servir en local (sirve el rediseño tal cual va a producción)
python3 -m http.server 3456        # luego abrir http://localhost:3456/index.html
# (config equivalente en .claude/launch.json, server "crm")

# Tests — Node 20+, sin dependencias npm (built-ins fetch/crypto/fs)
node scripts/tests/run-all.js                 # toda la batería (default)
node scripts/tests/run-all.js --unit          # solo una capa: --unit|--integration|--e2e|--smoke
node scripts/tests/run-all.js --all --verbose # stdout/stderr de cada test
node scripts/tests/unit/test-scoring-v2.js    # un test individual: ejecutarlo directo

# Pipeline de scoring/cuadrantes (recalcula Q1-Q9, dual-write Firestore+Supabase)
FILTRO=sin_cuadrante LIMITE=200 node scripts/batch-qualify/index.mjs

# Generadores Word/Excel y utilidades usan las únicas deps npm (docx, xlsx)
npm install
```

**Despliegue:** push a `main` → el workflow `deploy-pages.yml` hace force-push de `main` a
`gh-pages` (deploy en ~10s). El Service Worker cachea agresivamente: si un cambio no aparece
en cliente, **subir la versión de `CACHE_NAME` en `sw.js`** (actualmente `crm-prospector-v16`)
y recargar (en móvil, cerrar y reabrir la PWA).

## Arquitectura del rediseño (`redesign/`)

`index.html` es solo un **loader**: importa los módulos como `<script>` en orden fijo y monta `#app`.
No hay bundler; el orden de carga en `index.html` importa.

**Orden de carga y responsabilidad de cada módulo:**
1. `icons.js` → `window.Icon` (SVGs inline).
2. `states.js` → estados/“empty states” y máquinas de estado de UI.
3. `data-supabase.js` → cliente REST de Supabase (`window.DataSupabase`). Traduce rutas estilo
   Firestore a REST: `studios/{id}`, `_meta/planificador`, `studios/{id}/reports/{iso}`. Las
   "subcolecciones" (reports, activities) NO son tablas: viven dentro del JSONB `data` del studio.
4. `data.js` → **capa de datos de alto nivel** (`window.Data`): `loadAll`, `getDoc`, `generateReport`,
   `savePlanificador`, `enrichStudio`, etc. Enruta entre Supabase y Firestore vía `_useSupabase()`
   (backend por defecto `'supabase'`, override en `localStorage['redesign:backend']`). Rellena `window.State`.
5. `app.js` → `window.Util` (helpers compartidos: `escapeHtml`, `reports`, `activities`,
   `lastInteraction`, `readField`, `stripTimestamps(Deep)`) e `init()` (arranque, OAuth callback, `loadAll`).
6. `shell.js` → `window.Shell.render()` pinta el chrome (sidebar + topbar + tabbar) y las
   `<section class="view" id="view-{name}">` donde cada pantalla inyecta su HTML.
7. `screens/*.js` → una pantalla por archivo; cada una hace `window.Screens.{name} = { render, ... }`.
   Pantallas: inicio, studios, detail, comollegar, briefing, informe, dashboard, bandeja,
   planificador, mapa, importar, cmdk, asistente, voice.
8. `acciones.js` → acciones pendientes derivadas de informes (referencias cruzadas).

**Routing:** `window.showView(name[, params])` activa la `<section>` correspondiente y llama a
`Screens[name].render(params)`. La navegación es por hash + enlaces `<a data-view>`. ⚠️ Cambiar
`location.hash` por JS **no** dispara el render; usar `showView()` o un clic real.

**Estado global:** `window.State` = `{ studios, studiosById, planificador, today }`. La lista de
studios es una proyección ligera y **no incluye `data.reports`/`data.activities`**; esos se leen
por studio (al abrir la ficha) o directo de Supabase.

## Datos (Supabase, proyecto `zmelqffrkwxkbzzutjrg`)

- Tabla **`studios`**: `id` (text PK, p.ej. `"3001"`), columnas `name/type/city/province/score/priority/status`
  + columna `data` (JSONB) con `contact`, `team`, `projects`, `reports`, `activities`, `comms`, etc.
  Los campos de `contact` pueden venir como string o como `{ valor, fuente_url }` → normalizar con `Util.readField`.
  - **Tipos** (`type`): `ARQ` (Arquitectura), `ING` (Ingeniería), `CCRR` (Comunidad de Regantes),
    `OCV` (Promotora/Constructora), `CICA` (Ciclo del agua), `AAPP` (Admin. Pública).
  - **Cuadrante** `priorityQuadrant` Q1–Q9 (estratégico → congelar); lo asigna el batch-qualify.
- Tabla **`meta_planificador`**: una sola fila `id=1`, columna `schedule` (JSONB) = mapa
  `fecha → [ { id, name, city, province, data:{ hora, notas } } ]`. Es la fuente de verdad de la
  ruta de visitas de la semana. El **Google Calendar** (`ma.fernandez@grupogpf.com`) es la fuente
  humana: las visitas se crean ahí y el planificador se reconstruye a partir del calendario.
- Tabla **`briefings`** (paginada; respuestas REST pueden venir con HTTP 206).

## Informes de visita (`data.reports[]`) — 3 formatos coexisten
1. **`visita_importada`** — estructurado, creado al importar un YAML de visita en `detail.js → _ejecutarImportacion`.
   Acciones pendientes en `compromisos.por_nuestra_parte`, `proxima_accion`, `fecha_proxima_visita`; persona en `interlocutor_nombre`/`cargo_interlocutor`.
2. **`.docx` subido** — con `reportJson` estructurado (`compromisos_gpf`, `acciones_internas`,
   `plan_seguimiento`, `temas_pendientes`, `asistentes_empresa`) o solo `fileData`/`data` (base64 binario, no parseable sin abrir el docx).
3. **`informe_v2`** — markdown generado por `Data.generateReport` (prompt SPIN coaching + persistencia en `data.reports`).

Todos pasan por la regla de no-timestamps. Los `"—"` en campos de `reportJson` son placeholders (= vacío).

## Backends e integraciones
- **Supabase** — backend del rediseño (datos + planificador + briefings). Anon key pública embebida en `data-supabase.js`.
- **Firebase Firestore** — solo el **legacy** (`index-legacy.html`). No usar en desarrollo nuevo.
- **Google Apps Script (GAS)** — proxy para la API de Claude/Anthropic (`_claudeCall` en `data.js`) y Calendar.
- **Google Calendar / Sheets** — OAuth 2.0 (token en `localStorage`); el SW debe registrarse como archivo real `sw.js` (las blob: URLs no valen para Service Workers).

## GitHub Actions (`.github/workflows/`)
- `deploy-pages.yml` — `main` → `gh-pages` en cada push a main.
- `tests-daily.yml` — `run-all.js` a las 05:00 UTC; abre un Issue si algo falla. Lanzable manualmente.
- `placsp-daily.yml` — 03:00 UTC: descarga adjudicaciones PLACSP, filtra contra la cartera y hace dual-write (GAS + Supabase) → alimenta las alertas PLACSP de la Bandeja.
- `batch-qualify-node.yml` — recálculo de scoring v2 / cuadrantes (sustituye al cron GAS).
- `supabase-backup-weekly.yml` — backup semanal de Supabase.

## Convenciones
- Idioma de la interfaz: **español**. Nomenclatura JS: camelCase.
- IDs de modales: `modal-{nombre}`; navegación `showView('vista')`; toasts `showNotification(msg, tipo)`; logs `debugLog(msg)`.
- IDs de studios: numéricos como strings (`"3001"`); algunos legacy tienen IDs alfanuméricos de Firestore.
- Sin autenticación de usuario: cualquiera con la URL tiene acceso completo. No meter datos sensibles de clientes.
