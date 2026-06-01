-- Permitir decimales en columnas de scoring.
-- Bug detectado al migrar el backup vivo: priorityNetworkScore puede ser
-- decimal (ej. 4.5) y SMALLINT no acepta decimales en Postgres.
-- Cambio a REAL para conservar precisión sin coste apreciable.

ALTER TABLE studios
  ALTER COLUMN score                          TYPE REAL,
  ALTER COLUMN priority_direct_score          TYPE REAL,
  ALTER COLUMN priority_network_score         TYPE REAL,
  ALTER COLUMN priority_direct_score_natural  TYPE REAL,
  ALTER COLUMN priority_network_score_natural TYPE REAL;

-- priority_quadrant se queda SMALLINT (1-9, siempre entero).
