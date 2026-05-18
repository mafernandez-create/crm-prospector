# Método Unificado de Búsqueda y Scoring — CRM Prospector / GPF

**Versión:** 1.1
**Fecha:** 17 de mayo de 2026
**Estado:** Especificación cerrada, lista para implementación.
**Sustituye a:** v1.0 (15/05/2026) — incorpora los dos modos de operación, el scoring v2 con doble eje y la matriz 3×3.
**Actualización aplicada (17/05/2026)**:
1. Todas las siglas, webs y estructuras territoriales de los colegios profesionales de la sección 5.2 han sido verificadas mediante búsqueda en fuentes oficiales (sitios web de los colegios y BOE). Cambios sobre la versión previa: bloque ARQ (denominaciones oficiales corregidas), bloque ING (ampliado a 4 tipos de colegio profesional: Caminos, Industriales, Agrónomos, ITOP), bloque OCV (añadidos Aparejadores), bloque CCRR (eliminada CHM por no pertenecer a la zona, añadidos organismos no-CCHH de Baleares, Canarias y demarcaciones internas andaluzas).
2. Añadida sección §15 **"Ejecución y UI del agente"** con la arquitectura híbrida Mac + Cloud (GitHub Actions), la UI nueva en el CRM (4 vistas: botones en ficha, bandeja del agente, cola de cualificación, botón global) y los endpoints HTTP `/api/*` que consumirá la skill futura.
3. Añadida sección §16 **"Eficiencia operativa diaria"** con tres funcionalidades que cierran el ciclo entre captura, reporting y planificación: captura post-visita por voz con transcripción local y extracción estructurada, generador automático de reporte semanal a partir de información ya capturada, y vista de planificación semanal apoyada en bandeja del agente. Estimación de ahorro: ~2,7 horas semanales recuperadas de tiempo administrativo.
**Audiencia:** Desarrollador (Claude Code) que implementará los cambios sobre el CRM Prospector actual.

---

## 0. Cómo leer este documento

Este documento define **qué** debe hacer el sistema, no **cómo** debe codificarse. La implementación concreta (estructura de carpetas, lenguajes, librerías) la decide el desarrollador respetando la base de código existente.

Convenciones:

- **REQUISITO**: comportamiento obligatorio.
- **RECOMENDACIÓN**: sugerencia técnica con justificación; puede ajustarse si el desarrollador identifica mejor alternativa.
- **DEPRECATED**: comportamiento existente que se mantiene durante la transición pero se retirará en una versión futura.

El sistema actual del CRM Prospector ya implementa parcialmente algunas piezas (scoring de prioridad, scoring de madurez B2B, análisis de estudio con 14 búsquedas). Este documento extiende lo existente sin reemplazarlo cuando sea evitable.

---

## 1. Principios de diseño

1. **Una sola entrada pública por modo**: el sistema expone dos funciones públicas, `cualificar_cliente(id)` y `generar_briefing(id, fecha_visita)`. Todo lo demás es interno.
2. **Modularidad**: bloque base común + bloques condicionales según `type` del cliente.
3. **Trazabilidad obligatoria de cada dato**: `valor`, `fuente_url`, `fuente_tipo`, `fecha_captura`, `nivel_confianza`. Sin estos cinco campos, el dato no se guarda en la nueva estructura.
4. **Verificación cruzada antes de marcar como fiable**: un dato aparece en ≥2 fuentes para subir a `verificado`.
5. **Solo fuentes públicas y gratuitas**. No se contemplan bases de datos premium (Iberinform, Informa Premium, Axesor Premium) en esta versión.
6. **Sin invención**: si una fuente no devuelve resultado, se registra `no_encontrado` con timestamp. No se rellenan huecos por inferencia automática.
7. **Dato no fiable = dato omitido del scoring**: las dimensiones del scoring solo entran al cálculo si el dato subyacente es `verificado`. Si el dato es `inferido` o `single_source`, la dimensión queda fuera y el cálculo se ajusta proporcionalmente (no se penaliza al cliente por falta de dato, pero tampoco se infla con estimación).
8. **Extender sin romper**: el sistema de scoring actual sigue funcionando durante la migración. Los nuevos campos conviven con los antiguos hasta que la migración esté completa.

---

## 2. Arquitectura por capas

El sistema completo se organiza en tres capas que comparten infraestructura:

```
┌─────────────────────────────────────────────────┐
│  APP (CRM Prospector) — núcleo determinista     │
│  • Búsquedas, scraping, normalización           │
│  • Persistencia con metadatos                   │
│  • Scoring v2                                   │
│  • Expone MCP server con funciones públicas     │
└────────────┬────────────────────────────────────┘
             │
   ┌─────────┴─────────────────────┐
   │                                │
   ▼                                ▼
┌──────────────────────┐   ┌──────────────────────┐
│ SKILL (Claude.ai)    │   │ AGENTE (programado)  │
│ • Briefing a demanda │   │ • Cualificación lote │
│ • Activación por     │   │ • Refresco periódico │
│   Manolo en chat     │   │ • Descubrimiento     │
│                      │   │   por zonas          │
└──────────────────────┘   └──────────────────────┘
```

**Alcance de este documento**: la APP (núcleo determinista). La skill y el agente se construirán en fases posteriores y consumirán las funciones públicas que la APP exponga.

---

## 3. Tipos de cliente soportados

Se mantiene el conjunto de tipos del sistema actual, formalizado con códigos cortos:

| Código | Tipo | Cartera GPF asociada |
|---|---|---|
| `ARQ` | Arquitectura (estudios, despachos) | FERROPLAST (Mute, Eume), prescripción |
| `ING` | Ingeniería consultora | Cross-brand |
| `OCV` | Obra Civil / Constructora / Promotora | TUYPER + FERROPLAST |
| `AAPP` | Administración Pública (ayuntamientos, diputaciones, mancomunidades, juntas) | TUYPER (ecoSAN, CONDUSAN, PE100) |
| `CCRR` | Comunidad de Regantes | TUYPER (PE100, BIOPIPE) |
| `CICA` | Empresa del ciclo del agua (mixta, EPEL, privada) | TUYPER + BIOPIPE |

**Tipos compuestos**: un cliente puede tener varios tipos. En ese caso, el método ejecuta los bloques sectoriales correspondientes a cada tipo y combina los resultados.

**Zona geográfica cubierta por GPF (Manolo)**: Andalucía, Extremadura, Castilla-La Mancha, Madrid, Comunidad Valenciana, Murcia, Baleares, Canarias, Ceuta, Melilla.

---

## 4. Estructura de datos con metadatos (REQUISITO)

Cada campo informativo del cliente pasa a almacenarse como **objeto con metadatos**, no como string plano.

### 4.1 Estructura unitaria

```json
{
  "valor": "955 123 456",
  "fuente_url": "https://www.empresa.com/contacto",
  "fuente_tipo": "web_oficial",
  "fecha_captura": "2026-05-17T10:32:00Z",
  "nivel_confianza": "verificado",
  "verificaciones": [
    {"fuente_url": "https://www.empresa.com/contacto", "fecha": "2026-05-17"},
    {"fuente_url": "https://linkedin.com/company/empresa", "fecha": "2026-05-17"}
  ],
  "verificacion_humana": {
    "verificado_por": "manolo",
    "fecha": "2026-04-22",
    "contexto": "Llamada con Rafa"
  }
}
```

### 4.2 Niveles de confianza

| Nivel | Definición | Cuándo se asigna |
|---|---|---|
| `verificado_humano` | Confirmado por Manolo en visita/llamada/contacto directo | Manolo lo marca manualmente |
| `verificado` | Mismo valor en ≥2 fuentes externas | Automático tras Capa 4 |
| `single_source` | Aparece en 1 sola fuente externa | Automático |
| `inferido` | No aparece como tal, deducido de patrón (con regla documentada) | Solo si la regla queda registrada |
| `discrepancia` | Dos fuentes dan valores distintos | Automático; requiere intervención humana |
| `obsoleto` | Sin reconfirmar >12 meses | Automático por fecha |
| `no_encontrado` | Búsqueda lanzada, sin resultado | Automático |
| `legacy` | Dato anterior a v1.1, sin trazabilidad | Solo durante migración |

### 4.3 Reglas de conflicto

- Dos valores distintos en la misma categoría → `discrepancia`. Se guardan ambos con sus fuentes.
- Prioridad de resolución automática: **fecha más reciente** + **autoridad de la fuente**.
  - Orden de autoridad: web oficial > BORME > LinkedIn corporativo > directorios empresariales > prensa > otras.
