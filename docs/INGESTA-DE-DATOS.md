# Cómo entran las empresas al CRM

> Las seis vías por las que una empresa acaba siendo una ficha, qué garantiza cada una y
> qué no. Actualizado el 20-jul-2026, leído del código, no de memoria.

**Regla común desde jul-2026:** toda vía debe sellar `fuente_descubrimiento` con uno de
estos seis valores. Si aparece cualquier otro, es un error a corregir.

| Valor | Significa |
|---|---|
| `migracion` | Venía del CRM antiguo (Firestore) |
| `scout` | La encontró el prospector scout |
| `placsp` | Salió en el cruce con licitaciones públicas |
| `referencia` | Nos la refirió otro cliente |
| `comercial` | La abrió un comercial de Ferroplast o Tuyper |
| `manual` | Contacto directo, prensa, feria |

Cada sello guarda además `fecha_captura` y `nivel_confianza`. Ese último campo importa:
`confirmado` significa que consta de dónde salió; `sin_confirmar` que se asignó por
descarte y podría estar mal.

---

## 1 · Migración desde Firestore

**Cuándo:** una sola vez, el 24 de mayo de 2026.
**Aportó:** 1.586 fichas — el grueso histórico de la cartera.

Trajo todo lo acumulado en el CRM anterior. **No es un origen comercial**: es "lo que ya
había". Durante dos meses estas fichas estuvieron etiquetadas como `geografica`, lo que
daba a entender que se habían encontrado por criterio geográfico. Se corrigió a
`migracion` el 20-jul-2026.

**Qué no garantiza:** nada sobre la calidad del dato. Son fichas de antigüedad y estado
muy variables, y muchas nunca se han contrastado.

---

## 2 · PLACSP · `scripts/placsp-fetch.js`

**Cuándo:** solo, todos los días a las 03:00 (GitHub Actions).
**Aporta:** 85 fichas hasta hoy, más alertas sobre fichas que ya existen.

Descarga licitaciones y adjudicaciones de la Plataforma de Contratación del Estado y las
cruza con la cartera. Su valor no es tanto dar de alta empresas como **avisar de cuándo
una que ya conoces gana un contrato de agua**: ahí se abre la ventana para prescribir
antes de que se redacte el pliego.

**Qué garantiza:** el dato es oficial y verificable, con su expediente detrás.
**Qué no:** que la empresa encaje comercialmente. Que gane una licitación no la convierte
en prescriptora.

---

## 3 · Scout · agente `prospector-nuevos`

**Cuándo:** cuando Manolo lo lanza. **No hay nada programado** — decisión deliberada.
Se dispara con el atajo `scout "<provincia>"` o con la `Scout.app` del Escritorio.
**Aporta:** 20 fichas atribuidas, de 12 rastreos entre mayo y julio de 2026.
**Cuesta:** ≈ 1,63 $ por provincia (medido), con tope de 2 $ por ejecución.

Busca empresas que **no** están en la cartera: estudios, ingenierías, promotoras,
regantes, ciclo del agua, distribuidores. Rastrea web, PLACSP, BOJA y prensa sectorial
(iAgua, AguasResiduales, Retema, Hosteltur, Alimarket), y cruza contra el CRM para no
repetir. Deja el informe en `agentes/output/`.

**Qué no garantiza — y esto es lo importante:** los prospectos son **resultados de
búsqueda web sin verificar**. Teléfonos, direcciones y nombres pueden estar mal. Antes
de llamar a nadie hay que contrastarlos. Es lo que lo diferencia de PLACSP.

⚠️ **Ojo al atribuir.** Un informe del scout menciona también empresas que ya estaban en
el CRM. Que una ficha aparezca en un informe **no** significa que venga de él: solo
cuenta si la ficha se creó el mismo día o después del rastreo. Aplicando esa regla, de
25 coincidencias por nombre solo 20 eran atribuibles de verdad.

---

## 4 · Alta manual desde el CRM

**Cuándo:** cuando Manolo pulsa "Nueva empresa" (o ⌘K → N).
**Aporta:** lo que surge en el día a día — una feria, una noticia, una llamada.

Desde jul-2026 el formulario **pregunta de dónde sale la empresa** y lo guarda. Antes no
lo hacía, y de ahí vienen las 75 fichas que hoy figuran como `manual · sin_confirmar`:
se les asignó por descarte, no por evidencia.

---

## 5 · Referencias cruzadas

**Cuándo:** automático, al leer los informes de visita.
**Aporta:** pistas, no fichas. El alta la sigue haciendo una persona.

Un motor escanea el texto de los informes buscando menciones a terceros —`Ayuntamiento
de…`, `C.R. de…`, `Aqualia`, `EDAR de…`— y las cruza con la cartera por provincia. Lo
que encuentra aparece en la bandeja.

**Cómo aprovecharlo:** al escribir el informe, nombrar a las empresas mencionadas tal
cual. Si en la visita a Aqualia Lepe escribes "Ayuntamiento de Cartaya", la referencia
queda cruzada sola y trazable.

---

## 6 · Comerciales de Ferroplast y Tuyper

**Cuándo:** cuando un comercial de zona abre una cuenta y la pasa.
**Aporta:** cuentas con puerta ya abierta, sobre todo en regantes y ciclo del agua.

Es la vía con mejor tasa de conversión y la peor trazabilidad: hasta ahora entraban como
altas manuales sin distinguir. El valor `comercial` existe desde jul-2026 justamente
para poder medirlo. Conviene anotar **qué comercial** en las notas de la ficha.

---

## Foto actual (20-jul-2026)

| Origen | Fichas | % | Confianza |
|---|---|---|---|
| `migracion` | 1.569 | 89,7 % | confirmado |
| `placsp` | 85 | 4,9 % | doble fuente |
| `manual` | 75 | 4,3 % | **sin confirmar** — asignado por descarte |
| `scout` | 20 | 1,1 % | confirmado |
| `referencia` | 1 | 0,1 % | confirmado |
| **Total** | **1.750** | | |

**Cómo leer esto en un informe.** El 90 % de la cartera es herencia: no la trajo ninguna
herramienta, ya estaba. Lo que mide el trabajo de captación de los últimos meses son las
181 fichas restantes. Y de esas, 75 no sabemos de dónde salieron — un agujero que a
partir de ahora no debería repetirse, porque todas las vías sellan su origen.

---

## Si añades una vía nueva

1. Elige uno de los seis valores. **No inventes uno nuevo** sin actualizar este documento
   y la lista de `redesign/app.js`.
2. Sella `fuente_descubrimiento` en el momento del alta, no después.
3. Pon `nivel_confianza: 'confirmado'` solo si consta de verdad. Si es una suposición,
   `sin_confirmar` y una nota diciendo por qué.
