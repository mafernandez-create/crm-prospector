# Setup del endpoint nocturno — Bloque 2B del plan v1.1

> ⚠️ **OBSOLETO (2026-06).** Esta guía monta el batch GAS/Firestore, que se
> retiró. La cualificación nocturna la hace ahora `batch-qualify-node.yml`
> (Node → Supabase); ver `.github/workflows/batch-qualify-node.yml`. Los secrets
> `BATCH_ENDPOINT`/`BATCH_API_KEY` y el web app de `gas-batch-qualify` ya no se
> usan. Se conserva solo como referencia histórica.

Pasos manuales para activar la cualificación batch server-side. Se hace **una sola vez**.

Tiempo estimado: **20-30 minutos**.

---

## 1. Service account en Google Cloud (proyecto `ferroplast-crm`)

1. Ve a **[console.cloud.google.com](https://console.cloud.google.com)** y selecciona el proyecto **`ferroplast-crm`** (esquina superior izquierda).

2. Menú lateral → **IAM y administración** → **Cuentas de servicio**.

3. **Crear cuenta de servicio**:
   - **Nombre**: `crm-batch-qualify`
   - **ID**: queda `crm-batch-qualify@ferroplast-crm.iam.gserviceaccount.com`
   - **Descripción**: *Endpoint nocturno Fase E del plan v1.1*
   - Click **Crear y continuar**.

4. **Roles** — añadir **uno** de estos (basta el mínimo):
   - `roles/datastore.user` (lee/escribe Firestore en modo Datastore o Firestore Native)
   - Alternativo más amplio si el anterior no aparece: `roles/firebase.firestoreAdmin`.

5. **Continuar** y **Listo**.

6. Click en la cuenta recién creada → pestaña **Claves** → **Agregar clave** → **Crear clave nueva** → tipo **JSON**. Se descarga un archivo `ferroplast-crm-XXXX.json`.

7. Abre ese JSON. Necesitarás dos campos para el paso siguiente:
   - `client_email` → algo como `crm-batch-qualify@ferroplast-crm.iam.gserviceaccount.com`
   - `private_key` → empieza por `-----BEGIN PRIVATE KEY-----\n...`

**⚠️ Guarda el JSON en sitio seguro. No lo subas a Git.**

---

## 2. Google Apps Script — instalar el endpoint

1. Abre el editor del proyecto GAS del CRM: **[script.google.com](https://script.google.com)** → proyecto del CRM Prospector.

2. **Añadir library OAuth2**:
   - Menú lateral izquierdo: **Bibliotecas** (icono `+`).
   - **Añadir biblioteca con ID**: pegar `1B7FSrk5Zi6L1rSxxTDgDEUsPzlukDsi4KGuTMorsTQHhGBzBkMun4iDF`.
   - Click **Buscar** → versión más reciente → **Identificador**: dejar `OAuth2` → **Añadir**.

3. **Añadir el código del endpoint**:
   - Crear nuevo archivo en el editor: botón `+` junto a "Archivos" → **Secuencia de comandos** → nombre `batch-qualify`.
   - Pegar el contenido íntegro de [`gas-batch-qualify.gs`](gas-batch-qualify.gs) del repo.

4. **Integrar con el `doPost(e)` existente**:
   - Abre el archivo principal (normalmente `Código.gs`).
   - Busca tu función `handleRequest(e)` (o `doPost(e)`) y localiza el `switch(action)`.
   - Justo **antes** del `default:` añade el nuevo `case`:
     ```javascript
     case 'batchQualify':
       result = handleBatchQualify(e.parameter);
       break;
     ```
   - **Importante**: pasa `e.parameter` (no `params`). El workflow envía los
     parámetros como `application/x-www-form-urlencoded`, que Apps Script
     expone directamente en `e.parameter.action`, `e.parameter.apiKey`,
     `e.parameter.filtro`, `e.parameter.limite`.
   - `handleBatchQualify()` está preparado para recibirlos así (hace
     `parseInt(params.limite)` internamente para convertir el string).

5. **Configurar Script Properties** (configuración interna del proyecto GAS):
   - Menú superior derecho → **Configuración del proyecto** (icono engranaje).
   - Sección **Propiedades del script** → **Editar propiedades del script**.
   - Añadir estas cuatro:

     | Propiedad | Valor |
     |---|---|
     | `FIRESTORE_PROJECT_ID` | `ferroplast-crm` |
     | `SERVICE_ACCOUNT_EMAIL` | el `client_email` del JSON descargado |
     | `SERVICE_ACCOUNT_PRIVATE_KEY` | pegar **íntegra** la `private_key` del JSON, **con los `\n` tal cual** (no expandidos) |
     | `BATCH_API_KEY` | una cadena aleatoria de 32+ caracteres que tú generes (apúntala, hace falta para GitHub) |

   - Para `BATCH_API_KEY` puedes generarla rápido en tu terminal:
     ```bash
     openssl rand -hex 32
     ```

6. **Test desde el editor GAS** (sin tocar producción):
   - En el desplegable de funciones, selecciona `testBatchQualifyDryRun`.
   - Click ▶️ **Ejecutar**.
   - La primera ejecución pedirá autorizar permisos: **Revisar permisos → tu cuenta → Avanzado → Continuar a [proyecto] → Permitir**. (Es la cuenta de Manolo autorizando al proyecto a usar `UrlFetchApp` y OAuth.)
   - Abre **Ver → Registros** (Cmd+Enter): debes ver `Conexión Firestore OK.` y 5 studios con su scoring.
   - Si falla, lee el error y comprueba paso 1 (service account + rol) y paso 5 (Script Properties).

7. **Test del endpoint completo** (5 studios, no afecta a la cartera porque es lectura + flag idempotente):
   - Selecciona `testBatchQualifyEndpoint` → ▶️.
   - El log debe mostrar algo como:
     ```
     Resultado: {"success":true,"processed":5,"updated":0,...}
     ```
   - `updated:0` es normal si los 5 ya tenían su scoring estable.

8. **Deploy del web app**:
   - Botón azul **Implementar** → **Nueva implementación**.
   - ⚙️ **Tipo de implementación**: **Aplicación web**.
   - **Descripción**: `Batch Qualify Endpoint v1.0`.
   - **Ejecutar como**: *Yo (tu cuenta)*.
   - **Quién tiene acceso**: **Cualquiera** (no requiere login — GitHub Actions no puede autenticar con Google).
   - Click **Implementar**.
   - Copia la **URL del web app** (algo como `https://script.google.com/macros/s/AKfycb.../exec`). **Apúntala**, hace falta en el paso siguiente.

---

## 3. GitHub repo — configurar secrets

1. En el repo `crm-prospector` en GitHub:
   - **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.

2. Añadir **dos secrets**:

   | Nombre | Valor |
   |---|---|
   | `BATCH_ENDPOINT` | la URL del web app del paso 2.8 |
   | `BATCH_API_KEY` | la misma cadena aleatoria que pusiste en Script Properties del paso 2.5 |

   ⚠️ Si en GAS pegas distinta clave, el endpoint devolverá 401.

---

## 4. Test end-to-end

Lanzamiento manual desde GitHub Actions (no esperar al cron):

```bash
gh workflow run batch-qualify.yml -f filtro=sin_cuadrante -f limite=5
```

O desde la UI:
- **Actions** → **Batch Qualify Studios** → **Run workflow** → introducir `filtro=sin_cuadrante`, `limite=5` → **Run workflow**.

Tras ~30-60 segundos, ver los logs:
- **✅ Secrets configurados**
- **Respuesta del endpoint** con JSON `{"success":true, "processed":5, ...}`
- **Resumen** con métricas

Si **falla**:
- `BATCH_ENDPOINT secret no configurado` → repetir paso 3.
- `Unauthorized` → la `BATCH_API_KEY` de GitHub ≠ la de Script Properties. Repetir paso 3.
- `Firestore OAuth: ...` → service account sin permisos. Repetir paso 1.
- `SERVICE_ACCOUNT_PRIVATE_KEY no configurado` → repetir paso 2.5.

---

## 5. Activación del cron diario

El cron está en el workflow ya configurado: `0 2 * * *` (02:00 UTC todos los días). Se activa automáticamente la próxima medianoche tras el primer push del workflow al main branch.

Para verificar las próximas ejecuciones programadas:
- **Actions** → **Batch Qualify Studios** → vista de "scheduled".

---

## 6. Monitoreo y operación

### Consultar el estado del último batch

En Firestore, documento `_meta/batch_checkpoint`:

```javascript
{
  trigger: "github_actions",
  procesandose_por: null,         // null si terminó, 'github_actions' o 'mac_local' si activo
  filtro: "sin_cuadrante",
  limite: 200,
  processed: 200,
  updated: 17,
  cambiosCuadrante: 12,
  nuevosCandidatosPuente: 3,
  lastId: "3187",
  status: "done",
  startedAt: "2026-05-20T02:00:01Z",
  finishedAt: "2026-05-20T02:01:43Z",
  durationSec: 102,
  errorsCount: 0
}
```

Desde el CRM puedes inspeccionarlo en consola:
```javascript
await firestoreDB.collection('_meta').doc('batch_checkpoint').get().then(d => d.data());
```

### Race con Mac launchd

Si tu Mac arranca a las 02:00 UTC (improbable), ambos procesos podrían chocar. Mitigación: el campo `procesandose_por` indica cuál está corriendo. El cliente lee este campo y se inhibe si encuentra `procesandose_por === 'github_actions'`.

### Re-procesar la cartera completa

Una vez al mes conviene refrescar el scoring entero:

```bash
gh workflow run batch-qualify.yml -f filtro=todos -f limite=1585
```

Esto recorre los 1585 studios. Como es idempotente, solo escribe los que cambien.

---

## 7. Resumen para retomar

| Componente | Estado |
|---|---|
| Service account GCP | ✅ creado paso 1 |
| OAuth2 library en GAS | ✅ instalado paso 2.2 |
| `gas-batch-qualify.gs` en proyecto GAS | ✅ paso 2.3 |
| `doPost(e)` con switch `batchQualify` | ✅ paso 2.4 |
| Script Properties (4 props) | ✅ paso 2.5 |
| Deploy del web app | ✅ paso 2.8 |
| GitHub secrets (`BATCH_ENDPOINT`, `BATCH_API_KEY`) | ✅ paso 3 |
| Test end-to-end | ✅ paso 4 |

Bloque 2B del plan v1.1 cubierto.
