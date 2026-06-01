# DIAGNÓSTICO DEL PROYECTO — CRM Prospector Ferroplast/GPF
_Generado: 11 de mayo de 2026 · Directorio: `/Users/ma.fernandez/Documents/crm`_

---

## 1. CLAUDE.md actual

```markdown
# CRM Prospector Ferroplast

## Descripcion
CRM B2B de ventas para prospección de estudios de arquitectura e ingeniería en España.
Aplicación single-page (SPA) en un solo archivo HTML (~27.000 líneas, ~1.6 MB).

## Tech Stack
- **Frontend**: Vanilla JS, CSS3 (custom properties), HTML5
- **PWA**: Service Worker, soporte iOS (splash screens, iconos)
- **Base de datos**: Firebase Firestore (SDK compat v9 via CDN)
- **Librerías CDN**: Leaflet.js (mapas), XLSX.js (Excel), docx.js (Word), Google Fonts (DM Sans, Sora)
- **Sin framework** - todo vanilla

## Almacenamiento de Datos

### Fuente de verdad: Firebase Firestore
- Proyecto: `ferroplast-crm`
- Colección principal: `studios` — directorio de empresas
- Colección meta: `_meta` — documentos de configuración y planificador
- SDK: Firebase compat v9 (`firebase-app-compat.js` + `firebase-firestore-compat.js`)
- Sin autenticación de usuario: Firestore accesible directamente desde el navegador

### Caché local (fallback)
- **localStorage** — tokens OAuth, configuración de usuario, caché de datos
  - Key de datos: `ferroplast_crm_data_TEST`
  - Key de Sheets OAuth: `ferroplast_sheets_settings` → `{accessToken, tokenExpiry}`
- **IndexedDB** — DB: `FerroplastCRM_TEST`, stores: `studios`, `activities` (uso secundario)

### Registro compartido con el jefe
- **Google Sheet** — "CALENDARIO 2026 MANOLO" (propietario: jefe)
  - ID: `1vgTEqYYfgpP-dvla_hV6HIaz32kP3OPgxqn8YR_QqpQ`
  - Celda por día: columna H, fila = `2 + floor(mesIndex/3)*35 + dia`
  - Mayo (mesIndex=4): col H, fila = 37+dia → ej. H48 = 11 mayo
  - OAuth 2.0 con token almacenado en localStorage; reautenticar con `subirVisitasSheet()`

## Modelo de Datos Firestore

### Colección `studios`
Cada documento tiene como ID el número de empresa (ej. `"3001"`, `"3002"`...).

```
{
  name:        string,
  type:        string,       // "Ingeniería", "C.R. Regantes", "Arquitectura"...
  city:        string,
  province:    string,
  score:       number,       // 1-10
  priority:    string,       // "alta" | "media" | "baja"
  status:      string,       // "nuevo" | "contactado" | "reunion" | "ganado"
  data: {
    contact: { address, phone, email, web },
    team:    [{ name, role, phone, email }],
    projects: [],
    notes:   string,
    comms: {
      callPitch:   string,
      openingLine: string,
    },
    description: string,
  }
}
```

### Documento `_meta/planificador`
```
{
  schedule: {
    "2026-05-11": [
      { id: "3007", name: "...", city: "...", province: "...", data: { hora: "10:30", notas: "" } },
      ...
    ],
    ...
  }
}
```

## Vistas Principales
- Dashboard (métricas)
- Studios (listado con filtros por provincia, ciudad, CP, estado)
- Detalle de Studio (contacto, BANT, equipo, actividades, reportes, pipeline B2B)
- Planificador de Visitas (semana, drag-and-drop)
- Reportes y Analíticas
- Configuración (API keys, Gmail, Google Calendar, backup/restore)

## Integraciones
- **Firebase Firestore** — base de datos principal (studios + planificador)
- **Google Apps Script (GAS)** — proxy para la API de Claude (Anthropic); CRUD secundario
- **Google Calendar** — crear/sincronizar eventos de visita via OAuth 2.0
- **Google Sheets** — registro de visitas del jefe via OAuth 2.0
- **Web Scraping** — búsqueda de empresas (LinkedIn, BORME, Einforma, Colegios)
- **Gmail** — plantillas de email para outreach

## Funciones JS Clave (Firebase)
- `initFirebase()` — inicializa Firebase app y Firestore
- `syncFromFirebase()` — carga todos los studios desde Firestore al estado local
- `syncPlanificadorFirebase()` — lee/escribe `_meta/planificador`
- `loadPlanificadorFromFirebase()` — carga el planificador en la vista
- `getNextFirebaseId()` — obtiene el siguiente ID incremental
- `subirVisitasSheet()` — sube resumen a Google Sheet (requiere OAuth)
- `useFirebase` — flag booleano global que activa las operaciones Firestore

## Convenciones
- Idioma de la interfaz: Español
- Nomenclatura JS: camelCase
- IDs de modales: `modal-[nombre]`
- Navegación: `showView('nombre-vista')`
- Notificaciones: `showNotification(mensaje, tipo)`

## Notas Técnicas
- OAuth Sheets: token expira ~1h; reautenticar llamando `subirVisitasSheet()` desde consola
- IDs de studios: numéricos como strings ("3001", "3002"...)
- Sin autenticación propia: acceso abierto a quien tenga la URL de GitHub Pages
- Planificador: el campo `schedule` en `_meta/planificador` es un mapa fecha→array de visitas
```

