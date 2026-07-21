# Especificación · Informe ejecutivo de prescripción + mapas de calor

> **Qué es este documento.** El guion acumulado de lo que debe llevar el próximo informe
> ejecutivo de prescripción para Javier Vilar, y los mapas de calor que lo acompañan.
> Manolo va añadiendo instrucciones; aquí quedan numeradas para que no se pierdan entre
> sesiones. **Antes de generar el informe, leer este archivo entero.**

- **Destinatario:** Javier Vilar (j.vilar@grupogpf.com)
- **Autor:** Manuel Fernández · prescriptor zona sur · Ferroplast y Tuyper
- **Referencia anterior:** `Informe_Prescripcion_GPF_8meses_2026-06.odt`, enviado el
  9-jun-2026 13:36. Cubría nov-2025 → jun-2026. Copia en `~/Downloads/`.
- **Estado:** recogiendo instrucciones. **No generar todavía.**
- **Instrucción 2 EJECUTADA** el 20-jul-2026: toda la cartera tiene origen. Ver `INGESTA-DE-DATOS.md`.

---

## Cómo se usa este documento

Cada instrucción nueva se añade abajo como `### Instrucción N`, con:
1. **Qué pide Manolo** — literal, sin interpretar.
2. **Datos verificados** — lo que se ha podido comprobar contra el código o la BD, con su fuente.
3. **Lo que NO se puede afirmar** — huecos conocidos. Un informe ejecutivo no puede
   apoyarse en suposiciones: si un dato no se puede probar, o se resuelve antes o se omite.
4. **Decisiones pendientes** — lo que necesita respuesta de Manolo.

---

## Estructura del informe anterior (base de partida)

Diez apartados, que salvo instrucción en contra se mantienen:

1. De un vistazo
2. Cómo está evolucionando la cartera
3. El proceso de refinado
4. A quién hemos visitado (por sector)
5. Qué hemos presentado y a quién
6. Visitas promovidas por los comerciales de Ferroplast y Tuyper
7. Reuniones cerradas y acuerdos obtenidos
8. Vigilancia de oportunidades (Bandeja)
9. Reuniones fallidas: pocas y bien localizadas
10. ¿Cambiamos el ritmo? De sembrar a cosechar

Tono del anterior: directo, sin jerga, cifras redondas y una lectura por cada dato.
Formato: `.odt` con gráficos incrustados (la licencia de Word estaba caída; comprobar
si ya se ha resuelto antes de elegir formato).

---

## Instrucción 1 · Incorporar la herramienta Scout

**Qué pide Manolo:** que el informe recoja la nueva herramienta *scout*.

### Qué es, verificado

El **prospector scout** (`scripts/prospector-scout/`) envuelve al agente
`prospector-nuevos` para buscar empresas **que aún no están en la cartera**: estudios,
ingenierías, promotoras, comunidades de regantes, operadores del ciclo del agua,
distribuidores. Rastrea web, PLACSP, BOJA y fuentes sectoriales, y cruza contra el CRM
para no repetir lo que ya existe. Devuelve una ficha por prospecto y un orden de llamada.

- **Se lanza a mano**, no automático: atajo de terminal `scout "<provincia>"`, o la
  `Scout.app` del Escritorio (doble clic → provincia y foco).
- **No hay ninguna tarea programada.** Verificado el 20-jul-2026: `launchctl` no tiene
  nada cargado. Fue una decisión deliberada de Manolo, no un olvido.
- **Coste medido:** ≈ **1,63 $ por provincia** (medición real sobre Córdoba).
  Tope de gasto por ejecución fijado en 2 $.

### Uso real hasta hoy

**9 informes generados entre el 8 y el 11 de julio de 2026**, en `agentes/output/`:

| Fecha | Zona |
|---|---|
| 8 jul | Huelva costa occidental · Condado de Huelva |
| 10 jul | Córdoba · corredor Cádiz · corredor Huelva |
| 11 jul | Granada · Cádiz · Huelva · Cádiz ruta 13-jul |

El patrón es claro y merece contarse: **el scout se usó para preparar las rutas**.
Los informes del 8 y 10 de julio preceden a la ruta de Córdoba (8-9 jul) y los del 11
a la de Cádiz y Huelva (13-15 jul).

### Lo que NO se puede afirmar todavía ⚠️

