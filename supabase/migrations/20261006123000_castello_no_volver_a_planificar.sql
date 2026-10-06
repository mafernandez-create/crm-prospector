-- Estudio Castelló (visita 573, 29-oct): volver_a_planificar pasa de true a false.
--
-- Al sacar Córdoba de la S44 el 5-oct la visita quedó anulada pero marcada como
-- recuperable, y por eso aparecía como reserva llamable del jueves 29 junto a la de
-- verdad (CARMOCON, 597). Córdoba no entra en octubre: la marca correcta es false.
-- Decisión de Manolo del 6-oct-2026. El motivo original se conserva.

do $$
declare n int;
begin
  select count(*) into n from visitas
  where id = 573 and estado = 'anulada' and volver_a_planificar is true;
  if n <> 1 then
    raise exception 'Abortada: la visita 573 no está anulada con volver_a_planificar = true (coincidencias: %).', n;
  end if;
end $$;

update visitas set volver_a_planificar = false, updated_at = now() where id = 573;

-- ROLLBACK: update visitas set volver_a_planificar=true, updated_at=now() where id=573;
