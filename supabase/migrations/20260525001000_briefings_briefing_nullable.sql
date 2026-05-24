-- Permitir que briefings.briefing sea NULL cuando el formato es markdown_v2.
-- En v1 (json_v1) el contenido vive en la columna `briefing` JSONB.
-- En v2 (markdown_v2) vive en la columna `markdown` y `briefing` es null.

ALTER TABLE briefings
  ALTER COLUMN briefing DROP NOT NULL;