- Discrepancia detectada → alerta visible en la ficha del cliente hasta que se resuelva manualmente.

### 4.4 Caducidad

- Dato sin reconfirmar a los **12 meses** → `obsoleto` (visualmente en amarillo).
- A los **18 meses** → rojo, requiere re-análisis o verificación humana.
- La caducidad aplica al dato individual, no al cliente completo. Un cliente puede tener teléfono fresco y dirección obsoleta.

### 4.5 Migración del estado actual (REQUISITO)

La migración de campos string actuales del CRM es **destructiva** (existe copia de seguridad de respaldo). Cada campo se convierte a la nueva estructura con:

```json
{
  "valor": "<valor actual>",
  "fuente_url": null,
  "fuente_tipo": "legacy",
  "fecha_captura": "<fecha de creación del registro original o null>",
  "nivel_confianza": "legacy"
}
```

Los datos `legacy` se van eliminando a medida que se re-analiza cada cliente. No bloquean el funcionamiento del sistema, pero no entran al scoring v2 (solo `verificado` entra al scoring).

---

## 5. Método unificado de búsqueda — capas

### Capa 0 — Contexto interno del CRM

Antes de lanzar búsquedas externas, se carga lo que ya hay en el CRM:

| Campo | Uso |
|---|---|
| Nombre del estudio/empresa | Input principal de las búsquedas |
| `type` | Selecciona el bloque sectorial |
| Ciudad / Provincia | Refina búsquedas geográficas |
| CIF/NIF (si existe) | Habilita búsqueda en BORME |
| Web registrada | Entrada directa a Capa 3 |
| Contacto principal | Validación cruzada con resultados |
| Historial de informes (últimos 3) | Solo en modo briefing |
| Últimas 5 actividades | Solo en modo briefing |

### Capa 1 — Bloque base (común a todos los tipos)

10 búsquedas en paralelo. **REQUISITO**: el sistema debe usar al menos **dos motores de búsqueda distintos** con estrategia de failover. Motor principal y motor secundario. Cuando el principal falle, devuelva error de cuota, timeout, o resultados claramente insuficientes (≤2 resultados relevantes), el sistema cae automáticamente al motor secundario. La estrategia de qué motor es principal puede ser configurable por entorno. Combinaciones razonables: DuckDuckGo + Brave Search, Brave Search + SerpAPI, etc.

| # | Consulta | Objetivo |
|---|---|---|
| 1 | `"<nombre>" <provincia>` | Presencia general |
| 2 | `"<nombre sin tildes>" <provincia>` | Variantes ortográficas |
| 3 | `"<nombre>" teléfono email contacto <provincia>` | Datos de contacto |
| 4 | `"<nombre>" "aviso legal" OR "política de privacidad"` | DPO, razón social, CIF |
| 5 | `"<nombre>" BORME` o `<CIF> BORME` si hay CIF | Información mercantil pública |
| 6 | `site:linkedin.com/company "<nombre>"` | Perfil corporativo LinkedIn |
| 7 | `"<nombre>" site:empresite.eleconomista.es OR site:einforma.com OR site:axesor.es` | Datos básicos gratuitos |
| 8 | `"<nombre>" <provincia> noticias` | Apariciones en prensa local |
| 9 | `"<nombre>" entrevista OR jornada OR ponencia` | Apariciones del equipo directivo |
| 10 | `"<nombre>" datos.gob.es` | Aparición en datasets públicos |

### Capa 2 — Bloques sectoriales

Se ejecuta el bloque correspondiente al `type`. Si hay varios tipos, se ejecutan en secuencia.

> **Nota sobre la zona geográfica**: las tablas de colegios y organismos siguientes están adaptadas a la zona de trabajo de GPF/Manolo (Andalucía, Extremadura, CLM, Madrid, CV, Murcia, Baleares, Canarias, Ceuta, Melilla). Para clientes fuera de esta zona, ampliar bajo demanda.

#### Bloque `ARQ` — Arquitectura

##### Búsquedas web

| # | Consulta / Fuente | Objetivo |
|---|---|---|
| A1 | `site:archdaily.com OR site:dezeen.com OR site:plataformaarquitectura.cl "<nombre>"` | Reconocimiento profesional |
| A2 | `site:metalocus.es OR site:hicarquitectura.com "<nombre>"` | Plataformas hispanohablantes |
| A3 | `"<nombre>" concurso OR bienal OR premio arquitectura` | Premios |
| A4 | `site:concursosdearquitectura.com "<nombre>"` | Concursos activos |
| A5 | `"<nombre>" arquitecto fundador OR director OR socio` | Equipo directivo |

##### Colegios de Arquitectos por CCAA (verificados)

| CCAA | Colegio | Notas |
|---|---|---|
| Andalucía | COA Andalucía + colegios provinciales (Málaga, Sevilla, Cádiz, Granada, Almería, Córdoba, Huelva, Jaén) | |
| Extremadura | COADE | |
| Castilla-La Mancha | COACM | |
| Madrid | COAM | |
| Comunidad Valenciana | COACV con colegios territoriales: CTAV (Valencia), CTAA (Alicante), CTAC (Castellón) | |
| Murcia | COAMU | |
| Baleares | COAIB | |
| Canarias | COAC Canarias | Desambiguar siempre con "Canarias" para no confundir con el COAC catalán |
| Ceuta | Delegación del Colegio Oficial de Arquitectos de Cádiz | No tiene colegio propio |
| Melilla | Delegación del Colegio Oficial de Arquitectos de Málaga | No tiene colegio propio |

#### Bloque `ING` — Ingeniería

Incluye **cuatro tipos de colegio profesional** relevantes para la prescripción: Caminos, Industriales, Agrónomos e ITOP/Ingeniería Civil. Se consultan los que apliquen según la especialidad detectada de la ingeniería.

##### Búsquedas web

| # | Consulta / Fuente | Objetivo |
|---|---|---|
| I1 | `"<nombre>" proyecto OR estudio OR redacción "<provincia>"` | Cartera de proyectos |
| I2 | `site:tecniberia.com "<nombre>"` | Asociación nacional de empresas de ingeniería |
| I3 | `"asociación ingenierías <CCAA>" "<nombre>"` | Asociaciones autonómicas (búsqueda genérica) |
| I4 | Revistas técnicas: ROP, ITA, Cauce 2000 | Apariciones técnicas |

##### Colegios de Ingenieros de Caminos, Canales y Puertos (CICCP — colegio único nacional con demarcaciones)

| Demarcación | Web verificada |
|---|---|
| Andalucía, Ceuta y Melilla | caminosandalucia.es |
| Extremadura | caminosextremadura.es |
| Castilla-La Mancha | caminosclm.es |
| Madrid | caminosmadrid.es |
| Comunidad Valenciana | caminoscv.es |
| Murcia | caminosmurcia.com |
| Baleares | caminsbalears.org |
| Canarias - Las Palmas | colegiocaminos.es/palmas |
| Canarias - Sta Cruz de Tenerife | colegiocaminos.es/tenerife |

##### Colegios de Ingenieros Industriales (verificados)

| CCAA | Colegio | Sigla | Web verificada |
|---|---|---|---|
| Andalucía Occidental (Sevilla, Cádiz, Córdoba, Huelva) | Colegio Oficial de Ingenieros Industriales de Andalucía Occidental | COIIAOC | coiiaoc.com |
| Andalucía Oriental (Málaga, Granada, Almería, Jaén, Ceuta, Melilla) | Colegio Oficial de Ingenieros Industriales de Andalucía Oriental | COIIAOR | coiiaor.es |
| Extremadura | Colegio Oficial de Ingenieros Industriales de Extremadura | COIIEX | coiiex.es |
| **Castilla-La Mancha** | *Los ingenieros industriales superiores de CLM se adscriben al **COIIM (Madrid)**. No tiene colegio propio.* | — | iim.es |
| Madrid (también cubre CLM) | Colegio Oficial de Ingenieros Industriales de Madrid | COIIM | iim.es |
| Comunidad Valenciana (única para Valencia, Alicante, Castellón) | Colegio Oficial de Ingenieros Industriales de la Comunitat Valenciana | COIICV | iicv.net |
| Murcia | Colegio Oficial de Ingenieros Industriales de la Región de Murcia | COIIRM | coiirm.es |
| Baleares | Colegio Oficial de Ingenieros Industriales de las Islas Baleares | COEIB | coeib.com |
| Canarias - Las Palmas | Colegio Oficial de Ingenieros Industriales de Canarias Oriental | COIICO | coiico.es |
| Canarias - Tenerife | Colegio Oficial de Ingenieros Industriales de Santa Cruz de Tenerife | COIITF | coiitf.es |

