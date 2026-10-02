// Unit tests del cruce ficha del CRM ↔ municipio del Atlas del Agua.
//
// Lo que se protege aquí es la vía por la que resuelve cada ficha. `resolver`
// tiene dos: la buena (provincia + municipio) y un respaldo (el municipio es
// único en toda España, así que da igual la provincia). El respaldo acierta
// callando, y por eso es peligroso: el 2-oct-2026 las 15 fichas de Alicante
// cruzaban SOLO por él, porque el Atlas escribe la provincia como «Alacant/
// Alicante» y el CRM como «Alicante», y se comparaban por igualdad exacta.
// Funcionaba hasta el día que dos provincias tengan un municipio homónimo.
//
// lib-cruce.mjs es ESM y este fichero CJS (run-all.js solo recoge test-*.js),
// de ahí el import() dinámico.

const path = require('path');
const A    = require('../_lib/assert');

A.reset();

const RAIZ = path.resolve(__dirname, '..', '..', '..');

(async () => {
  const { indexarAtlas, resolver } = await import(
    'file://' + path.join(RAIZ, 'scripts', 'atlas-agua', 'lib-cruce.mjs'));

  // Atlas de juguete con las grafías del INE que dan guerra.
  const ATLAS = [
    { ine: '03047', municipio: 'Calp',                provincia: 'Alacant/Alicante' },
    { ine: '03081', municipio: 'Xaló',                provincia: 'Alacant/Alicante' },
    { ine: '12040', municipio: 'Castelló de la Plana', provincia: 'Castelló/Castellón' },
    { ine: '18087', municipio: 'Granada',             provincia: 'Granada' },
    { ine: '04902', municipio: 'Ejido, El',           provincia: 'Almería' },
    { ine: '15030', municipio: 'A Coruña',            provincia: 'A Coruña' },
    // Dos municipios homónimos en provincias distintas: aquí el respaldo NO
    // puede desempatar, así que la provincia tiene que hacer su trabajo.
    { ine: '11001', municipio: 'Alcalá del Valle',    provincia: 'Cádiz' },
    { ine: '41900', municipio: 'Alcalá del Valle',    provincia: 'Sevilla' },
  ];
  const idx = indexarAtlas(ATLAS);
  const via = (city, prov) => { const r = resolver(idx, city, prov); return r ? r.via : null; };
  const ine = (city, prov) => { const r = resolver(idx, city, prov); return r ? r.fila.ine : null; };

  // ── La provincia con dos lenguas en el mismo campo ──────────────────────────
  A.eq(via('Calpe', 'Alicante'), 'provincia+municipio',
       'provincia «Alacant/Alicante» cruza con «Alicante» de la ficha');
  A.eq(ine('Calpe', 'Alicante'), '03047', 'y trae la fila correcta');
  A.eq(via('Jalón', 'Alicante'), 'provincia+municipio',
       'exónimo y provincia bilingüe a la vez');
  A.eq(via('Castellón de la Plana', 'Castellón'), 'provincia+municipio',
       'mismo caso en Castellón');

  // ── Lo que ya funcionaba, que siga ─────────────────────────────────────────
  A.eq(via('Granada', 'Granada'), 'provincia+municipio', 'provincia de una sola grafía');
  A.eq(via('El Ejido', 'Almería'), 'provincia+municipio',
       'el CRM escribe «El Ejido» y el INE «Ejido, El»');
  A.eq(via('Coruña', 'A Coruña'), 'provincia+municipio',
       'el artículo de «A Coruña» no estorba');

  // ── El respaldo: existe, pero se declara ───────────────────────────────────
  A.eq(via('Calpe', 'Teruel'), 'solo municipio (la provincia de la ficha no cuadra)',
       'provincia equivocada: resuelve por respaldo y lo dice');

  // ── Homónimos: sin provincia buena no se adivina ───────────────────────────
  A.eq(ine('Alcalá del Valle', 'Cádiz'), '11001', 'homónimos: la provincia desempata');
  A.eq(ine('Alcalá del Valle', 'Sevilla'), '41900', 'homónimos: y al revés');
  A.eq(via('Alcalá del Valle', 'Lugo'), null,
       'homónimos con provincia que no cuadra: mejor no resolver que inventar');

  // ── Bordes ─────────────────────────────────────────────────────────────────
  A.eq(resolver(idx, '', 'Alicante'), null, 'sin municipio no se resuelve nada');
  A.eq(resolver(idx, null, 'Alicante'), null, 'municipio nulo tampoco');
  A.eq(via('Calpe', ''), 'solo municipio (la provincia de la ficha no cuadra)',
       'sin provincia queda el respaldo, declarado');

  const s = A.summary();
  console.log(JSON.stringify(s));
  process.exit(s.failed > 0 ? 1 : 0);
})().catch(e => { console.error(e.message); process.exit(1); });
