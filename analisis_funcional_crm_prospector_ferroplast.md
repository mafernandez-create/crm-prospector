# Análisis funcional — CRM Prospector Ferroplast

> **Proyecto**: CRM Prospector Ferroplast
> **Identificador normalizado**: `crm_prospector_ferroplast`
> **Generado**: 2026-05-27
> **Repositorio**: https://github.com/mafernandez-create/crm-prospector
> **Foco del análisis**: funcionalidades relacionadas con preparación, ejecución y seguimiento de visitas comerciales

---

## 1. Identidad y propósito

- **Nombre**: CRM Prospector Ferroplast (internamente: "CRM GPF")
- **Una línea**: CRM B2B para que un prescriptor de fontanería industrial (tubería, saneamiento, presión) gestione su cartera de estudios de arquitectura e ingeniería en Andalucía, y prepare y registre visitas comerciales con apoyo de IA.
- **Usuario principal**: Manuel Fernández ("Manolo"), prescriptor de Ferroplast / Tuyper, zona sur España. Rol: visita estudios de arquitectura e ingeniería para que prescriban los productos GPF (BIOPIPE, ecoSAN, PE100, MUTE, EUME, CONDUSAN) en sus proyectos. El prescriptor no vende directamente: su objetivo es que el proyectista especifique la marca en el pliego técnico antes de que salga a concurso.
- **Estado actual**: Funcional en producción (GitHub Pages). Arquitectura dual: versión legacy (`index.html`, ~27.000 líneas, Firestore) y rediseño activo (`redesign/`, modular, Supabase). El rediseño es la versión en uso desde mayo 2026.

---

## 2. Mapa funcional general (alto nivel)

- [x] Gestión de cuentas / empresas cliente (`studios`)
- [x] Gestión de contactos / personas (dentro de cada studio: `data.team[]`)
- [x] Gestión de oportunidades / pipeline (campo `status`: nuevo → contactado → reunión → ganado; pipeline B2B con etapas en ficha)
- [x] Calendario / agenda de visitas (Planificador semanal con drag-and-drop)
- [x] Investigación pública del cliente (búsqueda web multi-fuente + enriquecimiento vía LLM)
- [x] Generación de briefings de visita (Claude Sonnet, metodología SPIN, markdown)
- [ ] Captura de notas durante la visita (texto libre sí; audio/formulario en tiempo real: no)
- [x] Análisis automático post-visita (Claude convierte notas libres a JSON estructurado)
- [x] Banco de preguntas / playbook de venta (sección SPIN en el briefing: ~12–15 preguntas por visita)
- [x] Matriz producto ↔ tipo de cliente (hardcoded en `CATALOGO_POR_TIPO` + `GPF_FIT_FAMILIES`)
- [x] Recomendación de materiales a llevar (sección del briefing: "Catálogo GPF prioritario")
- [x] Seguimiento de advance / etapas de venta (pipeline B2B en ficha + campo `status` + cuadrantes Q1–Q9)
- [x] Métricas comerciales / dashboards (Dashboard con KPIs, objetivos 2026, próxima visita, atrasados)
- [ ] Integración con email (no hay envío desde el CRM; hay plantillas de texto pero sin conexión SMTP)
- [ ] Integración con WhatsApp (no existe)
- [x] Integración con calendario (Google Calendar: exporta visitas del planificador como eventos)
- [x] Otros:
  - Mapa caliente (Leaflet.js, tres modos: cartera / actividad / score alto)
  - Importar / exportar cartera (Excel XLSX → studios)
  - Alertas PLACSP (licitaciones públicas ganadas por empresas de la cartera)
  - Referencias cruzadas (entidades mencionadas en apuntes de visita que podrían ser prospectos)
  - Detección de acciones pendientes en informes Word (motor AccionesEngine)
  - Bandeja del agente con cuadrantes Q1–Q9
  - Briefing narrativo (modo lectura en iPhone)
  - Cómo llegar (sheet inferior con dirección + botón apertura en mapas)

---

## 3. Investigación pública del cliente

