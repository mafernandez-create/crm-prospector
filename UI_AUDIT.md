# UI_AUDIT.md — Auditoría UI/UX del CRM Prospector Ferroplast

**Fecha**: 2026-05-21
**Propósito**: Documento de contexto para una segunda instancia de Claude que propondrá un rediseño. Auditoría **sin modificar código**.

---

## 1. Stack y arquitectura UI

### Framework y bundler
- **Sin framework**. Aplicación vanilla **single-file HTML** de **34 797 líneas / 1.9 MB** (`index.html`).
- **Sin bundler** (webpack/vite/rollup). El HTML se sirve plano vía GitHub Pages.
- **Sin build step**. Todo el CSS y JS está embebido en el mismo fichero.
- **Sin TypeScript**. JavaScript directo, IIFE/closures globales.
- `package.json` mínimo con sólo 2 dependencias (`docx`, `xlsx`) — no se usa para servir el front, solo para tests Node.

### Librerías CDN
| Librería | Versión | Uso |
|---|---|---|
| Firebase compat | 9.22.2 | App + Firestore |
| Leaflet + leaflet.heat | 1.9.4 / 0.2.0 | Mapa de provincias y heatmap |
| `xlsx.full.min.js` | 0.18.5 | Exportar Excel |
| `docx` UMD | 8.5.0 | Generar informes Word |
| `jszip` | 3.10.1 | Empaquetar / leer docx |
| `@xenova/transformers` | 2.17.2 (lazy) | Whisper local para transcripción de visitas |
| **Google Fonts** | — | `Sora` (titulos) + `DM Sans` (body) |

### Sistema de estilos
- **CSS plano embebido**. ~3 000 líneas dentro de `<style>` al inicio del HTML.
- **CSS variables** en `:root` para tokens (paleta + safe-area-insets).
- **Sin Tailwind**, sin CSS modules, sin styled-components, sin shadcn/Radix/MUI.
- **Estilos inline omnipresentes**: `style="font-size:0.85rem;padding:10px 14px;color:#e2e8f0;…"` en gran parte de los componentes que se generan dinámicamente con plantillas string en JS.

### Estado del PWA
| Pieza | Estado | Notas |
|---|---|---|
| **Manifest** | ✅ inline base64 (no archivo) | name "CRM Prospector Ferroplast", short_name "CRM", display: standalone, theme #0a2540 |
| **Service Worker** | ✅ blob inline registrado con `URL.createObjectURL` y registrado por `navigator.serviceWorker.register(swUrl, { scope: '/' })` línea 25304-25306 |
| **Apple touch icons** | ✅ 4 tamaños SVG inline (152, 167, 180, 192) |
| **Apple splash screens** | ⚠️ Sólo iPhone 15 (393×852) — otros modelos sin splash |
| **Safe area iOS** | ✅ `viewport-fit=cover` + variables `--safe-area-*` |
| **iOS standalone meta** | ✅ `apple-mobile-web-app-capable=yes`, status-bar `black-translucent` |

### Comentario sobre arquitectura
Un solo archivo de 35k líneas es un fuerte limitante para **cualquier rediseño profundo**:
- No hay separación por componentes/responsabilidades.
- Mezcla CSS, HTML, JS, plantillas dinámicas en `innerHTML` y handlers `onclick="…"` inline.
- Cualquier refactor a un framework moderno (React/Vue/Svelte) implica reescritura total.

---

## 2. Mapa de pantallas y rutas

### Routing
- **Sin router**. Una sola URL `/index.html`. Las vistas son `<div class="view">` con clase `.active` togglable.
- Función `showView(viewId, filter?)` cambia la vista activa actualizando clase + título topbar.

### Vistas principales (7)

| ID | Nombre | Ruta nav | Propósito |
|---|---|---|---|
| `view-dashboard` | Dashboard | Sidebar > Dashboard | KPIs, objetivos 2026, pipeline, gráficos actividad, tarea S15, tareas técnicas, sin actividad reciente, tarjeta Acciones Pendientes |
| `view-kanban` | Kanban — Pipeline | Sidebar > Kanban | Pipeline drag-drop por fase B2B o por status |
| `view-studios` | Empresas | Sidebar > Empresas (+ subnav Por Estado) | Listado filtrable, búsqueda, tarjetas |
| `view-bandeja` | Bandeja del Agente | Sidebar > 📬 Bandeja | 9 secciones de alertas / hallazgos (ver §3 abajo) |
| `view-reporte` | Reporte Semanal | Sidebar > 📊 Reporte | KPIs semanales, alertas integradas, lista visitas |
| `view-batch` | Cron Batch nocturno | Sidebar > 🤖 Cron Batch | Métricas del último run automático |
| `view-detail` | Detalle de Empresa | Click en cualquier studio | Ficha completa con 10 tabs |

### Sub-navegación "Por Estado"
Filtros laterales que abren `view-studios` con filtro pre-aplicado:
- 🆕 Nuevos (1349) · 📞 Contactados (16) · 📅 En Reunión (229) · ✅ Ganados (0)

### Modales (25)
Componentes superpuestos como `<div class="modal-overlay" id="modal-XXX">`. Cada uno con su propia configuración inline.

