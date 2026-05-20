# Búsqueda Córdoba — Ingenierías — 2026-05-19

Documento de la búsqueda masiva ejecutada sobre la cartera de Ferroplast/Tuyper para ampliación en provincia de Córdoba, tipo `ING` (Ingeniería). Generado para trazabilidad y como referencia para futuras búsquedas similares.

---

## 1. Consulta original

### Disparada desde el CRM (UI)

```
Vista:      Estudios → + Nuevo → Buscar por provincia
Provincia:  Córdoba
Tipo:       Ingeniería (código ING)
Fecha:      2026-05-19 16:31 UTC
Operador:   Manolo (sesión interactiva)
```

### Llamada equivalente en JavaScript

```javascript
searchStudiosInProvince('Córdoba', 'ING')
```

Función definida en [`index.html:12525`](../index.html). Variante masiva (la del modal `modal-bulk-progress`, no la antigua de la línea 9828).

### Entorno de ejecución

| Parámetro | Valor |
|---|---|
| URL del CRM | https://mafernandez-create.github.io/crm-prospector/ |
| Firestore | Proyecto `ferroplast-crm`, colección `studios` |
| Studios en cartera al inicio | 1567 |
| Brave Search API key | ✅ configurada en `localStorage.crm_brave_api_key` |
| Proxies CORS disponibles | allorigins.win (OK), corsproxy.io (403), codetabs (301), GAS proxy (OK pero lento) |
| Duración total de la búsqueda | **15 min 39 s** |
| Modelo IA (motor "IA Claude") | `claude-sonnet-4-20250514` — _eliminado tras esta búsqueda, ver §6_ |

---

## 2. Las 16 sub-búsquedas que se ejecutaron

La función `searchStudiosInProvince` lanza 16 pasos secuenciales. Cada uno alimenta el mapa `foundStudios` con resultados de distintas fuentes.

| # | Paso | Fuente principal | Termino de búsqueda |
|---|---|---|---|
| 1 | 🏛️ Consultando colegios profesionales | Colegio Ingenieros Caminos / Industriales de Córdoba | scraping directo de webs verificadas |
| 2 | 🔍 Búsqueda general de ingeniería | DDG + Brave | `"ingeniería" "ingenieros" "consultora ingeniería" "estudio ingeniería"` × Córdoba |
| 3 | 📒 Scraping directo Páginas Amarillas | paginasamarillas.es (vía proxy) | `/a/ingenierias/cordoba/`, `/a/estudio-de-ingenieria/cordoba/` |
| 4 | 📋 Consultando directorios empresariales | empresia.es, einforma.com, axesor.es, infobel.com | `site:* + "ingeniería" + Córdoba` |
| 5 | 💼 LinkedIn | linkedin.com/company | `site:linkedin.com "ingeniería" Córdoba` |
| 6 | 📰 Noticias locales | DDG + Brave | `estudio ingeniería Córdoba proyecto nuevo edificio 2024 2025` |
| 7 | 📸 Buscando en Instagram | instagram.com | `site:instagram.com ingeniería córdoba` |
| 8 | 📍 Consultando Google Maps | maps.google.com (via búsqueda) | `ingeniería Córdoba` |
| 9 | 🏆 Buscando estudios premiados | varias revistas técnicas | `"ingeniería" Córdoba premio OR concurso OR reconocimiento` |
| 10 | 🏢 Buscando adjudicaciones públicas | PLACSP, BOJA, BOP Córdoba | `adjudicación proyecto ingeniería Córdoba ayuntamiento diputación` |
| 11 | 🌆 Búsqueda en capital de provincia | DDG + Brave | `mejores estudios ingeniería Córdoba listado` |
| 12 | 🤖 Enriqueciendo con IA Claude | callClaudeAPI con prompt generador | _Ver §6 — bloque eliminado posteriormente_ |
| 13 | _no usado_ (numeración salta de 12 a 14 en el código) | — | — |
| 14 | 🌐 Enriquecimiento web | `deepAnalyzeWebsite()` sobre top 5 | scraping de las webs con `relevance > 80` |
| 15 | 🔄 Deduplicando contra Firestore | local | normalización por nombre, drop si ya existe en `studios` |
| 16 | ✨ Procesando resultados | local | conversión a `bulkSearchResults`, asignación `relevance` final |

