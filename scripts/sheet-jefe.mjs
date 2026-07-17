#!/usr/bin/env node
// Leer, escribir y vaciar celdas de la hoja del jefe (CALENDARIO 2026 MANOLO)
// desde la línea de comandos, sin pasar por el navegador ni por el CRM.
//
// El mapeo fecha→celda NO se reimplementa aquí: se extrae de
// redesign/screens/planificador.js, que es la única fuente de verdad. Si aquello
// cambia, esto cambia con ello. (Los bloques de la hoja no están equiespaciados:
// van 2, 37, 72, 106 — suponer 35 fijo desplazaba todo el último trimestre.)
//
// Credenciales — ninguna vive en el repo (se despliega a un gh-pages PÚBLICO):
//   google_credentials.json  JSON del cliente OAuth de escritorio, descargado de
//                            Google Cloud Console (proyecto CRM Ferroplast).
//   .sheets_token.json       refresh token, lo genera `auth`. No lo toques a mano.
// Ambos están en .gitignore.
//
// Uso:
//   node scripts/sheet-jefe.mjs auth                     consentimiento (una vez)
//   node scripts/sheet-jefe.mjs read                     vuelca las anotaciones de 2026
//   node scripts/sheet-jefe.mjs read 2026-06             solo un mes
//   node scripts/sheet-jefe.mjs set 2026-06-22 "Murcia: ESAMUR, SCRATS"
//   node scripts/sheet-jefe.mjs clear 2026-06-22 2026-06-23
//
// `set` y `clear` piden confirmación salvo que se pase --si.

import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CREDS = path.join(RAIZ, 'google_credentials.json');
const TOKEN = path.join(RAIZ, '.sheets_token.json');
const PLANIFICADOR = path.join(RAIZ, 'redesign', 'screens', 'planificador.js');

const SHEET_ID = '1vgTEqYYfgpP-dvla_hV6HIaz32kP3OPgxqn8YR_QqpQ';
const SHEET_NAME = 'CALENDARIO 2026 MANOLO';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

// ── Mapeo de celdas: extraído del planificador, no duplicado ────────────────
async function cargarMapeo() {
  const src = await fs.readFile(PLANIFICADOR, 'utf8');
  const extraer = (nombre) => {
    const m = src.match(new RegExp('\\n  (?:const|function) ' + nombre + '\\b'));
    if (!m) throw new Error(`No se encontró ${nombre} en planificador.js`);
    const desde = m.index + 1;
    const resto = src.slice(desde + 1);
    const fin = resto.search(/\n  (?:const|let|function|async function|\/\*)/);
    return src.slice(desde, fin < 0 ? undefined : desde + 1 + fin);
  };
  const codigo = [
    extraer('_COL_LETTERS'), extraer('_BLOQUE_BASE'),
    extraer('_getCellRef'), extraer('_cellRefToDate'),
    'return { _getCellRef, _cellRefToDate, _COL_LETTERS };',
  ].join('\n');
  return new Function(codigo)();
}

// ── Credenciales ────────────────────────────────────────────────────────────
async function leerCredenciales() {
  let raw;
  try {
    raw = JSON.parse(await fs.readFile(CREDS, 'utf8'));
  } catch {
    console.error(
      `\nFalta ${path.relative(RAIZ, CREDS)}.\n\n` +
      `Descárgalo de Google Cloud Console → proyecto "CRM Ferroplast" →\n` +
      `APIs y servicios → Credenciales → cliente "CRM Sheet Jefe (scripts)" →\n` +
      `botón de descarga JSON. Guárdalo en la raíz del repo con ese nombre.\n` +
      `Está en .gitignore: no se sube.\n`);
    process.exit(1);
  }
  const c = raw.installed || raw.web;
  if (!c?.client_id || !c?.client_secret) {
    console.error('El JSON de credenciales no tiene client_id/client_secret.');
    process.exit(1);
  }
  return c;
}

async function guardarToken(t) {
  await fs.writeFile(TOKEN, JSON.stringify(t, null, 2));
  await fs.chmod(TOKEN, 0o600);
}

