// =========================================================================
// INTEGRACIÓN DUNS 100000 - CRM Prospector Ferroplast
// =========================================================================
//
// INSTRUCCIONES:
// 1. Abre tu Google Apps Script: https://script.google.com
// 2. Selecciona el proyecto del CRM
// 3. COPIA todo este código y pégalo AL FINAL de tu Código.gs
// 4. En tu función principal doPost(e), añade este caso:
//
//    if (action === 'dunsSearch') {
//      return respond(handleDunsSearch(params));
//    }
//
// 5. Despliega una nueva versión: Implementar > Nueva implementación
// =========================================================================

/**
 * Maneja búsquedas en DUNS 100000
 * @param {Object} params - { username, password, action, searchTerms, province }
 * @returns {Object} - { success, companies, message }
 */
function handleDunsSearch(params) {
  var username = params.username;
  var password = params.password;
  var searchAction = params.action || 'search'; // 'testLogin' o 'search'

  if (!username || !password) {
    return { success: false, message: 'Usuario y contraseña requeridos' };
  }

  try {
    // Paso 1: Login en DUNS 100000
    var loginResult = dunsLogin(username, password);

    if (!loginResult.success) {
      return { success: false, message: loginResult.message };
    }

    // Si solo es test de login, devolver éxito
    if (searchAction === 'testLogin') {
      return { success: true, message: 'Login correcto en DUNS 100000' };
    }

    // Paso 2: Buscar empresas
    var searchTerms = params.searchTerms || [];
    var province = params.province || '';
    var cookies = loginResult.cookies;

    var allCompanies = [];

    for (var i = 0; i < searchTerms.length && i < 3; i++) {
      var query = searchTerms[i] + ' ' + province;
      var companies = dunsSearch(query, cookies);
      allCompanies = allCompanies.concat(companies);
    }

    // También buscar solo por provincia + sector genérico
    if (province) {
      var provCompanies = dunsSearch(province, cookies);
      allCompanies = allCompanies.concat(provCompanies);
    }

    // Deduplicar por nombre
    var seen = {};
    var unique = [];
    for (var j = 0; j < allCompanies.length; j++) {
      var key = allCompanies[j].name.toLowerCase().trim();
      if (!seen[key]) {
        seen[key] = true;
        unique.push(allCompanies[j]);
      }
    }

    return {
      success: true,
      companies: unique,
      message: unique.length + ' empresas encontradas en DUNS 100000'
    };

  } catch (e) {
    Logger.log('DUNS error: ' + e.message);
    return { success: false, message: 'Error: ' + e.message };
  }
}

/**
 * Login en DUNS 100000 y devolver cookies de sesión
 */
function dunsLogin(username, password) {
  var loginUrl = 'https://www.duns100000.com/servlet/app/prod/LOGIN_XML/';

  try {
    var response = UrlFetchApp.fetch(loginUrl, {
      method: 'post',
      payload: 'username=' + encodeURIComponent(username) + '&password=' + encodeURIComponent(password),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.duns100000.com/servlet/app/screen/SProducto/prod/PAGINA_PRINCIPAL'
      },
      followRedirects: false,
      muteHttpExceptions: true
    });

    var responseCode = response.getResponseCode();
    var content = response.getContentText();
    var headers = response.getAllHeaders();

    Logger.log('DUNS login response code: ' + responseCode);
    Logger.log('DUNS login content: ' + content.substring(0, 500));

    // Extraer cookies de Set-Cookie
    var cookies = extractCookies(headers);

    // Parsear XML de respuesta
    var resultado = extractXmlTag(content, 'RESULTADO');
    var codRetorno = extractXmlTag(content, 'CODRETORNO');
    var usuarioCaducado = extractXmlTag(content, 'USUARIO_CADUCADO');

    if (resultado === '1') {
      if (usuarioCaducado) {
        return { success: false, message: 'Usuario caducado/inactivo en DUNS 100000' };
      }
      return { success: true, cookies: cookies };
    } else if (codRetorno === '1000') {
      return { success: false, message: 'Necesita aceptar condiciones de contratación en duns100000.com' };
    } else if (codRetorno === '1001') {
      return { success: false, message: 'Usuario inactivo en DUNS 100000' };
    } else {
      return { success: false, message: 'Credenciales incorrectas (resultado=' + resultado + ')' };
    }

  } catch (e) {
    Logger.log('DUNS login error: ' + e.message);
    return { success: false, message: 'Error de conexión: ' + e.message };
  }
}

/**
 * Buscar empresas en DUNS 100000 con sesión autenticada
 */
function dunsSearch(query, cookies) {
  var companies = [];

  try {
    // Primero normalizar el texto de búsqueda
    var normalizedQuery = dunsNormalizeText(query, cookies);
    if (!normalizedQuery) {
      normalizedQuery = query.replace(/\s+/g, '+');
    }

    // Construir URL de búsqueda
    var searchUrl = 'https://www.duns100000.com/servlet/app/prod/BUSCADOR/ACC/NEW/DEMP_DENOM_SOCIAL/' + encodeURIComponent(normalizedQuery);

    Logger.log('DUNS search URL: ' + searchUrl);

    var response = UrlFetchApp.fetch(searchUrl, {
      method: 'get',
      headers: {
        'Cookie': cookies,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.duns100000.com/servlet/app/prod/BUSQUEDA_EMPRESAS/'
      },
      followRedirects: true,
      muteHttpExceptions: true
    });

    var html = response.getContentText();

    // Parsear resultados de la página de búsqueda
    companies = parseDunsResults(html);

    Logger.log('DUNS search "' + query + '": ' + companies.length + ' results');

  } catch (e) {
    Logger.log('DUNS search error for "' + query + '": ' + e.message);
  }

  return companies;
}

