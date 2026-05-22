# PLAN_IMPLEMENTACION.md — Rediseño UI CRM Prospector v1

**Fecha:** 22 mayo 2026
**Branch:** `feature/ui-redesign` (creada desde `origin/main` · commit base `6597cb1`)
**Handoff de origen:** `Rediseño UI Proyecto X — mayo 2026-handoff.zip` (de Claude Design)
**Variante a implementar:** `CRM Prospector - v1 · Azul corporativo.html` (azul GPF, Barlow Condensed)

---

## 0. Resumen ejecutivo

Reemplazar `index.html` (~34.800 líneas, ~1,9 MB vanilla monolítico) por una nueva UI construida en **vanilla JS/CSS modular**, basada en el handoff de Claude Design. Se conserva **toda la lógica de negocio actual** (Firestore, planificador, briefing IA via GAS, cron, PWA) y se reemplaza únicamente la capa de presentación y navegación.

La implementación es **modular** (varios archivos pequeños en `redesign/`) en lugar de monolítica para que sea mantenible y para poder iterar fase a fase sin riesgo. El swap final a producción es la **última fase** y reversible (se guarda `index-legacy.html`).

**Magnitud total estimada:** GRANDE (25–35 horas de trabajo). El plan está roto en **8 fases**, la más grande (pantallas iPhone) es la única que cae en "grande" por sí sola.

---

## 1. Inventario del handoff de Claude Design

Ya extraído en `~/Downloads/redesign_extract/redise-o-ui-proyecto-x-mayo-2026/`. Compuesto por:

| Archivo | Líneas | Función |
|---|---|---|
| `README.md` | 23 | Instrucciones para agente de implementación |
| `project/tokens.css` | 288 | **Source of truth de tokens** (paleta GPF, tipografía, espaciados) |
| `project/CRM Prospector - v1 · Azul corporativo.html` | 121 | Entry point del prototipo v1 (carga todos los .jsx) |
| `project/CRM Prospector - v2 · Serif cálido.html` | — | Variante alternativa (NO se implementa, fuera de scope) |
| `project/design-canvas.jsx` | 966 | Canvas de artboards (helper visual del prototipo, no se traduce) |
| `project/icons.jsx` | 85 | **Librería iconos Lucide-style** + brand marks Apple/Google/Waze |
| `project/rationale.jsx` | 156 | Documento visual de decisiones (no se traduce, solo se referencia) |
| `project/mobile-screens.jsx` | 582 | **5 pantallas iPhone**: Inicio · Ficha · Cómo llegar · Briefing · Informe |
| `project/desktop-screens.jsx` | 425 | **Desktop**: Dashboard 1280 + Desktop 900 + Cmd+K palette |
| `project/states-a.jsx` | 110 | **Estados** Empty + Loading |
| `project/states-b.jsx` | 243 | **Estados** Error + Success + Keyboard |
| `project/uploads/*.png` | 7 iPhone + 5 Mac | Capturas referencia del CRM actual (la base de la que parte el rediseño) |

**Total a traducir a vanilla: 2.299 líneas de JSX prototipal + 288 líneas de tokens CSS ya válidas.**

---

## 2. Estado actual del código en `main`

- `index.html` — 34.797 líneas, todo embebido (CSS + JS + HTML). Es lo que está en producción en `https://mafernandez-create.github.io/crm-prospector/`.
- `service-worker.js` — registrado vía blob URL desde `index.html`.
- `manifest` — embebido inline base64 en `<head>`.
- `cors-proxy.js`, `gas-batch-qualify.gs`, `duns-apps-script.gs` — backend / proxies, **no se tocan**.
- `scripts/` — librería Node de tests + tools, no UI.
- `redesign/` (en la rama vieja `fix/disable-mobile-simplified-ui`, **no en main**) — borrador rápido que hicimos al recibir el zip. Disponible como referencia.

### Asset disponible (decisión)

En la rama `fix/disable-mobile-simplified-ui` hay **3 commits con 2.951 líneas** de un primer pase del rediseño en `redesign/{tokens.css,styles.css,icons.js,app.js,renderers.js}` + `index-v2.html`. Cubrió Fases 0/1/2/4 en un primer intento rápido. **Decisión a tomar antes de empezar:**

- **A) Cherry-pick estos commits** a `feature/ui-redesign` y refinarlos (ahorra ~5-8 h pero arrastra decisiones rápidas que no pasaron tu validación formal).
- **B) Empezar de cero** sobre `feature/ui-redesign` siguiendo este plan (más limpio, ~5-8 h más de trabajo pero todo pasa por checkpoint).