// ── OAuth: flujo de app instalada con redirect a loopback ───────────────────
// El código de autorización lo captura un servidor local; no hay que copiar ni
// pegar nada, y el token no pasa por la conversación.
async function autenticar() {
  const cred = await leerCredenciales();
  const server = http.createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const redirect = `http://127.0.0.1:${port}`;

  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: cred.client_id, redirect_uri: redirect, response_type: 'code',
    scope: SCOPE, access_type: 'offline', prompt: 'consent',
  });

  console.log('\nAbriendo el navegador para que autorices el acceso.');
  console.log('Si no se abre solo, pega esta URL:\n\n' + url + '\n');
  exec(`open "${url}"`);

  const code = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Tiempo agotado esperando el consentimiento')), 180000);
    server.on('request', (req, res) => {
      const q = new URL(req.url, redirect).searchParams;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      const ok = q.get('code');
      res.end(`<html><body style="font-family:system-ui;padding:40px">
        <h2>${ok ? '✅ Listo' : '❌ Error'}</h2>
        <p>${ok ? 'Ya puedes cerrar esta pestaña y volver a la terminal.' : (q.get('error') || 'sin código')}</p>
        </body></html>`);
      clearTimeout(t);
      ok ? resolve(ok) : reject(new Error(q.get('error') || 'sin código'));
    });
  });
  server.close();

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: cred.client_id, client_secret: cred.client_secret,
      redirect_uri: redirect, grant_type: 'authorization_code',
    }),
  });
  const tok = await resp.json();
  if (!resp.ok || !tok.refresh_token) {
    throw new Error('No se obtuvo refresh_token: ' + JSON.stringify(tok));
  }
  await guardarToken({ refresh_token: tok.refresh_token });
  console.log(`\n✅ Autorizado. Token guardado en ${path.relative(RAIZ, TOKEN)} (no se sube al repo).`);
  console.log('Ya puedes usar read / set / clear.\n');
}

async function accessToken() {
  const cred = await leerCredenciales();
  let guardado;
  try {
    guardado = JSON.parse(await fs.readFile(TOKEN, 'utf8'));
  } catch {
    console.error('\nNo estás autorizado todavía. Ejecuta:\n\n  node scripts/sheet-jefe.mjs auth\n');
    process.exit(1);
  }
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cred.client_id, client_secret: cred.client_secret,
      refresh_token: guardado.refresh_token, grant_type: 'refresh_token',
    }),
  });
  const t = await resp.json();
  if (!resp.ok || !t.access_token) {
    console.error('\nEl refresh token ya no vale (' + (t.error || resp.status) + ').');
    console.error('Vuelve a ejecutar: node scripts/sheet-jefe.mjs auth\n');
    process.exit(1);
  }
  return t.access_token;
}

