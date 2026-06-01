// Mini-framework de aserciones sin dependencias.
// Cada test devuelve { name, ok, message } y se acumulan en un array global.

const _results = [];

function _record(name, ok, message) {
  _results.push({ name, ok, message: message || '' });
  return ok;
}

function eq(actual, expected, name) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  return _record(name, ok, ok ? '' : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function truthy(value, name) {
  const ok = !!value;
  return _record(name, ok, ok ? '' : `expected truthy, got ${JSON.stringify(value)}`);
}

function falsy(value, name) {
  const ok = !value;
  return _record(name, ok, ok ? '' : `expected falsy, got ${JSON.stringify(value)}`);
}

function greaterThan(actual, threshold, name) {
  const ok = typeof actual === 'number' && actual > threshold;
  return _record(name, ok, ok ? '' : `expected > ${threshold}, got ${actual}`);
}

function contains(text, needle, name) {
  const ok = typeof text === 'string' && text.includes(needle);
  return _record(name, ok, ok ? '' : `text does not contain "${needle}" (text len=${(text||'').length})`);
}

function matches(text, regex, name) {
  const ok = typeof text === 'string' && regex.test(text);
  return _record(name, ok, ok ? '' : `text does not match ${regex} (sample: "${(text||'').slice(0,80)}")`);
}

function isType(value, type, name) {
  const ok = typeof value === type;
  return _record(name, ok, ok ? '' : `expected typeof ${type}, got ${typeof value}`);
}

async function asyncTest(name, fn) {
  try {
    const ok = await fn();
    return _record(name, ok !== false, '');
  } catch(e) {
    return _record(name, false, e.message || String(e));
  }
}

function getResults() { return _results.slice(); }
function reset() { _results.length = 0; }

function summary() {
  const total = _results.length;
  const passed = _results.filter(r => r.ok).length;
  const failed = total - passed;
  return { total, passed, failed, failures: _results.filter(r => !r.ok) };
}

module.exports = { eq, truthy, falsy, greaterThan, contains, matches, isType, asyncTest, getResults, reset, summary };
