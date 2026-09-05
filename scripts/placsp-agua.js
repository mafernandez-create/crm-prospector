#!/usr/bin/env node
/* eslint-disable */
// ─────────────────────────────────────────────────────────────────────────
// QUIÉN MUEVE EL AGUA: quién la REDACTA, quién la CONSTRUYE y quién PUJÓ
//
// Idea de Manolo, 5-sep-2026, y es mejor que buscar empresas por la web: en vez
// de adivinar quién puede prescribir, se mira QUIÉN HA GANADO los contratos de
// obra hidráulica. Tres capas, por orden de valor para prescripción:
//
//   0. QUIEN LICITA (el organo de contratacion). Idea de Manolo, y es la capa
//      mas estable de las tres: el redactor cambia con cada concurso y el
//      constructor llega cuando el pliego ya esta escrito, pero el ayuntamiento
//      o la mancomunidad que saco la renovacion de su red este año la volvera a
//      sacar. Ademas es QUIEN APRUEBA el pliego: aunque lo redacte una
//      ingenieria externa, es el organismo quien decide si admite una clausula
//      de "o equivalente". El XML trae su nombre, correo, telefono, direccion y
//      web. ⚠️ La primera version lo buscaba como `cac:LocatedContractingParty`
//      y la etiqueta real lleva el prefijo `cac-place-ext:`: se perdio en las
//      7.023 adjudicaciones del primer año recorrido.
//   1. REDACTORES (servicios de ingeniería, TypeCode 2). El que redacta es el
//      que escribe la marca en el pliego. Es el prescriptor con nombre.
//   2. CONSTRUCTORAS (obras, TypeCode 3). El pliego ya está escrito, así que no
//      es prescripción: es suministro, y corresponde al comercial de zona.
//   3. LOS QUE PERDIERON. Segunda idea de Manolo, y es fina: quien pujó por una
//      obra de agua HACE obra de agua, gane o pierda. Es cartera que no aparece
//      en ningún sitio. ⚠️ Sus nombres NO están en el XML — solo el número de
//      ofertas recibidas (`ReceivedTenderQuantity`, presente en el 100% de las
//      adjudicaciones) y el rango de importes. Los nombres están en las ACTAS,
//      que sí vienen enlazadas y son PDF descargables. Ver la fase --actas.
//
// Por qué no lo cubría el pipeline diario: `placsp-fetch.js` descarga el feed
// incremental, que solo trae lo publicado ese día, y el histórico del CRM
// arranca el 26-may-2026. Este script va a los ZIP MENSUALES de la Plataforma,
// que sí permiten recorrer un año hacia atrás.
//
// Cada mes son ~150-190 MB comprimidos y ~1,5 GB al descomprimir, así que NO se
// desempaqueta a disco: se streamea cada .atom con `unzip -p` y se filtra al
// vuelo. El ZIP se borra en cuanto se procesa.
//
// ⚠️ MEMORIA. La primera versión guardaba el ZIP en un Buffer y acumulaba todos
// los resultados en RAM: murió por OOM en el mes 11 de 12 y se perdieron diez
// meses ya procesados. Ahora la descarga va por stream a disco y cada mes
// vuelca sus hallazgos a un .jsonl antes de seguir. Si revienta, lo hecho
// queda, y relanzar reanuda desde donde estaba.
//
// Nota de red: contrataciondelestado.es falla con `curl` desde este Mac
// (proxy que rompe la cadena de certificados) pero funciona con `fetch` de
// Node, que usa el almacén de confianza del sistema. Por eso va en Node y NO
// lleva ninguna opción de saltarse la validación del certificado.
//
//   node scripts/placsp-redactores.js --meses 12 [--provincia Granada]
// ─────────────────────────────────────────────────────────────────────────
const fs = require('fs'), os = require('os'), path = require('path');
const { Readable } = require('stream'), { pipeline } = require('stream/promises');
const { execFileSync, spawnSync } = require('child_process');

