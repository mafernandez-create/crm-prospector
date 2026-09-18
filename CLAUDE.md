# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Arquitectura detallada (módulos del rediseño, esquemas Supabase, formatos de informe,
> backends, GitHub Actions) en **`docs/CLAUDE-reference.md`** — léela bajo demanda.

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

## Regla de la plantilla de informe (OBLIGATORIO)
- La plantilla de informe de visita es **fija e inalterable**: estructura del formato estándar de
  `Data.generateReport` (cabecera en tabla · 1 Perfil · 2 Objetivos · 3 Temas tratados 3.1-3.5 ·
  4 Oportunidades · 5 Decisiones y compromisos 5.1-5.3 · 6 Observaciones 6.1-6.2 · 7 Evaluación ·
  8 Plan de acción) y su exportación a Word en `detail.js → _markdownToDocxBlob` (paleta por
  «Resultado global», tablas Campo|Valor sombreadas, pie «Elaborado por / Fecha»). Fijada por Manolo
  el 12-sep-2026 sobre el informe de JRW Arquitectura del 13-ene-2026; detalle en `docs/CLAUDE-reference.md`.
- **No se modifica** (ni secciones, ni orden, ni colores, ni pie) salvo que Manolo lo pida
  expresamente, y **aun pidiéndolo hay que pedirle confirmación explícita** antes de tocar nada.
  Arreglar un bug que rompa la plantilla (p. ej. una tabla que no se renderiza) sí está permitido,
  siempre que el resultado siga siendo idéntico a la plantilla.

## Regla de entrega de informes (OBLIGATORIO)
- Tras una semana de visitas, **todos los informes de esas visitas se entregan como muy tarde el
  martes de la semana siguiente** (redactados en el CRM con la plantilla fija y enviados a Javier en
  Word). Regla de Manolo del 12-sep-2026. Al planificar o cerrar una ruta, calcular y mostrar esa
  fecha límite; el lunes siguiente, listar lo que falta (vista `visitas_sin_informe`) antes de
  cualquier otra tarea.
- **Tantos informes como visitas planificadas.** Si una semana tiene menos informes que visitas
  planificadas, el correo a Javier con los informes justifica una por una las visitas no realizadas
  y el motivo. Nunca se envía el lote sin esa conciliación planificado/realizado.

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
en cliente, **subir la versión de `CACHE_NAME` en `sw.js`** (mirar el valor actual en `sw.js`; a 18-sep-2026 era `v62`)
y recargar (en móvil, cerrar y reabrir la PWA).

## Arquitectura (resumen)

El rediseño (`redesign/`) es JS vanilla sin bundler: `index.html` es un **loader** que importa
los módulos en **orden fijo** (importa el orden). Detalle módulo a módulo, esquemas de datos
Supabase, formatos de informe, backends e integraciones, y GitHub Actions: ver
`docs/CLAUDE-reference.md`. Gotchas que conviene recordar siempre:

- **Routing:** usar `window.showView(name[, params])`. ⚠️ Cambiar `location.hash` por JS **no**
  dispara el render; usar `showView()` o un clic real.
- **Estado global:** `window.State` no incluye `data.reports`/`data.activities` (se leen por studio).
- **Backend:** Supabase por defecto; Firestore solo en el legacy. Claude/Anthropic vía proxy GAS.

## Convenciones
- Idioma de la interfaz: **español**. Nomenclatura JS: camelCase.
- IDs de modales: `modal-{nombre}`; navegación `showView('vista')`; toasts `showNotification(msg, tipo)`; logs `debugLog(msg)`.
- IDs de studios: numéricos como strings (`"3001"`); algunos legacy tienen IDs alfanuméricos de Firestore.
- Sin autenticación de usuario: cualquiera con la URL tiene acceso completo. No meter datos sensibles de clientes.
