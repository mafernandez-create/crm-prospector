# Migración Supabase — runbook

**Estado:** Fase 0 + Fase 1 listas, Fase 2 (sync batch GAS) opcional.
**Rama:** `feature/ui-redesign`, NO desplegado a producción.
**Última actualización:** 2026-05-23

---

## Resumen ejecutivo

El rediseño puede usar Supabase como backend en lugar de Firestore, con
**rollback en una línea**. Hoy hay 2505 studios sembrados desde el backup
de marzo 2026 en Supabase como BBDD de prueba. La migración real con
datos vivos está pendiente de que la cuota de Firestore deje de oscilar.

## Estado por componente

| Componente | Estado | Detalles |
|------------|--------|----------|
| Proyecto Supabase | ✅ Operativo | `ferroplast-crm` en Frankfurt, free tier |
| Schema | ✅ Aplicado | `studios`, `briefings`, `meta_planificador`, `meta_kv` |
| RLS | ✅ Configurado | abierto (paridad con Firestore actual) |
| Datos | 🟡 De prueba | 2505 studios del backup marzo 2026 (no actuales) |
| Adapter rediseño | ✅ `redesign/data-supabase.js` | con paginación Range header |
| Backend switchable | ✅ Flag localStorage | default Firebase |
| Tests integración | ✅ 21/21 PASS | `scripts/tests/integration/test-supabase.js` |
| Sync batch GAS | 🟡 Implementado, no activado | requiere Script Properties en Apps Script |
| Backup Firestore vivo | ⏳ Pendiente | esperando ventana de cuota estable |
| Merge a `main` | ⏳ Pendiente | cuando Manolo confirme |

## Cómo activar Supabase en tu navegador

Cuando esté mergeado a main:

```js
localStorage.setItem('redesign:backend', 'supabase');
location.reload();
```

A partir de ese momento, el rediseño lee y escribe en Supabase.

## Cómo hacer rollback a Firebase

```js
localStorage.setItem('redesign:backend', 'firebase');
location.reload();
```

Vuelves al estado original. Firestore nunca se ha tocado.

## Flujo completo de migración (cuando vuelva Firestore)

```bash
# 1. Backup completo de Firestore a JSON local (no escribe en Firestore)
node scripts/export-firestore-to-json.js
# → ~/Documents/CRM_Ferroplast_Backup_YYYY-MM-DD-HHmm.json

# 2. Limpiar el sembrado de prueba en Supabase (opcional)
#    Si lo haces, hazlo via SQL Editor en el dashboard de Supabase:
#    DELETE FROM studios WHERE id NOT IN (SELECT id FROM studios LIMIT 0);

# 3. Migrar desde el backup recién creado
node scripts/migrate-firestore-to-supabase.js \
  --from-backup ~/Documents/CRM_Ferroplast_Backup_2026-XX-XX.json \
  --only=all

# 4. Validar SQL en Supabase Dashboard:
#    SELECT count(*) FROM studios;
#    SELECT priority_quadrant, count(*) FROM studios GROUP BY 1;

# 5. Merge feature/ui-redesign → main (cuando Manolo confirme)
gh pr create --base main --head feature/ui-redesign --title "..."

# 6. Tras deploy, Manolo activa el flag en su navegador (ver arriba)
```

## Validación E2E hecha (2026-05-23)

Probado contra Supabase real con 2505 studios desde backup marzo:

| Test | Resultado |
|------|-----------|
| `loadAll` con paginación | ✅ 2505 studios cargados en ~2s |
| `getDoc('studios/13')` | ✅ Devuelve forma interna con camelCase |
| `patchDoc('studios/13', {score: 99})` | ✅ Roundtrip 8→99→8 |
| `savePlanificador({…})` | ✅ Roundtrip con cleanup |
| Click en fila → ficha de studio | ✅ |
| Navegación #studios → #mapa → #bandeja | ✅ Sin errores |
| 21 tests integración Supabase | ✅ 21/21 |

## Cosas que NO probé end-to-end

- **Generar briefing IA con backend Supabase activo.** El código está
  ruteado correctamente (`_patchDocActive` lo lleva a Supabase), pero
  no he hecho una generación completa desde la UI. Bajo riesgo: la
  lógica es idéntica a Firestore.
- **Importar XLSX.** Misma situación.
- **Generar informe IA.** Misma situación.
- **iPhone real con flag Supabase.** Solo probado en preview local Chrome.