##### Colegios de Ingenieros Agrónomos (estructura mixta verificada)

Especialmente relevantes para `CCRR` y `CICA` cuando hay proyectos de regadío o gestión hidráulica agrícola.

| Zona | Colegio | Cobertura geográfica | Web verificada |
|---|---|---|---|
| Andalucía | COIA Andalucía | Andalucía completa | agronomo.es |
| Extremadura | COIA Extremadura | Extremadura completa | colagroex.org |
| Centro y Canarias | COIA Centro y Canarias | Madrid + CLM (excepto Albacete) + Las Palmas + Tenerife | agronomoscentro.org |
| Albacete | COIA Albacete | Solo provincia de Albacete | búsqueda directa |
| Levante | COIA Levante | Valencia, Alicante, Castellón, Baleares | coial.org |
| Murcia | COIA Región de Murcia | Murcia completa | búsqueda directa |

##### Colegios de Ingenieros Técnicos de Obras Públicas / Ingeniería Civil (CITOP)

Colegio único nacional con organización por zonas. Web nacional: `ingenieros-civiles.es`.

| Zona | Web verificada |
|---|---|
| Andalucía Oriental | ingenieroscivilesandaluciaor.es |
| Andalucía Occidental | búsqueda con patrón `CITOP <provincia>` |
| Extremadura | extremaduracitopic.com |
| Castilla-La Mancha | búsqueda con patrón `CITOP CLM` |
| Madrid | citopmadrid.es |
| CV (Valencia-Castellón) | citopcv.com |
| Alicante (separado) | citopalicante.com |
| Murcia, Baleares, Canarias | búsqueda con patrón `CITOP <zona>` |

#### Bloque `OCV` — Obra Civil / Constructora / Promotora

##### Búsquedas y registros

| # | Consulta / Fuente | Objetivo |
|---|---|---|
| C1 | REA (Registro de Empresas Acreditadas) por CCAA | Habilitación oficial |
| C2 | Clasificación de Contratistas del Estado (JCCA / Hacienda) | Categorías y grupos |
| C3 | `site:seopan.es "<nombre>"` | Si es gran constructora |
| C4 | `site:anci.es OR site:anesco.org "<nombre>"` | Asociaciones de constructoras |
| C5 | `"<nombre>" adjudicación OR contrato <provincia>` | Adjudicaciones públicas |
| C6 | **PLACSP Monitor** (integración interna, ver §11) | Adjudicaciones recientes |

##### Colegios de Aparejadores, Arquitectos Técnicos e Ingenieros de Edificación

Relevantes para OCV porque actúan habitualmente como dirección de obra. Estructura **provincial** (un colegio por provincia con sigla común **COAATIE + provincia**). Consejo General nacional: **CGATE** (`cgate.es`).

Casos especiales conocidos:
- **Murcia**: COAATIEMU (`coaatiemu.es`)
- **CLM**: Consejo autonómico (Albacete, Cuenca, Ciudad Real, Guadalajara, Toledo) — `aparejadoresclm.org`
- **Resto** (Andalucía, Extremadura, CV, Madrid, Baleares, Canarias, Ceuta, Melilla): búsqueda con patrón `"COAATIE <provincia>"` o `"Colegio Aparejadores <provincia>"`

#### Bloque `AAPP` — Administración Pública

| # | Consulta / Fuente | Objetivo |
|---|---|---|
| P1 | PLACSP — perfil del contratante | Licitaciones activas y adjudicadas |
| P2 | Web oficial del organismo | Organigrama, áreas, concejales |
| P3 | BOE, BOJA, DOE, DOCM, BOCM, DOGV, BORM, BOIB, BOC, BOCCE, BOME | Publicaciones oficiales |
| P4 | Boletín Provincial correspondiente (BOP) | Mancomunidades y ayuntamientos pequeños |
| P5 | `site:datos.gob.es <nombre organismo>` | Datasets de contratación |
| P6 | **PLACSP Monitor** (integración interna) | Tendencia de licitaciones |

Boletines oficiales de la zona, en detalle:

| Territorio | Boletín |
|---|---|
| Estatal | BOE |
| Andalucía | BOJA |
| Extremadura | DOE |
| Castilla-La Mancha | DOCM |
| Madrid | BOCM |
| Comunidad Valenciana | DOGV |
| Murcia | BORM |
| Baleares | BOIB |
| Canarias | BOC |
| Ceuta | BOCCE |
| Melilla | BOME |
| Provincial | BOP correspondiente |

#### Bloque `CCRR` — Comunidad de Regantes

##### Federaciones y organismos generales

| # | Consulta / Fuente | Objetivo |
|---|---|---|
| R1 | FENACORE (fenacore.org) | Federación nacional, censo |
| R2 | Federación autonómica: FERAGUA, FEREMUR, FECOREVA, Junta de Regantes Extremadura, FERACAM, y equivalentes en Baleares y Canarias | Comunidades asociadas |
| R4 | SEIASA | Planes de modernización financiados |
| R5 | `"<nombre comunidad>" modernización regadío` | Proyectos PERTE / Next Generation |
| R6 | MAPA — Plan Nacional de Regadíos | Inclusión en plan nacional |
| R7 | **PLACSP Monitor** (integración interna) | Adjudicaciones |

##### Organismos de cuenca y gestión del agua (R3) — Verificados y adaptados a la zona

| Territorio | Organismo gestor | Naturaleza |
|---|---|---|
| Cuenca del Guadalquivir (Andalucía mayor parte) | CHG — Confederación Hidrográfica del Guadalquivir | Estatal |
| Cuenca Mediterránea Andaluza (Málaga, Granada, Almería costa) | CMA — Cuenca Mediterránea Andaluza | Autonómico (Junta de Andalucía) |
| Cuenca Atlántica Andaluza (Cádiz, Huelva costa) | DGCA — Cuenca Atlántica Andaluza | Autonómico (Junta de Andalucía) |
| Cuenca del Segura (Murcia, parte Almería, parte Albacete) | CHS — Confederación Hidrográfica del Segura | Estatal |
| Cuenca del Júcar (Valencia, parte Albacete, parte Cuenca) | CHJ — Confederación Hidrográfica del Júcar | Estatal |
| Cuenca del Tajo (Madrid, Toledo, Guadalajara, parte Cáceres) | CHT — Confederación Hidrográfica del Tajo | Estatal |
| Cuenca del Guadiana (Badajoz, Ciudad Real) | CHGN — Confederación Hidrográfica del Guadiana | Estatal |
| Baleares | DGRH — Dirección General de Recursos Hídricos del Govern Balear | Autonómico (no hay CCHH) |
| Canarias | Consejos Insulares de Aguas: Tenerife, Gran Canaria, Lanzarote, Fuerteventura, La Palma, La Gomera, El Hierro | Insular (uno por isla) |
| Ceuta | Gestión municipal (ACEMSA u operador local) | Local |
| Melilla | Gestión municipal (operador local) | Local |

> **Importante**: la Confederación Hidrográfica del Miño-Sil (CHM) **no aplica** a esta zona (es Galicia y norte).

#### Bloque `CICA` — Empresa del ciclo del agua

| # | Consulta / Fuente | Objetivo |
|---|---|---|
| W1 | AEAS (aeas.es) | Asociación nacional |
| W2 | ASA Andalucía (asociacionasa.org) — para clientes en Andalucía | Asociación autonómica |
| W3 | `"asociación abastecimiento saneamiento <CCAA>"` o `"asociación empresas agua <CCAA>"` | Búsqueda genérica para asociaciones autonómicas en otras CCAA |
| W4 | Organismo de cuenca correspondiente (ver tabla R3 del bloque CCRR) | Concesiones |
| W5 | `site:iagua.es "<nombre>"` | Prensa sectorial líder |
| W6 | `site:retema.es "<nombre>"` | Prensa sectorial técnica |
| W7 | PLACSP (si presta servicio a AAPP) | Contratos de gestión |
| W8 | **PLACSP Monitor** (integración interna) | Histórico contratos |

### Capa 3 — Análisis profundo de la web oficial

Se mantiene la lógica actual del CRM (5 secciones, JSON-LD, emails, teléfonos, direcciones, redes sociales) con tres mejoras (REQUISITO):

1. **Sin truncado ciego**: si una sección excede el límite de caracteres, segunda pasada con el texto restante.
2. **URL exacta de cada dato extraído**, no solo "web oficial".
3. **Hash del HTML capturado** para detectar cambios en re-análisis futuros.

