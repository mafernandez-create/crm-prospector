// Unit tests de la carga de `atlas_municipios`: qué queda en la tabla cuando la
// carga se interrumpe a mitad.
//
// Es la única pieza de todo el Atlas que escribe en la base de datos, y escribe
// 8.213 filas en diecisiete peticiones. PostgREST no da transacciones por HTTP,
// así que «a mitad» es un estado posible de verdad: basta un token caducado, un
// 503 o la wifi de un hotel. La versión anterior vaciaba la tabla y subía
// después, de modo que una interrupción dejaba la tabla a medias y el bloque de
// agua decía «no reconozco el municipio» en la mitad de las fichas, calladamente,
// hasta que alguien abría una. Ahora escribe encima y borra al final lo que
// sobra: una interrupción deja el dato VIEJO, que es antiguo pero completo.
//
// El test levanta un PostgREST de juguete en localhost —el subconjunto que usa
// el script— y ejecuta `cargar.mjs --confirmar` de verdad contra él, como un
// proceso hijo. No toca Supabase: ni el de producción ni ningún otro.

const fs    = require('fs');
const http  = require('http');
const os    = require('os');
const path  = require('path');
const { spawn } = require('child_process');
const A     = require('../_lib/assert');

A.reset();

const RAIZ = path.resolve(__dirname, '..', '..', '..');
const CARGAR = path.join(RAIZ, 'scripts', 'atlas-agua', 'cargar.mjs');

const COLUMNAS = ['ine', 'municipio', 'provincia_ine', 'provincia', 'gestion',
  'operador_id', 'operador', 'operador_tipo', 'grupo_id', 'grupo',
  'demarcacion_id', 'demarcacion', 'demarcacion_tipo',
  'organismo_id', 'organismo', 'organismo_sede',
  'organismo_telefono', 'organismo_email', 'organismo_web',
  'oficina_localidad', 'oficina_direccion', 'oficina_telefono', 'oficina_web', 'oficina_km',
  'fuente', 'fecha_datos', 'fecha_export'];

/* El operador de una fila, o null si la fila no está. Sin esto, la versión
   vieja del script no hacía fallar el test: lo hacía estallar, y un error sin
   resumen no dice cuál de las cuatro cosas se ha roto. */
const op = (t, ine) => (t.get(ine) || {}).operador || null;

/** CSV de juguete con las columnas que espera la tabla. `n` filas de INE 00001… */
function csvDe(n, operador) {
  const lineas = [COLUMNAS.join(',')];
  for (let i = 1; i <= n; i++) {
    const ine = String(i).padStart(5, '0');
    const f = COLUMNAS.map(c => {
      if (c === 'ine') return ine;
      if (c === 'municipio') return 'Pueblo ' + i;
      if (c === 'operador') return operador;
      if (c === 'gestion') return 'operador';
      if (c === 'oficina_km') return '';
      if (c === 'fecha_datos' || c === 'fecha_export') return '2026-10-03';
      return '';
    });
    lineas.push(f.join(','));
  }
  return lineas.join('\n') + '\n';
}

/**
 * PostgREST de juguete. `fallarEnPost` corta la petición número N de escritura,
 * que es exactamente lo que pasa cuando caduca el token a mitad de la carga.
 */
