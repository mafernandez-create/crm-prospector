# Diagnóstico de Cobertura — CRM Prospector v1.1
_Generado: 18 de mayo de 2026 · Basado en lectura directa del código y documentos del repo_

---

## 1. RESUMEN EJECUTIVO

La implementación cubre aproximadamente el **45–50 % de la spec v1.1**. Las fases A–C (infraestructura de datos, búsqueda en capas, scoring doble eje) están completas o casi completas. Las fases D–I están en distintos estados de borrador o sin iniciar.

**Top 3 áreas con mayor cobertura**
1. **§7 Scoring doble eje** — lógica de cálculo completa para el Eje 1 (Valor Directo, D1–D6). Eje 2 parcial (R4 implementado; R1–R3, R5 pendientes de fuentes externas).
2. **§5 Capas de búsqueda** — bloque base + 6 bloques sectoriales (ARQ, ING, OCV, AAPP, CCRR, CICA) implementados. PLACSP integrado para tipos relevantes.
3. **§8 Matriz 3×3** — lógica de asignación completa (9 cuadrantes, nombres, acción recomendada). `scoringHistory` (máx 20 entradas) funciona.

**Top 3 áreas con mayor brecha**
1. **§10 / §15 Agente nocturno** — el workflow `batch-qualify.yml` es un _placeholder_ explícito; los `steps` están comentados y no ejecutan nada. No hay endpoint. La cualificación es 100 % manual.
2. **§16 (voz, reporte semanal, planificación)** — §16.1 (voz) no existe. §16.3 (planificación semana siguiente) no cumple: el planificador abre en _hoy → hoy+14_, no en la semana N+1.
3. **§4 Metadatos completos** — la infraestructura existe (`getValor`, `esDatoVerificado`, 7 niveles), pero la mayor parte de los datos legacy persisten como strings planos; no hay migración masiva ejecutada.

**Desviaciones significativas detectadas**
- El campo `procesandose_por` (spec §15) no existe en el checkpoint de Firestore (`_meta/batch_checkpoint`).
- La verificación 4d tiene una inconsistencia entre la spec y la implementación: Bajo+Alta da ⑦ "Conector", no ④ "Puerta de entrada" (ver §4 y §5 del diagnóstico).
- La spec `metodo_unificado_busqueda_CRM_Prospector_v1.1.md` **no existe** en el filesystem; el brief la referencia pero no ha sido escrita todavía.

---

## 2. COBERTURA POR SECCIÓN DE LA SPEC

### §4 — Estructura de datos con metadatos
**Estado: EN PROCESO (~55 %)**

**Qué hay:**
- `getValor(campo)` desambigua string legacy y objeto `{valor}` (línea 4689).
- `esDatoVerificado(campo)` comprueba `nivel_confianza ∈ {verificado, verificado_humano}` (línea 4696).
- Los 7 niveles están referenciados en código: `verificado_humano`, `verificado`, `single_source`, `inferido`, `discrepancia`, `obsoleto`, `no_encontrado`. Se usa un octavo nivel `legacy` implícito para strings sin migrar.
- Los datos creados por el analizador web sí persisten como objetos con `valor`, `fuente_url`, `fecha_captura`, `nivel_confianza`.

**Qué falta:**
- No hay migración masiva de los ~1.500 documentos existentes de string a objeto.
- No hay UI que muestre el badge de confianza (punto de color, tooltip) en la ficha — pendiente de diseño §3.1 del brief.
- El campo `fecha_captura` se asigna al momento del análisis pero no hay lógica de expiración/detección de `obsoleto` por antigüedad (>12 meses).

---

### §5 — Capas de búsqueda (base + sectoriales)
**Estado: EN PROCESO (~70 %)**

