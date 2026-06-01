# 01 · Cotejo del Directorio de Prescriptores
_Generado: 30 abril 2026 · Rama: feat/cotejo-plan-v5_
_Fuente Plan v5: Sección 8 [V] verificada_

---

## Leyenda

| Símbolo | Significado |
|---|---|
| ✅ | Presente en CRM con datos correctos |
| ⚠️ | Presente pero con datos incompletos o nombre diferente |
| ❌ | Ausente — hay que dar de alta |
| 🚫 | No debe estar (entrada errónea depurada en v5) |

---

## 8.1 · Comunidades de Regantes

| Prescriptor Plan v5 | Contacto Plan v5 | Estado | Nombre en CRM | Tipo CRM | Estado CRM | Contacto CRM | Datos completos | Acción propuesta |
|---|---|---|---|---|---|---|---|---|
| C.R. Pantano del Guadalmellato | Andrés del Campo García (Pres.) | ⚠️ | CR Pantano de Guadalmellato | regantes | reunion | Ramón Fuentes Spígnola (Secretario) | ⚠️ Parcial | Añadir a Andrés del Campo García como contacto DM |
| C.R. Cabra (Córdoba) | Juan Luis Casimiro-Soriguer Escofet (Pres.) | ✅ | C.R. de Cabra | regantes | reunion | Juan Luis Casimiro-Soriguer Escofet ★DM | ✅ | — |
| C.R. EDAR de Priego de Córdoba | Pedro Antonio Arenas (Pres.) | ⚠️ | C.R. Priego de Córdoba - EDAR (Aguas Regeneradas) | cr* | — | Sin contactos | ⚠️ Parcial | Añadir a Pedro Antonio Arenas; corregir tipo a `regantes` |
| C.R. Margen Izquierda Bembézar | Francisco Javier Hidalgo Martínez (Pres.) | ✅ | C.R. Canal Margen Izquierda del Bembézar | regantes | contactado | Francisco Javier Hidalgo Martínez (Presidente) | ✅ | Avanzar a estado `reunion` si procede |
| C.R. Margen Derecha Río Genil | Francisco Luis González Martín (Pres.) | ✅ | C.R. Margen Derecha del Genil | regantes | reunion | Francisco Luis González Martín ★DM | ✅ | — |
| C.R. Villafranca de Córdoba | José Antonio de la Rosa Álvarez (Pres.) | ⚠️ | C.R. Villafranca de Córdoba | **aguas** | — | Sin contactos | ⚠️ Tipo incorrecto | Cambiar tipo a `regantes`; añadir José Antonio de la Rosa Álvarez |
| C.R. Sector A Abarán (Murcia) | Alberto Ato Vega (Pres.) | ⚠️ | CR Sector A Abarán - Vegas Altas y Media Segura Z.II | regantes | reunion | **Sin contactos** | ❌ Falta DM | Añadir a Alberto Ato Vega como Presidente ★DM |
| C.R. Blanca Vegas Altas Segura (Murcia) | Juan Jesús Cano Rengel (Pres.) | ⚠️ | CR Blanca Fase I / CR Z.II Vegas Alta y Media Segura | regantes | — | Sin contactos | ❌ Falta DM | Consolidar entradas duplicadas; añadir Juan Jesús Cano Rengel |

> **Nota:** Existen en el CRM múltiples entradas para la C.R. de Blanca (4 registros distintos: Fase I, Fase III, cuneta perimetral, filtrado del rellano) y para la C.R. Sector A Abarán. Recomendable consolidar en un único registro por C.R. y mover el detalle de obra a proyectos.

---

## 8.2 · Ingenierías y Arquitecturas

| Prescriptor Plan v5 | Rol | Estado | Nombre en CRM | Tipo CRM | Estado CRM | Contacto CRM | Datos completos | Acción propuesta |
|---|---|---|---|---|---|---|---|---|
| Moval Agroingeniería (Murcia) | Acuerdo FERAGUA · escribe pliegos | ⚠️ | Moval Agroingeniería S.L. | ingenieria | reunion | **Sin contactos** | ❌ Falta equipo | Añadir contacto técnico de Moval. Prescriptor máxima prioridad |
| NARVAL Ingeniería (Málaga) | Pliegos hidráulicos PARRA | ⚠️ | Narval Ingeniería S.A. | ingenieria | reunion | "No encontrado" (campo vacío) | ❌ Falta nombre | Corregir / añadir contacto técnico real |
| INGENZ (Málaga) | Proyectos urbanos y agrícolas | ⚠️ | INGENZ - Ingeniería y Gestión | ingenieria | reunion | **Sin contactos** | ❌ Falta equipo | Añadir contacto técnico |
| JGV Ingeniería (Málaga) | Obra civil hidráulica | ❌ | **No existe** | — | — | — | ❌ | Dar de alta: JGV Ingeniería, tipo `ingenieria`, provincia Málaga |