const BASE = 'https://contrataciondelestado.es/sindicacion/sindicacion_643/' +
             'licitacionesPerfilesContratanteCompleto3_';
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const MESES = parseInt(arg('--meses', '12'), 10);
const PROV  = (arg('--provincia', '') || '').toLowerCase();
const SALIDA = arg('--salida', path.join(os.homedir(), 'Downloads', 'PLACSP-agua.json'));

// TypeCode 2 = Servicios. La redacción de proyecto es un servicio, no una obra:
// filtrar por aquí evita arrastrar las obras, que son del comercial, no de
// prescripción.
const SERVICIOS = '2', OBRAS = '3';
// CPV de servicios de ingeniería y diseño técnico.
const CPV_ING = /^(713|7132|7124|7125)/;
// El objeto tiene que ser de agua. Se listan aquí para poder discutirlas.
const AGUA = /agua|hidr[aá]ul|abastec|saneam|depurad?or|EDAR|ETAP|colector|conducci[oó]n|regad|riego|alcantar|pluvial|dep[oó]sito|potabiliz|bombeo|presa|azud|acequia|emisario/i;
const REDACTA = /redacci[oó]n|proyecto constructivo|anteproyecto|estudio informativo|asistencia t[eé]cnica|direcci[oó]n de obra|consultor[ií]a y asistencia/i;

const uno = (e, re) => { const m = e.match(re); return m ? m[1].replace(/\s+/g, ' ').trim() : ''; };

function analiza(entrada) {
  const tipo = uno(entrada, /<cbc:TypeCode[^>]*>([^<]+)/);
  if (tipo !== SERVICIOS && tipo !== OBRAS) return null;
  const titulo = uno(entrada, /<title>([\s\S]*?)<\/title>/);
  const cpvs = (entrada.match(/ItemClassificationCode[^>]*>(\d+)/g) || [])
                 .map(s => s.replace(/\D/g, ''));
  if (!AGUA.test(titulo)) return null;
  const esIng = cpvs.some(c => CPV_ING.test(c));
  // Servicios: solo si es ingeniería o el título dice que se redacta algo.
  // Obras: cualquier obra de agua vale — ahí el filtro es el objeto, no el CPV.
  if (tipo === SERVICIOS && !(esIng || REDACTA.test(titulo))) return null;
  const ganador = uno(entrada, /<cac:WinningParty>[\s\S]*?<cbc:Name>([\s\S]*?)<\/cbc:Name>/);
  // SIN adjudicatario ya NO se descarta: puede ser una licitación en plazo, y
  // aunque no sirva para saber a quién visitar —el ganador no existe todavía—
  // sí dice QUIÉN LICITA, que es lo que de verdad se repite año tras año.
  const prov = uno(entrada, /CountrySubentity[^>]*>([^<]+)/);
  if (PROV && !prov.toLowerCase().includes(PROV)) return null;
  // Las actas son donde están los nombres de quienes pujaron y no ganaron.
  const actas = [...entrada.matchAll(
    /<cbc:DocumentTypeCode[^>]*>(ACTA[^<]*)<\/cbc:DocumentTypeCode>\s*<cac:Attachment>\s*<cac:ExternalReference>\s*<cbc:URI>([^<]+)<\/cbc:URI>/g)]
    .map(m => ({ tipo: m[1], url: m[2].replace(/&amp;/g, '&') }));
  // El organo de contratación, con su contacto. El bloque correcto es
  // `cac-place-ext:LocatedContractingParty`, NO `cac:LocatedContractingParty`.
  const bloque = (entrada.match(
    /<cac-place-ext:LocatedContractingParty>[\s\S]*?<\/cac-place-ext:LocatedContractingParty>/) || [''])[0];
  const org = {
    nombre: uno(bloque, /<cac:PartyName>\s*<cbc:Name>([\s\S]*?)<\/cbc:Name>/) ||
             uno(bloque, /<cbc:Name>([\s\S]*?)<\/cbc:Name>/),
    email:  uno(bloque, /<cbc:ElectronicMail>([^<]+)/),
    tel:    uno(bloque, /<cbc:Telephone>([^<]+)/),
    web:    uno(bloque, /<cbc:WebsiteURI>([^<]+)/),
    ciudad: uno(bloque, /<cbc:CityName>([^<]+)/),
    dir:    uno(bloque, /<cbc:Line>([^<]+)/),
    tipo:   uno(bloque, /<cbc:ContractingPartyTypeCode[^>]*>([^<]+)/),
    matriz: uno(bloque, /<cac-place-ext:ParentLocatedParty>[\s\S]*?<cbc:Name>([\s\S]*?)<\/cbc:Name>/),
  };
  if (!ganador && !org.nombre) return null;         // sin ganador NI órgano no aporta nada
  return {
    papel: !ganador ? 'licita' : (tipo === SERVICIOS ? 'redacta' : 'construye'),
    organo: org,
    fecha: uno(entrada, /<updated>([^<]+)/).slice(0, 10),
    titulo, adjudicatario: ganador || null, provincia: prov,
    ofertas: parseInt(uno(entrada, /<cbc:ReceivedTenderQuantity[^>]*>(\d+)/), 10) || null,
    oferta_min: parseFloat(uno(entrada, /<cbc:LowerTenderAmount[^>]*>([^<]+)/)) || null,
    oferta_max: parseFloat(uno(entrada, /<cbc:HigherTenderAmount[^>]*>([^<]+)/)) || null,
    actas,
    importe: parseFloat(uno(entrada, /<cbc:TotalAmount[^>]*>([^<]+)/)) || null,
    cpv: [...new Set(cpvs)].slice(0, 4),
    url: uno(entrada, /<link[^>]*href="([^"]*licitacionId[^"]*)"/) || uno(entrada, /<id>([^<]+)/),
  };
}