→ **Recomendación: opción B (limpio)**, salvo que el primer pase ya te haya gustado en revisión visual.

---

## 3. Estrategia de despliegue

**Doble entry point durante el desarrollo:**

- `index.html` — sigue siendo la producción intacta hasta la Fase H.
- `index-redesign.html` — entry nuevo en raíz que carga el rediseño. Accesible en `https://mafernandez-create.github.io/crm-prospector/index-redesign.html` cuando se mergee.

**Estructura de carpetas nueva:**

```
redesign/
├── README.md             ← cómo está organizado el rediseño
├── tokens.css            ← Fase A (paleta, tipo, espacios, radios, sombras)
├── components.css        ← Fase B (estilos de componentes base)
├── icons.js              ← Fase B (librería SVG inline)
├── data.js               ← Fase G (capa Firestore + GAS, extraída de index.html)
├── app.js                ← Fase B (router, state global, init)
├── states.js             ← Fase F (Empty/Loading/Error/Success/Keyboard helpers)
└── screens/
    ├── inicio.js         ← Fase C — Hoy
    ├── studios.js        ← Fase D — Listado empresas + filtros
    ├── detail.js         ← Fase C — Ficha cliente
    ├── briefing.js       ← Fase C — Briefing lectura
    ├── informe.js        ← Fase C — Formulario informe
    ├── comollegar.js     ← Fase C — Bottom sheet
    ├── dashboard.js      ← Fase D — Desktop Dashboard
    ├── bandeja.js        ← Fase D — Bandeja del agente
    └── cmdk.js           ← Fase E — Command palette
```

Razón: cada vista en su archivo facilita lectura, hace los commits pequeños y permite revisar fase por fase. `app.js` los carga en orden por `<script src>` desde `index-redesign.html`. Sin build, sin npm.

---

## 4. Fase A — Tokens de diseño (PEQUEÑA · ~1 h)

### Qué se aplica

Importar **literal** `tokens.css` del handoff a `redesign/tokens.css`. Es vanilla CSS válido ya.

### Tokens clave a aplicar

**Paleta funcional (8 colores únicos en todo el UI):**

| Token | Hex | Uso |
|---|---|---|
| `--gpf-blue-900` | `#0a2d52` | Sidebar, headlines, hero próxima visita |
| `--gpf-blue-700` | `#124b8a` | CTA primario (`--cta`) |
| `--gpf-blue-500` | `#1f72c7` | Enlaces, focus ring |
| `--gpf-blue-100` | `#e6f0fa` | Superficie tintada, chips accent |
| `--mute-red` | `#c8102e` | CTA crítico de campo ("Cómo llegar"), alertas, badge atrasos |
| `--mute-red-dark` | `#8a0b20` | Hover de CTA crítico |
| `--paper-warm` | `#f7f5f1` | Fondo app (NO blanco puro — decisión deliberada) |
| `--ink-{900,700,500,300,200,100}` | grises | Texto + hairlines |

**Tipografías (3 familias):**

| Familia | Uso |
|---|---|
| `Barlow Condensed` (display) | Headlines, KPIs, números grandes, uppercase |
| `Inter` (sans) | UI, tablas, formularios, body |
| `IBM Plex Mono` (mono) | Datos numéricos, kbd, valores tabulares |

**Carga via Google Fonts** (CDN) con `display=swap` (ya está así en el prototipo).

**Escala tipográfica:** 11/12/14/16/18/20/24/30/40/64 px (`--fs-eyebrow` → `--fs-display`).
**Espaciados:** múltiplos de 4: 4/8/12/16/20/24/32/48 (`--sp-1` → `--sp-8`).
**Radios:** 2/6/10/pill (industrial, escasos).
**Sombras:** `--shadow-1` (1px sutil), `--shadow-2` (24px), `--shadow-modal` (60px).
**Safe-area iOS:** `--safe-top: 44px`, `--safe-bot: 34px`.

### Dónde

- Crear `redesign/tokens.css` (copia 1:1 del handoff).
- Crear `redesign/README.md` con la guía de uso del DS.

### Verificación

- Abrir `redesign/tokens.css` y verificar que no hay valores hardcoded en hex en ningún sitio (todo via `var(--…)`).
- Visual check: comparar contra `rationale.jsx` del handoff (el documento de dirección visual).

### Riesgo

Bajo. Es solo añadir archivo nuevo. No toca `index.html`.

---

## 5. Fase B — Componentes base (MEDIANA · ~3-5 h)

### Qué componentes y dónde

**`redesign/components.css`** — todos los estilos comunes traducidos del prototipo:

| Componente | Origen prototipo | Variantes |
|---|---|---|
| `.btn` | `tokens.css:160-186` | `-primary`, `-strong` (rojo), `-ghost`, `-block`, `-lg` |
| `.card` | `tokens.css:188-194` | `.card-flat` |
| `.chip` | `tokens.css:196-213` | `-accent`, `-red`, `-green` |
| `.field`, `.field-label` | `tokens.css:221-242` | con focus visible azul GPF |
| `.iphone` frame chrome | `tokens.css:122-158` | statusbar, home-indicator |
| `.sidebar` | `desktop-screens.jsx:8-94` | collapsed |
| `.topbar` | `desktop-screens.jsx:96-141` | tight |
| `.tabbar` | `mobile-screens.jsx:20-49` | 4 tabs |
| `.topapp` | `mobile-screens.jsx:51-66` | back button, action |
| `.sheet-overlay` + `.sheet` | `mobile-screens.jsx:281-374` (bottom sheet) | open/close animation |
| `.cmdk-overlay` + `.cmdk-palette` + `.cmdk-hit` | `desktop-screens.jsx:329-423` | selected state |
| `.next-visit-hero` | `mobile-screens.jsx:89-113` | con halo azul lateral |
| `.kpi` | `desktop-screens.jsx:144-150` | `.big` |
| `.row` (label/value) | `mobile-screens.jsx:267-277` | last |
| `.skeleton` | `tokens.css:279-288` | shimmer |
| `.progress` | (custom) | barras de objetivos |

**`redesign/icons.js`** — librería de **35 iconos Lucide stroke 1.75** + 3 brand marks (Apple/Google/Waze). Cada uno devuelve string HTML/SVG para inyectar con `.innerHTML`. Origen: `icons.jsx`.

**`redesign/app.js`** — esqueleto:
- Router con hash (`#inicio`, `#detail/3012`, etc.)
- Estado global `window.State` (studios, planificador, currentView, currentStudioId)
- Función `showView(name, params)` que cambia la clase `.active` entre `<section class="view">`s
- Handler global ⌘K
- Loader inicial

### Verificación

- Crear `redesign/_demo.html` (página solo de componentes) con todos los botones, chips, cards, inputs, sheet, cmdk vacíos. Visual side-by-side contra el prototipo HTML del handoff abierto en otra pestaña.
- En cada componente, anotar diferencias menores y aceptarlas explícitamente o corregirlas.

### Riesgo

- **Bajo–medio.** Pixel-perfect es difícil cuando se traducen inline styles de React a CSS classes. Hay riesgo de drift visual del 2-5% que es aceptable según el README del handoff (es prototipo, no producción).
- **Atención:** algunos selectores genéricos como `.btn`, `.card` o `.row` **ya existen en `index.html`**. Para evitar colisión, todos los estilos del rediseño viven dentro de un wrapper `.crm-root` o un namespace. **Sin namespace, si dejamos el index.html montado a la vez, los estilos rompen el CRM viejo.** Para mitigar: el rediseño se aísla con un wrapper top-level y el `index.html` queda fuera de él.

### Magnitud

Mediana (~3-5 h, sobre todo por el ajuste fino de styles).

---

## 6. Fase C — 5 pantallas iPhone (GRANDE · ~6-10 h)

### Orden de implementación

1. **`screens/inicio.js`** — Pantalla "Hoy" (la primera que ve Manolo al abrir la PWA cada día).
2. **`screens/detail.js`** — Ficha del cliente (segunda más usada).
3. **`screens/comollegar.js`** — Bottom sheet (corto, se llama desde inicio + detail + dashboard).
4. **`screens/briefing.js`** — Lectura del briefing pre-visita.
5. **`screens/informe.js`** — Formulario de informe de visita (el más complejo, autosave).

### Pantalla por pantalla — qué se construye y qué archivo se toca

#### C1 · `screens/inicio.js` — Pantalla "Hoy"

**Origen:** `mobile-screens.jsx:68-168` (`ScreenInicio`)

**Contenido:**
- Header con eyebrow día de la semana + h1 "HOY" + avatar circular con iniciales del usuario
- **Card hero "Próxima visita"** (fondo `--gpf-blue-900`, halo decorativo, eyebrow "Próxima visita · en N min", h2 nombre empresa, hora + tipo, dirección, **CTA principal rojo MUTE "Cómo llegar"** btn-lg con sombra roja)
- **Sección "Tareas · N pendientes"** — lista de cards con border-left rojo si atrasada
- **Sección "Objetivos · mes"** — card con 2 progress bars (visitas presenciales, visitas MUTE)

