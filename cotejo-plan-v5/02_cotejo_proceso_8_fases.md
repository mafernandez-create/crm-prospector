# 02 · Cotejo del Proceso Comercial de 8 Fases
_Generado: 2 mayo 2026 · Rama: feat/cotejo-plan-v5_
_Fuente Plan v5: Sección 9 [V] verificada_

---

## Leyenda

| Símbolo | Significado |
|---|---|
| ✅ | Implementado en CRM con cobertura completa |
| ⚠️ | Implementado parcialmente o de forma aproximada |
| ❌ | Ausente — no existe en el CRM |

---

## Las 8 fases del Plan v5 (Sección 9)

| # | Fase Plan v5 | Descripción Plan v5 | Estado en CRM | Equivalente CRM | Observaciones |
|---|---|---|---|---|---|
| 1 | Identificación | Alta del prescriptor, scoring inicial | ⚠️ | `status = nuevo` | El alta existe, pero no hay scoring automático en el alta ni calificación de tipo de prescriptor |
| 2 | Cualificación | Verificar encaje sector/producto; asignar prioridad A/B/C | ❌ | — | No existe como estado ni como campo. La prioridad (`Alta/Media/Baja`) existe pero no se vincula al paso de fase 1→2 |
| 3 | Mapeo del prescriptor | Identificar DM, organigrama, normas exigidas, financiación | ❌ | — | No hay campos para norma exigida (ETNT003/015) ni programa de financiación. El DM se marca con `isDecisionMaker` en el equipo, pero no hay validación |
| 4 | Primer contacto | Registro del primer contacto efectivo | ⚠️ | `status = contactado` | El estado existe, pero no hay criterio de paso: no se exige registrar actividad de tipo `call` o `email` para llegar a este estado |
| 5 | Visita técnica | Reunión presencial + 13 campos de visita | ⚠️ | `status = reunion` | El estado existe. Sin embargo, de los 13 campos del Plan v5, solo 8 están presentes (ver Tarea 4). Faltan: sector, cargo, fase, evidencia documental, geolocalización |
| 6 | Documentación | Envío de ficha técnica, catálogo MUTE, pliego | ❌ | — | No existe ni como estado ni como campo. `negociacion` es el más próximo pero no equivale |
| 7 | Especificación | Confirmación en pliego/BOM; evidencia documental | ⚠️ | `status = prescripcion` | El estado existe con nombre correcto, pero no hay campo para evidencia documental (enlace/archivo al pliego) ni para la norma especificada |
| 8 | Seguimiento de obra | Acompañar adjudicación y montaje | ❌ | — | No existe como estado. `ganado` es posterior a la especificación pero no equivale al seguimiento de obra |

---

## Análisis por elemento clave

### 1. Campo explícito «fase del proceso»

**❌ No existe.**

El CRM no tiene ningún campo llamado `fase`, `faseComercial` o equivalente. El seguimiento del proceso se infiere del campo `status`, que tiene 9 valores posibles frente a las 8 fases del Plan v5.

```
Modelo de datos actual (campo status):
  nuevo → contactado → reunion → negociacion → traspasado / prescripcion / ganado / perdido / standby

Modelo requerido Plan v5 (campo fase):
  1-Identificación → 2-Cualificación → 3-Mapeo → 4-Primer contacto
  → 5-Visita técnica → 6-Documentación → 7-Especificación → 8-Seguimiento obra
```

Mapeo aproximado actual (máx. 5 de 8 fases tienen equivalente):

| Fase Plan v5 | Status CRM más próximo | Cobertura |
|---|---|---|
| 1. Identificación | `nuevo` | ⚠️ Parcial |
| 2. Cualificación | — | ❌ Sin equivalente |
| 3. Mapeo prescriptor | — | ❌ Sin equivalente |
| 4. Primer contacto | `contactado` | ⚠️ Parcial |
| 5. Visita técnica | `reunion` | ⚠️ Parcial |
| 6. Documentación | `negociacion` (aproximado) | ❌ Semántica distinta |
| 7. Especificación | `prescripcion` | ✅ Nombre correcto |
| 8. Seguimiento obra | — | ❌ Sin equivalente |

**Fases sin equivalente: 3 de 8 (37,5 %)**
**Fases con equivalente parcial: 4 de 8 (50 %)**
**Fases con equivalente correcto: 1 de 8 (12,5 %)**

---

### 2. Sistema b2bTimeline

**⚠️ Existe, pero no es el proceso del Plan v5.**

El CRM implementa `b2bTimeline` (línea ~19575 de index.html): una secuencia de pasos por empresa con `steps[]`, `currentStep`, `variant` y `triggers`. Tiene 7 plantillas por tipo (`getB2BTimeline()`, línea ~17646):

| Tipo empresa | Plantilla b2bTimeline | Relación con Fase Plan v5 |
|---|---|---|
| `arquitectura` | Secuencia propia | Solapamiento parcial |
| `ingenieria` | Secuencia propia | Solapamiento parcial |
| `promotora` (A y B) | 2 variantes | Sin equivalente directo |
| `constructora` | Secuencia propia | Solapamiento parcial |
| `aapp` | Secuencia propia + ciclo 3–18 meses | Más próxima a las 8 fases |
| `aguas` | Idem aapp | Idem |
| `regantes` | Secuencia propia + ciclo 60–365 días | Parcialmente alineada |

El b2bTimeline **no reemplaza** las 8 fases del Plan v5:
- Es una secuencia de acciones de contacto (llamadas, emails, LinkedIn, reunión), no de fases de madurez comercial
- No tiene campos de evidencia documental ni norma exigida
- La transición de paso es manual sin criterios de validación
- El dashboard no muestra un funnel por tipo de empresa ni por fase