// ── API de Sheets ───────────────────────────────────────────────────────────
async function api(token, url, opts = {}) {
  const r = await fetch(url, {
    ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  if (!r.ok) {
    let d = r.statusText;
    try { d = (await r.json()).error?.message || d; } catch {}
    throw new Error(`${r.status} · ${d}`);
  }
  return r.json();
}

async function gid(token) {
  const meta = await api(token,
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets(properties(sheetId,title))`);
  const h = meta.sheets.find((s) => s.properties.title === SHEET_NAME);
  if (!h) throw new Error(`No existe la pestaña "${SHEET_NAME}"`);
  return h.properties.sheetId;
}

async function leerAnotaciones(token, cols, cellRefToDate) {
  const ranges = cols.map((c) => `ranges=${encodeURIComponent(`'${SHEET_NAME}'!${c}1:${c}140`)}`).join('&');
  const data = await api(token,
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchGet?majorDimension=COLUMNS&${ranges}`);
  const out = {};
  (data.valueRanges || []).forEach((vr, i) => {
    (vr.values?.[0] || []).forEach((texto, idx) => {
      if (!texto?.trim()) return;
      const iso = cellRefToDate(cols[i] + (idx + 1));
      if (iso) out[iso] = texto;
    });
  });
  return out;
}

async function escribir(token, items) {
  const sheetId = await gid(token);
  const requests = items.map(({ ref, text }) => ({
    updateCells: {
      rows: [{ values: [{ userEnteredValue: { stringValue: text } }] }],
      fields: 'userEnteredValue,textFormatRuns',
      range: {
        sheetId,
        startRowIndex: parseInt(ref.slice(1), 10) - 1, endRowIndex: parseInt(ref.slice(1), 10),
        startColumnIndex: ref.charCodeAt(0) - 65, endColumnIndex: ref.charCodeAt(0) - 64,
      },
    },
  }));
  await api(token, `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });
}

async function confirmar(msg) {
  if (process.argv.includes('--si')) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const r = await rl.question(msg + ' [s/N] ');
  rl.close();
  return /^s(i|í)?$/i.test(r.trim());
}

// ── Comandos ────────────────────────────────────────────────────────────────
async function main() {
  const [cmd, ...args] = process.argv.slice(2).filter((a) => a !== '--si');

  if (cmd === 'auth') return autenticar();

  const { _getCellRef, _cellRefToDate, _COL_LETTERS } = await cargarMapeo();

  if (cmd === 'read') {
    const token = await accessToken();
    const an = await leerAnotaciones(token, _COL_LETTERS, _cellRefToDate);
    const filtro = args[0];
    const dias = Object.keys(an).filter((d) => !filtro || d.startsWith(filtro)).sort();
    if (!dias.length) return console.log(filtro ? `Sin anotaciones en ${filtro}.` : 'Sin anotaciones en 2026.');
    console.log(`\n${SHEET_NAME} — ${dias.length} día(s) con contenido\n`);
    for (const d of dias) console.log(`  ${d}  ${_getCellRef(d).padEnd(5)}  ${an[d]}`);
    console.log('');
    return;
  }

  if (cmd === 'set') {
    const [fecha, texto] = args;
    const ref = fecha && _getCellRef(fecha);
    if (!ref || texto === undefined) {
      console.error('Uso: node scripts/sheet-jefe.mjs set 2026-06-22 "Murcia: ESAMUR"');
      if (fecha && !ref) console.error(`  "${fecha}" no es un día válido de 2026.`);
      process.exit(1);
    }
    const token = await accessToken();
    const actual = (await leerAnotaciones(token, _COL_LETTERS, _cellRefToDate))[fecha];
    console.log(`\n${fecha} → celda ${ref}`);
    console.log(`  ahora:     ${actual ?? '(vacía)'}`);
    console.log(`  pasará a:  ${texto}\n`);
    if (!(await confirmar('Escribir en la hoja de tu jefe?'))) return console.log('Cancelado.');
    await escribir(token, [{ ref, text: texto }]);
    console.log(`✅ ${ref} escrita.`);
    return;
  }

  if (cmd === 'clear') {
    const refs = args.map((f) => ({ fecha: f, ref: _getCellRef(f) }));
    const malas = refs.filter((r) => !r.ref);
    if (!refs.length || malas.length) {
      console.error('Uso: node scripts/sheet-jefe.mjs clear 2026-06-22 [2026-06-23 …]');
      malas.forEach((m) => console.error(`  "${m.fecha}" no es un día válido de 2026.`));
      process.exit(1);
    }
    const token = await accessToken();
    const an = await leerAnotaciones(token, _COL_LETTERS, _cellRefToDate);
    console.log('\nSe va a dejar en blanco:\n');
    for (const { fecha, ref } of refs) console.log(`  ${fecha}  ${ref.padEnd(5)}  ${an[fecha] ?? '(ya vacía)'}`);
    console.log('\nQueda en el historial de versiones de la hoja a tu nombre.');
    if (!(await confirmar('Continuar?'))) return console.log('Cancelado.');
    await escribir(token, refs.map(({ ref }) => ({ ref, text: '' })));
    console.log(`✅ ${refs.length} celda(s) vaciada(s).`);
    return;
  }

  console.log(`
Hoja del jefe · ${SHEET_NAME}

  node scripts/sheet-jefe.mjs auth                    autorizar (una vez)
  node scripts/sheet-jefe.mjs read [2026-06]          ver qué hay
  node scripts/sheet-jefe.mjs set 2026-06-22 "texto"  escribir una celda
  node scripts/sheet-jefe.mjs clear 2026-06-22 …      vaciar celdas

Añade --si para saltarte la confirmación.
`);
}

main().catch((e) => { console.error('\n❌ ' + e.message + '\n'); process.exit(1); });