### Capa 4 — Verificación cruzada y asignación de metadatos

Cada dato candidato pasa por el algoritmo definido en §4 (estructura, niveles, conflictos). El resultado es la persistencia con metadatos completos.

---

## 6. Modos de operación

El método unificado tiene **dos modos** que comparten capas pero difieren en alcance y output.

### 6.1 Modo `cualificacion`

- **Propósito**: filtrar y priorizar candidatos. Responder "¿merece la pena visitarlo?".
- **Capas ejecutadas**: 0, 1, 2 (subconjunto rápido), 4.
- **Capa 3 (scraping profundo)**: solo si el cliente supera primer corte en Capa 1.
- **Output**: registro de cliente con scoring v2 asignado, cuadrante de la matriz y siguiente paso recomendado.
- **Uso típico**: lote nocturno del agente (ver §10).
- **No incluye**: lectura de informes anteriores ni actividades previas.

### 6.2 Modo `briefing`

- **Propósito**: preparar visita concreta. Responder "qué le digo y a quién".
- **Capas ejecutadas**: 0, 1, 2, 3 (completas), 4.
- **Capa adicional `briefing`**: lectura del historial interno del cliente — informes previos, últimas 5 actividades, notas de visitas anteriores, datos relacionados con el equipo.
- **Output**: dossier narrativo + agenda de 3–5 puntos a tratar.
- **Uso típico**: a demanda, antes de una visita.
- **Si hay informes anteriores**: el briefing empieza con un bloque "lo último que hablamos" para continuar la línea.

---

## 7. Scoring v2 — Doble eje

### 7.1 Visión general

Sustituye al scoring de prioridad actual (`calculateAutoPriority`). **Conserva** el scoring de madurez B2B (`getReadinessScore`) sin cambios — son sistemas independientes con propósitos distintos.

El scoring v2 calcula **dos scores independientes**:

- **Eje 1: Valor Directo** — cuánto puede consumir o prescribir GPF este cliente por sí mismo.
- **Eje 2: Valor de Red** — a cuántos targets GPF te abre indirectamente.

Cada eje se calcula sobre **15 puntos** y se traduce a banda Alta / Media / Baja. La combinación de las dos bandas determina el **cuadrante** en la matriz 3×3 (ver §8).

### 7.2 Eje 1 — Valor Directo

| # | Dimensión | Cálculo | Puntos máx. |
|---|---|---|---|
| D1 | **Tipo de cliente** | ARQ/ING: +3 (prescriptor directo) / OCV: +2 (decisor de compra) / AAPP/CCRR/CICA: +1 (usuario final) / **Cliente puente** (ver §7.2.1): +2 | 3 |
| D2 | **Tamaño** (medido según tipo) | ARQ/ING: ≥20 emp +3, ≥10 +2, ≥3 +1 / OCV: ≥50 emp +3, ≥20 +2, ≥5 +1 / AAPP: presupuesto >50M€ +3, >10M€ +2, >1M€ +1 / CCRR: >5.000 ha +3, >1.000 ha +2, >100 ha +1 / CICA: >500.000 hab +3, >100.000 +2, >10.000 +1 / **Cliente puente**: aplica el tamaño del tipo principal asignado | 3 |
| D3 | **Facturación** *(solo si `verificado`)* | >10M€ +2, >2M€ +1.5, >500k€ +1, ≤500k€ +0.5 / Si no `verificado`: dimensión omitida | 2 |
| D4 | **Actividad reciente** | Proyectos en los últimos 12 meses: ≥5 +3, ≥3 +2, ≥1 +1 | 3 |
| D5 | **Fit con catálogo GPF** | Cruce de tipos de proyecto detectados con productos GPF aplicables. Alta densidad de fit (≥3 productos cruzables) +2, media (1-2) +1 / **Cliente puente**: el fit se mide por el catálogo aplicable a su cartera de clientes finales (proximidad indirecta), no por uso propio | 2 |
| D6 | **Contacto completo** | ≥5 datos entre teléfono, email, dirección, web, decisor identificado, email equipo, LinkedIn equipo: +2 / ≥2: +1 | 2 |

### 7.2.1 Cliente puente — Definición y detección (REQUISITO)

Un **cliente puente** es una empresa cuyo perfil natural cae en banda Baja en el eje Directo (no prescribe ni compra producto GPF directamente), pero cuyo rol en el mercado facilita acceso a targets GPF de su cartera. Ejemplos: instaladora fotovoltaica que trabaja con comunidades de regantes (caso Hyfotec), consultora técnica que prescribe a otros prescriptores, distribuidor de materiales adyacentes con cartera de OCV/AAPP.

**Atributo nuevo en el modelo de cliente**: `es_cliente_puente: boolean` (default `false`).

**Detección automática**: al recalcular scoring v2, el sistema marca como candidato a puente si simultáneamente:
- `rawDirect < 6` (banda Bajo en natural)
- `rawNetwork ≥ 6` (banda Media o Alta en red)
- `R1 ≥ 5` clientes/proyectos detectables en cartera

Cuando un cliente es marcado como candidato, aparece en la bandeja del agente como tarjeta "Posible cliente puente" para que el usuario lo confirme o descarte. Marcar `es_cliente_puente: true` desencadena un recálculo del scoring v2 aplicando los bonus de D1 y D5 indicados en la tabla anterior.

**Caso paradigmático Hyfotec**: instaladora fotovoltaica con cartera mayoritaria de comunidades de regantes. Sin la marca de puente caería en `Bajo + Alta = ⑦ Conector` (visita solo en ruta). Con la marca activa: D1 +2 + D5 +2 (fit indirecto con CCRR alto) → `Medio + Alta = ④ Puerta de entrada` (visita semestral con exploración de red).

**Bandas Eje 1**:

| Puntuación raw | Banda Directo |
|---|---|
| ≥10 | Alto |
| 6 – 9 | Medio |
| < 6 | Bajo |

### 7.3 Eje 2 — Valor de Red

| # | Dimensión | Cálculo | Puntos máx. |
|---|---|---|---|
| R1 | **Tamaño de cartera detectable** | Clientes/proyectos clientes-finales identificables: ≥10 +2, ≥5 +1.5, ≥2 +1 | 2 |
| R2 | **Densidad GPF de la cartera** | % de la cartera que son tipos target GPF: ≥75% +4, ≥50% +3, ≥25% +2, <25% +1 | 4 |
| R3 | **Exclusividad / proveedor preferente** | Si aparece como proveedor recurrente o exclusivo de ≥3 targets GPF: +3. Recurrente con 1-2: +2. Ocasional: +1 | 3 |
| R4 | **Posición referente** (dimensión compuesta, ver §9) | ≥4 señales: +4 / 2-3 señales: +2 / 0-1: 0 | 4 |
| R5 | **Diversidad geográfica de la cartera** | Cartera distribuida en ≥3 provincias de tu zona: +2 / 1-2: +1 | 2 |

**Bandas Eje 2**:

| Puntuación raw | Banda Red |
|---|---|
| ≥10 | Alta |
| 6 – 9 | Media |
| < 6 | Baja |

### 7.4 Tratamiento de datos no fiables (REQUISITO)

- Cualquier dimensión cuyo dato base **no sea `verificado`** se omite del cálculo.
- El score resultante se **normaliza proporcionalmente** sobre las dimensiones efectivamente computadas.
- En el desglose persistido se indica explícitamente qué dimensiones puntuaron y cuáles quedaron `sin_dato_fiable`.

### 7.5 Persistencia del scoring v2

Nuevos campos en el documento del estudio:

| Campo | Tipo | Contenido |
|---|---|---|
| `priorityDirect` | string | `"Alto"` \| `"Medio"` \| `"Bajo"` |
| `priorityDirectScore` | number | Puntuación raw 0–15 del Eje 1 |
| `priorityDirectDetails` | array | Desglose por dimensión, incluyendo las omitidas |
| `priorityNetwork` | string | `"Alta"` \| `"Media"` \| `"Baja"` |
| `priorityNetworkScore` | number | Puntuación raw 0–15 del Eje 2 |
| `priorityNetworkDetails` | array | Desglose por dimensión |
| `priorityQuadrant` | number | 1–9, según matriz §8 |
| `priorityQuadrantName` | string | Nombre del cuadrante |
| `priorityRecommendedAction` | string | Acción recomendada para el cuadrante |
| `scoringHistory` | array | Histórico de scoring v2 con timestamp |

