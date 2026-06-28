# Fuentes autoritativas — CRM Prospector GPF (CRM B2B de prospección de proyectistas para que especifiquen la marca GPF en pliego)

Este fichero lo consume el subagente `verificador-resultados`. Define qué cuenta
como fuente primaria/autoritativa para verificar datos de ESTE proyecto.

## Fuentes primarias (preferentes, en este orden)
1. **La propia base de datos Supabase del CRM** — tablas de studios/estudios y sus
   informes/actividades. Es la fuente de verdad del estado comercial (cuadrante Q1–Q9,
   scoring, histórico de visitas, contactos guardados). Verificar contra el registro real,
   no contra lo que "parezca" por el nombre del estudio.
2. **Registro Mercantil / datos oficiales de empresa** — denominación social exacta, NIF/CIF,
   domicilio, objeto social, administradores. Para España: BORME (boe.es/diario_borme),
   Registro Mercantil Central, e Informa/eInforma o axesor para facturación y CNAE. El
   identificador DUNS (D&B) es la referencia usada en el pipeline de segmentación.
3. **Web corporativa del cliente/estudio** — para actividad real, especialidad, equipo,
   proyectos en cartera y datos de contacto públicos. Contrastar con LinkedIn de la empresa.
4. **Fuentes oficiales de actividad de proyectistas** — colegios profesionales (COA de
   arquitectos, colegios de ingenieros), visados de proyecto, licencias de obra publicadas.

## Reglas específicas de dominio
- **Nunca inventar datos comerciales sensibles**: facturación, número de empleados, nombres
  de contacto, cargos, teléfonos o correos. Si no constan en la BD ni en fuente oficial,
  dejarlo como `[SIN DATO]` — es preferible un hueco honesto a un dato falso.
- **Cuadrante y scoring (Q1–Q9)** se recalculan con el pipeline (`scripts/batch-qualify/`),
  no se afirman de memoria. Un cuadrante solo es válido si coincide con el último cálculo del
  pipeline para ese studio.
- **IDs de studio**: numéricos como strings (`"3001"`); algunos legacy son alfanuméricos de
  Firestore. No confundir ID con razón social ni inferir uno del otro.
- Distinguir denominación comercial (marca/rótulo) de la razón social registral. Para
  cualquier dato legal de empresa, prevalece el Registro Mercantil sobre la web.
- Los **informes comerciales no son transcripciones**: nunca deben contener marcas de tiempo
  de audio (`[01:47]`, rangos `MM:SS`). Si aparecen, el dato viene mal procesado.
- El objetivo comercial NO es vender, es lograr la **prescripción de la marca GPF en pliego**;
  no atribuir al estudio compromisos de compra que no figuren registrados.

## NO son fuentes primarias
- La memoria del modelo sobre una empresa concreta (facturación, cargos, contactos).
- El nombre o rótulo del estudio como prueba de su actividad real o su tamaño.
- Informes/notas antiguas del propio CRM sin contrastar con la fuente oficial vigente.
- Datos scrapeados sin fecha de consulta ni URL verificable.
