# CRM Prospector Ferroplast

## Descripcion
CRM B2B de ventas para prospección de estudios de arquitectura e ingeniería en España.
Aplicación single-page (SPA) en un solo archivo HTML (~15,600 líneas).

## Tech Stack
- **Frontend**: Vanilla JS, CSS3 (custom properties), HTML5
- **PWA**: Service Worker, soporte iOS (splash screens, iconos)
- **Librerías CDN**: Leaflet.js (mapas), XLSX.js (Excel), Google Fonts (DM Sans, Sora)
- **Sin framework** - todo vanilla

## Almacenamiento de Datos (3 niveles con fallback)
1. **Google Sheets API** (primario) - via Apps Script endpoint
2. **IndexedDB** - DB: `FerroplastCRM_TEST`, stores: `studios`, `activities`
3. **localStorage** - key: `ferroplast_crm_data_TEST` (fallback)

## Modelo de Datos
- **Studios**: id, name, status (nuevo/contactado/reunion/ganado), priority, contacto, BANT, equipo
- **Activities**: id, studioId, type (call/email/meeting/note), date, description, followupDate

## Vistas Principales
- Dashboard (métricas)
- Studios (listado con filtros por provincia, ciudad, CP, estado)
- Detalle de Studio (contacto, BANT, equipo, actividades, reportes, pipeline B2B)
- Planificador de Visitas (drag-and-drop calendar)
- Reportes y Analíticas
- Configuración (API keys, Gmail, Google Calendar, backup/restore)

## Integraciones
- **Google Apps Script** - CRUD principal (addStudio, updateStudio, deleteStudio, exportAll, importAll)
- **Google Calendar** - crear/sincronizar eventos via OAuth 2.0
- **Web Scraping** - búsqueda de empresas (LinkedIn, Instagram, Facebook, BORME, Einforma, Colegios de Arquitectos)
- **Gmail** - plantillas de email para outreach

## Funciones JS Clave
- `callAPI(action, params)` - comunicación con Google Sheets API
- `showView(view, filter)` - navegación entre vistas
- `loadStudios()` / `showStudioDetail(id)` - renderizar datos
- `searchStudiosInProvince()` / `deepAnalyzeWebsite()` - web scraping
- `calculateAutoPriority(studio)` - cálculo automático de prioridad

## Estructura del Archivo
Todo está en `index.html`:
- Líneas 1-38: Head (PWA config, CDN imports)
- Líneas 39-~900: CSS (estilos completos, responsive, mobile)
- Líneas ~900-~5000: HTML (sidebar, vistas, modales)
- Líneas ~5000-15593: JavaScript (lógica de negocio, API, UI)

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
