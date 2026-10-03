/**
 * Registro de uso de la API de Anthropic — pegar en el proyecto Apps Script del proxy del CRM
 * (el que despacha action=claudeProxy). No cambia la respuesta que recibe el CRM.
 *
 * Qué hace: después de cada llamada a Claude, guarda en Supabase (tabla public.ia_uso)
 * la función del CRM que la pidió (?uso=briefing, informe, correo, asistente...), el modelo
 * y los tokens. Si algo falla al guardar, se ignora: nunca rompe la llamada a Claude.
 *
 * Requisitos:
 *  - Propiedades del script (Configuración del proyecto → Propiedades del script):
 *      SUPABASE_URL       = https://zmelqffrkwxkbzzutjrg.supabase.co
 *      SUPABASE_ANON_KEY  = la anon key pública (la misma de redesign/auth.js)
 *    Si el proxy ya guarda estas dos cosas con otro nombre (para validar el sbToken),
 *    cambia los nombres en IA_USO_CFG_ y no hace falta crear nada nuevo.
 *  - La tabla ia_uso exige usuario autenticado: se inserta con el sbToken que ya
 *    manda el CRM en la query (el mismo que valida el proxy).
 */

var IA_USO_CFG_ = { urlProp: 'SUPABASE_URL', keyProp: 'SUPABASE_ANON_KEY' };

/**
 * Llamar justo después de obtener la respuesta de Anthropic dentro de la rama claudeProxy.
 *   e         → el evento de doPost (para leer e.parameter.uso y e.parameter.sbToken)
 *   payload   → el objeto que se envió a Anthropic (para el modelo si la respuesta no lo trae)
 *   respuesta → el JSON devuelto por Anthropic (ya parseado)
 *   t0        → Date.now() tomado justo antes de UrlFetchApp.fetch
 */
function registrarUsoIA_(e, payload, respuesta, t0) {
  try {
    var p = (e && e.parameter) || {};
    var token = p.sbToken;
    if (!token) return;                                   // sin sesión no se puede insertar (RLS)
    var props = PropertiesService.getScriptProperties();
    var base = props.getProperty(IA_USO_CFG_.urlProp);
    var key  = props.getProperty(IA_USO_CFG_.keyProp);
    if (!base || !key) return;

    var r = respuesta || {};
    var u = r.usage || {};
    var err = r.error ? (typeof r.error === 'string' ? r.error : (r.error.message || JSON.stringify(r.error))) : null;
    var fila = {
      origen: 'claudeProxy',
      funcion: String(p.uso || 'sin_etiqueta').slice(0, 60),
      modelo: r.model || (payload && payload.model) || null,
      input_tokens: u.input_tokens || 0,
      output_tokens: u.output_tokens || 0,
      cache_creation: u.cache_creation_input_tokens || 0,
      cache_read: u.cache_read_input_tokens || 0,
      web_search: (u.server_tool_use && u.server_tool_use.web_search_requests) || 0,
      duracion_ms: t0 ? (Date.now() - t0) : null,
      ok: !err,
      error: err ? String(err).slice(0, 500) : null
    };
    UrlFetchApp.fetch(base + '/rest/v1/ia_uso', {
      method: 'post',
      contentType: 'application/json',
      headers: { apikey: key, Authorization: 'Bearer ' + token, Prefer: 'return=minimal' },
      payload: JSON.stringify(fila),
      muteHttpExceptions: true
    });
  } catch (_) { /* el registro nunca debe romper la llamada a Claude */ }
}

/* ─── Ejemplo de integración en la rama claudeProxy (adaptar a tu código) ─────────
 *
 *   if (action === 'claudeProxy') {
 *     var payload = JSON.parse(e.postData.contents);
 *     var t0 = Date.now();                                        // ← añadir
 *     var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', { ... });
 *     var json = JSON.parse(resp.getContentText());
 *     registrarUsoIA_(e, payload, json, t0);                      // ← añadir
 *     return ContentService.createTextOutput(JSON.stringify(json))
 *                          .setMimeType(ContentService.MimeType.JSON);
 *   }
 *
 * Después: Implementar → Gestionar implementaciones → editar la implementación ACTIVA
 * (la AKfycbzh2… que usan data.js y chat.html) → Versión: "Nueva versión" → Implementar.
 * Así la URL no cambia y el CRM no necesita tocar nada más.
 */