## Configurar dual-write en el batch GAS (Fase 2 opcional)

`gas-batch-qualify.gs` puede escribir a Firestore Y Supabase. Para
activarlo, en Apps Script:

1. Abrir el proyecto GAS donde está desplegado `gas-batch-qualify.gs`
2. ⚙️ Project Settings → Script properties → Add
3. Añadir las dos claves:
   ```
   SUPABASE_URL                = https://zmelqffrkwxkbzzutjrg.supabase.co
   SUPABASE_SERVICE_ROLE_KEY   = eyJ...    (la del archivo ~/.crm-supabase.env)
   ```
4. Redesplegar el Web App

A partir de ese momento, cada noche el batch escribe los scorings
calculados también en Supabase. Si las propiedades no están definidas,
el batch sigue funcionando exactamente como hoy (solo Firestore).

## Credenciales y secretos

| Recurso | Ubicación | Notas |
|---------|-----------|-------|
| Anon key Supabase | Embebida en `redesign/data-supabase.js` | Pública, va al frontend |
| Service role key | `~/.crm-supabase.env` (perms 600) | NUNCA en repo |
| DB password Postgres | `~/.crm-supabase.env` | Guardar también en tu gestor de claves |
| Project ref | `zmelqffrkwxkbzzutjrg` | También en `~/.crm-supabase.env` |
| Dashboard | https://supabase.com/dashboard/project/zmelqffrkwxkbzzutjrg | |

## Troubleshooting

### "Cartera vacía" con flag Supabase

1. Abre DevTools → Application → Storage → Clear site data → recarga
2. Comprueba en consola: `window.State.studios.length`
3. Si es 0, mira la pestaña Network. Las llamadas a
   `zmelqffrkwxkbzzutjrg.supabase.co/rest/v1/studios` deberían
   devolver 200 con un array.
4. Rollback: `localStorage.setItem('redesign:backend','firebase'); location.reload()`

### "Solo carga 1000 studios"

PostgREST limita por defecto a 1000 rows. Confirma que tienes el
adapter actualizado con `_fetchAllRows` (Range header). Si no:
- `git pull origin feature/ui-redesign`
- Cache-bust con `?_bust=N` en la URL para forzar refresh del JS

### Briefing falla en modo Supabase

1. Confirma que las propiedades SUPABASE_* están en el GAS (no afecta
   al briefing del frontend, pero sí al dual-write nocturno)
2. Mira la consola del navegador en la generación: debe ver
   `[redesign/data-supabase]` en lugar de `[redesign/data]`
3. Si hay error 401/403 en Supabase, comprobar que la anon key del
   `data-supabase.js` no haya expirado (caducan en 100 años, pero
   por si acaso)

### Quiero borrar Supabase y empezar de cero

⚠️ **Esto solo afecta a la BBDD de prueba, no a Firestore.**

```sql
-- En el SQL Editor del Dashboard de Supabase:
TRUNCATE TABLE studios, briefings, meta_kv CASCADE;
UPDATE meta_planificador SET schedule = '{}' WHERE id = 1;
```

Luego volver a correr `migrate-firestore-to-supabase.js`.

## Comandos útiles

```bash
# Tests Supabase (no toca Firestore)
node scripts/tests/integration/test-supabase.js

# Tests completos
node scripts/tests/run-all.js

# Inspeccionar la BBDD via REST con anon key
source ~/.crm-supabase.env
curl -s -H "apikey: $SUPABASE_ANON_KEY" \
  "$SUPABASE_URL/rest/v1/studios?select=count" \
  -H "Prefer: count=exact" \
  -H "Range: 0-0" | head

# Re-aplicar schema (idempotente, no destructivo)
supabase db push --password "$SUPABASE_DB_PASSWORD"
```

## Próximos pasos

1. **Bloqueador:** que la cuota de Firestore deje de oscilar para
   poder hacer backup vivo (probable que el batch nocturno + cron de
   tests estén consumiendo cuota constantemente; auditar)
2. Una vez backup hecho, migrar a Supabase los datos reales
3. Validar counts y distribución por cuadrante
4. Mergear `feature/ui-redesign` → `main`
5. Manolo activa el flag y prueba
6. Si convence, activar dual-write GAS para mantener Supabase al día
7. Si no convence, rollback con flag (no se pierde nada)