function servidor(tabla, fallarEnPost) {
  let posts = 0;
  const srv = http.createServer((req, res) => {
    const [ruta, query] = req.url.replace('/rest/v1/', '').split('?');
    const cuerpo = [];
    req.on('data', c => cuerpo.push(c));
    req.on('end', () => {
      if (ruta !== 'atlas_municipios') { res.writeHead(404); return res.end('[]'); }

      if (req.method === 'GET') {
        const q = new URLSearchParams(query || '');
        const inicio = Number(q.get('offset') || 0);
        const lim = Number(q.get('limit') || 1000);
        const ines = [...tabla.keys()].sort();
        const trozo = ines.slice(inicio, inicio + lim).map(ine => ({ ine }));
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Content-Range': `${inicio}-${inicio + trozo.length}/${tabla.size}`,
        });
        return res.end(JSON.stringify(trozo));
      }

      if (req.method === 'POST') {
        posts++;
        if (posts === fallarEnPost) { res.writeHead(503); return res.end('se cayó'); }
        JSON.parse(Buffer.concat(cuerpo).toString()).forEach(f => tabla.set(f.ine, f));
        res.writeHead(201); return res.end('');
      }

      if (req.method === 'DELETE') {
        const m = decodeURIComponent(query || '').match(/ine=in\.\((.*)\)/);
        if (m) m[1].split(',').forEach(x => tabla.delete(x.replace(/"/g, '')));
        else tabla.clear();                       // el DELETE-de-todo de la versión vieja
        res.writeHead(204); return res.end('');
      }
      res.writeHead(405); res.end('');
    });
  });
  return new Promise(ok => srv.listen(0, '127.0.0.1', () => ok({
    srv, puerto: srv.address().port, cerrar: () => new Promise(f => srv.close(f)),
  })));
}

/**
 * Ejecuta cargar.mjs contra el servidor de juguete. Devuelve { ok, salida }.
 *
 * Tiene que ser asíncrono: el servidor de juguete vive en ESTE proceso, y con
 * execFileSync el bucle de eventos se queda bloqueado esperando al hijo, que a
 * su vez espera una respuesta que nadie va a dar. Interbloqueo, y el test se
 * cuelga sin decir nada.
 */
function correr(puerto, csv, args = ['--confirmar']) {
  return new Promise(ok => {
    const h = spawn(process.execPath, [CARGAR, ...args], {
      env: {
        ...process.env,
        SUPABASE_URL: `http://127.0.0.1:${puerto}`,
        SUPABASE_SERVICE_ROLE_KEY: 'de-juguete',
        ATLAS_CRM_CSV: csv,
      },
    });
    let salida = '';
    h.stdout.on('data', c => { salida += c; });
    h.stderr.on('data', c => { salida += c; });
    h.on('close', cod => ok({ ok: cod === 0, salida }));
  });
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-cargar-'));
  // 1.200 filas = tres lotes de 500: hay un «a mitad» de verdad que probar.
  const csv = path.join(tmp, 'crm_atlas_municipios.csv');
  fs.writeFileSync(csv, csvDe(1200, 'Operador NUEVO'));

  // Lo que había antes: la misma tabla cargada con el operador viejo, más un
  // municipio que el Atlas ya no trae (una fusión de municipios, por ejemplo).
  const previas = () => {
    const t = new Map();
    for (let i = 1; i <= 1200; i++) {
      const ine = String(i).padStart(5, '0');
      t.set(ine, { ine, municipio: 'Pueblo ' + i, operador: 'Operador VIEJO' });
    }
    t.set('99999', { ine: '99999', municipio: 'Desaparecido', operador: 'Operador VIEJO' });
    return t;
  };

  // ── Carga completa: deja la tabla igual al export ──────────────────────────
  {
    const tabla = previas();
    const s = await servidor(tabla, 0);
    const r = await correr(s.puerto, csv);
    await s.cerrar();
    A.truthy(r.ok, 'la carga completa termina bien');
    A.eq(tabla.size, 1200, 'quedan las 1.200 filas del export, ni una más');
    A.eq(op(tabla, '00001'), 'Operador NUEVO', 'y con el dato nuevo');
    A.falsy(tabla.has('99999'), 'el municipio que ya no está en el Atlas se borra');
  }

  // ── Interrupción a mitad: lo que no llegó conserva el dato viejo ───────────
  // Esto es el arreglo. Con el DELETE-primero, aquí quedaban 500 filas de 1.201
  // y 700 municipios sin nadie que gestionase el agua.
  {
    const tabla = previas();
    const s = await servidor(tabla, 2);              // se cae el segundo lote
    const r = await correr(s.puerto, csv);
    await s.cerrar();
    A.falsy(r.ok, 'la carga interrumpida falla, y lo dice');
    A.eq(tabla.size, 1201, 'la tabla sigue COMPLETA: ninguna ficha se queda sin dato');
    A.eq(op(tabla, '00001'), 'Operador NUEVO', 'lo que llegó, actualizado');
    A.eq(op(tabla, '01000'), 'Operador VIEJO',
         'y lo que no llegó conserva el dato anterior, no un hueco');
  }

  // ── Y repetir el comando la termina ───────────────────────────────────────
  // Que sea repetible es la otra mitad del arreglo: con el DELETE-primero, el
  // segundo intento volvía a empezar por vaciar la tabla.
  {
    const tabla = previas();
    const s1 = await servidor(tabla, 2);
    await correr(s1.puerto, csv);
    await s1.cerrar();
    const s2 = await servidor(tabla, 0);
    const r = await correr(s2.puerto, csv);
    await s2.cerrar();
    A.truthy(r.ok, 'el segundo intento termina');
    A.eq(tabla.size, 1200, 'y deja la tabla como debe quedar');
    A.eq(op(tabla, '01000'), 'Operador NUEVO', 'con todo actualizado');
  }

  // ── El ensayo sigue sin escribir nada ─────────────────────────────────────
  {
    const tabla = previas();
    const s = await servidor(tabla, 0);
    const { salida } = await correr(s.puerto, csv, []);
    await s.cerrar();
    A.contains(salida, 'Ensayo', 'sin --confirmar es un ensayo');
    A.eq(op(tabla, '00001'), 'Operador VIEJO', 'y no ha escrito nada');
  }

  fs.rmSync(tmp, { recursive: true, force: true });

  const s = A.summary();
  console.log(JSON.stringify(s));
  process.exit(s.failed > 0 ? 1 : 0);
})().catch(e => { console.error(e.message); process.exit(1); });
