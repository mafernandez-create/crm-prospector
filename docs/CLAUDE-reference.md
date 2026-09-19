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
3. **`informe_v2`** — markdown generado por `Data.generateReport` (`tipo_informe`: `estandar` | `spin`) + persistencia en `data.reports`.
   - **Plantilla fija «JRW» (`formato_visual: 'jrw-v1'`, desde 12-sep-2026)** para el formato `estandar`, elegida por Manolo sobre el informe de JRW Arquitectura del 13-ene-2026: cabecera en tabla (fecha, empresa, dirección, web, contacto, tipo de visita, comercial) · 1 Perfil · 2 Objetivos · 3 Temas tratados (3.1 productos, 3.2 necesidades, 3.3 proyectos, 3.4 argumentos, 3.5 competencia) · 4 Oportunidades (tabla Campo|Valor por oportunidad) · 5 Decisiones y compromisos (5.1 GPF, 5.2 cliente, 5.3 pendientes) · 6 Observaciones (6.1 comentarios, 6.2 percepción de marca) · 7 Evaluación (tabla con `Resultado global`) · 8 Plan de acción (tabla Fecha|Acción|Responsable).
   - **Cierre de semana** (`screens/cierre-semana.js`, botón «🗂 Cerrar semana» del planificador): `Data.conciliarSemana(lunes)` cruza la tabla `visitas` de la semana con los informes de las fichas (tolerancia −3/+21 días, como la vista `visitas_sin_informe`); las visitas sin informe reciben un motivo (`visitas.motivo_no_realizada`: no-recibieron | cancelada-cliente | sustituida | reprogramada | otro, detalle en `nota`). Si la casilla **«volver a planificar»** está marcada (`visitas.volver_a_planificar`; NULL = por defecto con `reprogramada`, `no-recibieron`, `cancelada-cliente`) la empresa queda **pendiente de visitar**: `Data.sincronizarPendienteVisita` crea en la ficha una actividad `bandeja:true` marcada `pendiente_visita:true` (`bandeja_id: 'pv'+visita.id`, `visita_fecha`; una sola abierta por ficha, una segunda visita fallida la reutiliza adelantando la fecha), que es lo que leen «Pendiente en la zona», la bandeja y el agente `pendientes-zona` (que además consulta la tabla `visitas` por si no hay ficha). No se crea si la visita tiene más de 60 días ni si el planificador ya la tiene replanificada en fecha futura. Se completa sola al volver a planificar la empresa en una fecha posterior y no pasada (`Data.cerrarPendientesVisitaPlanificadas`, desde `savePlanificador` y desde el propio cierre) o al quitar el motivo / anular la visita (opción «anular» del select → `estado='anulada'`). `_patchActividades` lee la ficha **fresca** de Supabase antes de escribir e invalida la caché local de cartera. El informe de una visita se busca en −3/+21 días pero **sin saltar otra visita del mismo estudio** (`listVisitasPosteriores`): si no, una visita reprogramada contaba dos veces o nunca según el día del cierre. `Data.generateWeeklySummary(lunes)` genera el **resumen semanal** (plantilla fija «resumen-semanal-v1»: cifras · 1 cuadro sinóptico · 2 no realizadas · 3 oportunidades · 4 competencia · 5 acciones · 6 nota) a partir de extractos de los informes (JRW o `visita_importada`), lo guarda en `resumenes_semanales` junto con el **correo a Javier** (plantilla fija, determinista: cifras, lista de informes, no realizadas con motivo) y la `fecha_limite` (martes siguiente). Word propio del módulo (celdas de resultado coloreadas con la paleta JRW).
   - **Llamada de confirmación** (`planificador.js`): si el cliente pide que se le llame antes, la visita guarda `data.confirmar_dias` (1|2). `Util.fechaConfirmacion` calcula el día de la llamada en días laborables (1 día antes de un lunes = viernes) y `Util.confirmacionesDeSchedule` las lista; salen como badge en la tarjeta, recordatorio ámbar en la columna del día de la llamada, primeras en «Tareas» de la vista Hoy (`inicio.js → computeConfirmaciones`, atrasada si la llamada quedó atrás y la visita aún no ha pasado) y como evento propio «📞 Confirmar visita» (09:30, 15 min) al exportar a Google Calendar, además de una nota en el evento de la visita. El botón «✓ Hecha» (Hoy y columna del día) guarda `data.confirmada_el` (`Data.marcarLlamadaConfirmada`) y la llamada deja de recordarse. `savePlanificador` actualiza el planificador de la caché local (si no, recargar dentro de la hora mostraba el anterior y el siguiente guardado lo pisaba). Fechas «hoy» siempre con `Util.toISOLocal` (no UTC).
   - Exportación a Word en `detail.js → _markdownToDocxBlob`: la paleta la fija `Resultado global` (ALTO verde `D5F5E3/145A32` · MEDIO azul `D6EAF8/1B4F72` · MEDIO-BAJO morado `EBDEF0/6C3483` · BAJO rojo `FADBD8/922B21` · sin dato gris). Tablas de 2 columnas cuya cabecera no es «Campo|Valor» se tratan como Campo|Valor (todas las celdas sombreadas); las demás llevan fila de cabecera oscura. Pie «Elaborado por / Fecha del informe». Los históricos de formatos enviados a Javier están en `~/Downloads/Informes_Javier_formatos/`.

Todos pasan por la regla de no-timestamps. Los `"—"` en campos de `reportJson` son placeholders (= vacío).

---

## Candidatos PLACSP (`screens/candidatos.js`, sep-2026)
El cron diario `placsp-daily` (`scripts/placsp-fetch.js`) da de alta cada adjudicatario que no está en el
CRM con `data.revision_placsp = { estado: 'pendiente', creada }`. **No son cartera** hasta que Manolo los
revisa: `Data.indexarCartera` (usado por los tres caminos de `loadAll`) los separa en `State.candidatosPlacsp`
(pendientes + descartadas) y deja en `State.studios` solo cartera y aceptadas; `studiosById` tiene todas.
Decisiones con `Data.revisarCandidatoPlacsp(id, 'aceptada'|'descartada'|'pendiente', extra)`: aceptar pide
provincia (sede, no obra; se sugiere si el lugar de la obra es una capital), ciudad y tipo opcionales y
pone `status='nuevo'`; descartar pone `status='descartado'` y la ficha sigue existiendo para que el cruce
por nombre del cron no la recree. Avisos: contador en la barra lateral y punto en la campana
(`Shell.updateBadges`), tarjeta en Hoy (`inicio.js → candidatosCard`, «N nuevos esta semana»).
Backfill del 19-sep-2026: 141 pendientes + 5 aceptadas (las que ya tenían provincia o actividad).

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
