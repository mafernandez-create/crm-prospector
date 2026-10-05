# Migración de la API de Anthropic a la suscripción — CRM

> Cómo usar este archivo: abre una sesión **nueva** de Code en este proyecto y escribe
> `Lee MIGRACION-SUSCRIPCION.md y ejecuta la FASE 1`. **Una fase por sesión.** Al acabar
> cada fase: actualiza "Estado", haz commit y termina. Para la siguiente fase, abre una
> sesión nueva o ejecuta `/clear`.

## Objetivo

Sacar de la API todo lo que **no** tenga que responder al momento desde el móvil, y
ejecutarlo con la suscripción de Manolo vía Claude Code headless (`claude -p`) en su Mac.

| Función | Hoy | Destino |
|---|---|---|
| Redactor de correos (`detail.js`, `_IA_MODEL`) | API · Opus 5 | API · **Sonnet** (fase 1) |
| Asistente IA (`asistente.js`) | API · sin caché | API · **con caché de prompt** (fase 1) |
| Chat antiguo (`chat.html`) | API | Retirar o sustituir la intención por `detectIntent` (fase 1) |
| Revisión automática en GitHub (`claude.yml`, job `claude-review`) | API · Haiku | Eliminar; revisar con `/code-review` en Code (fase 1) |
| Scout (`run-scout.sh`) | `claude -p` | Garantizar que no hereda la clave (fase 1) |
| Enriquecer empresa (`enrichStudio`) | API, automático al crear | **Cola + trabajador en el Mac** (fase 3) |
| Briefing antes de visitar (`generateBriefing`) | API, al pulsar | **Se genera la víspera** con el trabajador; el botón regenera por API (fase 4) |
| Resumen semanal (`generateWeeklySummary`) | API, al pulsar | **Se genera el viernes** con el trabajador (fase 5) |
| Informe de visita desde notas (`generateReport`) | API | **Se queda en la API**: se usa en ruta y hace falta al momento |

## Reglas para toda la migración

- Trabaja en la rama `suscripcion-claude-p`, creada **desde `registro-uso-ia`**: esa rama
  ya etiqueta cada llamada con `?uso=` para la tabla `ia_uso`. Fusiónala primero.
- **No hagas merge a `main` sin el OK de Manolo.** GitHub Pages publica desde `main`.
- El subproceso de `claude` **nunca** debe recibir `ANTHROPIC_API_KEY`: con la clave
  presente, Claude Code cobra por API. Lánzalo siempre con
  `env -u ANTHROPIC_API_KEY claude -p --model <modelo> --tools '' --system-prompt-file <f>
  --no-session-persistence --setting-sources '' --strict-mcp-config --output-format json`
  y el mensaje por stdin. Comprobado el 3-oct-2026: responde en ~1 s sin añadir el prompt
  de Claude Code.
- Para cambios en la base de datos, escribe la migración en `supabase/migrations/` y
  **pide a Manolo que la apruebe** antes de aplicarla. No escribas datos de producción sin
  su OK.
- Los tests `scripts/tests/unit/*.js` tienen que seguir en verde.
- Para leer `data.js` y `detail.js` (miles de líneas), usa Grep y Read con
  `offset/limit`, o un subagente. Nunca los leas enteros.

## FASE 1 — Mejoras rápidas (sin infraestructura nueva)

1. `redesign/screens/detail.js`: `_IA_MODEL = 'claude-sonnet-4-6'`. Comprueba que
   `output_config.effort` sigue siendo válido con Sonnet; si no, quítalo solo para Sonnet.
   Deja un comentario de que Opus era el modelo anterior.
2. `redesign/screens/asistente.js`: manda `system` como array de dos bloques. El primero,
   con las instrucciones fijas, lleva `cache_control: {type: 'ephemeral'}`; el segundo
   lleva la fecha y la cartera. Reutiliza el patrón de `detail.js`, que reintenta en texto
   plano si el proxy no acepta el array. Así una conversación paga la cartera una vez y
   no en cada pregunta.
3. `chat.html`: si `ia_uso` no muestra uso en 2 semanas (o Manolo confirma que no lo usa),
   retíralo y redirige a la pantalla del asistente. Si se mantiene, sustituye
   `callClaudeIntent` por el clasificador de reglas `detectIntent`, que ya existe.
4. `.github/workflows/claude.yml`: elimina el job `claude-review`. El job `claude-mention`
   (@claude) se queda, pero dile a Manolo que puede retirarlo y usar la pestaña Code.
5. `scripts/prospector-scout/run-scout.sh`: antepone `env -u ANTHROPIC_API_KEY` a la
   llamada `claude -p` y documenta el porqué junto a ella.
6. Tests en verde y commit.

## FASE 2 — Cola de IA y trabajador en el Mac

1. Migración `ia_cola`: `id`, `creado_en`, `tipo` (`enriquecer` | `briefing` |
   `resumen_semanal`), `studio_id`, `clave` única para no duplicar (p. ej.
   `briefing:<studio>:<fecha>`), `modelo`, `system`, `mensaje`, `max_tokens`, `estado`
   (`pendiente` | `en_curso` | `hecho` | `error`), `intentos`, `resultado`, `error`,
   `procesado_en`. RLS: los usuarios autenticados insertan y leen; el trabajador actualiza.
2. Trabajador `scripts/ia-worker/worker.mjs` (Node, sin dependencias nuevas si es
   posible). Hace lo siguiente:
   - toma hasta N trabajos pendientes y los marca `en_curso`;
   - los ejecuta con `claude -p` (reglas de arriba) y guarda `resultado`;
   - registra en `ia_uso` con `origen = 'suscripcion'`;
   - ante un error de límite de la suscripción, deja el trabajo `pendiente` con
     `intentos+1` y para el ciclo;
   - y un trabajo que lleva demasiado tiempo `en_curso` vuelve a `pendiente`.