¿El CRM investiga automáticamente al cliente antes de una visita?

- **¿Existe?**: Sí.
- **Cómo se dispara**:
  - **Automático** al crear una empresa nueva (`app.js` llama a `Data.enrichStudio(id)` en background tras el alta).
  - **Manual** desde la ficha del cliente: botón "🔍 Enrich" (`data-action="enrich"` en `detail.js`). **Nota**: el wire de este botón al método `enrichStudio` no está completamente implementado en el redesign actual.
  - **Implícito antes del briefing**: la generación del briefing siempre ejecuta `_gatherWebContext(studio)` antes de llamar a Claude, lo que supone una investigación fresca en cada generación.
- **Fuentes consultadas** (función `_gatherWebContext`, timeout global 35 s):
  1. **Web corporativa del cliente**: deep scan multi-página via dos proxies CORS en cascada (`corsproxy.io`, `api.codetabs.com`). Portada + subpáginas `/contacto`, `/contact`, `/sobre-nosotros`, `/quienes-somos`, `/equipo`, `/la-firma`, `/empresa` y otras 10 rutas habituales.
  2. **Jina.ai reader** (`r.jina.ai`): renderizado JavaScript de SPAs en servidor, devuelve markdown. Corre en paralelo con los proxies. Si detecta links de contacto en el markdown, los fetchea también via Jina.
  3. **DuckDuckGo Instant Answer API**: dos queries — general (`nombre + ciudad + provincia`) y específico de contacto (`"nombre" provincia teléfono email contacto`). Sin CORS.
  4. **Nominatim / OpenStreetMap**: dirección postal estructurada. Útil para entidades públicas (Ayuntamientos, Mancomunidades). Query primaria + fallback heurístico si el nombre contiene indicios de entidad pública.
  5. **Páginas Amarillas** (`paginasamarillas.es/search/[slug]/all-spain/`).
  6. **Búsquedas sectoriales DuckDuckGo** según tipo de empresa + provincia (`QUERIES_SECTORIALES`): para ING → SEIASA, Plan PARRA, PERTE; para CCRR → SEIASA, FERAGUA; para ARQ → COA, visados; para CICA → confederaciones, iAgua, RETEMA; para AAPP → PLACSP, presupuestos municipales.
  7. **PLACSP** (diario, GitHub Actions): cruce de adjudicaciones públicas por nombre normalizado. No es en tiempo real sino un resultado persistido en el studio.
- **Tecnología**: LLM (Claude) + web scraping sin API (proxies CORS, DuckDuckGo DDG, Jina) + extracción regex directa de emails/teléfonos/direcciones del HTML. Sin APIs de enriquecimiento de terceros (no Apollo, no ZoomInfo, no Empresite).
- **Modelo usado**: `claude-sonnet-4-20250514` (Anthropic). Llamada via GAS proxy (Google Apps Script como intermediario entre el browser y la API de Anthropic).
- **Salida**: resultado de `_gatherWebContext` se inyecta como bloque `## CONTEXTO WEB RECOPILADO` en el prompt del briefing. La función `enrichStudio` extrae adicionalmente emails/teléfonos/dirección con regex y los guarda directamente en `studio.data.contact` (solo rellena campos vacíos, no machaca datos existentes). El resultado del enriquecimiento se persiste en Supabase/Firestore.
- **Plantilla**: no hay un prompt separado para el enriquecimiento. El systemPrompt de `enrichStudio` pide extracción estructurada en JSON (`ciudad`, `provincia`, `tipo`, `descripcion`, `contacto`, `equipo`). El prompt del briefing tiene instrucciones explícitas de uso del contexto web: citar la fuente de cada cifra, distinguir `[VERIFICADO]` de `[ESTIMADO]`, no inventar datos.

---

## 4. Generación de briefings o documentos preparatorios

¿El CRM genera un documento operativo para preparar la visita?

