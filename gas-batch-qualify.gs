// =========================================================================
// BATCH QUALIFY ENDPOINT — CRM Prospector GPF (Fase E, spec v1.1 §15.3)
// =========================================================================
//
// Endpoint server-side que cumple el Bloque 2B del plan v1.1.
// Llamado por .github/workflows/batch-qualify.yml cada noche a las 02:00 UTC.
// Lee studios de Firestore, recalcula scoring v2, escribe los cambios.
// Idempotente: solo escribe si hay cambio de cuadrante o nuevo candidato a puente.
//
// INSTALACIÓN: ver SETUP_BATCH_QUALIFY.md en la raíz del repo.
//
// ESPEJO de la lógica client-side:
//   - calculateScoringV2 — index.html línea ~6075
//   - buildScoringV2Updates — index.html línea ~6228
//   - cualificarLote — index.html línea ~17133
//
// =========================================================================


// ── Constantes spec v1.1 §7 (replicadas exactamente del index.html) ──

var TIPO_LEGACY_MAP_GAS = {
  arquitectura: 'ARQ', ingenieria: 'ING',
  promotora: 'OCV', constructora: 'OCV',
  aapp: 'AAPP', aguas: 'CICA', regantes: 'CCRR', concesionaria: 'CONC',
  almacen: 'almacen', colegio_profesional: 'colegio_profesional', otros: 'otros'
};

var SV2_QUADRANT_MAP = {
  'Alto_Alta': 1,  'Alto_Media': 2,  'Alto_Baja': 3,
  'Medio_Alta': 4, 'Medio_Media': 5, 'Medio_Baja': 6,
  'Bajo_Alta': 7,  'Bajo_Media': 8,  'Bajo_Baja': 9
};

var SV2_QUADRANT_NAMES = {
  1: 'Estratégico',       2: 'Cliente core',     3: 'Cliente volumen',
  4: 'Puerta de entrada', 5: 'Cartera estándar', 6: 'Mantenimiento',
  7: 'Conector',          8: 'Seguimiento ligero', 9: 'Congelar'
};

var SV2_ACTIONS = {
  1: 'Visita trimestral. Cuenta clave. Profundizar relación y cartografiar red.',
  2: 'Visita trimestral. Comercial técnico. Mantener prescripción y detectar proyectos nuevos.',
  3: 'Visita semestral. Técnico-comercial. Sostener volumen.',
  4: 'Visita semestral. Exploratorio. Extraer info de cartera, identificar 2-3 targets accesibles a través de él.',
  5: 'Visita anual o en ruta. Mantener relación y captar cambios.',
  6: 'Contacto anual telefónico. Visita solo si pasa por zona.',
  7: 'Visita solo si en ruta a otro cliente A/B. Contacto cordial sin pitch.',
  8: 'Contacto telefónico anual. Confirmar vigencia.',
  9: 'Sin contacto programado. Re-evaluación a 18 meses.'
};

var GPF_FIT_FAMILIES = [
  ['evacuacion_mute',    ['evacuación','bajante','saneamiento pvc','insonori','acústic']],
  ['red_saneamiento',    ['colector','alcantarillado','red saneamiento','edar','depuradora','saneamiento']],
  ['riego_biopipe',      ['riego','regadío','pvc-o','pe100','conducción agua','biorientado']],
  ['abastecimiento',     ['abastecimiento','agua potable','red distribución','captación']],
  ['pe_presion_gas',     ['polietileno','pe 100','gas pe','condusan','presión gas']]
];


// ── Helpers (espejo de index.html) ──

function gasGetValor(campo) {
  if (campo === null || campo === undefined) return '';
  if (typeof campo === 'string') return campo;
  if (typeof campo === 'object' && 'valor' in campo) return campo.valor || '';
  return '';
}

function gasGetTipoPrincipal(studio) {
  if (!studio || !studio.type) return 'ARQ';
  if (Array.isArray(studio.type)) return studio.type.length > 0 ? studio.type[0] : 'ARQ';
  return TIPO_LEGACY_MAP_GAS[studio.type] || studio.type;
}


// ── Replicación exacta de calculateScoringV2 (index.html ~línea 6075) ──

