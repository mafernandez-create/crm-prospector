# Batería de tests del CRM Prospector

Tests automatizados del CRM Ferroplast. Sin dependencias npm externas — solo
Node 20+ (built-ins `fetch`, `crypto`, `fs`, `child_process`).

## Cómo ejecutar

```bash
# Todo (default si no se pasan flags)
node scripts/tests/run-all.js
node scripts/tests/run-all.js --all

# Sólo una capa
node scripts/tests/run-all.js --unit
node scripts/tests/run-all.js --integration
node scripts/tests/run-all.js --e2e
node scripts/tests/run-all.js --smoke

# Verboso (stdout/stderr de cada test)
node scripts/tests/run-all.js --all --verbose

# Ejecutar un test individual directamente
node scripts/tests/unit/test-scoring-v2.js
```

El orquestador devuelve `exit 1` si algún test falla, `exit 0` si todos pasan.

## Variables de entorno

| Variable          | Capa            | Efecto si no está                            |
|-------------------|-----------------|----------------------------------------------|
| `CRM_URL`         | smoke           | Por defecto `https://mafernandez-create.github.io/crm-prospector/` |
| `TESTS_REPO`      | e2e             | Por defecto `mafernandez-create/crm-prospector`  |
| `GH_TOKEN`        | e2e             | `gh` CLI usa keyring local — sin token también funciona si está autenticado; skip si no |

## Qué prueba cada capa

### `unit/` — sin red, sólo lógica

- **scoring-v2** — calculateScoringV2. Verifica D1 (ARQ/ING/OCV/AAPP),
  D2 (empleados según tipo), D4 (recencia proyectos), D5 (fit GPF), D6
  (contacto), R1 (cartera), R2 (densidad target), R5 (provincias zona),
  cliente puente activo (bonus +4), candidato puente y mapping de cuadrante.
- **bloque8-puente** — heurísticas h1/h2/h3/h4 + control negativo PROINTEC.
- **referencias-cruzadas** — `_REFCRUZ_PATRONES` sobre `fixtures/sample-text.txt`
  (CCRR / AAPP / INFRA / CICA + descarte de autorreferencia).
- **acciones-pendientes** — 4 tipos (📱 / 📧 / 📦 / 📅) + parser de plazos
  ("48-72h", "16 de diciembre").
- **visitas-fallidas** — 6 motivos: ausente, reunido, olvido, persona inadecuada,
  no realizada, volver.
- **parsers** — `getValor`, `unwrap` Firestore (string/int/bool/array/map),
  `docFieldsToObj` anidado.

### `integration/` — red, Firestore público + PLACSP

- **firestore-read** — cartera > 1000 docs, `_meta/batch_checkpoint`,
  `_meta/search_metrics`, formato timestamps. Solo lectura REST pública.
  (Legado: chat.html aún lee de Firestore; pendiente de migrar a Supabase.)
- **placsp-feed** — descarga ATOM oficial, parseo de >50 entries.

### `e2e/` — workflows GitHub Actions

- **workflows** — `gh run list` sobre los 5 runs más recientes de
  `placsp-daily.yml`, `tests-daily.yml`. **Skip** si `gh`
  no está autenticado.

### `smoke/` — CRM público

- **crm-pages** — `fetch` del HTML publicado en GitHub Pages. Verifica HTTP
  200 y que el bundle contiene los marcadores clave (`Ferroplast`,
  `loadBandeja`, `firestoreDB`).

## Añadir un test nuevo

1. Crear archivo `test-<nombre>.js` en la capa correspondiente (`unit`,
   `integration`, `e2e`, `smoke`).
2. Seguir el patrón:

```js
const A = require('../_lib/assert');
A.reset();

A.eq(actual, expected, 'descripción human-readable');
A.greaterThan(num, threshold, '...');
A.truthy(value, '...');
A.contains(text, needle, '...');
// async: envolver en (async () => { ... })() o usar A.asyncTest

const s = A.summary();
console.log(JSON.stringify(s));        // ← imprescindible: el orquestador parsea esta línea
process.exit(s.failed > 0 ? 1 : 0);
```

3. Si el test depende de red u OAuth, hazlo tolerante a timeout y degrádate a
   skip limpio si la condición previa no se cumple (no fallar el run global por
   un secret ausente).

## Estructura de helpers

- `_lib/assert.js` — mini-framework de aserciones (eq, truthy, falsy,
  greaterThan, contains, matches, isType, asyncTest, summary).
- `_lib/firestore.js` — cliente REST público de Firestore con paginación
  (`listCollection`, `getDoc`, `unwrap`, `docFieldsToObj`, `getValor`).
- `_lib/crm-modules.js` — port Node-only de las funciones críticas de
  `index.html` (calculateScoringV2, heurísticas Bloque 8, detectores
  referencias/acciones/visitas).

Si alguna función de `index.html` cambia de forma incompatible, hay que
actualizar la copia espejo de `_lib/crm-modules.js`.

## Automatización

El workflow `.github/workflows/tests-daily.yml` ejecuta `--all` cada día a las
05:00 UTC y abre un Issue automático si el exit code es ≠ 0.