| Modal | Propósito |
|---|---|
| `modal-pending-tasks` | "🎯 Tareas Pendientes de Hoy" al cargar |
| `modal-new-studio` | Nuevo Análisis (búsqueda masiva por provincia/tipo) |
| `modal-manual-studio` | Añadir empresa manualmente |
| `modal-bulk-results` | Resultados de búsqueda masiva (lista importable) |
| `modal-bulk-progress` | Barra de progreso búsqueda masiva |
| `modal-progress` | Generar análisis (un studio) |
| `modal-activity` | Crear actividad |
| `modal-edit-activity` | Editar actividad |
| `modal-add-team-member`, `modal-edit-team-member` | Personas equipo |
| `modal-add-report` | Adjuntar informe |
| `modal-edit-contact` | Editar datos de contacto |
| `modal-status` | Cambiar estado |
| `modal-change-type` | Cambiar tipo de empresa |
| `modal-prescripcion`, `modal-fase-confirmacion` | Workflow prescripción B2B |
| `modal-project-edit` | Editar proyecto |
| `modal-activity-report` | Reporte de actividades por período |
| `modal-informes-periodo` | Listado informes por período |
| `modal-import-excel` | Importación Excel |
| `modal-settings`, `modal-gmail-settings`, `modal-calendar-settings` | Configuración general / Gmail OAuth / Google Calendar OAuth |
| `modal-send-email` | Envío de email (plantilla) |
| `modal-comerciales` | Gestión equipo comercial |
| `modal-visita-overlay` (dinámico) | Grabar/Escribir visita post-encuentro |
| `briefing-modal` (dinámico) | Briefing pre-visita (8 secciones generadas por LLM) |
| `planificador-modal` (dinámico) | Planificador semanal de visitas (con drag-drop) |

### Flujos de usuario principales

**Flujo 1 — Prospección y cualificación nueva empresa**
1. Click "+ Nuevo Análisis" → Modal con tipo + provincia
2. Si vacío: búsqueda masiva con Capa Sectorial §18.5 → resultados en modal con N candidatos
3. Selecciona y pulsa "Importar Seleccionados" → quedan en cartera con `fuente_descubrimiento`
4. Click ficha del nuevo studio → Detail view con tabs

**Flujo 2 — Prepararse para una visita**
1. Sidebar > Empresas (o búsqueda) → click empresa
2. Detail view → click tarjeta "📋 Briefing pre-visita" (verde turquesa)
3. Modal pide fecha + contexto opcional → "Generar Briefing"
4. LLM genera 8 secciones, modal expandible, descarga `.md`, persiste en Firestore

**Flujo 3 — Planificar semana**
1. Botón "📅 Calendario" del topbar → modal `#planificador-modal`
2. Panel izquierdo: filtros (fechas, provincia, ciudad, tipo, estado)
3. Panel central: empresas filtradas
4. Panel derecho: 5 días con slots
5. Drag-drop empresa → día → guardar plan
6. Header acciones: Sync iPhone / Google Calendar / Excel / Word / Sheet Jefe

**Flujo 4 — Después de la visita**
1. Botón "Añadir Actividad" en ficha → modal grabar visita (voz con Whisper local o escribir)
2. Datos estructurados: interlocutor, temas, compromisos, próximo paso, señales
3. Save → genera `registroVisita` con `actualizaciones_propuestas` detectadas por LLM
4. Aparecen en Bandeja > "💡 Propuestas tras visita" con Aceptar/Descartar

**Flujo 5 — Revisión diaria (Bandeja del Agente)**
1. Sidebar > 📬 Bandeja
2. 9 secciones a revisar: distribución cuadrante, candidatos puente, prescriptores sectoriales, deltas, discrepancias, datos obsoletos, propuestas Fase I, referencias cruzadas, acciones pendientes detectadas, visitas pendientes de repetir
3. Filtro de provincia arriba acota las 6 últimas secciones

---

## 3. Inventario de componentes UI

### Componentes reutilizables (clases CSS con uso ≥10)

| Clase | Ocurrencias | Propósito |
|---|---|---|
| `.form-group`, `.form-label`, `.form-input`, `.form-select` | 99-101 cada uno | Formularios — par label+input |
| `.card`, `.card-header`, `.card-body`, `.card-title` | 35-42 cada uno | Contenedor genérico con borde y padding |
| `.nav-item`, `.nav-item-icon`, `.nav-item-badge` | 37-39 | Items del sidebar |
| `.modal-overlay`, `.modal`, `.modal-header`, `.modal-body`, `.modal-footer`, `.modal-close`, `.modal-title` | 22-25 cada uno | Sistema de modales |
| `.info-item`, `.info-label`, `.info-value` | 19-25 | Pares clave/valor de información |
| `.filter-group`, `.filter-label`, `.filter-select` | 16-23 | Bloques de filtros |
| `.tab`, `.tab-panel` | 9-10 | Sistema de pestañas |
| `.bandeja-section`, `.bandeja-section-title`, `.bandeja-card`, `.bandeja-card-name`, `.bandeja-card-meta`, `.bandeja-actions` | 6-10 cada uno | Bandeja del agente |

### Componentes específicos por funcionalidad

- **Sidebar** (`.sidebar`, `.sidebar-header`, `.nav-section`)
- **Topbar** (`.topbar`, `.topbar-title`, `.topbar-actions`, `.search-box`)
- **Stats grid Dashboard** (5 tarjetas en row, cada con `.stat-card`)
- **Matriz 3×3 cuadrantes** (`.matriz-3x3`, `.m-cell`, `.m-row-label`, `.m-axis-label`) — usada en bandeja y en ficha
- **Timeline B2B** (`.timeline`, `.timeline-step`)
- **Kanban columnas** (`.kanban-column`, `.kanban-card`, `.kanban-card-drag-handle`)
- **Planner** (`.planner-container`, `.planner-header`, `.planner-header-actions`, `.planner-body`, `.planner-filters`, `.planner-studios`, `.planner-calendar`, `.calendar-day`, `.calendar-visit`)
- **Mobile bottom nav** (`#mobile-bottom-nav`, `.mobile-nav-btn`, `.mobile-tab-content`) — **desactivado por feature flag** (`crm_use_simple_ui`)
- **Visita modal** (`.visita-overlay`, `.visita-modal`, `.visita-bloque`, `.visita-rec-btn`, `.visita-transcript`)
- **Pull-to-refresh** (`.pull-refresh-indicator` — sólo en `body.device-iphone`)