**Campos antiguos** (`priority`, `score`, `priorityCalculatedScore`, `priorityDetails`): se mantienen como **DEPRECATED** durante la transición. Se retirarán cuando todos los clientes tengan scoring v2 calculado.

### 7.6 Histórico de scoring (REQUISITO)

Cada vez que se recalcula el scoring de un cliente, se añade una entrada a `scoringHistory`:

```json
{
  "fecha": "2026-05-17T03:00:00Z",
  "priorityDirect": "Medio",
  "priorityDirectScore": 7,
  "priorityNetwork": "Alta",
  "priorityNetworkScore": 11,
  "priorityQuadrant": 4,
  "trigger": "scheduler_nocturno"
}
```

Esto permite detectar:
- Subidas de cuadrante (oportunidad).
- Bajadas (alerta de cliente que se está enfriando).
- Cliente que entra/sale del foco activo.

---

## 8. Matriz 3×3 — Nueve cuadrantes con acción

| | **Red Alta** | **Red Media** | **Red Baja** |
|---|---|---|---|
| **Directo Alto** | **① Estratégico**<br>Doble propósito: compra + red.<br>Visita trimestral.<br>Tono: cuenta clave.<br>Objetivo: profundizar relación + cartografiar red. | **② Cliente core**<br>Compra sólida por sí mismo.<br>Visita trimestral.<br>Tono: comercial técnico.<br>Objetivo: mantener prescripción + detectar proyectos nuevos. | **③ Cliente volumen**<br>Compra grande pero aislado.<br>Visita semestral.<br>Tono: técnico-comercial.<br>Objetivo: sostener volumen. |
| **Directo Medio** | **④ Puerta de entrada**<br>Vale por quién te abre, no por lo que compra.<br>Visita semestral.<br>Tono: exploratorio, relación de confianza.<br>Objetivo: extraer información de su cartera, identificar 2-3 targets nuevos accesibles a través de él. | **⑤ Cartera estándar**<br>Cliente correcto.<br>Visita anual o en ruta.<br>Tono: estándar.<br>Objetivo: mantener relación, captar cambios. | **⑥ Mantenimiento**<br>Cliente válido pero poco rendidor.<br>Contacto anual telefónico, visita solo si pasa por zona.<br>Objetivo: no perderlo de vista. |
| **Directo Bajo** | **⑦ Conector**<br>Por sí mismo no vale, pero está en la red.<br>Visita solo si en ruta a otro cliente A o B en su zona.<br>Tono: contacto cordial sin pitch.<br>Objetivo: posicionarse en su radar. | **⑧ Seguimiento ligero**<br>Marginal.<br>Contacto telefónico anual.<br>Tono: profesional, breve.<br>Objetivo: confirmar vigencia. | **⑨ Congelar**<br>Sale del foco activo.<br>Sin contacto programado.<br>Re-evaluación a 18 meses por si cambia algo. |

**Asignación automática del cuadrante**: la combinación `priorityDirect` × `priorityNetwork` determina el cuadrante 1–9. La acción recomendada se persiste en `priorityRecommendedAction`.

---

## 9. Posición referente — Dimensión compuesta (R4)

Señales que suman como "referente" en el Eje 2. La dimensión cuenta señales detectadas, no las pondera individualmente.

### 9.1 Señales detectables automáticamente

| # | Señal | Cómo detectarla |
|---|---|---|
| 1 | Presidencia / junta de asociación sectorial | Web propia, web de la asociación, prensa |
| 2 | Ponente recurrente en jornadas | Programas de jornadas, prensa sectorial |
| 3 | Premio en últimos 5 años | Búsqueda específica de premios + web propia |
| 4 | Miembro de comité técnico de norma | UNE/AENOR, prensa sectorial |
| 5 | Docencia universitaria (titular, asociado, máster oficial) | LinkedIn, web universidad, web propia |
| 6 | Autoría de publicaciones técnicas (libros, capítulos, artículos firmados) | Google Scholar, Dialnet, revistas técnicas |
| 7 | Acreditaciones técnicas avanzadas (LEED AP, Passivhaus, BREEAM AP, Auditor energético senior) | Web propia, LinkedIn, registros oficiales (USGBC, PHI, BRE) |
| 8 | Marca personal activa del fundador/socio (blog técnico con publicaciones recientes, LinkedIn con posts técnicos con engagement, podcast/canal) | LinkedIn, web propia, búsqueda de blog asociado |
| 9 | Vinculación a I+D+i o proyectos europeos (Horizon, FEDER, CDTI, fondos Next Generation con denominación nominal) | CDTI, datos.gob.es, prensa especializada |

### 9.2 Señales no automatizables (entrada manual)

| # | Señal | Cómo se introduce |
|---|---|---|
| 10 | Citado por competidores como referencia técnica | Manolo lo marca manualmente tras detectarlo en visita o conversación |

**Cálculo final**:

| Señales detectadas | Puntos |
|---|---|
| ≥4 | +4 |
| 2 – 3 | +2 |
| 0 – 1 | 0 |

---

## 10. Modo cualificación — Detalle de funcionamiento

### 10.1 Entrada heterogénea

El modo cualificación acepta candidatos de orígenes variados:

- Clientes ya registrados en el CRM (pasada inicial sobre los ~1.500 existentes).
- Búsquedas web / LinkedIn (descubrimiento de nuevos).
- Referencias dadas en visitas previas (campo `referido_por` en el CRM, REQUISITO añadirlo).

### 10.2 Dos pasadas

#### Pasada inicial (one-shot)
- Auditoría completa del CRM existente (~1.500 clientes).
- Procesamiento asíncrono por lotes nocturnos.
- **RECOMENDACIÓN**: 100–200 clientes por noche según coste de búsquedas.
- Persistencia con check-point: si el proceso cae en el cliente N, retoma desde N en la siguiente ejecución.
- Estimación: 8–15 noches para completar la pasada inicial.

#### Pasada recurrente
- Se dispara cuando Manolo agenda una visita a una provincia/zona.
- El agente busca **nuevos candidatos** en esa zona y los cualifica.
- Trigger: integración con calendario (cuando esté disponible) o input manual de zona/fecha.

### 10.3 Política de refresco

- **Valor directo**: re-cualificar cada **12 meses**, porque facturación/empleados cambian despacio.
- **Valor de red**: re-cualificar cada **6 meses**, porque la cartera de clientes detectable cambia más rápido.
- Cliente con cambio detectado (proyecto nuevo, cambio de socios en BORME) → re-cualificar inmediatamente.

### 10.4 Bandeja de revisión

Cada mañana, Manolo recibe una bandeja con:
- Clientes que cambiaron de cuadrante (subida o bajada).
- Clientes con discrepancias detectadas.
- Clientes que entran a `obsoleto`.
- Candidatos nuevos descubiertos en pasada recurrente.

---

## 11. Integración con PLACSP Monitor v2.0

PLACSP Monitor es un sistema paralelo existente. La integración con el CRM se especifica como contrato, no como implementación:

- **Trigger**: tras Capa 2 si `type` ∈ {`OCV`, `AAPP`, `CCRR`, `CICA`}.
- **Input**: razón social, CIF (si hay), nombre comercial.
- **Output esperado**: lista de adjudicaciones/licitaciones últimos 24 meses con `expediente`, `organismo`, `importe`, `fecha_adjudicacion`, `objeto`, `url_PLACSP`.
- **Persistencia**: sección "Cartera/Adjudicaciones" del cliente, con `fuente_tipo: "PLACSP"` y `nivel_confianza: "verificado"` (PLACSP es fuente oficial).
- **Uso en scoring**:
  - Alimenta D4 (Actividad reciente) y D2 (Tamaño/Volumen).
  - Para clientes tipo OCV: el volumen adjudicado en últimos 24 meses sustituye a "empleados" si está disponible.

---

## 12. Refresco automático

### 12.1 Scheduler

**REQUISITO**: existe un proceso programado (cron, scheduler, equivalente) que:

- Cada noche identifica los N clientes cuyo refresco toca (por antigüedad de `fecha_captura` o trigger).
- Ejecuta el método unificado en modo `cualificacion` sobre ellos.
- Actualiza scoring, persiste histórico, marca obsoletos.
- Encola para revisión humana cualquier cambio de cuadrante o discrepancia detectada.

### 12.2 Eventos que disparan refresco inmediato

- Importación de un nuevo cliente.
- Cambio manual del tipo.
- Re-análisis manual lanzado desde la ficha.
- Detección de cambio en BORME del cliente.
- Marca manual de "verificación humana" tras visita.

---

## 13. Output de cada modo (estructura)

### 13.1 Output modo `cualificacion`

