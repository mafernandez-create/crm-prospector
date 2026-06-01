# 00 · Mapa del CRM Actual
_Generado: 30 abril 2026 · Rama: feat/cotejo-plan-v5_

---

## 1. Stack técnico

| Capa | Tecnología |
|---|---|
| Frontend | HTML5 + Vanilla JS (single file, ~27 500 líneas) |
| Estilos | CSS3 con variables personalizadas (dark theme) |
| Base de datos principal | Firebase Firestore (cloud) |
| Persistencia local | localStorage + IndexedDB (caché offline) |
| API proxy | Google Apps Script (GAS) — llama a Claude API y Google Calendar |
| IA | Claude Sonnet 4 / Haiku 4 vía GAS proxy |
| Mapas | Leaflet.js 1.9.4 + Leaflet Heat |
| Exportación | xlsx.js (Excel), docx.js (Word), PDF via print |
| PWA | Manifest inline, Service Worker, iconos iOS |
| CI/CD | GitHub Pages (auto-deploy en push a main) |
| Companion mobile | `chat.html` — asistente IA para iPhone |

---

## 2. Modelo de datos

### 2.1 Colección `studios` (entidad principal)

Cada documento es una empresa/organización prospectada.

| Campo | Tipo | Valores / Notas |
|---|---|---|
| `id` | integer | Autoincremental (máx+1) |
| `name` | string | Nombre completo |
| `shortName` | string | Abreviatura 3 letras |
| `type` | enum | Ver tabla de tipos |
| `status` | enum | Ver tabla de estados |
| `province` | string | Nombre de provincia |
| `city` | string | Ciudad |
| `priority` | enum | `Alta` / `Media` / `Baja` |
| `score` | number | 0–100, calculado por IA |
| `createdAt` | ISO8601 | — |
| `updatedAt` | ISO8601 | — |
| `data.contact.email` | string | — |
| `data.contact.phone` | string | — |
| `data.contact.web` | string | — |
| `data.contact.address` | string | — |
| `data.contact.city` | string | — |
| `data.team[]` | array | Personas clave (nombre, cargo, email, teléfono, isDecisionMaker) |
| `data.notes` | string | Observaciones libres |
| `data.projects[]` | array | Proyectos relevantes detectados |
| `data.reports[]` | array | Informes adjuntos (Word, IA, manual) |
| `data.social` | object | LinkedIn, Instagram, Twitter, Facebook |
| `data.sales` | object | Hook, beneficios, objeciones |
| `data.comms` | object | Templates email, guion llamada, mensaje LinkedIn |
| `b2bTimeline` | object | Secuencia de seguimiento B2B (pasos, estado actual) |
| `handoff` | object | Traspaso a comercial (nombre comercial, fecha, notas) |
| `relevance` | number | 0–100, importancia prescriptora |

**⚠️ Campo "fase del proceso comercial":** NO existe como campo explícito en el modelo. Se infiere del campo `status` + `b2bTimeline`. El Plan v5 exige 8 fases específicas que no coinciden con los estados actuales del CRM (ver Tarea 3).

**⚠️ Campo "productos discutidos en visita":** Existe en actividades tipo `meeting`, no en el registro de la empresa directamente.

**⚠️ Campos del Plan v5 que faltan en el modelo:**
- Fase del proceso (1–8)
- Programa de financiación (PARRA, FEADER, NextGen, PERTE)
- Norma exigida en pliego (ETNT003, ETNT015, UNE...)
- Evidencia documental (enlace/archivo al pliego o BOM)

### 2.2 Tipos de empresa (`type`)

| Código | Etiqueta | Relevancia Plan v5 |
|---|---|---|
| `arquitectura` | Arquitectura | Prescriptores directos |
| `ingenieria` | Ingeniería | Prescriptores directos (Moval, NARVAL, INGENZ, JGV) |
| `promotora` | Promotora | Indirecta |
| `constructora` | Constructora | Adjudicatarios PARRA |
| `aapp` | AAPP | EMACSA, EMPROACSA, Aguas de Lucena, EMASESA |
| `aguas` | Empresa de Aguas | Idem AAPP + Hidrogea, Aqualia |
| `regantes` | Comunidad de Regantes | Directorio 8.1 Plan v5 |
| `almacen` | Almacén | Distribuidores (8.3 Plan v5) |
| `otros` | Otros | Colegios profesionales (no hay tipo específico) |

**⚠️ No existe tipo `distribuidor`** — los distribuidores (Escoda, Saltoki, Sanigrif, SOTEC, J. Gómez) entran como `almacen` u `otros`. Tampoco existe tipo `colegio_profesional`.

### 2.3 Estados de estudio (`status`)

