# Búsqueda comparativa — Ingeniería + Almería

**Fecha**: 2026-05-21
**Solicitada por**: Manolo (Ferroplast/Tuyper)
**Propósito**: comparar el sistema implementado en el CRM Prospector contra otro sistema externo del usuario.

---

## 1. Consulta solicitada

> "Empresas de ingeniería en la provincia de Almería"

| Parámetro | Valor |
|---|---|
| Tipo de estudio | `ING` (Ingeniería) |
| Provincia | Almería |
| Nombre concreto | — (vacío → búsqueda masiva) |
| Filtros adicionales | ninguno |

---

## 2. Método de búsqueda utilizado

**Sistema A — CRM Prospector (este proyecto)**

Función `searchStudiosInProvince(province, studioType)` invocada desde el modal "Nuevo Análisis" → "Generar Análisis" con campo nombre vacío.

### Capas ejecutadas en orden (versión `e9441d9..412af50` de main, con Capa Sectorial §18.5 activa)

1. 🏛️ Consulta a Colegios Profesionales (COIIM, CICCP)
2. 📋 Directorios empresariales (Páginas Amarillas, Infobel, Empresia, Einforma)
3. 🏗️ Portales especializados del sector
4. 💼 Búsqueda en LinkedIn (perfiles de empresa)
5. 📸 Búsqueda en Instagram (presencia visual)
6. 🗺️ Google Maps (geolocalizadas)
7. 🏆 Premios y Reconocimientos
8. 📰 Noticias locales (proyectos 2024-2025)
9. 🏢 Adjudicaciones públicas
10. 🌍 **Capa Sectorial Geográfica §18.5** — 20 queries:
    - `"proyecto agua" "Almería"`, `"obras de agua" "Almería"`, `"modernización agua" "Almería"`, `"adjudicado" "agua" "Almería"`
    - mismas plantillas × 5 sectores: agua, regadío, saneamiento, hidráulica, obra civil
11. 🎓 **Capa Académica §18.5.4** — 4 queries Universidad de Almería + grupos de investigación, con filtro `evidencia <24 meses` (§18.5.7)
12. 🌆 Capital de provincia (búsqueda específica de la capital)
13. 🌐 Enriquecimiento web (visitas a top 5 webs para extraer emails/teléfonos/equipo)
14. ✨ Procesado y ordenado por relevancia

### Motor de búsqueda usado

- Primario: **DuckDuckGo** (sin coste, sin API key)
- Secundario (failover automático si DDG da ≤2 resultados): **Brave Search**
- Circuit breaker: 3 fallos consecutivos → bloqueo 5 min
- Métricas persistidas en `_meta/search_metrics` (Bloque 4 follow-up)

---

## 3. Tiempo

| Fase | Duración |
|---|---|
| Inicio (click "Generar Análisis") | t=0 |
| Fin (modal "Estudios Encontrados" visible) | t ≈ **10-11 min** |
| Duración por motor (snapshot post-búsqueda) | persistido en `_meta/search_metrics` |

> Nota: la búsqueda anterior (Sevilla/ING, mismo método) tardó ~7 min. La diferencia se debe a más queries con timeout en directorios y a la latencia del proxy CORS en el momento de la ejecución.

---

## 4. Resultados obtenidos

### Métrica global

| Indicador | Valor |
|---|---|
| **Total estudios detectados** | **181** |
| Nombres distintos identificados en el modal | 176 |
| Eventos `processSearchResults` totales | 41 |

### Breakdown por fuente (chips contados en UI del modal)

| Capa | Fuente | Chips |
|---|---|---|
| **Geográfica tradicional** | Páginas Amarillas (directo) | 58 |
| | Directorio empresarial | 24 |
| | Portal especializado | 20 |
| | Colegio Profesional | 15 |
| | LinkedIn | 10 |
| | Instagram | 10 |
| | Google Maps | 10 |
| | Noticias | 10 |
| | Capital provincia | 7 |
| | Premio/Reconocimiento | 5 |
| **Sectorial §18.5** 🌍 | Sectorial: adjudicado | 7 |
| | Sectorial: obras de regadío | 2 |
| | Sectorial: obras de saneamiento | 1 |
| | Sectorial: obras de obra civil | 1 |
| **Académica §18.5.4** 🎓 | Universidad/Académico | 1 |
| Enriquecimiento | Web (enriquecido) | 1 |

