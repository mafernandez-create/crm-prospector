# 07 · Plan de Mejoras del CRM
_Generado: 2 mayo 2026 · Rama: feat/cotejo-plan-v5_
_Consolida los gaps de las Tareas 1–7 del cotejo Plan v5_

---

## Contexto

Este documento recoge todas las mejoras identificadas en el cotejo del CRM GPF contra el Plan de Prescripción 2026 v5, organizadas por prioridad, impacto y esfuerzo estimado. El objetivo es que sirva de hoja de ruta técnica para las próximas versiones del CRM.

**Resumen del cotejo (estado actual):**

| Área auditada | Resultado |
|---|---|
| Directorio prescriptores (Sección 8) | 4/29 correctos (14%). 14 acciones pendientes en CRM |
| Proceso comercial 8 fases (Sección 9) | 1/8 fases con equivalente correcto. Sin campo `fase` |
| 13 campos por visita (Sección 9) | 4/13 completos (31%). 6 ausentes |
| KPIs oficiales 2026 (Sección 11) | 0/5 KPIs individuales en dashboard |
| Marco regulatorio (Sección 14) | Sin campos para programa ni norma exigida |
| Tareas técnicas (Sección 15) | Sin vista de tareas anuales. 2 tareas vencidas |

---

## Bloque A — Mejoras de modelo de datos

_Campos nuevos en el documento `studios` de Firestore. Sin impacto en flujos existentes._

| # | Mejora | Descripción | Esfuerzo | Prioridad |
|---|---|---|---|---|
| M1 | Campo `fase` (1–8) en studios | Nuevo enum `fase` con valores 1–8 correspondientes al proceso Plan v5. Reemplaza o complementa el campo `status` como indicador de avance comercial | Bajo | 🔴 Alta |
| M2 | Mapa `status` ↔ `fase` para datos existentes | Script de migración que asigna `fase` basándose en `status` actual: nuevo→1, contactado→4, reunion→5, prescripcion→7, ganado→8 | Bajo | 🔴 Alta |
| M4 | Campo `normasExigidas` en studios | Multi-select: ETNT003 / ETNT015 / AENOR / UNE EN ISO 1452 / UNE EN 17176 / otro | Bajo | 🟡 Media |
| M5 | Campo `programaFinanciacion` en studios | Multi-select: PARRA / FEADER / NextGen / PERTE / Junta de Andalucía / ninguno | Bajo | 🟡 Media |
| M6 | Campo `evidenciaDocumental` en studios | URL o referencia al pliego/BOM donde aparece la especificación. Campo de texto libre + fecha | Bajo | 🟡 Media |
| M25 | Estructurar `data.projects[]` | Añadir campos por proyecto: nombre, programa financiación, presupuesto estimado, estado licitación, norma exigida, URL Perfil del Contratante | Medio | 🟡 Media |

---

## Bloque B — Mejoras en el modal de actividad (visita)

_Campos adicionales en el formulario de registro de actividades tipo `meeting`._

| # | Mejora | Descripción | Esfuerzo | Prioridad |
|---|---|---|---|---|
| M8 | Campo `contacto` en actividad | Select que carga el equipo del studio actual (`data.team[]`). Registra qué persona atendió la visita | Bajo | 🔴 Alta |
| M9 | Campo `cargo` en actividad (auto) | Se rellena automáticamente al seleccionar el contacto en M8 desde `data.team[].role` | Muy bajo | 🔴 Alta |
| M10 | Campo `faseEnVisita` en actividad | Select con las 8 fases del Plan v5. Registra la fase del proceso en el momento de la visita | Bajo | 🟡 Media |
| M11 | Campo `resultado` en actividad | Select estructurado: sin compromiso / con interés / solicita documentación / especifica en pliego | Bajo | 🟡 Media |
| M12 | Campo `proximaAccion` en actividad | Select: llamada / email / visita / envío docs / ponencia / soporte técnico + campo descripción | Bajo | 🟡 Media |
| M13 | Campo `evidenciaDocumental` en actividad | Enlace o toggle que vincula la actividad con un informe de `data.reports[]` del studio | Bajo | 🟡 Media |
| M14 | Geolocalización en actividad | Auto-relleno con coordenadas del studio al abrir el modal. Alternativa: usar `data.contact.address` | Bajo | 🟢 Normal |

---

## Bloque C — Nuevos tipos de actividad

_Ampliar el enum `type` en actividades para cubrir acciones no registrables actualmente._

| # | Mejora | Descripción | Esfuerzo | Prioridad |
|---|---|---|---|---|
| M17 | Tipo `ponencia` en actividades | Nuevo tipo para registrar ponencias en colegios profesionales. Campos adicionales: colegio, asistentes estimados, producto presentado | Bajo | 🟡 Media |
| M20 | Tipo `soporte_tecnico` en actividades | Nuevo tipo para registrar cálculos mecánicos, consultas técnicas, asistencia a ferias. Campo: empresa solicitante, tiempo dedicado | Bajo | 🔴 Alta |

