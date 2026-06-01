# 03 · Cotejo de los 13 Campos por Visita
_Generado: 2 mayo 2026 · Rama: feat/cotejo-plan-v5_
_Fuente Plan v5: Sección 9 [V] verificada_

---

## Definición Plan v5

> «Cada visita registrada en CRM debe contener al menos 13 campos: **fecha, organización, sector, contacto, cargo, fase del proceso, productos discutidos, resultado, próxima acción, fecha próxima acción, observaciones, evidencia documental, geolocalización.**»
>
> — Plan v5 sección 9, estado [V] verificado

---

## Leyenda

| Símbolo | Significado |
|---|---|
| ✅ | Campo presente con cobertura completa |
| ⚠️ | Campo presente de forma parcial o indirecta |
| ❌ | Campo ausente — no existe en la actividad |

---

## Comparativa campo a campo

| # | Campo Plan v5 | Estado | Dónde existe en CRM | Descripción |
|---|---|---|---|---|
| 1 | Fecha | ✅ | `createdAt` en actividad | Se genera automáticamente al guardar. Presente en todas las actividades |
| 2 | Organización | ✅ | `studioId` en actividad | Cada actividad está vinculada al documento del studio correspondiente |
| 3 | Sector | ⚠️ | `type` en studio (no en actividad) | El sector está en el registro del studio (`arquitectura`, `regantes`, `ingenieria`…), pero **no se copia a la actividad**. La actividad no incluye el sector de forma explícita |
| 4 | Contacto | ❌ | — | No hay campo para registrar qué persona de la organización atendió la visita. La referencia al contacto solo aparece en texto libre |
| 5 | Cargo | ❌ | `data.team[].role` en studio | El cargo existe a nivel de miembro del equipo del studio, pero **no se registra en la actividad** el cargo del interlocutor de esa visita específica |
| 6 | Fase del proceso | ❌ | `status` en studio (no en actividad) | El estado de la empresa existe, pero no se registra en la actividad la fase en que se encontraba el proceso en el momento de la visita (ver Tarea 3) |
| 7 | Productos discutidos | ✅ | `productos[]` en actividad | Array de checkboxes para visitas tipo `meeting`. Cubre: MUTE, ECOSAN, Canalones, Presión PVC, Biorientado, Saneamiento PVC, Saneamiento PE, Presión PE, Drenaje, Saneamiento PVC compacto, Pozos |
| 8 | Resultado | ⚠️ | `text` en actividad (texto libre) | No hay campo estructurado de resultado. El resultado se escribe en la descripción de texto libre, sin categorización ni validación |
| 9 | Próxima acción | ⚠️ | `text` en actividad (texto libre) | Igual que el resultado, se escribe en texto libre. No hay campo separado tipo `nextAction` o categoría seleccionable |
| 10 | Fecha próxima acción | ✅ | `followupDate` en actividad | Campo `datetime-local` en el modal. Se guarda correctamente en Firestore. Es opcional (no obligatorio) |
| 11 | Observaciones | ✅ | `text` en actividad | El campo `text` (textarea) recoge observaciones. Sin embargo, como acumula también resultado y próxima acción sin separación, la información es difícil de extraer estructuradamente |
| 12 | Evidencia documental | ❌ | `data.reports[]` en studio | Los informes y documentos se adjuntan a nivel de studio (pestaña Informes), **no a la actividad**. No es posible vincular directamente un pliego o BOM a una visita específica |
| 13 | Geolocalización | ❌ | `data.contact.address` en studio | La dirección existe en el studio, pero no hay coordenadas GPS ni campo de ubicación en la actividad. No se registra dónde tuvo lugar físicamente la visita |

---

## Resumen por estado

| Estado | # de campos | Campos |
|---|---|---|
| ✅ Presente completo | 4 | Fecha, Organización, Productos discutidos, Fecha próxima acción |
| ⚠️ Presente parcial | 3 | Sector (en studio, no en actividad), Resultado (texto libre), Próxima acción (texto libre) |
| ❌ Ausente | 6 | Contacto, Cargo, Fase del proceso, Observaciones separadas*, Evidencia documental, Geolocalización |

