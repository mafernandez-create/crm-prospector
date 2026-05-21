// Helper de lectura pública Firestore REST para tests.
// Reusa convenciones del repo (ferroplast-crm, colecciones studios/_meta/activities).

const PROJECT = 'ferroplast-crm';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

function unwrap(f) {
  if (f === null || f === undefined) return null;
  if ('stringValue' in f) return f.stringValue;
  if ('integerValue' in f) return parseInt(f.integerValue, 10);
  if ('doubleValue' in f) return f.doubleValue;
  if ('booleanValue' in f) return f.booleanValue;
  if ('nullValue' in f) return null;
  if ('timestampValue' in f) return f.timestampValue;
  if ('arrayValue' in f) return (f.arrayValue.values || []).map(unwrap);
  if ('mapValue' in f) {
    const out = {};
    for (const k of Object.keys(f.mapValue.fields || {})) out[k] = unwrap(f.mapValue.fields[k]);
    return out;
  }
  return null;
}

function docFieldsToObj(fields) {
  const out = {};
  for (const k of Object.keys(fields || {})) out[k] = unwrap(fields[k]);
  return out;
}

function getValor(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && 'valor' in v) return v.valor || '';
  return String(v);
}

async function getDoc(path) {
  const url = `${BASE}/${path}`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore ${res.status} ${res.statusText} (${path})`);
  const json = await res.json();
  return { id: json.name.split('/').pop(), ...docFieldsToObj(json.fields || {}) };
}

async function listCollection(name, opts = {}) {
  const docs = [];
  const pageSize = opts.pageSize || 300;
  const limit = opts.limit || Infinity;
  let pageToken = null;
  do {
    const url = new URL(`${BASE}/${name}`);
    url.searchParams.set('pageSize', String(pageSize));
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Firestore ${res.status} ${res.statusText} (${name})`);
    const json = await res.json();
    (json.documents || []).forEach(doc => {
      if (docs.length >= limit) return;
      docs.push({ id: doc.name.split('/').pop(), ...docFieldsToObj(doc.fields || {}) });
    });
    pageToken = json.nextPageToken || null;
  } while (pageToken && docs.length < limit);
  return docs;
}

module.exports = { PROJECT, BASE, unwrap, getValor, docFieldsToObj, getDoc, listCollection };