**Datos:**
- Próxima visita: lectura de `_meta/planificador.schedule[fecha].(0)`
- Tareas pendientes: studios con `priority='alta'` o `score≥8` cuyo `lastInteraction < hoy-7d`
- Objetivos: cuenta `data.reports[]` del año actual + heurística MUTE (texto)

**Sin cambios pendientes con respecto a la versión rápida.**

#### C2 · `screens/detail.js` — Ficha del cliente

**Origen:** `mobile-screens.jsx:170-265` (`ScreenFicha`) + `Row` helper

**Contenido:**
- **Top app bar** con flecha Atrás (`showView('studios')`) + título "Ficha cliente" + botón editar
- **Identidad:** avatar cuadrado 56×56 azul oscuro con iniciales, h2 nombre, chips de tipo (`Arquitectura`, `Q9 · Congelar`)
- **Bloque dirección azul claro** con icono MapPin, dirección + ciudad, **CTA rojo "Cómo llegar"**
- **Contacto rápido grid 2x1:** btn-ghost Llamar (`tel:`) + btn-ghost Email (`mailto:`)
- **Briefing preview:** eyebrow "Briefing pre-visita" + timestamp + card con resumen recortado + CTA primary "Leer briefing completo"
- **Equipo:** lista de personas (nombre, rol, phone/email links)
- **Datos clave** tabla label/value: Comercial, Técnico, Prioridad, Creado
- **CTA bottom:** btn-primary block "Redactar informe de visita"

**Datos:**
- Studio actual: `State.studiosById[currentStudioId]`
- Briefing: query async a `briefings/{id}/items/` (último doc)
- Equipo: `studio.data.team[]`
- Phone/email: `studio.data.contact.{phone,email}` con manejo de `{valor, fuente_url, ...}` o string directo

#### C3 · `screens/comollegar.js` — Bottom sheet

**Origen:** `mobile-screens.jsx:281-374` (`ScreenComoLlegar`)

**Contenido:**
- Overlay con fondo `rgba(0,0,0,.45)`
- Sheet bottom con handle visual (drag indicator)
- Eyebrow "Cómo llegar" + X cerrar
- Dirección grande + ciudad/cp
- **Map preview placeholder** SVG con calles dibujadas (no real map, decorativo)
- **3 opciones:**
  - Apple Maps → `maps://maps.apple.com/?q=…`
  - Google Maps → `https://maps.google.com/?q=…`
  - Waze → `https://waze.com/ul?q=…`
- Botón "Copiar dirección" con feedback inline

**Datos:** dirección compuesta desde `studio.data.contact.address` + `studio.city` + `studio.province`.

#### C4 · `screens/briefing.js` — Lectura

**Origen:** `mobile-screens.jsx:378-460` (`ScreenBriefing`) + `KeyFact`

**Contenido:**
- Header sticky con back arrow + eyebrow "Briefing · 22 may 2026" + h2 nombre empresa + botones modo lectura (Sun) y guardar (Save)
- **3 key facts** en flexbox: Ubicación / Cuadrante / Influencia (puntos)
- **8 secciones** con eyebrow `01 ·`, `02 ·`, etc. en azul GPF, body en `--fg-2` para legibilidad bajo sol:
  - 01 · Resumen ejecutivo
  - 02 · Histórico reciente
  - 03 · Compromisos abiertos
  - 04 · Señales de mercado
  - 05 · Perfil decisor
  - 06 · Capa sectorial
  - 07 · Próximos pasos
  - 08 · Riesgos
- **CTA flotante bottom** "Empezar informe de la visita" con sombra

**Datos:** `briefings/{studioId}/items/` (más reciente).

#### C5 · `screens/informe.js` — Formulario

**Origen:** `mobile-screens.jsx:471-580` (`ScreenInforme`)

**Contenido:**
- Header con X cerrar + título "Informe de visita" + **indicador autosave en verde** (punto verde + "Guardado · hace 12 s")
- Bloque empresa fijo (chip azul claro)
- **Segmented control** Modalidad: "Visita real" / "Ficticia" (active state con sombra)
- Input date fecha (con icono Calendar a la derecha)
- Select comercial de zona (con icono ChevronDown)
- Checkbox cuadrado azul "Visita iniciada por prescripción" en panel paper-warm
- **Textarea grande** (`min-height: 180px`) "Tus notas de la visita" con placeholder + contador caracteres
- **Sticky CTA bottom** con backdrop blur: Borrador (ghost) + Generar informe (primary)

**Datos / persistencia:**
- Autosave a `localStorage` cada keystroke (key: `redesign:informe:draft:{studioId}`)
- Recarga del borrador al volver a abrir
- "Generar informe" → endpoint GAS (wireado en Fase G)

### Verificación

