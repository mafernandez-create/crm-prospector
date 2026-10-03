#!/usr/bin/env node
/**
 * Carga la tabla derivada `atlas_municipios` en Supabase desde el export del Atlas.
 *
 * Es la ÚNICA pieza de todo esto que escribe en la base de datos, y solo en esa tabla:
 * nunca toca `studios` ni ninguna otra. Deja la tabla igual al export (el Atlas es la
 * fuente de verdad; aquí no hay nada que conservar), pero escribiendo encima y borrando
 * al final lo que sobra, no vaciándola primero: ver el comentario del upsert.
 *
 *   node scripts/atlas-agua/cargar.mjs              # ensayo: comprueba y no escribe
 *   node scripts/atlas-agua/cargar.mjs --confirmar   # carga de verdad
 *
 * Antes de la primera carga hay que aplicar las migraciones de `atlas_municipios`
 * (supabase/migrations/*_atlas_municipios*.sql). El nombre exacto NO se escribe aquí:
 * se lee del disco. La versión anterior citaba `20261002120000_atlas_municipios.sql`, que
 * nunca existió —los ficheros reales llevan la hora en que se generaron—, así que el
 * mensaje de error mandaba a un sitio vacío justo cuando hacía falta acertar.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..', '..');

/** Las migraciones de esta tabla, tal y como se llamen hoy en el disco. */
function migracionesAtlas() {
  const dir = path.join(RAIZ, 'supabase', 'migrations');
  let files = [];
  try {
    files = fs.readdirSync(dir).filter(f => /atlas_municipios.*\.sql$/.test(f)).sort();
  } catch (_) { /* sin carpeta de migraciones: se avisa igual, sin nombres */ }
  return files.length
    ? files.map(f => '  supabase/migrations/' + f).join('\n')
    : '  (no encuentro ninguna supabase/migrations/*_atlas_municipios*.sql)';
}
const LOTE = 500;

const COLUMNAS = ['ine', 'municipio', 'provincia_ine', 'provincia', 'gestion',
  'operador_id', 'operador', 'operador_tipo', 'grupo_id', 'grupo',
  'demarcacion_id', 'demarcacion', 'demarcacion_tipo',
  'organismo_id', 'organismo', 'organismo_sede',
  'organismo_telefono', 'organismo_email', 'organismo_web',
  'oficina_localidad', 'oficina_direccion', 'oficina_telefono', 'oficina_web', 'oficina_km',
  'fuente', 'fecha_datos', 'fecha_export'];

function cargarEnv() {
  for (const f of ['.env.local', '.env']) {
    const p = path.join(RAIZ, f);
    if (!fs.existsSync(p)) continue;
    for (const ln of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = ln.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
    }
  }
}

function leerCsv(ruta) {
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
  return { cab, filas: filas.filter(f => f.length === cab.length)
                            .map(f => Object.fromEntries(cab.map((k, i) => [k, f[i]]))) };
}

async function api(ruta, opciones = {}) {
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${ruta}`, {
    ...opciones,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(opciones.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`${opciones.method || 'GET'} ${ruta} → ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r;
}

