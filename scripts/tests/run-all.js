#!/usr/bin/env node
// Orquestador de la batería de tests del CRM Prospector Ferroplast.
// Lanza cada archivo via child_process.spawnSync('node', [path]), captura el
// JSON summary impreso por el test (última línea JSON válida del stdout),
// agrega resultados y muestra un resumen al final.
//
// Flags CLI:
//   --unit          solo tests unitarios
//   --integration   solo integración
//   --e2e           solo end-to-end
//   --smoke         solo smoke
//   --all           todo (por defecto)
//   --verbose       imprime stdout/stderr completo de cada test
//
// Exit code: 0 si todos pasan; 1 si algún test ha fallado o ha roto.

const fs   = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const HERE = __dirname;

const argv      = process.argv.slice(2);
const verbose   = argv.includes('--verbose');
const explicit  = ['--unit','--integration','--e2e','--smoke'].some(f => argv.includes(f));
const wantAll   = argv.includes('--all') || !explicit;
const wantUnit  = wantAll || argv.includes('--unit');
const wantInt   = wantAll || argv.includes('--integration');
const wantE2E   = wantAll || argv.includes('--e2e');
const wantSmoke = wantAll || argv.includes('--smoke');

const SUITES = [];
if (wantUnit)  SUITES.push({ kind: 'UNIT',         dir: 'unit' });
if (wantInt)   SUITES.push({ kind: 'INTEGRATION',  dir: 'integration' });
if (wantE2E)   SUITES.push({ kind: 'E2E',          dir: 'e2e' });
if (wantSmoke) SUITES.push({ kind: 'SMOKE',        dir: 'smoke' });

function listTests(dir) {
  const abs = path.join(HERE, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs)
    .filter(f => f.startsWith('test-') && f.endsWith('.js'))
    .sort()
    .map(f => ({ name: f.replace(/^test-/, '').replace(/\.js$/, ''), full: path.join(abs, f) }));
}

function parseSummary(stdout) {
  // Buscar la última línea JSON {"total":..,"passed":..,"failed":..,..}
  const lines = stdout.split(/\r?\n/).filter(l => l.trim().startsWith('{'));
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const j = JSON.parse(lines[i]);
      if (typeof j.total === 'number' && typeof j.passed === 'number') return j;
    } catch (e) {}
  }
  return null;
}

function statusBadge(passed, total, exitCode) {
  if (total === 0) return '⏭️ skip';
  if (exitCode !== 0 && passed < total) return `⚠️  ${passed}/${total} (${total - passed} fail)`;
  if (passed === total) return `✅ ${passed}/${total}`;
  return `❌ ${passed}/${total}`;
}

const HR  = '═'.repeat(63);
const MID = '─'.repeat(63);

console.log(HR);
console.log('CRM Prospector — Batería de tests');
console.log(HR);

const results = [];

for (const suite of SUITES) {
  const tests = listTests(suite.dir);
  if (tests.length === 0) {
    console.log(`[${suite.kind.padEnd(11)}] (sin tests en ${suite.dir}/)`);
    continue;
  }
  for (const t of tests) {
    const start = Date.now();
    const r = spawnSync('node', [t.full], { encoding: 'utf8' });
    const dur = Date.now() - start;
    const summary = parseSummary(r.stdout || '');
    const total  = summary ? summary.total  : 0;
    const passed = summary ? summary.passed : 0;
    const failed = summary ? summary.failed : (r.status !== 0 ? 1 : 0);
    const badge  = statusBadge(passed, total, r.status);
    console.log(`[${suite.kind.padEnd(11)}] ${t.name.padEnd(22)} ${badge}  (${dur}ms)`);
    if (verbose || (r.status !== 0 && !summary)) {
      if (r.stdout) console.log('  stdout:\n' + r.stdout.split('\n').map(l => '    ' + l).join('\n'));
      if (r.stderr) console.log('  stderr:\n' + r.stderr.split('\n').map(l => '    ' + l).join('\n'));
    } else if (summary && summary.failures && summary.failures.length > 0) {
      summary.failures.forEach(f => console.log(`     ↳ FAIL: ${f.name} — ${f.message}`));
    }
    results.push({ kind: suite.kind, name: t.name, total, passed, failed, exitCode: r.status });
  }
}

const totalAssertions  = results.reduce((a, r) => a + r.total, 0);
const passedAssertions = results.reduce((a, r) => a + r.passed, 0);
const failedAssertions = results.reduce((a, r) => a + r.failed, 0);
const filesFailing     = results.filter(r => r.exitCode !== 0 || r.failed > 0).length;
const pct = totalAssertions > 0 ? ((passedAssertions / totalAssertions) * 100).toFixed(1) : '0.0';

console.log(MID);
const tail = failedAssertions === 0 && filesFailing === 0
  ? '✅ todos los tests pasan'
  : `❌ ${failedAssertions} aserciones fallan en ${filesFailing} archivos`;
console.log(`TOTAL: ${passedAssertions}/${totalAssertions} (${pct}%) · ${tail}`);
console.log(HR);

process.exit(filesFailing > 0 ? 1 : 0);