- **¿Existe?**: Sí.
- **Formato de salida**: Markdown puro (`formato: 'markdown_v2'`). Se renderiza como HTML en el browser y se ofrece para exportar como `.md`, `.doc` (Word via HTML) o PDF (via `window.print()`).
- **Metodología subyacente**: **SPIN Selling** (Neil Rackham), explícitamente declarada en el systemPrompt: *"metodología SPIN de Neil Rackham aplicada a prescripción técnica B2B"*. El briefing incluye una sección "Sugerencia SPIN" con proporciones exactas hardcodeadas: 1–2 preguntas de Situación, 3–4 de Problema, 4–6 de Implicación, 2–3 de Need-payoff (≈ 12–15 preguntas totales). Las reglas duras del prompt especifican: *"Las preguntas de Situación se MINIMIZAN porque lo demás se investiga antes de la visita"*.
- **Personalización por perfil de cliente**: sí, en dos dimensiones:
  1. **Por tipo de empresa** (`type`): se inyecta `CATALOGO_POR_TIPO[type]`, que describe los productos GPF pertinentes para ese tipo (ING, CCRR, ARQ, OCV, CICA, AAPP) con argumentarios narrativos por producto.
  2. **Por contexto real del cliente**: el prompt recibe el histórico de actividades e informes, compromisos abiertos, cuadrante Q1–Q9, score, red de conexiones próximas (studios vecinos del mismo cuadrante, puentes, visitados), y el contexto web recién recopilado.
  El cargo del interlocutor no se personaliza automáticamente (el campo `data.team` sí existe pero no se usa aún para ajustar el tono del briefing por rol).
- **Estructura del briefing** (10 secciones en orden fijo):
  1. Resumen ejecutivo
  2. Contexto del cliente (+ "lo que NO se sabe")
  3. Histórico reciente
  4. Compromisos abiertos
  5. Señales de mercado relevantes (cifras + fuente + lectura para la visita)
  6. Red y conexiones
  7. Sugerencia SPIN (~12–15 preguntas escalonadas S/P/I/N)
  8. Catálogo GPF prioritario (máximo 3–4 productos)
  9. Cosas a evitar mencionar
  10. Objetivo de advance
- **Plantilla / prompt**: vive en `redesign/data.js`, función `generateBriefing()`. Inputs:
  - Studio completo (nombre, ciudad, provincia, tipo, score, cuadrante, contacto, equipo, descripción)
  - Últimas 5 interacciones (activities + reports combinados)
  - Compromisos abiertos pendientes (`actualizaciones_propuestas` con `decision === 'pending'`)
  - Red: hasta 5 studios del mismo cuadrante, hasta 5 clientes puente, hasta 5 visitados de la provincia
  - Catálogo narrativo por tipo (`CATALOGO_POR_TIPO`)
  - Fuentes sectoriales por tipo (`FUENTES_SECTORIALES`)
  - Contexto web fresco (resultado de `_gatherWebContext`)
  - Sistema: 16 reglas duras (`REGLAS_IMPLICITAS`) que incluyen: mezcla SPIN proporcional, separar verificado de estimado, advertir riesgo de continuation, tono consultor técnico, límite de 3–4 productos GPF, nunca revelar scoring ni cuadrante al cliente, objetivo advance obligatorio.
- **Uso del briefing**: lectura en pantalla (diseño responsivo, optimizado para iPhone y desktop), descarga `.md`, descarga `.doc` (Word con estilos GPF: Calibri, azul `#0a2d52`, logo en header), impresión/PDF via `window.print()` con clases `.print-only` con header/footer "FERROPLAST · TUYPER".

---

## 5. Matriz cliente ↔ producto / oferta

¿El CRM contiene conocimiento estructurado de qué oferta encaja con qué tipo de cliente?