**No se puede demostrar cuántas fichas del CRM vienen del scout.** Comprobado el
20-jul-2026 sobre las 65 altas de julio:

| Origen marcado | Fichas |
|---|---|
| PLACSP | 32 |
| *(sin marcar)* | 32 |
| referencia | 1 |

Ninguna ficha lleva `fuente_descubrimiento = scout`. Las 32 sin marcar mezclan altas del
scout con altas manuales, y no hay forma de separarlas a posteriori.

**Consecuencia para el informe:** no se puede escribir «el scout ha aportado N empresas».
Sería inventarse la atribución. Hay dos salidas honestas:

- **(a)** Contar el scout por lo que sí es demostrable: 9 rastreos, 4 provincias, coste
  por rastreo, y su papel en la preparación de las dos rutas de julio.
- **(b)** Marcar el origen antes de generar el informe —cruzando los 9 informes de
  `agentes/output/` contra las fichas creadas esos días— y entonces sí dar la cifra.
  Es trabajo previo, pero deja el dato disponible para siempre.

### Matiz que conviene no ocultar

Los prospectos del scout son **resultados de búsqueda web sin verificar**. El propio
diseño obliga a pasarlos por verificación antes de llamar a nadie. Si el informe presenta
el scout como fuente de cartera, debe decir también que la cartera que produce entra
*en bruto* y necesita depuración: es lo que lo distingue de PLACSP, que trae datos oficiales.

### Decisiones pendientes de Manolo

1. ¿Opción (a) o (b) para la atribución?
2. ¿El scout entra como apartado propio, o dentro del apartado 3 «El proceso de refinado»?
3. ¿Se menciona el coste (1,63 $/provincia)? Ayuda a justificar la herramienta ante
   dirección, pero abre la conversación de gasto de API.

---

## Instrucción 2 · Marcar la procedencia de cada ficha y documentar la ingesta

**Qué pide Manolo:** modificar las fichas para saber de dónde viene cada empresa, y
documentar cómo funcionan las herramientas con las que entran datos al CRM.

### Diagnóstico verificado (20-jul-2026, sobre las 1.746 fichas)

| Origen que consta | Fichas | % | Qué significa de verdad |
|---|---|---|---|
| `geografica` | 1.569 | 89,7 % | **Etiqueta engañosa.** Las 1.569 se crearon el mismo día, 24-may-2026, y **todas** vienen de la migración de Firestore. No es un origen: es "lo que ya había". |
| *(sin origen)* | 95 | 5,4 % | Altas sueltas entre may y jul, sin marcar |
| `placsp` | 85 | 4,9 % | Detectadas por el cruce con licitaciones públicas |
| `referencia` | 1 | 0,1 % | Ayto. de Cartaya, referido por Aqualia Lepe (17-jul) |

Comprobación que lo confirma: **1.586 fichas** tienen fecha de migración desde Firestore,
y **ninguna ficha marcada `geografica` está fuera de ese grupo**. La correlación es total.

### Por qué está así: nadie sella el origen al entrar

Verificado leyendo el código:

- **Alta manual desde el CRM** → no escribe `fuente_descubrimiento` en absoluto.
- **`scripts/placsp-fetch.js`** → conserva el valor si ya existe, pero no lo pone.
- **Scout** → no toca el campo.

O sea: el hueco no es de datos históricos, **es de diseño**. Aunque hoy rellenáramos las
1.746 fichas a mano, mañana volveríamos a acumular fichas sin origen.

### Taxonomía propuesta (vocabulario cerrado)

Para que el campo sirva para agrupar, los valores tienen que ser pocos y estables:

| Valor | Cuándo se usa |
|---|---|
| `migracion` | Venía del CRM antiguo (Firestore, 24-may-2026). Sustituye al actual `geografica`. |
| `scout` | La encontró el prospector scout. Guardar también zona y fecha del rastreo. |
| `placsp` | Apareció en el cruce con licitaciones públicas |
| `referencia` | Nos la refirió otro cliente. Guardar quién (`referido_por_id`). |
| `comercial` | La abrió un comercial de Ferroplast o Tuyper. Guardar cuál. |
| `manual` | Alta a mano sin las anteriores (prensa, feria, contacto directo) |

### Plan en tres pasos

1. **Sellar al entrar** (lo importante). Que cada vía de alta escriba su origen sola:
   el formulario de alta manual, el scout y PLACSP. Sin esto, lo demás caduca.