---

## 2. .gitignore actual

```
node_modules/
.DS_Store
*.log
.auto-push.log
google_credentials.json
.sheets_token.json
*.py
*.js
!index.js
gen_*.js
insertar_*.js
import_*.js
dunsSegmentacion_fix.js
*.xlsx
*.csv
.claude/
```

---

## 3. package.json

```json
{
  "dependencies": {
    "docx": "^9.6.1",
    "xlsx": "^0.18.5"
  }
}
```

---

## 4. README.md

(no existe)

---

## 5. Estructura de directorios (2 niveles)

```
crm/
├── .claude/
│   └── launch.json
├── .github/
│   └── workflows/
│       └── claude.yml
├── cotejo-plan-v5/
│   ├── 00_mapa_crm_actual.md       (12 KB)
│   ├── 01_cotejo_directorio.md     (11 KB)
│   ├── 02_cotejo_proceso_8_fases.md (10 KB)
│   ├── 03_cotejo_13_campos.md       (7 KB)
│   ├── 04_cotejo_kpis_oficiales.md  (7 KB)
│   ├── 05_cotejo_marco_regulatorio.md (5 KB)
│   ├── 06_cotejo_tareas_tecnicas.md  (6 KB)
│   └── 07_plan_mejoras_crm.md       (12 KB)
├── manual_assets/
│   ├── 01_dashboard.png ~ 10_modal_cambiar_estado.png  (4.1 MB c/u)
│   ├── crm_01_dashboard.png ~ crm_10b_cambiar_estado.png
│   ├── diagrama_flujo.png  (585 KB)
│   └── test_capture.png    (4.1 MB)
├── node_modules/           (excluido de git)
├── CALENDARIO_2026_MANOLO.xlsx
├── CALENDARIO_2026_MANOLO_actualizado.xlsx
├── CLAUDE.md               ← documentación del proyecto para Claude
├── DIAGNOSTICO.md          ← este archivo (no committear)
├── Clientes_2semanas_Mar2026.xlsx
├── Manual_CRM_GPF_2026.docx
├── analisis_zonas_semana_mayo6.md
├── apple-touch-icon.png
├── auto-push.sh
├── chat.html
├── duns-apps-script.gs
├── fix-apps-script.gs
├── google_credentials.json ← en .gitignore ✅
├── index.html              ← archivo principal (1.6 MB, ~27k líneas)
├── index.html.bak
├── mapa_espana.svg         (436 KB)
├── package.json
├── package-lock.json
├── planning_jaen_abril_2026.docx
├── planning_jaen_abril_2026.html
├── planning_murcia_abril_2026.docx
├── planning_murcia_abril_2026.html
├── resumen_visitas_murcia_abril2026.docx
└── tests.html
```

---

## 6. Configuración Claude existente

```
.claude/
total 8
drwxr-xr-x   3 ma.fernandez  staff    96 Apr  8 20:19 .
drwxr-xr-x  44 ma.fernandez  staff  1408 May 11 19:59 ..
-rw-r--r--   1 ma.fernandez  staff   194 Apr  8 20:19 launch.json
```