function gasCalculateScoringV2(studio) {
  var data     = studio.data || {};
  var social   = data.social  || {};
  var contact  = data.contact || {};
  var team     = data.team    || [];
  var projects = data.projects || [];
  var tipoPpal = gasGetTipoPrincipal(studio);

  // ── D1: Tipo de cliente ──
  var d1 = 0;
  if (tipoPpal === 'ARQ' || tipoPpal === 'ING') d1 = 3;
  else if (tipoPpal === 'OCV') d1 = 2;
  else if (tipoPpal === 'AAPP' || tipoPpal === 'CCRR' || tipoPpal === 'CICA' || tipoPpal === 'CONC') d1 = 1;

  // ── D2: Tamaño ──
  var d2 = 0;
  var empVal = parseInt(gasGetValor((data.studio || {}).employees)) || 0;
  if (empVal > 0) {
    if (tipoPpal === 'OCV') {
      if (empVal >= 50) d2 = 3; else if (empVal >= 20) d2 = 2; else if (empVal >= 5) d2 = 1;
    } else {
      if (empVal >= 20) d2 = 3; else if (empVal >= 10) d2 = 2; else if (empVal >= 3) d2 = 1;
    }
  }

  // ── D3: Facturación (sin_dato_fiable hoy) ──
  var d3 = 0;

  // ── D4: Actividad reciente ──
  var d4 = 0, d4Recent = 0;
  var d4Cutoff = new Date(); d4Cutoff.setFullYear(d4Cutoff.getFullYear() - 1);
  for (var i = 0; i < projects.length; i++) {
    var p = projects[i];
    if (p.year && parseInt(p.year) >= d4Cutoff.getFullYear()) d4Recent++;
    else if (p.date) {
      try { if (new Date(p.date) >= d4Cutoff) d4Recent++; } catch(e) {}
    }
  }
  var d4Effective = d4Recent > 0 ? d4Recent : Math.round(projects.length * 0.6);
  if (d4Effective >= 5) d4 = 3; else if (d4Effective >= 3) d4 = 2; else if (d4Effective >= 1) d4 = 1;

  // ── D5: Fit catálogo GPF ──
  var d5 = 0;
  var projText = projects.map(function(p) { return ((p.name||'') + ' ' + (p.type||'')).toLowerCase(); }).join(' ');
  var d5Fits = 0;
  for (var j = 0; j < GPF_FIT_FAMILIES.length; j++) {
    var kws = GPF_FIT_FAMILIES[j][1];
    var match = false;
    for (var k = 0; k < kws.length; k++) {
      if (projText.indexOf(kws[k]) !== -1) { match = true; break; }
    }
    if (match) d5Fits++;
  }
  if ((tipoPpal === 'ARQ' || tipoPpal === 'ING') && projects.length > 0) d5Fits = Math.max(d5Fits, 1);
  if (d5Fits >= 3) d5 = 2; else if (d5Fits >= 1) d5 = 1;

  // ── D6: Contacto completo ──
  var d6 = 0, d6Pts = 0;
  if (gasGetValor(contact.phone)   && gasGetValor(contact.phone)   !== 'No encontrado') d6Pts++;
  if (gasGetValor(contact.email)   && gasGetValor(contact.email)   !== 'No encontrado') d6Pts++;
  if (gasGetValor(contact.address) && gasGetValor(contact.address) !== 'No encontrado') d6Pts++;
  if (gasGetValor(contact.web)     && gasGetValor(contact.web)     !== 'No encontrado') d6Pts++;
  for (var t = 0; t < team.length; t++) {
    if (team[t].isDecisionMaker) { d6Pts++; break; }
  }
  for (var t2 = 0; t2 < team.length; t2++) {
    if (team[t2].email && team[t2].email !== 'No encontrado') { d6Pts++; break; }
  }
  for (var t3 = 0; t3 < team.length; t3++) {
    if (team[t3].linkedin && team[t3].linkedin !== 'No encontrado') { d6Pts++; break; }
  }
  if (d6Pts >= 5) d6 = 2; else if (d6Pts >= 2) d6 = 1;

  var rawDirect = d1 + d2 + d3 + d4 + d5 + d6;

  // ── EJE 2: VALOR DE RED — R1+R2+R3+R4+R5 (spec §7.3) ──

  // R1: Tamaño de cartera detectable
  var r1 = 0;
  if      (projects.length >= 10) r1 = 2;
  else if (projects.length >=  5) r1 = 1.5;
  else if (projects.length >=  2) r1 = 1;

  // R2: Densidad GPF de la cartera
  var R2_TARGET_KWS = [
    'regant','regadío','regadio','comunidad de riego',
    'edar','depuradora','abastecimiento','saneamiento','agua potable',
    'red de aguas','red de saneamiento','red de abastecimiento','colector',
    'ayuntamiento','diputación','diputacion','consorcio','mancomunidad',
    'junta de','sector público','sector publico',
    'urbanización','urbanizacion','infraestructura','vial','autovía','autovia',
    'pavimentación','pavimentacion'
  ];
  var r2TargetCount = 0;
  for (var pr2 = 0; pr2 < projects.length; pr2++) {
    var pj = projects[pr2];
    var pt2 = ((pj.name||pj.nombre||'') + ' ' + (pj.type||pj.tipo||'') + ' ' + (pj.descripcion||pj.description||'')).toLowerCase();
    for (var kw2 = 0; kw2 < R2_TARGET_KWS.length; kw2++) {
      if (pt2.indexOf(R2_TARGET_KWS[kw2]) !== -1) { r2TargetCount++; break; }
    }
  }
  var r2Pct = projects.length > 0 ? (r2TargetCount / projects.length) : 0;
  var r2 = 0;
  if      (r2Pct >= 0.75)        r2 = 4;
  else if (r2Pct >= 0.50)        r2 = 3;
  else if (r2Pct >= 0.25)        r2 = 2;
  else if (r2TargetCount >= 1)   r2 = 1;

  // R3: Exclusividad / proveedor preferente (heurística mínima)
  var R3_KWS = [
    'proveedor exclusivo','proveedor preferente','proveedor habitual',
    'colaborador habitual','partner exclusivo','partner preferente'
  ];
  var r3Text = (data.description || '').toLowerCase();
  for (var pr3 = 0; pr3 < projects.length; pr3++) {
    var pj3 = projects[pr3];
    r3Text += ' ' + ((pj3.name||pj3.nombre||'') + ' ' + (pj3.descripcion||pj3.description||'')).toLowerCase();
  }
  var r3Hits = 0;
  for (var kw3 = 0; kw3 < R3_KWS.length; kw3++) {
    if (r3Text.indexOf(R3_KWS[kw3]) !== -1) r3Hits++;
  }
  var r3 = 0;
  if      (r3Hits >= 2) r3 = 2;
  else if (r3Hits >= 1) r3 = 1;

  // R4: Posición referente
  var liFollowers = parseInt(String(gasGetValor((social.linkedin || {}).followers) || '').replace(/[^0-9]/g, '') || '0') || 0;
  var awardKws = ['premio','bienal','award','finalista','reconoci','distinción','medalla','ganador'];
  var teachKws = ['profesor','docente','universidad','cátedra','master','máster'];

  var socialCount = 0;
  if (gasGetValor((social.linkedin || {}).url))   socialCount++;
  if (gasGetValor((social.instagram || {}).url))  socialCount++;
  if (gasGetValor((social.twitter || {}).url))    socialCount++;

  var awardsHit = false;
  for (var p2 = 0; p2 < projects.length; p2++) {
    var pt = ((projects[p2].name||'') + (projects[p2].type||'')).toLowerCase();
    for (var aw = 0; aw < awardKws.length; aw++) {
      if (pt.indexOf(awardKws[aw]) !== -1) { awardsHit = true; break; }
    }
    if (awardsHit) break;
  }
  if (!awardsHit) {
    var desc = (data.description || '').toLowerCase();
    for (var aw2 = 0; aw2 < awardKws.length; aw2++) {
      if (desc.indexOf(awardKws[aw2]) !== -1) { awardsHit = true; break; }
    }
  }

  var teachingHit = false;
  for (var tm = 0; tm < team.length; tm++) {
    var tx = ((team[tm].role||'') + (team[tm].bio||'')).toLowerCase();
    for (var tk = 0; tk < teachKws.length; tk++) {
      if (tx.indexOf(teachKws[tk]) !== -1) { teachingHit = true; break; }
    }
    if (teachingHit) break;
  }

  var r4Signals = 0;
  if (liFollowers >= 1000)               r4Signals++;
  if (awardsHit)                          r4Signals++;
  if (teachingHit)                        r4Signals++;
  if (projects.length >= 10)              r4Signals++;
  if (socialCount >= 2 && liFollowers >= 500) r4Signals++;

  var r4 = r4Signals >= 4 ? 4 : r4Signals >= 2 ? 2 : 0;

  // R5: Diversidad geográfica de la cartera
  var R5_ZONA_PROVS = [
    'málaga','malaga','sevilla','granada','almería','almeria','jaén','jaen','córdoba','cordoba','huelva','cádiz','cadiz',
    'cáceres','caceres','badajoz',
    'toledo','cuenca','ciudad real','albacete','guadalajara',
    'madrid',
    'alicante','valencia','castellón','castellon',
    'murcia',
    'islas baleares','baleares','palma',
    'las palmas','tenerife','santa cruz de tenerife',
    'ceuta','melilla'
  ];
  var r5ProvsSet = {};
  for (var pr5 = 0; pr5 < projects.length; pr5++) {
    var pj5 = projects[pr5];
    var pt5 = ((pj5.location||'') + ' ' + (pj5.name||pj5.nombre||'') + ' ' + (pj5.descripcion||pj5.description||'')).toLowerCase();
    for (var pv = 0; pv < R5_ZONA_PROVS.length; pv++) {
      if (pt5.indexOf(R5_ZONA_PROVS[pv]) !== -1) r5ProvsSet[R5_ZONA_PROVS[pv]] = true;
    }
  }
  var r5ProvCount = Object.keys(r5ProvsSet).length;
  var r5 = 0;
  if      (r5ProvCount >= 3) r5 = 2;
  else if (r5ProvCount >= 1) r5 = 1;

  // Spec §7.3: ≥10 Alta, 6-9 Media, <6 Baja
  var rawNetwork = r1 + r2 + r3 + r4 + r5;
  var priorityNetwork = rawNetwork >= 10 ? 'Alta' : rawNetwork >= 6 ? 'Media' : 'Baja';

  // ── CLIENTE PUENTE §7.2.1 ──
  // Con R1-R5 ya implementados, umbral literal del spec: rawNetwork ≥ 6 (banda Media/Alta)
  var esCandidatoPuente = rawDirect < 6 && rawNetwork >= 6 && projects.length >= 5;
  var puenteActivo = studio.es_cliente_puente === true;
  var rawDirectFinal = puenteActivo ? rawDirect + 4 : rawDirect;
  var priorityDirect = rawDirectFinal >= 10 ? 'Alto' : rawDirectFinal >= 6 ? 'Medio' : 'Bajo';

  // ── CUADRANTE ──
  var priorityQuadrant = SV2_QUADRANT_MAP[priorityDirect + '_' + priorityNetwork] || 5;

  return {
    priorityDirect: priorityDirect,
    priorityDirectScore: rawDirectFinal,
    priorityDirectScoreNatural: rawDirect,
    esCandidatoPuente: esCandidatoPuente,
    puenteActivo: puenteActivo,
    priorityNetwork: priorityNetwork,
    priorityNetworkScore: rawNetwork,
    priorityQuadrant: priorityQuadrant,
    priorityQuadrantName: SV2_QUADRANT_NAMES[priorityQuadrant],
    priorityRecommendedAction: SV2_ACTIONS[priorityQuadrant]
  };
}