- Cada pantalla → abrir en `Chrome` a 390×844 (devtools viewport iPhone 14 Pro) y comparar contra el prototipo en pestaña paralela.
- Probar en iPhone real: abrir GitHub Pages URL en Safari, "Añadir a pantalla de inicio", verificar safe-area, swipe back, scroll, autosave.
- **No-regresión:** los tests de `scripts/tests/` (82 assertions) siguen pasando.

### Riesgos

1. **Múltiples representaciones de campos en Firestore.** `contact.phone` puede ser `string` o `{valor, fuente_url, ...}`. Hay que normalizar al leer.
2. **Briefing puede no existir** para el cliente. Estado empty necesario (Fase F).
3. **Notification permission** para autosave warning si pierde foco con cambios.
4. **El autosave puede llenar localStorage** si nunca se purga (cada studio mete un borrador). Mitigación: ttl 30 días en limpieza al abrir la app.

### Magnitud

Grande (6–10 h). 5 pantallas, cada una con datos reales y casos vacíos.

---

## 7. Fase D — 3 pantallas Desktop (MEDIANA · ~3-4 h)

### D1 · `screens/dashboard.js` — Dashboard 1280px

**Origen:** `desktop-screens.jsx:154-262` (`DesktopDashboard`)

**Layout:**
- Title row (eyebrow fecha + h1 "DASHBOARD" + chips filtro Andalucía/2026/Cuadrantes + botón filter)
- **KPI strip 5 columnas:** Total empresas · Ganados · En reunión · Nuevos (7d) · Prioridad alta
- **Main split 1.6fr 1fr:**
  - Card "Objetivos 2026 · bloque individual" con porcentaje grande + 5 rows con progress bar + valor x/y
  - Sub-columna: card próxima visita azul oscuro + card "Atrasados" con 3 entries

**Datos:** mismos cálculos que inicio.js pero con cifras más grandes y filtros.

### D2 · `screens/dashboard.js` (responsive 900px)

**Origen:** `desktop-screens.jsx:266-325` (`Desktop900`)

Cuando viewport < 1000px:
- Sidebar colapsada a 64px (solo iconos)
- Topbar tight (padding 16px)
- KPI grid 3+2 en lugar de 5 columnas
- Tabla compacta de últimas actividades

**Implementación:** mismo `dashboard.js`, condicionales CSS via `@media (max-width:1000px)` y JS adaptando layout.

### D3 · `screens/bandeja.js` — Bandeja del agente

**No está en el handoff visualmente** pero es vista crítica del CRM. Diseño derivado de los tokens del DS:

**Contenido:**
- Header "Bandeja del agente · 22 may 2026" + tagline "Acciones priorizadas que el agente ha detectado"
- **Matriz 3×3 de cuadrantes Q1-Q9** — cada celda con color de su cuadrante DS, label, cuenta de empresas, cuenta de activas <30d. Click navega al listado filtrado.
- Grid 2 columnas:
  - Card "Cuentas enfriándose" (score≥7, lastInteraction <-45d)
  - Card "Alto potencial sin visitar" (score≥8, sin reports)
- Card span-2 "Visitas fallidas / a reprogramar" (regex en reports recientes)

**Datos:** todo desde `State.studios` con cálculos in-memory.

### Verificación

- Chrome viewport 1280×800 vs 900×720 (Mac con terminal al lado)
- Sidebar collapse funciona en transición de ancho
- KPIs no se rompen al pasar de 5 a 3 columnas

### Riesgos

- **Bajo–medio.** Layout responsive con flex/grid es estándar. El único riesgo: que el sidebar colapsado no preserve el item activo (CSS-only sin JS).

### Magnitud

Mediana (~3-4 h).

---

## 8. Fase E — Cmd+K Palette (PEQUEÑA · ~1,5 h)

### Origen

`desktop-screens.jsx:329-423` (`CmdK`, `Hit`, `Kbd`, `SectionK`)

### Contenido

- Overlay con fondo `rgba(10,45,82,.45)`
- Palette 640px centrada (top 120px) con sombra modal
- Input row con icono Search + input + kbd "esc"
- Resultados scrollable agrupados:
  - **Empresas** — fuzzy match de `name`, `city`, `province` en `State.studios`
  - **Acciones rápidas** — Nuevo análisis (N) · Redactar informe (R) · Briefing (B) · Cómo llegar al próximo (G)
  - **Navegar a…** — ⌘1 Hoy · ⌘2 Empresas · ⌘3 Dashboard · ⌘4 Bandeja
  - **Filtros guardados** — Atrasados >14d · Q1 Estratégico · etc.
- Footer monospace con kbd hints

### Comportamiento