**Qué hay:**
- Bloque base: compila búsquedas de contacto, descripción, empleados, proyectos, redes sociales, BORME, website.
- 6 bloques sectoriales completos: `ejecutarBloqueSectorial()` (línea 10512) para ARQ, ING, OCV, AAPP, CCRR, CICA.
- `buscarAdjudicacionesPLACSP()` integrado (línea 10651), llamado para OCV/AAPP/CCRR/CICA.
- Adjudicaciones PLACSP almacenadas en `data.adjudicaciones` y mostradas en la ficha.

**Qué falta:**
- Multi-motor: sigue usando un único motor de búsqueda (proxy DuckDuckGo/GAS). La spec pide al menos dos motores con estrategia de failover.
- No hay caché de resultados por búsqueda para evitar duplicar llamadas en reanalisis sucesivos.
- PLACSP Monitor automático (alertas cuando aparecen licitaciones nuevas): no implementado.

---

### §6 — Modos cualificación / briefing
**Estado: EN PROCESO (~60 %)**

**Qué hay:**
- Modal `Cualificar Lote` (línea 16325): selección por filtro, barra de progreso, actualiza scoring v2 + cuadrante. Funciona.
- Modal `Generar Briefing` (línea 27501): selector de fecha, campo de contexto adicional, llamada a IA con datos del studio + búsqueda web opcional + historial de informes.
- `generarBriefing()` extrae y formatea: datos clave, proyectos, equipo, historial de contacto, fit GPF, agenda.

**Qué falta:**
- El briefing no muestra explícitamente el bloque **"Lo último que hablamos"** extraído de `scoringHistory` + última actividad — usa `reportJson` si existe, pero no lo resume como sección nombrada.
- No hay modo formal `cualificacion` con output estructurado (score v2 + cuadrante + acción recomendada) separado del briefing — actualmente el scoring v2 se calcula pero no se presenta al usuario como dossier de cualificación.
- La invocación de cualificación desde lote nocturno (§10) no existe (ver más abajo).

---

### §7 — Scoring doble eje v2
**Estado: EN PROCESO (~72 %)**

**Qué hay:**
- `calculateScoringV2(studio)` (línea 5837): dos ejes completamente independientes.
- **Eje 1 Valor Directo**: D1 (tipo), D2 (tamaño/empleados), D3 (facturación, siempre 0 — `sin_dato_fiable`), D4 (actividad reciente), D5 (fit catálogo GPF, 5 familias), D6 (completitud de contacto). Máx 15 pts → Alto/Medio/Bajo.
- **Eje 2 Valor de Red**: R4 (posición referente, 4 señales: li_followers, awards, teaching, wide_portfolio/social_active). R1–R3, R5 = 0 explícitamente marcados `sin_dato_fiable`.
- `buildScoringV2Updates(studio, trigger)` persiste con `scoringHistory` máx 20 entradas (línea 5978).

**Qué falta:**
- R1 (densidad de cartera prescrita), R2 (densidad GPF en su zona), R3 (exclusividad / competencia), R5 (diversidad de tipos de cliente): todos en 0. Requieren datos externos no disponibles aún.
- D3 (facturación) en 0. Requiere fuente de datos (SABI, Einforma).

---

### §8 — Matriz 3×3 y asignación de cuadrante
**Estado: EN PROCESO (~65 %)**

**Qué hay:**
- `_SV2_QUADRANT_MAP` (línea 5815), `_SV2_QUADRANT_NAMES` (5820), `_SV2_ACTIONS` (5825): 9 cuadrantes con nombre propio y acción recomendada.
- Cuadrante asignado y mostrado como chip en la lista de estudios (`qShort[]`, línea 8517).
- Filtro `sin_cuadrante` en el modal de lote.
- Historial de scoring con cambios de cuadrante almacenado.

**Qué falta:**
- Vista de **matriz interactiva** (9 celdas con recuento de clientes, clic para filtrar): no implementada.
- **Filtro de cuadrante** en el listado principal de estudios: no existe como select dedicado.
- **Indicador de cambio de cuadrante** (↑ ↓ flecha + delta) en bandeja o ficha: no implementado.
- La **"Bandeja del agente"** con tarjetas de cambio de cuadrante, discrepancias, datos obsoletos y candidatos nuevos: no existe como vista.