- **¿Existe?**: Sí.
- **Forma**:
  1. `CATALOGO_POR_TIPO` en `redesign/data.js`: objeto con claves por tipo de empresa (ING, CCRR, ARQ, OCV, CICA, AAPP). Cada entrada es un texto narrativo que describe qué productos GPF aplican y por qué, pensado para inyectarse directamente en el prompt del briefing.
  2. `GPF_FIT_FAMILIES` en `gas-batch-qualify.gs`: cinco familias de keywords para calcular el fit de scoring D5: `evacuacion_mute` (MUTE, EUME, evacuación), `red_saneamiento` (ecoSAN, PVC, saneamiento), `riego_biopipe` (BIOPIPE, regadío, presión, impulsión), `abastecimiento` (abastecimiento, agua potable, PE100), `pe_presion_gas` (gas natural, PE, distribución). El número de familias activas determina el componente D5 del score.
  3. `FUENTES_SECTORIALES` en `data.js`: lista de medios sectoriales por tipo de empresa (iAgua, AguasResiduales, RETEMA, FERAGUA, SEIASA…) inyectados en el prompt de briefing como contexto de dónde buscar noticias relevantes.
- **Granularidad**: por tipo de empresa (6 tipos). No hay granularidad por cargo, tamaño o región.
- **Cómo se mantiene**: hardcoded en el código fuente (`data.js`, `gas-batch-qualify.gs`). No es editable por el usuario final desde la UI; requiere modificar el código y hacer deploy.

---

## 6. Workflow del usuario

Describe paso a paso lo que hace el usuario cuando va a visitar a un cliente:

**Antes de la visita:**
1. [CRM] Busca la empresa en el listado de studios (filtros por provincia, tipo, cuadrante, ciudad, CP, estado). ✅ CRM aporta valor.
2. [CRM] Abre la ficha del cliente → revisa contacto, equipo, histórico de actividades, informes anteriores, score y cuadrante. ✅ CRM aporta valor.
3. [CRM] Genera el briefing: botón "+ IA" en la ficha → Claude scrapea la web del cliente y fuentes sectoriales → genera markdown con 10 secciones incluyendo preguntas SPIN y productos recomendados. ✅ CRM aporta valor real.
4. [CRM] Lee el briefing en pantalla (desktop o iPhone). Puede imprimirlo o descargarlo como Word/Markdown. ✅ CRM aporta valor.
5. [CRM] Añade la visita al planificador semanal (botón `+` en la columna del día, búsqueda difusa de la empresa, hora, notas). ✅ CRM aporta valor.
6. [CRM] Exporta el evento a Google Calendar con `subirCalendario()` (descripción rica con contacto, link al CRM, reminders). ✅ CRM aporta valor.
7. [CRM / Cabeza] Prepara materiales físicos (BC3, fichas técnicas, DAPs): el CRM recomienda qué llevar en el briefing, pero la preparación material ocurre fuera del CRM. ⚠️ Depende del usuario.

**Durante la visita:**
8. [CRM — parcial] Puede abrir la ficha del cliente o el briefing en el iPhone para consultar datos de contacto o el guión SPIN. ⚠️ Solo lectura; no hay modo "visita activa" ni captura en tiempo real.
9. [CRM / Otras herramientas] El usuario toma notas con el medio que prefiera (libreta, notas del móvil, grabadora). ⚠️ No hay captura nativa en el CRM. El analizador de grabaciones que mencionas es externo al CRM.

**Después de la visita:**
10. [CRM] Abre la pantalla "Informe de visita" → escribe las notas de memoria en texto libre → Claude genera informe estructurado en JSON (interlocutores, temas, compromisos, oportunidades, próxima acción, nivel de interés). ✅ CRM aporta valor.
11. [CRM] El informe queda guardado en el historial del studio y aparece en la bandeja con badge "✍️ IA". ✅ CRM aporta valor.
12. [CRM] La bandeja del agente detecta automáticamente: compromisos de seguimiento (motor AccionesEngine sobre informes Word), cuentas enfriándose, alto potencial sin visitar, referencias cruzadas de terceros mencionados en los apuntes. ✅ CRM aporta valor diferencial.
13. [CRM] Opcional: `subirVisitasSheet()` exporta las visitas del día al Google Sheet del jefe (columna H del calendario compartido). ✅ CRM aporta valor.

**Dependencias externas no cubiertas:**
- Grabación y análisis post-visita (la app que generó el `.md` que compartiste).
- Preparación material (BC3, fichas técnicas): mencionados en el briefing pero sin generación ni descarga desde el CRM.
- Comunicación post-visita (email de seguimiento): no hay redacción ni envío desde el CRM.