function procesaZip(zip, acc) {
  const lista = execFileSync('unzip', ['-Z1', zip], { maxBuffer: 1 << 24 })
                  .toString().trim().split('\n').filter(f => f.endsWith('.atom'));
  let vistas = 0;
  for (const f of lista) {
    const r = spawnSync('unzip', ['-p', zip, f], { maxBuffer: 1 << 30 });
    if (r.status !== 0) continue;
    const xml = r.stdout.toString('utf8');
    for (const m of xml.matchAll(/<entry>[\s\S]*?<\/entry>/g)) {
      vistas++;
      const h = analiza(m[0]);
      if (h) acc.push(h);
    }
  }
  return vistas;
}

(async () => {
  const hoy = new Date(); let leidas = 0;
  // Fichero de trabajo: una línea JSON por adjudicación, escrito mes a mes.
  const PARCIAL = SALIDA.replace(/\.json$/, '.parcial.jsonl');
  const hechos = new Set(fs.existsSync(PARCIAL)
    ? fs.readFileSync(PARCIAL, 'utf8').split('\n').filter(Boolean)
        .map(l => { try { return JSON.parse(l)._mes; } catch { return null; } }).filter(Boolean)
    : []);
  if (hechos.size) console.log(`  reanudando: ${hechos.size} meses ya en ${path.basename(PARCIAL)}`);
  for (let i = 1; i <= MESES; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const ym = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0');
    const zip = path.join(os.tmpdir(), `placsp_${ym}.zip`);
    process.stdout.write(`  ${ym} … `);
    try {
      if (fs.existsSync(PARCIAL) && hechos.has(ym)) { console.log('ya procesado'); continue; }
      if (!fs.existsSync(zip)) {
        // El servidor de PLACSP es lento e intermitente — lo dice el propio
        // placsp-fetch.js de este repo. En la primera pasada de 12 meses,
        // SIETE fallaron con "fetch failed" y solo entraron 5. No es un error
        // del script: hay que reintentar, esperando mas en cada intento.
        let ok = false;
        for (let intento = 1; intento <= 4 && !ok; intento++) {
          try {
            const r = await fetch(BASE + ym + '.zip');
            if (!r.ok) { console.log(`sin fichero (HTTP ${r.status})`); break; }
            await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(zip));
            ok = true;
          } catch (e) {
            if (fs.existsSync(zip)) fs.unlinkSync(zip);   // descarga a medias
            if (intento === 4) throw e;
            process.stdout.write(`reintento ${intento} `);
            await new Promise(r2 => setTimeout(r2, intento * 20000));
          }
        }
        if (!ok) continue;
      }
      const mes = [];
      leidas += procesaZip(zip, mes);
      // volcar YA, antes de pasar al mes siguiente
      fs.appendFileSync(PARCIAL, mes.map(h => JSON.stringify({ ...h, _mes: ym })).join('\n') + '\n');
      console.log(`${(fs.statSync(zip).size / 1048576).toFixed(0)} MB · +${mes.length} adjudicaciones`);
      fs.unlinkSync(zip);
    } catch (e) { console.log('error:', e.message.slice(0, 60)); }
  }
  // Releer del disco: la RAM nunca guarda más de un mes a la vez.
  const acc = fs.readFileSync(PARCIAL, 'utf8').split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const porEmpresa = {};
  for (const h of acc) {
    const k = h.adjudicatario;
    if (!k) continue;                               // las 'licita' no tienen empresa ganadora
    (porEmpresa[k] = porEmpresa[k] || { adjudicatario: k, papeles: new Set(), contratos: 0, importe: 0, provincias: new Set(), obras: [] });
    porEmpresa[k].papeles.add(h.papel);
    porEmpresa[k].contratos++;
    porEmpresa[k].importe += h.importe || 0;
    if (h.provincia) porEmpresa[k].provincias.add(h.provincia);
    porEmpresa[k].obras.push({ fecha: h.fecha, titulo: h.titulo.slice(0, 120), importe: h.importe, organo: h.organo, url: h.url });
  }
  const rank = Object.values(porEmpresa)
    .map(e => ({ ...e, papeles: [...e.papeles].sort(), provincias: [...e.provincias].sort() }))
    .sort((a, b) => b.contratos - a.contratos || b.importe - a.importe);
  fs.writeFileSync(SALIDA, JSON.stringify({
    _generado: new Date().toISOString().slice(0, 10),
    _meses_analizados: MESES, _provincia: PROV || 'todas',
    _entradas_leidas: leidas, _adjudicaciones: acc.length,
    _redactan: acc.filter(h => h.papel === 'redacta').length,
    _construyen: acc.filter(h => h.papel === 'construye').length,
    _en_plazo: acc.filter(h => h.papel === 'licita').length,
    _con_organo: acc.filter(h => h.organo && h.organo.nombre).length,
    _ofertas_perdedoras: acc.reduce((s, h) => s + Math.max(0, (h.ofertas || 1) - 1), 0),
    _actas_enlazadas: acc.reduce((s, h) => s + h.actas.length, 0),
    _que_es: 'Empresas que han GANADO contratos de agua. papel=redacta son los PRESCRIPTORES ' +
             '(escriben el pliego); papel=construye son suministro para el comercial. El campo ' +
             '`ofertas` dice cuántas empresas pujaron: las que perdieron también hacen obra de ' +
             'agua y sus nombres están en las actas enlazadas, no en este fichero.',
    empresas: rank, adjudicaciones: acc,
  }, null, 1));
  console.log(`\n  ${leidas.toLocaleString('es')} entradas leídas · ${acc.length} adjudicaciones de redacción · ${rank.length} empresas`);
  console.log('  →', SALIDA);
  rank.slice(0, 15).forEach(e => console.log(
    `   ${String(e.contratos).padStart(2)} · ${e.adjudicatario.slice(0, 52).padEnd(52)} ${e.provincias.join(', ').slice(0, 34)}`));
})();