---

### §9 — Posición referente
**Estado: EN PROCESO (~40 %)**

**Qué hay:**
- R4 implementado como sub-bloque de Eje 2: 4 señales detectables desde datos existentes (seguidores LinkedIn, premios, docencia, portfolio amplio/actividad social). Score 0/2/4 pts.
- Las señales se detallan en `priorityNetworkDetails` del scoring.

**Qué falta:**
- El concepto de posición referente más amplio (influencia en colegios, ponencias publicadas, proyectos de referencia mediáticos) no tiene campo explícito ni se persiste como dato estructurado.
- R1–R3, R5 del Eje de Red (que miden la red de contactos accesible a través del estudio) permanecen en 0.

---

### §10 — Modo cualificación con lotes nocturnos
**Estado: PENDIENTE (~15 %)**

**Qué hay:**
- `batch-qualify.yml` (GitHub Actions) define `cron: '0 2 * * 1-5'` y `workflow_dispatch` con parámetros `filtro` y `limite`.
- El job tiene `timeout-minutes: 30`.
- La UI manual (`iniciarCualificarLote`) funciona correctamente.

**Qué falta — CRÍTICO:**
- Los `steps` del workflow están **comentados**. El job solo imprime un mensaje: _"⚠️ Endpoint /api/batch-qualify aún no configurado"_.
- No existe el endpoint `BATCH_ENDPOINT` ni `BATCH_API_KEY` en secrets de GitHub.
- El cron está definido **solo para lunes–viernes** (falta sábado y domingo). La spec dice _cada noche_.
- No hay campo `procesandose_por` en el checkpoint de Firestore (`_meta/batch_checkpoint` solo guarda `trigger`, `total`, `processed`, `lastId`, `updatedAt`).

---

### §11 — Integración con PLACSP Monitor
**Estado: EN PROCESO (~45 %)**

**Qué hay:**
- `buscarAdjudicacionesPLACSP(name)` (línea 10651) consulta la API del monitor para OCV/AAPP/CCRR/CICA.
- `_persistirAdjudicacionesPLACSP()` almacena en `data.adjudicaciones` con metadata.
- Las licitaciones se muestran en la ficha del estudio con enlace directo a PLACSP.

**Qué falta:**
- El monitor es reactivo (se ejecuta cuando se analiza el estudio), no proactivo (no hay suscripción ni alerta automática cuando aparece una licitación nueva).
- No hay vista de "candidatos nuevos descubiertos por PLACSP" en la bandeja del agente.
- Sin PLACSP Monitor en la ruta nocturna (que no existe).

---

### §15 — Ejecución híbrida y UI agente
**Estado: PENDIENTE (~10 %)**

**Qué hay:**
- `com.crm.autopush.plist` (launchd): existe, pero **sólo dispara `auto-push.sh`** al detectar cambios en `index.html`. No lanza cualificación.
- `batch-qualify.yml`: estructura de workflow con `schedule` + `workflow_dispatch` (ver §10).
- `claude.yml`: responde a @claude en issues/PRs y revisa pushes manuales.

**Qué falta:**
- Un launchd dedicado a la cualificación nocturna (distinto del auto-push).
- El endpoint server-side que el workflow puede llamar.
- Campo `procesandose_por` en checkpoint.
- La **UI del agente** completa: Bandeja del agente (§3.2 del brief), Cola de cualificación (§3.3 del brief), botón "Lanzar lote ahora" en header (§3.5).

---

### §16.1 — Captura post-visita por voz
**Estado: PENDIENTE (0 %)**

No existe ninguna implementación de `SpeechRecognition`, `webkitSpeechRecognition`, ni grabación de audio. El informe post-visita se genera exclusivamente mediante formulario de texto o mediante IA a partir de notas escritas.

---