```json
{
  "id_cliente": "...",
  "fecha_cualificacion": "2026-05-17T03:14:00Z",
  "priorityDirect": "Medio",
  "priorityDirectScore": 7,
  "priorityDirectDetails": [...],
  "priorityNetwork": "Alta",
  "priorityNetworkScore": 11,
  "priorityNetworkDetails": [...],
  "priorityQuadrant": 4,
  "priorityQuadrantName": "Puerta de entrada",
  "priorityRecommendedAction": "Visita semestral. Tono exploratorio. Objetivo: extraer información de su cartera.",
  "señales_referente_detectadas": [...],
  "cartera_detectada": [...],
  "alertas": ["Discrepancia en teléfono", "Dato facturación obsoleto"]
}
```

### 13.2 Output modo `briefing`

```json
{
  "id_cliente": "...",
  "fecha_briefing": "2026-05-17T09:00:00Z",
  "fecha_visita_prevista": "2026-05-20T10:00:00Z",
  "identificacion": {...},
  "interlocutor_recomendado": {...},
  "ultimo_contacto": {...},
  "lo_ultimo_que_hablamos": "...",
  "contexto_actual": {
    "proyectos_activos": [...],
    "novedades_ultimos_meses": [...],
    "señales_oportunidad": [...]
  },
  "fit_catalogo_gpf": [...],
  "agenda_visita": [
    {"orden": 1, "punto": "...", "argumento": "..."},
    {"orden": 2, "punto": "...", "argumento": "..."}
  ],
  "banderas": ["Datos obsoletos en X", "Discrepancia pendiente en Y"]
}
```

---

## 14. Plan de implementación recomendado

Orden sugerido de fases. Cada fase es independiente y entregable:

| Fase | Contenido | Entregable |
|---|---|---|
| **A** | Estructura de datos con metadatos (§4) + migración destructiva de campos string actuales a `legacy` | Esquema de datos actualizado, migración ejecutada |
| **B** | Refactor del método de búsqueda: bloque base + bloques sectoriales con tablas verificadas (§5) | Reemplazo de las 14 búsquedas fijas |
| **C** | Scoring v2 (§7) en paralelo al scoring actual (no romper UI) | Nuevos campos calculados, scoring viejo intacto |
| **D** | Matriz 3×3 + asignación de cuadrante (§8) + **vista "Planificación de la semana" (§16.3)** | Bandeja por cuadrante en UI + planificación semanal operativa |
| **E** | Modo cualificación con lotes nocturnos (§10) | Scheduler funcionando sobre clientes existentes |
| **F** | Modo briefing con lectura de historial (§6.2) + **generador automático de reporte semanal (§16.2)** | Función `generar_briefing(id, fecha)` operativa + endpoint de reporte semanal |
| **G** | Integración con PLACSP Monitor (§11) | Datos PLACSP en ficha de OCV/AAPP/CCRR/CICA |
| **H** | Retirada del scoring antiguo (DEPRECATED) | Limpieza final |
| **I** | **Captura post-visita por voz (§16.1)** con transcripción local y extracción estructurada | Funcionalidad móvil completa, integrada con ficha de cliente |

---

## 15. Ejecución y UI del agente

### 15.1 Visión general

El agente se ejecuta en **doble modalidad híbrida**:

- **Local en el Mac de Manolo** — lanzamiento automático al encender + invocación manual desde el CRM o terminal.
- **Cloud (GitHub Actions)** — ejecución programada nocturna, independiente del estado del Mac.

Ambas modalidades comparten la **misma codebase** y operan sobre el **mismo Firestore**. La cola de trabajo es persistente en Firestore, lo que permite que cualquier instancia (local o cloud) coja los siguientes pendientes sin conflicto.

### 15.2 Ejecución local (Mac)

**Lanzamiento automático al encender el Mac**:
- Mecanismo: `launchd` con plist en `~/Library/LaunchAgents/com.gpf.crm.agente.plist`.
- Disparadores combinados: `RunAtLoad=true` (al iniciar sesión del usuario) + `StartCalendarInterval` (a horas configuradas).
- Comportamiento al arrancar: el agente comprueba si hay pendientes y procesa hasta agotar tiempo o cola.

**Invocación manual desde terminal**:
- `gpf-agente cualificar [--cliente <id>] [--lote N]`
- `gpf-agente briefing <id_cliente> <fecha>`
- `gpf-agente estado` (devuelve estado de cola y última ejecución)

**Invocación manual desde el CRM**: ver §15.5.

### 15.3 Ejecución cloud (GitHub Actions)

**Configuración**:
- Workflow principal: `.github/workflows/agente-cualificacion.yml`.
- Trigger automático: `schedule: '0 3 * * *'` (03:00 UTC = 04:00 hora peninsular).
- Trigger manual: `workflow_dispatch` (permite lanzar desde la UI de GitHub bajo demanda).
- Duración máxima por workflow: 6 horas. Suficiente para procesar holgadamente 100–200 clientes por noche.
- Coste: gratuito hasta 2.000 minutos/mes en repositorio privado.

**Secrets necesarios** (configurar en `Settings → Secrets and variables → Actions`):
- `FIREBASE_SERVICE_ACCOUNT_KEY` — JSON de la cuenta de servicio para acceso a Firestore.
- `BRAVE_SEARCH_API_KEY` — si se usa Brave como segundo motor de búsqueda.
- Cualquier otra credencial para fuentes externas (PLACSP, etc.).

### 15.4 Concurrencia entre Mac y Cloud

Para evitar que ambas instancias procesen el mismo cliente simultáneamente:

- Cada documento de cliente tiene un campo `procesandose_por` con valor `null | {instancia, timestamp}`.
- Antes de procesar, la instancia escribe ese campo de forma atómica (Firestore transaction).
- Timeout de **30 minutos**: si una instancia no termina ni libera el bloqueo en ese tiempo, otra puede retomar.
- Tras procesar exitosamente: `procesandose_por = null`, `ultima_cualificacion = timestamp`.

### 15.5 UI en el CRM (REQUISITO)

Cuatro elementos nuevos en el CRM Prospector:

#### 15.5.1 Botones en ficha de cada cliente

- `Re-cualificar ahora`: dispara `cualificar_cliente(id)` síncrono. Muestra spinner, actualiza scoring y cuadrante al terminar, sin recargar la página.
- `Generar briefing para fecha…`: abre selector de fecha; al confirmar, dispara `generar_briefing(id, fecha)`. Muestra el dossier en un panel lateral o pestaña nueva.

#### 15.5.2 Vista "Bandeja del agente"

Nueva pestaña/sección en la navegación principal. Cada mañana muestra:
- Cambios de cuadrante (con indicador de subida ↑ / bajada ↓).
- Discrepancias detectadas pendientes de resolución manual.
- Clientes que entran a `obsoleto`.
- Candidatos nuevos descubiertos en pasada recurrente.

Acciones rápidas por fila: `validar` / `descartar` / `agendar visita` / `ver ficha`.

#### 15.5.3 Vista "Cola de cualificación"

Estado operativo del agente:
- Total de clientes / procesados en última pasada / pendientes / errores.
- Última ejecución (timestamp, duración, fuente: local Mac o cloud GitHub Actions).
- Útil sobre todo durante las primeras semanas de la pasada inicial.

#### 15.5.4 Botón global "Lanzar lote ahora"

- Ubicado en el header del CRM, junto al menú principal.
- Dispara una ejecución manual del agente (local si Mac está activo, o llamada al endpoint `/api/cualificar` para que entre a la cola en Firestore).
- Útil para adelantar cualificaciones cuando no quieras esperar al cron nocturno.

### 15.6 Endpoint HTTP (preparación para skill futura)

La app expone los siguientes endpoints (implementables como Firebase Functions o equivalente):

| Método | Ruta | Body | Devuelve |
|---|---|---|---|
| POST | `/api/cualificar` | `{id_cliente}` o `{lote: N}` | `{job_id}` (asíncrono) |
| POST | `/api/briefing` | `{id_cliente, fecha_visita}` | Dossier completo (síncrono) |
| GET | `/api/bandeja-agente` | — | Lista de pendientes de revisión |
| GET | `/api/estado` | — | Estado de cola y última ejecución |

**Autenticación**: token compartido (env var `GPF_API_TOKEN`) en cabecera `Authorization: Bearer <token>`. Suficiente para esta fase. Migrable a Firebase Auth más adelante si la skill lo requiere.

Estos endpoints quedan implementados aunque la skill de Claude.ai aún no se construya. Permiten que, cuando llegue ese momento, no haya que tocar la app: solo construir la skill que los consume.