_*Observaciones existe, pero comparte campo con Resultado y Próxima acción, lo que impide análisis estructurado._

**Campos presentes de los 13 requeridos: 4 completos + 3 parciales = 7 / 13 (54 %)**
**Campos ausentes: 6 / 13 (46 %)**

---

## Impacto en la auditoría de visitas

El Plan v5 exige que las 140 visitas anuales sean **auditables**: cada visita debe justificar si computa para el objetivo individual (10 % del cuadro de objetivos) y si las 30 visitas MUTE (10 %) están correctamente identificadas.

Con el modelo actual, la auditoría tiene las siguientes limitaciones:

| Pregunta de auditoría | ¿Respuesta posible? | Limitación |
|---|---|---|
| ¿Cuántas visitas presenciales hay registradas? | ✅ Sí | Filtrar actividades `type=meeting` |
| ¿Cuáles son visitas MUTE? | ✅ Sí | Filtrar por `productos[] contains "Mute"` |
| ¿Quién atendió la visita? | ⚠️ Parcial | Solo en texto libre, no estructurado |
| ¿En qué fase del proceso estaba el prescriptor? | ❌ No | La fase no se guarda en la actividad |
| ¿Qué resultado produjo la visita? | ⚠️ Parcial | Solo texto libre, no categorizable |
| ¿Qué documentación se entregó en esa visita? | ❌ No | Los informes son del studio, no de la visita |
| ¿Dónde tuvo lugar físicamente? | ❌ No | Sin geolocalización en actividad |

**Conclusión**: con el modelo actual es posible **contar** las visitas, pero **no auditarlas** según los criterios del Plan v5. La auditabilidad requerida por la sección 9 necesita añadir al menos los 6 campos ausentes.

---

## Propuestas de mejora (para Tarea 8)

| # | Campo a añadir | Tipo de input | Datos fuente |
|---|---|---|---|
| M8 | Contacto (persona que atendió) | Select — carga equipo del studio | `data.team[]` del studio actual |
| M9 | Cargo del contacto | Auto — se rellena al seleccionar contacto | `data.team[].role` |
| M10 | Fase del proceso en el momento de la visita | Select — 8 opciones Plan v5 | Campo `fase` (mejora M1 de Tarea 3) |
| M11 | Resultado de la visita | Select (sin compromiso / interés / solicita info / especifica) | Nuevo campo `resultado` |
| M12 | Próxima acción | Select + campo descripción | Nuevo campo `nextAction` |
| M13 | Evidencia documental | URL o toggle de informe vinculado | Enlazar con `data.reports[]` del studio |
| M14 | Geolocalización | Auto — coordenadas GPS o dirección del studio | `data.contact.address` del studio |

> **Nota sobre M14**: La geolocalización puede resolverse de forma ligera capturando las coordenadas del studio al abrir el modal de actividad (ya existen en Leaflet) o dejando la dirección del studio como valor por defecto. No requiere GPS en tiempo real.

---

## Campos adicionales del CRM no en el Plan v5

El CRM captura dos campos para visitas tipo `meeting` que el Plan v5 no menciona explícitamente pero que son valiosos:

| Campo CRM | Descripción | Valor estratégico |
|---|---|---|
| `visitaOrigen` (prescriptor / comercial) | Indica si la visita fue iniciativa del prescriptor o del comercial | Permite calcular el ratio prescriptor/institucional (KPI 11.4 [P]) |
| `visitaConjunta` (boolean) | Indica si fue una visita conjunta con un comercial | Permite medir la colaboración prescriptor-comercial |

Estos dos campos son coherentes con los KPIs operativos complementarios del Plan v5 sección 11.4 [P] (propuestos, pendientes de validación).
