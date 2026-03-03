// =========================================================================
// CORRECCIÓN PARA GOOGLE APPS SCRIPT - CRM Prospector Ferroplast
// =========================================================================
//
// INSTRUCCIONES:
// 1. Abre tu Google Apps Script: https://script.google.com
// 2. Selecciona el proyecto del CRM
// 3. COPIA las funciones de abajo y pégalas AL FINAL de tu Código.gs
// 4. Ejecuta primero "migrateStudiosData" desde el editor (botón ▶️)
//    - Esto extraerá los campos del JSON en "data" a las columnas individuales
// 5. Luego busca tu función "addStudio" existente y reemplázala con la versión corregida
// 6. Haz lo mismo con "updateStudio"
// 7. Despliega una nueva versión: Implementar > Nueva implementación
//
// COLUMNAS DEL SHEET "Studios" (en orden):
// A=id, B=name, C=shortName, D=province, E=priority, F=score,
// G=status, H=type, I=logo, J=data, K=b2bTimeline, L=createdAt, M=updatedAt
// =========================================================================

/**
 * PASO 1: EJECUTAR ESTA FUNCIÓN UNA VEZ
 * Migra los datos: extrae campos del JSON en columna "data" a columnas individuales
 */
function migrateStudiosData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Studios');
  if (!sheet) {
    Logger.log('ERROR: No se encontró la hoja "Studios"');
    return;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log('No hay datos para migrar');
    return;
  }

  // Leer todas las filas (desde fila 2 porque fila 1 son headers)
  var range = sheet.getRange(2, 1, lastRow - 1, 13); // 13 columnas
  var values = range.getValues();
  var updated = 0;
  var errors = 0;

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var id = row[0];       // A: id
    var name = row[1];     // B: name
    var dataCol = row[9];  // J: data (columna 10, índice 9)

    // Solo migrar si name está vacío Y data tiene contenido
    if (name && String(name).trim() !== '') {
      continue; // Ya tiene datos en las columnas, no migrar
    }

    if (!dataCol) continue;

    try {
      var data;
      if (typeof dataCol === 'string') {
        data = JSON.parse(dataCol);
      } else if (typeof dataCol === 'object') {
        data = dataCol;
      } else {
        continue;
      }

      // Extraer campos del objeto completo almacenado en data
      var studioName = data.name || '';
      var shortName = data.shortName || '';
      var province = data.province || '';
      var priority = data.priority || 'Media';
      var score = data.score || '';
      var status = data.status || 'nuevo';
      var type = data.type || 'arquitectura';
      var logo = data.logo || '';
      var b2bTimeline = data.b2bTimeline || '';

      // El sub-objeto "data" real (contact, team, projects)
      var innerData = data.data || {};

      // Actualizar las columnas individuales
      var rowNum = i + 2; // +2 porque i empieza en 0 y hay header
      sheet.getRange(rowNum, 2).setValue(studioName);     // B: name
      sheet.getRange(rowNum, 3).setValue(shortName);       // C: shortName
      sheet.getRange(rowNum, 4).setValue(province);        // D: province
      sheet.getRange(rowNum, 5).setValue(priority);        // E: priority
      sheet.getRange(rowNum, 6).setValue(score);           // F: score
      sheet.getRange(rowNum, 7).setValue(status);          // G: status
      sheet.getRange(rowNum, 8).setValue(type);            // H: type
      sheet.getRange(rowNum, 9).setValue(logo);            // I: logo
      // J: data - guardar solo el sub-objeto (contact, team, etc.)
      sheet.getRange(rowNum, 10).setValue(JSON.stringify(innerData));
      sheet.getRange(rowNum, 11).setValue(b2bTimeline);    // K: b2bTimeline

      updated++;

      // Pausa cada 50 filas para evitar timeout
      if (updated % 50 === 0) {
        SpreadsheetApp.flush();
        Logger.log('Progreso: ' + updated + ' filas actualizadas...');
      }

    } catch (e) {
      errors++;
      Logger.log('Error en fila ' + (i + 2) + ' (id=' + id + '): ' + e.message);
    }
  }

  SpreadsheetApp.flush();
  Logger.log('=== Migración completada ===');
  Logger.log('Filas actualizadas: ' + updated);
  Logger.log('Errores: ' + errors);
  Logger.log('Filas sin cambio (ya tenían datos): ' + (values.length - updated - errors));
}