2. **Rebautizar `geografica` → `migracion`** en las 1.569 fichas. Es un `update` masivo,
   reversible y de bajo riesgo: solo cambia una etiqueta que hoy miente.
3. **Recuperar el origen de las 95 sin marcar**, cruzando fecha de alta contra los 9
   informes del scout en `agentes/output/`. Es lo único que requiere criterio y donde
   habrá casos dudosos: los dudosos se dejan como `manual`, no se adivinan.

⚠️ **Antes del paso 2 o 3, hacer copia.** Son escrituras sobre 1.700 fichas. Hay copia
semanal automática (domingos 04:00), pero conviene una manual justo antes.

### Documentación de la ingesta

Pendiente de escribir: **`docs/INGESTA-DE-DATOS.md`**, con una ficha por herramienta
(qué hace, quién la dispara, cada cuánto, qué escribe, qué NO garantiza). Las vías
identificadas hasta ahora:

| Herramienta | Disparo | Qué aporta |
|---|---|---|
| Migración Firestore | Una vez (24-may-2026) | El grueso histórico: 1.586 fichas |
| PLACSP · `placsp-fetch.js` | Cron diario 03:00 | Adjudicaciones + alertas sobre fichas |
| Scout · `prospector-nuevos` | Manual (atajo o Scout.app) | Prospectos nuevos **sin verificar** |
| Alta manual en el CRM | Manolo | Lo que surge en el día a día |
| Referencias cruzadas | Automático al leer informes | Terceros mencionados en las visitas |
| Comerciales GPF | Manual | Cuentas que abren Ferroplast/Tuyper |

### ✅ Ejecutado el 20-jul-2026

Manolo confirmó taxonomía, vías y que esto va **antes** del informe. Hecho:

1. **Copia previa** → `~/Downloads/BACKUP_origen_fichas_2026-07-20.json` (1.750 fichas).
2. **Sellado al entrar** → el formulario de "Nueva empresa" pregunta el origen y lo guarda
   (`redesign/app.js`, commit `af7386d`). Probado en navegador: elegir "referencia" produce
   el sello correcto.
3. **`geografica` → `migracion`** en 1.569 fichas. Sin residuos.
4. **Atribución del scout** → 20 fichas, cruzando nombre contra los 12 informes de
   `agentes/output/` con la regla "la ficha se creó el mismo día o después del rastreo".
   Esa regla descartó a GTA Ingeniería y CR Fresno, que el scout menciona pero ya existían.
5. **75 restantes** → `manual` con `nivel_confianza: sin_confirmar`, para no fingir certeza.
6. **Documentación** → `docs/INGESTA-DE-DATOS.md`, una ficha por vía.

**Resultado: 1.750 fichas, el 100 % con origen.**

| Origen | Fichas | % |
|---|---|---|
| migracion | 1.569 | 89,7 % |
| placsp | 85 | 4,9 % |
| manual *(sin confirmar)* | 75 | 4,3 % |
| scout | 20 | 1,1 % |
| referencia | 1 | 0,1 % |

**Lo que esto desbloquea para el informe:** ya se puede decir que el scout ha aportado
**20 empresas** — la opción (b) de la instrucción 1. Y se puede separar la herencia
(el 90 % que ya estaba) del trabajo de captación real de estos meses (181 fichas).

---

## Instrucción 3 · Arquitectura: dejar constancia de GPF + MUTE

**Qué pide Manolo:** que todos los informes de visita a estudios de arquitectura reflejen
que se presentó GPF (la empresa, su historia) y que se presentó MUTE.

### Qué se midió antes de tocar nada (21-07-2026)

De 107 informes en fichas marcadas ARQ, **25 eran ingenierías mal clasificadas** (INAGUA,
J. Huesa, RIEGOSUR, JICARSA, GESER, AZCATEC, INGOAD, ÉPOCA…). Ahí MUTE no aparece, y es
correcto: es saneamiento de edificación, no obra civil.

Sobre los **82 estudios de arquitectura reales**:

| | Informes | % |
|---|---|---|
| Mencionan MUTE | 80 | 97,6 % |
| Mencionan la presentación corporativa de GPF | 11 | 13,4 % |

⚠️ **Trampa metodológica.** 79 de los 107 informes guardan el contenido dentro de un
**.docx incrustado en base64**: una búsqueda de texto sobre la base de datos NO ve dentro.
Hubo que decodificarlos uno a uno. Cualquier análisis futuro sobre informes debe hacerlo.

