// Integration tests para el endpoint GAS (Apps Script Web App).
// Solo se ejecutan si BATCH_ENDPOINT (y opcionalmente BATCH_API_KEY) están
// presentes en el entorno. En caso contrario, salida limpia con skip.

const A = require('../_lib/assert');

(async () => {
  A.reset();

  const endpoint = process.env.BATCH_ENDPOINT;
  const apiKey   = process.env.BATCH_API_KEY;

  if (!endpoint) {
    console.error('SKIP: BATCH_ENDPOINT no presente. Tests GAS no ejecutados.');
    // Devolvemos resumen 0/0 (no failures), exit 0
    const s = A.summary();
    console.log(JSON.stringify(s));
    process.exit(0);
  }

  // Helper: POST form-urlencoded con timeout, devuelve { status, body, location }
  async function postForm(params, opts = {}) {
    const timeoutMs = opts.timeoutMs || 60000;
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const body = new URLSearchParams(params).toString();
      const res = await fetch(endpoint, {
        method:  'POST',
        body,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        redirect: 'manual',
        signal:  ctrl.signal,
      });
      const location = res.headers.get('location') || null;
      let text = '';
      try { text = await res.text(); } catch(e) {}
      return { status: res.status, body: text, location };
    } finally {
      clearTimeout(tm);
    }
  }

  // 1) dryRun batchQualify (limite=5)
  let dryRes = null;
  try {
    const r1 = await postForm({
      action:  'batchQualify',
      apiKey:  apiKey || '',
      filtro:  'sin_cuadrante',
      limite:  '5',
      dryRun:  'true',
    });
    if (r1.location) {
      // Sigue el redirect manualmente
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), 60000);
      try {
        const res2 = await fetch(r1.location, { signal: ctrl.signal });
        dryRes = await res2.json();
      } finally { clearTimeout(tm); }
    } else if (r1.body) {
      try { dryRes = JSON.parse(r1.body); } catch(e) {}
    }
  } catch (e) {
    console.error('ERROR dryRun batchQualify:', e.message);
  }
  A.truthy(dryRes, 'GAS dryRun: respuesta JSON obtenida');

  // 2) status:done en respuesta (algunas variantes devuelven 'ok' / 'done')
  if (dryRes) {
    const statusOk = dryRes.status === 'done' || dryRes.status === 'ok' || typeof dryRes.processed === 'number';
    A.truthy(statusOk, 'GAS dryRun: status=done/ok o processed devuelto');
  } else {
    A.truthy(false, 'GAS dryRun: sin respuesta para validar status');
  }

  // 3) POST sin apiKey devuelve error/401
  let noKeyRes = null;
  try {
    const r2 = await postForm({ action: 'batchQualify', filtro: 'sin_cuadrante', limite: '1' });
    if (r2.location) {
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), 60000);
      try {
        const res2 = await fetch(r2.location, { signal: ctrl.signal });
        const txt = await res2.text();
        try { noKeyRes = JSON.parse(txt); } catch(e) { noKeyRes = { raw: txt }; }
      } finally { clearTimeout(tm); }
    } else if (r2.body) {
      try { noKeyRes = JSON.parse(r2.body); } catch(e) { noKeyRes = { raw: r2.body }; }
    }
  } catch (e) {
    console.error('ERROR POST sin apiKey:', e.message);
  }
  // El GAS devuelve un error o status:error cuando falta apiKey
  const rejected = noKeyRes && (
    noKeyRes.status === 'error' ||
    noKeyRes.error ||
    /unauthor|forbidden|apikey|api[_\s-]?key/i.test(JSON.stringify(noKeyRes))
  );
  A.truthy(rejected, 'GAS sin apiKey: respuesta indica error de autenticación');

  const s = A.summary();
  console.log(JSON.stringify(s));
  process.exit(s.failed > 0 ? 1 : 0);
})();