// =========================================================================
// PASO 2: REEMPLAZAR tu función addStudio existente con esta versión
// =========================================================================

/**
 * VERSIÓN CORREGIDA de addStudio
 * Extrae campos individuales del studio y los guarda en las columnas correctas
 *
 * Busca en tu código "function handleAddStudio" o similar y reemplázala.
 * Si tu función se llama diferente, adapta el nombre.
 */
function handleAddStudio_FIXED(params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Studios');

  var studio = params.data;
  if (!studio) {
    return { error: 'No se proporcionaron datos del estudio' };
  }

  // Generar nuevo ID
  var lastRow = sheet.getLastRow();
  var newId;
  if (lastRow < 2) {
    newId = 1;
  } else {
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    var maxId = 0;
    for (var i = 0; i < ids.length; i++) {
      var id = parseInt(ids[i][0]);
      if (!isNaN(id) && id > maxId) maxId = id;
    }
    newId = maxId + 1;
  }

  var now = new Date().toISOString();

  // Extraer campos individuales del studio
  var name = studio.name || '';
  var shortName = studio.shortName || name.split(' ').map(function(w) { return w.charAt(0); }).join('').toUpperCase().substring(0, 3);
  var province = studio.province || '';
  var priority = studio.priority || 'Media';
  var score = studio.score || '';
  var status = studio.status || 'nuevo';
  var type = studio.type || 'arquitectura';
  var logo = studio.logo || '';
  var b2bTimeline = studio.b2bTimeline || '';

  // El campo "data" del studio contiene contact, team, projects, etc.
  var studioData = studio.data || {};

  // Columnas: id, name, shortName, province, priority, score, status, type, logo, data, b2bTimeline, createdAt, updatedAt
  sheet.appendRow([
    newId,
    name,
    shortName,
    province,
    priority,
    score,
    status,
    type,
    logo,
    JSON.stringify(studioData),
    b2bTimeline,
    studio.createdAt || now,
    studio.updatedAt || now
  ]);

  return { success: true, id: newId };
}


// =========================================================================
// PASO 3: REEMPLAZAR tu función updateStudio existente con esta versión
// =========================================================================

function handleUpdateStudio_FIXED(params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Studios');

  var data = params.data;
  if (!data || !data.id) {
    return { error: 'ID de estudio requerido' };
  }

  var studioId = data.id;
  var updates = data.updates || {};

  // Buscar la fila del estudio por ID
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return { error: 'Estudio no encontrado' };
  }

  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var rowIndex = -1;

  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(studioId)) {
      rowIndex = i + 2; // +2 por header y 0-index
      break;
    }
  }

  if (rowIndex === -1) {
    return { error: 'Estudio no encontrado: ' + studioId };
  }

  // Mapeo de campos a columnas
  var columnMap = {
    'name': 2,
    'shortName': 3,
    'province': 4,
    'priority': 5,
    'score': 6,
    'status': 7,
    'type': 8,
    'logo': 9,
    'data': 10,
    'b2bTimeline': 11
  };

  // Aplicar actualizaciones
  for (var field in updates) {
    if (columnMap[field]) {
      var value = updates[field];
      if (field === 'data' && typeof value === 'object') {
        value = JSON.stringify(value);
      }
      sheet.getRange(rowIndex, columnMap[field]).setValue(value);
    }
  }

  // Actualizar timestamp
  sheet.getRange(rowIndex, 13).setValue(new Date().toISOString()); // M: updatedAt

  return { success: true, id: studioId };
}


// =========================================================================
// NOTA: Integración con tu código existente
// =========================================================================
//
// En tu función principal doGet(e) o doPost(e), busca el switch/if donde
// manejas las acciones. Debería verse algo así:
//
//   if (action === 'addStudio') {
//     return respond(handleAddStudio(params));    // <-- Cambiar a handleAddStudio_FIXED
//   }
//   if (action === 'updateStudio') {
//     return respond(handleUpdateStudio(params)); // <-- Cambiar a handleUpdateStudio_FIXED
//   }
//
// O puedes renombrar las funciones _FIXED y quitar el sufijo.
// =========================================================================
