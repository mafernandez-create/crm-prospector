# Banco de variantes sobre GRANADA — 5 de septiembre de 2026

Repetición del banco en **territorio real**, con las tres críticas del abogado del diablo corregidas:
rúbrica que no escribió el evaluador, orden aleatorio y aislamiento verificado.

## El resultado, y es un NO

| | fichas | **rescate de cartera dormida** | **propone ya visitadas** | coste | duración |
|---|---|---|---|---|---|
| vA1 · control | 16 | **0 / 132** | 0 ✅ | 2,04 $ | 11m56s |
| vA2 · control | 33 | **27 / 132** | 0 ✅ | 2,64 $ | 15m00s |
| vB · censo anclado | 30 | 21 / 132 | 0 ✅ | 2,34 $ | 13m04s |
| vC · cupo por tipo | 27 | 22 / 132 | 0 ✅ | 2,91 $ | 14m46s |

**Dos ejecuciones del MISMO guion, aisladas, el mismo día: una rescata CERO y la otra VEINTISIETE.**
Ese es el suelo de ruido, y es enorme. Con él, la diferencia entre 21, 22 y 27 no significa
absolutamente nada.

**Veredicto: ninguna variante gana.** No es un fracaso del experimento: es su resultado. Era justo lo
que el abogado del diablo predijo — «si el delta sigue siendo pequeño frente a la varianza, la
respuesta correcta es que ninguna gana».

## Por qué esta tanda sí vale, y la de Zaragoza no valía

| Crítica del contrarian | Cómo se arregló | Comprobado |
|---|---|---|
| Los pases se leían entre ellos | `SCOUT_OUTPUT_DIR` aísla cada uno; el prompt prohíbe leer informes | **Sí**: los cuatro, «leyó antes: NADA» en su traza |
| La rúbrica la escribía el evaluador | Sale del CRM, anterior al experimento: 132 dormidas y 5 visitadas | Sí |
| Faltaba medir precisión | «Propone ya visitadas» es un fallo objetivo que la regla dura 1 prohíbe | Sí |
| El orden estaba confundido con la variante | Se baraja en cada tanda | Sí |
| El Paso 3 nunca se había ejecutado | Granada tiene 137 fichas: esta vez sí corrió | Sí |

## Lo bueno, que también es medido

**Error duro: CERO en las cuatro.** Ninguna propuso una ficha ya visitada, teniendo 5 en el CRM que
podrían haber colado. La regla dura 1 se respeta al 100%. Es la primera métrica de PRECISIÓN que
tiene este banco y sale limpia.

## Dos fallos del MEDIDOR que aparecieron aquí

1. **vB figuraba con «0 fichas» por 2,34 $.** Falso: entregó 49, con cabeceras `#### [SD-01] NOMBRE`
   en vez del formato canónico, y sin un solo campo JSON. **El fallo era del contador**, que solo
   reconocía un formato. Ya aguanta los dos, y si aparece un tercero lo delata en vez de contar cero
   en silencio. Es el segundo error de medición de este banco, después del que contaba menciones como
   aciertos: **medir mal se parece mucho a un resultado**.
2. La rúbrica de Granada no lleva patrón oro y el marcador dividía por cero. Corregido.

## Qué hacer con esto

- **Un solo pase no es fiable.** Si puede rescatar 0 de 132, la práctica correcta es **dos pases y
  fundir**, que ya estaba medida en Teruel y ahora tiene un segundo aval.
- **vC se queda en producción**, pero que quede claro por qué: **no porque gane la tabla** —no la
  gana—, sino porque declara honestamente lo que no ha podido mirar en vez de afirmar que no existe.
- **Dejar de afinar el prompt.** Dos tandas, ocho pases y ~16 $ para concluir que la varianza se come
  cualquier mejora. Lo que sí funcionó el mismo día fue quitarle trabajo al modelo: el censo de
  mancomunidades pasó de 0 a 13 entidades, y el análisis de adjudicaciones de PLACSP saca en un mes
  más empresas de agua que el barrido en cuatro pases.