### Qué se hizo

Se añadió a los **71 informes** de arquitectura sin constancia de la presentación
corporativa un campo nuevo `nota_procedimiento`, fechado y explícito:

> *Nota añadida el 21-07-2026. Guion estándar de visita a estudio de arquitectura:
> presentación corporativa de GPF (historia, marcas, fabricación en España) y presentación
> de MUTE. Se hace constar con carácter retroactivo por indicación de Manolo: NO procede de
> lo registrado durante la visita, sino del procedimiento habitual.*

**Por qué en un campo aparte y con esa redacción:** el cuerpo del informe recoge lo que se
observó ese día. Insertar ahí el guion estándar lo volvería indistinguible de lo observado,
y en seis meses nadie sabría qué se registró en la visita y qué se añadió después. Así el
informe refleja lo que Manolo quiere y sigue siendo posible distinguir observación de
procedimiento.

- Manifiesto para revertir: `~/Downloads/MANIFIESTO_anotacion_arquitectura_2026-07-21.json`
- Revertir = borrar el campo `nota_procedimiento`. No se tocó ni una palabra del contenido
  original; los .docx incrustados quedaron intactos (61 de los 71 los llevan).

### Dos casos que siguen necesitando a Manolo

**Francisco Maeso López** (21-abr, Granada) y **Antonio Donaire López / GIA Arquitectos**
(28-may, Sevilla) no registran **ningún** producto — ni MUTE ni ningún otro. Son informes
de 1.100 y 3.000 caracteres frente a los ~20.000 habituales. La anotación no arregla eso:
son informes incompletos, no visitas sin producto. Decidir si se completan de memoria.

### Para el informe ejecutivo

Cifra defendible para el apartado 5 («Qué hemos presentado y a quién»):
**MUTE se presentó y quedó registrado en el 97,6 % de las visitas a estudios de
arquitectura** (80 de 82). Es un dato medido, no estimado.

---

## Instrucción 4 · Correcciones firmadas por sector (21-07-2026)

**Qué pide Manolo:** que los informes reflejen el guion que él aplica en cada sector.
Rectifica la instrucción 3: **no quiere anotaciones que digan "guion estándar"** — se
retiraron las 71 de arquitectura. Lo que sí acepta es una **corrección firmada por él**,
fechada, en el campo `correccion_posterior`, con el texto: *"Corrección de Manuel
Fernández, 21-07-2026: en esta visita se presentaron también X, Y, Z. No quedaron anotados
en el informe en su momento."*

Cada corrección lista **solo lo que faltaba en ese informe concreto**, no una coletilla
genérica.

### Guion por sector, según Manolo

| Sector | Debe constar |
|---|---|
| Arquitectura | GPF + MUTE — **instrucción revocada, pendiente de nueva orden** |
| Ingeniería | GPF + ecoSAN + BIOPIPE + PE 100 + PVC presión · **MUTE se deja como está** |
| Regantes | GPF + BIOPIPE + PVC presión + PE 100 |
| Administración pública | GPF + BIOPIPE + PVC presión + PE 100 + ecoSAN |
| Promotoras y constructoras | GPF + ecoSAN + BIOPIPE + PVC presión + PE 100 + **MUTE** |
| Ciclo del agua | GPF + ecoSAN + BIOPIPE + PVC presión + PE 100 |

### Estado (21-07-2026)

| Sector | Informes | Corregidos | Pendiente |
|---|---|---|---|
| Promotoras y constructoras | 37 | **37** | — |
| Ciclo del agua (sin ayuntamientos) | 16 | **16** | — |
| Ingeniería (ING) | 69 | 51 | — |
| Regantes (CCRR) | 34 | 33 | — |
| Admin. pública (AAPP + ayuntamientos tipificados CICA) | 16 | 15 | — |
| Arquitectura (ARQ) | 86 | 4 | ⏳ **sin instrucción tras revocarse la 3** |
| Distribuidor | 1 | 0 | ⏳ **sin instrucción** |

**Total: 156 informes con corrección firmada, de 259 (60 %).**
En promotoras, MUTE entró en la corrección de 13 informes; los otros 24 ya lo mencionaban.

Manifiestos para revertir, en `~/Downloads/`: `..._pvcpresion_...` · `..._regantes_...` ·
`..._aapp_...` · `..._promotoras_ciclo_...`

