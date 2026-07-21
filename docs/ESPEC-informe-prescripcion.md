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

## Instrucciones siguientes

*(pendientes — Manolo las irá dictando)*

### Instrucción 3 · …

---

## Registro

| Fecha | Cambio |
|---|---|
| 2026-07-20 | Documento creado. Instrucción 1 (scout) recogida y verificada. |
| 2026-07-20 | Instrucción 2: procedencia de las fichas + documentar la ingesta. Diagnóstico hecho. |
