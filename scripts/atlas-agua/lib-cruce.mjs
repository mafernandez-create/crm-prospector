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
import { normMuni, clavesMunicipio } from './lib-muni.mjs';

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
 * «A Coruña»), así que se reutilizan en vez de escribir otras.
 */
const clavesProvincia = clavesMunicipio;

export function indexarAtlas(atlas) {
  const porProv = new Map(), porMuni = new Map();
  for (const r of atlas) {
    const cs = clavesMunicipio(r.municipio);
    for (const c of cs) {
      if (!porMuni.has(c)) porMuni.set(c, []);
      porMuni.get(c).push(r);
      for (const p of clavesProvincia(r.provincia)) {
        const k = p + '|' + c;
        if (!porProv.has(k)) porProv.set(k, r);
      }
    }
  }
  return { porProv, porMuni };
}

export function resolver(idx, city, province) {
  if (!city) return null;
  const cs = clavesMunicipio(city);
  for (const p of clavesProvincia(province)) {
    for (const c of cs) {
      const r = idx.porProv.get(p + '|' + c);
      if (r) return { fila: r, via: 'provincia+municipio' };
    }
  }
  // Respaldo: el municipio es único en toda España, así que da igual que la
  // provincia de la ficha no cuadre. Se avisa en la `via` porque es más frágil.
  for (const c of cs) {
    const cand = idx.porMuni.get(c);
    if (cand && new Set(cand.map(x => x.ine)).size === 1) {
      return { fila: cand[0], via: 'solo municipio (la provincia de la ficha no cuadra)' };
    }
  }
  return null;
}
