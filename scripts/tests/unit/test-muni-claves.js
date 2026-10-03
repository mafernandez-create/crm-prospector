// Unit tests del normalizador de municipios, y de que sus DOS copias no divergen.
//
// La lógica vive dos veces por necesidad: Node la usa desde
// scripts/atlas-agua/lib-muni.mjs (helper del briefing) y el navegador desde
// window.Util en redesign/app.js (bloque «quién gestiona el agua» de la ficha).
// Si una se arregla y la otra no, el CRM y el briefing dirían cosas distintas del
// mismo municipio. Este test compara las dos sobre los casos reales que dan guerra.
//
// app.js no se puede require(): llama a init() y toca `document`. Se extrae el
// trozo por marcadores, como en test-app-util.js.

const fs   = require('fs');
const path = require('path');
const A    = require('../_lib/assert');

A.reset();

const RAIZ = path.resolve(__dirname, '..', '..', '..');
const APP  = fs.readFileSync(path.join(RAIZ, 'redesign', 'app.js'), 'utf8');

function extraer(desde, hasta, etiqueta) {
  const i = APP.indexOf(desde);
  const j = APP.indexOf(hasta, i + 1);
  if (i < 0 || j <= i) {
    throw new Error('No se pudo extraer ' + etiqueta + ' de app.js: marcador movido o renombrado');
  }
  return APP.slice(i, j);
}

const src = extraer(
  'var MUNI_ARTS =',
  '// Normalizador para búsquedas de texto libre',
  'normMuni/clavesMunicipio');

const nav = new Function(
  src + '\nreturn { normMuni, desinvertirMuni, clavesMunicipio, clavesMunicipioRango, ' +
        'grafiasProvincia, grafiaAtlas, clavesProvincia };')();

A.isType(nav.clavesMunicipio, 'function', 'clavesMunicipio se extrae de app.js');
A.isType(nav.clavesMunicipioRango, 'function', 'clavesMunicipioRango se extrae de app.js');
A.isType(nav.clavesProvincia, 'function', 'clavesProvincia se extrae de app.js');
A.isType(nav.grafiaAtlas, 'function', 'grafiaAtlas se extrae de app.js');

