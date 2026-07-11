// =========================================================================
// compare-scoring-browser.js — Comparador v2.0 ↔ v2.1 DESDE EL NAVEGADOR
//
// Para cuando el CRM tiene RLS (login obligatorio) y no se puede leer desde
// Node. Se ejecuta en la consola del navegador, DENTRO del CRM ya logueado,
// reutilizando tu sesión. No usa credenciales ni claves: solo lee lo que la
// app ya tiene cargado.
//
// Cómo se usa:
//   1. Abre tu CRM en el navegador y entra (login normal de la app).
//   2. Abre la consola de desarrollador:  ⌥⌘I  (Mac) → pestaña "Console".
//   3. Pega TODO este fichero y pulsa Enter.
//
// SOLO LECTURA: no escribe nada. Deriva el cuadrante v2.0 (UI, sin engagement)
// de los campos ya guardados y lo compara con el v2.1 (batch, con engagement).
// Nota: asume que la única diferencia de scoring entre v2.0 y v2.1 es el
// engagement (es lo que muestra el código); el comparador de Node, cuando se
// pueda leer autenticado, captaría además cualquier otra divergencia.
// =========================================================================
(async () => {
  // Asegura que los studios están cargados en memoria
  if (window.State && (!window.State.studios || !window.State.studios.length)) {
    if (window.Data && window.Data.loadAll) await window.Data.loadAll();
    else if (window.DataSupabase && window.DataSupabase.loadAll) await window.DataSupabase.loadAll();
  }
  const studios = (window.State && window.State.studios) || [];
  if (!studios.length) { console.error('No hay studios cargados. ¿Has entrado en el CRM?'); return; }

  const MAP = { Alto_Alta:1, Alto_Media:2, Alto_Baja:3, Medio_Alta:4, Medio_Media:5, Medio_Baja:6, Bajo_Alta:7, Bajo_Media:8, Bajo_Baja:9 };
  const NAMES = { 1:'Estratégico', 2:'Cliente core', 3:'Cliente volumen', 4:'Puerta entrada', 5:'Cartera estándar', 6:'Mantenimiento', 7:'Conector', 8:'Seguimiento ligero', 9:'Congelar' };
  const band = s => s >= 10 ? 'Alto' : s >= 6 ? 'Medio' : 'Bajo';

  let total=0, changed=0, up=0, down=0, same=0, movEng=0, sinDatos=0;
  const distA={}, distB={}, movers=[];
  for (const st of studios) {
    const qB = st.priorityQuadrant;                    // v2.1 (guardado por el batch)
    const natural = Number(st.priorityDirectScoreNatural); // rawDirect sin engagement/puente
    const net = st.priorityNetwork;
    if (qB == null || Number.isNaN(natural) || !net) { sinDatos++; continue; }
    const puente = st.es_cliente_puente === true ? 4 : 0;
    const qA = MAP[band(natural + puente) + '_' + net]; // v2.0 (UI, sin engagement)
    if (qA == null) { sinDatos++; continue; }
    total++;
    distA[qA]=(distA[qA]||0)+1; distB[qB]=(distB[qB]||0)+1;
    const eng = Number(st.priorityDirectScore) - natural - puente; // engagement derivado
    if (qA !== qB) { changed++; (qA > qB) ? up++ : down++; if (eng > 0) movEng++;
      movers.push({ name: st.name || st.id, de: qA, a: qB, delta: qA - qB, eng }); }
    else same++;
  }
  const pct = n => total ? (100*n/total).toFixed(1)+'%' : '0%';
  console.log('%c COMPARADOR SCORING · v2.0 (UI) ↔ v2.1 (batch) ', 'background:#123;color:#fff;padding:2px');
  console.log('Estudios evaluados:', total, '(sin datos de scoring:', sinDatos, ')');
  console.log('Cambian de cuadrante:', changed, '('+pct(changed)+')  ↑ suben:', up, ' ↓ bajan:', down, ' = igual:', same);
  console.log('De los que se mueven, con engagement (visitas):', movEng, changed ? '('+(100*movEng/changed).toFixed(1)+'%)' : '');
  console.log('Distribución de cuadrantes v2.0 → v2.1:');
  for (let q=1; q<=9; q++) console.log('  Q'+q+' '+NAMES[q].padEnd(18), (distA[q]||0), '→', (distB[q]||0));
  movers.sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
  console.log('Mayores movimientos (top 20):');
  movers.slice(0,20).forEach(m => console.log('  '+(m.delta>0?'↑':'↓')+Math.abs(m.delta)+'  Q'+m.de+'→Q'+m.a+'  eng:'+m.eng+'  '+m.name));
  console.log('SOLO LECTURA: no se ha escrito nada.');
  window.__scoringDiff = { total, changed, up, down, same, movEng, distA, distB, movers }; // por si lo quieres inspeccionar
})();
