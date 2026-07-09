/**
 * Apps Script: syncContact — empuja contactos del CRM a Google Contacts.
 * ---------------------------------------------------------------------------
 * DÓNDE VIVE: proyecto de Apps Script PROPIO, creado y desplegado con la cuenta
 * cuyos contactos quieres en el iPhone → ma.fernandez@grupogpf.com.
 * Al desplegarse como "Ejecutar como: yo (ma.fernandez@grupogpf.com)", la
 * People API escribe en LOS CONTACTOS DE ESA CUENTA. Como tu iPhone/Mac tienen
 * esa cuenta de Google añadida en Ajustes → Contactos, los cambios se
 * sincronizan solos. No se guarda ninguna credencial: el script YA se ejecuta
 * como tú.
 *
 * REQUISITOS DE DESPLIEGUE (ver README.md junto a este archivo):
 *   1) Servicios (Advanced Services) → activar "People API".
 *   2) Implementar → Nueva implementación → Aplicación web:
 *        Ejecutar como: Yo (ma.fernandez@grupogpf.com)
 *        Quién tiene acceso: Cualquier usuario
 *   3) Copiar la URL /exec y pegarla en redesign/data.js (GAS_CONTACTS_URL).
 *
 * SEGURIDAD: valida el token de sesión de Supabase (sbToken) contra el endpoint
 * /auth/v1/user → solo un usuario logueado en el CRM puede crear/editar/borrar.
 * ---------------------------------------------------------------------------
 */

var SUPABASE_URL = 'https://zmelqffrkwxkbzzutjrg.supabase.co';
var SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
  '.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptZWxxZmZya3d4a2J6enV0anJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1Mjg2MzAsImV4cCI6MjA5NTEwNDYzMH0' +
  '.v1_Isxz6-mZtz_DJs3k6qoH9mV9FNW21Z94tiew9cQE';

var GROUP_NAME = 'CRM GPF'; // grupo de Google Contacts donde caen los del CRM

/* ============================ Entry point ============================ */

function doPost(e) {
  try {
    var action = e && e.parameter && e.parameter.action;
    if (action !== 'syncContact') {
      return _json({ error: 'Acción no válida: ' + action }, 400);
    }
    // Auth: el sbToken viaja en la query (mismo patrón que el GAS del CRM).
    var sbToken = e.parameter.sbToken;
    if (!_validarSbToken(sbToken)) {
      return _json({ error: 'No autorizado (sbToken inválido).' }, 401);
    }

    var payload = JSON.parse(e.postData.contents || '{}');
    var op = payload.op; // 'upsert' | 'delete'
    var studio = payload.studio;
    if (!studio || !studio.id) return _json({ error: "Falta studio con id." }, 400);

    if (op === 'delete') {
      _deleteContact(payload.resourceName);
      return _json({ ok: true, op: 'delete' });
    }
    if (op === 'upsert') {
      var out = _upsertContact(studio, payload.resourceName);
      return _json({ ok: true, op: 'upsert', resourceName: out.resourceName, etag: out.etag });
    }
    return _json({ error: 'op desconocida: ' + op }, 400);
  } catch (err) {
    return _json({ error: String(err && err.message || err) }, 500);
  }
}

/* ============================ Auth ============================ */

function _validarSbToken(token) {
  if (!token) return false;
  try {
    var res = UrlFetchApp.fetch(SUPABASE_URL + '/auth/v1/user', {
      method: 'get',
      headers: {
        'Authorization': 'Bearer ' + token,
        'apikey': SUPABASE_ANON_KEY,
      },
      muteHttpExceptions: true,
    });
    return res.getResponseCode() === 200;
  } catch (e) {
    return false;
  }
}

/* ============================ People API ============================ */

// Campos que escribimos (para updateContact hay que declararlos).
// OJO: 'memberships' NO puede ir aquí — la People API prohíbe actualizar la
// pertenencia a grupos vía updateContact. El grupo se gestiona aparte con
// ContactGroups.Members.modify (ver _addToGroup).
var PERSON_FIELDS = 'names,organizations,phoneNumbers,emailAddresses,urls,addresses,biographies,userDefined';

function _buildPerson(studio) {
  var name = studio.name || ('CRM ' + studio.id);
  var person = {
    names: [{ unstructuredName: name, familyName: name }],
    organizations: [{ name: name, type: 'work' }],
    userDefined: [{ key: 'crm_id', value: String(studio.id) }],
  };

  if (studio.type) {
    var t = _isArray(studio.type) ? studio.type[0] : studio.type;
    if (t) person.organizations[0].title = String(t);
  }
  if (studio.phone) person.phoneNumbers = [{ value: String(studio.phone), type: 'work' }];
  if (studio.email) person.emailAddresses = [{ value: String(studio.email), type: 'work' }];
  if (studio.web) person.urls = [{ value: String(studio.web), type: 'work' }];

  var street = studio.address || '';
  var city = studio.city || '';
  var region = studio.province || '';
  if (street || city || region) {
    person.addresses = [{
      streetAddress: street, city: city, region: region, type: 'work',
    }];
  }

  // Personas del equipo → nota (el contacto de agenda es la ENTIDAD).
  var team = _isArray(studio.team) ? studio.team : [];
  var people = [];
  for (var i = 0; i < team.length; i++) {
    var m = team[i]; if (!m) continue;
    var who = [m.name, m.role].filter(Boolean).join(' · ');
    var cd = [m.phone, m.email].filter(Boolean).join(' / ');
    var line = cd ? (who + ' — ' + cd) : who;
    if (line) people.push(line);
  }
  var note = '';
  if (people.length) note += 'Contactos:\n' + people.join('\n') + '\n\n';
  note += '— Sincronizado desde CRM GPF —';
  person.biographies = [{ value: note, contentType: 'TEXT_PLAIN' }];

  return person;
}