Contenido de `.claude/launch.json`:
```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "crm",
      "runtimeExecutable": "python3",
      "runtimeArgs": ["-m", "http.server", "3456"],
      "port": 3456
    }
  ]
}
```

> Nota: `.claude/` está en `.gitignore` — no se sube al repositorio.

---

## 7. Workflows de GitHub Actions

Archivo: `.github/workflows/claude.yml`

```yaml
name: Claude Code — GPF CRM

on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
  issues:
    types: [opened, assigned]
  pull_request_review:
    types: [submitted]
  push:
    branches: [main]
    paths:
      - 'index.html'
      - 'chat.html'

jobs:
  # Responde a @claude en issues y PRs
  claude-mention:
    if: |
      (github.event_name == 'issue_comment' && contains(github.event.comment.body, '@claude')) ||
      (github.event_name == 'pull_request_review_comment' && contains(github.event.comment.body, '@claude')) ||
      (github.event_name == 'pull_request_review' && contains(github.event.review.body, '@claude')) ||
      (github.event_name == 'issues' && (contains(github.event.issue.body, '@claude') || contains(github.event.issue.title, '@claude')))
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 1
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          claude_args: |
            --model claude-sonnet-4-20250514
            --system-prompt "Eres el asistente de desarrollo del CRM de Ferroplast/GPF..."

  # Revisión automática en push manual (excluye Auto-guardado)
  claude-review:
    if: |
      github.event_name == 'push' &&
      !startsWith(github.event.head_commit.message, 'Auto-guardado')
    runs-on: ubuntu-latest
    permissions:
      contents: read
      issues: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2
      - name: Obtener diff del commit
        id: diff
        run: |
          git diff HEAD~1 HEAD -- index.html chat.html > /tmp/cambios.diff
          LINES=$(wc -l < /tmp/cambios.diff)
          echo "lines=$LINES" >> $GITHUB_OUTPUT
      - name: Revisar cambios con Claude (API directa)
        if: steps.diff.outputs.lines > '5'
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          # Llama a Claude Haiku y crea un issue con la revisión
          ...
```

---

## 8. Estado del working tree

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   CLAUDE.md

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	DIAGNOSTICO.md
	Manual_CRM_GPF_2026.docx
	analisis_zonas_semana_mayo6.md
	auto-push.sh
	index.html.bak
	manual_assets/
	planning_jaen_abril_2026.docx
	planning_jaen_abril_2026.html

