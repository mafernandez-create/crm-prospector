-- ============================================================================
-- RLS hardening — exigir rol `authenticated` para TODO (hallazgo C1 de la auditoría)
-- ============================================================================
-- Antes: el rol `anon` (key pública embebida en el JS) tenía CRUD completo
-- (FOR ALL USING(true)) y lectura pública sobre toda la BD → cualquiera en
-- Internet podía leer/modificar/borrar 1.608 estudios con PII, sin login.
--
-- Ahora: se elimina TODO acceso `anon` (lectura incluida) y se exige sesión
-- (`authenticated`, vía Supabase Auth) para leer y escribir. Esto cierra:
--   - el write/delete anónimo (vector destructivo + inyección XSS-vía-BD), y
--   - la lectura pública de PII (exposición RGPD).
--
-- IMPACTO:
--   - El NAVEGADOR debe iniciar sesión (redesign/auth.js); con sesión válida usa
--     el JWT del usuario como Bearer y las políticas `authenticated` le dan acceso.
--   - La CI (batch-qualify, placsp-fetch) NO se ve afectada: usa
--     SUPABASE_SERVICE_ROLE_KEY, que BYPASEA RLS.
--
-- PASOS MANUALES en el dashboard de Supabase (no se pueden hacer por SQL/CLI):
--   1) Authentication → Providers → habilitar "Email".
--   2) Authentication → Providers → Email → desactivar "Confirm email"
--      (o confirmar manualmente el usuario), al ser un único operador.
--   3) Authentication → Users → "Add user" con el email + contraseña de Manolo.
--   4) Aplicar esta migración (supabase db push o SQL editor).
--   5) Rotar la anon key (asumida comprometida: está en git y producción).
--
-- Idempotente.
-- ============================================================================

ALTER TABLE studios               ENABLE ROW LEVEL SECURITY;
ALTER TABLE briefings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_planificador     ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_kv               ENABLE ROW LEVEL SECURITY;
ALTER TABLE placsp_adjudicaciones ENABLE ROW LEVEL SECURITY;

-- studios
DROP POLICY IF EXISTS "anon read studios"  ON studios;
DROP POLICY IF EXISTS "anon write studios" ON studios;
DROP POLICY IF EXISTS "auth all studios"   ON studios;
CREATE POLICY "auth all studios" ON studios FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- briefings
DROP POLICY IF EXISTS "anon read briefings"  ON briefings;
DROP POLICY IF EXISTS "anon write briefings" ON briefings;
DROP POLICY IF EXISTS "auth all briefings"   ON briefings;
CREATE POLICY "auth all briefings" ON briefings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- meta_planificador
DROP POLICY IF EXISTS "anon read meta_planificador"  ON meta_planificador;
DROP POLICY IF EXISTS "anon write meta_planificador" ON meta_planificador;
DROP POLICY IF EXISTS "auth all meta_planificador"   ON meta_planificador;
CREATE POLICY "auth all meta_planificador" ON meta_planificador FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- meta_kv
DROP POLICY IF EXISTS "anon read meta_kv"  ON meta_kv;
DROP POLICY IF EXISTS "anon write meta_kv" ON meta_kv;
DROP POLICY IF EXISTS "auth all meta_kv"   ON meta_kv;
CREATE POLICY "auth all meta_kv" ON meta_kv FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- placsp_adjudicaciones
DROP POLICY IF EXISTS "anon read placsp"  ON placsp_adjudicaciones;
DROP POLICY IF EXISTS "anon write placsp" ON placsp_adjudicaciones;
DROP POLICY IF EXISTS "auth all placsp"   ON placsp_adjudicaciones;
CREATE POLICY "auth all placsp" ON placsp_adjudicaciones FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- NOTA: ninguna política para `anon`. service_role (CI) ignora RLS.
