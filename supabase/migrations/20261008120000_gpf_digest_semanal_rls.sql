-- gpf_digest_semanal tenia RLS desactivado: con la anon key (publica, va en
-- data-supabase.js) cualquiera podia leerla o modificarla. La escribe el cron
-- pg_cron `gpf_digest_semanal_lunes` como postgres (dueño de la tabla), al que
-- RLS no afecta, asi que el cron sigue igual. Lectura solo con sesion.
alter table public.gpf_digest_semanal enable row level security;
create policy "auth read gpf_digest_semanal" on public.gpf_digest_semanal for select to authenticated using (true);