### Variantes de botón (caos detectado)

Encontré **al menos 14 variantes distintas** de botón, mezclando clases utilitarias con otras ad-hoc:
```
.btn / .btn-primary / .btn-secondary / .btn-danger / .btn-info / .btn-success
.btn-sm / .btn btn-primary btn-sm / .btn-all
.btn-complete-task / .btn-view-studio / .btn-confirmar / .btn-descartar / .btn-filter
```
Más muchos botones definidos completamente inline con `style="background:linear-gradient(...);color:white;border:none;padding:6px 14px;..."`.

### Componentes "huérfanos" o duplicados detectados

| Pieza | Observación |
|---|---|
| `#mobile-app` con 4 tabs Hoy/Buscar/Registrar/Agenda | UI dedicada iOS completa (~700 líneas) ahora desactivada por feature flag — código vivo pero invisible |
| Matriz 3×3 cuadrante | Renderizada en **dos sitios** distintos (Bandeja + Ficha studio "Estado y Scoring") con CSS ligeramente distinto |
| Tabla de actividades por studio | Renderizada manualmente en 8+ sitios distintos con estructuras `<table>` ligeramente diferentes |
| Iconos de tipo/estado | Mezclados como emojis Unicode inline (🏛️ 🏗️ 🌾 📞 ✅ 🔴 🟡 etc.) sin sistema de íconos único |
| Botón "Editar" en cards | Estilizado de manera distinta en cada card (a veces `<button class="btn btn-sm">`, a veces `<button style="...">` inline) |

---

## 4. Tokens de diseño actuales

### Paleta de colores (extraída de `:root`)

| Token | Valor | Uso |
|---|---|---|
| `--primary` | `#0a2540` | Azul navy corporativo (logo, theme PWA, headers) |
| `--secondary` | `#1a3a5c` | Azul navy oscuro complementario |
| `--accent` | `#0066cc` | Azul brillante para botones primarios |
| `--accent-light` | `#e6f0ff` | Fondo azul muy claro |
| `--success` | `#00a67e` | Verde para confirmaciones |
| `--success-light` | `#e6f7f2` | Verde muy claro |
| `--warning` | `#f5a623` | Naranja/amarillo aviso |
| `--warning-light` | `#fef6e6` | — |
| `--danger` | `#dc3545` | Rojo crítico |
| `--danger-light` | `#fdeaea` | — |
| `--info` | `#6366f1` | Violeta (típico Indigo Tailwind) |
| `--info-light` | `#eef2ff` | — |
| `--text` / `--text-primary` | `#1a1a2e` | Texto principal |
| `--muted` | `#6b7c93` | Texto secundario / labels |
| `--surface` / `--bg-secondary` | `#f7f9fc` | Fondo sutil entre cards |
| `--card` / `--bg-primary` | `#ffffff` | Cards |
| `--bg-tertiary` | `#eef2f7` | Fondos terciarios |
| `--border` | `#d9e2ec` | Líneas y bordes |

**Colores fuera del sistema (hardcoded en CSS y estilos inline)**:
- `#7c3aed` / `#6d28d9` (violeta planificador y briefing)
- `#10b981` / `#059669` (verde puente, success alternativo)
- `#f59e0b` / `#d97706` (naranja warning alternativo)
- `#ef4444` / `#dc2626` / `#991b1b` (rojos varios)
- `#3b82f6` / `#1e40af` (azules btn primarios alternativos)
- `#8b5cf6` / `#a78bfa` (violeta IA / referencias académicas)
- `#06b6d4` (cyan INFRA en referencias)
- `#ec4899` (rosa COOP en referencias)
- `#0f766e` / `#0d9488` (turquesa Briefing pre-visita)
- `#2E75B6` / `#1F4E79` / `#D6E4F0` / `#F2F2F2` (azules Word generado)

⚠️ La paleta semántica del CRM (`--success/warning/danger/info`) **se usa poco**. Muchas tarjetas y botones usan colores Tailwind-like (`#7c3aed`, `#10b981`) directamente, lo que produce inconsistencia.

### Tipografía

| Pieza | Familia | Tamaños predominantes |
|---|---|---|
| Títulos (sidebar logo, topbar title, h1-h2-h3) | `Sora` 600-700 | 1rem, 1.1rem, 1.2rem, 1.5rem, 3rem (logo) |
| Body, inputs, labels | `DM Sans` 400-700 | Múltiple (ver abajo) |

**Escala de tamaños fragmentada** — al menos 9 tamaños distintos usados en cuerpo:
- `0.7rem` (66 ocurrencias) — chips muy pequeños
- `0.72rem` (73)
- `0.75rem` (89)
- `0.78rem` (48)
- `0.8rem` (119)
- `0.82rem` (83)
- `0.85rem` (146) — el más usado
- `0.9rem` (58)
- `1rem` (29) — texto "grande"

⚠️ Esto NO es una escala — son valores arbitrarios encontrados en CSS y en estilos inline. Probablemente surgieron de eyeballing.

### Espaciados, radios, sombras