---

## 3. Resultados crudos

### 3.1 Volumen total

- **150 candidatos** salieron del flujo (`bulkSearchResults.length === 150`).
- **9 detectados como duplicados** contra Firestore (nombre normalizado).
- **141 etiquetados como "nuevos"** en bruto.

### 3.2 Distribución por fuente

| Fuente | Nº de candidatos | % |
|---|---:|---:|
| Directorio empresarial (Empresia, Einforma, Infobel) | 37 | 24,7 % |
| Portal especializado (Habitissimo, Empresite) | 24 | 16,0 % |
| Búsqueda general (DDG/Brave) | 17 | 11,3 % |
| **IA (Claude) — generador alucinado** | 15 | 10,0 % |
| Colegio Profesional | 11 | 7,3 % |
| LinkedIn | 10 | 6,7 % |
| Noticias | 10 | 6,7 % |
| Proyecto público (PLACSP) | 10 | 6,7 % |
| Instagram | 9 | 6,0 % |
| Capital provincia | 9 | 6,0 % |
| Premio/Reconocimiento | 8 | 5,3 % |
| Google Maps | 7 | 4,7 % |
| Web (enriquecido Capa 3) | 1 | 0,7 % |

### 3.3 Distribución por `relevance`

| Bucket | Nº | % |
|---|---:|---:|
| ≥ 80 | 43 | 28,7 % |
| 65 – 79 | 76 | 50,7 % |
| 50 – 64 | 7 | 4,7 % |
| < 50 | 24 | 16,0 % |

### 3.4 Calidad real (auditada manualmente)

Tras filtrar por sufijo legal (SL/SLP) o palabra-clave (`ingenier`, `consultor`, `estudio`):

| Categoría | Nº |
|---|---:|
| Empresas con sufijo legal **y** datos coherentes | **61** |
| Duplicados detectados contra Firestore | 9 |
| Basura — títulos de páginas web extraídos como nombre | ~80 |
| Resultados de Argentina (Córdoba AR) que colaron como Córdoba ES | 4 |

#### Tipos de basura detectados

Ejemplos de "nombres" que el extractor capturó pero **no son empresas**:

```
"Las 7 mejores empresas de ingenieros en Córdoba"   ← título Habitissimo
"Inicio"                                            ← <title> de página
"Las 10 mejores empresas de construcción en Córdoba"
"Un estudiante de la Esc"                           ← snippet truncado
"Federación de Asociaciones de Ingenieros"          ← institución, no cliente
"La Real Academia de Ingeniería"                    ← institución
"Servicio de Contratación"                          ← organismo público
"Licitaciones de Diputación de Córdoba"             ← buscador de licitaciones
"Junta de Andalucía"                                ← organismo público
"Plataforma de Contratación Electrónica"            ← PLACSP
"Busc"                                              ← palabra truncada
"AccesoColegiados"                                  ← link de menú
"COIIM"                                             ← colegio profesional Madrid
"Inicio"                                            ← <title>
"Colegiación"                                       ← link de menú
"Forma parte del COIIM como ingeniero"              ← CTA de captación
"EMPLEO – Colegio de Ingenieros..."                 ← bolsa de empleo
"Grado en Ingeniería"                               ← carrera universitaria
"Notas de corte: Ingeniería Civil"                  ← contenido educativo
```

#### Resultados de Argentina (Córdoba AR ≠ Córdoba ES)

```
"COLEGIO DE INGENIEROS CIVILES DE LA PROVINCIA DE CORDOBA"  ← Argentina (CUIT)
"Soppe Ingenieria SRL"                                       ← Argentina
"Kappa Ingenieria, Córdova, AR"                              ← Argentina
"Facultad de Ingeniería" UCC                                 ← Universidad Católica Córdoba (AR)
```