| Código | Descripción | Equivalente aproximado Plan v5 |
|---|---|---|
| `nuevo` | Sin contacto | Fase 1 (Identificación) |
| `contactado` | Primer contacto | Fase 4 (Primer contacto) |
| `reunion` | Reunión programada/realizada | Fase 5 (Visita técnica) |
| `negociacion` | En negociación | Fase 6–7 (Documentación / Especificación) |
| `traspasado` | Pasado a comercial | Post-Fase 7 |
| `prescripcion` | Especificación confirmada | Fase 7 (Especificación) |
| `ganado` | Venta cerrada | Fase 8 (Seguimiento obra) |
| `perdido` | Perdido | — |
| `standby` | Pausado | — |

**⚠️ Los estados actuales NO mapean 1:1 con las 8 fases del Plan v5.** Faltan fases 2 (Cualificación), 3 (Mapeo prescriptor), 6 (Documentación), 8 (Seguimiento obra) como estados diferenciados.

### 2.4 Actividades (subcolección de `studios`)

| Campo | Tipo | Valores |
|---|---|---|
| `id` | integer | timestamp |
| `type` | enum | `note` / `call` / `email` / `meeting` / `comercial` / `status` |
| `text` | string | Texto libre |
| `followupDate` | ISO8601 | Fecha próxima acción |
| `productos` | array | Lista de productos mencionados |
| `visitaOrigen` | enum | `prescriptor` / `comercial` |
| `visitaConjunta` | boolean | Visita con comercial |
| `comercialCall` | object | Detalles llamada comercial |
| `createdAt` | ISO8601 | — |

### 2.5 Colección `_meta`

| Documento | Contenido |
|---|---|
| `planificador` | Datos del planificador de visitas (schedule, pernoctas, lastModified) |
| `ping` | Heartbeat de sincronización |

### 2.6 localStorage (datos locales)

| Clave | Contenido |
|---|---|
| `crm_test_planificador` | Planificador de visitas (espejo local de `_meta/planificador`) |
| `ferroplast_test_gmail_settings` | Configuración Gmail |
| `ferroplast_test_calendar_settings` | Configuración Google Calendar |
| `crm_backup_*` | Backups automáticos |

---

## 3. Vistas y pantallas

| Vista | Función | Acceso |
|---|---|---|
| Dashboard | KPIs generales, gráfico funnel, actividades recientes | Nav lateral |
| Kanban | Tablero por estado (columnas: nuevo → ganado) | Nav lateral |
| Listado (tabla) | Tabla filtrable de todas las empresas | Nav lateral |
| Detalle de empresa | 10 pestañas: Info, B2B, Traspaso, Equipo, Informes, Redes, Ventas, Comunicaciones, Actividades, Emails | Click en empresa |
| Planificador de Visitas | Calendario de arrastrar y soltar, filtros por provincia/tipo, auto-planificación IA | Nav lateral |
| Mapa de Provincias | Mapa coroplético de España con calor de empresas | Dentro del planificador |
| Configuración | Gmail, Calendar, backup, restore | Nav lateral |

---

## 4. Sistema de filtros

**Filtros en lista de empresas:**
- Tipo de empresa (select)
- Estado (select)
- Prioridad (Alta / Media / Baja)
- Provincia (select)
- Ciudad (select dinámico, dependiente de provincia)
- Código postal
- Última actividad (sin actividad / con actividad reciente / etc.)
- Tiene informe (sí/no)
- Búsqueda global por nombre

**Filtros en Planificador:**
- Fecha inicio / fin
- Visitas por día (2–6)
- Comunidad autónoma (multi-select)
- Provincia (multi-select)
- Ciudad (multi-select)
- Tipo de empresa (multi-select)
- Estado

**⚠️ No hay filtros por:**
- Programa de financiación (PARRA, FEADER, NextGen)
- Norma de homologación (ETNT003, ETNT015)
- Fase del proceso (1–8)
- KPI asociado (catálogo MUTE, ponencia, etc.)

---

## 5. Dashboard / KPIs actuales

El dashboard muestra:
- Contador por estado (nuevos, contactados, reunión, ganados)
- Contador B2B activos, hoy, urgentes
- Gráfico funnel de conversión (Chart.js)
- Gráfico actividades semanales
- Desglose por tipo de actividad (reuniones, llamadas, emails)

**⚠️ No hay ningún indicador de los KPIs oficiales 2026:**
- Sin contador de visitas YTD vs objetivo 140
- Sin contador de visitas MUTE vs objetivo 30
- Sin contador de ponencias vs objetivo 2
- Sin seguimiento de catálogo MUTE (entregable)
- Sin % de soporte técnico
- Sin indicadores del bloque empresa (ECOSAN/BIOPIPE/MUTE en kg)

---

## 6. Integraciones activas