### 15.7 Diagrama de la arquitectura de ejecución

```
┌─────────────────────┐       ┌─────────────────────┐
│  Mac de Manolo      │       │  GitHub Actions     │
│                     │       │                     │
│  launchd (arranque) │       │  cron 04:00 hora ES │
│  invocación manual  │       │  workflow_dispatch  │
│  desde terminal     │       │  (manual)           │
│         │           │       │         │           │
└─────────┼───────────┘       └─────────┼───────────┘
          │                             │
          └──────────────┬──────────────┘
                         ▼
          ┌─────────────────────────────┐
          │  Firestore (CRM data)       │
          │  • Clientes con metadatos   │
          │  • Cola de pendientes       │
          │  • Bandeja diaria           │
          │  • Histórico de scoring     │
          └─────────────────────────────┘
                         ▲
                         │
          ┌─────────────────────────────┐
          │  CRM Prospector (web UI)    │
          │  • Botones en ficha cliente │
          │  • Bandeja del agente       │
          │  • Cola de cualificación    │
          │  • Botón "Lanzar lote ahora"│
          │                             │
          │  Endpoint /api/*            │
          │  (para futura skill)        │
          └─────────────────────────────┘
```

---

## 16. Eficiencia operativa diaria (REQUISITO)

Esta sección añade tres funcionalidades que cierran el ciclo entre captura de información, reporting y planificación. Su objetivo no es ampliar el alcance del sistema, sino aprovechar la información que el método unificado ya captura y persiste para reducir el tiempo administrativo del usuario.

**Justificación operativa**: el tiempo administrativo actual del usuario es aproximadamente 4,5 horas semanales (2,5 h en captura post-visita, 1 h en reporte semanal, 1 h en planificación). De ese tiempo, una parte significativa se invierte en redactar información que el propio sistema ya tiene o puede recomponer. Las funcionalidades de esta sección reducen ese tiempo a aproximadamente 1,8 horas semanales, recuperando ~2,7 horas por semana.

### 16.1 Captura estructurada post-visita — Dos modalidades

#### Propósito
Convertir la captura post-visita de redacción libre y dispersa a captura estructurada de cinco bloques fijos, manteniendo o mejorando la calidad de la información persistida. El usuario elige en cada visita cuál de las dos modalidades usa según contexto: voz cuando está en ruta y no puede teclear, manual cuando prefiere precisión o no tiene audio disponible.

#### Modalidad A — Por voz (recomendada para uso en ruta)

- **Activación**: botón `Grabar visita` en la ficha del cliente, accesible desde móvil. El usuario lo pulsa al terminar la reunión, idealmente en el coche.
- **Captura**: grabación de audio en el dispositivo móvil (1-5 minutos típicamente). Subida al backend al terminar.
- **Transcripción**: motor de transcripción local (faster-whisper, ya explorado por el usuario) o equivalente. **REQUISITO**: la transcripción debe procesarse sin enviar el audio a servicios externos no controlados, por privacidad de información comercial sensible.
- **Extracción estructurada**: tras la transcripción, un LLM extrae los cinco bloques desde el texto (ver tabla común más abajo).

#### Modalidad B — Manual (formulario directo)

- **Activación**: botón `Escribir visita` en la ficha del cliente, junto al de `Grabar visita`. Útil cuando el usuario prefiere teclear, está en oficina, o ya tiene notas escritas.
- **Captura**: formulario en el CRM con los cinco bloques como campos editables directos (textarea por bloque, con placeholder explicativo de qué se espera en cada uno).
- **Sin transcripción ni LLM**: el usuario rellena los bloques tal cual, el sistema persiste el contenido sin transformación.
- **Compatible con notas pegadas**: el usuario puede pegar notas tomadas en otro sitio y el sistema las acepta, siempre que respeten la estructura de cinco bloques.

#### Estructura común de los cinco bloques (ambas modalidades)

| Bloque | Contenido |
|---|---|
| `interlocutor` | Nombre, cargo, rol detectado en la reunión |
| `temas_tratados` | 3-5 puntos clave discutidos (no transcripción literal; síntesis) |
| `compromisos` | Lista de compromisos asumidos por ambas partes, con fecha si se mencionó |
| `proximo_paso` | Qué hay que hacer, cuándo, quién lo dispara |
| `señales` | Proyectos mencionados, cambios estructurales, oportunidades, riesgos |

#### Persistencia y comportamiento posterior (ambas modalidades)

- **Persistencia**: cada bloque se guarda en la ficha del cliente como entrada nueva del historial, con `fecha`, `fuente_tipo: "visita_presencial"`, `nivel_confianza: "verificado_humano"` (la información viene directamente del usuario, independientemente de la modalidad).
- **Marca de modalidad**: el objeto persistido incluye `modalidad: "voz" | "manual"` para trazabilidad.
- **Disparo de actualizaciones**: el sistema detecta automáticamente que ciertos campos del cliente deben actualizarse (nuevo interlocutor, nuevo proyecto, cambio de tamaño) y los propone al usuario para confirmación.
- **Edición posterior**: el usuario puede editar cualquier bloque desde la ficha del cliente, independientemente de la modalidad con la que se capturó originalmente.

#### Output
Un objeto `RegistroVisita` persistido en la ficha del cliente:

```json
{
  "id_visita": "...",
  "id_cliente": "...",
  "fecha_visita": "2026-05-19T11:30:00Z",
  "modalidad": "voz",
  "duracion_audio_seg": 180,
  "transcripcion_completa": "...",
  "interlocutor": {...},
  "temas_tratados": [...],
  "compromisos": [...],
  "proximo_paso": {...},
  "señales": [...],
  "actualizaciones_propuestas": [...]
}
```

En modalidad manual, los campos `duracion_audio_seg` y `transcripcion_completa` se omiten o se ponen a `null`.

### 16.2 Generador automático de reporte semanal

#### Propósito
Producir un borrador del reporte semanal que el usuario envía a su jefe los viernes, a partir de la información ya capturada durante la semana, reduciendo el tiempo de redacción a una revisión.

#### Comportamiento

- **Activación**: endpoint `POST /api/reporte-semanal` con parámetros `{fecha_inicio, fecha_fin}` o disparo automático cada viernes a las 09:00 hora peninsular.
- **Agregación**: el sistema recopila de la semana indicada:
  - Visitas realizadas (de los `RegistroVisita` capturados).
  - Compromisos asumidos y pendientes.
  - Cambios de cuadrante detectados.
  - Alertas activas (discrepancias, datos obsoletos).
  - Candidatos nuevos descubiertos.
  - Métricas agregadas: número de visitas, distribución geográfica, distribución por tipo de cliente, distribución por cuadrante.
- **Síntesis narrativa**: un LLM produce un borrador estructurado en el formato habitual del reporte del usuario. **REQUISITO**: la estructura del reporte debe ser configurable (plantilla personalizable) porque cada jefe tiene preferencias distintas.
- **Output**: documento editable (markdown, Word, o ambos) que el usuario abre, ajusta con contexto cualitativo propio y envía.

#### Estructura propuesta del reporte (configurable)

```
RESUMEN DE LA SEMANA
- Visitas realizadas: X (de las cuales: Y prioritarias cuadrantes 1-4)
- Distribución geográfica
- Highlights cualitativos (este bloque lo añade el usuario)

VISITAS DESTACADAS
- Por cada visita 1-4: cliente, interlocutor, temas, compromisos

PROYECTOS DETECTADOS Y OPORTUNIDADES
- Síntesis de señales relevantes capturadas

PENDIENTES Y PRÓXIMOS PASOS
- Compromisos vivos, próximas visitas previstas

ALERTAS Y DECISIONES QUE REQUIEREN EQUIPO
- Bloqueos, casos que necesitan input del jefe o del comercial directo
```

### 16.3 Vista "Planificación de la semana"

#### Propósito
Reducir el tiempo de planificación semanal de aproximadamente 1 hora a 20-30 minutos, partiendo de información ya organizada en lugar de reconstruirla desde memoria y dispersión.

#### Timing — Una semana de adelanto (REQUISITO)

La vista debe abrir **por defecto con la semana siguiente (N+1)** seleccionada, no con la semana en curso. El usuario el lunes planifica la semana siguiente, no la semana que empieza al día siguiente, porque agendar visitas con prescriptores requiere días de antelación (llamar, confirmar agenda, preparar briefings).

- `plan-fecha-inicio` = próximo lunes posterior a hoy.
- `plan-fecha-fin` = ese lunes + 4 días (viernes de esa semana).
- Si hoy es lunes, `plan-fecha-inicio` = lunes de la semana siguiente (no hoy).