(async () => {
  const lib = await import(
    'file://' + path.join(RAIZ, 'scripts', 'atlas-agua', 'lib-muni.mjs'));

  // ── Lo que tiene que cumplir el normalizador ────────────────────────────────
  A.eq(nav.normMuni('  Vélez-Málaga '), 'velez-malaga', 'normMuni: sin tildes, sin bordes');
  A.eq(nav.normMuni("Ràfol d’Almúnia"), "rafol d'almunia", 'normMuni: apóstrofo tipográfico → recto');
  A.eq(nav.desinvertirMuni('Ejido, El'), 'El Ejido', 'desinvertir: coma');
  A.eq(nav.desinvertirMuni('Carlota (La)'), 'La Carlota', 'desinvertir: paréntesis');
  // El artículo sale en mayúscula (es una grafía intermedia: la clave se pasa a
  // minúsculas después), y l' se pega sin espacio.
  A.eq(nav.desinvertirMuni("Alqueria d'Asnar (l')"), "L'Alqueria d'Asnar",
       "desinvertir: l' se pega sin espacio");
  A.eq(nav.desinvertirMuni('Granada'), 'Granada', 'desinvertir: lo que no lleva artículo no se toca');

  // El CRM escribe «El Ejido» y el INE «Ejido, El»: las dos grafías tienen que
  // producir una clave común, o el cruce con el Atlas falla.
  const a = nav.clavesMunicipio('El Ejido');
  const b = nav.clavesMunicipio('Ejido, El');
  A.truthy(a.some(k => b.includes(k)), 'El Ejido ↔ Ejido, El comparten clave');
  A.truthy(nav.clavesMunicipio('Alacant/Alicante').includes('alicante'),
           'nombre doble: la mitad castellana también es clave');
  A.truthy(nav.clavesMunicipio('Vélez-Málaga').includes('velez malaga'),
           'el guión también se prueba como espacio');
  A.eq(nav.clavesMunicipio(''), [], 'nombre vacío: ninguna clave (no cruza con todo)');
  A.eq(nav.clavesMunicipio(null), [], 'nombre nulo: ninguna clave');

  // Exónimos: nombre castellano retirado por el INE. El CRM tiene «Jalón» y el
  // Atlas «Xaló»; sin la tabla, 16 ayuntamientos de Alicante se quedaban sin
  // saber quién les gestiona el agua. No se parecen, así que no hay regla: tabla.
  A.truthy(nav.clavesMunicipio('Jalón').includes('xalo'),
           'exónimo: Jalón → Xaló');
  A.truthy(nav.clavesMunicipio('Callosa de Ensarriá').includes("callosa d'en sarria"),
           'exónimo: la clave sale normalizada, con el apóstrofo recto');
  A.truthy(nav.clavesMunicipio('Guadalest').includes('castell de guadalest'),
           'exónimo: también sin el artículo inicial');
  // La clave original se conserva: si algún día el Atlas trae el nombre castellano,
  // el cruce sigue funcionando por el otro lado.
  A.truthy(nav.clavesMunicipio('Calpe').includes('calpe') &&
           nav.clavesMunicipio('Calpe').includes('calp'),
           'exónimo: se añade la oficial sin perder la escrita');
  // El puente es de ida: el nombre oficial no arrastra el castellano retirado.
  A.truthy(!nav.clavesMunicipio('Calp').includes('calpe'),
           'exónimo: una sola dirección, el oficial no invoca al retirado');

  // ── Las dos copias, sobre los casos reales ──────────────────────────────────
  const CASOS = [
    'El Ejido', 'Ejido, El', 'Carlota (La)', 'La Carlota', 'Vélez-Málaga',
    "Ràfol d’Almúnia", 'Alacant/Alicante', 'Elx/Elche', 'Granada', 'Huércal-Overa',
    "l'Alqueria d'Asnar", 'Palmas de Gran Canaria, Las', 'Puebla de Don Fadrique',
    'Rincón de la Victoria', 'Níjar', 'Órgiva', 'Jerez de la Frontera',
    'Roquetas de Mar', 'Alhama de Murcia', 'Cuevas del Almanzora',
    'Sa Pobla', 'Es Castell', 'A Coruña', 'Coruña, A', 'O Barco de Valdeorras',
    '', null, '  ', 'ÁVILA', 'San Sebastián/Donostia',
    // Los 16 exónimos, y los nombres oficiales a los que apuntan.
    'Adsubia', 'Alcocer de Planes', 'Alcolecha', 'Alquería de Aznar',
    'Benichembla', 'Benimasot', 'Callosa de Ensarriá', 'Calpe', 'Cuatretondeta',
    'Facheca', 'Gayanes', 'Guadalest', 'Jalón', 'Valle de Alcalá', 'Vergel',
    'Castellón de la Plana',
    "l'Atzúbia", 'Alcosser', 'Alcoleja', 'Benigembla', 'Benimassot', 'Calp',
    'Quatretondeta', 'Fageca', 'Gaianes', 'el Castell de Guadalest', 'Xaló',
    "la Vall d'Alcalà", 'el Verger', 'Castelló de la Plana',
  ];
  let divergen = [];
  for (const c of CASOS) {
    const n = nav.clavesMunicipio(c).slice().sort();
    const l = lib.clavesMunicipio(c).slice().sort();
    if (JSON.stringify(n) !== JSON.stringify(l)) divergen.push({ c, nav: n, lib: l });
    if (nav.normMuni(c) !== lib.normMuni(c)) divergen.push({ c, normMuni: [nav.normMuni(c), lib.normMuni(c)] });
    // Y el rango, no solo la clave: es lo que decide quién se queda una clave
    // disputada, así que divergir aquí es divergir en el resultado.
    const orden = x => x.slice().sort((p, q) => (p.rango - q.rango) || p.clave.localeCompare(q.clave))
                        .map(y => y.rango + ':' + y.clave);
    const nr = orden(nav.clavesMunicipioRango(c));
    const lr = orden(lib.clavesMunicipioRango(c));
    if (JSON.stringify(nr) !== JSON.stringify(lr)) divergen.push({ c, rango: [nr, lr] });
  }
  A.eq(divergen, [], 'las dos copias dan lo mismo en los ' + CASOS.length + ' casos');

  // ── El rango: grafía propia frente a derivada ──────────────────────────────
  // «El Pinar» reclama `pinar` solo como derivada (sin artículo), mientras que
  // para «Píñar» esa misma clave es su grafía propia. De ahí sale el desempate
  // que evita enseñar en la ficha el organismo de cuenca del pueblo de al lado.
  const rango = (nombre, clave) => {
    const r = lib.clavesMunicipioRango(nombre).find(x => x.clave === clave);
    return r ? r.rango : null;
  };
  A.eq(rango('Píñar', 'pinar'), 0, 'para Píñar, `pinar` es su propia grafía');
  A.eq(rango('El Pinar', 'pinar'), 1, 'para El Pinar, `pinar` es derivada');
  A.eq(rango('El Pinar', 'el pinar'), 0, 'y su grafía propia es la completa');
  A.eq(rango('Ejido, El', 'el ejido'), 0,
       'el desinvertido cuenta como propio: el INE y el CRM escriben el mismo pueblo');
  A.eq(rango('Calpe', 'calp'), 1, 'el exónimo es derivado, nunca propio');
  A.eq(lib.clavesMunicipioRango('').length, 0, 'nombre vacío: ningún reclamo');

  // ── Provincias: los exónimos que ninguna regla puentea ─────────────────────
  // Con los nombres dobles del INE no hace falta tabla: «Alicante» está dentro
  // de «Alacant/Alicante» y la regla de la barra ya comparte clave. Las siete de
  // PROV_EXONIMOS no comparten NI UNA palabra con su nombre oficial, así que sin
  // tabla el cruce por provincia falla y se cae al respaldo silencioso.
  const cruzan = (a, b) => lib.clavesProvincia(a).some(k => lib.clavesProvincia(b).includes(k));
  A.truthy(cruzan('Baleares', 'Illes Balears'), 'Baleares ↔ Illes Balears cruzan');
  A.truthy(cruzan('Vizcaya', 'Bizkaia'),        'Vizcaya ↔ Bizkaia cruzan');
  A.truthy(cruzan('Gerona', 'Girona'),          'Gerona ↔ Girona cruzan');
  A.truthy(cruzan('La Coruña', 'A Coruña'),     'La Coruña ↔ A Coruña cruzan');
  A.truthy(cruzan('Alicante', 'Alacant/Alicante'),
           'los nombres dobles del INE siguen cruzando por la regla de la barra');
  A.truthy(cruzan('Álava', 'Araba/Álava'),
           'Álava no necesita tabla: está dentro del nombre oficial');
  // Y no abre la puerta a cruces falsos entre provincias distintas.
  A.falsy(cruzan('Baleares', 'Bizkaia'), 'dos provincias distintas no cruzan');
  A.falsy(cruzan('Gerona', 'Granada'),   'ni dos que empiezan igual');

  // El navegador no cruza claves: pregunta al servidor con UN patrón ilike, y
  // ahí tiene que ir el nombre del INE o vuelven cero filas.
  A.eq(lib.grafiaAtlas('Baleares'), 'Illes Balears', 'grafiaAtlas: la del INE');
  A.eq(lib.grafiaAtlas('Granada'), 'Granada', 'grafiaAtlas: sin exónimo, la escrita');
  A.eq(lib.grafiaAtlas('Alicante'), 'Alicante',
       'grafiaAtlas: «Alicante» ya sirve de fragmento, no se toca');
  A.eq(lib.grafiaAtlas(''), '', 'grafiaAtlas: vacío no busca nada');
  A.eq(lib.clavesProvincia(''), [], 'provincia vacía: ninguna clave');

  // Las dos copias, también aquí.
  const PROVS = ['Baleares', 'Illes Balears', 'Vizcaya', 'Bizkaia', 'Guipúzcoa', 'Gipuzkoa',
    'Lérida', 'Lleida', 'Gerona', 'Girona', 'La Coruña', 'A Coruña', 'Coruña, A',
    'Orense', 'Ourense', 'Alicante', 'Alacant/Alicante', 'Álava', 'Araba/Álava',
    'Granada', 'Almería', 'Castellón', 'Castelló/Castellón', '', null, '  '];
  let divProv = [];
  for (const c of PROVS) {
    const n = nav.clavesProvincia(c).slice().sort();
    const l = lib.clavesProvincia(c).slice().sort();
    if (JSON.stringify(n) !== JSON.stringify(l)) divProv.push({ c, nav: n, lib: l });
    if (nav.grafiaAtlas(c) !== lib.grafiaAtlas(c)) {
      divProv.push({ c, grafiaAtlas: [nav.grafiaAtlas(c), lib.grafiaAtlas(c)] });
    }
  }
  A.eq(divProv, [], 'las dos copias dan lo mismo en las ' + PROVS.length + ' provincias');

  const s = A.summary();
  console.log(JSON.stringify(s));
  process.exit(s.failed > 0 ? 1 : 0);
})().catch(e => { console.error(e.message); process.exit(1); });
