# 04 · Cotejo de KPIs Oficiales 2026
_Generado: 2 mayo 2026 · Rama: feat/cotejo-plan-v5_
_Fuente Plan v5: Sección 11 [V] verificada · Fuente datos: Objetivos_Manolo_2026_v1.pdf (Propuesta empresa V3)_

---

## Leyenda

| Símbolo | Significado |
|---|---|
| ✅ | KPI medible con datos actuales del CRM |
| ⚠️ | Medible de forma parcial o con trabajo manual |
| ❌ | No medible — datos o vista ausentes |

---

## KPIs oficiales Plan v5 (Sección 11)

### Bloque empresa — 15 % del cuadro de objetivos

| # | KPI | Meta | Peso | Estado CRM | Dónde existe / qué falta |
|---|---|---|---|---|---|
| E1 | Incremento ventas ECOSAN (kg vs 2025) | +5 % | 5 % | ❌ | No hay campo de kg vendidos en el CRM. Los kg provienen del ERP/sistema de ventas, no del CRM de prescripción |
| E2 | Incremento ventas BIOPIPE (kg vs 2025) | +5 % | 5 % | ❌ | Ídem E1 |
| E3 | Incremento ventas MUTE (kg vs 2025) | +5 % | 5 % | ❌ | Ídem E1 |

> Los tres KPIs del bloque empresa son indicadores de resultados de venta que pertenecen al ERP/sistema contable, no al CRM de prescripción. El CRM no registra kg ni importes. **No son medibles en este CRM y no deberían serlo.**

---

### Bloque individual — 85 % del cuadro de objetivos

| # | KPI | Meta 2026 | Peso | Estado CRM | Dónde existe / qué falta |
|---|---|---|---|---|---|
| I1 | Visitas presenciales totales | 140 | 10 % | ⚠️ | Calculable filtrando actividades `type=meeting`. No hay contador en el dashboard ni objetivo definido |
| I2 | Visitas de prescripción MUTE | 30 | 10 % | ⚠️ | Calculable filtrando actividades `type=meeting` AND `productos contains "Mute"`. No hay contador ni objetivo en dashboard |
| I3 | Ponencias en colegios profesionales | 2 | 5 % | ❌ | No hay tipo de actividad `ponencia` ni campo para registrar ponencias. No existe ningún indicador |
| I4 | Elaboración del catálogo técnico MUTE | Entrega (sí/no) | 30 % | ❌ | No existe en el CRM ningún campo, tarea o seguimiento del catálogo MUTE como entregable |
| I5 | Soporte técnico a red comercial | Continuo | 30 % | ❌ | No hay tipo de actividad `soporte_tecnico` ni ningún contador de solicitudes técnicas respondidas |

---

## Estado del dashboard actual

El dashboard del CRM muestra 5 contadores (líneas 6909–6913 de index.html) y 2 gráficos:

| Indicador actual | Descripción | Relación con Plan v5 |
|---|---|---|
| Total Empresas | `studios.length` | Sin relación directa |
| Ganados | `status === 'ganado'` | Sin relación con KPIs 2026 |
| En Reunión | `status === 'reunion'` | Proxy muy impreciso de visitas activas |
| Nuevos | `status === 'nuevo'` | Sin relación |
| Prioridad Alta | `priority === 'Alta'` | Sin relación |
| Funnel por status | 9 barras de estado | No equivale al proceso Plan v5 |
| Actividad semanal | Reuniones/Llamadas/Emails/Comercial — 4 semanas | Útil pero sin objetivo ni % de avance |

**Ninguno de los 5 KPIs oficiales 2026 tiene representación en el dashboard.**

---

## Análisis de calculabilidad

### I1 — Visitas presenciales (meta: 140)

Los datos **existen** en Firestore pero **no hay vista agregada**:

```javascript
// Cálculo posible — no implementado en dashboard
const visitasYTD = activities
  .filter(a => a.type === 'meeting' && new Date(a.createdAt).getFullYear() === 2026)
  .length;
const objetivo = 140;
const porcentaje = Math.round(visitasYTD / objetivo * 100);
```

Limitación: las actividades no tienen campo `año` explícito — hay que filtrar por `createdAt >= 2026-01-01`.

---

### I2 — Visitas MUTE (meta: 30)

Los datos **existen** pero la lógica no está en el dashboard:

```javascript
// Cálculo posible — no implementado en dashboard
const visitasMUTE = activities
  .filter(a => a.type === 'meeting' 
    && a.productos?.some(p => p.toLowerCase().includes('mute'))
    && new Date(a.createdAt).getFullYear() === 2026)
  .length;
```

La relación I2 ⊂ I1 (visitas MUTE computan dentro de las 140) está contemplada en el Plan v5 y es coherente con el modelo de datos.

---

### I3 — Ponencias (meta: 2)

**No hay datos ni tipo de actividad para ponencias.** Se necesita:
- Nuevo tipo de actividad: `ponencia`
- O una actividad de tipo `meeting` con campo booleano `esPonencia`
- Un contador en el dashboard

---

### I4 — Catálogo MUTE (meta: entrega)

El catálogo MUTE es un entregable documental (30 % del cuadro). El CRM no tiene ningún campo de seguimiento de entregables. Se necesita:
- Un módulo de tareas anuales (propuesto en Tarea 3, gap G3) o
- Un campo booleano en configuración (`catalogoMUTEentregado: boolean`)
- Un indicador de progreso en el dashboard

---

### I5 — Soporte técnico (meta: continuo)

El soporte técnico (cálculos mecánicos, consultas técnicas, asistencia a ferias) vale el 30 % del cuadro individual. El CRM no lo registra en absoluto. Se necesita:
- Nuevo tipo de actividad: `soporte_tecnico` (o ampliar `comercial`)
- Contador anual en dashboard
- No es necesario un objetivo numérico fijo (el Plan dice "continuo"), pero sí un indicador de actividad

---

## KPIs operativos complementarios (Sección 11.4 — estado [P])

Estos KPIs son propuesta del prescriptor, **pendientes de validación** por dirección. No son oficiales. Se listan para completitud.

| KPI [P] | Meta | Calculable con CRM actual | Trabajo necesario |
|---|---|---|---|
| Tasa de conversión visita → especificación | 30 % en cuentas A | ⚠️ Parcial | Contar reuniones vs. studios en `prescripcion`, filtrado por prioridad A |
| Pipeline proyectos especificados (ETNT003/015) | ≥ 25 | ❌ No | No hay campo `normaExigida` en studios |
| Ratio visita prescriptor / visita institucional | ≥ 70/30 | ⚠️ Parcial | Campo `visitaOrigen` existe en actividades (`prescriptor` / `comercial`) |
| Tiempo medio fase 4 → fase 5 | ≤ 21 días | ❌ No | No hay campo `fase`, no se puede calcular tiempo entre fases |

---

## Resumen ejecutivo

| Bloque | KPIs totales | ✅ Medibles | ⚠️ Parciales | ❌ No medibles |
|---|---|---|---|---|
| Empresa (15 %) | 3 | 0 | 0 | 3 (datos en ERP, no en CRM) |
| Individual (85 %) | 5 | 0 | 2 | 3 |
| Complementarios [P] | 4 | 0 | 2 | 2 |
| **TOTAL** | **12** | **0** | **4** | **8** |

**Ningún KPI oficial 2026 tiene representación en el dashboard del CRM.**

---

## Propuestas de mejora (para Tarea 8)

| # | Cambio propuesto | Esfuerzo | Impacto KPI |
|---|---|---|---|
| M15 | Añadir contador "Visitas YTD / 140" en dashboard | Bajo | I1 (10 %) |
| M16 | Añadir contador "Visitas MUTE YTD / 30" en dashboard | Bajo | I2 (10 %) |
| M17 | Añadir tipo de actividad `ponencia` | Bajo | I3 (5 %) |
| M18 | Añadir contador "Ponencias YTD / 2" en dashboard | Bajo | I3 (5 %) |
| M19 | Añadir campo/toggle `catalogoMUTEentregado` en configuración + indicador en dashboard | Bajo | I4 (30 %) |
| M20 | Añadir tipo de actividad `soporte_tecnico` y contador YTD | Bajo | I5 (30 %) |
| M21 | Sección de KPIs oficiales en dashboard (reemplaza o complementa stats actuales) | Medio | Todos |
| M22 | Filtro rápido en lista: "Visitas 2026", "Visitas MUTE 2026" | Bajo | I1, I2 |

> **Nota sobre el bloque empresa (E1–E3):** Estos KPIs no deben implementarse en el CRM de prescripción. Los datos de kg vendidos pertenecen al ERP. Lo que sí puede añadirse es un enlace o referencia externa para consultarlos, pero el cálculo no es responsabilidad de este CRM.