**Radios** (sin sistema claro):
- `4px` (42 usos) — chips, tags pequeños
- `6px` (48) — botones secundarios
- `8px` (143) — el más usado, botones primarios e inputs
- `10px` (69) — cards
- `12px` (60) — cards más grandes
- `16px` (14) — modales y planificador

**Sombras** — al menos 8 variantes distintas, ninguna como token:
```
0 1px 3px rgba(0,0,0,0.08)
0 1px 3px rgba(0,0,0,0.12)
0 1px 4px rgba(0,0,0,0.08)
0 4px 12px rgba(0,0,0,0.08)
0 8px 32px rgba(0,0,0,0.4)
0 10px 25px rgba(0,0,0,0.3)
0 20px 60px rgba(0,0,0,0.5)
0 -4px 20px rgba(0,0,0,0.1)
+ varias con focus rings y outlines
```

**Espaciados (padding/gap)**: no hay sistema. Se ven `4 6 8 10 12 14 16 18 20 24 28 32 40` arbitrariamente.

### Breakpoints

| Breakpoint | Targets aproximados | Notas |
|---|---|---|
| `max-width: 1100px` | Tablet horizontal | Reduce sidebar/typography |
| `max-width: 1024px` | iPad portrait | `.detail-grid` colapsa a 1 col |
| `max-width: 900px` | iPad mini | Algunos grid cambian |
| `max-width: 768px` | Mobile general | **El más usado** — la mayoría de fixes mobile aplican aquí |
| `max-width: 640px` | Mobile estrecho | Algunos targets adicionales |
| `max-width: 480px` | iPhone SE-ish | Compactaciones extra |
| `max-width: 430px` | iPhone Pro Max | CSS específico Dynamic Island |
| `max-width: 393px` | iPhone 15 estándar | — |

⚠️ Demasiados breakpoints sin justificación clara. Una escala 480 / 768 / 1024 / 1280 sería suficiente para el 95% de casos.

---

## 5. Estado responsive y mobile

### Lo que sí está adaptado a mobile (verificado en iframes 393×852 y 430×932)

| Componente | Estado |
|---|---|
| Stat cards Dashboard | ✅ 2 columnas en mobile |
| Sidebar | ✅ overlay con botón hamburger `.mobile-menu-btn` |
| Topbar | ✅ compacto (fix de hoy) |
| Ficha studio (avatar + nombre + badges + matriz 3×3) | ✅ tras fix `min-width: 0` recursivo |
| Bandeja del Agente — secciones (9) | ✅ tarjetas legibles, botones tocables |
| Modal Nuevo Análisis | ✅ inputs grandes |
| Modal Visita Voz (con Whisper local) | ✅ banner privacidad + toggle + transcript |
| Modal Briefing pre-visita | ✅ |
| Reporte Semanal | ✅ KPIs en grid 2 cols |
| Cron Batch | ✅ tarjetas 1 col / 2 cols Pro Max |
| Planificador semanal | ✅ tras fix de hoy: hamburger menu + tabs Filtros/Empresas/Calendario |
| PWA install + splash | ✅ |
| Safe-area iOS notch/Dynamic Island | ✅ `viewport-fit=cover` + `env(safe-area-inset-*)` |

### Áreas táctiles problemáticas

| Componente | Problema |
|---|---|
| Botones `.btn-sm` | Padding 4px 10px — altura ~24px, muy por debajo del mínimo Apple HIG de **44px** |
| Chips `q-chip` de cuadrante | 6×4 px texto 0.62rem en mobile — casi ilegibles |
| Iconos sociales footer | 24-28px sin padding adicional → zonas tocables pequeñas |
| Botones de la sidebar | OK 14px padding, pero el área entre items es 0 → fácil pulsar el incorrecto |
| Tabs ficha studio (10 tabs) | Padding pequeño + scroll horizontal sin indicador |
| Filtros multiselect (provincias, ciudades) | Checkboxes muy juntos en lista vertical |

### Safe-area iOS

✅ Aplicado correctamente:
- `meta viewport-fit=cover`
- Variables `--safe-area-top/bottom/left/right` definidas vía `env(safe-area-inset-*)`
- Usado en: `body.device-iphone .topbar { padding-top: calc(... + var(--safe-area-top)) }` y modales

### Comportamiento PWA standalone

- ✅ Detección con `window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true`
- ⚠️ Hasta hoy: en mode standalone se forzaba `initMobileApp()` con UI tipo native iOS app (4 tabs Hoy/Buscar/Registrar/Agenda). **Desactivado por feature flag** ahora — el iPhone usa el CRM completo.
- El feature flag `localStorage.crm_use_simple_ui === '1'` reactiva esa UI alterna.
- Service Worker registrado vía blob inline → cache offline básico funciona.

### Pull-to-refresh

- ✅ Implementado en `body.device-iphone` con indicador `.pull-refresh-indicator`
- ✅ Fix de hoy: oculto por defecto, solo visible cuando hay gesto activo

---

## 6. Capturas conceptuales en texto