### Aportación neta de la Capa Sectorial+Académica

| Capa | Eventos ejecutados | Nuevos descubiertos |
|---|---|---|
| Sectorial (§18.5.1) | 20 queries (4 patrones × 5 sectores) | **11** |
| Académica (§18.5.4) | 4 queries (catedrático, ponente, grupo investigación, congreso) | **1** |
| **Total único vía §18.5** | 24 queries | **12 estudios no detectables sin esta capa** |

### Auto-clasificación heurística del output

| Categoría | Aprox. | Ejemplos |
|---|---|---|
| Páginas-índice / artículos SEO | ~14 | *"Las 9 mejores empresas de ingenieros en Almería Ciudad"*, *"Cuánto cuestan los servicios de ingenieros"*, *"Guía de servicios de ingeniería"* |
| Colegios/Escuelas/Asociaciones | ~8 | Colegio Oficial de Ingenieros, COIIM, CICCP, Escuela Superior de Ingeniería |
| **Empresas reales identificables** | ~150 | (ver listado abajo) |

### Top empresas reales detectadas (cabecera, los primeros 15)

> Para cruzar nombre-a-nombre con el sistema externo del usuario.

1. **Obras y Representaciones Técnicas Solagua**
2. **Solutio**
3. **PROINTEC INGENIEROS & ARQUITECTOS**
4. **ICC Ingeniería**
5. **Expertos Ingeniería**
6. **Aima Ingeniería**
7. **Solaen**
8. Maro Ingen… *(truncado en captura DOM)*
9. … (140+ más, lista completa accesible al hacer "Importar Seleccionados" en el modal del CRM)

### Ruido detectado por este sistema (a tener en cuenta al comparar)

- Entes públicos confundidos con empresas: Diputación Provincial de Almería, Sede Electrónica, Tablón de anuncios, Iniciativas Europeas, Licitaciones de Ayuntamiento de Almería
- Plataformas sociales como tarjetas: Twitter
- Siglas/acrónimos sin contexto: CICCP, COIIM
- Títulos genéricos SEO: "Estudio de ingeniería", "Empresa de Ingeniería", "Servicios de Ingeniería"

---

## 5. Acciones realizadas tras la búsqueda

- ❌ **NO se importaron** los 181 candidatos a Firestore (cartera intacta en 1585)
- ✅ Se persistieron las métricas multi-motor en `_meta/search_metrics`
- ✅ Modal cerrado con `Cancelar` para preservar este resultado como solo lectura

---

## 6. Cómo comparar con el sistema externo

Cuando el usuario pase los resultados del otro sistema (en cualquier formato), se podrá calcular:

| Indicador comparativo | Pregunta |
|---|---|
| **Cobertura** | ¿Cuántas empresas detecta cada sistema? |
| **Solapamiento** | ¿Cuántas empresas son comunes a ambos? |
| **Únicas A** | ¿Cuántas detecta solo el CRM? |
| **Únicas B** | ¿Cuántas detecta solo el otro sistema? |
| **Precisión** | ¿Cuál tiene menor ratio de páginas-índice / falsos positivos? |
| **Calidad de enriquecimiento** | ¿Cuál aporta más datos de contacto (web, email, teléfono, equipo)? |
| **Velocidad** | ¿Cuál tarda menos? |

---

## 7. Reproducibilidad

Para repetir esta búsqueda exactamente:

1. URL: <https://mafernandez-create.github.io/crm-prospector/>
2. Botón "Nuevo Análisis"
3. Tipo: ⚙️ Ingeniería
4. Provincia: Almería
5. Nombre: (vacío)
6. "Generar Análisis"

El cron de las 02:00 UTC y las búsquedas masivas comparten el mismo `searchStudiosInProvince`, así que el resultado debe ser reproducible salvo pequeñas variaciones en directorios externos.
