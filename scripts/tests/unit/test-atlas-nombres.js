// Unit tests del cruce «¿este operador del agua ya es ficha del CRM?».
//
// Es una coincidencia por NOMBRE, y el nombre es lo más traicionero que hay en
// este cruce: si se afloja, el briefing dice que un operador ya tiene ficha y
// en realidad está señalando al ayuntamiento del pueblo de al lado; si se
// aprieta, se dan de alta duplicados de empresas que ya están.
//
// La regla que se protege aquí: cuando lo único que distingue a un nombre es un
// TOPÓNIMO («… de Granada»), no basta con compartir palabras — hay que coincidir
// en el nombre, o que el nombre del Atlas esté entero y seguido dentro del de la
// ficha. Ese segundo caso es el que recupera «Aguas de Jerez» → la ficha real
// «Aguas de Jerez Empresa Municipal SA (AJEMSA)» sin readmitir el ruido.
//
// lib-nombres.mjs es ESM y este fichero CJS (run-all.js solo recoge test-*.js),
// de ahí el import() dinámico.

const path = require('path');
const A    = require('../_lib/assert');

A.reset();

const RAIZ = path.resolve(__dirname, '..', '..', '..');

(async () => {
  const { indexarNombres } = await import(
    'file://' + path.join(RAIZ, 'scripts', 'atlas-agua', 'lib-nombres.mjs'));

  // Fichas de juguete con las formas reales que da guerra: la empresa municipal
  // con cola de siglas, y los ayuntamientos que comparten topónimo con ella.
  const FICHAS = [
    { id: '1', name: 'Aguas de Jerez Empresa Municipal SA (AJEMSA)' },
    { id: '2', name: 'Ayuntamiento de Granada' },
    { id: '3', name: 'Ayuntamiento de Jerez de la Frontera' },
    { id: '4', name: 'EMASAGRA' },
    { id: '5', name: 'CODEUR, S.A' },
  ];
  // Topónimos tal y como los saca lib-cruce.toponimos() del Atlas.
  const TOP = new Set(['jerez', 'granada', 'frontera', 'almanzora', 'cuevas']);

  const { candidatas, posibleFicha, fichaDe } = indexarNombres(FICHAS, TOP);
  const ids = n => candidatas(n, 5).map(c => c.ficha.id);

  // ── Lo que el nombre del Atlas está seguido dentro de la ficha ─────────────
  A.eq(ids('Aguas de Jerez'), ['1'],
       'el nombre del Atlas entero y seguido dentro de la ficha sí cuenta');
  A.eq(ids('AJEMSA'), ['1'], 'y las siglas solas también, por la vía normal');

  // ── Lo que NO debe engancharse: vecinos del mismo topónimo ────────────────
  A.eq(ids('Empresa Municipal de Abastecimiento y Saneamiento de Granada'),
       [],
       'compartir solo el topónimo no es un hallazgo: no engancha al ayuntamiento');
  A.eq(ids('Aguas de Granada'), [],
       'tampoco al revés: sin coincidencia ni frase, mejor «no la encuentro»');

  // ── Un nombre sin topónimo no pasa por la regla estrecha ───────────────────
  A.eq(ids('CODEUR'), ['5'], 'nombre propio sin topónimo: coincidencia normal');

  // ── El formato de la tabla declara la confianza ────────────────────────────
  // «=» es igualdad de núcleo, no «la encontré»: ni «AJEMSA» ni «Aguas de Jerez»
  // son el nombre completo de esa ficha, así que las dos salen como «~».
  A.eq(posibleFicha('CODEUR, S.A'), ['=5 CODEUR, S.A'],
       'nombre idéntico salvo forma jurídica: se marca con «=»');
  A.eq(posibleFicha('Aguas de Jerez'), ['~1 Aguas de Jerez Empresa Municipal SA (AJEMSA)'],
       'por frase se marca con «~»: es una posible ficha, no un hecho');
  A.eq(posibleFicha('AJEMSA'), ['~1 Aguas de Jerez Empresa Municipal SA (AJEMSA)'],
       'las siglas sueltas, también «~»');
  A.eq(posibleFicha('Canal de Isabel II'), [],
       'lo que no está, no se inventa');

  // ── fichaDe: señalar UNA ficha, o ninguna ─────────────────────────────────
  // De esto sale la lista de `update studios set es_cliente_puente`, así que
  // apuntar a la ficha equivocada marca como cliente puente a quien no lo es.
  // Las cuatro formas que da el Atlas de verdad:
  const quien = n => { const f = fichaDe(n); return f ? f.ficha.id + f.via : null; };

  // 1. El nombre es el mismo: gana, y se declara con «=».
  A.eq(quien('CODEUR, S.A'), '5=', 'nombre idéntico: ficha con «=»');
  // 2. Solo hay UNA ficha que lo contenga como frase: vale, y se declara con «~».
  //    Este es el caso real de GIAHSA («GIAHSA - Gestión Integral…»), EMASESA y
  //    Emasagra: exigir el nombre letra a letra los dejaba fuera del SQL para
  //    siempre, y seguían apareciendo en «revisar» carga tras carga.
  A.eq(quien('Aguas de Jerez'), '1~', 'una sola ficha lo contiene: vale, marcada «~»');
  A.eq(quien('AJEMSA'), '1~', 'las siglas solas, igual');
  // 3. Varias fichas lo contienen: eso no es una ficha, son varias cosas que
  //    mirar (el caso de Hidrogea, con tres).
  const MUCHAS = [
    { id: '10', name: 'Hidrogea Gestión Integral de Aguas del Sur' },
    { id: '11', name: 'Hidrogea Murcia' },
    { id: '12', name: 'Aguas de Alicante' },
  ];
  const varias = indexarNombres(MUCHAS, TOP);
  A.eq(varias.fichaDe('Hidrogea'), null,
       'dos fichas que lo contienen: ninguna, hay que mirarlas a mano');
  A.eq(varias.candidatas('Hidrogea', 5).length, 2,
       'pero siguen saliendo en la tabla de «parecidas»');
  // 4. Solo comparten una palabra: nunca basta.
  A.eq(quien('Aguas de Granada'), null, 'compartir el topónimo no señala ficha');
  const SUELTA = [{ id: '20', name: 'Acciona Construcción' }];
  const suelta = indexarNombres(SUELTA, TOP);
  A.eq(suelta.fichaDe('Acciona Agua'), null,
       'compartir una palabra propia tampoco: «Acciona» no es «Acciona Agua»');
  // Y entre varias exactas no se bloquea: un nombre con barra son dos fichas del
  // MISMO operador («Global Omnium / Aguas de Valencia»), no una ambigüedad.
  const BARRA = [
    { id: '30', name: 'Global Omnium' },
    { id: '31', name: 'Aguas de Valencia' },
  ];
  const barra = indexarNombres(BARRA, TOP);
  A.truthy(['30', '31'].includes((barra.fichaDe('Global Omnium / Aguas de Valencia') || {}).ficha.id),
           'dos exactas del mismo operador: señala una, no se queda en blanco');

  // ── Bordes ────────────────────────────────────────────────────────────────
  A.eq(ids(''), [], 'nombre vacío no cruza con todo');
  A.eq(candidatas('Aguas', 5).length <= 5, true, 'el límite se respeta');
  A.eq(fichaDe(''), null, 'nombre vacío no señala ninguna ficha');

  const s = A.summary();
  console.log(JSON.stringify(s));
  process.exit(s.failed > 0 ? 1 : 0);
})().catch(e => { console.error(e.message); process.exit(1); });
