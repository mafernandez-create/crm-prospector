-- Scoring v2.1 — columna de confianza (completitud de datos del scoring).
-- Valores: 'alta' | 'media' | 'baja'. NULL para estudios aún no recalculados con v2.1.
-- La escribe el batch-qualify (service_role, ignora RLS).
ALTER TABLE studios ADD COLUMN IF NOT EXISTS scoring_confianza text;
