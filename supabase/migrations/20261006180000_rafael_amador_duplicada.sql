-- Rafael Amador (2-jun-2026): una sola visita, no dos
--
-- Confirmado por Manolo el 6-oct-2026: «Rafael Amador es uno solo».
--
-- Habia dos filas para el mismo dia y la misma persona, cargadas por vias distintas:
--   · 217 «Rafael Amador», origen hoja-jefe, ruta «Backfill hoja del jefe ene-jul 2026»,
--     creada el 1-sep-2026 al volcar la hoja del jefe.
--   · 410 «Reunion cliente Rafael Amador», origen planificador, ruta «Planificador · Huelva»,
--     creada el 18-sep-2026. Esta es la duplicada.
-- Ninguna de las dos tiene ficha ni nota, y las dos quedaron cerradas como no visitadas
-- en la migracion 20261006170000.
--
-- Se conserva la 217 (el registro que viene de la hoja del jefe, que es la fuente) y la 410
-- pasa a motivo «duplicada» con volver_a_planificar = false, para que Rafael Amador aparezca
-- UNA sola vez en la cartera por visitar. No se borra la fila: el rastro de que el
-- planificador cargo un duplicado el 18-sep es informacion util si vuelve a pasar.

do $$
declare n int;
begin
  select count(*) into n from visitas
  where id in (217, 410) and fecha = '2026-06-02' and estado = 'anulada';
  if n <> 2 then
    raise exception 'Abortada: se esperaban las visitas 217 y 410 anuladas el 2026-06-02, hay %.', n;
  end if;
end $$;

update visitas
set motivo_no_realizada = 'duplicada de la visita 217 (2-jun-2026, Rafael Amador): el planificador la cargo de nuevo el 18-sep. Manolo confirmo el 6-oct-2026 que era una sola visita.',
    volver_a_planificar = false,
    updated_at = now()
where id = 410;

do $$
declare n int;
begin
  select count(*) into n from visitas
  where empresa ilike '%rafael amador%' and volver_a_planificar = true;
  if n <> 1 then
    raise exception 'Abortada: Rafael Amador deberia quedar una sola vez en cartera por visitar, hay %.', n;
  end if;
end $$;

-- ROLLBACK:
-- update visitas set volver_a_planificar = true,
--        motivo_no_realizada = 'no-visitada: cerrada en bloque el 6-oct-2026. Planificada y no realizada, sin informe en el CRM. Sigue siendo cartera por visitar.',
--        updated_at = now()
--  where id = 410;
