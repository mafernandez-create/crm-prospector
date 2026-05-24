-- CRM Prospector — esquema inicial Supabase
-- Migración desde Firestore (proyecto ferroplast-crm)
-- Fecha: 2026-05-23
--
-- Modelo: tablas relacionales + JSONB para todo lo que en Firestore vivía
-- como mapas anidados (data.contact, data.team, data.reports, etc.).
-- Decisión de diseño: mantenemos los IDs de studios como TEXT (los hay
-- numéricos "3001" y alfanuméricos "hh9L"). UUIDs nuevos solo para
-- las filas que en Firestore eran subcolecciones (briefings).

-- =====================================================================
-- EXTENSIONES
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================
-- TABLA: studios — la cartera principal (1597 documentos en Firestore)
-- =====================================================================
CREATE TABLE IF NOT EXISTS studios (
  -- Identidad
  id                          TEXT PRIMARY KEY,         -- "3001", "hh9L", etc.

  -- Atributos planos (los más consultados en filtros y listados)
  name                        TEXT,
  type                        TEXT,                     -- ARQ, ING, CCRR, OCV, CICA, AAPP
  city                        TEXT,
  province                    TEXT,
  score                       SMALLINT,
  priority                    TEXT,                     -- alta/media/baja
  status                      TEXT,                     -- nuevo/contactado/reunion/ganado

  -- Scoring v2 (Bloque 7 del plan v1.1)
  priority_quadrant           SMALLINT,                 -- 1-9
  priority_quadrant_name      TEXT,
  priority_direct             TEXT,
  priority_direct_score       SMALLINT,
  priority_network            TEXT,
  priority_network_score      SMALLINT,
  priority_direct_score_natural   SMALLINT,
  priority_network_score_natural  SMALLINT,

  -- Detección de cliente puente (Bloque 8)
  es_cliente_puente           BOOLEAN DEFAULT FALSE,
  fuente_descubrimiento       JSONB,                    -- {valor, fuente_url} o string

  -- Resto del documento Firestore: contact, team, reports, activities,
  -- projects, notes, comms, description, studio, etc.
  data                        JSONB DEFAULT '{}'::JSONB,

  -- Metadatos
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW(),
  migrated_from_firestore_at  TIMESTAMPTZ              -- NULL si nunca se ha migrado
);

-- Índices para queries habituales
CREATE INDEX IF NOT EXISTS idx_studios_province          ON studios(province);
CREATE INDEX IF NOT EXISTS idx_studios_type              ON studios(type);
CREATE INDEX IF NOT EXISTS idx_studios_score             ON studios(score);
CREATE INDEX IF NOT EXISTS idx_studios_status            ON studios(status);
CREATE INDEX IF NOT EXISTS idx_studios_priority_quadrant ON studios(priority_quadrant);
CREATE INDEX IF NOT EXISTS idx_studios_es_cliente_puente ON studios(es_cliente_puente) WHERE es_cliente_puente = TRUE;
-- GIN sobre el JSONB para queries puntuales tipo data->>'description'
CREATE INDEX IF NOT EXISTS idx_studios_data_gin ON studios USING GIN (data);

-- =====================================================================
-- TABLA: briefings — antes Firestore briefings/{studio_id}/items/{iso}
-- =====================================================================
CREATE TABLE IF NOT EXISTS briefings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id           TEXT NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  iso_date            TEXT NOT NULL,                    -- "2026-05-23T11-32-12-345Z" (clave en Firestore)
  fecha_visita        DATE,                             -- fecha de la visita planificada
  briefing            JSONB NOT NULL,                   -- las 8 secciones
  markdown            TEXT,                             -- opcional: render markdown precalculado
  contexto_extra      TEXT,
  studio_snapshot     JSONB,                            -- snapshot del studio en el momento
  generated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (studio_id, iso_date)
);

CREATE INDEX IF NOT EXISTS idx_briefings_studio  ON briefings(studio_id);
CREATE INDEX IF NOT EXISTS idx_briefings_fecha   ON briefings(fecha_visita);
CREATE INDEX IF NOT EXISTS idx_briefings_gen_at  ON briefings(generated_at DESC);

-- =====================================================================
-- TABLA: meta_planificador — antes Firestore _meta/planificador
-- Fila única (id=1). El schedule entero vive en una columna JSONB.
-- =====================================================================
CREATE TABLE IF NOT EXISTS meta_planificador (
  id          SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  schedule    JSONB DEFAULT '{}'::JSONB,                -- { "2026-05-23": [{...}, ...] }
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Inicializa la única fila si no existe
INSERT INTO meta_planificador (id, schedule) VALUES (1, '{}') ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- TABLA: meta_kv — genérica para todos los demás _meta/* de Firestore
-- (batch_checkpoint, search_metrics, counters, referencias_cruzadas…)
-- =====================================================================
CREATE TABLE IF NOT EXISTS meta_kv (
  key         TEXT PRIMARY KEY,                         -- "batch_checkpoint", "search_metrics", etc.
  value       JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- TRIGGERS — auto updated_at
-- =====================================================================
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_studios_updated_at ON studios;
CREATE TRIGGER trg_studios_updated_at
  BEFORE UPDATE ON studios
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_meta_planificador_updated_at ON meta_planificador;
CREATE TRIGGER trg_meta_planificador_updated_at
  BEFORE UPDATE ON meta_planificador
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_meta_kv_updated_at ON meta_kv;
CREATE TRIGGER trg_meta_kv_updated_at
  BEFORE UPDATE ON meta_kv
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- =====================================================================
-- ROW LEVEL SECURITY
-- Mantener PARIDAD con Firestore actual: cualquiera con la anon key
-- puede leer y escribir. Si más adelante queremos endurecer, cambiamos
-- estas policies.
-- =====================================================================
ALTER TABLE studios            ENABLE ROW LEVEL SECURITY;
ALTER TABLE briefings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_planificador  ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_kv            ENABLE ROW LEVEL SECURITY;

-- studios: lectura y escritura abierta
DROP POLICY IF EXISTS "anon read studios"  ON studios;
DROP POLICY IF EXISTS "anon write studios" ON studios;
CREATE POLICY "anon read studios"  ON studios FOR SELECT USING (true);
CREATE POLICY "anon write studios" ON studios FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon read briefings"  ON briefings;
DROP POLICY IF EXISTS "anon write briefings" ON briefings;
CREATE POLICY "anon read briefings"  ON briefings FOR SELECT USING (true);
CREATE POLICY "anon write briefings" ON briefings FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon read meta_planificador"  ON meta_planificador;
DROP POLICY IF EXISTS "anon write meta_planificador" ON meta_planificador;
CREATE POLICY "anon read meta_planificador"  ON meta_planificador FOR SELECT USING (true);
CREATE POLICY "anon write meta_planificador" ON meta_planificador FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon read meta_kv"  ON meta_kv;
DROP POLICY IF EXISTS "anon write meta_kv" ON meta_kv;
CREATE POLICY "anon read meta_kv"  ON meta_kv FOR SELECT USING (true);
CREATE POLICY "anon write meta_kv" ON meta_kv FOR ALL USING (true) WITH CHECK (true);