### 6.1 Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│ [☰] Dashboard           [🔍 buscar] [📅Calendario] [+Nuevo] │  topbar
├──┬──────────────────────────────────────────────────────────┤
│  │ [📈 1597 Total]  [✅ 0 Ganados]  [📅 229 Reunión]  ...   │  5 stat cards
│  ├──────────────────────────────────────────────────────────┤
│ S│  🎯 Objetivos 2026 — Bloque individual (85%)             │
│ I│  [Visitas presenciales 109/140 (78%)] [Visitas MUTE 4/30]│  KPIs anuales
│ D│  [Ponencias 0/2] [Catálogo MUTE Pendiente] [Soporte 0]  │
│ E├──────────────────────────────────────────────────────────┤
│ B│  📋 Tareas técnicas 2026   [2 vencidas]              ▼  │  panel colapsable
│ A├──────────────────────────────────────────────────────────┤
│ R│  ⏰ Sin actividad reciente (8 empresas)                  │
│  │  ▸ Ayuntamiento de Jaén — Jaén · nuevo · 20594d         │  lista
│  │  ▸ Ayuntamiento de Mancha Real — Jaén · nuevo · 20594d  │
│  ├──────────────────────────────────────────────────────────┤
│  │  📊 Pipeline de empresas  │  📅 Actividad 4 semanas      │  2 charts
│  ├──────────────────────────────────────────────────────────┤
│  │  🏪 Distribuidores  │  🔁 Conversión  │  ⚡ Velocidad     │  3 KPIs
└──┴──────────────────────────────────────────────────────────┘
```

### 6.2 Bandeja del Agente

```
┌──────────────────────────────────────────────────────────────┐
│ [☰] Bandeja del Agente    [🗺️Todas provincias▾] [🔄Actualizar]│
├──────────────────────────────────────────────────────────────┤
│ 🗂️ Distribución por cuadrante (1585)                         │
│ ┌──────┬──────┬──────┐                                       │
│ │①Estr │②Core │③Volu │ ← Red Alta   D.Alto                  │
│ ├──────┼──────┼──────┤                                       │
│ │④Entr │⑤Estd │⑥Mant │ ← Red Media  D.Medio                 │
│ ├──────┼──────┼──────┤                                       │
│ │⑦Conn │⑧Lige │⑨Cong │ ← Red Baja   D.Bajo                  │
│ └──────┴──────┴──────┘                                       │
├──────────────────────────────────────────────────────────────┤
│ 🌉 Candidatos a cliente puente (0)         vacío con CTA     │
│ 🌍 Prescriptores con proyectos en zona (0) vacío             │
│ 📊 Cambios recientes de cuadrante (16)                       │
│    ▸ HCP Arquitectos · Málaga · Q5→Q6 ↓ baja                │
│    ▸ IDOM Consulting · Málaga · Q5→Q6 ↓                     │
│    ...                                                       │
│ ⚠️ Discrepancias detectadas (0)            vacío explicativo │
│ 🕐 Datos obsoletos (0)                     vacío explicativo │
│ 💡 Propuestas tras visita (0)              vacío             │
│ 🔗 Referencias cruzadas detectadas (4)  [🔄 Refrescar]       │
│    ▸ [AAPP] Junta Andalucía ← NOVA HIDRÁULICA (Sevilla)     │
│    ▸ [CCRR] CR Margen Derecha del Bembézar ← HYFOTEC        │
│ 📞 Acciones pendientes detectadas (51) [🔄 Refrescar]        │
│    ▸ [📧 email] Laguía SA · 2025-12-06 · Enviar doc…        │
│    ▸ [📱 llamada] Laguía SA · Llamar en 48-72h…             │
│ 🚧 Visitas pendientes de repetir (0)   [🔄 Refrescar]        │
└──────────────────────────────────────────────────────────────┘
```

**9 secciones apiladas verticalmente**. Sin prioridad visual ni agrupación.

### 6.3 Ficha de Empresa (Detail view)

```
┌──────────────────────────────────────────────────────────────┐
│ [☰] Detalle de Empresa  [🔍] [📅Calendario] [+Nuevo Análisis] │
├──────────────────────────────────────────────────────────────┤
│        ╔══╗ Klic Arquitectos                                 │
│        ║ K║ 🏛️ Arquitectura · 📍 Málaga · 👤 F: Rafael Jurado │
│        ╚══╝ T: Joseba Robles · 📅 3 mar 2026                 │
│             [Contactado] [Medio] [Q6 Mantenimiento]           │
├──────────────────────────────────────────────────────────────┤
│ [📋 Info] [🎯 B2B] [🤝 Traspaso] [👥 Equipo] [📎 Informes]   │  10 tabs
│ [📱 Redes] [💎 Ventas] [✉️ Comms] [📅 Actividades] [📧 Email]│  scroll horiz
├──────────────────────────────────────────────────────────────┤
│  ⌬ Panel izquierdo (2fr)        ⌬ Panel derecho (1fr)        │  detail-grid
│  ┌────────────────────────┐   ┌──────────────────────────┐  │
│  │ 📞 Contacto    [Editar]│   │ ⚡ Acciones Rápidas       │  │
│  │  📍 Glorieta…           │   │  [📞 Llamar]              │  │
│  │  ☎️  957 948 371        │   │  [✉️ Email]               │  │
│  │  ✉️  contacto@…         │   │  [📅 Visita]              │  │
│  │  🌐 ininco.org         │   │  ───                      │  │
│  └────────────────────────┘   │ 📊 Estado y Scoring       │  │
│  ┌────────────────────────┐   │  [Contactado]             │  │
│  │ 📋 Perfil              │   │  Valor Directo  ▓▓░ 9/15  │  │
│  │  ...                   │   │  Valor de Red   ░░░ 0/15  │  │
│  └────────────────────────┘   │  matriz 3x3 cuadrante     │  │
│  ┌────────────────────────┐   └──────────────────────────┘  │
│  │ 🏗️ Proyectos (N)      │                                   │
│  │  ...                   │   ┌──────────────────────────┐  │
│  └────────────────────────┘   │ 📁 Informes Adjuntos      │  │
│  ┌────────────────────────┐   │  [📎 Adjuntar]            │  │
│  │ 👥 Equipo Profesional  │   │  [✍️ Redactar con IA]     │  │
│  │  ...                   │   │  [📋 Briefing pre-visita] │  │
│  └────────────────────────┘   │  ───                      │  │
│  ┌────────────────────────┐   │  Lista informes generados │  │
│  │ 📐 Proceso prescripción│   └──────────────────────────┘  │
│  │  timeline B2B          │                                   │
│  └────────────────────────┘   ...más cards a la derecha       │
├──────────────────────────────────────────────────────────────┤
│ [📝 Añadir Actividad]              [🔄 Cambiar Estado]        │  fijo abajo
└──────────────────────────────────────────────────────────────┘
```

**10 tabs** + **detail-grid 2:1** con muchas cards. La cantidad de info es enorme.

### 6.4 Planificador semanal (modal)

**Desktop:**
```
┌────────────────────────────────────────────────────────────────────┐
│ 🗓️ Planificador de Visitas | [Total 0] [Asig 17] [Pend 0]   [×]   │
│ [IA] [Sheet Jefe] [G.Calendar] [Sync iPhone] [Excel] [Word] [Doss…]│
│ [Imprimir] [Exportar] [Importar] [Limpiar] [Guardar plan]          │  12 botones
├──────────────┬─────────────────┬──────────────────────────────────┤
│ Filtros 280px│ Empresas 320px  │ Calendario 1fr                   │
│              │                 │                                  │
│ Fecha Inicio │ ┌─────────────┐ │ ┌──── lun 25 ────┐  0/4         │
│ Fecha Fin    │ │ Studio A    │ │ │ Salida → Hotel │              │
│ Visitas/día  │ │ Málaga      │ │ │  Arrastra aquí │              │
│ CCAA □       │ │ #2541       │ │ └────────────────┘              │
│ Provincias □ │ └─────────────┘ │                                  │
│ Ciudades □   │ ┌─────────────┐ │ ┌──── mar 26 ────┐  0/4         │
│ Tipos □      │ │ Studio B    │ │                                  │
│ Estado       │ └─────────────┘ │                                  │
│ [🔍 Buscar]  │ ...             │ ...                              │
│ [🚗 Auto-pl] │                 │                                  │
└──────────────┴─────────────────┴──────────────────────────────────┘
```

**Mobile (tras fix de hoy):**
```
┌───────────────────────────────────────────┐
│ 🗓️ Planificador          [☰] [×]          │  header compacto + hamburger
│ Total: 0 · Asig: 17 · Pend: 0             │
├───────────────────────────────────────────┤
│ [🔍 Filtros] [🏢 Empresas] [📅 Calendario]│  tabs mobile
├───────────────────────────────────────────┤
│ (sólo se muestra la tab activa)           │
│                                           │
│ ☰ → dropdown vertical con las 12 acciones │
└───────────────────────────────────────────┘
```

### 6.5 Modal Visita (post-encuentro)

```
┌──────────────────────────────────────────┐
│ 🎙️ Grabar visita — Klic Arquitectos  [×]│
├──────────────────────────────────────────┤
│ 📅 Fecha y hora: [21/05/2026, 09:05]     │
│                                          │
│ ⚠️ Aviso de privacidad: la transcripción │  banner amarillo
│ usa la API del navegador (Chrome/Safari) │
│ que envía el audio a sus servidores.     │
│ Para visitas con info sensible activa    │
│ 🔒 Modo privado (Whisper local) abajo.   │
│                                          │
│ [🎙️ Iniciar grabación]  Listo  0:00     │
│ ☐ 🔒 Modo privado — Whisper local        │  toggle
│                                          │
│ 🗒️ Transcripción       [🤖 IA] [→Bruto] │
│ [_____________________________________]  │  textarea
│                                          │
│ 👤 Interlocutor:                         │
│ [_____________________________________]  │
│                                          │
│ 💬 Temas tratados:                       │
│ [_____________________________________]  │  textarea
│ ...                                      │
│                                          │
│ 🤝 Compromisos:                          │
│ ➡️ Próximo paso:                         │
│ 🔍 Señales:                              │
├──────────────────────────────────────────┤
│              [Cancelar] [💾 Guardar]    │
└──────────────────────────────────────────┘
```

---

## 7. Puntos de fricción detectados

### Inconsistencias visuales

1. **Paleta semántica ignorada en muchos sitios** — `--success/warning/danger/info` están definidos pero gran parte de los componentes usa colores Tailwind hardcodeados (`#10b981`, `#f59e0b`, `#7c3aed`). Resultado: variaciones visuales del mismo "verde de éxito".
2. **Botones con 14+ variantes** sin tabla de qué usar cuándo. Botones inline conviven con `.btn-primary`, `.btn-confirmar`, `.btn-complete-task`.
3. **Tipografía sin escala** — 9 tamaños distintos en cuerpo (0.7 → 1rem) sin razón conceptual.
4. **Radios inconsistentes** — 4/6/8/10/12/16px usados arbitrariamente. Chips 4px, botones 8px, cards 10-12px, modales 16px → no hay sistema "small/medium/large".
5. **Sombras sin tokens** — 8 variantes distintas para "elevación", elegidas a ojo.
6. **Iconos como emojis Unicode** sin sistema de iconos único. La misma "ficha" puede aparecer con 📋, 📄, 📁 o 📑 según dónde.
7. **Cards con bordes y sombras variables** — algunas con `border: 1px solid var(--border)`, otras con `box-shadow: 0 1px 3px ...`, otras con ambos.