---

## 7. Captura post-visita

¿Cómo registra el CRM lo que pasó en la visita?

- **Tipos de entrada admitidos**: texto libre (textarea) + metadatos estructurados (fecha, comercial, modalidad, checkbox prescripción). No hay formulario con campos granulares (no hay "¿qué productos mencionaste?", "¿cuál fue la objeción?").
- **Transcripción de audio**: No existe. No hay ningún componente de audio, grabación ni integración con Whisper en el redesign. Búsqueda `grep -rn "whisper|transcri|audio|recording"` en `redesign/` no retorna resultados.
- **Análisis automático del contenido capturado**: Sí, via Claude (`Data.generateReport`). El modelo recibe las notas libres + datos del studio y devuelve:
  ```json
  {
    "resumen": "1-2 párrafos narrativos",
    "interlocutores": ["Nombre — cargo"],
    "temas_tratados": ["..."],
    "compromisos": [{ "que": "", "quien": "", "cuando": "" }],
    "oportunidades_detectadas": ["..."],
    "proxima_accion": "...",
    "nivel_interes": "alto|medio|bajo",
    "notas_adicionales": "..."
  }
  ```
- **Vínculo con el briefing previo**: No existe. El informe post-visita no sabe que hubo un briefing previo, no compara lo planificado con lo ocurrido, no detecta si las preguntas SPIN sugeridas se hicieron o no. Este es un gap funcional significativo.

---

## 8. Modelo de datos relevante

| Entidad | Campos clave | Relaciones | Notas |
|---|---|---|---|
| `studio` | `id` (string numérico), `name`, `type` (ARQ/ING/CCRR/OCV/CICA/AAPP), `city`, `province`, `score` (1–10), `priority` (alta/media/baja), `status` (nuevo/contactado/reunion/ganado), `priorityQuadrant` (1–9), `priorityQuadrantName`, `priorityDirect`/`Score`, `priorityNetwork`/`Score`, `es_cliente_puente`, `fuente_descubrimiento`, `tieneAlertaPlacsp` | Tiene `data.activities[]`, `data.reports[]`, `data.team[]`, `data.projects[]`, `data.contact` | Entidad central del CRM. Supabase: tabla `studios`. |
| `data.contact` | `address`, `phone`, `email`, `web` | Dentro de `studio.data` | Rellenado manual o via `enrichStudio` |
| `data.team[]` | `name`, `role`, `phone`, `email`, `linkedin`, `isDecisionMaker`, `notes` | Dentro de `studio.data` | Contactos individuales. Campo `isDecisionMaker` se usa en scoring D6. |
| `data.activities[]` | `id`, `type` (llamada/email/reunion/nota/registro_visita), `text`, `createdAt`, `followupDate`, `registroVisita.actualizaciones_propuestas[]` | Dentro de `studio.data` | Las últimas 5 se inyectan en el briefing. Los `actualizaciones_propuestas` con `decision: 'pending'` son "compromisos abiertos" del briefing. |
| `data.reports[]` | `title`, `date`, `aiGenerated`, `notes` (texto bruto), `report` (JSON estructurado IA), `modalidad`, `comercial`, `prescripcion`, `nivel_interes`, `generated_at` | Dentro de `studio.data` | Los informes generados por IA tienen el JSON completo. Los manuales solo tienen `notes`. |
| `briefings` (colección) | `fecha_visita`, `generated_at`, `markdown`, `formato` (`markdown_v2`), `studio_snapshot` | `briefings/{studioId}/items/{isoDate}` | Colección separada para no inflar el objeto studio. |
| `planificador` (`_meta`) | `schedule: { "YYYY-MM-DD": [{ id, name, city, province, data: { hora, notas } }] }` | Un único documento `_meta/planificador` | Todo el calendario semanal en un solo JSON. Riesgo de colisión si la cartera crece mucho. |
| `placsp_adjudicaciones` | `adjudicacion_id`, `fecha`, `titulo`, `organismo`, `importe`, `lugar`, `cpv[]`, `url`, `studio_id`, `studio_name` | Supabase: tabla `placsp_adjudicaciones` | Historial de adjudicaciones cruzadas con cartera. |