---

## Bloque D — Mejoras en el dashboard y KPIs

_Nuevos indicadores en la pantalla principal del CRM._

| # | Mejora | Descripción | Esfuerzo | Prioridad |
|---|---|---|---|---|
| M15 | Contador "Visitas YTD / 140" | Cuenta actividades `type=meeting` del año en curso vs. objetivo 140. Barra de progreso | Bajo | 🔴 Alta |
| M16 | Contador "Visitas MUTE YTD / 30" | Cuenta actividades `type=meeting` con `productos contains "Mute"` del año vs. objetivo 30 | Bajo | 🔴 Alta |
| M18 | Contador "Ponencias YTD / 2" | Cuenta actividades `type=ponencia` del año vs. objetivo 2 | Bajo (requiere M17) | 🟡 Media |
| M19 | Toggle `catalogoMUTEentregado` + indicador | Campo booleano en configuración + indicador en dashboard (Pendiente / Entregado) | Bajo | 🟡 Media |
| M21 | Sección KPIs oficiales en dashboard | Panel nuevo con los 5 objetivos individuales del cuadro 2026, con % de avance en tiempo real | Medio | 🔴 Alta |
| M22 | Filtros rápidos "Visitas 2026" y "Visitas MUTE 2026" | Accesos directos en la lista de estudios o actividades | Bajo | 🟡 Media |
| M3 | Funnel por `fase` (no por `status`) | Actualizar `renderDashboardCharts()` para mostrar el embudo usando el campo `fase` (requiere M1) | Medio | 🔴 Alta |

---

## Bloque E — Mejoras en filtros

_Nuevos criterios de filtrado en la lista de estudios._

| # | Mejora | Descripción | Esfuerzo | Prioridad |
|---|---|---|---|---|
| M26 | Filtro por `programaFinanciacion` | Select en lista de studios (requiere M5) | Muy bajo | 🟡 Media |
| M26b | Filtro por `normasExigidas` | Select en lista de studios (requiere M4) | Muy bajo | 🟡 Media |
| M26c | Filtro por `fase` del proceso | Select 1–8 en lista de studios (requiere M1) | Muy bajo | 🔴 Alta |

---

## Bloque F — Módulo de tareas anuales

_Vista nueva para seguimiento de los objetivos y tareas de la sección 15 del Plan v5._

| # | Mejora | Descripción | Esfuerzo | Prioridad |
|---|---|---|---|---|
| M27 | Panel "Objetivos anuales" | Vista nueva con tabla: tarea / peso / plazo / estado / % de avance. Incluye las 3 tareas con peso oficial (catálogo 30%, soporte 30%, ponencias 5%) y las 5 tareas operativas | Medio | 🟡 Media |
| M30 | Alerta de tareas vencidas | Indicador en dashboard si una tarea operativa lleva >7 días sin actividad registrada | Bajo | 🟡 Media |

---

## Bloque G — Criterios de transición de fase

_Mejoras en la lógica de cambio de estado para alinear con el proceso Plan v5._

| # | Mejora | Descripción | Esfuerzo | Prioridad |
|---|---|---|---|---|
| M7 | Modal de confirmación en cambio de fase | Al cambiar `fase` (o `status`), mostrar los criterios de la siguiente fase y solicitar confirmación: "¿Tienes [criterio de paso]?" | Alto | 🟢 Normal |
| M7b | Alerta de estancamiento por fase | Si un studio lleva más de N días en la misma fase (configurable por tipo de empresa), mostrar alerta en dashboard | Medio | 🟢 Normal |

---

## Acciones en datos del CRM (no código)

_Acciones de limpieza y alta que deben ejecutarse independientemente de las mejoras técnicas._