### Patrones que se repiten con variaciones innecesarias

1. **Tabla de actividades** — renderizada al menos 8 veces en JS con HTML manual ligeramente distinto cada vez. Mismo patrón visual, diferente implementación.
2. **Cards de tarjeta tipo "bandeja"** — implementación diferente en cada sección (puente vs sectorial vs delta vs propuestas vs refcruz vs acciones vs novisita).
3. **Modal de tareas pendientes de hoy** — usa estructura propia, no reutiliza `.bandeja-card`.
4. **Matriz 3×3 cuadrante** — duplicada con CSS distinto en Bandeja y en Ficha studio.

### Accesibilidad

| Pieza | Estado |
|---|---|
| `aria-label` | **0 ocurrencias** |
| `tabindex` | **0 ocurrencias** |
| `role="..."` (botón, dialog, etc.) | **0 ocurrencias** |
| Focus visible custom | No declarado — sólo el navegador por defecto |
| Contraste texto/fondo | No verificado sistemáticamente. Muestreo: `--muted` `#6b7c93` sobre fondo blanco da contraste ≈ 4.7 (apenas pasa WCAG AA) |
| Labels de input | OK en formularios (uso de `.form-label`), pero formularios inline a veces sin label |
| Navegación por teclado | No optimizada — los modales no atrapan focus, ESC no siempre cierra |
| Lector de pantalla | Iconos emoji sin texto alternativo, badges sólo con color |

