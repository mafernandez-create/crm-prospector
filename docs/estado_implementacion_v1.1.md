# Estado de implementación spec v1.1 — punto de retoma

**Última actualización**: 2026-05-20
**Rama de trabajo**: `claude/peaceful-saha-a79023` (en `origin` también)
**Último commit en local y remoto**: `dd17aac` — *feat(bloque2A): Capa Sectorial Geográfica §18.5 client-side*
**PR abierto**: [crm-prospector#6](https://github.com/mafernandez-create/crm-prospector/pull/6) — incluye los 4 commits de esta tanda, sin mergear aún.

---

## 📍 Punto exacto donde nos quedamos

**Bloque 2A completado y commiteado**. Esperando OK del usuario para pasar al **Bloque 2B (Endpoint nocturno — Parte A)**.

**Decisión pendiente concreta**:

> Antes de empezar Bloque 2B, el usuario debe elegir tecnología para el endpoint:
> - **GAS `doPost`** (stack ya conocido, hay que replicar ~350 líneas de scoring v2 en V8 GAS, quotas estrictas)
> - **Cloudflare Worker** (infra nueva pero JS moderno, free tier 100k/día)
> - Una tercera vía: dejar Mac launchd como fuente única y declarar la Fase E cubierta semi-manualmente.

Tras la elección, hay que:
1. Crear archivo `.gs` o `worker.js` con la lógica equivalente a `cualificarLote()` ([index.html:17133](../index.html))
2. Configurar secrets `BATCH_ENDPOINT` y `BATCH_API_KEY` en GitHub
3. Descomentar los steps reales en [.github/workflows/batch-qualify.yml](../.github/workflows/batch-qualify.yml)
4. Probar `workflow_dispatch` manual antes del cron

---

## ✅ Bloques completados en esta sesión

### Bloque 0 — Quick wins
- [x] Sub-tarea 1: subir spec v1.1 a `docs/` — **hecho en esta sesión** (commit `58ac4e7`, añade §18.5)
- [x] Sub-tarea 2: planificador N+1 (próximo lunes → viernes) — ya en `main` (commit pre-existente `322b487`)
- [x] Sub-tarea 3: cron diario `'0 2 * * *'` — ya en `main`
- [x] Sub-tarea 4: campo `procesandose_por` en checkpoint — ya en `main`

### Bloque 1 — Cliente puente
- **Commit**: `db75d67`
- Lo que ya estaba: atributo `es_cliente_puente`, detección automática en `calculateScoringV2`, bonus D1+2/D5+2, tarjeta bandeja, acciones confirmar/descartar.
- **Lo que se hizo en esta sesión**:
  - Fix de `recalculateAllPriorities()`: eliminado el filtro `if (!studio.priorityQuadrant)` que dejaba fuera a toda la cartera ya scoreada.
  - Escritura selectiva: solo si hay cambio real (cuadrante distinto o nuevo candidato).
  - Texto del confirm actualizado a spec v2 (D1-D6, R1-R5, cuadrante 1-9, regla cliente puente §7.2.1).
  - Resumen final con métricas: cambios cuadrante, candidatos puente nuevos, distribución `Alto/Medio/Bajo`.
- **Hallazgo importante**: `rawNetwork = R4 only` y R4 = 0 para los 1585 studios. La detección de candidatos a puente queda dormida hasta que el Bloque 2A llene rawNetwork con proyectos en zona. **NO se ejecutó el recálculo masivo sobre Firestore** (sin valor hasta B2 esté en producción).

### Bloque 2A — Capa Sectorial Geográfica (Parte B de §18.5)
- **Commit**: `dd17aac`
- **Implementado**:
  - `TIPO_SECTORES` (mapping tipo→sectores §18.5.2)
  - `buildSectorialQueries(provincia, sectores)` — 4 queries por sector
  - `buildAcademicQueries(provincia, sectores)` — 4 queries académicas
  - Paso **11-bis** en `searchStudiosInProvince` (entre adjudicaciones y capital de provincia)
  - Paso **11-ter** académico con filtro §18.5.7 (evidencia <24 meses, regex `(ponente|congreso|publicación|proyecto|investigación|tesis|cátedra)` + año 2024-2026)
  - `processSearchResults` con nuevo parámetro `fuenteDescubrimiento` (`'geografica' | 'sectorial' | 'academica'`), default `'geografica'`
  - Promoción automática: `geografica + sectorial ⇒ ambas`, `cualquiera + academica ⇒ academica`
  - `addStudio` aplica auto-marcado `es_cliente_puente: true` cuando fuente es sectorial o academica (§18.5.4)
  - Badge en columna Prioridad del listado: `🌍 sectorial` / `🌍 ambas` / `🎓 académica`
  - Nueva sección "🌍 Prescriptores con proyectos en zona" en bandeja del agente
- **Validación §18.5.5** — test unitario con mocks que replican el caso real: 5/5 PASS (Agrimensur sectorial+puente, RM Agro sectorial+puente, Camacho academica+puente, Morillo academica+puente, Azabache promoción a ambas).
- **NO ejecutada validación con búsqueda real** porque (a) los proxies CORS están degradados como vimos en la sesión, (b) lleva 20+ min. La validación con mocks demuestra la lógica; la validación real-mundo queda para cuando el usuario pueda lanzar la búsqueda desde producción con red estable.

### Refactor sumario (no es bloque del plan, lo hice antes de empezar)
- **Commit**: `534b914`
- Eliminado el motor "IA (Claude)" generador de nombres por incumplir §10.1, §4.2, §7.4, §17. Datos: 0 leads aportados en histórico. Tasa de alucinación medida 67 % sobre 12 leads de la búsqueda Córdoba ING del 19 de mayo.

---

## ⏳ Bloques pendientes (en orden del plan §18)

| # | Bloque | Estado | Decisión / dependencia |
|---|---|---|---|
| **2B** | Endpoint nocturno (Parte A) | **EN ESPERA — punto de retoma** | Decidir GAS vs CF Worker |
| 3 | UI Fase D consolidación | Pendiente | Cinco componentes: filtro cuadrante, **filtro fuente_descubrimiento multi-select** (§18.5.6), chip delta ↑↓, matriz 3×3 interactiva, bandeja con 5 tipos de tarjeta |
| 4 | Multi-motor de búsqueda | Pendiente | Brave + DDG con failover (§18 Decisión 4). NOTA: parcialmente implementado, `searchWeb` ya tiene DDG→Brave failover ([index.html:11119](../index.html)) — auditar antes de tocar |
| 5 | Migración legacy | Pendiente | Envolver string-planos en `{valor, fuente_url, fecha_captura, nivel_confianza: 'legacy'}`. Añadir `fuente_descubrimiento: 'geografica'` con `legacy` a todos los studios existentes. Dry-run obligatorio |
| 6 | Reporte semanal + planificador | Pendiente | Promover `generarResumenSemanal()` a vista propia. Incorporar cambios de cuadrante y alertas del agente |
| 7 | Fase I dual (voz + manual) | Pendiente | Modal con dos botones (Grabar/Escribir). Modalidad voz con faster-whisper local. Estructura `RegistroVisita` con 5 bloques |

---

## 📂 Archivos clave para retomar

| Archivo | Por qué importa |
|---|---|
| [docs/metodo_unificado_busqueda_CRM_Prospector_v1.1.md](metodo_unificado_busqueda_CRM_Prospector_v1.1.md) | Spec — fuente única de verdad |
| [docs/busqueda_cordoba_ing_2026-05-19.md](busqueda_cordoba_ing_2026-05-19.md) | Histórico de la búsqueda que motivó §18.5 |
| [docs/estado_implementacion_v1.1.md](estado_implementacion_v1.1.md) | Este archivo |
| [index.html](../index.html) | Toda la app |
| [.github/workflows/batch-qualify.yml](../.github/workflows/batch-qualify.yml) | Workflow placeholder para el endpoint del Bloque 2B |
| `gas-fetchurl.gs`, `duns-apps-script.gs`, `fix-apps-script.gs` | GAS existente — si elegimos GAS doPost, añadir handler aquí |

---

## 🚦 Restricciones generales activas

- No modificar la spec sin acuerdo previo.
- Leer código existente antes de modificarlo.
- Cada commit revertible limpio.
- No reescribir index.html ni refactors >50 líneas sin discusión.
- Comunicar nombre/ubicación de archivos nuevos antes de crearlos.
- No avanzar al siguiente bloque sin OK explícito (no "está listo", sí "OK sigue").

---

## ▶️ Cómo retomar la próxima sesión

1. **Saludo + lectura del estado**:
   - Pedirme: *"Lee `docs/estado_implementacion_v1.1.md` y resúmeme dónde estamos"*.
   - Yo confirmo: rama, último commit, qué falta, decisión pendiente.

2. **Decidir tecnología del endpoint** (Bloque 2B):
   - GAS doPost / Cloudflare Worker / otra vía.

3. **Auditar antes de tocar**:
   - Leer `.github/workflows/batch-qualify.yml` (placeholder actual).
   - Leer `cualificarLote()` en [index.html:17133](../index.html) (lógica equivalente client-side).
   - Si se elige GAS, leer los 3 archivos `.gs` para entender el patrón doPost ya existente.

4. **Anunciar el plan del Bloque 2B con archivos concretos** y pedir OK.

5. **Ejecutar Bloque 2B** siguiendo la disciplina (anunciar → ejecutar → resumir → pausar).

---

## 📊 Métricas de progreso

- Bloques completados del plan: **3 de 8** (B0 + B1 + B2A) — 37,5 %
- Commits en esta sesión: **4** (sin contar este archivo)
- Líneas de `index.html` tocadas: ~280 (entre B0 documentado, motor IA eliminado, B1, B2A)
- Líneas spec v1.1: 1186 (post §18.5)

---

*Archivo generado al cierre de la sesión del 2026-05-20 para permitir retoma exacta.*