// ── Replicación de buildScoringV2Updates (con histórico) ──

function gasBuildScoringV2Updates(studio, trigger) {
  var v2 = gasCalculateScoringV2(studio);
  var histEntry = {
    fecha: new Date().toISOString(),
    priorityDirect: v2.priorityDirect,
    priorityDirectScore: v2.priorityDirectScore,
    priorityNetwork: v2.priorityNetwork,
    priorityNetworkScore: v2.priorityNetworkScore,
    priorityQuadrant: v2.priorityQuadrant,
    trigger: trigger || 'github_actions'
  };
  var prevHistory = Array.isArray(studio.scoringHistory) ? studio.scoringHistory : [];
  var newHistory = prevHistory.concat([histEntry]).slice(-20);
  var updates = {};
  for (var k in v2) if (v2.hasOwnProperty(k)) updates[k] = v2[k];
  updates.es_candidato_puente = v2.esCandidatoPuente;
  updates.scoringHistory = newHistory;
  return updates;
}


// ── OAuth2 — token de acceso a Firestore vía service account ──

function getFirestoreAccessToken() {
  var props = PropertiesService.getScriptProperties();
  var serviceAccountEmail = props.getProperty('SERVICE_ACCOUNT_EMAIL');
  var privateKey = props.getProperty('SERVICE_ACCOUNT_PRIVATE_KEY');
  // Fix: si la private_key se pegó con \n literales (caso típico al copiar
  // directo del JSON), convertirlos a saltos de línea reales que la library
  // OAuth2 necesita para parsear el PEM. Idempotente.
  if (privateKey && privateKey.indexOf('\\n') !== -1) {
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  if (!serviceAccountEmail || !privateKey) {
    throw new Error('SERVICE_ACCOUNT_EMAIL / SERVICE_ACCOUNT_PRIVATE_KEY no configurados en Script Properties.');
  }

  // OAuth2 library (script ID 1B7FSrk5Zi6L1rSxxTDgDEUsPzlukDsi4KGuTMorsTQHhGBzBkMun4iDF)
  if (typeof OAuth2 === 'undefined') {
    throw new Error('OAuth2 library no instalada. Añadir desde Apps Script Editor → Bibliotecas.');
  }

  var service = OAuth2.createService('FirestoreBatchQualify')
    .setTokenUrl('https://oauth2.googleapis.com/token')
    .setPrivateKey(privateKey)
    .setIssuer(serviceAccountEmail)
    .setScope('https://www.googleapis.com/auth/datastore')
    .setPropertyStore(props);

  if (!service.hasAccess()) {
    throw new Error('Firestore OAuth: ' + service.getLastError());
  }
  return service.getAccessToken();
}


// ── Firestore REST API helpers ──

function firestoreBaseUrl() {
  var projectId = PropertiesService.getScriptProperties().getProperty('FIRESTORE_PROJECT_ID');
  if (!projectId) throw new Error('FIRESTORE_PROJECT_ID no configurado.');
  return 'https://firestore.googleapis.com/v1/projects/' + projectId + '/databases/(default)/documents';
}

// Mapping Firestore JSON tipado ⇄ JS plano (mínimo viable para nuestros campos)
function firestoreFieldsToJS(fields) {
  if (!fields) return {};
  var out = {};
  for (var k in fields) {
    if (!fields.hasOwnProperty(k)) continue;
    out[k] = firestoreValueToJS(fields[k]);
  }
  return out;
}

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
    var arr = (v.arrayValue.values || []).map(firestoreValueToJS);
    return arr;
  }
  return null;
}