| # | Prioridad | Acción | Detalle |
|---|---|---|---|
| D1 | 🔴 Inmediata | Enviar documentación técnica Tuyper a Aguas de Lucena (Jorge Hornero) | Tarea 15.3 Plan v5 — vencida |
| D2 | 🔴 Inmediata | Añadir José María Aumente León + Sergio García Alcubierre en EMACSA | Tarea 15.4 — vencida (1T 2026) |
| D3 | 🔴 Alta | Añadir contacto técnico en Moval Agroingeniería | Prescriptor máxima prioridad (FERAGUA) |
| D4 | 🟡 Alta | Añadir Alberto Ato Vega en CR Sector A Abarán como ★DM | PERTE en curso |
| D5 | 🟡 Alta | Completar contactos en NARVAL Ingeniería e INGENZ | En `reunion` sin nombre de contacto |
| D6 | 🟡 Media | Dar de alta JGV Ingeniería (Málaga) | Tipo `ingenieria`, provincia Málaga |
| D7 | 🟡 Media | Dar de alta 5 distribuidores (Escoda, Saltoki, Sanigrif, SOTEC, J. Gómez) | Tipo `almacen` |
| D8 | 🟡 Media | Añadir Antonio Gil + Fco. Javier Aguilar en EMPROACSA | Contactos técnicos redes e ingeniería |
| D9 | 🟢 Normal | Crear entrada dedicada Aqualia Baena (Córdoba) | Estrategia central 2T–3T 2026 |
| D10 | 🟢 Normal | Dar de alta 4 colegios profesionales (COA/COAAT/CICCP/COIA) | Tipo `otros` hasta crear `colegio_profesional` |
| D11 | 🟢 Normal | Consolidar duplicados CR Blanca (4 entradas) + añadir Juan Jesús Cano Rengel | — |
| D12 | 🟢 Normal | Corregir tipo CR Villafranca de Córdoba (`aguas` → `regantes`) | — |
| D13 | 🟢 Normal | Añadir Andrés del Campo García en CR Guadalmellato | Presidente, influencer nacional |
| D14 | 🟢 Normal | Dar de alta adjudicatarios PARRA cuando se identifiquen | Guaro-Axarquía y La Herradura |

---

## Hoja de ruta por sprints

### Sprint 1 — KPIs visibles en dashboard (impacto máximo, esfuerzo mínimo)

Cambios que no modifican el modelo de datos existente y dan visibilidad inmediata:

1. M15 — Contador visitas YTD / 140
2. M16 — Contador visitas MUTE YTD / 30
3. M21 — Panel KPIs oficiales en dashboard
4. M19 — Toggle catálogo MUTE + indicador
5. M20 + M17 — Tipos `soporte_tecnico` y `ponencia` en actividades + M18 contador ponencias

**Resultado esperado:** el dashboard pasa de 0/5 a 4/5 KPIs oficiales visibles.

---

### Sprint 2 — Modelo de datos ampliado

Cambios en el modelo que habilitan el resto de mejoras:

1. M1 — Campo `fase` (1–8) en studios
2. M2 — Script de migración `status` → `fase` para datos existentes
3. M4 — Campo `normasExigidas` en studios
4. M5 — Campo `programaFinanciacion` en studios
5. M3 — Funnel por `fase` en dashboard (requiere M1)
6. M26c — Filtro por `fase` en lista de studios

**Resultado esperado:** el embudo del dashboard refleja el proceso real del Plan v5.

---

### Sprint 3 — Modal de visita completo

Completar el registro de visitas para que las 140 sean auditables:

1. M8 + M9 — Contacto + cargo en modal de actividad
2. M10 — Fase en visita
3. M11 — Resultado estructurado
4. M12 — Próxima acción estructurada
5. M6 — Evidencia documental en studio
6. M13 — Enlace evidencia en actividad

**Resultado esperado:** las visitas pasan de 4/13 a ≥10/13 campos cubiertos.

---

### Sprint 4 — Pipeline y contexto

Mejoras que dan contexto regulatorio y de licitación:

1. M25 — Estructura proyectos por empresa
2. M26 + M26b — Filtros programa financiación y norma
3. M27 — Panel objetivos anuales (sección 15)
4. D1–D5 — Acciones urgentes de datos (D1 y D2 son inmediatas, pueden hacerse ya)

---

### Sprint 5 — Refinamiento (post-validación con dirección)

Mejoras que dependen de validación o tienen mayor esfuerzo:

1. M7 — Criterios de transición de fase (modal confirmación)
2. M7b — Alertas estancamiento por fase
3. M14 — Geolocalización en actividad
4. M30 — Alerta tareas vencidas
5. Tipo `colegio_profesional` si se valida con dirección

---

## Resumen cuantitativo

| Categoría | # mejoras | Esfuerzo total estimado |
|---|---|---|
| Modelo de datos (Bloque A) | 6 | Bajo–Medio |
| Modal de actividad (Bloque B) | 7 | Bajo |
| Tipos actividad (Bloque C) | 2 | Bajo |
| Dashboard y KPIs (Bloque D) | 7 | Bajo–Medio |
| Filtros (Bloque E) | 3 | Muy bajo |
| Tareas anuales (Bloque F) | 2 | Medio |
| Lógica de fase (Bloque G) | 2 | Alto |
| **Total mejoras técnicas** | **29** | — |
| Acciones de datos | 14 | Inmediato |

---

## Impacto esperado por sprint

| Sprint | KPIs visibles | Campos visita | Proceso |
|---|---|---|---|
| Estado actual | 0/5 | 4/13 (31%) | 1/8 fases correctas |
| Tras Sprint 1 | 4/5 | 4/13 | 1/8 |
| Tras Sprint 2 | 4/5 | 4/13 | 8/8 ✅ |
| Tras Sprint 3 | 5/5 | ≥10/13 | 8/8 |
| Tras Sprint 4 | 5/5 | ≥10/13 | 8/8 |
