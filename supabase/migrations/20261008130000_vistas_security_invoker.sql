-- visitas_sin_informe y v_placsp_adjudicaciones_gpf corrian con los permisos
-- de su dueño (postgres) y se saltaban el RLS: con la anon key (publica, va en
-- data-supabase.js) se leian 19 visitas y 277 adjudicaciones. El CRM las lee con
-- sesion y el cron del digest como postgres, asi que a ninguno le afecta.
alter view public.visitas_sin_informe set (security_invoker = on);
alter view public.v_placsp_adjudicaciones_gpf set (security_invoker = on);
revoke all on public.visitas_sin_informe from anon;
revoke all on public.v_placsp_adjudicaciones_gpf from anon;
-- search_path fijo (aviso del linter de Supabase)
alter function public.touch_updated_at() set search_path = public, pg_temp;
alter function public.loop_purgar() set search_path = public, pg_temp;
alter function public.gpf_generar_digest_semanal(integer) set search_path = public, pg_temp;
