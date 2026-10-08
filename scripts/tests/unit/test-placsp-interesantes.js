// Licitaciones «interesantes» del PLACSP Monitor (8-oct-2026): cruce del
// organo de contratacion con la cartera y conversion a fila.
const path = require('path');
const A = require('../_lib/assert');
const L = require(path.resolve(__dirname, '..', '..', 'placsp-interesantes-lib.js'));

A.reset();

// Cargo delante de la entidad
A.eq(L.entidadDelOrgano('Alcaldía del Ayuntamiento de Lloseta'), 'ayuntamiento de lloseta', 'quita «Alcaldía del»');
A.eq(L.entidadDelOrgano('Junta de Gobierno Local del Ayuntamiento de Laredo'), 'ayuntamiento de laredo', 'quita «Junta de Gobierno Local del»');
A.eq(L.entidadDelOrgano('Presidencia del Consejo de Administración de la Autoridad Portuaria de Barcelona'), 'autoridad portuaria de barcelona', 'quita cargo compuesto');
A.eq(L.entidadDelOrgano('Junta de la Mancomunidad de Municipios del Campo de Gibraltar'), 'mancomunidad de municipios del campo de gibraltar', '«Junta de la» es cargo');
A.eq(L.entidadDelOrgano('Junta de Andalucía'), 'junta de andalucia', '«Junta de Andalucía» es la entidad');
A.eq(L.entidadDelOrgano('Apoderado Mancomunado de Aigües de Sagunt, S.A.'), 'aigues de sagunt', 'quita apoderado y S.A.');

A.eq(L.entidadLegible('Alcaldía del Ayuntamiento de Las Navas de la Concepción'), 'Ayuntamiento de Las Navas de la Concepción', 'entidad legible conserva mayúsculas y acentos');
A.eq(L.entidadLegible('Consejería Delegada de la Empresa Metropolitana de Aguas de Sevilla S.A. (EMASESA)'), 'Empresa Metropolitana de Aguas de Sevilla S.A. (EMASESA)', 'entidad legible tras cargo acentuado');
A.eq(L.entidadLegible('Ajuntament de Vallfogona'), 'Ajuntament de Vallfogona', 'sin cargo queda igual');

// Cruce con la cartera: exacto, sin acentos ni forma societaria
const idx = L.indexarCartera([
  { id: '10', name: 'Ayuntamiento de Roquetas de Mar' },
  { id: '11', name: 'Aigües de Sagunt S.A.' },
  { id: '12', name: 'EMASESA' },
]);
A.eq(L.buscarFicha('Junta de Gobierno del Ayuntamiento de Roquetas de Mar', idx), '10', 'cruza ayuntamiento tras quitar el cargo');
A.eq(L.buscarFicha('Apoderado Mancomunado de Aigües de Sagunt, S.A.', idx), '11', 'cruza sin la forma societaria');
A.eq(L.buscarFicha('Alcaldía del Ayuntamiento de Roquetas', idx), null, 'sin coincidencia exacta no cruza');
A.eq(L.buscarFicha('', idx), null, 'organo vacio');

// Fila
const f = L.aFila({ id: 7, titulo: 'Depósito', organo_contratacion: 'X', estado: 'EN PLAZO',
  presupuesto_total: null, presupuesto_sin_iva: '1000.5', fecha_presentacion: '2026-10-20T12:00:00',
  marcada_at: null, link_licitacion: 'https://x' }, '10', '2026-10-08T00:00:00.000Z');
A.eq(f.monitor_id, 7, 'monitor_id');
A.eq(f.presupuesto, 1000.5, 'presupuesto cae al sin IVA');
A.eq(f.studio_id, '10', 'studio_id');
A.eq(f.marcada_at, null, 'fecha vacia → null');
A.truthy(f.fecha_presentacion && f.fecha_presentacion.startsWith('2026-10-20'), 'fecha de presentación ISO');
A.falsy('primera_vez' in f, 'no pisa primera_vez en el upsert');
A.eq(f.vigente, true, 'vigente');
A.eq(L.aFila({ id: 1, organo_contratacion: 'Pleno del Ayuntamiento de Valdevimbre' }, null, 'x').entidad, 'Ayuntamiento de Valdevimbre', 'fila con entidad');

const s = A.summary();
console.log(JSON.stringify(s));
process.exit(s.failed > 0 ? 1 : 0);
