-- 47 visitas pasadas que seguian en `planificada` aunque la visita se hizo y el
-- informe esta escrito. Nadie cambio el estado: es estado mal puesto, no trabajo
-- pendiente. Decidido por Manolo el 6-oct-2026 tras revisar las 132 filas
-- `planificada` con fecha pasada (84 de la hoja del jefe + 48 del planificador).
--
-- CRITERIO DE EMPAREJAMIENTO: la ficha del estudio tiene al menos un informe
-- fechado en [fecha_visita - 3, fecha_visita + 21]. Es la ventana de produccion
-- (la de `visitas_sin_informe` y `Data.conciliarSemana`). Se comprobo tambien con
-- una ventana mas laxa (-2/+30): da exactamente las mismas 47 filas, asi que la
-- particion no depende del criterio.
--
-- RIESGO DE FALSO POSITIVO, ACOTADO A MANO: siete de estas filas tenian otra
-- visita de la misma ficha a menos de 30 dias. Seis se resuelven limpias (en
-- cuatro la vecina esta `anulada` y no genera informe; HIDRALIA/AGUASVIRA y
-- ATECSUR tienen dos informes, uno por visita). La septima no:
--   * 368 (7-sep) y 509 (10-sep) son las dos «Mide y Crea», ficha 3110, y entre
--     ambas hay UN solo informe, del 14-sep. O fue una visita duplicada al
--     cargarla, o fueron dos y solo se escribio un informe. Manolo ordeno las 47
--     igualmente; si resulta ser duplicado, revertir SOLO la 509 (abajo).
--
-- LO QUE ESTO NO CAMBIA: la vista `visitas_sin_informe` filtra
-- `estado <> 'anulada'`, asi que estas 47 ya no aparecian en ella (tienen
-- informe). El contador de la vista NO baja con esta migracion: lo que se corrige
-- es que la fila diga la verdad sobre lo que paso.

do $$
declare n int;
begin
  select count(*) into n
  from visitas v join studios s on s.id = v.studio_id
  where v.id in (168,223,235,287,346,347,348,349,350,351,352,353,354,356,357,358,
                 359,360,361,362,363,364,365,366,367,368,369,370,371,372,373,374,
                 375,376,377,378,379,380,381,382,383,384,385,386,387,389,509)
    and v.estado = 'planificada'
    and v.fecha < current_date
    and exists (
      select 1 from jsonb_array_elements(s.data->'reports') r
      where jsonb_typeof(s.data->'reports') = 'array'
        and left(coalesce(r.value->>'iso_date', r.value->>'date'), 10)
            between (v.fecha - 3)::text and (v.fecha + 21)::text);
  if n <> 47 then
    raise exception 'Abortada: se esperaban 47 visitas planificadas con informe en ventana, hay %. Recalcular antes de aplicar.', n;
  end if;
end $$;

update visitas
set estado = 'realizada',
    updated_at = now()
where id in (168,223,235,287,346,347,348,349,350,351,352,353,354,356,357,358,
             359,360,361,362,363,364,365,366,367,368,369,370,371,372,373,374,
             375,376,377,378,379,380,381,382,383,384,385,386,387,389,509);

do $$
declare n int;
begin
  select count(*) into n from visitas
  where estado = 'planificada' and fecha < current_date;
  if n <> 85 then
    raise exception 'Abortada: tras el cambio deberian quedar 85 planificadas pasadas, quedan %.', n;
  end if;
end $$;

-- ROLLBACK COMPLETO:
-- update visitas set estado='planificada', updated_at=now()
--  where id in (168,223,235,287,346,347,348,349,350,351,352,353,354,356,357,358,
--               359,360,361,362,363,364,365,366,367,368,369,370,371,372,373,374,
--               375,376,377,378,379,380,381,382,383,384,385,386,387,389,509);
--
-- ROLLBACK SOLO DE «Mide y Crea» (si el 10-sep era duplicado del 7-sep):
-- update visitas set estado='anulada', volver_a_planificar=false,
--        motivo_no_realizada='Duplicada de la visita 368 (7-sep, misma ficha 3110): un solo informe para las dos.',
--        updated_at=now()
--  where id = 509;
