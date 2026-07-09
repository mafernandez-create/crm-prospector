# sync-contact — CRM → Google Contacts (People API)

Empuja contactos del CRM a **Google Contacts de `ma.fernandez@grupogpf.com`**.
Como esa cuenta de Google está añadida en el iPhone/Mac (Ajustes → Contactos),
los contactos se sincronizan solos a todos tus dispositivos. **No se guarda
ninguna credencial**: el script se ejecuta *como* tu cuenta.

## Despliegue (una sola vez)

Todo esto **con la sesión de `ma.fernandez@grupogpf.com`** en el navegador.

1. Ve a <https://script.google.com> → **Nuevo proyecto**.
2. Pega el contenido de [`Code.gs`](Code.gs) en el archivo `Código.gs`.
3. Icono de engranaje ⚙️ (Configuración del proyecto) → marca
   **"Mostrar archivo de manifiesto appsscript.json"**. Abre `appsscript.json`
   y pega el contenido de [`appsscript.json`](appsscript.json). Guarda.
   (Esto activa la People API y fija los permisos.)
4. **Probar el tubo (PASO 1):** selecciona la función `testSyncContact` en la
   barra superior y pulsa **▷ Ejecutar**. La primera vez pedirá autorizar
   permisos de Contactos → **Permitir**.
   - ✅ **Hecho** = aparece *"CRM GPF · Contacto de prueba"* en
     <https://contacts.google.com> y, poco después, en tu iPhone.
   - Para limpiar: ejecuta `testDeleteSelftest`.
5. **Publicar como Web App:** *Implementar → Nueva implementación → Aplicación web*:
   - **Ejecutar como:** Yo (`ma.fernandez@grupogpf.com`)
   - **Quién tiene acceso:** Cualquier usuario
   - Copia la **URL** que termina en `/exec`.
6. Pega esa URL en `redesign/data.js` → constante `GAS_CONTACTS_URL`.

> **Desplegado (9 jul 2026, v1)** como `ma.fernandez@grupogpf.com`, acceso
> "Cualquier usuario", ejecutar como yo. URL en producción:
> `https://script.google.com/macros/s/AKfycbwUZfwYRzuM9RNLVIB0pyk0SgkGw30sSRFg_O28ieAgZQOwUKBflkYx8tOoHfFgs5M/exec`
> Para publicar cambios del `Code.gs`: *Implementar → Gestionar implementaciones →
> editar la implementación → Nueva versión* (así la URL NO cambia).

## API (la usa el botón de la ficha)

`POST {URL}/exec?action=syncContact&sbToken=<jwt-supabase>`
Body JSON:

```jsonc
// Crear/actualizar
{ "op": "upsert", "studio": { "id": "3001", "name": "...", "phone": "...", ... },
  "resourceName": "people/c123"  /* opcional: si ya existía, para actualizarlo */ }

// Borrar
{ "op": "delete", "studio": { "id": "3001" }, "resourceName": "people/c123" }
```

Respuesta upsert: `{ ok: true, resourceName, etag }`. El cliente guarda
`resourceName` en `studio.data` para futuras actualizaciones/borrados.

## Seguridad

Valida el `sbToken` de Supabase contra `/auth/v1/user`: solo un usuario logueado
en el CRM puede disparar la sincronización. La anon key incluida es pública
(la misma que ya va en el cliente).

## Nota

El Edge Function de iCloud (`supabase/functions/sync-contact/`) queda **aparcado**
como alternativa; con Google Contacts no hace falta.
