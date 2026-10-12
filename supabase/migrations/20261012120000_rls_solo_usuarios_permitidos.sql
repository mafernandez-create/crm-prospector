-- Segunda barrera de acceso (auditoria de seguridad, 12-oct-2026).
--
-- Hasta ahora las politicas eran `TO authenticated USING (true)`: cualquier
-- cuenta que se diera de alta en Supabase leia y borraba toda la base. Ahora,
-- ademas de tener sesion, el correo del JWT tiene que estar en
-- private.usuarios_permitidos. Los scripts y crons usan service_role y no
-- pasan por RLS, asi que no les afecta.
--
-- Dar acceso a alguien mas: insert into private.usuarios_permitidos values ('correo');

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table if not exists private.usuarios_permitidos (
  email text primary key check (email = lower(email))
);
revoke all on private.usuarios_permitidos from public, anon, authenticated;
insert into private.usuarios_permitidos (email)
values ('ma.fernandez@grupogpf.com')
on conflict do nothing;

-- SECURITY DEFINER para poder leer la lista sin dar acceso a la tabla. Vive en
-- `private`, que PostgREST no expone, asi que no se puede llamar por /rpc.
create or replace function private.es_usuario_permitido()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.usuarios_permitidos
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function private.es_usuario_permitido() from public, anon;
grant execute on function private.es_usuario_permitido() to authenticated;

-- Rehace cada politica con la misma operacion y la condicion nueva.
-- `(select ...)` hace que Postgres evalue la funcion una vez por consulta.
do $$
declare
  t text;
begin
  foreach t in array array['briefings','meta_kv','meta_planificador',
    'placsp_adjudicaciones','resumenes_semanales','studios','visitas'] loop
    execute format('drop policy if exists %I on public.%I',
      case t when 'placsp_adjudicaciones' then 'auth all placsp' else 'auth all ' || t end, t);
    execute format('create policy %I on public.%I for all to authenticated '
      'using ((select private.es_usuario_permitido())) '
      'with check ((select private.es_usuario_permitido()))',
      case t when 'placsp_adjudicaciones' then 'auth all placsp' else 'auth all ' || t end, t);
  end loop;

  foreach t in array array['atlas_municipios','gpf_digest_semanal','placsp_interesantes'] loop
    execute format('drop policy if exists %I on public.%I', 'auth read ' || t, t);
    execute format('create policy %I on public.%I for select to authenticated '
      'using ((select private.es_usuario_permitido()))', 'auth read ' || t, t);
  end loop;
end $$;

drop policy if exists "ia_precios_select_auth" on public.ia_precios;
create policy "ia_precios_select_auth" on public.ia_precios for select to authenticated
  using ((select private.es_usuario_permitido()));

drop policy if exists "ia_uso_select_auth" on public.ia_uso;
create policy "ia_uso_select_auth" on public.ia_uso for select to authenticated
  using ((select private.es_usuario_permitido()));

drop policy if exists "ia_uso_insert_auth" on public.ia_uso;
create policy "ia_uso_insert_auth" on public.ia_uso for insert to authenticated
  with check ((select private.es_usuario_permitido()));

drop policy if exists "auth insert report_audit" on public.report_audit;
create policy "auth insert report_audit" on public.report_audit for insert to authenticated
  with check ((select private.es_usuario_permitido()));