function _upsertContact(studio, resourceName) {
  var groupResource = _ensureGroup();
  var person = _buildPerson(studio);
  var result = null;

  // ¿Actualizar uno existente? Necesitamos su etag actual.
  if (resourceName) {
    try {
      var current = People.People.get(resourceName, { personFields: 'metadata' });
      person.etag = current.etag;
      result = People.People.updateContact(person, resourceName, {
        updatePersonFields: PERSON_FIELDS,
      });
    } catch (e) {
      // 404 u otro: el contacto ya no existe en Google → crear de nuevo.
    }
  }
  if (!result) {
    result = People.People.createContact(person);
  }

  // El grupo se asigna aparte (updateContact no admite 'memberships').
  _addToGroup(groupResource, result.resourceName);
  return { resourceName: result.resourceName, etag: result.etag };
}

/* Añade un contacto al grupo CRM GPF (idempotente). */
function _addToGroup(groupResource, contactResource) {
  try {
    People.ContactGroups.Members.modify(
      { resourceNamesToAdd: [contactResource] },
      groupResource
    );
  } catch (e) {
    // No es crítico para la sincronización del contacto; se registra y sigue.
    Logger.log('No pude añadir al grupo: ' + (e && e.message || e));
  }
}

function _deleteContact(resourceName) {
  if (!resourceName) return; // nada que borrar (idempotente)
  try {
    People.People.deleteContact(resourceName);
  } catch (e) {
    // Si ya no existe, lo damos por borrado.
  }
}

/* Crea (una vez) el grupo "CRM GPF" y cachea su resourceName en Script Properties. */
function _ensureGroup() {
  var props = PropertiesService.getScriptProperties();
  var cached = props.getProperty('CRM_GROUP_RESOURCE');
  if (cached) {
    try {
      People.ContactGroups.get(cached); // valida que sigue existiendo
      return cached;
    } catch (e) { /* se recrea abajo */ }
  }
  // ¿Ya existe un grupo con ese nombre?
  var list = People.ContactGroups.list({ pageSize: 1000 });
  var groups = (list && list.contactGroups) || [];
  for (var i = 0; i < groups.length; i++) {
    if (groups[i].name === GROUP_NAME) {
      props.setProperty('CRM_GROUP_RESOURCE', groups[i].resourceName);
      return groups[i].resourceName;
    }
  }
  var created = People.ContactGroups.create({ contactGroup: { name: GROUP_NAME } });
  props.setProperty('CRM_GROUP_RESOURCE', created.resourceName);
  return created.resourceName;
}

/* ============================ Test ============================ */

/**
 * PASO 1 — Probar el tubo SIN pasar por el CRM.
 * Ejecuta esta función desde el editor de Apps Script (botón ▷ Ejecutar).
 * La primera vez pedirá autorizar permisos (Contactos). Acepta.
 * DONE = aparece "CRM GPF · Contacto de prueba" en contacts.google.com y,
 * poco después, en tu iPhone.
 */
function testSyncContact() {
  var studio = {
    id: 'selftest',
    name: 'CRM GPF · Contacto de prueba',
    type: 'TEST',
    phone: '+34 600 000 000',
    email: 'prueba@grupogpf.com',
    web: 'https://ferroplast.es',
    address: 'Calle de Prueba 1',
    city: 'Málaga',
    province: 'Málaga',
    team: [{ name: 'Manolo Fernández', role: 'Prescriptor', phone: '+34 600 000 001' }],
  };
  var out = _upsertContact(studio, null);
  Logger.log('Creado/actualizado: ' + JSON.stringify(out));
  Logger.log('Grupo CRM GPF: ' + _ensureGroup());
  return out;
}

/** Borra el contacto de prueba (para limpiar tras el test). */
function testDeleteSelftest() {
  // Busca por userDefined crm_id = selftest entre tus contactos.
  var res = People.People.Connections.list('people/me', {
    personFields: 'userDefined',
    pageSize: 2000,
  });
  var conns = (res && res.connections) || [];
  for (var i = 0; i < conns.length; i++) {
    var ud = conns[i].userDefined || [];
    for (var j = 0; j < ud.length; j++) {
      if (ud[j].key === 'crm_id' && ud[j].value === 'selftest') {
        People.People.deleteContact(conns[i].resourceName);
        Logger.log('Borrado ' + conns[i].resourceName);
        return;
      }
    }
  }
  Logger.log('No encontré el contacto de prueba.');
}

/* ============================ Utils ============================ */

function _isArray(v) { return Object.prototype.toString.call(v) === '[object Array]'; }

function _json(obj, code) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