### §16.2 — Generador de reporte semanal
**Estado: EN PROCESO (~55 %)**

**Qué hay:**
- `generarResumenSemanal()` (línea 26357): genera un resumen ejecutivo en Word con IA, a partir de las visitas del período seleccionado en la vista "Períodos".
- `gen_resumen_visitas.js` (fichero standalone): genera el mismo documento Word fuera del CRM.
- El prompt estructura el informe con: resultados por nivel de interés, municipios cubiertos, competidores, oportunidades, compromisos.

**Qué falta:**
- No es una vista dedicada. El botón `📝 Resumen IA` aparece condicionalmente en la vista "Análisis/Períodos" — no es accesible desde navegación principal.
- El formato de salida es Word, no un dashboard en pantalla.
- No genera automáticamente cada semana (requiere acción manual).
- No incorpora cambios de cuadrante ni alertas del agente en el resumen.

---

### §16.3 — Vista "Planificación de la semana"
**Estado: PENDIENTE (~10 %)**

**Qué hay:**
- `openPlanificador()` (línea 24413): modal completo con calendario, drag-and-drop, filtros por zona/tipo, sync con Firebase/iPhone/Google Calendar/Sheet del jefe.

**Qué falta — CRÍTICO (cambio reciente a la spec):**
- El planificador abre con `fecha-inicio = hoy` y `fecha-fin = hoy+14` (líneas 24577–24581). **No muestra la semana siguiente (N+1) por defecto.**
- No hay lógica de "lunes de la próxima semana como fecha de inicio".
- No hay botón de acceso rápido "Planificar semana que viene".

---

## 3. ESTADO POR FASE (A–I del plan §14)

_Fases reconstruidas desde git tags (`fase-a`, `fase-b-metodo-unificado`, `fase-c-scoring-v2`, `fase-d-ui-matriz`) y el comentario de `batch-qualify.yml` ("Fase E del Método Unificado v1.1")._

| Fase | Descripción (inferida) | Estado | Próximo hito |
|---|---|---|---|
| **A** | Type system array + helpers (`getValor`, `getTiposArray`, `getB2BTypeName`) | ✅ COMPLETADO | — |
| **B** | Método unificado de búsqueda en capas (base + sectoriales, PLACSP) | ✅ COMPLETADO | — |
| **C** | Scoring v2 — cálculo doble eje + `scoringHistory` | ✅ COMPLETADO | — |
| **D** | UI de la matriz 3×3 (chip, filtros, bandeja) | 🟡 EN PROCESO | Completar vista matriz interactiva + filtro cuadrante en lista |
| **E** | Endpoint batch-qualify + workflow nocturno real | 🔴 PENDIENTE | Crear endpoint (GAS o servidor) + descomentar steps del workflow |
| **F** | Campo `procesandose_por` + timeout + retry | 🔴 PENDIENTE | Depende de Fase E |
| **G** | Vista "Planificación de la semana" (N+1 por defecto) | 🔴 PENDIENTE | Cambiar default de `openPlanificador()` a lunes próxima semana |
| **H** | Reporte semanal como vista dedicada + automatización | 🔴 PENDIENTE | Promover `generarResumenSemanal()` a vista propia |
| **I** | Captura post-visita por voz (§16.1) | 🔴 PENDIENTE | Implementar `SpeechRecognition` en modal de visita |

---

## 4. VERIFICACIONES CRÍTICAS

### 4a) Datos persisten como objetos con valor, fuente_url, fecha_captura, nivel_confianza (7 niveles)
**PARCIALMENTE CUMPLE.**

La infraestructura existe y funciona: `getValor()` lee ambos formatos, `esDatoVerificado()` comprueba el nivel, los 7 niveles están definidos y usados en el código. Los datos creados por el analizador web (desde mayo 2026) sí se persisten como objetos.

Sin embargo, los ~1.500 documentos existentes antes de la Fase A mantienen campos como strings planos. No hay script de migración masiva ejecutado ni pendiente en el código. El badge de confianza en la UI de la ficha no está implementado.

