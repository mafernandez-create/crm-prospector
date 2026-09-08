# Captura de tarjetas de visita con la cámara — pendiente

**Estado: APLAZADO por Manolo el 8-sep-2026.** Idea suya, aprobada en concepto; se hará más
adelante. Esta nota existe para no repetir la investigación.

## Qué se quiere

Un botón de cámara en el CRM —sobre todo en el móvil— que fotografíe una tarjeta de visita,
extraiga los datos, compruebe si la empresa ya está en el CRM y, si no está, la dé de alta.

## Lo que ya está resuelto (8-sep-2026)

**El criterio de reparto de los datos**, que es la parte que se hace mal por defecto:

- **Datos del contacto → `data.team[]`:** cargo, móvil, extensión directa, correo nominal.
- **Datos de la empresa → `data.contact`:** centralita, dirección, web, CIF, correo genérico.
- **Prueba:** si el dato desaparece cuando esa persona se va de la empresa, es del contacto.

Reglas de escritura, ya probadas a mano con 8 tarjetas ese mismo día:
rellenar solo huecos · nunca pisar un dato existente · si la tarjeta contradice lo guardado,
enseñar ambos y que decida Manolo · anotar el origen (`source: "Tarjeta de visita, <fecha>"`) ·
si la empresa no está en el CRM, preguntar antes de crearla.

## Viabilidad técnica

**Probablemente no hace falta tocar el backend.** `Data.callGAS()` (`redesign/data.js:47`) manda
`JSON.stringify(params)` tal cual como cuerpo, y `_claudeCall()` lo usa como payload de la API de
Anthropic. La Messages API acepta bloques de imagen en `messages[].content`, y `claude-sonnet-4-6`
es multimodal. En teoría basta con montar el bloque de imagen en el cliente.

⚠️ **Sin confirmar:** el código del proxy `claudeProxy` vive en Apps Script y NO está en este
repositorio, así que no se ha podido leer si reenvía el cuerpo íntegro o lo filtra. **Antes de
construir nada, hacer la prueba:** una foto pequeña en base64 por `callGAS('claudeProxy', …)` y ver
si contesta. Si lo filtra, hay que retocar el Apps Script y el alcance cambia.

## Pasos, si se retoma

1. Prueba del proxy con una imagen (10 min). Si falla, parar y replantear.
2. `<input type="file" accept="image/*" capture="environment">` para que el móvil abra la cámara.
3. Reducir en el navegador antes de enviar (lado mayor ~1600 px, JPEG ~0,7). Sin esto el envío se
   atraganta: las fotos del iPhone llegan en HEIC y pesan de más.
4. Pedir a Claude JSON con: empresa, nombre, cargo, móvil, teléfonos, correos, web, dirección, CIF.
5. Buscar la empresa por nombre normalizado (ojo: `'aquatec  soluciones'` ≠ `'aquatec soluciones'`,
   fallo ya cometido dos veces en este proyecto).
6. **Pantalla de confirmación obligatoria** antes de escribir, con el reparto persona/empresa y los
   conflictos marcados. Nunca escribir directo desde la foto.

## Notas de campo

- El iPhone guarda en **HEIC**; hay que convertir o pedir "Más compatible" en los ajustes.
- Una tarjeta puede traer **dos personas** (DOMO Arquitectura: dos socios con un móvil cada uno).
  No asumir una persona por tarjeta.
- Las dos caras de una tarjeta son dos fotos del mismo contacto: hay que agruparlas.