---

## 4. Los 9 duplicados detectados (ya estaban en Firestore)

Studios cuyo nombre normalizado coincidía con uno ya existente en la colección `studios`:

| Nombre devuelto por la búsqueda | Comentario |
|---|---|
| C&P Consultores Ingeniería | — |
| Córdoba Ingeniería | — |
| Estudio Larsson | Ya en CRM como `ING` |
| ESTUDIO DE INGENIERIA INGITEP SL | San Sebastián de los Reyes (no Córdoba pero ya en CRM) |
| ESGA ESTUDIO ARQUITECTURA & INGENIERÍA SLP | Alcolea, Córdoba |
| Alprocor Ingenieria Córdoba | — |
| Estudio De Ingenieria Rafael Velasco Slp | — |
| Estudio 88 Arquitectura Y Urbanismo SL | — |
| ESTUDIO INGENIERIA VERRA | — |

**Adicionalmente** se detectaron 2 más por matching parcial al intentar dar de alta:

| Empresa candidato | ID existente en Firestore |
|---|---|
| Proasur Ingeniería Civil SLP | **3042** (curiosamente registrada como city `Armilla (Granada)` pero province `Córdoba`) |
| Ingeniería de la Construcción Cordobesa SL | **3045** (con sufijo "(ICC)" en el nombre) |

---

## 5. Los 12 leads del motor "IA (Claude)" — verificación

Los 15 resultados con `sources: ['IA (Claude)']` proceden del bloque [`index.html:12735-12780`](../index.html) (paso 12 — eliminado tras esta sesión). Se verificaron 12 vía WebSearch:

| # | Nombre devuelto por Claude | Veredicto | Comentario |
|---|---|---|---|
| 1 | Guadalquivir Ingeniería | ❌ Alucinación | No existe. Sólo aparece Confederación Hidrográfica |
| 2 | Tecnoambiente Ingeniería SL | ⚠️ Existe, fuera de Córdoba | Real, sede en Barcelona/Jerez/A Coruña, 80+ emp. |
| 3 | **Proinco Consulting SL** | ✅ **Real** | Proinco Ingeniería SLP existe en Córdoba (registro 2006, CNAE 7112) |
| 4 | Ingeniería Fernández Moreno | ❌ Alucinación | No existe. Sí hay VKM Ingenieros, Cordobesa de Proyectos |
| 5 | Andaluza de Proyectos e Ingeniería | ❌ Alucinación | No existe esa razón social |
| 6 | Grupo Ingeniería Mediterránea (Pozoblanco) | ❌ Alucinación | INGEMED real pero en Alicante. **Bonus**: descubierta "Estudio 3 Ingeniería" (real, Pozoblanco) |
| 7 | Córdoba Ingenieros Asociados | ❌ Alucinación | Confusión con ICC que ya estaba en top 20 |
| 8 | Initec Ingeniería | ❌ Alucinación | INITEC SAS es colombiana, INTECSA es Madrid |
| 9 | Ingeniería López Hermanos (Lucena) | ⚠️ Falso match | "López Lucena Hermanos SA" en Montilla, no es ingeniería |
| 10 | Ingeniería del Sur Andaluz (Montilla) | ❌ Alucinación | No existe |
| 11 | Ingeniería Martínez Cano (Puente Genil) | ❌ Alucinación | No existe |
| 12 | Ingeniería y Construcciones Cordobesas SL | 🔁 Duplicado | Es la misma "Ingeniería de la Construcción Cordobesa SL" del top 20 |

**Tasa de alucinación: 67 % (8/12)**. Sólo 1 lead real, 1 fuera de zona, 1 duplicado, 1 falso match, 8 inventadas.

### Patrón de alucinación detectado

Los nombres inventados siguen un patrón estadístico de "nombres plausibles de ingenierías españolas":

