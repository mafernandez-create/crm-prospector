-- Soporte para briefings en formato markdown_v2 (Bloque 9 §19.2).
-- El generador nuevo escribe el briefing como markdown completo en vez de
-- como JSON estructurado. Necesitamos la columna `formato` para que el
-- renderer del cliente sepa qué camino tomar.

ALTER TABLE briefings
  ADD COLUMN IF NOT EXISTS formato TEXT DEFAULT 'json_v1';

-- Briefings existentes son v1 JSON (el campo briefing JSONB sigue siendo
-- la fuente para ellos). Briefings nuevos llevarán formato='markdown_v2'
-- y el contenido vendrá en la columna `markdown` (que ya existe).

CREATE INDEX IF NOT EXISTS idx_briefings_formato ON briefings(formato);