⚠️ **Accesibilidad básica suspende**. Si el CRM va a ser auditado o usado por terceros, necesita trabajo importante aquí.

### Densidad de información

- **Dashboard**: muchos KPIs y secciones apiladas — el usuario tiene que hacer scroll largo para ver todo. Sin posibilidad de personalizar qué ver primero.
- **Ficha studio**: 10 tabs (algunas con sub-cards) — el usuario debe explorar mucho para encontrar lo que busca. Falta una "vista resumen" arriba con lo más importante.
- **Bandeja del Agente**: 9 secciones apiladas sin agrupación por urgencia/tipo.

### Navegación

- **Sin atajos de teclado** (Cmd+K paleta de comandos, atajos para crear actividad, buscar, etc.)
- **Sin breadcrumb** — al estar en una ficha no se sabe de dónde se viene (lista filtrada, búsqueda, Bandeja…)
- **Modal stack profundo posible** — abrir Briefing dentro de ficha dentro de búsqueda — sin indicación de jerarquía.

### Mobile-first (no respetado)

El diseño es claramente **desktop-first** con adaptaciones mobile. Los flujos importantes del usuario móvil (consultar visita de hoy, leer briefing antes de entrar, abrir Maps, redactar informe post-visita) NO tienen primer plano en la UI actual. Se accede a ellos navegando por la jerarquía desktop adaptada.

---

## 8. Contexto de uso real

### Desde Mac (Chrome, pantalla amplia)

**Uso general sin patrón específico**: acceso a TODAS las funcionalidades del CRM. Cualquier vista, cualquier modal.

**Característica importante**: el usuario suele trabajar con **terminal abierto al lado** (ventana del navegador a media pantalla o más estrecha). Por tanto:
- La UI debe convivir bien con ventana entre 600 y 1000px de ancho.
- Sidebar de 260px debería ser colapsable a ~60px con sólo iconos.
- Stats cards deberían pasar de 5 cols a 2-3 cols sin romperse.

**Patrones de uso esperados**:
- Densidad de información alta (no esconder demasiado en menús)
- Atajos de teclado tipo Linear / Notion (paleta de comandos Cmd+K, búsqueda global, atajos para acciones frecuentes)
- Navegación rápida entre studios sin volver al listado cada vez

### Desde iPhone como PWA instalada (modo standalone)

**Casos de uso concretos**, en orden de frecuencia:

#### 1. Consultar datos de la visita (qué cliente, qué hora, dónde)
*"Voy a ver al cliente X de las 11:00, dirección Y, llevo Z minutos para llegar"*
- Pantalla inicial idealmente: lista de las visitas planificadas para HOY con cliente / hora / ciudad
- Cada item con tap a la ficha
- Acceso rápido a la dirección (con maps deep-link)

#### 2. Leer el briefing del cliente justo antes de entrar
*"Quién es este cliente, qué hemos hablado antes, qué le interesa, cómo argumento"*
- **Vista de lectura**: tipografía amplia (≥16px), buen contraste, ancho columna controlado
- **Modo alto contraste opcional** o **modo oscuro** para lectura con luz directa del sol
- Sin distracciones (sin sidebar, sin topbar fijo grande)
- Idealmente fullscreen

#### 3. Localizar la dirección del cliente y abrirla en Maps/Waze
*"¿Dónde está esto? Quiero abrirlo en Waze"*
- **Botón grande y visible** "📍 Abrir en Maps/Waze" en la ficha de cliente
- **Deep links**: `maps://?q=...` (Apple Maps) o `waze://?q=...` con fallback a URL universal
- Detección automática del destino (`q` codificada según `data.contact.address`)

#### 4. Redactar el informe de la visita (en el coche o cafetería, post-visita)
*"Acabo de salir del cliente, voy a apuntar los temas tratados y compromisos antes de que se me olviden"*
- **Campos grandes**, scroll suave entre secciones
- **Autoguardado** en localStorage para no perder texto si el navegador se duerme (al cerrar el coche, abrir Spotify, ...)
- **Teclado adecuado por tipo de campo**: numeric para importes, email para correos, etc.
- Whisper local funcional (no requiere conexión perfecta)