- **⌘K abre / ESC cierra** (registrado a nivel `window` en `app.js`)
- **↑↓ navega selección** (highlight con `--gpf-blue-100`)
- **↵ ejecuta acción seleccionada**
- **TAB filtra por sección**

### Dónde

`redesign/screens/cmdk.js`. Se monta como nodo siempre presente en el DOM (overlay oculto por defecto).

### Verificación

Probar atajos en cada vista de la app. Test E2E corto: ⌘K → escribir "huesa" → enter → llega a la ficha de J. Huesa.

### Riesgos

Bajo. Fuzzy matching simple con `.includes()` es suficiente para 1.600 estudios (sub-50ms).

### Magnitud

Pequeña (~1,5 h).

---

## 9. Fase F — Estados clave (PEQUEÑA-MEDIANA · ~2 h)

### Origen

- `states-a.jsx` — `ScreenEmpty`, `ScreenLoading`
- `states-b.jsx` — `ScreenError`, `ScreenSuccess`, `ScreenKeyboard`

### Estados a implementar

1. **Empty** — Hoy sin tareas: ilustración circular azul + título + descripción + 2 CTAs
2. **Loading** — Briefing generándose: banner con spinner + "Analizando capa N de 3" + skeleton shimmer en 3 grupos
3. **Error** — Sin conexión: banner rojo con icono Alert + descripción + "borrador guardado localmente" + CTAs Reintentar / Seguir editando + detalle técnico expandible
4. **Success** — Informe enviado: círculo verde con check + título + descripción + barra de progreso del objetivo anual + tabla próximos pasos + CTAs Ver informe / Hoy
5. **Keyboard** — Informe + teclado iOS abierto: header compacto + solo textarea visible + sticky CTA por encima del teclado iOS simulado

### Implementación

`redesign/states.js` expone helpers `window.States.{showEmpty,showLoading,showError,showSuccess,showKeyboard}` que reciben el id del nodo donde montarse y los props (icon, title, body, ctas, stats…).

Cada vista (inicio, detail, briefing, informe) decide cuándo invocar el estado correspondiente.

### Verificación

- Storybook-style: añadir un panel debug que permita forzar cada estado en cada vista para revisión visual
- Test funcional: desconectar la red en devtools y comprobar el estado Error en el formulario de informe

### Riesgos

- El estado Keyboard depende de `visualViewport` (iOS Safari) — fallback en navegadores que no lo soportan: comportamiento normal sin reposicionado.

### Magnitud

Pequeña-mediana (~2 h).

---

## 10. Fase G — Wiring del data layer + GAS endpoints (MEDIANA · ~3 h)

### Qué se mueve

Extraer del actual `index.html` solo lo necesario y aislarlo en `redesign/data.js`. **No se reescribe lógica — se referencia o se copia tal cual.**

| Función del actual `index.html` | Nuevo en `redesign/data.js` | Comentarios |
|---|---|---|
| `initFirebase()` | `Data.init()` | Carga Firebase compat SDK del mismo CDN |
| `syncFromFirebase()` | `Data.loadAll()` | Carga studios + planificador en paralelo |
| `getNextFirebaseId()` | `Data.getNextStudioId()` | Para nuevo análisis |
| `generarBriefingNarrativo()` | `Data.generateBriefing(studioId, fecha, contexto)` | Mantiene la llamada al GAS endpoint (`Bloque 9 §19.2`) |
| `openInformeIAModal()` lógica de generación | `Data.generateReport(studioId, notas, modalidad, …)` | Llamada al endpoint GAS |
| `subirVisitasSheet()` | `Data.publishVisitsToSheet()` | OAuth Google Sheets (token en localStorage) |
| `callAPI(action, params)` | `Data.callGAS(action, params)` | Proxy genérico a GAS Web App |

**Endpoints GAS que se reutilizan tal cual** (no se redeploya):
- `https://script.google.com/macros/s/AKfycb…/exec`
- Actions: `briefingNarrativo`, `informeIA`, `placspCrosscheck`, `batchQualify`, …

### LocalStorage namespace

Reservar `redesign:*` para no colisionar con keys del CRM viejo:
- `redesign:informe:draft:{id}` — borradores informe
- `redesign:briefing:cache:{id}` — caché briefing
- `redesign:settings` — preferencias de usuario

Las **claves viejas** (`ferroplast_crm_data_TEST`, `ferroplast_sheets_settings`) se mantienen — el rediseño las **lee** (token OAuth) pero **no las modifica**.

### Verificación

- Test de integración: ejecutar `scripts/tests/integration/test-firestore-read.js` (debe seguir pasando)
- Test del endpoint GAS: enviar una petición briefing desde la consola del rediseño y verificar respuesta
- Verificar OAuth Google Sheets: el token sigue siendo válido y refrescable