---

## 9. Uso de IA / LLM

| Punto del flujo | Proveedor / modelo | Tool / API usada | Coste estimado por uso |
|---|---|---|---|
| Generación de briefing pre-visita | Anthropic / `claude-sonnet-4-20250514` | API Anthropic via GAS proxy (`claudeProxy`) | ~0,10–0,20 € (8.192 tokens output + input variable ~3.000–5.000 tokens) |
| Investigación web antes del briefing (`_gatherWebContext`) | Sin LLM en esta fase — solo scraping | corsproxy.io, Jina.ai, DuckDuckGo DDG, Nominatim, PaginasAmarillas | ~0,00 € (APIs públicas gratuitas) |
| Enriquecimiento de empresa nueva (`enrichStudio`) | Anthropic / `claude-sonnet-4-20250514` | API Anthropic via GAS proxy | ~0,03–0,05 € (1.500 tokens output) |
| Generación de informe post-visita (`generateReport`) | Anthropic / `claude-sonnet-4-20250514` | API Anthropic via GAS proxy | ~0,02–0,05 € (4.096 tokens output) |
| Scoring / clasificación nocturno | Sin LLM — lógica determinista | GitHub Actions Node.js + Supabase REST | ~0,00 € |
| Cruce PLACSP diario | Sin LLM — matching por nombre normalizado | GitHub Actions Node.js + feed ATOM PLACSP | ~0,00 € |

**Arquitectura de la llamada a Claude**: el browser no llama directamente a la API de Anthropic. La llamada pasa por un Google Apps Script web app desplegado en GCP (`BATCH_ENDPOINT`) que actúa como proxy. Esta arquitectura evita exponer la API key en el frontend, pero crea un punto único de fallo (si el GAS web app está caído o tarda, el briefing falla).

---

## 10. Formato y persistencia de los outputs

- **Briefings**: Firestore `briefings/{studioId}/items/{isoDate}` (campo `markdown`: string) + Supabase tabla `briefings` (campo `data` JSONB). Versionado parcial: se guarda una entrada por fecha, por lo que relanzar el briefing el mismo día sobreescribe.
- **Dossiers de investigación web**: no se persisten independientemente. El resultado de `_gatherWebContext` solo vive en memoria durante la generación del briefing. Si se quiere consultar el contexto web, hay que relanzar el briefing.
- **Notas de visita (borrador)**: `localStorage` clave `redesign:informe:draft:{studioId}`, debounce 400 ms. TTL informativo 30 días. Se pierde al limpiar caché o cambiar de dispositivo.
- **Informes post-visita**: dentro de `studio.data.reports[]` (Supabase/Firestore). No colección separada.
- **¿Versionado?**: Parcial. Briefings: una versión por fecha (sobreescribible). Informes: pueden coexistir múltiples por fecha. No hay historial de versiones ni diff.
- **¿Exportables a markdown/PDF?**: Briefings: sí (`.md`, `.doc`, `print-to-PDF`). Informes post-visita: no (solo visualización en UI, no hay export).

---

## 11. Integraciones externas