---

### 3. Criterios de transición de fase a fase

**❌ No existen criterios de validación.**

La función `saveStatusChange()` (línea ~12651) ejecuta una actualización directa del campo `status` sin ninguna comprobación:

```javascript
// saveStatusChange() — actualización directa, sin validación de criterios
await db.collection('studios').doc(docId).update({ status: newStatus });
```

El Plan v5 (sección 9) exige criterios de paso documentados para cada fase. Ejemplos:
- Fase 1→2: confirmar sector + producto aplicable
- Fase 4→5: registrar actividad de contacto efectivo
- Fase 5→6: adjuntar documentación entregada
- Fase 6→7: confirmar especificación en pliego + evidencia documental
- Fase 7→8: obra adjudicada, número de expediente

**Ninguno de estos criterios está implementado en el CRM.**

---

### 4. Funnel agregado por fase

**⚠️ Existe por status, no por fase.**

La función `renderDashboardCharts()` (línea ~13962) calcula el funnel contando empresas por valor de `status`. El resultado es un funnel de 9 valores que no equivale al embudo de 8 fases del Plan v5.

Gaps del funnel actual:
- No diferencia entre fases 2 y 3 (cualificación y mapeo) — ambas caen en `nuevo`
- No muestra fase 6 (documentación) — cae en `negociacion`
- No muestra fase 8 (seguimiento obra) — cae en `ganado`
- No hay desglose por tipo de prescriptor (regante vs. ingeniería vs. AAPP)
- No hay indicador de velocidad por fase (tiempo medio en cada estado)

---

### 5. Alertas y vencimientos por fase

**⚠️ Existen alertas de b2bTimeline, no de fase.**

El CRM tiene alertas basadas en `b2bTimeline` (pasos pendientes de B2B) y en `followupDate` (campo en actividades). Sin embargo:
- Las alertas son por paso de contacto (B2B), no por criterio de fase
- No hay alerta de «llevas N días en fase X sin avanzar»
- No hay alerta de «la norma ETNT003 requiere que estés en fase 6 antes de fecha Y»
- El dashboard muestra «B2B urgentes» (pasos vencidos por fecha), pero no «prescriptores estancados en fase»

---

### 6. Score de madurez B2B

**⚠️ Existe, pero con lógica distinta.**

El CRM calcula un score de madurez B2B como:
```
60% pasos completados en b2bTimeline + 40% triggers activos
```

Este score **no equivale a la fase** del Plan v5:
- No refleja si se ha entregado documentación técnica
- No refleja si hay norma especificada en pliego
- No refleja el programa de financiación asociado (PARRA, FEADER...)
- Un prescriptor puede tener score alto con todos los emails enviados pero nunca haber llegado a fase 5 (visita técnica)

---

## Resumen de gaps

| Gap | Descripción | Impacto Plan v5 |
|---|---|---|
| G3-01 | Sin campo `fase` (1–8) en `studios` | 🔴 Alto — el funnel comercial real es inauditable |
| G3-02 | Fases 2, 3, 6 y 8 sin equivalente en el CRM | 🔴 Alto — 3 fases del proceso son invisibles |
| G3-03 | Sin criterios de transición de fase | 🟡 Medio — se puede cambiar status sin cumplir condiciones |
| G3-04 | Funnel agrega por `status`, no por `fase` | 🟡 Medio — el dashboard no refleja el proceso Plan v5 |
| G3-05 | Sin campo `normaExigida` ni `programaFinanciacion` en el alta | 🟡 Medio — fases 3 y 7 incompletas |
| G3-06 | Sin campo `evidenciaDocumental` (pliego/BOM) | 🟡 Medio — fase 7 (especificación) sin prueba |
| G3-07 | Alertas de B2B (acciones) ≠ alertas de estancamiento de fase | 🟢 Normal — mejora de visibilidad |
| G3-08 | Score madurez B2B no refleja avance por fase Plan v5 | 🟢 Normal — KPI interno desalineado |

---

## Propuestas de mejora (para Tarea 8)

| # | Cambio propuesto | Esfuerzo estimado | Prioridad |
|---|---|---|---|
| M1 | Añadir campo `fase` (1–8) al modelo `studios` | Bajo (campo nuevo) | 🔴 Alta |
| M2 | Mapa `status` ↔ `fase` para migrar datos existentes | Medio | 🔴 Alta |
| M3 | Actualizar funnel del dashboard para usar `fase` | Medio | 🔴 Alta |
| M4 | Añadir campos `normaExigida` y `programaFinanciacion` al detalle de empresa | Bajo | 🟡 Media |
| M5 | Añadir campo `evidenciaDocumental` (URL/archivo) al detalle de empresa | Bajo | 🟡 Media |
| M6 | Criterios de transición de fase (modal de confirmación en saveStatusChange) | Alto | 🟡 Media |
| M7 | Alerta de estancamiento por fase (N días sin cambio) | Medio | 🟢 Normal |

---

## Conclusión

El CRM tiene la **estructura base** para un proceso comercial (estados, b2bTimeline, actividades), pero el modelo de las 8 fases del Plan v5 **no está implementado**. Las divergencias son conceptuales, no solo de nomenclatura:

- El CRM usa **acciones de contacto** (llamadas, emails, reunión) como unidad de avance
- El Plan v5 usa **evidencias de madurez comercial** (norma exigida, documentación entregada, especificación en pliego) como criterio de fase

Esta diferencia hace que el funnel del CRM sea un registro de actividad, no un indicador real de progreso comercial según el Plan v5. La prioridad máxima del plan de mejoras (Tarea 8) debe ser añadir el campo `fase` (1–8) y rediseñar el funnel del dashboard.
