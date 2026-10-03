#!/usr/bin/env node
/**
 * Contexto de agua de una zona, para el briefing previo a una ruta.
 *
 * Responde a «¿quién gestiona el agua donde tengo cartera?» cruzando tres
 * fuentes locales, SIN escribir en ninguna:
 *   - el CRM (Supabase): las fichas de la zona            → solo GET
 *   - el Atlas del Agua: municipio → operador / demarcación / organismo
 *   - aqua-prescribe: licitaciones y adjudicaciones del agua → sqlite en modo ro
 *
 * Uso:
 *   node scripts/atlas-agua/contexto-agua.mjs Granada Almería
 *   node scripts/atlas-agua/contexto-agua.mjs --ficha 2307
 *   node scripts/atlas-agua/contexto-agua.mjs Murcia --json
 *
 * Variables (se leen de .env.local si existe):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   obligatorias
 *   ATLAS_CRM_CSV   por omisión ../atlas-del-agua-gpf/exportaciones/crm_atlas_municipios.csv
 *   AQUA_DB         por omisión ../aqua-prescribe/datos/aqua.db
 */

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { normMuni } from './lib-muni.mjs';
import { indexarNombres } from './lib-nombres.mjs';
import { cargarEnv, CSV, AQUA, fichas, leerCsv, indexarAtlas, resolver, toponimos } from './lib-cruce.mjs';

