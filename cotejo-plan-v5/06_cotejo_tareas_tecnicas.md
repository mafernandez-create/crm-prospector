# 06 · Cotejo de Tareas Técnicas Pendientes
_Generado: 2 mayo 2026 · Rama: feat/cotejo-plan-v5_
_Fuente Plan v5: Sección 15 [V] verificada_

---

## Leyenda

| Símbolo | Significado |
|---|---|
| ✅ | Tarea con seguimiento en CRM |
| ⚠️ | Seguimiento parcial o informal |
| ❌ | Sin ningún seguimiento en el CRM |

---

## Tareas del Plan v5 (Sección 15) — ordenadas por peso

| # | Tarea Plan v5 | Peso | Plazo | Estado seguimiento en CRM |
|---|---|---|---|---|
| 15.1 | **Catálogo técnico MUTE** — documento técnico-comercial completo para red Ferroplast y prescriptores externos | 30 % | Anual 2026 | ❌ Sin seguimiento. No existe campo de entregable, % de avance ni tarea asociada |
| 15.2 | **Soporte técnico Ferroplast + Tuyper** — cálculos mecánicos, consultas técnicas, asistencia a ferias | 30 % | Continuo 2026 | ❌ Sin seguimiento. No existe tipo `soporte_tecnico` en actividades ni contador |
| 15.3 | **Documentación técnica Aguas de Lucena** — envío paquete técnico Tuyper a Jorge Hornero | — | Inmediato | ⚠️ El contacto existe en CRM (Jorge Hornero ★DM en Aguas de Lucena). No hay tarea pendiente explícita |
| 15.4 | **Cierre homologación EMACSA Córdoba** — ETNT003 y ETNT015 con José María Aumente León y Sergio García Alcubierre | — | 1T 2026 | ⚠️ EMACSA está en CRM (status: contactado). Los contactos Aumente León y García Alcubierre NO están dados de alta (ver Tarea 2, acción #2) |
| 15.5 | **Identificación adjudicatarios PARRA** — Guaro-Axarquía (Málaga) y La Herradura (Granada) | — | 1T–2T 2026 | ❌ No existe entrada en CRM. Información marcada [I] pendiente |
| 15.6 | **Estrategia central Aqualia Baena** — homologación a través de FCC Aqualia, subsidiaria privada | — | 2T–3T 2026 | ⚠️ Existen entradas de FCC Aqualia / Aqualia Puente Genil en CRM pero no una entrada dedicada "Aqualia Baena" (ver Tarea 2, acción #9) |
| 15.7 | **Apertura Sevilla / EMASESA** — primer contacto técnico procurement y redes | — | 2T 2026 | ⚠️ EMASESA existe en CRM (status: nuevo). Sin contacto técnico de procurement (ver Tarea 2, sección 8.5) |
| 15.8 | **Ponencias colegios (2)** — 1 Ferroplast MUTE en COA/COAAT + 1 Tuyper PE100/Biopipe en CICCP/COIA | 5 % | 1S y 2S 2026 | ❌ Colegios no dados de alta en CRM. No hay tipo `ponencia` en actividades (ver Tarea 2, sección 8.6) |

---

## Análisis: ¿tiene el CRM una vista de tareas técnicas?

**❌ No existe vista de tareas técnicas.**

El CRM tiene tres aproximaciones al seguimiento de acciones pendientes, ninguna sirve para tareas anuales con peso:

| Herramienta CRM | Qué hace | Por qué no sirve para sección 15 |
|---|---|---|
| `followupDate` en actividades | Fecha de próxima acción por empresa | Es por empresa, no hay una vista transversal de todas las acciones pendientes |
| `b2bTimeline` | Secuencia de contacto por empresa (pasos) | Es una secuencia de contacto, no un seguimiento de entregables con % de avance |
| Planificador de visitas | Rutas de visitas presenciales | Es para visitas, no para tareas de documentación o soporte técnico |

**Lo que faltaría para cubrir la sección 15:**
- Vista de "Tareas anuales" con: nombre, peso, plazo, estado (pendiente / en curso / completado), % de avance
- Indicador global del % completado del bloque 60 % (catálogo MUTE + soporte técnico)
- Alerta cuando una tarea urgente lleva N días sin actualización

---

## Estado de urgencia de las tareas

Tomando la fecha de hoy (2 mayo 2026) como referencia:

| Tarea | Urgencia | Estado |
|---|---|---|
| 15.3 Documentación Aguas de Lucena | 🔴 Vencida — "Pendiente desde semanas previas" | ⚠️ Sin acción registrada en CRM |
| 15.4 Cierre homologación EMACSA | 🔴 Vencida — plazo 1T 2026 (ya terminó) | ⚠️ Sin los dos contactos clave en CRM |
| 15.5 Identificación adjudicatarios PARRA | 🟡 En plazo — 1T–2T 2026 | ❌ Sin entrada en CRM |
| 15.7 Apertura EMASESA | 🟡 En plazo — 2T 2026 | ⚠️ Sin contacto técnico |
| 15.6 Estrategia Aqualia Baena | 🟡 En plazo — 2T–3T 2026 | ⚠️ Sin entrada dedicada |
| 15.8 Ponencias (1ª) | 🟡 En plazo — 1S 2026 | ❌ Sin seguimiento |
| 15.1 Catálogo MUTE | 🟡 Continuo — anual | ❌ Sin seguimiento |
| 15.2 Soporte técnico | 🟡 Continuo | ❌ Sin seguimiento |

---

## Resumen de gaps

| Gap | Descripción | Impacto |
|---|---|---|
| G7-01 | Sin vista de tareas anuales con peso y plazo | 🔴 Alto — 60 % del cuadro individual no tiene seguimiento |
| G7-02 | Sin tipo `soporte_tecnico` en actividades | 🔴 Alto — soporte técnico = 30 % sin registrar |
| G7-03 | Sin campo/estado `catalogoMUTE` | 🔴 Alto — catálogo MUTE = 30 % sin seguimiento |
| G7-04 | Tareas 15.3 y 15.4 vencidas sin acción en CRM | 🔴 Urgente — directamente accionables |
| G7-05 | Sin tipo `ponencia` en actividades | 🟡 Medio — 5 % del cuadro individual |

---

## Propuestas de mejora (para Tarea 8)

| # | Cambio propuesto | Esfuerzo | Impacto |
|---|---|---|---|
| M27 | Crear panel de "Objetivos anuales" con tabla: tarea / peso / plazo / estado / % | Medio | G7-01, G7-03 |
| M28 | Añadir tipo `soporte_tecnico` en actividades + descripción breve | Bajo | G7-02 |
| M29 | Añadir tipo `ponencia` en actividades | Bajo | G7-05 |
| M30 | Alerta en dashboard si tareas 15.3 o 15.4 llevan >7 días sin actividad registrada | Bajo | G7-04 |

> **Acción inmediata fuera del CRM (no es mejora técnica):**
> - Tarea 15.3: enviar paquete técnico Tuyper a Jorge Hornero (Aguas de Lucena) — está vencida
> - Tarea 15.4: añadir a José María Aumente León y Sergio García Alcubierre en EMACSA — está vencida (1T 2026)
> Estas acciones están en el directorio (Tarea 2, acciones #1 y #2) con prioridad 🔴 Inmediata.
