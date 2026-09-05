# Banco de variantes sobre Zaragoza — 5 de septiembre de 2026

## Lo primero: dos de los cuatro pases NO valen

Los cuatro corrieron con el mismo directorio de salida, y `--add-dir` daba acceso de lectura al
repo. **Dos agentes leyeron los informes de los anteriores.** Está en la traza de sus sesiones y en
sus propios textos:

| Pase | ¿Leyó informes previos? | Vale |
|---|---|---|
| vA1 control | **no** | ✅ |
| vA2 control | sí — leyó vA1 | ❌ |
| vB censo anclado | sí — leyó vA2 | ❌ |
| vC cupo por tipo | **no** | ✅ |

vA2 escribió en su cabecera: *«se incorporan 6 prospectos nuevos no incluidos en vA1»*. No repitió el
trabajo: lo continuó. Y vB dijo que aportaba *«los prospectos que vA1/vA2 no recogieron»* — o sea que
**excluyó a propósito justo lo que el patrón oro mide**. Su mal resultado es un artefacto de esa
instrucción: **vB no se ha probado todavía**.

Dos consecuencias que hay que tener claras:
- **No hay suelo de ruido.** Que vA1 y vA2 dieran lo mismo no era reproducibilidad: era copia.
- El único suelo de ruido limpio que existe sigue siendo el de **Teruel: 6 de 16 fichas repetidas
  entre dos pases**. Con esa varianza, cualquier diferencia pequeña es indistinguible del azar.

**Arreglado** (5-sep): `SCOUT_OUTPUT_DIR` aisla cada pase en su directorio vacío, el prompt prohíbe
leer otros informes, y el banco usa guiones versionados en `guiones/` en vez de la ruta de
producción, que dejaba de ser el control en cuanto se implementaba una variante.

## La única comparación válida: vA1 contra vC

Las dos limpias, n=1 cada una. Marcador **corregido** (ver abajo):

| | fichas | recall oro | tipos | % tipo dominante | % con tel | % con mail | personas | coste |
|---|---|---|---|---|---|---|---|---|
| vA1 control | 13 | 3/24 | 5 | 38% | 92% | 69% | 3 | 1,85 $ |
| **vC cupo por tipo** | 17 | **6/24** | **7** | **24%** | 65% | 47% | 5 | 2,10 $ |

vC dobla el recall y el equilibrio de tipos al mismo coste, y **pierde en contactos completos**.

## El marcador estaba mal, y también se ha corregido

La primera versión buscaba el nombre de la entidad en **todo el texto** del informe, así que contaba
como acierto una entidad citada solo en «Pendientes de verificar» para decir que no se pudo acceder a
ella. **El CICCP puntuaba en las cuatro variantes sin una sola ficha entregada.** El «Ayuntamiento de
Zaragoza» que se atribuía a vC era un paréntesis dentro de las notas de Ecociudad.

Corregido: el nombre tiene que aparecer en una **ficha entregada**. Todas las cifras bajaron a la
mitad; el orden entre vA1 y vC no cambió.

## Lo que NINGUNA variante arregló

Cero de tres en las entidades que el scout dio por inexistentes en agosto: las mancomunidades del
Entorno Oeste (59.042 hab.) y Ribera Bajo Huerva (55.526 hab.), y la C.R. Acequia Cinco Villas.

Y hay una pista de por qué: **vB, que llevaba la instrucción explícita de mirar el inventario de
aglomeraciones de la Confederación, no menciona la palabra «mancomunidad» ni una sola vez.** vC sí la
menciona, para decir que la web de la Diputación le dio un error de certificado.

**El punto ciego no es un problema de prompt.** Esos censos no son cosechables sin navegador. Ningún
texto en un `.md` hace que un WebFetch atraviese un error de SSL. La salida correcta es sacar el
censo del agente: un script determinista que baje una vez la lista de mancomunidades y comunidades de
regantes por provincia y la deje en un JSON local que el agente lea. Universo finito, coste cero por
pase, cero invención.

## Por qué vC se queda en producción de todas formas

**No por la tabla.** Por una cosa que ninguna métrica recogió. Ante la misma pregunta sobre
mancomunidades:

- el control escribe *«la búsqueda no devolvió mancomunidades específicas»* — que suena a que no hay;
- vC escribe *«**no puedo declarar que no hay mancomunidades — solo que no pude acceder al listado**.
  Es un pendiente real»*.

La primera cierra una línea de prospección con un dato falso. La segunda deja un pendiente
accionable. Esa diferencia vale más que dos entidades de recall, y es exactamente la regla dura 14
funcionando.

## Lo que falta antes de dar esto por cerrado

1. **Repetir el banco en Granada o Córdoba**, que son territorio real y tienen cartera en el CRM. En
   Zaragoza hay 0 fichas, así que **el paso de deduplicar contra Supabase no se ejecutó ni una vez**
   en los cuatro pases. Es un tercio del guion sin probar.
2. **Probar vB de verdad**, ahora que el aislamiento existe. Sigue sin evaluar.
3. **El censo determinista**, que es lo único que cierra el punto ciego.
4. **Medir precisión, no solo cobertura.** El marcador premia escribir más nombres y no comprueba si
   son ciertos, que es justo el modo de fallo conocido: en Teruel, 24 de 24 fichas necesitaron
   corrección. Optimizar recall sin contrapeso selecciona por inventar.
5. Ojo con el presupuesto: vC añade dos secciones obligatorias y un bucle de relleno de cupo. En una
   provincia con cartera real puede chocar con el tope de 3 $.
