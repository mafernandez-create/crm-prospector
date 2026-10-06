-- 84 visitas pasadas en «planificada» cerradas como NO VISITADAS
--
-- Decision de Manolo, 6-oct-2026, al terminar la limpieza del historico de visitas.
-- Es el tercer y ultimo bloque de las 132 visitas pasadas que seguian en «planificada»:
--   · 47 tenian informe escrito  -> pasaron a «realizada» (20261006160000)
--   ·  1 la anulo el cliente     -> «anulada» + cancelada-cliente (20261006161000)
--   · 84 nunca se visitaron      -> esta migracion
--
-- QUE SON LAS 84, por origen:
--   · 81 de «hoja-jefe», del 15-ene al 15-jul-2026. Backfill de la hoja del jefe,
--     cargado cuando se monto el CRM. Ninguna tiene informe en el CRM: son visitas
--     que o no se hicieron, o se hicieron antes de que existiera el circuito actual
--     de informes y no dejaron rastro. No se puede distinguir una cosa de otra a
--     dia de hoy, asi que se cierran todas igual: no visitadas.
--   ·  3 de «planificador»: 410 (2-jun, «Reunion cliente Rafael Amador», posible
--     duplicada de la 217 del mismo dia), 294 (15-jun, Ayesa sede central) y
--     488 (7-sep, Ayuntamiento de Totana). Planificadas, no realizadas, sin informe.
--
-- POR QUE «anulada» Y NO OTRO ESTADO: la tabla solo tiene realizada / planificada /
-- anulada, y una visita pasada que no se hizo no puede quedarse en «planificada»
-- —reclama un informe que nunca va a existir y envenena la vista visitas_sin_informe
-- y el recuento de informes pendientes—.
--
-- POR QUE volver_a_planificar = true EN TODAS: no visitar no es descartar. Estas 84
-- empresas siguen siendo cartera por visitar; cerrarlas sin la marca las sacaria del
-- circuito de prospeccion sin que nadie se diera cuenta. Igual que se hizo con Fomintax.
--
-- EFECTO ESPERADO: visitas en «planificada» con fecha pasada: 84 -> 0.
-- La vista visitas_sin_informe baja de 100 a 17: salen 83 de las 84 por el filtro
-- estado <> 'anulada'. La 84.ª (144, Proinaqua, 8-abr) ya no estaba en la vista,
-- porque su ficha tiene un informe del 14-sep y el predicado de la vista no tiene
-- limite por arriba (informe >= fecha - 3).
--
-- Listado nominal entregado a Manolo antes de aplicar:
--   ~/Downloads/Visitas-no-realizadas-2026-10-06.xlsx (cliente, fecha, ciudad, ficha, ruta).

-- Guarda de entrada: exactamente 84 visitas pasadas en «planificada», y ninguna de
-- ellas con informe en la ventana de produccion (-3/+21 dias).
do $$
declare n int; con_informe int;
begin
  select count(*) into n from visitas where estado = 'planificada' and fecha < current_date;
  if n <> 84 then
    raise exception 'Abortada: se esperaban 84 visitas planificadas pasadas, hay %. Recalcular antes de aplicar.', n;
  end if;

  select count(*) into con_informe
  from visitas v join studios s on s.id = v.studio_id
  where v.estado = 'planificada' and v.fecha < current_date
    and exists (
      select 1 from jsonb_array_elements(s.data->'reports') r
      where jsonb_typeof(s.data->'reports') = 'array'
        and left(coalesce(r.value->>'iso_date', r.value->>'date'), 10)
            between (v.fecha - 3)::text and (v.fecha + 21)::text);
  if con_informe <> 0 then
    raise exception 'Abortada: % de las 84 tienen informe en ventana; esas no son «no visitadas».', con_informe;
  end if;
end $$;

-- 81 de la hoja del jefe
update visitas
set estado = 'anulada',
    motivo_no_realizada = 'no-visitada: cerrada en bloque el 6-oct-2026. Visita de la hoja del jefe (ene-jul 2026) sin informe en el CRM, anterior al circuito actual de informes. Sigue siendo cartera por visitar.',
    volver_a_planificar = true,
    updated_at = now()
where id in (13,15,23,24,28,36,37,38,39,40,41,44,45,53,54,56,57,58,59,60,61,62,63,64,
             65,66,77,90,91,96,97,98,99,113,115,121,122,124,125,140,144,145,146,147,
             148,176,193,201,202,203,204,215,217,225,229,230,231,233,234,236,237,238,
             240,242,243,244,246,247,250,255,256,266,267,268,269,270,271,275,277,278,
             279)
  and estado = 'planificada';

-- 3 del planificador
update visitas
set estado = 'anulada',
    motivo_no_realizada = 'no-visitada: cerrada en bloque el 6-oct-2026. Planificada y no realizada, sin informe en el CRM. Sigue siendo cartera por visitar.',
    volver_a_planificar = true,
    updated_at = now()
where id in (410,294,488)
  and estado = 'planificada';

-- Comprobacion de salida
do $$
declare n int; m int;
begin
  select count(*) into n from visitas where estado = 'planificada' and fecha < current_date;
  if n <> 0 then
    raise exception 'Abortada: tras el cambio no deberia quedar ninguna planificada pasada, quedan %.', n;
  end if;
  select count(*) into m from visitas
  where estado = 'anulada' and volver_a_planificar = true
    and motivo_no_realizada like 'no-visitada: cerrada en bloque el 6-oct-2026%';
  if m <> 84 then
    raise exception 'Abortada: se esperaban 84 filas marcadas como no visitadas, hay %.', m;
  end if;
end $$;

-- ROLLBACK COMPLETO:
-- update visitas set estado = 'planificada', motivo_no_realizada = null,
--        volver_a_planificar = null, updated_at = now()
--  where motivo_no_realizada like 'no-visitada: cerrada en bloque el 6-oct-2026%';
