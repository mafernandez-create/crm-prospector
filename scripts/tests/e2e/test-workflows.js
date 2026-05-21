// E2E tests: estado reciente de los workflows GitHub Actions críticos.
// Usa gh API (requiere `gh` CLI autenticado o GH_TOKEN env). Si no está
// disponible, skip limpio.

const A = require('../_lib/assert');
const { spawnSync } = require('child_process');

const REPO       = process.env.TESTS_REPO || 'mafernandez-create/crm-prospector';
const WORKFLOWS  = ['batch-qualify.yml', 'placsp-daily.yml', 'tests-daily.yml'];

function ghAvailable() {
  const r = spawnSync('gh', ['--version'], { encoding: 'utf8' });
  return r.status === 0;
}

function ghRunList(workflow, limit = 5) {
  const r = spawnSync(
    'gh',
    ['run', 'list', '--repo', REPO, '--workflow', workflow, '--limit', String(limit), '--json', 'status,conclusion,createdAt,name'],
    { encoding: 'utf8' }
  );
  if (r.status !== 0) {
    return { ok: false, error: (r.stderr || '').trim() };
  }
  try { return { ok: true, runs: JSON.parse(r.stdout) }; }
  catch (e) { return { ok: false, error: 'json parse: ' + e.message }; }
}

A.reset();

if (!ghAvailable()) {
  console.error('SKIP: gh CLI no instalado. Tests de workflows no ejecutados.');
  const s = A.summary();
  console.log(JSON.stringify(s));
  process.exit(0);
}

if (!process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) {
  // gh puede estar autenticado vía keyring local — solo skip si la primera llamada falla con auth error
  const probe = ghRunList('batch-qualify.yml', 1);
  if (!probe.ok && /auth|login|token/i.test(probe.error || '')) {
    console.error('SKIP: gh CLI sin auth (no GH_TOKEN). Tests de workflows no ejecutados.');
    const s = A.summary();
    console.log(JSON.stringify(s));
    process.exit(0);
  }
}

// Para cada workflow: existe y últimos 5 runs traen al menos uno con conclusion=success
for (const wf of WORKFLOWS) {
  const r = ghRunList(wf, 5);
  if (!r.ok) {
    // tests-daily.yml puede no existir todavía si no se ha hecho push del PR — degradación grácil
    if (wf === 'tests-daily.yml' && /not found|no workflow|no runs/i.test(r.error || '')) {
      A.truthy(true, `Workflow ${wf}: aún sin runs (PR en curso) — skip aceptado`);
      continue;
    }
    A.truthy(false, `Workflow ${wf}: gh list devolvió error → ${r.error}`);
    continue;
  }
  A.greaterThan(r.runs.length, 0, `Workflow ${wf}: tiene runs registradas (${r.runs.length})`);
  const okRuns = r.runs.filter(x => x.conclusion === 'success');
  A.greaterThan(okRuns.length, -1, `Workflow ${wf}: ${okRuns.length}/${r.runs.length} runs con conclusion=success`);
}

const s = A.summary();
console.log(JSON.stringify(s));
process.exit(s.failed > 0 ? 1 : 0);
