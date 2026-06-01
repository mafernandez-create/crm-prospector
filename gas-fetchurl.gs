// =========================================================================
// GAS FETCH PROXY — CRM Prospector GPF
// =========================================================================
//
// Permite que el CRM haga peticiones HTTP server-side a través de GAS,
// bypaseando CORS y los bloqueos de proxies públicos (DuckDuckGo, etc.)
//
// INSTALACIÓN (5 pasos):
// 1. Abre https://script.google.com y selecciona el proyecto del CRM
// 2. Copia TODO el código de abajo y pégalo AL FINAL de Código.gs
// 3. En la función doPost(e), añade ANTES del bloque de respuesta final:
//
//      if (action === 'fetchUrl') {
//        return respond(handleFetchUrl(params));
//      }
//
// 4. Implementar > Nueva implementación > actualizar versión existente
// 5. ¡Listo! El CRM usará GAS como proxy de último recurso automáticamente
//
// =========================================================================

/**
 * Fetches a URL server-side using UrlFetchApp (no CORS restrictions).
 * Called from the CRM via callAPI('fetchUrl', { url: '...' })
 *
 * @param {Object} params - { url: string, timeout?: number }
 * @returns {Object} - { success, status, content } or { error }
 */
function handleFetchUrl(params) {
  var url = params.url;

  if (!url || typeof url !== 'string') {
    return { error: 'Parámetro url requerido' };
  }

  // Seguridad básica: solo HTTP/HTTPS
  if (!url.match(/^https?:\/\//i)) {
    return { error: 'URL debe empezar por http:// o https://' };
  }

  // Bloquear llamadas a la propia API para evitar bucles
  if (url.indexOf('script.google.com') !== -1) {
    return { error: 'URL no permitida' };
  }

  try {
    var fetchOptions = {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Accept-Encoding': 'identity',
        'Cache-Control': 'no-cache',
        'DNT': '1'
      }
    };

    var response = UrlFetchApp.fetch(url, fetchOptions);
    var statusCode = response.getResponseCode();
    var content = '';

    // Solo leer contenido si la respuesta es exitosa (evita leer 404/5xx grandes)
    if (statusCode < 500) {
      try {
        content = response.getContentText('UTF-8');
      } catch (encErr) {
        // Fallback a ISO-8859-1 si UTF-8 falla (sitios legacy españoles)
        content = response.getContentText('ISO-8859-1');
      }
    }

    Logger.log('fetchUrl: ' + statusCode + ' — ' + url.substring(0, 80));

    return {
      success: statusCode >= 200 && statusCode < 400,
      status: statusCode,
      content: content,
      url: url
    };

  } catch (e) {
    Logger.log('fetchUrl error: ' + e.message + ' — ' + url.substring(0, 80));
    return { error: e.message };
  }
}
