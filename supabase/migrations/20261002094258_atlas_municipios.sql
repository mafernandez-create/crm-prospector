-- Atlas del Agua → CRM: quién gestiona el agua en cada municipio de España.
--
-- Tabla DERIVADA. La fuente de verdad es el repo privado atlas-del-agua-gpf (data/).
-- Se regenera con  atlas-del-agua-gpf/scripts/exportar_crm.py  y se recarga con
-- crm/scripts/atlas-agua/cargar.mjs. Nunca se edita a mano.
--
-- El CRM solo la LEE: la política de abajo da SELECT a `authenticated` y nada más,
-- así que ninguna pantalla puede escribir aquí ni por error. La carga va con
-- service_role, que se salta RLS.
--
-- Sin nombres de persona: ni presidentes/directores de los organismos de cuenca ni
-- responsables de contratación. Solo datos de entidad (fuente: Atlas, 2026-09-30).

create table if not exists public.atlas_municipios (
  ine                 text primary key,
  municipio           text not null,
  provincia_ine       text,
  provincia           text,
  gestion             text,            -- 'operador' | 'directa' (gestión directa del ayuntamiento)
  operador_id         text,
  operador            text,
  operador_tipo       text,
  grupo_id            text,
  grupo               text,
  demarcacion_id      text,
  demarcacion         text,
  demarcacion_tipo    text,
  organismo_id        text,            -- varios separados por ';' en 3 demarcaciones
  organismo           text,
  organismo_sede      text,
  organismo_telefono  text,
  organismo_email     text,
  organismo_web       text,
  oficina_localidad   text,
  oficina_direccion   text,
  oficina_telefono    text,
  oficina_web         text,
  oficina_km          integer,         -- distancia del municipio a esa oficina
  fuente              text,            -- de dónde sale la asignación de operador
  fecha_datos         date,            -- última carga del Atlas
  fecha_export        date
);
create index if not exists atlas_municipios_prov_idx on public.atlas_municipios (provincia);
create index if not exists atlas_municipios_muni_idx on public.atlas_municipios (municipio);
create index if not exists atlas_municipios_op_idx   on public.atlas_municipios (operador_id);
alter table public.atlas_municipios enable row level security;

drop policy if exists "auth read atlas_municipios" on public.atlas_municipios;
create policy "auth read atlas_municipios"
  on public.atlas_municipios for select to authenticated using (true);

comment on table public.atlas_municipios is
  'Derivada del Atlas del Agua GPF. Solo lectura para el CRM; se recarga entera desde el Atlas.';
