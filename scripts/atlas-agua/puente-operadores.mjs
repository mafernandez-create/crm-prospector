#!/usr/bin/env node
/**
 * Operadores del agua que son clientes puente: una sola empresa decide el tubo
 * en varios municipios donde ya tienes cartera.
 *
 * Cuenta, para cada operador del Atlas, en cuántos municipios DISTINTOS tienes
 * fichas, y se queda con los que llegan al umbral (3 por defecto). De cada uno
 * dice si ya tiene ficha en el CRM y si está marcado `es_cliente_puente`.
 *
 * NO escribe nada: ni da de alta, ni marca la casilla. Imprime el comando que
 * haría cada cosa para que lo apruebes tú.
 *
 *   node scripts/atlas-agua/puente-operadores.mjs            # zona sur
 *   node scripts/atlas-agua/puente-operadores.mjs --todas    # España entera
 *   node scripts/atlas-agua/puente-operadores.mjs --min 2
 */

import fs from 'node:fs';
import { normMuni } from './lib-muni.mjs';
import { indexarNombres } from './lib-nombres.mjs';
import { cargarEnv, CSV, fichas, leerCsv, indexarAtlas, resolver, toponimos } from './lib-cruce.mjs';

// La zona de Manolo. Sin esto el recuento mezcla operadores de medio país que no
// va a visitar nunca, y «13 operadores» o «20» depende solo de dónde se corta.
const ZONA_SUR = ['Almería', 'Cádiz', 'Córdoba', 'Granada', 'Huelva', 'Jaén', 'Málaga',
  'Sevilla', 'Badajoz', 'Cáceres', 'Murcia', 'Alicante'];

const tabla = (cabs, filas) => {
  const w = cabs.map((c, i) => Math.max(c.length, ...filas.map(f => String(f[i] ?? '').length)));
  const fila = f => '| ' + f.map((c, i) => String(c ?? '').padEnd(w[i])).join(' | ') + ' |';
  return [fila(cabs), '|' + w.map(n => '-'.repeat(n + 2)).join('|') + '|',
          ...filas.map(fila)].join('\n');
};