---

## 8.3 · Distribución

### Distribuidores válidos (depurados en v5)

| Distribuidor Plan v5 | Estado | Nombre en CRM | Tipo CRM | Acción propuesta |
|---|---|---|---|---|
| Salvador Escoda | ❌ | **No existe** | — | Dar de alta. Tipo `almacen` o crear `distribuidor` |
| Saltoki | ❌ | **No existe** | — | Dar de alta. Tipo `almacen` |
| Sanigrif | ❌ | **No existe** | — | Dar de alta. Tipo `almacen` |
| SOTEC | ❌ | **No existe** | — | Dar de alta. Tipo `almacen` |
| Saneamientos J. Gómez | ❌ | **No existe** (los hits son falsos positivos) | — | Dar de alta. Tipo `almacen` |

> **Nota:** Los hits de "Gómez" en la búsqueda corresponden a OTAISA Innova y Avarq Creativity, coincidencia de apellido en persona del equipo, no la empresa distribuidora.

### Distribuidores erróneos — verificación [V]

| Empresa | Estado en CRM | Resultado |
|---|---|---|
| Comafe | ✅ NO existe en CRM | Correcto — depurada en v5 |
| Aldeasa | ✅ NO existe en CRM | Correcto — depurada en v5 |
| Hispano Lavadero | ✅ NO existe en CRM | Correcto — depurada en v5 |

> Las tres entradas erróneas identificadas en la auditoría v4→v5 **no están presentes en el CRM**. No hay acción necesaria.

---

## 8.4 · Empresas de Obra Pública

| Empresa Plan v5 | Estado | Nombre en CRM | Tipo CRM | Estado CRM | Observación | Acción propuesta |
|---|---|---|---|---|---|---|
| FCC Aqualia (vía Aqualia Baena, Córdoba) | ⚠️ | FCC AQUALIA A TRAVES DE EMASER / Aqualia Puente Genil | regantes/aguas | — | No existe entrada específica "Aqualia Baena" | Crear entrada dedicada `Aqualia Baena (Córdoba)` tipo `aguas` para estrategia central |
| Hidrogea (vía Aguas de Cieza, Murcia) | ✅ | HIDRALIA A TRAVES DE HIDROGEA / HIDRALIA A TRAVES DE EMUASA | aguas | — | Presente, nombre con HIDRALIA | Añadir referencia a Pedro José Moya Adán si no figura en equipo |
| Adjudicatarios PARRA Guaro-Axarquía | ❌ | **No existe** (pendiente identificación) | — | — | [I] Pendiente por confirmar | Crear entrada cuando se identifique el contratista |
| Adjudicatarios PARRA La Herradura | ❌ | **No existe** (pendiente identificación) | — | — | [I] Pendiente por confirmar | Crear entrada cuando se identifique el contratista |

---

## 8.5 · Administraciones Públicas

| Empresa Plan v5 | Contactos Plan v5 | Estado | Nombre en CRM | Tipo CRM | Estado CRM | Contactos en CRM | Datos completos | Acción propuesta |
|---|---|---|---|---|---|---|---|---|
| EMACSA (Córdoba) | José María Aumente León, Sergio García Alcubierre | ⚠️ | EMPRESA MUNICIPAL AGUAS CORDOBA, S.A. (EMACSA) | aguas | contactado | J.Carlos Velasco Garcia, Jesús Flores, Juan Sanchez Bejarano, María Teresa Carrillo (Directora) | ❌ Faltan los 2 DM técnicos | Añadir José María Aumente León y Sergio García Alcubierre como contactos ★DM (homologación ETNT003/015) |
| EMPROACSA / Aguas de Córdoba | Antonio Gil (Redes), Manuel Martín Berral (Director Gerente), Fco. Javier Aguilar (Jefe Ingeniería) | ⚠️ | EMPROACSA | aguas | contactado | Manuel Martín Berral (Gerente) ✅ | ⚠️ Parcial | Añadir Antonio Gil y Fco. Javier Aguilar Martínez |
| Aguas de Lucena | Jorge Hornero (resp. técnico) | ✅ | Aguas de Lucena | aguas | **reunion** | Jorge Hornero ★DM ✅, María del Carmen Beato Cañete ✅ | ✅ | ⚠️ Pendiente envío documentación técnica Tuyper (Tarea 15.3 Plan v5) |
| EMASESA (Sevilla) | — | ⚠️ | EMPRESA METROPOLITANA DE ABASTECIMIENTO Y SANEAMIENTO DE AGUAS DE SEVILLA - EMASESA | aguas | **nuevo** | Estrella Ruiz Blancas, Joaquín del Campo | ⚠️ Falta contacto técnico redes/procurement | Identificar y añadir contacto técnico de procurement / redes. Objetivo 2T 2026 |