| Sistema | Para qué | Dirección |
|---|---|---|
| **Supabase** (PostgreSQL) | Base de datos principal (studios, briefings, planificador, PLACSP) | Entrada y salida |
| **Firestore** (Firebase) | Base de datos legacy (todavía en uso como fallback; vacío tras migración mayo 2026) | Entrada y salida |
| **Google Apps Script** (proxy) | Intermediario entre browser y API Anthropic (briefing, informe, enrich) | Salida (browser → GAS → Anthropic → browser) |
| **Anthropic API** (Claude Sonnet) | Generación de briefing, informe post-visita, enriquecimiento | Salida (via GAS) |
| **Google Calendar API** | Exportar visitas del planificador como eventos con reminder | Salida |
| **Google Sheets API** | Escribir resumen de visitas en el calendario compartido con el jefe | Salida |
| **GitHub Actions** | Ejecución nocturna del batch de scoring (02:45 UTC), PLACSP crosscheck (03:00 UTC), tests diarios (05:00 UTC), backup semanal Supabase (domingos 04:00 UTC) | Salida (cron) |
| **corsproxy.io / api.codetabs.com** | Proxy CORS para scraping de la web del cliente | Entrada (web cliente → CRM) |
| **Jina.ai reader** | Renderizado JavaScript de webs del cliente para scraping | Entrada |
| **DuckDuckGo DDG** | Búsquedas generales y sectoriales sin API key | Entrada |
| **Nominatim / OpenStreetMap** | Geocodificación y dirección postal estructurada | Entrada |
| **Páginas Amarillas** | Datos de contacto adicionales del cliente | Entrada |
| **PLACSP / contrataciondelestado.es** | Feed ATOM de adjudicaciones públicas para cruce con cartera | Entrada (GitHub Actions) |
| **Leaflet.js** | Mapa caliente de la cartera | Visualización |
| **XLSX.js** | Importación de Excel para alta masiva de studios | Entrada |
| **docx.js** | Generación de documentos Word (informes pre-visita legacy) | Salida |

---

## 12. Lo que el CRM ya hace mejor que una herramienta de briefing aislada

- **Contexto acumulado**: el briefing no parte de cero. Incorpora el historial completo de visitas anteriores, compromisos abiertos de la última reunión y el cuadrante Q1–Q9 del cliente. Una herramienta de briefing aislada no tiene ese historial.
- **Red de conexiones**: el briefing inyecta qué otros studios de la misma provincia han sido visitados, quiénes son "clientes puente" y qué cuadrante ocupan. Permite al prescriptor contextualizar la visita en su red territorial, no como un contacto aislado.
- **Scoring propio y contexto territorial**: el CRM tiene un modelo de scoring de dos ejes (valor directo × valor de red) que da contexto estratégico al briefing ("esto es un Q1, cuenta clave" vs "esto es un Q9, solo si estás en ruta"). Una herramienta externa no tiene esa clasificación.
- **Alertas PLACSP**: si la empresa visitada acaba de ganar un contrato público, el CRM lo detecta automáticamente la noche anterior y lo muestra en el Dashboard y la Bandeja. Ninguna herramienta de briefing aislada tiene eso.
- **Matriz producto-cliente propia del negocio**: el catálogo GPF (BIOPIPE, ecoSAN, PE100, MUTE, EUME, CONDUSAN) con argumentarios por tipo de cliente (ING, ARQ, CCRR…) está hardcoded en el CRM. El briefing siempre recomienda productos pertinentes y nunca irrelevantes (no aparece MUTE en un proyecto de riego, no aparece BIOPIPE en arquitectura de interiores).
- **Continuidad entre visitas**: el informe post-visita queda vinculado a la misma ficha que el briefing, el planificador y el histórico. No hay silos. Cuando vuelves a generar el briefing tres meses después, ya incorpora lo que pasó en la visita anterior.
- **Workflow completo en un solo entorno**: desde el planificador (qué visitar esta semana) → briefing (cómo preparar esa visita) → Google Calendar (recordatorio) → informe (qué pasó) → bandeja (qué hacer ahora) → Google Sheet del jefe (reporte). Una herramienta de briefing aislada cubre solo uno de estos pasos.

---

## 13. Lo que el CRM NO hace, o hace peor de lo que debería, en el contexto de preparación de visita