async function main() {
  cargarEnv();
  const args = process.argv.slice(2);
  const todas = args.includes('--todas');
  const iMin = args.indexOf('--min');
  const MIN = iMin >= 0 ? parseInt(args[iMin + 1], 10) : 3;

  const rutaCsv = CSV();
  if (!fs.existsSync(rutaCsv)) {
    console.error(`No encuentro ${rutaCsv}.`);
    console.error('Genera el export: python3 ../atlas-del-agua-gpf/scripts/exportar_crm.py');
    process.exit(1);
  }
  const atlas = leerCsv(rutaCsv);
  const idx = indexarAtlas(atlas);
  const crm = await fichas();
  const { posibleFicha, candidatas } = indexarNombres(crm, toponimos(atlas));

  const zona = new Set(ZONA_SUR.map(normMuni));
  const enZona = s => todas || zona.has(normMuni(s.province));
  const consideradas = crm.filter(enZona);

  // operador → municipios distintos con cartera + fichas
  const ops = new Map();
  let resueltas = 0;
  for (const s of consideradas) {
    const r = resolver(idx, s.city, s.province);
    if (!r) continue;
    resueltas++;
    if (r.fila.gestion !== 'operador' || !r.fila.operador) continue;
    const k = r.fila.operador_id || r.fila.operador;
    if (!ops.has(k)) ops.set(k, { op: r.fila.operador, grupo: r.fila.grupo, munis: new Map(), fichas: [] });
    const o = ops.get(k);
    o.munis.set(r.fila.ine, r.fila.municipio);
    o.fichas.push(s);
  }

  const puente = [...ops.values()].filter(o => o.munis.size >= MIN)
    .sort((a, b) => b.munis.size - a.munis.size || b.fichas.length - a.fichas.length);
  const municipiosCubiertos = new Set();
  puente.forEach(o => o.munis.forEach((_, ine) => municipiosCubiertos.add(ine)));
  const municipiosConOperador = new Set();
  ops.forEach(o => o.munis.forEach((_, ine) => municipiosConOperador.add(ine)));

  console.log(`# Operadores puente — ${todas ? 'España' : 'zona sur (' + ZONA_SUR.length + ' provincias)'}`);
  console.log();
  console.log(`Fichas consideradas: **${consideradas.length}** · con municipio resuelto: ${resueltas} · ` +
              `en municipio con operador: ${ops.size ? [...ops.values()].reduce((n, o) => n + o.fichas.length, 0) : 0}`);
  console.log(`Operadores con cartera: ${ops.size} · con ${MIN}+ municipios: **${puente.length}**`);
  console.log(`Municipios que cubren esos ${puente.length}: **${municipiosCubiertos.size}** ` +
              `de los ${municipiosConOperador.size} municipios donde tengo ficha y hay operador · ` +
              `fichas detrás: **${puente.reduce((n, o) => n + o.fichas.length, 0)}**`);
  console.log();

  console.log(`## Operadores con ${MIN}+ municipios de tu cartera`);
  console.log();
  console.log(tabla(
    ['Operador', 'Grupo', 'Munis', 'Fichas', '¿Ficha en CRM?', 'Puente ya marcado'],
    puente.map(o => {
      const c = candidatas(o.op, 2);
      const exacta = c.find(x => x.exacta);
      return [
        o.op.slice(0, 34),
        (o.grupo || '—').slice(0, 30),
        o.munis.size,
        o.fichas.length,
        posibleFicha(o.op, 2).join(' · ').slice(0, 58) || 'no la encuentro',
        exacta ? (exacta.ficha.es_cliente_puente ? 'sí' : 'NO') : '—',
      ];
    })));
  console.log();
  console.log('> `=` el nombre coincide, `~` solo una palabra. **Sin verificar**: ábrela antes de dar nada por hecho.');
  console.log();

  // ── Lo que habría que hacer, sin hacerlo ───────────────────────────────────
  const conFicha = puente.map(o => ({ o, c: candidatas(o.op, 1).find(x => x.exacta) })).filter(x => x.c);
  const marcar = conFicha.filter(x => !x.c.ficha.es_cliente_puente);
  // Tres cajones, no dos. «No coincide el nombre exacto» no es «no tiene ficha»:
  // GIAHSA está en el CRM como «GIAHSA - Gestión Integral del Agua Costa de Huelva
  // S.A.» y EMASESA como «EMPRESA METROPOLITANA DE ABASTECIMIENTO…». Meterlos en la
  // lista de altas es exactamente cómo se fabrica un duplicado.
  const resto = puente.filter(o => !candidatas(o.op, 1).some(x => x.exacta));
  const revisar = resto.filter(o => candidatas(o.op, 3).length);
  const sinNada = resto.filter(o => !candidatas(o.op, 3).length);

  console.log('## Para marcar como cliente puente (NO lo hago yo)');
  console.log();
  if (!marcar.length) {
    console.log('Nada: los que tienen ficha ya están marcados.');
  } else {
    console.log(`${marcar.length} fichas. Antes de ejecutarlo, dos cosas:`);
    console.log('- `es_cliente_puente` lo lee `scripts/batch-qualify/scoring.mjs`, así que **estas fichas');
    console.log('  cambiarán de puntuación y puede que de cuadrante** en el siguiente recálculo.');
    console.log('- Hoy mismo hay ' + crm.filter(s => s.es_cliente_puente).length +
                ' fichas marcadas en todo el CRM; apunta ese número antes de tocar nada.');
    console.log();
    console.log('```sql');
    console.log('-- revisa la lista ficha a ficha antes de ejecutar');
    marcar.forEach(x => console.log(
      `update studios set es_cliente_puente = true where id = '${x.c.ficha.id}'; ` +
      `-- ${x.c.ficha.name} (${x.o.munis.size} munis)`));
    console.log('```');
  }
  console.log();

  const filaOp = o => [
    o.op.slice(0, 34),
    (o.grupo || '—').slice(0, 26),
    o.munis.size,
    [...o.munis.values()].slice(0, 4).join(', ').slice(0, 44),
    posibleFicha(o.op, 2).join(' · ').slice(0, 50) || '—',
  ];

  console.log('## Probablemente ya tienen ficha, con otro nombre (revisar, NO dar de alta)');
  console.log();
  if (!revisar.length) {
    console.log('Ninguno.');
  } else {
    console.log(tabla(['Operador (Atlas)', 'Grupo', 'Munis', 'Municipios', 'Parecidas en el CRM'],
      revisar.map(filaOp)));
    console.log();
    console.log('> Si la de al lado es la misma empresa, lo que toca es **renombrar o marcar esa ficha**,');
    console.log('> no crear otra. Si no lo es, pasa al cajón de altas.');
  }
  console.log();

  console.log('## Sin nada parecido en el CRM: candidatos a alta (no doy de alta nada)');
  console.log();
  if (!sinNada.length) {
    console.log('Ninguno.');
  } else {
    console.log(tabla(['Operador (Atlas)', 'Grupo', 'Munis', 'Municipios', 'Parecidas en el CRM'],
      sinNada.map(filaOp)));
  }
  console.log();
  console.log('## Lo que esto NO dice');
  console.log();
  console.log(`- **No es la cartera que gestiona cada operador**, es dónde coincide con tus fichas.`);
  console.log(`- ${consideradas.length - resueltas} fichas de la zona no resuelven municipio ` +
              `(sin \`city\`, o un nombre que el Atlas no reconoce): quedan fuera del recuento.`);
  console.log('- La asignación municipio→operador del Atlas viene en buena parte del listado de la');
  console.log('  Junta de 2011: hay concesiones que han cambiado de manos desde entonces.');
  console.log('- Un operador sin ficha es un candidato, no un alta: el nombre del Atlas y el del CRM');
  console.log('  casi nunca coinciden letra a letra (la trampa Ayesa/Geser). Busca a mano antes de crear.');
}

main().catch(e => { console.error('error:', e.message); process.exit(1); });