---

## 8.6 · Colegios Profesionales y Formación

| Colegio Plan v5 | Ponencia prevista | Estado en CRM | Acción propuesta |
|---|---|---|---|
| COA (Colegio de Arquitectos) | 1 ponencia Ferroplast MUTE (1S 2026) | ❌ No existe | Dar de alta tipo `otros` o crear tipo `colegio_profesional` |
| COAAT (Arquitectos Técnicos) | Alternativa a COA | ❌ No existe | Ídem |
| CICCP (Caminos, Canales y Puertos) | 1 ponencia Tuyper PE100/Biopipe (2S 2026) | ❌ No existe | Dar de alta |
| COIA (Ingenieros Agrónomos) | Alternativa a CICCP | ❌ No existe | Ídem |

> Los 4 colegios están ausentes del CRM. Sin tipo específico disponible (`colegio_profesional` no existe). Propuesta: crear tipo o usar `otros` con etiqueta manual.

---

## Resumen ejecutivo

| Sección | Total Plan v5 | ✅ Correcto | ⚠️ Parcial | ❌ Ausente | 🚫 Borrar |
|---|---|---|---|---|---|
| 8.1 Regantes | 8 | 2 | 5 | 1 | 0 |
| 8.2 Ingenierías | 4 | 0 | 3 | 1 | 0 |
| 8.3 Distribución (válidos) | 5 | 0 | 0 | 5 | 0 |
| 8.3 Distribución (erróneos) | 3 | — | — | — | 0 ✅ |
| 8.4 Obra pública | 4 | 1 | 1 | 2 | 0 |
| 8.5 Administraciones | 4 | 1 | 2 | 1 | 0 |
| 8.6 Colegios | 4 | 0 | 0 | 4 | 0 |
| **TOTAL** | **29** | **4 (14%)** | **11 (38%)** | **14 (48%)** | **0 ✅** |

---

## Acciones prioritarias (ordenadas por urgencia Plan v5)

| # | Prioridad | Acción | Empresa | Motivo |
|---|---|---|---|---|
| 1 | 🔴 Inmediata | Añadir contacto Jorge Hornero en Aguas de Lucena → enviar docs técnicos Tuyper | Aguas de Lucena | Tarea 15.3 Plan v5 "pendiente desde semanas previas" |
| 2 | 🔴 Inmediata | Añadir José María Aumente León + Sergio García Alcubierre en EMACSA | EMACSA | Cierre homologación ETNT003/015 = 1T 2026 |
| 3 | 🔴 Alta | Añadir contacto técnico en Moval Agroingeniería | Moval | Prescriptor máxima prioridad — FERAGUA |
| 4 | 🟡 Alta | Añadir Alberto Ato Vega en CR Sector A Abarán | CR Sector A Abarán | Proyecto PERTE en curso |
| 5 | 🟡 Alta | Completar equipo NARVAL e INGENZ | NARVAL, INGENZ | En `reunion` sin nombre de contacto |
| 6 | 🟡 Media | Dar de alta JGV Ingeniería (Málaga) | JGV | Ingeniería prioridad Plan v5 |
| 7 | 🟡 Media | Dar de alta 5 distribuidores (Escoda, Saltoki, Sanigrif, SOTEC, J. Gómez) | Distribuidores | Canal multiplicador Plan v5 |
| 8 | 🟡 Media | Añadir Antonio Gil + Fco. Javier Aguilar en EMPROACSA | EMPROACSA | Contactos técnicos redes e ingeniería |
| 9 | 🟢 Normal | Crear Aqualia Baena entrada dedicada | Aqualia Baena | Estrategia central 2T-3T 2026 |
| 10 | 🟢 Normal | Dar de alta 4 colegios profesionales (COA/COAAT/CICCP/COIA) | Colegios | Objetivo 2 ponencias 2026 |
| 11 | 🟢 Normal | Consolidar duplicados CR Blanca (4 entradas) y completar contacto | CR Blanca | Dato Juan Jesús Cano Rengel |
| 12 | 🟢 Normal | Corregir tipo CR Villafranca de Córdoba (`aguas` → `regantes`) | CR Villafranca | Clasificación incorrecta |
| 13 | 🟢 Normal | Añadir Andrés del Campo García en CR Guadalmellato | CR Guadalmellato | Presidente (influencer nacional) |
| 14 | 🟢 Normal | Identificar y dar de alta adjudicatarios PARRA cuando se conozcan | Adjudicatarios | Guaro-Axarquía y La Herradura |