function jsToFirestoreValue(x) {
  if (x === null || x === undefined) return { nullValue: null };
  if (typeof x === 'boolean')        return { booleanValue: x };
  if (typeof x === 'number')         return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (typeof x === 'string')         return { stringValue: x };
  if (Array.isArray(x))              return { arrayValue: { values: x.map(jsToFirestoreValue) } };
  if (typeof x === 'object') {
    var fields = {};
    for (var k in x) if (x.hasOwnProperty(k)) fields[k] = jsToFirestoreValue(x[k]);
    return { mapValue: { fields: fields } };
  }
  return { nullValue: null };
}

function jsObjectToFirestoreFields(obj) {
  var fields = {};
  for (var k in obj) if (obj.hasOwnProperty(k)) fields[k] = jsToFirestoreValue(obj[k]);
  return fields;
}

// List studios paginated
function firestoreListStudios(pageToken, pageSize) {
  var url = firestoreBaseUrl() + '/studios?pageSize=' + (pageSize || 100);
  if (pageToken) url += '&pageToken=' + encodeURIComponent(pageToken);

  var resp = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + getFirestoreAccessToken() }
  });

  if (resp.getResponseCode() >= 400) {
    throw new Error('Firestore list error ' + resp.getResponseCode() + ': ' + resp.getContentText().substring(0, 300));
  }

  var data = JSON.parse(resp.getContentText());
  var studios = (data.documents || []).map(function(doc) {
    var s = firestoreFieldsToJS(doc.fields);
    // El docId real está en doc.name = "...documents/studios/3042"
    var parts = doc.name.split('/');
    s.id = parts[parts.length - 1];
    s._docName = doc.name;
    return s;
  });
  return { studios: studios, nextPageToken: data.nextPageToken || null };
}

