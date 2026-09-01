# CLAUDE — Referencia detallada (carga bajo demanda)

> Arquitectura detallada y esquemas extraídos de `CLAUDE.md` para aligerar el contexto
> de cada sesión. Las reglas duraderas (las dos OBLIGATORIO, comandos, despliegue,
> convenciones) viven en `CLAUDE.md`.

---

## Arquitectura del rediseño (`redesign/`) — módulos

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

---

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
- Tabla **`visitas`** — histórico de visitas, **solo añade**. Existe porque `meta_planificador.schedule`
  se reescribe entero en cada guardado: al replanificar, las semanas viejas desaparecen. Sin este
  histórico el CRM **no guarda en ningún sitio que una visita se haya celebrado** —el único rastro
  sería su informe—, así que «¿qué visitas no tienen informe?» solo podía contestarse cruzando a mano
  la hoja del jefe contra los nombres de las fichas.
  - Columnas: `fecha`, `studio_id` (nulo si la empresa nunca se dio de alta), `empresa`, `ruta`,
    `estado` (`planificada` | `realizada` | `anulada`), `origen` (`planificador` | `hoja-jefe` | `manual`).
  - Lo rellena `data-supabase.js → archivarVisitas()` en cada `savePlanificador`, vía el RPC
    `archivar_visitas(jsonb)` (idempotente; las claves de unicidad son parciales y PostgREST no sabe
    expresar ese `ON CONFLICT`). **Omite las entradas con `reserva: true`** — son clientes de reserva
    y notas de logística (pernoctas, regresos), no visitas.
  - Sembrada en sep-2026 con el cruce de la hoja del jefe de ene–jul 2026.
  - Vista **`visitas_sin_informe`**: visitas pasadas, no anuladas, sin informe fechado en la visita o
    después (margen de 3 días). Tiende a señalar de más: las fechas de informe no son fiables —hay
    días de carga masiva con 18 informes—, así que es una lista de deuda, no una acusación.
  - Una ruta anunciada y no ejecutada se marca `estado='anulada'`, para distinguir «no la hice» de
    «no la escribí». Es lo que pasó con febrero de 2026.

---

## Informes de visita (`data.reports[]`) — 3 formatos coexisten
1. **`visita_importada`** — estructurado, creado al importar un YAML de visita en `detail.js → _ejecutarImportacion`.
   Acciones pendientes en `compromisos.por_nuestra_parte`, `proxima_accion`, `fecha_proxima_visita`; persona en `interlocutor_nombre`/`cargo_interlocutor`.
2. **`.docx` subido** — con `reportJson` estructurado (`compromisos_gpf`, `acciones_internas`,
   `plan_seguimiento`, `temas_pendientes`, `asistentes_empresa`) o solo `fileData`/`data` (base64 binario, no parseable sin abrir el docx).
3. **`informe_v2`** — markdown generado por `Data.generateReport` (prompt SPIN coaching + persistencia en `data.reports`).

Todos pasan por la regla de no-timestamps. Los `"—"` en campos de `reportJson` son placeholders (= vacío).

---

## Backends e integraciones
- **Supabase** — backend del rediseño (datos + planificador + briefings). Anon key pública embebida en `data-supabase.js`.
- **Firebase Firestore** — solo el **legacy** (`index-legacy.html`). No usar en desarrollo nuevo.
- **Google Apps Script (GAS)** — proxy para la API de Claude/Anthropic (`_claudeCall` en `data.js`) y Calendar.
- **Google Calendar / Sheets** — OAuth 2.0 (token en `localStorage`); el SW debe registrarse como archivo real `sw.js` (las blob: URLs no valen para Service Workers).

---

## GitHub Actions (`.github/workflows/`)
- `deploy-pages.yml` — `main` → `gh-pages` en cada push a main.
- `tests-daily.yml` — `run-all.js` a las 05:00 UTC; abre un Issue si algo falla. Lanzable manualmente.
- `placsp-daily.yml` — 03:00 UTC: descarga adjudicaciones PLACSP, filtra contra la cartera y hace dual-write (GAS + Supabase) → alimenta las alertas PLACSP de la Bandeja.
- `batch-qualify-node.yml` — recálculo de scoring v2 / cuadrantes (sustituye al cron GAS).
- `supabase-backup-weekly.yml` — backup semanal de Supabase.
