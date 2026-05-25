// =========================================================================
// firestore.mjs — JWT auth + Firestore REST helpers (sin dependencias npm)
// Port del bloque GAS getFirestoreAccessToken + firestoreListStudios +
// firestoreBatchPatch.
// =========================================================================

import { createSign, createPrivateKey } from 'node:crypto';

const SCOPE = 'https://www.googleapis.com/auth/datastore';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

// Cache de access token en memoria — válido 1h, lo refresca el getter
let cachedToken = null;
let cachedTokenExp = 0;

function base64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

// Firma un JWT RS256 con la private key del service account
function signJwt(clientEmail, privateKeyPem) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: clientEmail,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  const encHeader = base64url(JSON.stringify(header));
  const encClaims = base64url(JSON.stringify(claims));
  const signingInput = `${encHeader}.${encClaims}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  sign.end();
  const keyObj = createPrivateKey(privateKeyPem);
  const signature = sign.sign(keyObj);
  return `${signingInput}.${base64url(signature)}`;
}

/**
 * Obtiene un access token OAuth para Firestore vía service account JWT flow.
 * Lee credenciales de FIREBASE_SERVICE_ACCOUNT_KEY env var (JSON completo).
 * Cachea en memoria con margen de 60s sobre el exp.
 */
export async function getFirestoreAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now < cachedTokenExp - 60) return cachedToken;

  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!saJson) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY no definido');
  let sa;
  try { sa = JSON.parse(saJson); }
  catch (e) { throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY no es JSON válido: ' + e.message); }
  if (!sa.client_email || !sa.private_key) {
    throw new Error('client_email / private_key ausentes en el service account JSON');
  }

  const assertion = signJwt(sa.client_email, sa.private_key);
  const params = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) {
    throw new Error(`OAuth token HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const body = await res.json();
  if (!body.access_token) throw new Error('Sin access_token en respuesta OAuth');
  cachedToken = body.access_token;
  cachedTokenExp = now + (body.expires_in || 3600);
  return cachedToken;
}

export function firestoreBaseUrl() {
  const projectId = process.env.FIRESTORE_PROJECT_ID;
  if (!projectId) throw new Error('FIRESTORE_PROJECT_ID no definido');
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

// ── Mapping Firestore tipado ⇄ JS plano ──

function firestoreValueToJS(v) {
  if (v === null || v === undefined) return null;
  if ('stringValue' in v)    return v.stringValue;
  if ('integerValue' in v)   return parseInt(v.integerValue, 10);
  if ('doubleValue' in v)    return Number(v.doubleValue);
  if ('booleanValue' in v)   return v.booleanValue;
  if ('nullValue' in v)      return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('mapValue' in v)       return firestoreFieldsToJS(v.mapValue.fields || {});
  if ('arrayValue' in v) {
    return (v.arrayValue.values || []).map(firestoreValueToJS);
  }
  return null;
}

function firestoreFieldsToJS(fields) {
  if (!fields) return {};
  const out = {};
  for (const k in fields) out[k] = firestoreValueToJS(fields[k]);
  return out;
}

function jsToFirestoreValue(x) {
  if (x === null || x === undefined) return { nullValue: null };
  if (typeof x === 'boolean')        return { booleanValue: x };
  if (typeof x === 'number') {
    return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  }
  if (typeof x === 'string')         return { stringValue: x };
  if (Array.isArray(x))              return { arrayValue: { values: x.map(jsToFirestoreValue) } };
  if (typeof x === 'object') {
    const fields = {};
    for (const k in x) fields[k] = jsToFirestoreValue(x[k]);
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}

function jsObjectToFirestoreFields(obj) {
  const fields = {};
  for (const k in obj) fields[k] = jsToFirestoreValue(obj[k]);
  return fields;
}

// ── Operaciones ──

export async function listStudios(pageToken, pageSize) {
  const base = firestoreBaseUrl();
  let url = `${base}/studios?pageSize=${pageSize || 100}`;
  if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

  const res = await fetch(url, {
    headers: { Authorization: 'Bearer ' + await getFirestoreAccessToken() },
  });
  if (!res.ok) {
    throw new Error(`Firestore list HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json();
  const studios = (data.documents || []).map(doc => {
    const s = firestoreFieldsToJS(doc.fields);
    const parts = doc.name.split('/');
    s.id = parts[parts.length - 1];
    s._docName = doc.name;
    return s;
  });
  return { studios, nextPageToken: data.nextPageToken || null };
}

/**
 * Batch patch de N studios. updatesArray: [{ docId, updates: {...} }, ...]
 * Usa Firestore batchWrite con updateMask para no sobreescribir otros campos.
 */
export async function batchPatch(updatesArray) {
  if (!updatesArray || updatesArray.length === 0) return { written: 0 };

  const projectId = process.env.FIRESTORE_PROJECT_ID;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:batchWrite`;

  const writes = updatesArray.map(item => {
    const fields = jsObjectToFirestoreFields(item.updates);
    const docName = `projects/${projectId}/databases/(default)/documents/studios/${item.docId}`;
    return {
      update: { name: docName, fields },
      updateMask: { fieldPaths: Object.keys(item.updates) },
    };
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + await getFirestoreAccessToken(),
    },
    body: JSON.stringify({ writes }),
  });
  if (!res.ok) {
    throw new Error(`Firestore batchWrite HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return { written: writes.length };
}

/**
 * Patchea _meta/batch_checkpoint con info de progreso. No bloqueante:
 * cualquier error se log pero no rompe la ejecución.
 */
export async function saveCheckpoint(checkpoint) {
  const projectId = process.env.FIRESTORE_PROJECT_ID;
  const fieldPaths = Object.keys(checkpoint).map(k => `updateMask.fieldPaths=${k}`).join('&');
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/_meta/batch_checkpoint?${fieldPaths}`;
  const payload = { fields: jsObjectToFirestoreFields(checkpoint) };
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + await getFirestoreAccessToken(),
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.warn(`[checkpoint] HTTP ${res.status}: ${(await res.text()).slice(0, 150)}`);
    }
  } catch (e) {
    console.warn(`[checkpoint] error: ${e.message}`);
  }
}
