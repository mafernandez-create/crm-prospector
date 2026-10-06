-- Visita 394, Estudio de Ingenieria Fomintax, 18-sep-2026 (ruta de Almeria, S38).
-- Seguia en `planificada` aunque su propia nota dice «Me llamo para anular la cita
-- por una urgencia». Estado mal puesto: la visita no se hizo y nunca se hara en
-- esa fecha, asi que no puede reclamar informe.
--
-- POR QUE `volver_a_planificar = true` Y NO `anulada` A SECAS: cancelo el cliente,
-- no Manolo. Fomintax sigue siendo cartera por visitar. Cerrarla sin la marca la
-- sacaria del bucle y la empresa se quedaria sin visitar sin que nadie lo note.
-- Es el cierre normal de una cancelacion del cliente.
--
-- Decidido por Manolo el 6-oct-2026.

do $$
declare n int;
begin
  select count(*) into n from visitas
  where id = 394 and estado = 'planificada' and fecha = '2026-09-18';
  if n <> 1 then
    raise exception 'Abortada: la visita 394 no esta planificada con fecha 2026-09-18 (coincidencias: %).', n;
  end if;
end $$;

update visitas
set estado = 'anulada',
    motivo_no_realizada = 'cancelada-cliente: llamo el mismo dia para anular la cita por una urgencia (nota original de la visita).',
    volver_a_planificar = true,
    updated_at = now()
where id = 394;

-- ROLLBACK:
-- update visitas set estado='planificada', motivo_no_realizada=null,
--        volver_a_planificar=null, updated_at=now()
--  where id = 394;