- **Plantilla geográfica**: "Andaluza de…", "del Sur Andaluz", "Mediterránea", "Guadalquivir"
- **Plantilla apellido + sufijo**: "Ingeniería López Hermanos", "Martínez Cano", "Fernández Moreno"
- **Plantilla "X Ingenieros Asociados"**

El modelo (claude-sonnet-4-20250514) está rellenando el patrón estadístico en vez de recuperar empresas reales, porque el prompt le pide cuota fija ("hasta 15 empresas adicionales") sin grounding ni verificación.

---

## 6. Decisión: eliminar el motor IA (Claude)

Tras la verificación se documenta:

- **Histórico medido**: 0 studios en Firestore (1585 al final de la sesión) tienen `data.source === "IA (Claude)"`. El motor lleva tiempo activo y **no ha aportado ningún cliente** real.
- **Coste oculto por búsqueda**: 1 llamada a Claude API, +30-45 s de espera, 15 cards de ruido en el modal de resultados.
- **Va contra la spec v1.1**:
  - §10.1 — orígenes legítimos: CRM, búsqueda web/LinkedIn, `referido_por`. LLM-generador no figura.
  - §4.2 — niveles de confianza requieren `fuente_url` verificable.
  - §7.4 — sólo `verificado` entra al scoring.
  - §17 — el sistema no inventa partida.