// Batch write — patch a documentos existentes con updateMask
function firestoreBatchPatch(updatesArray) {
  // updatesArray: [{ docId: '3042', updates: {priorityDirect: 'Alto', ...} }, ...]
  if (!updatesArray || updatesArray.length === 0) return { written: 0 };

  var projectId = PropertiesService.getScriptProperties().getProperty('FIRESTORE_PROJECT_ID');
  var url = 'https://firestore.googleapis.com/v1/projects/' + projectId + '/databases/(default)/documents:batchWrite';

  var writes = updatesArray.map(function(item) {
    var fields = jsObjectToFirestoreFields(item.updates);
    var docName = 'projects/' + projectId + '/databases/(default)/documents/studios/' + item.docId;
    return {
      update: { name: docName, fields: fields },
      updateMask: { fieldPaths: Object.keys(item.updates) }
    };
  });

  var resp = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + getFirestoreAccessToken() },
    payload: JSON.stringify({ writes: writes })
  });

  if (resp.getResponseCode() >= 400) {
    throw new Error('Firestore batchWrite error ' + resp.getResponseCode() + ': ' + resp.getContentText().substring(0, 300));
  }

  return { written: writes.length };
}

function firestoreSaveCheckpoint(checkpoint) {
  var projectId = PropertiesService.getScriptProperties().getProperty('FIRESTORE_PROJECT_ID');
  var url = 'https://firestore.googleapis.com/v1/projects/' + projectId + '/databases/(default)/documents/_meta/batch_checkpoint';

  var payload = { fields: jsObjectToFirestoreFields(checkpoint) };

  UrlFetchApp.fetch(url + '?updateMask.fieldPaths=' + Object.keys(checkpoint).join('&updateMask.fieldPaths='), {
    method: 'patch',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + getFirestoreAccessToken() },
    payload: JSON.stringify(payload)
  });
}


