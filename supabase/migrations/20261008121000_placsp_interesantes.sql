-- Licitaciones marcadas como «interesantes» en el PLACSP Monitor
-- (GET /api/crm/interesantes, secreto X-Cron-Secret). Antes las consumia CRM3,
-- retirado el 8-oct-2026. Las sincroniza scripts/placsp-interesantes.js en el
-- placsp-daily; la Bandeja las lee. Solo escribe la service role.
create table if not exists public.placsp_interesantes (
  monitor_id         bigint primary key,
  expediente         text,
  titulo             text,
  organo             text,
  entidad            text,  -- organo sin el cargo que firma
  estado             text,
  tipo_contrato      text,
  presupuesto        numeric,
  fecha_presentacion timestamptz,
  fecha_publicacion  timestamptz,
  lugar              text,
  link               text,
  veredicto          text,
  veredicto_razon    text,
  resumen_ia         text,
  marcada_at         timestamptz,
  studio_id          text references public.studios(id) on delete set null,
  vigente            boolean not null default true,
  primera_vez        timestamptz not null default now(),
  actualizada        timestamptz not null default now(),
  datos              jsonb
);
comment on table public.placsp_interesantes is 'Licitaciones marcadas como interesantes en el PLACSP Monitor (GET /api/crm/interesantes). La sincroniza scripts/placsp-interesantes.js a diario; vigente=false cuando se desmarcan en el Monitor.';
create index if not exists placsp_interesantes_vigente_idx on public.placsp_interesantes (vigente, marcada_at desc);
alter table public.placsp_interesantes enable row level security;
create policy "auth read placsp_interesantes" on public.placsp_interesantes for select to authenticated using (true);