**Acción**: PR [#6](https://github.com/mafernandez-create/crm-prospector/pull/6) elimina el bloque [`index.html:12735-12780`](../index.html). Commit `534b914` en rama `claude/peaceful-saha-a79023`.

---

## 7. Altas en Firestore — las 18 ingenierías nuevas

Del top 20 sólido, 2 eran duplicados (Proasur ID 3042, ICC ID 3045). **18 altas exitosas, 0 errores**.

| ID | Empresa | Ciudad | Tel/Web verificada | CNAE / Notas |
|---:|---|---|---|---|
| 2636 | TECNOVA INGENIEROS CONSULTORES SA | Córdoba | C/ Duque Fernán Núñez 1 | Páginas Amarillas |
| 2637 | **AZABACHE INGENIERIA SLP** | Córdoba (El Granadal) | 957 255 978 | CNAE 7112, activa 2006 |
| 2638 | OFG ADQUISICIONES E INGENIERIA SL | Córdoba | empresia.es | CNAE 7112 |
| 2639 | ECOINTEGRAL INGENIERÍA SL | Córdoba | LinkedIn activo | Ofertan BIM MEP, pequeño-medio |
| 2640 | TECNOLOAVANCE INGENIERÍA | Córdoba (Tejares) | C/ García Lovera 3 | Páginas Amarillas |
| 2641 | INGELECOR SL (Ing. y Electromontajes Cordobeses) | Córdoba | — | Cuentas anuales 2009 |
| 2642 | KAIZEN Arquitectura & Ingeniería | Córdoba | LinkedIn corporativo | 2-10 empleados |
| 2643 | GIMENEZ SOLDEVILLA ASOCIADOS SLP | Córdoba | C/ Bodega 5, 14008 | CNAE 7112 |
| 2644 | ARING Ingeniería | Córdoba | aring.es | +25 años, ing+arq+consultoría |
| 2645 | Grupo Ingertec SL | Córdoba | — | Empresia |
| 2646 | Varda Consultoría e Ingeniería SL | Córdoba | — | — |
| 2647 | Estudio Córdoba Levante SL | Córdoba | — | — |
| 2648 | Datacon Ingeniería de Construcción SL | Córdoba | — | — |
| 2649 | **Ingeosur Estudios Geotécnicos SL** | Lucena | 656 196 301 + C/ Herrerías 5 | Geotécnia (Subbética) |
| 2650 | INGENIO Y LOGICA SL | Córdoba | — | CIF Cádiz, sede Córdoba (verificar) |
| 2651 | CIUDAD 2020 SL | Córdoba | — | CIF B14893705, especialidad sin confirmar |
| 2652 | Proinco Ingeniería SLP | Córdoba | einforma | Registro 2006, CNAE 7112 |
| 2653 | Estudio 3 Ingeniería y Topografía | Pozoblanco | e3ingenieria.com | 1987, electricidad + civil + agroalimentario |

**En negrita**: Grupo A — datos máximos verificados, llamar primero.

### Scoring v2 calculado tras alta

| Métrica | Valor |
|---|---|
| Procesados | 18 / 18 |
| Errores | 0 |
| Cuadrante asignado | 9 (no prioritario) para los 18 |
| Score Valor Directo (D) | 4 → AZABACHE, INGEOSUR — 3 → resto |
| Score Valor de Red (R) | 0 para los 18 |
| Candidatos a "cliente puente" | 0 |

**Por qué todos en cuadrante 9**: §7.4 de la spec exige `nivel_confianza: verificado` para entrar al scoring. Estos studios se acaban de dar de alta con `single_source`, sin facturación verificada, sin nº empleados, sin clientes conectados. Esperar a que el auto-qualify nocturno los enriquezca con Capa 3.

---

## 8. Enriquecimiento Capa 3 — fallido

Tras el alta se intentó scraping de las 7 URLs disponibles (paso 14 del flujo, vía `deepAnalyzeWebsite`). **7/7 fallaron por timeout 45 s**.

Diagnóstico: la cadena de proxies CORS está degradada hoy. `corsproxy.io` devuelve 403, `codetabs` 301. Solo `allorigins` + GAS responden, y muy lentos.

**Decisión**: dejar a `auto-qualify` (launchd) hacer el enriquecimiento noche a noche (§10.2 spec, pasada inicial 8-15 noches).

---

## 9. Lecciones aprendidas para futuras búsquedas

1. **El motor "IA Claude" generador es nocivo** — eliminado. No reintroducir sin grounding + verificación cruzada por WebSearch.
2. **El extractor regex captura `<title>` como nombres de empresa** ([`index.html:9885-9888`](../index.html)). 30 %+ del ruido viene de ahí. Pendiente patch para descartar.
3. **Falsos positivos de Argentina** colaron (4 de 150). Filtrar por dominio `.ar` o por presencia de "CUIT".
4. **El flujo masivo tarda 16 min** con todos los motores. Si se necesita rapidez, la opción `prospector-nuevos` (subagente) es 4× más rápida y produce listas comparables.
5. **`reanalyzeLote` / `deepAnalyzeWebsite` no son viables desde el navegador** mientras los proxies CORS estén degradados. Usar batch nocturno via launchd o esperar al endpoint server-side del Bloque 2.

---

## 10. Comandos de consola útiles para replicar

```javascript
// Lanzar la búsqueda
await searchStudiosInProvince('Córdoba', 'ING');

// Inspeccionar resultados crudos
console.table(bulkSearchResults.map(b => ({name: b.name, sources: b.sources?.join(','), relevance: b.relevance, web: b.url})));

// Exportar a JSON descargable
const blob = new Blob([JSON.stringify(bulkSearchResults, null, 2)], {type: 'application/json'});
const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(blob), download: 'busqueda-cordoba-ing.json'});
a.click();

// Listar studios de un rango de IDs
const all = await getAllStudios();
all.filter(s => parseInt(s.id) >= 2636 && parseInt(s.id) <= 2653)
   .forEach(s => console.log(s.id, s.name, s.priorityQuadrant, s.priorityDirectScore));

// Recalcular scoring v2 manualmente sobre un studio
const studio = (await getAllStudios()).find(s => parseInt(s.id) === 2637);
await updateStudio(studio.id, buildScoringV2Updates(studio, 'manual'));
```

---

*Informe generado el 2026-05-20 como parte del cierre de la sesión que documentó la búsqueda del 2026-05-19. Ver también: [`docs/metodo_unificado_busqueda_CRM_Prospector_v1.1.md`](metodo_unificado_busqueda_CRM_Prospector_v1.1.md).*