**Cómo corregir**: ejecutar migración que envuelva strings existentes en `{valor: s, fuente_url: null, fecha_captura: null, nivel_confianza: 'legacy'}`. Añadir lógica que detecte campos con `fecha_captura` > 12 meses y cambie `nivel_confianza` a `'obsoleto'`.

---

### 4b) Campo `type` es array (`["ARQ"]`), no string. Permite tipos compuestos
**CUMPLE.**

`getTiposArray()` (línea 4652) normaliza correctamente. Los nuevos studios se crean con `type: Array.isArray(studioType) ? studioType : [studioType]` (líneas 9521, 9744, 12759, 13612). El filtrado y el scoring usan `getTiposArray()` y `getTipoPrincipal()`. Los strings legacy se convierten via `TIPO_LEGACY_MAP`.

---

### 4c) Scoring doble eje independiente: dos scores, cuadrante calculado combinando ambos
**CUMPLE.**

`priorityDirect` y `priorityNetwork` se calculan de forma completamente independiente en `calculateScoringV2()`. El cuadrante se asigna como `_SV2_QUADRANT_MAP[priorityDirect + '_' + priorityNetwork]`. No hay dependencia cruzada entre ejes en el cálculo.

Nota: el Eje 2 produce casi siempre `Baja` (rawNetwork = 0 para todos los studios sin datos de R1–R3, R5), lo que hace que muchos clientes caigan en cuadrantes ③ ⑥ ⑨. En la práctica el eje de red no discrimina aún.

---

### 4d) Caso Hyfotec (Valor directo bajo + Valor de red alto) → cuadrante ④ "Puerta de entrada"
**NO CUMPLE. Hay una inconsistencia entre la spec y la implementación.**

La matriz implementada es:
```
Bajo_Alta  → 7 (Conector)
Medio_Alta → 4 (Puerta de entrada)   ← aquí está ④
```

La verificación asume `Bajo_Alta = ④ "Puerta de entrada"`, pero en el código `Bajo_Alta = ⑦ "Conector"`. La matriz del brief (§4.2) es consistente con la implementación: ④ = Directo **Medio** + Red Alta. Si Hyfotec tiene Valor Directo **bajo** (no prescribe materiales directamente), el código lo asigna correctamente a ⑦ Conector.

**Dos interpretaciones posibles:**
1. La spec 4d tiene un error tipográfico: Hyfotec debería ir a ⑦, no a ④. La implementación es correcta.
2. La intención comercial es que Hyfotec sea ④ "Puerta de entrada" (acceso a CRs), lo que requiere que su Valor Directo sea **Medio**, no Bajo — esto depende de cómo se puntúe D1 y D5 para el tipo CICA.

**Acción recomendada**: aclarar si la especificación quiere que `Bajo+Alta = ④` (cambiaría la matriz) o si es un error tipográfico y Hyfotec debería puntuar `Medio` en Directo (ajustar D1 para CICA).

---

### 4e) [CRÍTICO] El agente nocturno corre cada noche, no solo los domingos
**NO CUMPLE.**

El `cron: '0 2 * * 1-5'` en `batch-qualify.yml` solo cubriría lunes–viernes, ya excluyendo sábado y domingo. Pero este punto es irrelevante porque **el job no ejecuta nada**: los únicos `steps` activos son `checkout` y un `echo` de diagnóstico. La sección que llama al endpoint está comentada.

La cualificación solo ocurre cuando el usuario pulsa "🤖 Cualificar Lote" manualmente en el CRM.

**Cómo corregir**: (1) crear el endpoint server-side; (2) configurar `BATCH_ENDPOINT` y `BATCH_API_KEY` en GitHub Secrets; (3) descomentar los steps del workflow; (4) cambiar el cron a `'0 2 * * *'` (todos los días).

---