/**
 * Normalizar texto para URL de búsqueda DUNS
 */
function dunsNormalizeText(text, cookies) {
  try {
    var url = 'https://www.duns100000.com/servlet/app/prod/XML_NORMALIZA_PARA_URL/?text=' + encodeURIComponent(text);

    var response = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: {
        'Cookie': cookies,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      muteHttpExceptions: true
    });

    var content = response.getContentText();
    var normalized = extractXmlTag(content, 'textoBuscadoNormalizadoURL');
    return normalized || null;

  } catch (e) {
    Logger.log('DUNS normalize error: ' + e.message);
    return null;
  }
}

/**
 * Parsear HTML de resultados de búsqueda DUNS
 * Extrae nombre de empresa, ciudad, actividad y URL del listado
 */
function parseDunsResults(html) {
  var companies = [];

  // Buscar filas de resultados en la tabla
  // DUNS usa Kendo UI grids y tablas HTML estándar
  // Patrón típico: filas con datos de empresa dentro de tablas/divs

  // Patrón 1: Enlaces a fichas de empresa
  var fichaPattern = /FICHA_EMPRESA[^"]*\/DUNS\/(\d+)[^"]*"[^>]*>([^<]+)/gi;
  var match;
  while ((match = fichaPattern.exec(html)) !== null) {
    var dunsNum = match[1];
    var name = match[2].trim();
    if (name.length > 2) {
      companies.push({
        name: cleanHtmlEntities(name),
        duns: dunsNum,
        url: 'https://www.duns100000.com/servlet/app/prod/FICHA_EMPRESA_BUSQUEDA/DUNS/' + dunsNum,
        city: '',
        activity: ''
      });
    }
  }

  // Patrón 2: Buscar en celdas de tabla (<td>) con datos de empresa
  var rowPattern = /<tr[^>]*class="[^"]*(?:fila|row|item)[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
  while ((match = rowPattern.exec(html)) !== null) {
    var rowHtml = match[1];
    var cells = [];
    var cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    var cellMatch;
    while ((cellMatch = cellPattern.exec(rowHtml)) !== null) {
      cells.push(stripHtml(cellMatch[1]).trim());
    }

    if (cells.length >= 3) {
      var companyName = cells[0] || cells[1];
      if (companyName && companyName.length > 2) {
        // Evitar duplicados con los ya encontrados
        var isDup = false;
        for (var k = 0; k < companies.length; k++) {
          if (companies[k].name.toLowerCase() === companyName.toLowerCase()) {
            // Enriquecer con datos adicionales
            if (cells.length > 2 && !companies[k].city) companies[k].city = cells[2] || '';
            if (cells.length > 3 && !companies[k].activity) companies[k].activity = cells[3] || '';
            isDup = true;
            break;
          }
        }
        if (!isDup) {
          companies.push({
            name: companyName,
            city: cells.length > 2 ? cells[2] : '',
            activity: cells.length > 3 ? cells[3] : '',
            url: '',
            duns: ''
          });
        }
      }
    }
  }

  // Patrón 3: Buscar nombres de empresa en elementos con clase específica
  var namePattern = /class="[^"]*(?:empresa|company|denom)[^"]*"[^>]*>([^<]+)/gi;
  while ((match = namePattern.exec(html)) !== null) {
    var empName = match[1].trim();
    if (empName.length > 2) {
      var exists = false;
      for (var m = 0; m < companies.length; m++) {
        if (companies[m].name.toLowerCase() === empName.toLowerCase()) {
          exists = true;
          break;
        }
      }
      if (!exists) {
        companies.push({
          name: cleanHtmlEntities(empName),
          city: '',
          activity: '',
          url: '',
          duns: ''
        });
      }
    }
  }

  return companies;
}

/**
 * Extraer cookies de los headers de respuesta
 */
function extractCookies(headers) {
  var cookies = [];
  var setCookie = headers['Set-Cookie'] || headers['set-cookie'];

  if (!setCookie) return '';

  // Set-Cookie puede ser string o array
  if (typeof setCookie === 'string') {
    setCookie = [setCookie];
  }

  for (var i = 0; i < setCookie.length; i++) {
    // Extraer solo name=value (antes del primer ;)
    var parts = setCookie[i].split(';');
    if (parts[0]) {
      cookies.push(parts[0].trim());
    }
  }

  return cookies.join('; ');
}

/**
 * Extraer valor de un tag XML
 */
function extractXmlTag(xml, tagName) {
  var regex = new RegExp('<' + tagName + '>([^<]*)</' + tagName + '>', 'i');
  var match = xml.match(regex);
  return match ? match[1].trim() : null;
}

/**
 * Limpiar entidades HTML
 */
function cleanHtmlEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

/**
 * Eliminar tags HTML de un string
 */
function stripHtml(html) {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}