// ── Endpoint principal: handleBatchQualify ──

/**
 * Endpoint server-side de cualificación masiva.
 * Llamado desde GitHub Actions vía POST con JSON:
 *   { action: 'batchQualify', apiKey: '...', filtro: '...', limite: 200 }
 *
 * Para integrar en el doPost(e) existente del proyecto, añadir:
 *   if (action === 'batchQualify') return respond(handleBatchQualify(params));
 *
 * Filtros soportados:
 *   - 'sin_cuadrante' (default): solo studios sin priorityQuadrant asignado
 *   - 'todos': toda la cartera
 *   - 'ARQ' | 'ING' | 'OCV' | 'AAPP' | 'CCRR' | 'CICA': filtro por tipo
 */
function handleBatchQualify(params) {
  var t0 = new Date().getTime();
  var props = PropertiesService.getScriptProperties();

  // Validación API key
  var expectedKey = props.getProperty('BATCH_API_KEY');
  if (!expectedKey) {
    return { error: 'BATCH_API_KEY no configurado en Script Properties.' };
  }
  if (!params || params.apiKey !== expectedKey) {
    return { error: 'Unauthorized', status: 401 };
  }

  var filtro = params.filtro || 'sin_cuadrante';
  var limite = parseInt(params.limite) || 200;
  var trigger = 'github_actions';

  // Checkpoint inicial
  try {
    firestoreSaveCheckpoint({
      trigger: trigger,
      procesandose_por: 'github_actions',
      filtro: filtro,
      limite: limite,
      status: 'running',
      startedAt: new Date().toISOString()
    });
  } catch (e) {
    Logger.log('Checkpoint inicial falló: ' + e.message);
  }

  // Recolección paginada con tope de tiempo (GAS quota 6 min/exec → margen 4 min)
  var MAX_DURATION_MS = 4 * 60 * 1000;
  var pageToken = null;
  var processed = 0;
  var updated = 0;
  var nuevosCandidatosPuente = 0;
  var cambiosCuadrante = 0;
  var errors = [];
  var WRITE_BATCH_SIZE = 100; // Firestore batchWrite recomendado <= 500
  var pendingWrites = [];
  var lastIdProcessed = null;

  while (processed < limite) {
    if (new Date().getTime() - t0 > MAX_DURATION_MS) {
      Logger.log('Timeout próximo, deteniendo paginación.');
      break;
    }

    var page;
    try {
      page = firestoreListStudios(pageToken, Math.min(100, limite - processed));
    } catch (e) {
      errors.push('list page: ' + e.message);
      break;
    }

    for (var i = 0; i < page.studios.length && processed < limite; i++) {
      var studio = page.studios[i];
      processed++;
      lastIdProcessed = studio.id;

      // Filtros
      if (filtro === 'sin_cuadrante' && studio.priorityQuadrant) continue;
      if (['ARQ','ING','OCV','AAPP','CCRR','CICA'].indexOf(filtro) !== -1) {
        var tipo = gasGetTipoPrincipal(studio);
        if (tipo !== filtro) continue;
      }

      try {
        var v2updates = gasBuildScoringV2Updates(studio, trigger);
        var cambiaCuadrante = (studio.priorityQuadrant || null) !== (v2updates.priorityQuadrant || null);
        var nuevoCandidato = !studio.es_candidato_puente && v2updates.es_candidato_puente === true;

        // Idempotencia: solo escribir si hay cambio real (o nunca tuvo cuadrante)
        if (cambiaCuadrante || nuevoCandidato || !studio.priorityQuadrant) {
          pendingWrites.push({ docId: studio.id, updates: v2updates });
          updated++;
          if (cambiaCuadrante) cambiosCuadrante++;
          if (nuevoCandidato) nuevosCandidatosPuente++;
        }

        // Flush por batches
        if (pendingWrites.length >= WRITE_BATCH_SIZE) {
          firestoreBatchPatch(pendingWrites);
          pendingWrites = [];
          firestoreSaveCheckpoint({
            trigger: trigger,
            procesandose_por: 'github_actions',
            processed: processed,
            updated: updated,
            lastId: String(lastIdProcessed || ''),
            updatedAt: new Date().toISOString()
          });
        }
      } catch (e) {
        errors.push('studio ' + studio.id + ': ' + e.message);
      }
    }

    if (!page.nextPageToken) break;
    pageToken = page.nextPageToken;
  }

  // Flush final
  if (pendingWrites.length > 0) {
    try { firestoreBatchPatch(pendingWrites); } catch (e) { errors.push('flush final: ' + e.message); }
  }

  var durationSec = Math.round((new Date().getTime() - t0) / 1000);

  // Checkpoint final
  try {
    firestoreSaveCheckpoint({
      trigger: trigger,
      procesandose_por: null,
      filtro: filtro,
      limite: limite,
      processed: processed,
      updated: updated,
      cambiosCuadrante: cambiosCuadrante,
      nuevosCandidatosPuente: nuevosCandidatosPuente,
      lastId: String(lastIdProcessed || ''),
      status: 'done',
      finishedAt: new Date().toISOString(),
      durationSec: durationSec,
      errorsCount: errors.length
    });
  } catch (e) {
    Logger.log('Checkpoint final falló: ' + e.message);
  }

  return {
    success: errors.length === 0,
    processed: processed,
    updated: updated,
    cambiosCuadrante: cambiosCuadrante,
    nuevosCandidatosPuente: nuevosCandidatosPuente,
    errors: errors.slice(0, 10),
    durationSec: durationSec
  };
}


