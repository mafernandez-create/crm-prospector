-- 2026-10-06 · La fecha de un informe es `date`, no `iso_date`.
--
-- QUE ESTABA MAL. En los informes guardados en studios.data->'reports' hay dos
-- campos de fecha y significan cosas distintas:
--   * `date`       -> la fecha de la VISITA  (presente en los 325 informes, formato YYYY-MM-DD)
--   * `iso_date`   -> el instante de REDACCION (presente solo en 110)
-- Medido el 6-oct-2026 sobre los 2.156 studios: de esos 110, en 107 `iso_date`
-- coincide exactamente con `generated_at`, es decir es la marca de generacion,
-- no la fecha de la visita. Ejemplo: ficha 2676 (Ingenieria en Edificacion),
-- informe con date='2026-01-11' (y el cuerpo del Word dice «Fecha de la visita:
-- 11/01/2026») e iso_date='2026-06-15T09-01-00-000Z' = generated_at.
--
-- Esta vista y el emparejamiento del frontend usaban coalesce(iso_date, date):
-- preferian el campo equivocado, asi que a 107 de 325 informes les atribuian la
-- fecha en que se escribieron.
--
-- EFECTO MEDIDO (6-oct-2026, 257 visitas pasadas no anuladas):
--   visitas_sin_informe .............. 17 -> 19
--   ventana de produccion -3/+21 ..... 33 -> 30
-- Las dos que estaban escondidas son visitas reales sin informe:
--   46  2026-02-11  Ingenieria en Edificacion   (hoja-jefe)
--   50  2026-02-12  Parque Malaga, S.L.         (hoja-jefe)
-- Quedaban fuera porque su informe lleva iso_date de 15-jun y el predicado de la
-- vista no tiene tope por arriba (informe >= fecha - 3).
--
-- LO QUE NO SE TOCA. `iso_date` sigue siendo la CLAVE de identidad de un informe
-- y del upsert de briefings (UNIQUE (studio_id, iso_date) en el esquema inicial,
-- y el findIndex de redesign/data-supabase.js). Aqui solo cambia su uso como
-- FECHA. El fallback a iso_date se mantiene por prudencia: hoy no hay ningun
-- informe sin `date`, pero si apareciera, mejor una fecha aproximada que ninguna.
--
-- Cambio gemelo en el frontend: redesign/data.js, _informeDeVisita().

create or replace view public.visitas_sin_informe as
  select v.fecha,
         v.empresa,
         v.studio_id,
         v.ruta,
         v.estado,
         v.origen,
         case
           when v.studio_id is null then 'sin ficha en el CRM'
           when s.id is null        then 'ficha no encontrada'
           else 'sin informe posterior a la visita'
         end as motivo,
         ( select max(left(coalesce(r.value->>'date', r.value->>'iso_date'), 10))
             from jsonb_array_elements(s.data->'reports') r
            where jsonb_typeof(s.data->'reports') = 'array' ) as ultimo_informe
    from visitas v
    left join studios s on s.id = v.studio_id
   where v.fecha < current_date
     and v.estado <> 'anulada'
     and not exists (
       select 1
         from jsonb_array_elements(s.data->'reports') r
        where jsonb_typeof(s.data->'reports') = 'array'
          and left(coalesce(r.value->>'date', r.value->>'iso_date'), 10)
              >= to_char((v.fecha - 3)::timestamptz, 'YYYY-MM-DD'));

-- COMPROBACION. Las dos visitas que el campo equivocado escondia tienen que
-- aparecer ahora en la vista. Es una comprobacion estable en el tiempo: su fecha
-- es pasada y lo seguira siendo, y mientras no se les escriba un informe de
-- febrero tienen que seguir saliendo.
do $$
declare n int;
begin
  select count(*) into n
    from visitas_sin_informe
   where (studio_id, fecha) in (('2676','2026-02-11'), ('2677','2026-02-12'));
  if n <> 2 then
    raise exception 'Abortada: se esperaban las visitas 46 y 50 en la vista, hay %. Revisar antes de dar el arreglo por bueno.', n;
  end if;
end $$;

-- ROLLBACK (vuelve a preferir iso_date, es decir vuelve al error):
--   create or replace view public.visitas_sin_informe as ... con
--   coalesce(r.value->>'iso_date', r.value->>'date') en los dos sitios.