El usuario puede manualmente cambiar a la semana actual o a semanas más lejanas, pero el comportamiento por defecto es N+1.

#### Comportamiento

- **Activación**: nueva vista en el CRM accesible desde el menú principal, optimizada para uso los lunes (también disponible cualquier día).
- **Contenido**: presenta cuatro bloques que el usuario combina para decidir su semana:

1. **Citas comprometidas**: visitas ya agendadas con cliente y fecha confirmada.
2. **Prioritarios sin contacto reciente**: clientes en cuadrantes 1-4 que llevan >N semanas sin visita o llamada (umbral configurable; por defecto 12 semanas para cuadrante 1, 16 semanas para 2-4).
3. **Bandeja del agente**: pendientes acumulados (cambios de cuadrante, discrepancias, candidatos nuevos descubiertos).
4. **Ruta sugerida**: si el usuario marca una zona objetivo para la semana, el sistema propone agrupación geográfica óptima de clientes elegibles.

- **Acción del usuario**: el usuario va marcando/descartando candidatos hasta cerrar su semana. La vista persiste el plan resultante en el CRM como `plan_semanal` para referencia futura y comparación con lo realmente ejecutado.

#### Output

Un objeto `PlanSemanal` persistido con la semana planificada:

```json
{
  "semana_iso": "2026-W21",
  "dias_oficina_planificados": ["lunes", "viernes"],
  "dias_viaje_planificados": ["martes", "miércoles", "jueves"],
  "visitas_planificadas": [
    {"id_cliente": "...", "fecha_prevista": "...", "objetivo": "...", "tipo": "comprometida|prioritaria|oportunidad"}
  ],
  "zona_objetivo": "Almería, Murcia",
  "notas": "..."
}
```

### 16.4 Integración entre las tres funcionalidades

Las tres funcionalidades operan como un ciclo cerrado:

```
Lunes:    Planificación de la semana (§16.3)
              ↓
M/M/J:    Visitas → Captura post-visita por voz (§16.1)
              ↓
Viernes:  Reporte semanal autogenerado (§16.2) + envío al jefe
              ↓
Lunes:    Planificación de la semana siguiente, alimentada por
          lo capturado y comprometido la semana anterior
```

### 16.5 Posición en el plan de implementación

Estas tres funcionalidades **no son críticas para que el sistema funcione**, pero son las que más impacto tienen en el tiempo recuperado del usuario. Por orden de implementación recomendado:

- **§16.3 (Planificación de la semana)**: encaja naturalmente con la Fase D (Matriz 3×3 + bandeja del agente). Reutiliza la mayoría de los datos ya disponibles tras esa fase.
- **§16.2 (Reporte semanal automático)**: encaja naturalmente con la Fase F (Modo briefing) porque comparte motor de síntesis narrativa.
- **§16.1 (Captura post-visita por voz)**: es la más exigente técnicamente (transcripción local, extracción estructurada, integración móvil) y aporta más valor cuando el resto del ciclo ya está cerrado. Puede tratarse como **Fase I (nueva)**, posterior a la retirada del scoring antiguo.

### 16.6 Privacidad y control del usuario

**REQUISITO**: para las tres funcionalidades aplican los siguientes principios:

- Toda la información capturada y procesada sigue el modelo de metadatos definido en §4. Cada dato lleva su trazabilidad.
- La transcripción de audio se procesa localmente o en infraestructura controlada por el usuario; no se envía a servicios externos no auditables.
- El usuario puede editar, borrar o invalidar cualquier registro generado automáticamente. La automatización propone, no impone.
- Los reportes generados son borradores; el envío al destinatario final es siempre acción explícita del usuario.

---

## 17. Límites honestos — Lo que el sistema NO hace

- **No accede a bases de datos premium** (Iberinform, Informa Premium, Axesor Premium). Decisión deliberada.
- **No verifica solvencia financiera real** (cuentas anuales detalladas, deudas, concursos). Requeriría suscripción.
- **No reemplaza la verificación humana en visita**. Es base de partida.
- **No detecta cambios de propiedad** salvo que aparezcan en BORME o prensa.
- **No identifica con certeza al interlocutor adecuado** salvo que figure públicamente con cargo. Lo confirma Manolo en primera llamada.
- **No incluye la skill de Claude.ai todavía**: este documento define la APP determinista y el agente con sus modalidades de ejecución. La skill que consume los endpoints `/api/*` es fase posterior.

---

---

## 18. Adendas — Log de decisiones (18 de mayo de 2026)

Tras revisión del diagnóstico de cobertura de Claude Code, se toman las siguientes cuatro decisiones que actualizan el documento. Las modificaciones derivadas ya están aplicadas en las secciones correspondientes; este apartado las recopila para trazabilidad.

### Decisión 1 — Caso Hyfotec y cliente puente

**Resuelto**: introducir el concepto de **cliente puente** (`es_cliente_puente: boolean`) que permite a perfiles tipo Hyfotec puntuar Medio en Valor Directo (no Bajo) mediante bonus en D1 y D5, cayendo así en cuadrante ④ Puerta de entrada en lugar de ⑦ Conector. Detalle completo en §7.2.1.

**Implicación**: la matriz 3×3 se mantiene tal cual. Lo que cambia es cómo se puntúa en el Eje 1 cuando se detecta perfil de puente.

### Decisión 2 — Spec formal en el repo

**Resuelto**: este documento (`metodo_unificado_busqueda_CRM_Prospector_v1.1.md`) debe vivir en `/docs/` del repositorio del CRM. Sin presencia en el repo, las implementaciones se hacen sin contrato formal.

**Acción inmediata**: el usuario sube el archivo a `/docs/` con commit y push. A partir de ese momento, Claude Code lo lee como fuente única de verdad.

### Decisión 3 — Captura post-visita con doble modalidad

**Resuelto**: la fase I no es "captura por voz" sino "captura estructurada con dos modalidades". Modalidad A por voz (transcripción local + extracción LLM) y modalidad B manual (formulario con los cinco bloques editables). Mismo output estructurado en ambas. Detalle completo en §16.1.

**Implicación**: la UI debe ofrecer dos botones en la ficha del cliente (`Grabar visita` y `Escribir visita`). El objeto `RegistroVisita` incluye `modalidad: "voz" | "manual"` para trazabilidad.

### Decisión 4 — Multi-motor de búsqueda obligatorio

**Resuelto**: la Capa 1 del método unificado pasa de recomendar dos motores a **requerirlos**, con estrategia de failover automática cuando el motor principal falla, supera cuota o devuelve ≤2 resultados relevantes. Detalle en §5 Capa 1.

**Implicación**: la implementación actual con motor único (DuckDuckGo vía GAS) es desviación que hay que corregir. Conviene añadir Brave Search o equivalente como secundario.

---

### Plan de implementación actualizado tras decisiones

Las fases del §14 se reordenan según prioridad operativa derivada del diagnóstico de cobertura. Quick wins primero, después desbloqueo del agente, después UI accionable, después Fase I al final.

| Bloque | Contenido | Estimación |
|---|---|---|
| **0. Quick wins** | Subir spec a `/docs/`, fix planificador N+1, cron diario, añadir `procesandose_por` al checkpoint | Medio día |
| **1. Cliente puente (D1)** | Añadir atributo `es_cliente_puente`, detección automática, bonus en D1/D5, recálculo masivo del scoring v2 | 1 día |
| **2. Endpoint nocturno (Fase E)** | Endpoint server-side, secrets, descomentar workflow, testing end-to-end | 1-3 días |
| **3. UI Fase D consolidación** | Filtro de cuadrante en listado, chip ↑↓ delta, matriz 3×3 interactiva, bandeja del agente | 1-2 días |
| **4. Multi-motor (D4)** | Segundo motor (Brave o equivalente), estrategia de failover, sin duplicar llamadas con éxito | 1 día |
| **5. Migración legacy** | Script de envoltura de strings legacy en objetos con `nivel_confianza: legacy`, ejecución masiva | 2-4 h |
| **6. Reporte semanal y planificador (F + G)** | Vista propia de reporte, ya planificador con N+1 | 1 día |
| **7. Fase I dual** | Modal con dos botones (`Grabar` / `Escribir`), implementación de cada modalidad, persistencia común | 2-3 días |

---

*Adenda generada el 18 de mayo de 2026 tras diagnóstico de cobertura. Las decisiones aquí registradas tienen prioridad sobre cualquier interpretación previa de las secciones afectadas.*

