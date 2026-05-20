# Estado de implementación spec v1.1 — 100 % completado + R1-R5 cerrado

**Última actualización**: 2026-05-20 (sesión continuada — addendum scoring R1-R5)
**Rama de trabajo**: `main` (PR #6 + PR #7 mergeados)
**Último commit en main**: `b0a3e4a` — *Merge PR #7: R1-R5 completos del Eje 2*
**PRs mergeados hoy**: #6 (plan v1.1 completo) + #7 (R1-R5 Eje 2)

---

## 🏆 Resumen

**8 de 8 bloques completados** del plan v1.1 (Decisiones 1-5).

| # | Bloque | Commit | Estado |
|---|---|---|---|
| 0 | Quick wins (spec, planificador N+1, cron diario, procesandose_por) | `322b487` (pre) + `58ac4e7` | ✅ |
| 1 | Cliente puente (recálculo masivo + texto v2) | `db75d67` | ✅ |
| 2A | Capa Sectorial Geográfica §18.5 client-side | `dd17aac` | ✅ |
| 2B | Endpoint nocturno GAS server-side | `2b5ce1c` | ✅ (pendiente setup manual) |
| 3 | UI Fase D consolidación | `fe5afe6` | ✅ |
| 4 | Multi-motor con circuit breaker + métricas + orden configurable | `e29d066` | ✅ |
| 5 | Migración legacy (1585 docs actualizados) | `dbb2103` | ✅ ejecutado |
| 6 | Reporte semanal + alertas del agente | `d503191` | ✅ |
| 7 | Fase I dual voz+manual + extracción LLM | `e156fb8` | ✅ (con limitaciones documentadas) |

**+** commit pre-bloque `534b914` — eliminación del motor IA Claude generador (incompatible con spec, 67 % alucinaciones).

---

## 📊 Métricas finales

| Métrica | Valor |
|---|---|
| Commits funcionales pusheados | **9** (en una sesión continua) |
| Líneas spec v1.1 (post §18.5) | 1186 |
| Líneas tocadas en `index.html` | ~1.000+ |
| Archivos nuevos | 3 (`gas-batch-qualify.gs`, `SETUP_BATCH_QUALIFY.md`, `busqueda_cordoba_ing_2026-05-19.md`) |
| Studios en Firestore tras migración | 1585 (todos con `fuente_descubrimiento` + city wrapped) |
| Tests unitarios con mocks ejecutados | 30+ verificaciones |
| PR abierto | crm-prospector#6 con 9 commits |

---

## 🔓 Acciones pendientes de Manolo (no automatizables por Claude)

### 1. Setup endpoint GAS server-side
Ver `SETUP_BATCH_QUALIFY.md` en raíz del repo. ~20-30 min. Necesita:
- Crear service account en GCP del proyecto `ferroplast-crm`
- Instalar OAuth2 library en Apps Script
- Pegar `gas-batch-qualify.gs` + integrar `doPost`
- Configurar Script Properties (4 props)
- Deploy del web app
- Añadir `BATCH_ENDPOINT` y `BATCH_API_KEY` en GitHub Secrets
- Test `workflow_dispatch` manual

### 2. Mergear PR #6 a `main`
Para que los cambios lleguen a GitHub Pages (producción del CRM).
Una vez mergeado, el código nuevo está activo sin más despliegue.

### 3. Recargar el CRM en navegadores activos
Tras merge, recargar Chrome para coger la nueva versión.

---

## 🛠️ Trabajo futuro identificado (no parte del plan v1.1)

### Trabajo derivado del Bloque 7
- **Transcripción local con faster-whisper**: hoy se usa Web Speech API que envía audio a Google/Apple. La spec §16.1 dice "REQUISITO sin servicios externos". Opciones para resolver:
  - Endpoint server-side con faster-whisper (Cloud Run + GAS proxy)
  - `transformers.js` con Whisper en navegador (~200 MB de modelo)
- **UI confirmar/descartar `actualizaciones_propuestas`**: las propuestas se persisten en el RegistroVisita pero no hay diálogo para que Manolo las aplique al studio. Recomendado añadir en bandeja del agente como sub-sección.

### Trabajo derivado del Bloque 5
- **Re-calificar la cartera con metadatos**: ahora que todos tienen `fuente_descubrimiento: geografica/legacy`, lanzar `cualificarLote` sobre los 1585 para refrescar histórico y posibles candidatos a puente nuevos (aunque seguirá saliendo 0 hasta que R1-R5 se calculen — ver siguiente punto).

### Trabajo derivado del Bloque 1
- ~~**Calcular R1, R2, R3, R5** (hoy solo R4)~~ — ✅ **CERRADO** en PR #7 (commit `7e40d1c`). R1-R5 implementados en `calculateScoringV2` (index.html) y `gasCalculateScoringV2` (gas-batch-qualify.gs). Dry-run sobre 1585 studios: 18 cambian cuadrante (1.1%), 0 candidatos puente nuevos (78% de cartera sin proyectos detectables aún).
  - **Pendiente trigger**: re-deploy manual del GAS Web App + ejecutar `gh workflow run batch-qualify.yml -f filtro=todos -f limite=1585` para persistir el nuevo cálculo en los 1585 docs.

### Trabajo derivado del Bloque 4
- **Métricas persistentes** de uso de motores (hoy solo en memoria, se pierden al recargar). Persistir en `_meta/search_metrics` para tendencias largas.

### Trabajo derivado del Bloque 2B
- **Dashboard del batch**: vista del CRM que muestra el histórico de ejecuciones nocturnas (`_meta/batch_checkpoint`) — última ejecución, duración, errores, distribución de cambios.

### Trabajo no contemplado en el plan
- **Migración fuente_descubrimiento de geografica a ambas/sectorial** cuando se lancen búsquedas con la nueva Capa Sectorial Geográfica — automático cuando `processSearchResults` detecta el mismo studio en sectorial, ya implementado.
- **Filtro de provincia en bandeja del agente**: hoy la bandeja muestra todos los studios sin filtro geográfico. Útil cuando Manolo prepara visita a una zona específica.

---

## 📂 Archivos clave en el repo

| Archivo | Propósito |
|---|---|
| [docs/metodo_unificado_busqueda_CRM_Prospector_v1.1.md](metodo_unificado_busqueda_CRM_Prospector_v1.1.md) | Spec única de verdad — 1186 líneas |
| [docs/busqueda_cordoba_ing_2026-05-19.md](busqueda_cordoba_ing_2026-05-19.md) | Histórico de la búsqueda que motivó §18.5 |
| [docs/estado_implementacion_v1.1.md](estado_implementacion_v1.1.md) | Este archivo |
| [index.html](../index.html) | Toda la app — ~32.500 líneas tras esta sesión |
| [gas-batch-qualify.gs](../gas-batch-qualify.gs) | Endpoint server-side Bloque 2B — 604 líneas |
| [SETUP_BATCH_QUALIFY.md](../SETUP_BATCH_QUALIFY.md) | Pasos manuales para activar el endpoint |
| [.github/workflows/batch-qualify.yml](../.github/workflows/batch-qualify.yml) | Cron diario 02:00 UTC con steps activos |

---

## 🎯 Estado de PRs

- **PR #6** — `claude/peaceful-saha-a79023` → `main` — **MERGEADO** (`e1a815c`)
- **PR #7** — `feat/scoring-r1-r5` → `main` — **MERGEADO** (`b0a3e4a`)
  - Cierra última desviación de §7.3 (R1-R5 completos)
  - Dry-run validado sobre 1585 studios
  - Producción ya tiene el código tras GitHub Pages refresh

### Pendiente operativo (no bloquea código)

1. **Re-deploy GAS Web App** para activar R1-R5 en el cron nocturno.
   Pasos: script.google.com → proyecto CRM → Implementar → Gestionar implementaciones → editar la activa → Versión: Nueva → Implementar. La URL del Web App se conserva.
2. **Batch real sobre 1585** una vez re-desplegado el GAS:
   ```bash
   gh workflow run batch-qualify.yml -f filtro=todos -f limite=1585
   ```
   Esto persistirá los nuevos R1-R5 en todos los docs.
3. **Rotar `ANTHROPIC_API_KEY`** (vista en plain text en Script Properties durante el setup) y borrar el JSON service account de `~/Downloads/`.

---

## ✅ Disciplina de ejecución cumplida

A lo largo de los 8 bloques se ha respetado el protocolo del prompt:
- **Anuncio** antes de empezar cada bloque (sección, archivos, verificación, estimación)
- **Auditoría** del estado actual antes de modificar (5 bloques tenían piezas pre-existentes)
- **Ejecución** completa del bloque antes de pedir validación
- **Resumen** archivo por archivo, tests pasados, commit hecho
- **Pausa** y espera de OK explícito antes del siguiente bloque
- **Sin modificar la spec** por iniciativa propia (solo Manolo aprobó §18.5)
- **Sin refactors mayores** no contemplados (cada cambio queda contenido)

---

*Plan v1.1 cerrado el 2026-05-20.*