async function main() {
  cargarEnv();
  const confirmar = process.argv.includes('--confirmar');
  const csv = process.env.ATLAS_CRM_CSV ||
    path.join(RAIZ, '..', 'atlas-del-agua-gpf', 'exportaciones', 'crm_atlas_municipios.csv');

  if (!fs.existsSync(csv)) throw new Error(`no existe ${csv} — genéralo con exportar_crm.py`);
  const { cab, filas } = leerCsv(csv);

  const faltan = COLUMNAS.filter(c => !cab.includes(c));
  const sobran = cab.filter(c => !COLUMNAS.includes(c));
  if (faltan.length || sobran.length) {
    throw new Error(`el CSV no cuadra con la tabla. Faltan: ${faltan.join(', ') || '—'}. ` +
                    `Sobran: ${sobran.join(', ') || '—'}. Revisa exportar_crm.py y la migración.`);
  }

  const ines = new Set(filas.map(f => f.ine));
  if (ines.size !== filas.length) throw new Error(`hay INE repetidos: ${filas.length} filas, ${ines.size} distintos`);
  if (filas.some(f => !f.ine || !f.municipio)) throw new Error('hay filas sin ine o sin municipio');

  const fecha = filas[0].fecha_datos;
  console.log(`CSV: ${filas.length} municipios · datos del Atlas de ${fecha}`);
  console.log(`  con operador:      ${filas.filter(f => f.gestion === 'operador').length}`);
  console.log(`  gestión directa:   ${filas.filter(f => f.gestion === 'directa').length}`);
  console.log(`  con teléfono ofic: ${filas.filter(f => f.oficina_telefono).length}`);

  // ¿existe la tabla?
  let previas = null;
  try {
    const r = await api('atlas_municipios?select=ine&limit=1', { headers: { Prefer: 'count=exact' } });
    previas = Number((r.headers.get('content-range') || '/0').split('/')[1]);
  } catch (e) {
    console.error(`\nLa tabla no responde (${e.message.slice(0, 80)}…).`);
    console.error('Aplica primero estas migraciones:');
    console.error(migracionesAtlas());
    process.exit(1);
  }
  console.log(`Tabla en Supabase: ${previas} filas ahora mismo.`);

  if (!confirmar) {
    console.log(`\nEnsayo. Todo cuadra. Para cargar de verdad (escribe encima de las ${previas} filas):`);
    console.log('  node scripts/atlas-agua/cargar.mjs --confirmar');
    return;
  }

  // el payload va con los tipos que espera Postgres: '' no es un entero ni una fecha
  const limpia = f => {
    const o = {};
    for (const c of COLUMNAS) {
      const v = f[c] === '' ? null : f[c];
      o[c] = c === 'oficina_km' && v != null ? Number(v) : v;
    }
    return o;
  };

  /* Primero se escribe encima y al final se borra lo que sobra. Antes era al
     revés —DELETE de todo y luego subir por lotes—, y eso no es una operación,
     son diecisiete: si el lote noveno fallaba (red, token caducado, un 503 de
     Supabase), la tabla se quedaba con 4.000 municipios y el bloque de agua
     decía «no reconozco el municipio» en la mitad de las fichas, sin que nadie
     se enterara hasta abrir una. PostgREST no da transacciones por HTTP, pero sí
     upsert: haciéndolo en este orden, un fallo a mitad deja el dato VIEJO en los
     municipios que no le llegó el turno, que es un estado antiguo pero completo.
     Y repetir el comando lo termina. */
  const previos = new Set();
  for (let off = 0; ; off += 1000) {
    const r = await api(`atlas_municipios?select=ine&order=ine&offset=${off}&limit=1000`);
    const p = await r.json();
    p.forEach(x => previos.add(x.ine));
    if (p.length < 1000) break;
  }

  console.log(`Subiendo (upsert sobre ${previos.size} filas ya presentes)…`);
  for (let i = 0; i < filas.length; i += LOTE) {
    await api('atlas_municipios?on_conflict=ine', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(filas.slice(i, i + LOTE).map(limpia)),
    });
    process.stdout.write(`\r  ${Math.min(i + LOTE, filas.length)}/${filas.length}`);
  }

  // Lo que estaba y ya no está en el Atlas (fusiones de municipios, sobre todo).
  const sobrantes = [...previos].filter(ine => !ines.has(ine));
  if (sobrantes.length) {
    console.log(`\nBorrando ${sobrantes.length} filas que ya no están en el Atlas…`);
    for (let i = 0; i < sobrantes.length; i += LOTE) {
      const trozo = sobrantes.slice(i, i + LOTE).map(x => `"${x}"`).join(',');
      await api(`atlas_municipios?ine=in.(${encodeURIComponent(trozo)})`, { method: 'DELETE' });
    }
  }
  const r = await api('atlas_municipios?select=ine&limit=1', { headers: { Prefer: 'count=exact' } });
  const ahora = Number((r.headers.get('content-range') || '/0').split('/')[1]);
  console.log(`\nCargadas ${ahora} filas (esperadas ${filas.length}).`);
  if (ahora !== filas.length) process.exit(1);
}

main().catch(e => { console.error('error:', e.message); process.exit(1); });
