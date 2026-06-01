# CRM Prospector Ferroplast
## Regla de trabajo (OBLIGATORIO)
- Todo nuevo desarrollo va al **rediseño** (`redesign/`) y **Supabase**.
- La versión anterior (`index.html` + Firebase Firestore) **NO se toca** sin permiso explícito.
- Si hay que modificar `index.html` o Firestore, pedir permiso antes de actuar.

## Regla de informes (OBLIGATORIO)
- **Ningún informe puede contener marcas de tiempo** de la transcripción del audio
  (`[01:47]`, `[01:47–02:34]`, `(MM:SS)`, rangos `MM:SS–MM:SS`, etc.).
  Un informe es un **registro comercial profesional**, NO una transcripción: nunca
  puede parecer que proviene de una reunión grabada.
- Regla centralizada en `window.Util.stripTimestamps` / `stripTimestampsDeep` (`redesign/app.js`).
  Se aplica al **generar** informes (`Data.generateReport`, prompt + limpieza) y al
  **importar** YAML de visita (`detail.js → _ejecutarImportacion`, limpia el YAML completo).
- NO toca fechas `[YYYY-MM-DD]`, horas sueltas (`10:30`) ni marcadores `[SIN DATO]`.
- Cualquier flujo nuevo que cree o muestre informes debe pasar por `stripTimestamps(Deep)`.

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
- **Proyecto**: `ferroplast-crm`
- **Colección principal**: `studios` — directorio de empresas
- **Colección meta**: `_meta` — documentos de configuración y planificador
- **SDK**: Firebase compat v9 (`firebase-app-compat.js` + `firebase-firestore-compat.js`)
- **Sin autenticación de usuario**: Firestore accesible directamente desde el navegador

### Caché local (fallback)
- **localStorage** — tokens OAuth, configuración de usuario, caché de datos
  - Key de datos: `ferroplast_crm_data_TEST`
  - Key de Sheets OAuth: `ferroplast_sheets_settings` → `{accessToken, tokenExpiry}`
- **IndexedDB** — DB: `FerroplastCRM_TEST`, stores: `studios`, `activities` (uso secundario)

### Registro compartido con el jefe
- **Google Sheet** — "CALENDARIO 2026 MANOLO" (propietario: jefe)
  - Celda por día: columna H, fila = `2 + floor(mesIndex/3)*35 + dia`
  - Mayo (mesIndex=4): col H, fila = 37+dia → ej. H48 = 11 mayo
  - OAuth 2.0 con token almacenado en localStorage; se refresca llamando a `subirVisitasSheet()`

## Modelo de Datos Firestore

### Colección `studios`
Cada documento tiene como ID el número de empresa (ej. `"3001"`, `"3002"`...).

```
{
  name:        string,       // Nombre de la empresa
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
      callPitch:   string,   // Script de llamada en frío
      openingLine: string,   // Primera frase de presentación
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
    "2026-05-12": [ ... ],
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

## Funciones JS Clave

### Firebase / Firestore
- `initFirebase()` — inicializa Firebase app y Firestore
- `syncFromFirebase()` — carga todos los studios desde Firestore al estado local
- `syncPlanificadorFirebase()` — lee/escribe `_meta/planificador`
- `loadPlanificadorFromFirebase()` — carga el planificador en la vista
- `getNextFirebaseId()` — obtiene el siguiente ID incremental para un nuevo studio
- `migrarAFirebase()` — migración one-time desde GAS/localStorage a Firestore
- `useFirebase` — flag booleano global que activa las operaciones Firestore

### Navegación y UI
- `showView(view, filter)` — navegación entre vistas
- `loadStudios()` / `showStudioDetail(id)` — renderizar datos
- `showNotification(mensaje, tipo)` — notificaciones toast
- `debugLog(mensaje)` — logs con flag configurable

### Datos y lógica
- `callAPI(action, params)` — comunicación con GAS proxy (Claude API, Calendar)
- `subirVisitasSheet()` — sube resumen de visitas a Google Sheet del jefe (requiere OAuth)
- `searchStudiosInProvince()` / `deepAnalyzeWebsite()` — web scraping
- `calculateAutoPriority(studio)` — cálculo automático de prioridad

## Estructura del Archivo
Todo está en `index.html` (~27.000 líneas, 1.6 MB):
- Líneas 1-38: Head (PWA config, CDN imports, Firebase SDK)
- Líneas 39-~900: CSS (estilos completos, responsive, mobile)
- Líneas ~900-~5000: HTML (sidebar, vistas, modales)
- Líneas ~5000-27000: JavaScript (lógica de negocio, Firebase, API, UI)

## Convenciones
- Idioma de la interfaz: Español
- Nomenclatura JS: camelCase para funciones y variables
- IDs de modales: `modal-[nombre]`
- Navegación: `showView('nombre-vista')`
- Notificaciones: `showNotification(mensaje, tipo)`
- Debug: `debugLog(mensaje)` con flag configurable

## Comandos para Desarrollo
```bash
# Servir localmente (cualquiera de estos)
python3 -m http.server 8000
npx serve .
open index.html  # Abrir directo en navegador
```

## Notas Técnicas Importantes
- **OAuth Sheets**: el token expira cada ~1h. Si falla `subirVisitasSheet()`, llamarla desde la consola para reautenticar. El token se guarda en `localStorage.ferroplast_sheets_settings`.
- **IDs de studios**: numéricos como strings (`"3001"`, `"3002"`...). El último ID asignado se puede consultar con `getNextFirebaseId()`.
- **Sin autenticación propia**: cualquier persona con la URL de GitHub Pages tiene acceso completo al CRM. No añadir datos sensibles de clientes.
- **Planificador**: el campo `schedule` en `_meta/planificador` es un mapa fecha→array de visitas. Cada visita tiene `id` (referencia a `studios`), `name`, `city`, `province`, y `data.hora`.