// ─── aqua ───────────────────────────────────────────────────────────────────
function sql(consulta) {
  const db = AQUA();
  if (!fs.existsSync(db)) return null;
  try {
    // El `?mode=ro` es lo ÚNICO que garantiza que esto no escribe en la base de
    // aqua. Si alguien lo quita, la garantía desaparece y ningún grep de los
    // habituales (POST, writeFile, .insert) lo nota. No tocar.
    const out = execFileSync('sqlite3', ['-json', `file:${db}?mode=ro`, consulta],
                             { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    return out.trim() ? JSON.parse(out) : [];
  } catch (e) {
    return { error: String(e.message || e).slice(0, 200) };
  }
}

const esc = s => String(s).replace(/'/g, "''");
const aquaProv = s => normMuni(s).toUpperCase();

// ─── presentación ───────────────────────────────────────────────────────────
const tel = s => (s && s.trim()) ? s.trim() : '—';

function tabla(cabs, filas) {
  if (!filas.length) return '_nada_\n';
  const anchos = cabs.map((c, i) => Math.max(c.length, ...filas.map(f => String(f[i] ?? '').length)));
  const linea = f => '| ' + f.map((v, i) => String(v ?? '').padEnd(anchos[i])).join(' | ') + ' |';
  return [linea(cabs), '|' + anchos.map(a => '-'.repeat(a + 2)).join('|') + '|',
          ...filas.map(linea)].join('\n') + '\n';
}

// ─── principal ──────────────────────────────────────────────────────────────
async function main() {
  cargarEnv();
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const iF = args.indexOf('--ficha');
  const fichaId = iF >= 0 ? args[iF + 1] : null;
  const provs = args.filter((a, i) => !a.startsWith('--') && !(iF >= 0 && i === iF + 1));

  if (!fichaId && !provs.length) {
    console.error('uso: contexto-agua.mjs <provincia...> [--json]  |  --ficha <id>');
    process.exit(2);
  }

  const rutaCsv = CSV();
  if (!fs.existsSync(rutaCsv)) {
    console.error(`no encuentro el export del Atlas en ${rutaCsv}\n` +
                  `generalo con: python3 ../atlas-del-agua-gpf/scripts/exportar_crm.py`);
    process.exit(1);
  }
  const atlas = leerCsv(rutaCsv);
  const idx = indexarAtlas(atlas);
  const todas = await fichas();

  const zona = new Set(provs.map(normMuni));
  const sel = fichaId
    ? todas.filter(s => String(s.id) === String(fichaId))
    : todas.filter(s => zona.has(normMuni(s.province)));
  if (!sel.length) {
    console.error(fichaId ? `ficha ${fichaId} no encontrada` : `sin fichas en ${provs.join(', ')}`);
    process.exit(1);
  }

  // cruce ficha → municipio
  const cruzadas = [], sinCity = [], sinMuni = [];
  for (const s of sel) {
    if (!(s.city || '').trim()) { sinCity.push(s); continue; }
    const r = resolver(idx, s.city, s.province);
    r ? cruzadas.push({ s, ...r }) : sinMuni.push(s);
  }

  // operadores
  const ops = new Map();
  for (const { s, fila } of cruzadas) {
    if (fila.gestion !== 'operador') continue;
    // `operador_id` con respaldo al nombre: hay filas del Atlas con operador y
    // sin id, y agrupar por `undefined` metía operadores distintos en el mismo
    // cubo. Mismo criterio que puente-operadores.mjs.
    const k = fila.operador_id || fila.operador;
    if (!ops.has(k)) ops.set(k, { fila, munis: new Set(), fichas: [] });
    ops.get(k).munis.add(fila.ine);
    ops.get(k).fichas.push(s);
    /* La oficina se elige, no se hereda de la primera fila que entró. Cada
       municipio del Atlas trae la oficina MÁS CERCANA EN KILÓMETROS a ese
       municipio, no la delegación que lo atiende: la fila que abría el grupo
       podía dejar una oficina a 1.347 km de la cartera. Se guarda la del
       municipio donde hay ficha que la tiene más cerca, y el km va impreso al
       lado para que se vea cuándo el dato no sirve. Un km vacío pierde contra
       cualquier número. */
    const km = fila.oficina_km === '' || fila.oficina_km == null
      ? Infinity : Number(fila.oficina_km);
    const o = ops.get(k);
    if (o.ofiKm === undefined || km < o.ofiKm) { o.ofiKm = km; o.ofi = fila; }
  }
  const ordenados = [...ops.values()].sort((a, b) => b.munis.size - a.munis.size);

  // ¿el operador ya es ficha del CRM? Coincidencia por nombre: siempre «posible»,
  // nunca un hecho. La lógica vive en lib-nombres.mjs, compartida con puente-operadores.mjs.
  const { posibleFicha } = indexarNombres(todas, toponimos(atlas));

  // gestión directa
  const directa = new Map();
  for (const { s, fila } of cruzadas) {
    if (fila.gestion === 'operador') continue;
    if (!directa.has(fila.ine)) directa.set(fila.ine, { fila, fichas: [] });
    directa.get(fila.ine).fichas.push(s);
  }

  // demarcaciones
  const dem = new Map();
  for (const { fila } of cruzadas) {
    if (!fila.demarcacion_id) continue;
    if (!dem.has(fila.demarcacion_id)) dem.set(fila.demarcacion_id, { fila, munis: new Set() });
    dem.get(fila.demarcacion_id).munis.add(fila.ine);
  }

  // aqua
  const provSql = provs.map(p => `'${esc(aquaProv(p))}'`).join(',');
  const aqua = {
    volcado: null, pre: [], abiertas: [], adjudicadas: [],
  };
  /* `sql()` devuelve `{ error }` cuando sqlite3 falla —base bloqueada, binario
     ausente, consulta rota—, y `|| []` no lo filtra porque un objeto es
     verdadero: la lista quedaba a `{error}` y el `.map()` de más abajo tumbaba
     el briefing entero con un TypeError. Un apartado de aqua vacío es una
     pérdida menor; perder también el contexto del Atlas, que ya estaba
     calculado, no. Los fallos se acumulan y se declaran al final. */
  const fallos = [];
  const filas = r => {
    if (Array.isArray(r)) return r;
    if (r && r.error) fallos.push(r.error);
    return [];
  };
  const meta = sql(`select valor from meta where clave='volcado'`);
  if (meta && !meta.error && meta[0]) aqua.volcado = meta[0].valor;
  else if (meta && meta.error) fallos.push(meta.error);
  if (provSql) {
    aqua.pre = filas(sql(`select e.expediente, e.objeto, e.importe, e.fecha_limite, e.provincia,
                           o.nombre organo, e.enlace_licitacion
                    from expedientes e join organos o on o.id=e.organo_id
                    where e.agua=1 and e.estado='PRE' and e.provincia in (${provSql})
                    order by e.fecha_limite desc limit 20`));
    // «Plazo abierto» es el plazo que todavía está abierto: hay que comparar con hoy.
    // Sin el filtro de fecha salían 1.085 de 1.412 expedientes con el plazo ya pasado
    // (GR(CO)-7337 aparecía como abierto con límite del 25-nov-2025 y ya adjudicado).
    // Primero el que vence antes: es el que corre prisa.
    aqua.abiertas = filas(sql(`select e.expediente, e.objeto, e.importe, e.fecha_limite, e.provincia,
                                o.nombre organo, e.enlace_licitacion
                         from expedientes e join organos o on o.id=e.organo_id
                         where e.agua=1 and e.prescribible=1 and e.clase='R'
                           and e.estado in ('PUB','EV') and e.provincia in (${provSql})
                           and e.fecha_limite >= date('now')
                         order by e.fecha_limite asc limit 20`));
    // Plazo cerrado y aún sin adjudicatario: la adjudicación está a la vuelta de la
    // esquina. No es prescribible ya, pero avisa de a quién llamar dentro de poco.
    aqua.evaluando = filas(sql(`select e.expediente, e.objeto, e.importe, e.fecha_limite, e.provincia,
                                 o.nombre organo
                          from expedientes e join organos o on o.id=e.organo_id
                          where e.agua=1 and e.prescribible=1 and e.clase='R'
                            and e.estado in ('PUB','EV') and e.provincia in (${provSql})
                            and e.fecha_limite < date('now') and e.adjudicatario is null
                          order by e.fecha_limite desc limit 10`));
    aqua.adjudicadas = filas(sql(`select e.expediente, e.objeto, e.importe, e.provincia,
                                   e.adjudicatario, e.empresa_id, o.nombre organo
                            from expedientes e join organos o on o.id=e.organo_id
                            where e.agua=1 and e.clase='R' and e.adjudicatario is not null
                              and e.provincia in (${provSql})
                            order by e.anio desc, e.importe desc limit 25`));
  }

  if (json) {
    console.log(JSON.stringify({ provincias: provs, fichaId, atlas_fecha: atlas[0]?.fecha_datos,
      aqua_volcado: aqua.volcado, fichas: sel.length, cruzadas: cruzadas.length,
      sin_city: sinCity.length, sin_municipio: sinMuni.map(s => ({ id: s.id, city: s.city })),
      operadores: ordenados.map(o => ({ ...o.fila, municipios: o.munis.size, fichas: o.fichas.length })),
      gestion_directa: [...directa.values()].map(d => ({ municipio: d.fila.municipio, fichas: d.fichas.length })),
      demarcaciones: [...dem.values()].map(d => ({ demarcacion: d.fila.demarcacion, organismo: d.fila.organismo, municipios: d.munis.size })),
      aqua }, null, 2));
    return;
  }

  const L = [];
  L.push(`# Contexto de agua — ${fichaId ? `ficha ${fichaId}` : provs.join(', ')}`);
  L.push('');
  L.push(`Fichas en la zona: **${sel.length}** · con municipio resuelto: **${cruzadas.length}** · ` +
         `sin municipio en la ficha: ${sinCity.length} · municipio no reconocido: ${sinMuni.length}`);
  L.push(`Atlas: datos de ${atlas[0]?.fecha_datos || '?'} · aqua: volcado de ${aqua.volcado || 'no disponible'}`);
  L.push('');

  L.push('## Quién gestiona el agua donde tienes cartera');
  L.push('');
  const oficina = o => {
    const f = o.ofi || o.fila;
    if (!f.oficina_localidad) return '—';
    const km = o.ofiKm;
    return f.oficina_localidad +
      (km != null && Number.isFinite(km) ? ` (a ${km} km)` : ' (km sin dato)');
  };
  L.push(tabla(['Operador', 'Grupo', 'Munis', 'Fichas', 'Oficina más cercana', 'Teléfono', '¿Ficha en CRM?'],
    ordenados.map(o => [
      o.fila.operador, o.fila.grupo || '—', o.munis.size, o.fichas.length,
      oficina(o), tel((o.ofi || o.fila).oficina_telefono),
      posibleFicha(o.fila.operador).join(' · ') || 'no la encuentro',
    ])));
  L.push('> «Oficina más cercana»: la que el Atlas da a menor distancia de un municipio donde tienes ficha. ' +
         '**No es la delegación que lleva la zona** — mira el km antes de llamar.');
  L.push('> Última columna: coincidencia por nombre, **sin verificar**. `=` el nombre es el mismo; ' +
         '`~` la ficha lo contiene o comparten una palabra — ábrela antes de darla por buena.');
  L.push('');

  L.push('## Municipios de gestión directa (el agua la lleva el propio ayuntamiento)');
  L.push('');
  const dir = [...directa.values()].sort((a, b) => b.fichas.length - a.fichas.length);
  L.push(tabla(['Municipio', 'Provincia', 'Fichas', 'Fuente de la asignación'],
    dir.slice(0, 40).map(d => [d.fila.municipio, d.fila.provincia, d.fichas.length,
                               (d.fila.fuente || '—').slice(0, 60)])));
  if (dir.length > 40) L.push(`_y ${dir.length - 40} municipios más._`);
  L.push('');

  L.push('## Demarcación y organismo de cuenca');
  L.push('');
  L.push(tabla(['Demarcación', 'Organismo', 'Munis', 'Sede', 'Teléfono'],
    [...dem.values()].sort((a, b) => b.munis.size - a.munis.size).map(d =>
      [d.fila.demarcacion, d.fila.organismo, d.munis.size,
       d.fila.organismo_sede || '—', tel(d.fila.organismo_telefono)])));
  L.push('');

  L.push('## aqua — lo que se mueve en la zona');
  L.push('');
  const corta = s => (s || '').slice(0, 70);
  const eur = v => v ? Math.round(Number(v)).toLocaleString('es-ES') + ' €' : '—';
  L.push('### Anuncios previos (lo más temprano que existe)');
  L.push(tabla(['Expediente', 'Objeto', 'Importe', 'Órgano'],
    (aqua.pre || []).map(r => [r.expediente, corta(r.objeto), eur(r.importe), corta(r.organo)])));
  L.push('');
  L.push('### Redacción del agua con plazo abierto');
  L.push(tabla(['Expediente', 'Objeto', 'Importe', 'Límite', 'Órgano'],
    (aqua.abiertas || []).map(r => [r.expediente, corta(r.objeto), eur(r.importe),
                                    r.fecha_limite || '—', corta(r.organo)])));
  L.push('');
  L.push('### Plazo cerrado, sin adjudicar todavía (se resuelve pronto)');
  L.push(tabla(['Expediente', 'Objeto', 'Importe', 'Cerró', 'Órgano'],
    (aqua.evaluando || []).map(r => [r.expediente, corta(r.objeto), eur(r.importe),
                                     r.fecha_limite || '—', corta(r.organo)])));
  L.push('');
  L.push('### Quién gana la redacción del agua aquí');
  L.push(tabla(['Adjudicatario', 'Objeto', 'Importe', '¿Ficha en CRM?'],
    (aqua.adjudicadas || []).map(r => [r.adjudicatario, corta(r.objeto), eur(r.importe),
      posibleFicha(r.adjudicatario).join(' · ').slice(0, 60) || '—'])));
  L.push('> Un adjudicatario sin ficha es un candidato a alta, no un alta: el nombre del pliego y el');
  L.push('> de la ficha casi nunca coinciden letra a letra. Compruébalo antes de crear nada.');
  L.push('');

  L.push('## Lo que esto NO dice');
  L.push('');
  L.push(`- ${sinCity.length} fichas de la zona no tienen municipio: no hay contexto de agua para ellas.`);
  // Caso real: el pliego dice «Empresa Municipal de Abastecimiento y Saneamiento de
  // Granada S.A» y el CRM la tiene como «HIDRALIA A TRAVES DE EMASAGRA» (2312). Ningún
  // cruce por nombre salva eso, así que más vale decirlo que dejar un «—» mudo.
  L.push('- El cruce con el CRM es **por nombre**. Una empresa que esté en el CRM con sus siglas, ' +
         'o como «X A TRAVÉS DE Y», sale aquí como si no tuviera ficha. Antes de dar de alta a ' +
         'un adjudicatario, mira la tabla de operadores de arriba y busca sus siglas en el CRM.');
  if (sinMuni.length) {
    L.push(`- ${sinMuni.length} fichas tienen un municipio que el Atlas no reconoce ` +
           `(municipio provisional, o el nombre castellano de uno con nombre oficial en otra lengua): ` +
           sinMuni.slice(0, 10).map(s => `${s.id} «${s.city}»`).join(', ') + '.');
  }
  const conTel = ordenados.filter(o => (o.fila.oficina_telefono || '').trim()).length;
  L.push(`- Teléfono de oficina: lo tienen ${conTel} de ${ordenados.length} operadores. El resto, solo dirección o web.`);
  if (fallos.length) {
    L.push('- **aqua no respondió** a ' + fallos.length + ' de las consultas, así que sus apartados ' +
           'salen vacíos aunque haya expedientes: `' + fallos[0] + '`. El contexto del Atlas de arriba ' +
           'sí es bueno.');
  }
  // La oficina del Atlas es la más cercana en kilómetros al municipio, no la
  // delegación que lleva la zona: Manolo llamó a una a 1.347 km creyendo que era «la suya».
  L.push('- «Oficina más cercana» es distancia en kilómetros, **no un mapa de delegaciones**. ' +
         'Que una oficina salga al lado de tu municipio no significa que sea la que lo atiende.');
  L.push('- El objeto de los expedientes de aqua viene cortado a 95 caracteres en origen.');
  L.push('- La provincia de un expediente es la del **órgano que licita**, no la del domicilio de la empresa.');
  L.push('');
  console.log(L.join('\n'));
}

main().catch(e => { console.error('error:', e.message); process.exit(1); });