3. Credenciales de Supabase para el trabajador: guárdalas en el **Llavero de macOS**
   (`security add-generic-password`) o en `.env.local` (ya en `.gitignore`, compruébalo).
   Nunca en el repositorio.
4. launchd `com.gpf.crm-ia-worker.plist`, cada 5 minutos, con log en `logs/`.
   **Comprueba que `claude -p` funciona lanzado por launchd**, no solo desde la terminal:
   la sesión de Claude Code está en el Llavero. Si no funciona, para y explícaselo a Manolo.
5. Prueba de principio a fin con un trabajo de juguete y commit.

## FASE 3 — Enriquecer empresa por la cola

1. En `enrichStudio`, la recogida de contexto web sigue en el navegador
   (`_gatherWebContext`), igual que la extracción de correos, teléfonos y dirección, que no
   usa IA. Lo que cambia: en lugar de `_claudeCall`, se inserta en `ia_cola` el `system` y
   el `userMsg` ya construidos.
2. Al abrir la ficha, o al recargar, si hay un resultado `hecho` sin aplicar, se aplica con
   la misma lógica de hoy (solo rellena campos vacíos) y se marca como aplicado.
3. Añade un botón "Investigar ahora" en la ficha, que usa la API como antes, para cuando
   haga falta al momento.
4. Tests (aplicar un resultado, no pisar campos con datos) y commit.

## FASE 4 — Briefing generado la víspera

1. Extrae la construcción del prompt de `generateBriefing` a un módulo puro
   `redesign/prompts/briefing.js` (UMD: sirve en el navegador y en Node). Recibe el
   studio, las opciones y el contexto, y devuelve `{system, user, maxTokens}`.
   `generateBriefing` pasa a usarlo **sin cambiar el texto del prompt**. Añade un test que
   compruebe que el prompt sale idéntico antes y después.
2. El trabajador, a las 20:30, lee las visitas del siguiente día laborable
   (`visitas` / `meta_planificador`) que no tengan briefing, genera el briefing con el
   módulo y lo guarda en `briefings` con la misma forma que el navegador.
   - `cargoInterlocutor` y `tipoVisita` son obligatorios. Usa los de la visita si están; si
     no, el rol de `team[0]` y `seguimiento`, y márcalo en `formato` o en `contexto_extra`
     como "generado automáticamente".
3. En la ficha, si existe un briefing para esa fecha, se muestra sin llamar a la IA. El
   botón pasa a "Regenerar" y usa la API como hoy.
4. Tests y commit.

## FASE 5 — Resumen semanal automático

Mismo patrón que la fase 4: extrae la construcción del prompt de `generateWeeklySummary`
(y los datos de `conciliarSemana`) a `redesign/prompts/resumen-semanal.js`. El trabajador
lo genera el viernes a las 19:00 en `resumenes_semanales`. La pantalla de cierre de semana
muestra el existente y deja regenerarlo por API.

## FASE 6 — Medir y documentar

1. Con `supabase/consultas_ia_uso.sql`, compara el gasto por función antes y después
   (la columna `origen` separa API y suscripción).
2. Actualiza `STATE.md`, `CLAUDE.md` (sección IA: qué va por API, qué por la suscripción y
   por qué) y `retomar.md`.
3. Ofrece a Manolo el merge a `main`, sin hacerlo.

## Estado

- [x] Fase 1 · [ ] Fase 2 · [ ] Fase 3 · [ ] Fase 4 · [ ] Fase 5 · [ ] Fase 6
- Notas:
  - **Fase 1 hecha el 5-oct-2026** en la rama `suscripcion-claude-p`. Tests 844/844.
    `CACHE_NAME` subido a `crm-prospector-v72`. SIN merge a `main`: falta el OK.
  - Dos desvíos conscientes respecto a lo escrito en el plan:
    1. El plan decía `claude-sonnet-4-6`. Se ha puesto **`claude-sonnet-5-5`** en
       `detail.js` y en `asistente.js`: el 4-6 es generación anterior y cuesta MÁS
       ($3/$15 por MTok frente a $2/$10), así que usarlo habría ido contra el propio
       objetivo de la fase. `output_config.effort` SÍ sigue siendo válido en Sonnet
       5.5, así que no se ha quitado — pero sus niveles están recalibrados y los
       tiempos medidos en Opus ya no lo calibran (queda anotado en el código).
    2. El plan decía poner el `cache_control` en el PRIMER bloque del system de
       `asistente.js`. Se ha puesto en el **último**: un punto de caché cachea el
       prefijo hasta ese bloque incluido, así que marcar solo el núcleo habría
       dejado la cartera (la parte grande) pagándose entera en cada turno, que es
       justo lo que la fase quería evitar.
  - `chat.html`: **retirado.** La tabla `ia_uso` estaba vacía (el etiquetado
    `?uso=` vive en esta rama y nunca se desplegó), así que primero se hizo lo
    conservador —quitar el clasificador de intenciones por IA y dejárselo a
    `detectIntent` con reglas—; luego Manolo confirmó que no lo usa y la pantalla
    se ha retirado del todo. El archivo se queda como **redirección** a
    `index.html#asistente`, no borrado: la URL está guardada en la pantalla de
    inicio de su iPhone y borrarla daría un 404 en el móvil. El chat completo
    sigue en el historial de git.
  - `claude.yml`: borrado el job `claude-review` y su disparador `push`.
    ⚠️ **Pendiente de Manolo:** `claude-mention` (@claude en issues/PRs) sigue vivo
    y gasta API; se puede retirar y hacer esas revisiones desde la pestaña Code.
