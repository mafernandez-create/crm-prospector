-- Gasto por función en los últimos 30 días
select funcion, sum(llamadas) llamadas, sum(tokens) tokens, sum(coste_usd) coste_usd
from public.ia_uso_resumen where dia >= current_date - 30 group by 1 order by 4 desc nulls last;

-- Gasto diario
select dia, sum(llamadas) llamadas, sum(coste_usd) coste_usd from public.ia_uso_resumen group by 1 order by 1 desc;