### 4f) [CRÍTICO] Vista "Planificación de la semana" muestra por defecto la SEMANA SIGUIENTE (N+1)
**NO CUMPLE.**

`openPlanificador()` (líneas 24577–24581) asigna:
```javascript
document.getElementById('plan-fecha-inicio').value = today.toISOString().split('T')[0]; // hoy
nextWeek.setDate(today.getDate() + 14);  // hoy + 14 días
```

No hay lógica de "próximo lunes" ni "semana N+1". El usuario que abre el planificador el lunes ve la semana en curso, no la siguiente.

**Cómo corregir** (mínimo): calcular el próximo lunes (`d.setDate(d.getDate() + (8 - d.getDay()) % 7 || 7)`) y asignarlo como `plan-fecha-inicio`, con `plan-fecha-fin = lunes siguiente + 4 días`. Esto es un cambio de ~5 líneas.

---

### 4g) Integración con Visitas GPF: export markdown (frontmatter YAML + 5 bloques) importable al CRM
**NO CUMPLE.**

No existe ningún export en formato markdown con frontmatter YAML. Los informes de visita se generan exclusivamente como `.docx` (vía `generarBriefing()` y los scripts `/tmp/informe_*.js`). No hay importación automatizada de esos docx al CRM como registros estructurados con los 5 bloques definidos.

La integración actual es **manual**: los `.docx` se suben a `data.reports[]` como base64 (como hemos hecho en esta sesión via servidor HTTP local). Los campos estructurados de los informes (interlocutor, temas tratados, compromisos, próximo paso, señales) no se mapean a campos de Firestore.

**Estado real**: sin Fase I implementada, la integración es manual y unidireccional (docx en Firestore, sin parsing estructurado).

---

### 4h) Ejecución híbrida Mac (launchd) + GitHub Actions (workflow_dispatch + nocturno), campo `procesandose_por`, timeout 30 min
**PARCIALMENTE CUMPLE en estructura, NO CUMPLE en ejecución.**

| Elemento | Estado |
|---|---|
| launchd (`com.crm.autopush.plist`) | Existe, pero **solo para auto-push git**. No lanza cualificación. |
| GitHub Actions con `schedule` | `batch-qualify.yml` definido con `cron: '0 2 * * 1-5'` pero steps comentados. |
| `workflow_dispatch` | Definido con inputs `filtro` y `limite`. No ejecuta nada. |
| Campo `procesandose_por` | **No existe** en `_meta/batch_checkpoint`. Solo hay `trigger`, `total`, `processed`, `lastId`, `updatedAt`. |
| Timeout 30 min | `timeout-minutes: 30` está en el YAML pero el job vacío termina en segundos. |

**Cómo corregir**: añadir `procesandose_por: 'github_actions' | 'mac_local'` al checkpoint. Crear launchd separado para la cualificación nocturna en Mac. Implementar el endpoint.

---

## 5. DESVIACIONES DE LA SPEC detectadas

| # | Qué dice la spec | Qué está implementado | Por qué | ¿Corregir? |
|---|---|---|---|---|
| **D1** | Agente nocturno ejecuta cada noche | Workflow es placeholder; cron solo L–V | Endpoint no disponible | Sí, pendiente Fase E |
| **D2** | Planificador muestra N+1 por defecto | Muestra hoy + 14 | Implementado antes de este cambio de spec | Sí, 5 líneas de JS |
| **D3** | `procesandose_por` en checkpoint batch | Campo no existe | No incorporado al diseñar `cualificarLote()` | Sí, bajo coste |
| **D4** | Export markdown con frontmatter YAML | No implementado; todo es docx | Decisión implícita de usar Word | Depende de si se quiere la Fase I |
| **D5** | Cron todos los días | `1-5` (solo laborables) | Escribir el plist inicialmente | Sí, cambio trivial cuando el endpoint exista |
| **D6** | spec `metodo_unificado_...v1.1.md` existe | El archivo no existe | Pendiente de redactar | Sí, documento de especificación técnica a crear |