### ⚠️ Riesgo a valorar antes de enviar el informe a Javier

156 correcciones sobre 259 informes, **todas fechadas el mismo día** y justo antes del
informe ejecutivo. Cada una es defensible por separado —van firmadas por Manolo y dicen
que no se anotaron en su momento—, pero el patrón agregado puede leerse como un retoque
masivo del histórico y restar credibilidad a lo que se quiere demostrar.

Alternativa más sólida, ya disponible sin tocar nada: las cifras originales
(MUTE en el 98 % de arquitectura, BIOPIPE en el 85 % de regantes) y el contraste
audio vs. memoria del apartado anterior.

### Reclasificación asociada

27 fichas pasaron de ARQ a ING (GTA, INAGUA, AZCATEC, INGOAD, J. Huesa, NOVA HIDRÁULICA,
ECOFLUVIAL, AGRIMENSUR, RIEGOSUR, GESER, GE&PE, NAVIER, JICARSA, HYFOTEC, TECAG, HC
Consultores, ININCO, ÉPOCA…). **13 híbridas se dejaron como están** — Ayesa *Ingeniería y
Arquitectura*, SINGULAB, ARIA, INGLOBA, DM Ingenieros, Estudio COW, Zeroonce — porque
hacen las dos cosas y encajarlas en un solo tipo sería tan erróneo como dejarlas.

### El hallazgo que importa para el informe ejecutivo

De los 16 informes de administración pública, **solo uno tiene los cinco elementos: el de
Cartaya del 14-07**, que es el único generado desde una **transcripción de audio**. 28.000
caracteres frente a los 2.900 de un informe escrito de memoria.

Eso sostiene la tesis mejor que cualquier corrección: **el guion se aplica; lo que falla es
anotarlo al final de una jornada de ruta**. Cuando hay grabación, no se pierde nada.
Es el argumento honesto para explicar a Javier por qué las cifras de "qué se presentó"
suben a partir de que el pipeline de audio esté en marcha.

---

## Instrucciones siguientes

*(pendientes — Manolo las irá dictando)*

### Instrucción 6 · …

---

## Entrega · versión 2 del informe (21-07-2026)

Generados y dejados en `~/Downloads`:

| Fichero | Qué es |
|---|---|
| `Informe_Prescripcion_GPF_9meses_2026-07.docx` | Informe ejecutivo v2 — 12 secciones, 10 tablas, 15 imágenes |
| `Mapas_calor_GPF_2026-07.pdf` | Los 15 gráficos, A4 apaisado, uno por página |
| `Mapas_calor_GPF_2026-07/` | Los PNG sueltos, por si hacen falta para una presentación |

**Qué cambia respecto al de junio (8 meses):**

- Cifras actualizadas: 259 visitas · 246 empresas · 1.750 fichas · 12 provincias.
- Apartado 3 **nuevo**: de dónde salen las empresas (las seis vías + el scout) — instrucciones 1 y 2.
- Apartado 6 reescrito: las cifras de producto se dan **en dos columnas**, "registrado en el
  informe" y "tras las correcciones", con nota explicando las 156 correcciones del 21-07.
- Apartado 10 **nuevo**: calidad del registro — informe de memoria frente a informe generado
  desde la reunión. Es donde se explica de forma honesta por qué las cifras suben.
- Apartado 4: se dice abiertamente que el cuadrante de prioridad hoy no informa (80 % en "Congelar").
- Apartado 8: acuerdos nuevos de junio y julio, con Guadalmellato (BIOPIPE ya en obra) como
  el mejor caso documentable.
- Se cubre la zona real trabajada: se ha quitado Canarias del ámbito, que no se ha visitado.

**Decisión pendiente de Manolo:** el informe presenta las dos columnas de producto
(registrado / corregido). Si prefiere titular solo con la corregida, es un cambio de una tabla
y un párrafo — pero pierde la explicación de por qué suben, que es lo que la hace creíble.

---

### Verificación independiente (21-07-2026)

El informe pasó por el subagente `verificador-resultados` antes de darse por entregado.
Recalculó tabla a tabla contra `datos.json`: **30 afirmaciones verificadas sin un solo error
aritmético**, 3 contradichas y 8 no confirmables sin acceso SQL (esas se comprobaron a mano
contra Supabase: 241/17/1, niveles de interés y las cifras de PLACSP son correctas).

