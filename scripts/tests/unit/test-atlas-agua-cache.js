// Unit tests de la caché del bloque «quién gestiona el agua» de la ficha.
//
// El bloque se baja la provincia entera de una vez y la guarda, porque recorrer
// una ruta son veinte fichas de la misma provincia y no tiene sentido pedir
// veinte veces lo mismo. Pero la caché vivía lo que durase la sesión, y esta PWA
// se queda abierta días: después de recargar el Atlas, la ficha seguía
// enseñando el operador viejo hasta que Manolo cerraba y reabría la aplicación,
// sin ninguna pista de que lo que leía estaba caducado.
//
// Lo que se protege aquí: que ahorre consultas DENTRO de la ventana, que se
// olvide al salir de ella, y que `olvidar()` sirva para forzarlo a mano. Lo
// tercero importa porque antes `olvidar()` existía sin que nadie lo llamara, y
// un método que nadie llama no es una salvaguarda, es una nota.
//
// atlas-agua.js no se puede require(): es un IIFE que escribe en `window`. Se
// evalúa con un window de juguete, igual que hace test-app-util.js con app.js.

const fs   = require('fs');
const path = require('path');
const A    = require('../_lib/assert');

A.reset();

const RAIZ = path.resolve(__dirname, '..', '..', '..');
const SRC  = fs.readFileSync(path.join(RAIZ, 'redesign', 'atlas-agua.js'), 'utf8');

/** Carga el módulo con un window propio y un Supabase que cuenta consultas. */
function montar(filas) {
  const consultas = [];
  const win = {
    Util: {},
    DataSupabase: {
      sbGet(q) { consultas.push(q); return Promise.resolve(filas); },
    },
    debugLog() {},
  };
  new Function('window', SRC)(win);
  return { win, consultas, atlas: win.AtlasAgua };
}

const GRANADA = [
  { ine: '18087', municipio: 'Granada', provincia: 'Granada', operador: 'Emasagra' },
];
const ficha = { city: 'Granada', province: 'Granada' };

(async () => {
  const lib = await import(
    'file://' + path.join(RAIZ, 'scripts', 'atlas-agua', 'lib-muni.mjs'));

  // ── Ahorra consultas dentro de la ventana ──────────────────────────────────
  {
    const { consultas, atlas } = montar(GRANADA);
    A.isType(atlas.deFicha, 'function', 'el módulo expone deFicha');
    A.isType(atlas.olvidar, 'function', 'y olvidar');
    A.isType(atlas._ttlMs, 'number', 'y declara su caducidad');

    const r1 = await atlas.deFicha(ficha);
    const r2 = await atlas.deFicha({ city: 'Granada', province: 'Granada' });
    A.eq(r1.estado, 'ok', 'resuelve la ficha');
    A.eq(r2.fila.ine, '18087', 'y la segunda vez también');
    A.eq(consultas.length, 1, 'dos fichas de la misma provincia: UNA consulta');
  }

  // ── Y se olvida al salir de ella ───────────────────────────────────────────
  {
    const { consultas, atlas } = montar(GRANADA);
    await atlas.deFicha(ficha);
    A.eq(consultas.length, 1, 'primera consulta');

    const real = Date.now;
    try {
      // Justo dentro: no se repite la consulta.
      Date.now = () => real() + atlas._ttlMs - 1000;
      await atlas.deFicha(ficha);
      A.eq(consultas.length, 1, 'dentro de la ventana sigue valiendo lo cacheado');
      // Pasada la caducidad: se vuelve a preguntar. Esto es lo que antes no
      // ocurría nunca, y por eso la ficha enseñaba el operador de antes de
      // recargar el Atlas hasta cerrar la PWA.
      Date.now = () => real() + atlas._ttlMs + 1000;
      await atlas.deFicha(ficha);
      A.eq(consultas.length, 2, 'pasada la caducidad se vuelve a pedir');
    } finally {
      Date.now = real;
    }
  }

  // ── olvidar() fuerza la recarga sin esperar ────────────────────────────────
  {
    const { consultas, atlas } = montar(GRANADA);
    await atlas.deFicha(ficha);
    atlas.olvidar();
    await atlas.deFicha(ficha);
    A.eq(consultas.length, 2, 'olvidar() tira la caché: se pide otra vez');
  }

  // ── Un fallo de red no apaga el bloque el resto de la sesión ───────────────
  {
    let n = 0;
    const win = {
      Util: {},
      DataSupabase: {
        sbGet() {
          n++;
          return n === 1 ? Promise.reject(new Error('red'))
                         : Promise.resolve(GRANADA);
        },
      },
      debugLog() {},
    };
    new Function('window', SRC)(win);
    const r1 = await win.AtlasAgua.deFicha(ficha);
    const r2 = await win.AtlasAgua.deFicha(ficha);
    A.eq(r1.estado, 'error', 'el primer intento falla');
    A.eq(r2.estado, 'ok', 'el siguiente se recupera: el error no se cachea');
  }

  // ── La provincia que se le pide al servidor es la del INE ──────────────────
  // El cruce del navegador no es por clave: es un ilike contra el servidor, y
  // ahí solo cabe un patrón. Con «Baleares» volvían cero filas y la ficha decía
  // «provincia-vacia» sin más explicación.
  {
    const { win, consultas, atlas } = montar([]);
    win.Util = { grafiaAtlas: lib.grafiaAtlas, clavesMunicipio: lib.clavesMunicipio,
                 clavesMunicipioRango: lib.clavesMunicipioRango };
    await atlas.deFicha({ city: 'Calvià', province: 'Baleares' });
    A.contains(decodeURIComponent(consultas[0]), 'Illes Balears',
               'a «Baleares» se le pregunta por «Illes Balears»');
  }
  {
    const { win, consultas, atlas } = montar([]);
    win.Util = { grafiaAtlas: lib.grafiaAtlas, clavesMunicipio: lib.clavesMunicipio,
                 clavesMunicipioRango: lib.clavesMunicipioRango };
    await atlas.deFicha({ city: 'Granada', province: 'Granada' });
    A.contains(decodeURIComponent(consultas[0]), '*Granada*',
               'y a las 40 que ya funcionaban se les pregunta igual que antes');
  }

  // ── Bordes ────────────────────────────────────────────────────────────────
  {
    const { consultas, atlas } = montar(GRANADA);
    A.eq((await atlas.deFicha(null)).estado, 'error', 'sin ficha, error');
    A.eq((await atlas.deFicha({ city: '', province: 'Granada' })).estado, 'sin-municipio',
         'sin municipio no se consulta nada');
    A.eq(consultas.length, 0, 'y de verdad no se consulta');
  }

  const s = A.summary();
  console.log(JSON.stringify(s));
  process.exit(s.failed > 0 ? 1 : 0);
})().catch(e => { console.error(e.message); process.exit(1); });
