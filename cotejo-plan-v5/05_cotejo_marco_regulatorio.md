# 05 · Cotejo del Marco Regulatorio y Financiación
_Generado: 2 mayo 2026 · Rama: feat/cotejo-plan-v5_
_Fuente Plan v5: Sección 14 [D] datos externos verificables_

---

## Leyenda

| Símbolo | Significado |
|---|---|
| ✅ | Dato/campo presente en CRM |
| ⚠️ | Presente de forma parcial o informal |
| ❌ | Ausente — no existe campo ni vista |

---

## Programas de financiación pública (Plan v5, Sección 14)

El Plan v5 identifica 4 programas de financiación que generan el pipeline de proyectos prescriptibles:

| Programa | Descripción Plan v5 | Relevancia territorial | Presente en CRM |
|---|---|---|---|
| **PARRA** (Andalucía) | 165 M€, 39 proyectos en 7 provincias. PE 100 obligatorio por normativa europea para aguas regeneradas | Bloque Málaga (Guaro-Axarquía), Bloque Granada (La Herradura) | ❌ No hay campo `programaFinanciacion` |
| **FEADER** | Financiación rural europea para modernización de regadíos en Comunidades de Regantes | C.R. Priego EDAR (Córdoba), zonas rurales Extremadura y CLM | ❌ Ídem |
| **NextGenerationEU + PERTE** | Digitalización del Ciclo del Agua — arrastra modernización integral en Murcia | C.R. Sector A Abarán, C.R. Blanca Vegas Altas Segura (Murcia) | ❌ Ídem |
| **Junta de Andalucía** | Presupuesto activo en infraestructura hidráulica. Fuentes: BOJA + Perfil del Contratante | Todo el bloque andaluz | ❌ Ídem |

**Resultado: ningún studio tiene asignado un programa de financiación.** Esta información existe, cuando la hay, solo en el campo `data.notes` (texto libre) o en informes IA adjuntos.

---

## Normas y certificaciones (Plan v5, Sección 14)

| Norma / Certificación | Producto | Relevancia Plan v5 | Presente en CRM |
|---|---|---|---|
| **ETNT003** | PE 100 presión (Tuyper) | Condición de homologación para operadores municipales (EMACSA, EMPROACSA, Aguas de Lucena) | ❌ No hay campo `normaExigida` |
| **ETNT015** | PVC no presión (Ferroplast) | Ídem ETNT003 para PVC | ❌ Ídem |
| AENOR (genérico) | Todos los productos | Argumento de prescripción transversal | ❌ Ídem |
| UNE EN ISO 1452 | PVC Presión | Riego y abastecimiento | ❌ Ídem |
| ISO 16422 / UNE EN 17176 | PVC-O Biopipe | Sectorización técnica | ❌ Ídem |
| UNE EN 1329 / UNE EN 1453 | PVC no presión Ferroplast | Saneamiento ECOSAN | ❌ Ídem |
| ACS | Todos en contacto con agua potable | Exigible en abastecimiento | ❌ Ídem |

**Resultado: ningún studio tiene registrada la norma que exige en sus pliegos.** Esta información es crítica para la fase 7 (Especificación) y para priorizar visitas, pero no existe como campo estructurado. Solo puede encontrarse en notas libres o informes IA.

---

## Fuentes de seguimiento de licitaciones (Plan v5, Sección 14)

| Fuente Plan v5 | Descripción | Integración en CRM |
|---|---|---|
| BOE (Boletín Oficial del Estado) | Licitaciones y adjudicaciones nacionales | ❌ No integrado |
| BOJA (Boletín Oficial Junta Andalucía) | Licitaciones y presupuestos andaluces | ❌ No integrado |
| Perfil del Contratante | Plataforma de cada operador (EMACSA, EMPROACSA...) | ❌ No integrado |
| RETEMA | Revista del sector de agua y medioambiente | ❌ No integrado |
| coresat.es | Seguimiento de adjudicaciones | ❌ No integrado |

**Resultado: el CRM no tiene integración con ninguna fuente de licitaciones.** El seguimiento se hace manualmente fuera del CRM. El campo `data.projects[]` permite almacenar referencias a proyectos detectados, pero sin estructura ni alertas.

---

## Campo `data.projects[]` — análisis

El único campo que toca el marco regulatorio es `data.projects[]` (array libre en el modelo de datos). Contiene proyectos detectados para cada studio, pero:

- Sin estructura fija (texto libre)
- Sin campo `programaFinanciacion`
- Sin campo `presupuesto`
- Sin campo `estadoLicitacion` (en convocatoria / adjudicado / en ejecución)
- Sin campo `normaExigidaEnPliego`
- Sin alertas por vencimiento de plazo

---

## Resumen de gaps

| Gap | Descripción | Impacto |
|---|---|---|
| G6-01 | Sin campo `programaFinanciacion` en studios | 🟡 Medio — no se puede filtrar pipeline por PARRA/FEADER |
| G6-02 | Sin campo `normaExigida` en studios | 🟡 Medio — fase 7 Especificación sin evidencia de qué norma se especificó |
| G6-03 | Sin campo `estadoLicitacion` en proyectos | 🟡 Medio — no se puede seguir si un proyecto está en convocatoria o adjudicado |
| G6-04 | Sin integración BOE/BOJA/Perfil Contratante | 🟢 Normal — requeriría integración externa |

---

## Propuestas de mejora (para Tarea 8)

| # | Cambio propuesto | Esfuerzo | Impacto |
|---|---|---|---|
| M23 | Añadir campo `programaFinanciacion` en detalle studio (multi-select: PARRA / FEADER / NextGen / PERTE / Junta) | Bajo | G6-01 |
| M24 | Añadir campo `normasExigidas` en detalle studio (multi-select: ETNT003 / ETNT015 / AENOR / otro) | Bajo | G6-02 |
| M25 | Estructurar `data.projects[]` con campos: nombre, programa, presupuesto, estado, norma, enlace | Medio | G6-01, G6-02, G6-03 |
| M26 | Añadir filtros en lista de studios: por programa de financiación y por norma exigida | Bajo (requiere M23/M24) | Facilita tracking PARRA/FEADER |