- **No hay análisis de la grabación / transcripción de la visita**: el análisis post-visita se basa en notas escritas de memoria. Toda la inteligencia que puede extraerse de la grabación (ratio de escucha, tipo de preguntas SPIN usadas, señales lingüísticas del cliente, momentos de engagement) queda fuera del CRM. El `.md` que genera tu app de análisis es mucho más rico que lo que el CRM puede generar desde notas libres.
- **No hay comparación briefing ↔ informe**: el briefing sugiere preguntas SPIN para la visita y el informe registra lo que ocurrió, pero el sistema no contrasta si las preguntas se hicieron, si el advance objetivo se alcanzó, ni si los productos recomendados se mencionaron. El gap entre "lo planificado" y "lo ejecutado" no se cierra automáticamente.
- **El informe post-visita no tiene estructura de venta**: el textarea de notas libres es correcto para captura rápida, pero el JSON resultante (interlocutores, temas, compromisos) no captura calidad comercial: no hay campo de tipo de preguntas SPIN usadas, no hay campo de señales de compra detectadas, no hay campo de objeciones, no hay campo de ratio de escucha. Eso sí lo produce el análisis externo de grabaciones.
- **El botón "+ IA" del briefing no está completamente wireed en el redesign**: el `data-action="regenerar-briefing"` existe en `detail.js` pero el manejador que lo conecta a `Data.generateBriefing` no está implementado. El briefing se accede desde `cmdk.js` o navegando directamente, pero el flujo UI más natural (desde la ficha → generar) tiene este gap.
- **El borrador del informe se pierde si cambias de dispositivo**: usa `localStorage`, no Supabase. Si empiezas a escribir el informe en el iPhone y lo abres en el Mac, no hay borrador.
- **No hay recomendación de "qué preguntar" basada en el historial**: el briefing genera preguntas SPIN genéricas ajustadas al tipo de cliente, pero no aprende de visitas anteriores para sugerir profundizar en un tema que quedó incompleto en la última reunión (ej: "en la visita de marzo Sergio mencionó el Plan RENOVA pero no se desarrolló — hoy es el momento de cerrar eso").
- **No hay captura estructurada de "advance logrado"**: después de la visita no hay un campo explícito donde el usuario registre si se logró un advance (pedido de BC3, siguiente visita agendada, prescripción comprometida) o si fue una continuation. El `nivel_interes` generado por IA es un proxy pobre para esto.
- **El contexto web no se persiste**: cada vez que se genera un briefing se hace scraping de cero. Si la web del cliente está caída o el proxy CORS falla, el briefing se genera sin contexto web. No hay caché del último dossier de investigación.
- **La capa sectorial es solo DuckDuckGo**: no hay scraping real de iAgua, AguasResiduales, RETEMA ni de los medios donde aparecen los proyectos del cliente. Las "señales de mercado" del briefing dependen de lo que devuelva DuckDuckGo, que puede ser irrelevante o desactualizado.

---

## 14. Resumen ejecutivo (10 líneas)

1. **Qué hace este CRM en su núcleo**: gestiona la cartera de 1.600 estudios de arquitectura e ingeniería de un prescriptor B2B de fontanería industrial, con scoring por valor directo × valor de red (cuadrantes Q1–Q9) y workflows de visita comercial completos.
2. **Qué hace en preparación de visita**: genera briefings pre-visita con Claude Sonnet (SPIN Selling, 10 secciones, guión de preguntas, productos recomendados), precedidos de investigación web multi-fuente en tiempo real (web del cliente + DuckDuckGo + Jina.ai + datos sectoriales).
3. **Si usa IA y cómo**: sí, Claude Sonnet 4 (`claude-sonnet-4-20250514`) para tres funciones: briefing pre-visita (8.192 tokens, markdown narrativo), informe post-visita (JSON estructurado desde notas libres) y enriquecimiento de empresa nueva (JSON de contacto/equipo). Llamadas via GAS proxy, no directamente desde el browser.
4. **Mayor fortaleza para preparar una visita**: el briefing combina historial acumulado de visitas anteriores + scoring estratégico del cliente + contexto web fresco + catálogo GPF personalizado por tipo + red territorial del prescriptor. Ninguna herramienta de briefing aislada tiene esa profundidad de contexto CRM.
5. **Mayor gap para preparar una visita**: no hay análisis de la ejecución real de la visita (transcripción, ratio de escucha, calidad SPIN), no se contrasta el briefing planificado con el informe post-visita, y la captura post-visita es solo texto libre sin estructura comercial (sin objeciones, sin advance explícito, sin señales de compra).
