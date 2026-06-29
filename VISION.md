# VISION.md — crm

> Se relee en cada run para no derivar. STATE.md dice dónde estás; esto, a dónde vas.

## Objetivo a 1 frase
Que el proyectista especifique la marca GPF en el pliego antes del concurso,
apoyándose en un CRM de prospección que organiza ~3.000 entidades y prepara la
visita comercial.

## Por qué importa
El negocio no se gana vendiendo en el concurso, sino antes: si GPF está prescrito
en el pliego, la licitación ya parte a favor. El CRM existe para no perder esa
ventana de prescripción y para que la prospección de Manolo (sur de España) sea
sistemática en vez de depender de la memoria.

## Principios que no se negocian
- Todo desarrollo nuevo va al rediseño (`redesign/`) + Supabase. El legacy
  (`index-legacy.html` + Firebase Firestore) NO se toca sin permiso explícito.
- Ningún informe lleva marcas de tiempo de audio (`[01:47]`, rangos MM:SS…): un
  informe es un registro comercial profesional, nunca parece una transcripción.
  Todo informe nuevo pasa por `stripTimestamps(Deep)`.
- Datos comerciales sensibles: la app no tiene login y cualquiera con la URL entra,
  así que no se meten datos sensibles de clientes.

## En alcance / Fuera de alcance
**Dentro:** prospección y cualificación de entidades (scoring/cuadrantes Q1-Q9),
fichas de studio, planificación de visitas, generación de informes y plannings.
**Fuera:** el ciclo de licitación una vez publicada (eso es `entre-pliegos/`) y la
inteligencia de licitaciones públicas (eso es `placsp/`).

## Definición de "hecho"
Batería de tests verde (`node scripts/tests/run-all.js`) + revisado + desplegado
(push a `main` → `deploy-pages.yml` publica en GitHub Pages). Si un cambio no
aparece en cliente, subir `CACHE_NAME` en `sw.js`. Nada de "se ve bien".

## Restricciones permanentes
- Supabase es la fuente de verdad del CRM (web rediseño + batch + PLACSP). Firebase
  retirado de esos caminos en 2026-06. EXCEPCIÓN viva: `chat.html` aún lee/escribe
  Firestore. No reactivar Firestore en lo migrado ni tocar el legacy sin permiso.
- No exponer datos sensibles de clientes (sin auth, URL pública).
- `google_credentials.json` y claves: nunca a git ni a capturas.
- Cambios al routing/estado global con cuidado: usar `window.showView()`, no
  manipular `location.hash` a mano.