### Riesgos

1. **CORS desde GitHub Pages al GAS endpoint** — ya estaba resuelto en el actual, hay que mantener el mismo origen y headers.
2. **OAuth de Google Sheets** — si refactorizo demasiado el flow, puedo invalidar el token. Mitigación: **no tocar el flow**, solo invocarlo.
3. **Firebase compat v9 vs modular v10+** — mantener compat para no romper.
4. **Quota Firestore** — el rediseño hace fetch al cargar; con caché en `State` no se repite.

### Magnitud

Mediana (~3 h).

---

## 11. Fase H — Swap a producción (PEQUEÑA · ~0,5 h pero CRÍTICA)

### Procedimiento

1. **Rename `index.html` → `index-legacy.html`.** Sigue siendo accesible en `…/index-legacy.html` por si hay que rollback.
2. **Rename `index-redesign.html` → `index.html`.** El rediseño pasa a ser la producción.
3. **Mantener el service worker compatible:** verificar que la URL del SW (`/service-worker.js`) sigue válida y no rompe la caché PWA. **Si rompe, bumpear el version del cache.**
4. **Smoke test en producción** desde el iPhone real (PWA instalada) y desde Mac.
5. Si hay errores: `git revert` del commit del swap (vuelve a `index-legacy.html` activo).

### Plan de rollback (≤30 segundos)

```bash
git revert <commit-swap>
git push
# GH Pages redeploya en ~1 min con el original
```

### Verificación final pre-swap

- ✅ Todas las pantallas funcionan con datos reales
- ✅ Generación briefing IA funciona (vía GAS)
- ✅ Generación informe IA funciona (vía GAS)
- ✅ Cómo llegar abre Apple Maps en iPhone
- ✅ Cmd+K funciona
- ✅ PWA "Añadir a pantalla de inicio" sigue funcionando con el mismo manifest
- ✅ El planificador semanal sigue editable
- ✅ Tests `scripts/tests/run-all.js` → 82/82 pass
- ✅ Cron batch (`_meta/batch_checkpoint`) sigue actualizando

### Riesgos

- **Críticos.** Es el punto de no retorno (aunque hay rollback).
- **Mitigación:** dejar `index-legacy.html` accesible 1 mes mínimo. Comunicárselo al jefe ("usa `…/index.html` para el rediseño y `…/index-legacy.html` si algo no va").

### Magnitud

Pequeña (~30 min de swap + ~1 h de smoke testing).

---

## 12. Riesgos generales del proyecto

| Riesgo | Impacto | Mitigación |
|---|---|---|
| **Colisión de selectores CSS** entre `index.html` viejo y rediseño (`.btn`, `.card`, `.row`, `.chip`) | Visual roto en el viejo si están servidos a la vez | Namespace `crm-root` en wrappers del rediseño durante desarrollo |
| **PWA caché agresiva** del service worker | Usuarios pueden ver versión vieja después del swap | Bumpear version del SW en el commit del swap |
| **localStorage del usuario** con OAuth tokens activos | Borrarlo deslogea de Google Sheets | El rediseño solo **lee** las claves antiguas, no las modifica |
| **Firestore quota** REST pública | Si hago muchas re-cargas durante dev, agoto cuota | Caché en `State` + recarga manual con botón refresh |
| **Carga inicial** lenta en iPhone 4G | Fuentes (3 familias × pesos) pueden tardar | `display=swap` en Google Fonts + preconnect, fuentes críticas inline |
| **Drift visual** vs prototipo handoff | Decisiones de estilo no 100% pixel-perfect | Aceptable según el README del handoff. Anotar drifts en el commit |
| **Pérdida de funciones del actual `index.html`** | Cron, importar Excel, planificador editor, mapa caliente | Estos seguirán accesibles en `index-legacy.html` post-swap |
| **iPhone safe-area** mal calculada con notch dinámico | UI cortada en iPhone 15 Pro vs 14 | `viewport-fit=cover` + variables CSS `env(safe-area-inset-*)` |
| **GAS Web App URL cambia** si se redeploya | Rotura silenciosa de briefing IA | URL hardcodeada en `data.js`, igual que en el actual |

---

## 13. Verificación general por fase

