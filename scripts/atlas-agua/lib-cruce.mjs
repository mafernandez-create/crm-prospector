// Fontanería compartida de los scripts del Atlas: entorno, lectura del CRM
// (solo GET), lectura del CSV del Atlas y cruce municipio→fila.
//
// Vive aquí, y no copiada en cada script, porque el cruce es la parte que se
// equivoca: el CSV lleva saltos de línea dentro de campos entrecomillados
// (`wc -l` da 9.404 filas donde un lector de CSV de verdad da 8.213), y la
// resolución del municipio tiene dos pasadas (provincia+municipio, y municipio
// solo cuando no es ambiguo).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normMuni, clavesMunicipio, clavesMunicipioRango, clavesProvincia } from './lib-muni.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const RAIZ = path.resolve(AQUI, '..', '..');
export const PROYECTOS = path.resolve(RAIZ, '..');

// ─── entorno ────────────────────────────────────────────────────────────────
export function cargarEnv() {
  for (const f of ['.env.local', '.env']) {
    const p = path.join(RAIZ, f);
    if (!fs.existsSync(p)) continue;
    for (const ln of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = ln.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
    }
  }
}

export const CSV = () => process.env.ATLAS_CRM_CSV ||
  path.join(PROYECTOS, 'atlas-del-agua-gpf', 'exportaciones', 'crm_atlas_municipios.csv');
export const AQUA = () => process.env.AQUA_DB ||
  path.join(PROYECTOS, 'aqua-prescribe', 'datos', 'aqua.db');

// ─── CRM: solo lectura, por construcción ────────────────────────────────────
export async function get(ruta) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  const r = await fetch(`${url}/rest/v1/${ruta}`, {
    method: 'GET',                                   // este script nunca escribe
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

export async function fichas() {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const p = await get(`studios?select=id,name,city,province,type,status,es_cliente_puente` +
                        `&order=id&offset=${off}&limit=1000`);
    out.push(...p);
    if (p.length < 1000) break;
  }
  return out;
}

// ─── Atlas ──────────────────────────────────────────────────────────────────
export function leerCsv(ruta) {
  const txt = fs.readFileSync(ruta, 'utf8');
  const filas = []; let campo = '', fila = [], enCita = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (enCita) {
      if (c === '"' && txt[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') enCita = false;
      else campo += c;
    } else if (c === '"') enCita = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    else if (c !== '\r') campo += c;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  const cab = filas.shift();
  return filas.filter(f => f.length === cab.length)
              .map(f => Object.fromEntries(cab.map((k, i) => [k, f[i]])));
}

/**
 * Palabras que son nombre de sitio, no de empresa. Salen del propio Atlas
 * (8.213 municipios y sus provincias), así que no hay lista que mantener.
 * Sirven para no dar por encontrada una empresa cuando lo único que coincide
 * es el topónimo: «Empresa Municipal … de Granada» engancharía cualquier
 * ayuntamiento de Granada, y eso no es un hallazgo, es ruido.
 */
export function toponimos(atlas) {
  const out = new Set();
  for (const r of atlas) {
    for (const campo of [r.municipio, r.provincia]) {
      for (const p of normMuni(campo).split(/[\s/,'()-]+/)) {
        if (p.length >= 4) out.add(p);
      }
    }
  }
  return out;
}

/**
 * Grafías de una provincia. El Atlas usa la del INE, que a veces lleva las dos
 * lenguas en el mismo campo —«Alacant/Alicante», «Castelló/Castellón»—, mientras
 * el CRM guarda una sola. Comparar los dos campos por igualdad exacta hacía que
 * NINGUNA ficha de Alicante cruzara por provincia: acertaban por la vía de
 * respaldo (municipio único en toda España), que es silenciosa y se rompe el día
 * que dos provincias tengan un municipio con el mismo nombre.
 * Las mismas reglas que para municipios sirven aquí (la barra, el artículo de
 * «A Coruña»), así que se reutilizan en vez de escribir otras; a eso
 * clavesProvincia le suma los exónimos de provincia («Baleares» ↔ «Illes
 * Balears»), que no comparten ninguna palabra y por tanto ninguna regla.
 */

/**
 * De todos los municipios que reclaman una clave, el que tiene derecho a ella.
 * Gana el rango más específico (la grafía propia le gana a la derivada); si en
 * ese rango siguen quedando municipios distintos, la clave es inservible y no
 * se resuelve: antes un hueco que el organismo de cuenca de otro pueblo.
 */
function _dueno(reclamos) {
  if (!reclamos || !reclamos.length) return null;
  const mejor = Math.min(...reclamos.map(x => x.rango));
  const top = reclamos.filter(x => x.rango === mejor);
  return new Set(top.map(x => x.fila.ine)).size === 1 ? top[0].fila : null;
}

export function indexarAtlas(atlas) {
  // Se acumulan TODOS los reclamos de cada clave y se decide al final. Quedarse
  // con el primero que llega hacía que el orden de las filas eligiera por
  // nosotros: con `order=municipio`, «El Pinar» le robaba `pinar` a «Píñar».
  const reclProv = new Map(), reclMuni = new Map();
  for (const r of atlas) {
    for (const { clave, rango } of clavesMunicipioRango(r.municipio)) {
      if (!reclMuni.has(clave)) reclMuni.set(clave, []);
      reclMuni.get(clave).push({ fila: r, rango });
      for (const p of clavesProvincia(r.provincia)) {
        const k = p + '|' + clave;
        if (!reclProv.has(k)) reclProv.set(k, []);
        reclProv.get(k).push({ fila: r, rango });
      }
    }
  }
  const porProv = new Map(), porMuni = new Map();
  for (const [k, v] of reclProv) { const f = _dueno(v); if (f) porProv.set(k, f); }
  for (const [k, v] of reclMuni) { const f = _dueno(v); if (f) porMuni.set(k, f); }
  return { porProv, porMuni };
}

export function resolver(idx, city, province) {
  if (!city) return null;
  // Las claves de la ficha se prueban también por especificidad: la grafía
  // propia antes que la derivada.
  const cs = clavesMunicipioRango(city).sort((a, b) => a.rango - b.rango).map(x => x.clave);
  for (const p of clavesProvincia(province)) {
    for (const c of cs) {
      const r = idx.porProv.get(p + '|' + c);
      if (r) return { fila: r, via: 'provincia+municipio' };
    }
  }
  // Respaldo: el municipio es único en toda España, así que da igual que la
  // provincia de la ficha no cuadre. Se avisa en la `via` porque es más frágil.
  for (const c of cs) {
    const r = idx.porMuni.get(c);
    if (r) return { fila: r, via: 'solo municipio (la provincia de la ficha no cuadra)' };
  }
  return null;
}