// ── Test desde el editor GAS (botón ▶️) ──

/**
 * Ejecutar desde el editor GAS para verificar que la configuración funciona.
 * Lee 5 studios y muestra el scoring que les asignaría — sin escribir Firestore.
 */
function testBatchQualifyDryRun() {
  try {
    var page = firestoreListStudios(null, 5);
    Logger.log('Conexión Firestore OK. ' + page.studios.length + ' studios leídos.');
    for (var i = 0; i < page.studios.length; i++) {
      var s = page.studios[i];
      var v2 = gasCalculateScoringV2(s);
      Logger.log('Studio ' + s.id + ' (' + (s.name || 'sin nombre') + '): Q' + v2.priorityQuadrant + ' | D=' + v2.priorityDirect + ' R=' + v2.priorityNetwork);
    }
  } catch (e) {
    Logger.log('ERROR: ' + e.message);
    throw e;
  }
}

/**
 * Test del endpoint completo en modo dry-run (limite pequeño, sin afectar producción).
 * Cambia 'TU_API_KEY_AQUI' por la BATCH_API_KEY que generaste.
 */
function testBatchQualifyEndpoint() {
  var apiKey = PropertiesService.getScriptProperties().getProperty('BATCH_API_KEY');
  if (!apiKey) {
    Logger.log('Configurar BATCH_API_KEY en Script Properties antes de testear.');
    return;
  }
  var result = handleBatchQualify({
    apiKey: apiKey,
    filtro: 'sin_cuadrante',
    limite: 5
  });
  Logger.log('Resultado: ' + JSON.stringify(result));
}