---

## 6. RIESGOS O BLOQUEOS actuales

1. **Sin endpoint server-side** — `iniciarCualificarLote()` funciona en el navegador, pero no puede correr sin sesión abierta. Hasta que no haya un endpoint HTTP que llame a la lógica de scoring desde GitHub Actions, el agente nocturno no es posible. Bloquea Fases E, F y todo lo que depende de automatización.

2. **Spec técnica no escrita** — `metodo_unificado_busqueda_CRM_Prospector_v1.1.md` es referenciado por el brief pero no existe. Sin él, no hay contrato formal para nuevas implementaciones; cada decisión de diseño requiere acordarlo de cero.

3. **Eje 2 casi siempre en Baja** — R1–R3 y R5 del Valor de Red están en 0 para todos los studios. El 95 %+ de los clientes cae en cuadrantes ③ ⑥ ⑨ (Baja en red). El scoring v2 no discrimina en el eje que le da el mayor valor diferencial al método hasta que se incorporen fuentes externas de datos de red.

4. **Archivo único de 1.6 MB** — el `index.html` supera las 27.000 líneas. Añadir las vistas de la Fase D (bandeja del agente, cola, matriz interactiva) sin refactorizar aumenta el riesgo de conflictos y tiempos de carga.

5. **Sin migración de datos legacy** — mientras los datos existentes sigan como strings planos, `esDatoVerificado()` los trata como datos sin trazabilidad. El nivel de confianza mostrado al usuario sería engañoso hasta completar la migración.

6. **Ambigüedad del cuadrante ④ para Hyfotec** (ver 4d): requiere decisión antes de que el scoring v2 se muestre a los usuarios.

---

## 7. PRÓXIMOS PASOS SUGERIDOS

| # | Acción | Estimación | Impacto |
|---|---|---|---|
| **1** | **Crear `metodo_unificado_busqueda_CRM_Prospector_v1.1.md`** — escribir la spec técnica completa (fases, esquema de datos, lógica de scoring, fases A–I, campos requeridos). Sin esto el resto carece de contrato. | 4–6 h | Alto |
| **2** | **Fix planificador N+1** — cambiar `openPlanificador()` para que `fecha-inicio` apunte al próximo lunes y `fecha-fin` al viernes de esa semana. | 1–2 h | Medio (corrección reciente de spec) |
| **3** | **Completar UI Fase D** — añadir: (a) filtro de cuadrante en listado; (b) chip con flecha de cambio ↑↓ en lista; (c) vista matriz 3×3 interactiva con recuento por celda. | 1–2 días | Alto (habilita que el scoring v2 sea visible y accionable) |
| **4** | **Endpoint batch-qualify** — crear un endpoint mínimo (Google Apps Script `doPost` o Cloudflare Worker) que reciba `{filtro, limite}`, llame a la lógica de scoring, y actualice Firestore. Descomentar steps de `batch-qualify.yml` y añadir `procesandose_por`. | 1–3 días | Crítico (desbloquea el agente nocturno) |
| **5** | **Script de migración legacy → objeto** — recorrer `allStudios`, envolver strings en `{valor, fuente_url: null, fecha_captura: null, nivel_confianza: 'legacy'}`, hacer batch write a Firestore. Habilita badge de confianza en UI. | 2–4 h | Medio |

---

_Diagnóstico generado leyendo directamente: `index.html` (~27 k líneas), `.github/workflows/batch-qualify.yml`, `.github/workflows/claude.yml`, `Library/LaunchAgents/com.crm.autopush.plist`, `agentes/_lib/crm_query.py`, `cotejo-plan-v5/00_mapa_crm_actual.md`, `cotejo-plan-v5/07_plan_mejoras_crm.md`, `Downloads/brief_diseno_CRM_Prospector_v1.1.md`, `CLAUDE.md`, y tags git del repo. No se ha modificado ningún archivo de código._