| Integración | Estado | Uso |
|---|---|---|
| Firebase Firestore | ✅ Activa | BD principal, sync bilateral |
| Google Apps Script (proxy) | ✅ Activo | Puente con Claude API, Calendar, Gmail |
| Claude API | ✅ Activa | Análisis IA, informes, planificación, chat |
| Google Calendar | ⚠️ Requiere OAuth manual | Crear eventos de visita |
| Gmail | ⚠️ Opcional / configuración manual | Leer emails del estudio |
| Google Sheets | ⚠️ Legado | Almacenamiento secundario (migrado a Firestore) |
| Leaflet Maps | ✅ Activa | Mapa de provincias, geocodificación |
| DuckDuckGo (via proxy) | ✅ Activa | Búsqueda externa de empresas |

---

## 7. Proceso comercial actual en el CRM

El CRM implementa un seguimiento B2B propio basado en:

1. **Estados** (`status`): nuevo → contactado → reunión → negociación → traspasado / prescripción / ganado
2. **b2bTimeline**: Secuencia de pasos configurable (llamada, email, LinkedIn, reunión) con días asignados y estado (pending/current/completed)
3. **Actividades**: Registro libre de cada interacción

**Lo que NO tiene vs Plan v5 (sección 9):**
- Las 8 fases del proceso no son valores de campo explícitos
- No hay criterio de paso de fase a fase
- No hay funnel por fase (solo por estado genérico)
- No hay alertas por vencimiento de criterio de fase
- No hay los 13 campos obligatorios por visita (faltan: sector, cargo, fase, evidencia documental, geolocalización)

---

## 8. Flujos principales

```
ALTA DE EMPRESA
  Importar Excel / búsqueda IA / manual
  → addStudio() → Firestore → loadStudios()

REGISTRO DE VISITA
  Abrir modal actividad → tipo=meeting → 
  campos (texto, productos, visita conjunta) → 
  saveActivity() → Firestore
  ⚠️ Faltan: cargo, fase, evidencia documental, geolocalización obligatoria

PLANIFICACIÓN
  Abrir Planificador → filtros (provincia, tipo) → 
  arrastrar empresa a día / autoPlanificar IA → 
  Firestore (_meta/planificador) + localStorage

INFORME IA
  Desde detalle empresa → pestaña Informes → 
  generarInformeIA() → Claude API → DOCX descargable

SYNC IPHONE
  index.html → savePlanificadorData() → Firestore
  iPhone (chat.html) → loadPlanificadorFromFirebase() → sync local
```

---

## 9. Tareas técnicas en el CRM

**No existe una vista dedicada a "tareas técnicas"** del tipo descrito en el Plan v5 sección 15. Las únicas aproximaciones son:
- Campo `followupDate` en actividades (recordatorio de próxima acción)
- Sistema B2B Timeline (secuencia estructurada, pero por empresa)
- Planificador de Visitas (orientado a rutas, no a entregables)

**Lo que falta:** Una vista de tareas/objetivos anuales con peso, plazo y estado de progreso (catálogo MUTE 30%, soporte técnico 30%, ponencias 5%, etc.).

---

## 10. Presencia en CRM de empresas del directorio Plan v5

_(Verificación rápida vía búsqueda en Firestore — análisis exhaustivo en Tarea 2)_

| Empresa Plan v5 | Tipo CRM esperado | Nota |
|---|---|---|
| C.R. Pantano del Guadalmellato | `regantes` | Por verificar en Tarea 2 |
| Moval Agroingeniería | `ingenieria` | Por verificar en Tarea 2 |
| Salvador Escoda | `almacen` | Por verificar en Tarea 2 |
| EMACSA | `aapp` o `aguas` | Por verificar en Tarea 2 |
| EMPROACSA | `aapp` o `aguas` | Por verificar en Tarea 2 |
| Aguas de Lucena | `aapp` o `aguas` | Por verificar en Tarea 2 |
| COA / COAAT / CICCP / COIA | `otros` | Sin tipo específico en CRM |

---

## Resumen de gaps principales (para Tareas 2–8)

| # | Gap | Impacto |
|---|---|---|
| G1 | Sin campo "fase del proceso" (1–8 Plan v5) | Alto — no hay funnel comercial real |
| G2 | Sin KPIs 2026 oficiales en dashboard | Alto — no se puede medir el año |
| G3 | Sin vista de tareas técnicas con peso y plazo | Alto — catálogo MUTE + soporte = 60% |
| G4 | Actividad/visita incompleta (faltan 5 de 13 campos) | Medio — auditoría de visitas inviable |
| G5 | Sin tipo `distribuidor` ni `colegio_profesional` | Bajo — se puede reclasificar |
| G6 | Sin filtros por programa de financiación ni norma | Medio — seguimiento PARRA/FEADER |
| G7 | Sin campo evidencia documental (pliego/BOM) | Medio — fase 7 Especificación |
| G8 | Directorio Plan v5 sección 8 — sin verificar en CRM | Alto — completar en Tarea 2 |