| Fase | Visual | Funcional | Tests automatizados |
|---|---|---|---|
| A · Tokens | Diff vs `rationale.jsx` del prototipo | n/a | n/a |
| B · Componentes | `_demo.html` side-by-side | n/a | n/a |
| C · iPhone | Chrome devtools 390×844 + iPhone real | Tap cada CTA, autosave, navegación back | `tests/integration/*` |
| D · Desktop | Chrome 1280 + 900 | Sidebar collapse, filtros chips | n/a |
| E · Cmd+K | Visual prototipo | ⌘K abre/cierra, ↑↓↵ funcionan | Integración: query "huesa" → ficha |
| F · Estados | Cada estado en cada vista vía debug panel | Errores forzados (network offline), success forzado | n/a |
| G · Data | n/a | Briefing real funciona, informe real persiste | `scripts/tests/run-all.js → 82/82` |
| H · Swap | Smoke test producción | Todas las funciones del actual siguen ahí | `tests-daily.yml` cron |

---

## 14. Estimaciones de magnitud por fase

| Fase | Magnitud | Estimación |
|---|---|---|
| A · Tokens | **Pequeña** | 1 h |
| B · Componentes base + iconos + shell | **Mediana** | 3–5 h |
| C · 5 pantallas iPhone | **Grande** | 6–10 h |
| D · 3 pantallas Desktop (Dashboard 1280/900 + Bandeja) | **Mediana** | 3–4 h |
| E · Cmd+K palette | **Pequeña** | 1,5 h |
| F · 5 estados clave | **Pequeña-mediana** | 2 h |
| G · Wiring data layer + GAS | **Mediana** | 3 h |
| H · Swap producción + smoke test | **Pequeña** | 1 h |
| **TOTAL** | — | **20,5 – 27,5 h** |

---

## 15. Estructura de commits

Un commit por fase, en este orden:

```
feat(redesign): A · tokens — paleta GPF, tipo, espaciados, radios
feat(redesign): B · componentes base + iconos + app shell
feat(redesign): C1 · iPhone "Hoy" (próxima visita + tareas + objetivos)
feat(redesign): C2 · iPhone "Ficha cliente"
feat(redesign): C3 · iPhone "Cómo llegar" bottom sheet
feat(redesign): C4 · iPhone "Briefing" lectura
feat(redesign): C5 · iPhone "Informe de visita" + autosave
feat(redesign): D1 · Desktop Dashboard 1280
feat(redesign): D2 · Desktop responsive 900px
feat(redesign): D3 · Bandeja del agente
feat(redesign): E · Cmd+K palette
feat(redesign): F · estados Empty/Loading/Error/Success/Keyboard
feat(redesign): G · data layer + wiring GAS endpoints
feat(redesign): H · swap producción (rename index.html → legacy)
```

**14 commits**, uno por subfase, mensaje descriptivo en cada uno, pausa para review tras cada commit (o tras cada fase agrupada A, B, C, D, …).

---

## 16. Preguntas abiertas que necesito que decidas antes de empezar

1. **¿Reusamos los 3 commits del primer pase de `fix/disable-mobile-simplified-ui`** (cherry-pick) o **empezamos de cero** sobre esta rama?
   → Recomendación: empezar de cero. Más limpio, sin decisiones rápidas no validadas.

2. **¿Renderizamos el rediseño con un wrapper `.crm-root`** para que `index.html` viejo y `index-redesign.html` puedan convivir sin pisarse, **o** convivencia es problema (vamos a swap directo)?
   → Recomendación: con wrapper. Cuesta 0 minutos y nos da margen.

3. **¿Los placeholders de "Modo lectura" (sol) y "Guardar" del Briefing son MVP** o se quedan para Fase 5 (post-swap)?
   → Recomendación: stubs sin función, refinamiento post-swap.

4. **¿Implementamos el panel debug** para forzar estados o el QA visual lo haces tú manualmente desconectando red?
   → Recomendación: panel debug. 1 h extra de inversión que paga su mantenimiento.

5. **¿Pausamos tras cada fase (A, B, C, D, E, F, G, H) o tras cada subfase de C** (C1, C2, C3, C4, C5)?
   → Recomendación: tras cada subfase de C (las pantallas iPhone), porque son el grueso del valor para tu uso diario y conviene validar visualmente una a una.

6. **¿Hace falta una página `_demo.html` con todos los componentes** para que el equipo (o tú mismo) puedan inspeccionar el DS, o lo dejamos solo en docs?
   → Recomendación: sí, mínimo viable. 30 min de trabajo, valor permanente para futuras iteraciones.

---

## 17. Aprobación

Espero tu **luz verde explícita** para empezar la **Fase A** y tu decisión sobre las 6 preguntas abiertas. Si todas mis recomendaciones te parecen bien, basta con "ok, opciones recomendadas" y arranco.

**Tras tu OK** procederé fase a fase con un commit por fase y pausa para revisión al final de cada una.

— Claude, 22 mayo 2026
