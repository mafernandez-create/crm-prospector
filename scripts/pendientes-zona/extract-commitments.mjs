#!/usr/bin/env node
/* Extrae compromisos pendientes de informes .docx (base64) — helper del
 * agente/skill "pendientes-zona".
 *
 * Uso:
 *   node scripts/pendientes-zona/extract-commitments.mjs <archivo> [--text]
 *
 * <archivo> puede ser:
 *   - el fichero que el MCP de Supabase vuelca a disco cuando el resultado es
 *     grande (wrapper JSON con boundaries <untrusted-data…>), o
 *   - un JSON plano con un array [{id,name,b64}] (o [{payload:[…]}]).
 *
 * Los PATRONES de detección se leen en caliente de redesign/acciones.js
 * (var _TIPOS), de modo que NO se duplican: si cambian en la app, cambian aquí.
 *
 * Salida por defecto: JSON { generatedFrom, studios:[{id,name,chars,commitments:[{tipo,icon,texto}]}] }.
 * Con --text: resumen legible por consola.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..');

const file = process.argv[2];
const asText = process.argv.includes('--text');
if (!file) {
  console.error('Falta el archivo. Uso: node extract-commitments.mjs <archivo> [--text]');
  process.exit(1);
}

/* ---- 1. Cargar patrones _TIPOS desde redesign/acciones.js (fuente única) ---- */
function loadTipos() {
  const src = fs.readFileSync(path.join(REPO, 'redesign', 'acciones.js'), 'utf8');
  const m = src.match(/var _TIPOS\s*=\s*(\{[\s\S]*?\n\s*\};)/);
  if (!m) throw new Error('No se encontró _TIPOS en redesign/acciones.js');
  // El literal usa claves con detectRe (regex) e icon (string): eval seguro del literal.
  // eslint-disable-next-line no-eval
  const obj = eval('(' + m[1].replace(/;\s*$/, '') + ')');
  return obj;
}

/* ---- 2. Cargar el payload [{id,name,b64}] desde el archivo ---- */
function loadPayload(text) {
  let t = text.trim();
  try {
    const o = JSON.parse(t);
    if (o && typeof o.result === 'string') t = o.result;         // wrapper MCP
    else if (Array.isArray(o)) return normalize(o);
    else if (o && Array.isArray(o.payload)) return o.payload;
  } catch (_) { /* seguirá por la vía de boundaries */ }

  const closeIdx = t.indexOf('</untrusted-data');
  if (closeIdx >= 0) {
    const head = t.slice(0, closeIdx);
    const opens = [...head.matchAll(/<untrusted-data-[^>]+>/g)];
    const lo = opens[opens.length - 1];
    if (lo) t = head.slice(lo.index + lo[0].length).trim();
  }
  return normalize(JSON.parse(t));
}
function normalize(rows) {
  if (Array.isArray(rows) && rows.length && rows[0] && Array.isArray(rows[0].payload)) return rows[0].payload;
  return rows;
}

/* ---- 3. Texto plano de un .docx en base64 (unzip word/document.xml) ---- */
function docxText(b64) {
  if (!b64 || typeof b64 !== 'string') return '';
  let b = b64;
  const c = b.indexOf(',');
  if (b.startsWith('data:') && c > 0) b = b.slice(c + 1);
  b = b.replace(/\s/g, '');
  if (b.length < 1000) return '';
  const tmp = path.join(os.tmpdir(), 'pz-' + process.pid + '-' + Math.random().toString(36).slice(2) + '.docx');
  fs.writeFileSync(tmp, Buffer.from(b, 'base64'));
  let xml = '';
  try { xml = execSync(`unzip -p "${tmp}" word/document.xml`, { maxBuffer: 64 * 1024 * 1024 }).toString('utf8'); }
  catch (_) { xml = ''; }
  finally { try { fs.unlinkSync(tmp); } catch (_) {} }
  return xml.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}

/* ---- 4. Detectar compromisos (misma lógica que acciones.js procesarTodos) ---- */
function detectar(text, TIPOS) {
  const out = [];
  for (const tipo in TIPOS) {
    const def = TIPOS[tipo];
    const re = new RegExp(def.detectRe.source, def.detectRe.flags);
    const vistos = new Set();
    let m;
    while ((m = re.exec(text)) !== null) {
      const mt = m[0].trim();
      if (mt.length < 20 || mt.length > 400) continue;
      const key = mt.slice(0, 60).toLowerCase();
      if (vistos.has(key)) continue;
      vistos.add(key);
      const start = Math.max(0, m.index - 30);
      const end = Math.min(text.length, m.index + mt.length);
      let ctx = text.slice(start, end).replace(/\s+/g, ' ').trim();
      if (ctx.length > 280) ctx = ctx.slice(0, 280) + '…';
      out.push({ tipo, icon: def.icon, texto: ctx });
    }
  }
  return out;
}

/* ---- main ---- */
const TIPOS = loadTipos();
const payload = loadPayload(fs.readFileSync(file, 'utf8'));
const result = { generatedFrom: path.basename(file), studios: [] };
for (const it of payload) {
  const text = docxText(it.b64);
  result.studios.push({ id: it.id, name: it.name, chars: text.length, commitments: detectar(text, TIPOS) });
}

if (asText) {
  for (const s of result.studios) {
    console.log(`\n===== ${s.name} (id ${s.id}) — ${s.chars} chars =====`);
    if (!s.commitments.length) console.log('  (sin compromisos detectados)');
    else s.commitments.forEach((c) => console.log(`  • ${c.icon} [${c.tipo}] ${c.texto}`));
  }
} else {
  console.log(JSON.stringify(result, null, 2));
}