no changes added to commit (use "git add" and/or "git commit -a")
```

> ℹ️ `CLAUDE.md` aparece como modificado — se actualizó hoy para reflejar la arquitectura real con Firebase.

---

## 9. Últimos 10 commits

```
afdc95f Auto-guardado CRM 2026-05-07 20:22:49
fd43a47 Auto-guardado CRM 2026-05-07 20:22:42
c3e73ca Auto-guardado CRM 2026-05-04 10:56:19
235c1a0 Auto-guardado CRM 2026-05-04 10:00:05
7f2e871 Auto-guardado CRM 2026-05-04 09:59:54
070820f Auto-guardado CRM 2026-05-04 09:59:44
212e16c Auto-guardado CRM 2026-05-04 09:49:02
2fb6a57 Auto-guardado CRM 2026-05-04 09:15:26
27dd34b Auto-guardado CRM 2026-05-03 22:44:56
ae3cac0 Auto-guardado CRM 2026-05-03 22:44:23
```

> ⚠️ Todos los commits son "Auto-guardado" del script `auto-push.sh`. Sin mensajes descriptivos — dificulta rollbacks y revisión de cambios.

---

## 10. Archivos grandes (> 100 KB)

| Tamaño | Fecha | Archivo |
|--------|-------|---------|
| 4.1 MB | 03/05 | `manual_assets/10_modal_cambiar_estado.png` |
| 4.1 MB | 03/05 | `manual_assets/09_modal_fase_m7.png` |
| 4.1 MB | 03/05 | `manual_assets/08_modal_prescripcion.png` |
| 4.1 MB | 03/05 | `manual_assets/07_modal_actividad_bottom.png` |
| 4.1 MB | 03/05 | `manual_assets/06_modal_actividad_top.png` |
| 4.1 MB | 03/05 | `manual_assets/05_detalle_empresa.png` |
| 4.1 MB | 03/05 | `manual_assets/04_kanban.png` |
| 4.1 MB | 03/05 | `manual_assets/03_empresas_lista.png` |
| 4.1 MB | 03/05 | `manual_assets/02_dashboard_charts.png` |
| 4.1 MB | 03/05 | `manual_assets/test_capture.png` |
| 4.1 MB | 03/05 | `manual_assets/01_dashboard.png` |
| 2.0 MB | 04/05 | `Manual_CRM_GPF_2026.docx` *(untracked)* |
| 1.6 MB | 07/05 | `index.html` ← archivo principal |
| 1.6 MB | 03/05 | `index.html.bak` *(untracked)* |
| 585 KB | 03/05 | `manual_assets/diagrama_flujo.png` |
| 436 KB | 03/03 | `mapa_espana.svg` |
| 284 KB | 03/05 | `manual_assets/crm_09b_m7_fase.png` |
| 246 KB | 03/05 | `manual_assets/crm_08b_prescripcion.png` |
| 233 KB | 03/05 | `manual_assets/crm_06b_actividad_top.png` |
| 232 KB | 03/05 | `manual_assets/crm_05b_detalle.png` |
| 213 KB | 03/05 | `manual_assets/crm_07b_actividad_bottom.png` |
| 212 KB | 03/05 | `manual_assets/crm_10b_cambiar_estado.png` |
| 195 KB | 03/05 | `manual_assets/crm_04_kanban.png` |
| 178 KB | 03/05 | `manual_assets/crm_01_dashboard.png` |
| 165 KB | 07/05 | `.auto-push.log` *(en .gitignore)* |
| 164 KB | 03/05 | `manual_assets/crm_03_empresas.png` |

> ⚠️ `manual_assets/` **no está en `.gitignore`** — si se hace `git add .` se subirían ~60 MB de imágenes al repositorio.

---

## 11. Backend (Google Apps Script)

### `duns-apps-script.gs` (10.843 bytes)

Primeras 40 líneas:
```javascript
// =========================================================================
// INTEGRACIÓN DUNS 100000 - CRM Prospector Ferroplast
// =========================================================================
//
// INSTRUCCIONES:
// 1. Abre tu Google Apps Script: https://script.google.com
// 2. Selecciona el proyecto del CRM
// 3. COPIA todo este código y pégalo AL FINAL de tu Código.gs
// 4. En tu función principal doPost(e), añade este caso:
//
//    if (action === 'dunsSearch') {
//      return respond(handleDunsSearch(params));
//    }
//
// 5. Despliega una nueva versión: Implementar > Nueva implementación
// =========================================================================

/**
 * Maneja búsquedas en DUNS 100000
 */
