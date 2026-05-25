-- =====================================================================
-- placsp_adjudicaciones — histórico de adjudicaciones PLACSP cruzadas
--
-- Bloque 10 §19.3 + cierre migración Supabase 2026-05-25.
--
-- Antes vivía en Firestore: placsp_adjudicaciones/{year-month}/items/{id}
-- Ahora aquí, con un row por adjudicación parseada del feed ATOM.
--
-- También dejamos índice GIN sobre studios.data para query rápida de
-- studios con alerta PLACSP activa (tieneAlertaPlacsp = true dentro del JSONB).
-- =====================================================================
CREATE TABLE IF NOT EXISTS placsp_adjudicaciones (
  -- Identidad
  adjudicacion_id     TEXT PRIMARY KEY,                  -- el id Atom del feed (puede tener tag:contrataciondelestado.es,…)
  year_month          TEXT NOT NULL,                     -- "2026-05" — útil para particionado lógico
  fecha               DATE,                              -- fecha updated del entry
  titulo              TEXT,
  organismo           TEXT,
  importe             NUMERIC,
  lugar               TEXT,
  cpv                 TEXT[],                            -- los primeros 3 CPVs
  url                 TEXT,                              -- href del entry
  adjudicatario       TEXT,                              -- nombre crudo de la empresa ganadora
  adjudicatario_norm  TEXT,                              -- nombre normalizado (lowercase, sin sufijos S.L./S.A.)

  -- Cruce con cartera
  cruzado             BOOLEAN DEFAULT FALSE,             -- TRUE si matcheó con un studio existente
  studio_id           TEXT REFERENCES studios(id) ON DELETE SET NULL,

  -- Metadatos
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_placsp_year_month   ON placsp_adjudicaciones(year_month);
CREATE INDEX IF NOT EXISTS idx_placsp_studio_id    ON placsp_adjudicaciones(studio_id);
CREATE INDEX IF NOT EXISTS idx_placsp_adj_norm     ON placsp_adjudicaciones(adjudicatario_norm);
CREATE INDEX IF NOT EXISTS idx_placsp_fecha_desc   ON placsp_adjudicaciones(fecha DESC);

ALTER TABLE placsp_adjudicaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon read placsp"  ON placsp_adjudicaciones;
DROP POLICY IF EXISTS "anon write placsp" ON placsp_adjudicaciones;
CREATE POLICY "anon read placsp"  ON placsp_adjudicaciones FOR SELECT USING (true);
CREATE POLICY "anon write placsp" ON placsp_adjudicaciones FOR ALL USING (true) WITH CHECK (true);

-- Índice GIN parcial para "studios con alerta PLACSP activa"
-- Esto acelera el dashboard de bandeja del agente.
CREATE INDEX IF NOT EXISTS idx_studios_data_placsp_alert
  ON studios USING GIN ((data -> 'tieneAlertaPlacsp'));
