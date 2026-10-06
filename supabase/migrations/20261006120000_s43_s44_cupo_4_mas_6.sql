-- S43 y S44: el cupo diario baja de 5 confirmadas a 4 + 6 en reserva.
--
-- Motivo (decisión de Manolo del 6-oct-2026, docs/PLAN-octubre-2026.md § 8):
-- octubre planificaba 70 informes en 14 días de ruta contra un histórico de ~2 audios/día
-- y ningún precedente de 5 en un día. Bajando a 4 confirmadas en la S43 y la S44, el lote
-- de octubre pasa de 70 a 60 informes (20 + 20 + 20). Las horas de carretera no cambian:
-- las 10 visitas de aquí abajo pasan a reserva, y la reserva se llama por teléfono.
--
-- POR QUÉ 'anulada' Y NO UN ESTADO 'reserva':
-- `visitas_sin_informe` y las dos consultas del frontend (redesign/data-supabase.js:319
-- y :329) filtran por `estado <> 'anulada'`. Para el CRM, todo lo que no está anulado es
-- una visita planificada que exige informe. Un estado 'reserva' nuevo seguiría contando,
-- que es justo lo que esta migración quiere evitar. Así que se usa el único estado que
-- escapa al filtro, y se marca `volver_a_planificar = true` para que se vea que no es una
-- cancelación de verdad: la visita sigue viva, solo que sin fecha comprometida.
-- Es una limitación del modelo de datos, no una decisión de diseño. Si algún día hace
-- falta separar «anulada» de «en reserva», el sitio es el filtro de esas tres consultas.

begin;

-- Guarda: los 10 ids deben estar hoy como 'planificada' en su ruta y fecha. Si el CRM ha
-- cambiado desde que se preparó esta migración, aborta en vez de tocar lo que no toca.
do $$
declare n int;
begin
  select count(*) into n
  from visitas
  where id in (577,579,581,583,585, 588,589,592,597,602)
    and estado = 'planificada'
    and (ruta like 'S43%' or ruta like 'S44%');
  if n <> 10 then
    raise exception 'Abortada: se esperaban 10 visitas planificadas en S43/S44, hay %. Revisar antes de aplicar.', n;
  end if;
end $$;

update visitas
set estado = 'anulada',
    volver_a_planificar = true,
    motivo_no_realizada = 'En reserva: cupo de la semana a 4 confirmadas/día (decisión 6-oct-2026). Se llama por teléfono si cae otra visita.',
    updated_at = now()
where id in (
  -- S43 Málaga · Cádiz — una por jornada, todas con nota «Completar la jornada al ritmo de 5 visitas»
  577,  -- L 19 · JGV Ingeniería (Málaga capital)
  579,  -- M 20 · ARUP4 Arquitectos y Urbanistas
  581,  -- X 21 · HCP Arquitectos
  583,  -- J 22 · Mevi Estudio de Arquitectura (Cádiz capital)
  585,  -- V 23 · Iniesta Nowell Arquitectura (Jerez)
  -- S44 Sevilla · Huelva
  588,  -- L 26 · ACSA Obras e Infraestructuras (Grupo Sorigué)
  589,  -- M 27 · Magtel Operaciones  [se mantiene EPTISA (590): redacta pliego]
  592,  -- X 28 · Estudio JSDALP
  597,  -- J 29 · CARMOCON — La Rinconada, fuera del arco del Aljarafe
  602   -- V 30 · C.R. Piedras-Guadiana — Lepe, mismo pueblo que Aqualia (574): no se pierde viaje
);

-- Comprobación del resultado: 4 confirmadas por jornada en los 10 días de ruta.
do $$
declare malos text;
begin
  select string_agg(fecha::text || ' = ' || c::text, ', ' order by fecha) into malos
  from (
    select fecha, count(*) as c
    from visitas
    where (ruta like 'S43%' or ruta like 'S44%') and estado <> 'anulada'
    group by fecha
  ) t
  where c <> 4;
  if malos is not null then
    raise exception 'Abortada: estas jornadas no quedan a 4 confirmadas: %', malos;
  end if;
end $$;

commit;

-- ROLLBACK (si hay que deshacerlo):
-- update visitas set estado='planificada', volver_a_planificar=null,
--        motivo_no_realizada=null, updated_at=now()
--  where id in (577,579,581,583,585,588,589,592,597,602);