function handleDunsSearch(params) {
  var username = params.username;
  var password = params.password;
  var searchAction = params.action || 'search';

  if (!username || !password) {
    return { success: false, message: 'Usuario y contraseña requeridos' };
  }

  try {
    var loginResult = dunsLogin(username, password);
    if (!loginResult.success) {
      return { success: false, message: loginResult.message };
    }
    ...
```

Funciones definidas:
- `handleDunsSearch(params)` — entrada principal para búsquedas DUNS
- `dunsLogin(username, password)` — login en DUNS 100000
- `dunsSearch(query, cookies)` — búsqueda de empresas
- `dunsNormalizeText(text, cookies)` — normalización de texto
- `parseDunsResults(html)` — parseo de resultados HTML
- `extractCookies(headers)` — extracción de cookies de respuesta
- `extractXmlTag(xml, tagName)` — utilidad XML
- `cleanHtmlEntities(text)` — limpieza de entidades HTML
- `stripHtml(html)` — eliminación de etiquetas HTML

---

### `fix-apps-script.gs` (8.994 bytes)

Script de migración de datos (ejecución única).

Primeras 40 líneas:
```javascript
// =========================================================================
// CORRECCIÓN PARA GOOGLE APPS SCRIPT - CRM Prospector Ferroplast
// =========================================================================
//
// INSTRUCCIONES:
// 1. Abre tu Google Apps Script: https://script.google.com
// 2. Selecciona el proyecto del CRM
// 3. COPIA las funciones de abajo y pégalas AL FINAL de tu Código.gs
// 4. Ejecuta primero "migrateStudiosData" desde el editor (botón ▶️)
// 5. Luego reemplaza "addStudio" y "updateStudio" con las versiones corregidas
//
// COLUMNAS DEL SHEET "Studios":
// A=id, B=name, C=shortName, D=province, E=priority, F=score,
// G=status, H=type, I=logo, J=data, K=b2bTimeline, L=createdAt, M=updatedAt
// =========================================================================

function migrateStudiosData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Studios');
  if (!sheet) {
    Logger.log('ERROR: No se encontró la hoja "Studios"');
    return;
  }
  ...
```

Funciones definidas:
- `migrateStudiosData()` — migra campos JSON a columnas individuales en Google Sheets (ejecución única)
- `handleAddStudio_FIXED(params)` — versión corregida de addStudio
- `handleUpdateStudio_FIXED(params)` — versión corregida de updateStudio

> ⚠️ Estos archivos `.gs` son auxiliares locales. El backend GAS real (desplegado) no está en este repositorio.

---

## 12. Frontend (index.html)

**Tamaño:** 1.656.292 bytes (1.617 KB, ~27.000 líneas)

Primeras 100 líneas (resumen):
```html
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, ...">
    <title>CRM Prospector Ferroplast - TEST</title>

    <!-- PWA Manifest Inline (base64) -->
    <link rel="manifest" href="data:application/json;base64,...">

    <!-- iOS PWA meta tags -->
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">

    <!-- iOS Icons y Splash screens (SVG inline) -->
    <link rel="apple-touch-icon" href="data:image/svg+xml,...">

    <!-- Google Fonts -->
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans...">

    <!-- CDN Libraries -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>

    <!-- Leaflet para mapas -->
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script src="https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js"></script>

    <!-- Firebase SDK (Compat v9) -->
    <script src="https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore-compat.js"></script>

    <style>
        :root {
            --primary: #0a2540;
            --accent: #0066cc;
            /* ... variables CSS ... */
        }
    </style>
```

### Conteo de términos clave

| Término | Ocurrencias | Significado |
|---------|-------------|-------------|
| `fetch(` | 12 | Llamadas HTTP directas (Claude API proxy, scraping) |
| `google.script.run` | 0 | No usa GAS client-side runner |
| `localStorage` | 101 | Uso intensivo para caché y configuración |
| `sessionStorage` | 0 | No usada |
| `API_KEY` | 0 | Sin claves hardcodeadas en el código visible |
| `supabase` | 0 | No usado |
| `firebase` | 13 | Inicialización y operaciones Firestore |
| `airtable` | 0 | No usado |

---

## 13. Carpeta cotejo-plan-v5

```
cotejo-plan-v5/   (8 archivos, creados 03/05/2026)
total 160
-rw-r--r--  ma.fernandez  12.247  May 3  00_mapa_crm_actual.md
-rw-r--r--  ma.fernandez  10.762  May 3  01_cotejo_directorio.md
-rw-r--r--  ma.fernandez   9.987  May 3  02_cotejo_proceso_8_fases.md
-rw-r--r--  ma.fernandez   7.275  May 3  03_cotejo_13_campos.md
-rw-r--r--  ma.fernandez   7.414  May 3  04_cotejo_kpis_oficiales.md
-rw-r--r--  ma.fernandez   5.211  May 3  05_cotejo_marco_regulatorio.md
-rw-r--r--  ma.fernandez   5.814  May 3  06_cotejo_tareas_tecnicas.md
-rw-r--r--  ma.fernandez  12.039  May 3  07_plan_mejoras_crm.md
```

Extracto de `00_mapa_crm_actual.md`:
> Stack: HTML5 + Vanilla JS (~27.500 líneas), Firebase Firestore, GAS proxy para Claude API y Google Calendar, Leaflet.js, xlsx.js, docx.js, PWA, GitHub Pages CI/CD.
>
> Colección principal `studios`: id, name, shortName, type, status, province, city, priority, score, createdAt, updatedAt, data.contact (email, phone, web, address), data.team[], data.notes, data.projects[].

---

## 14. Variables de entorno detectadas

| Archivo | Línea | Referencia |
|---------|-------|------------|
| `index.html` | 18200 | `client_id=${encodeURIComponent(clientId)}` — OAuth Google Calendar |
| `index.html` | 18622 | `client_id=${encodeURIComponent(clientId)}` — OAuth Google Sheets |
| `index.html` | 24624 | `client_id=${encodeURIComponent(clientId)}` — OAuth Google Calendar |

> ✅ No se han encontrado claves API hardcodeadas en el código fuente.
> ✅ `google_credentials.json` y `.sheets_token.json` están en `.gitignore`.
> ✅ `ANTHROPIC_API_KEY` se gestiona como GitHub Secret en el workflow CI/CD.
> ℹ️ Los `client_id` de OAuth se leen de `localStorage` (configuración de usuario), no están hardcodeados.
> ℹ️ El ID de la Google Sheet del jefe (`1vgTEqYYfgpP-dvla_hV6HIaz32kP3OPgxqn8YR_QqpQ`) está hardcodeado en el código como constante `SHEET_JEFE_ID` (línea 24599) — no es una clave secreta pero sí un dato de configuración.

---

## 15. Resumen ejecutivo

**¿Qué hace este proyecto?**
CRM comercial B2B para que Manuel Fernández (prescriptor Ferroplast/Tuyper, Grupo GPF) gestione la prospección de ingenierías hidráulicas y estudios de arquitectura en España — con planificador de visitas, argumentarios de venta, generación de informes IA, seguimiento de actividades y análisis de pipeline.

**Stack técnico:**
Single-page application en un único `index.html` de 1.6 MB (~27.000 líneas) — Vanilla JS sin framework, Firebase Firestore (compat v9) como base de datos, Google Apps Script como proxy para la API de Claude (Anthropic) y Google Calendar, Leaflet.js para mapas, docx.js/xlsx.js para exportaciones. Desplegado en GitHub Pages con CI/CD via `auto-push.sh`.

**Almacenamiento de datos:**
Firebase Firestore (cloud, colección `studios` + `_meta/planificador`) como fuente de verdad. Caché en `localStorage` (101 referencias) e `IndexedDB` para funcionamiento offline. Google Sheet del jefe como registro compartido de visitas realizadas.

**Autenticación:**
OAuth 2.0 de Google para Google Calendar y Google Sheets (token en `localStorage`, expira ~1h). **Sin autenticación de usuario propia** — acceso directo a quien tenga la URL pública de GitHub Pages. Firestore sin reglas de seguridad basadas en usuario.

**Flujo principal:**
Abrir app (GitHub Pages) → cargar estudios desde Firestore → filtrar por zona/provincia → visitar ficha de empresa → generar argumentario/informe IA → planificar visitas en el planificador semanal → subir resumen a Google Sheet del jefe → descargar dossier Word.

**Dependencias externas críticas:**
Firebase Firestore (datos), Google Apps Script (proxy Claude API + Calendar), Anthropic Claude API (informes IA), Google Sheets (registro jefe), GitHub Pages (hosting), CDNs externos (Leaflet, xlsx.js, docx.js, Firebase SDK, Google Fonts) — sin conexión a internet la app no funciona.

**Riesgos detectados:**
1. 🔴 **Sin autenticación**: cualquier persona con la URL pública tiene acceso completo al CRM y a todos los datos de empresas.
2. 🔴 **Archivo único de 1.6 MB**: `index.html` con ~27.000 líneas — cualquier error de sintaxis tumba toda la app; difícil de mantener y depurar.
3. 🟡 **`manual_assets/` no en `.gitignore`**: 26 imágenes (~60 MB total) podrían subirse accidentalmente al repo con `git add .`.
4. 🟡 **localStorage como caché principal**: 101 usos — si se limpia el storage del navegador se pierden tokens OAuth y configuración.
5. 🟡 **Todos los commits son "Auto-guardado"**: historial git no descriptivo, dificulta rollbacks y revisión de cambios.
6. 🟡 **Dependencia de CDNs externos**: sin conexión o si un CDN cae, partes de la app dejan de funcionar (mapas, Excel, Word, Firebase).
7. 🟢 **Seguridad de claves**: bien gestionada — no hay claves hardcodeadas, `google_credentials.json` en .gitignore, `ANTHROPIC_API_KEY` en GitHub Secrets.

---
_DIAGNOSTICO.md generado el 11/05/2026 — No hacer commit de este archivo._