**Acceso rápido al cliente desde la pantalla inicial del móvil**:
- Búsqueda prominente arriba (no en hamburguesa)
- O lista "📅 Próximas visitas hoy" desplegada al cargar

### Lo que NO necesito en móvil con la misma fuerza

- Vistas administrativas complejas (Cron Batch, tablas densas)
- Configuración avanzada (Gmail, Calendar, Comerciales)
- Importación Excel / Word / Informe periódico
- Mapa de provincias con heatmap
- Kanban completo (mejor adaptado a tablet/desktop)

Estos pueden estar accesibles desde un menú secundario, pero **no en primer plano**.

---

## ❓ Preguntas que el diseñador debería responder antes de proponer cambios

### Sobre el alcance del rediseño

1. **¿Rediseño visual sólo (CSS / tokens) o también de información (IA) y comportamiento?** El stack actual (1 archivo HTML 35k líneas, sin framework) limita refactor profundo de componentes.
2. **¿Migrar a framework (React/Vue/Svelte/SolidJS) o quedarnos en vanilla?** Implicaciones de coste vs beneficio. Migrar = reescritura total.
3. **¿Crear sistema de diseño formal con tokens reutilizables?** ¿Adoptar Tailwind/shadcn como estándar o mantener CSS plano con tokens disciplinados?

### Sobre las dos audiencias (desktop densa + mobile táctil)

4. **¿Una sola UI responsive o dos UIs separadas que comparten datos?** El proyecto ya tuvo dos UIs (la mobile dedicada `#mobile-app` ahora desactivada). ¿Volver a esa filosofía y rediseñar la mobile para los 4 flujos prioritarios, o sólo una UI?
5. **¿La UI desktop está pensada para terminal abierto al lado (600-1000px)? ¿Validamos prioritariamente ese rango antes que pantallas 2560?**
6. **¿La PWA mobile debe funcionar offline al 100% para los 4 flujos prioritarios (consultar visita, leer briefing, redactar informe, abrir Maps)?**

### Sobre la información primaria

7. **En el dashboard desktop, ¿qué es lo más importante para Manolo al llegar por la mañana?** Hoy el orden es: stats → objetivos 2026 → tareas técnicas → sin actividad → pipeline → ... Hay demasiado. ¿Qué 3 cosas debe ver primero?
8. **Las 9 secciones de la Bandeja del Agente, ¿deben tener prioridad / agrupación por tipo?** (Urgentes: acciones pendientes + visitas no realizadas / Nuevas: refcruz + propuestas / Estructurales: distribución cuadrante + candidatos)
9. **Los 10 tabs de la ficha studio (Info / B2B / Traspaso / Equipo / Informes / Redes / Ventas / Comms / Actividades / Emails), ¿son demasiados?** ¿Agrupables en 3-5 secciones principales con sub-tabs?

### Sobre la entrada de datos en móvil

10. **Las visitas tienen 5 bloques (Interlocutor, Temas, Compromisos, Próximo paso, Señales). En móvil, ¿es mejor un solo formulario largo, un wizard de 5 pasos, o un editor freeform que el LLM estructura después?**
11. **¿La transcripción Whisper local (~75MB modelo) es viable para todos los iPhones del usuario o queremos un fallback Web Speech API claro?**
12. **¿Autoguardado del informe en localStorage cada cuántos segundos? ¿Restauración explícita al volver vs automática?**

### Sobre integración con sistema operativo

13. **Maps/Waze deep-links: ¿el usuario prefiere Apple Maps por defecto, Waze, o una elección al click?**
14. **¿Notificaciones push (iOS 16.4+) para "tienes visita en 30 min" o "informe pendiente desde hace 24h"?**
15. **¿Compartir con otros comerciales (Sheet Jefe ya existe) requiere también iMessage / WhatsApp deep-links?**

### Sobre accesibilidad

16. **¿Nivel objetivo WCAG (AA mínimo, AAA ideal)?** El nivel actual es muy bajo (0 aria-labels, 0 tabindex, 0 roles).
17. **¿Modo oscuro es requirement?** Útil para lectura en visita con luz exterior. Hoy el CRM es solo claro.
18. **¿Tamaños de fuente adaptables a Dynamic Type de iOS?** Si Manolo o un comercial mayor lee con tamaño grande de iOS, la UI debe escalar.

### Sobre el sistema de iconos

19. **¿Mantenemos emojis Unicode (📋, 🏛️, 📞, …) o adoptamos un sistema de iconos coherente (Lucide / Heroicons / Phosphor)?** Emojis tienen ventajas (legibilidad inmediata, no hace falta lib) pero rompen consistencia visual y varían por OS.

### Sobre el sistema de notificaciones / feedback

20. **`showNotification(text, type)` actual usa toasts en esquina inferior. ¿Sirve para todas las acciones (guardar, error, info)? ¿Añadir inline-feedback en formularios para errores de validación?**

---

## Anexo — Métricas del HTML actual

- Líneas totales: **34 797**
- Tamaño: **1.9 MB**
- Modales declarados: **25** (+ varios dinámicos creados con `document.createElement`)
- Vistas principales: **7**
- Variables CSS en `:root`: **22**
- Media queries `@media (max-width: ...)`: **8 breakpoints distintos**
- Estilos inline con `style="..."`: muchos cientos
- Handlers `onclick="..."` inline: muchos cientos
- Componentes accesibles (con `aria-*`): **0**

---

*Documento generado el 2026-05-21. Sin modificación de código fuente.*
