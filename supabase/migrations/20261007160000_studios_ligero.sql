-- Vista ligera de studios para la carga inicial del CRM (rendimiento).
--
-- Por qué: loadAll() descargaba la tabla studios entera (~14 MB de JSON). De eso,
-- ~4,9 MB son los .docx de los informes guardados en base64 dentro de
-- data.reports[] (claves fileData, file y data). Es binario: no se comprime al
-- viajar y la carga inicial no lo usa. Solo lo lee acciones.js (extraer texto de
-- los Word para "acciones pendientes"), que ahora lo pide aparte a la tabla.
--
-- Qué hace: la vista devuelve las mismas columnas que studios, pero en cada
-- informe quita esas tres claves (solo si son texto) y deja "_bin": <posición
-- original del informe en el array>. El cliente usa esa marca para que una
-- escritura hecha desde la versión ligera NO borre los adjuntos
-- (data-supabase.js → _restaurarBinarios).
--
-- Solo lectura. No toca datos. security_invoker = true: la vista respeta la RLS
-- de studios con el usuario que consulta (sin esto, una vista salta la RLS).

create or replace function public._informe_ligero(r jsonb, i integer)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(r) = 'object' and (
         jsonb_typeof(r->'fileData') = 'string'
      or jsonb_typeof(r->'file')     = 'string'
      or jsonb_typeof(r->'data')     = 'string')
    then (r
          - (case when jsonb_typeof(r->'fileData') = 'string' then 'fileData' else '' end)
          - (case when jsonb_typeof(r->'file')     = 'string' then 'file'     else '' end)
          - (case when jsonb_typeof(r->'data')     = 'string' then 'data'     else '' end)
         ) || jsonb_build_object('_bin', i)
    else r
  end
$$;

create or replace view public.studios_ligero
with (security_invoker = true)
as
select
  s.id, s.name, s.type, s.city, s.province, s.score, s.priority, s.status,
  s.priority_quadrant, s.priority_quadrant_name, s.priority_direct, s.priority_direct_score,
  s.priority_network, s.priority_network_score, s.priority_direct_score_natural,
  s.priority_network_score_natural, s.es_cliente_puente, s.fuente_descubrimiento,
  case
    when jsonb_typeof(s.data->'reports') = 'array' then
      jsonb_set(s.data, '{reports}', (
        select coalesce(jsonb_agg(public._informe_ligero(t.r, (t.o - 1)::integer) order by t.o), '[]'::jsonb)
        from jsonb_array_elements(s.data->'reports') with ordinality as t(r, o)
      ))
    else s.data
  end as data,
  s.created_at, s.updated_at, s.migrated_from_firestore_at, s.scoring_confianza
from public.studios s;

comment on view public.studios_ligero is
  'studios sin los .docx en base64 de data.reports[] (marca _bin = índice original). Carga inicial del CRM.';

revoke all on public.studios_ligero from anon;
grant select on public.studios_ligero to authenticated;