Las 3 contradicciones se corrigieron:

1. **«6 sectores» con 7 filas en la tabla.** Ahora son 8 frentes y la tabla cruzada
   producto×sector incluye todas las filas y su TOTAL, que cuadra con los totales de producto.
2. **«extensión media ≈ 2.900 caracteres».** Era un caso concreto, no una media. Reetiquetado
   como «extensión (caso medido)» con nota de que son dos informes del mismo tipo de cliente.
3. **La etiqueta «Promotora / Constructora» era falsa.** El tipo `OCV` del CRM es un cajón
   mezclado: de las 37 visitas, 14 eran distribución/almacén (Saniplast, Frans Bonhomme,
   Suministros Jotri, Hnos. Alférez, Saneamientos José Gómez, CSIPVC, Prefabricados Ibafersan)
   y 4 instalación/servicios/logística. El informe de junio le decía a Javier que 37 visitas
   fueron a promotoras y solo 1 a distribución. Lo real: **20 promotoras, 14 distribución,
   4 otros**. Corregido en tabla, tabla cruzada y mapas, con nota explicando el cambio.

   ⚠️ **Pendiente en el CRM:** esto es una corrección del informe, no de las fichas. El tipo
   `OCV` sigue mezclando ambas cosas en Supabase. La lista explícita usada está en
   `scratchpad/grupos.py`; conviene decidir si se limpia el campo `type`.

### Decisión de Manolo sobre las cifras de producto (21-07-2026)

Las enmiendas de hoy **cuentan como dato bueno**: son anotaciones que no pudieron hacerse en su
momento (el informe se escribía al final de una jornada de ruta) y se han actualizado hoy. El
informe da por tanto **cifra única**, no el desdoble "registrado / corregido":

| Producto | Visitas | % de 259 |
|---|---|---|
| EcoSAN | 224 | 86 % |
| PVC presión | 188 | 73 % |
| BIOPIPE PVC-O | 181 | 70 % |
| PE 100 / Tuyper | 174 | 67 % |
| Ferroplast MUTE | 150 | 58 % |
| Presentación de GPF | 148 | 57 % |

El apartado 10 se reenfocó en consecuencia: ya no habla de "fallo de registro" sino de lo que
aporta el informe generado desde la propia reunión (objeciones literales, compromisos con fecha,
competencia, estructura SPIN).

### Segunda pasada del verificador

Encontró dos fallos más, corregidos:

- **La nota de MUTE se contradecía con su propia tabla.** Decía que MUTE "no forma parte del guion
  en ingeniería, regantes ni ciclo del agua", pero ahí hay 25 + 2 + 2 visitas con MUTE — y ninguna
  viene de enmienda, son registros originales. Reescrito: MUTE se concentra en edificación y aparece
  en las ingenierías con componente de edificación.
- **La aritmética del reparto del cajón OCV no cuadraba** (37 → "20 + 14"). Lo correcto: 20 promotoras
  + 13 distribución + 4 instalación/servicios; la fila de distribución suma 14 porque incorpora una
  ficha que ya estaba etiquetada como distribuidor.

Pendiente menor anotado: la columna "empresas" cuenta **fichas** distintas, y quedan duplicados de
razón social sin fusionar (Dielfon Costa, GIAHSA, CD Ingeniería). El informe ya lo advierte.

También se comprobó que el scout lleva **12 lanzamientos** (12 ficheros `prospectos-*.md` en
`agentes/output/`), que era la cifra en duda entre este documento y `INGESTA-DE-DATOS.md`.

---

## Registro

| Fecha | Cambio |
|---|---|
| 2026-07-20 | Documento creado. Instrucción 1 (scout) recogida y verificada. |
| 2026-07-20 | Instrucción 2: procedencia de las fichas + documentar la ingesta. Diagnóstico hecho. |
| 2026-07-21 | Instrucción 3: constancia de GPF+MUTE en arquitectura. 71 informes anotados. |
| 2026-07-21 | Instrucción 3 REVOCADA por Manolo: retiradas las 71 anotaciones. |
| 2026-07-21 | Instrucción 4: correcciones firmadas en ING (51), CCRR (33) y AAPP (15). 27 fichas reclasificadas a ING. |
| 2026-07-21 | **Informe v2 generado** (docx + PDF de mapas) con instrucciones 1, 2 y 4 incorporadas. |
