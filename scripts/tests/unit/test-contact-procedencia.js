// 7-oct-2026: guardar una ficha desde la interfaz NO puede borrar la
// procedencia de los campos de contacto.
//
// Un campo de `data.contact` puede ser texto plano o un objeto
// {valor, fuente_url, fuente_tipo, fecha_captura, nivel_confianza}. El
// formulario de edición leía el objeto con Util.readField (bien) pero
// escribía de vuelta el texto a secas, así que cada guardado aplanaba el
// objeto y perdía de dónde salió el dato y cuándo se capturó. Le pasó a la
// ficha 293 (INGHO) al probar la rama de rendimiento: web, email, phone y
// address se quedaron en texto; `city`, que el formulario no toca, conservó
// su objeto y delató el estropicio.
//
// No es un caso de borde: ~1.400 de las 2.162 fichas del CRM llevan
// procedencia en estos campos.
//
// Lo que fija este test es Util.writeField, el contrapunto de readField:
//   · valor sin cambiar -> se devuelve el objeto INTACTO
//   · valor editado     -> texto plano (la procedencia ya no describe ese
//                          valor; el dato pasa a ser manual)

const fs = require('fs');
const path = require('path');
const A    = require('../_lib/assert');

A.reset();

// writeField se extrae del fuente real: así el test falla si alguien lo toca.
const src  = fs.readFileSync(path.join(__dirname, '../../../redesign/app.js'), 'utf8');
const ini  = src.indexOf('function writeField');
A.truthy(ini > -1, 'Util.writeField sigue existiendo en redesign/app.js');
const cuerpo = src.slice(ini, src.indexOf('\n  }\n', ini) + 4);
const writeField = new Function(cuerpo + '; return writeField;')();

A.truthy(/writeField: writeField/.test(src), 'y sigue exportado en window.Util');

// Caso real de la ficha 293: la procedencia que city conservó.
const prov = {
  valor: '952020609',
  fuente_url: null,
  fuente_tipo: 'legacy',
  fecha_captura: '2026-03-03T09:18:02.849Z',
  nivel_confianza: 'legacy',
};

// --- 1. El dato no se toca: la procedencia sobrevive entera ---
const igual = writeField('952020609', prov);
A.eq(typeof igual, 'object', 'si el valor no cambia, se devuelve un objeto, no texto');
A.eq(JSON.stringify(igual), JSON.stringify(prov), 'y es la procedencia intacta, campo por campo');
A.eq(igual.fuente_tipo, 'legacy', 'fuente_tipo se conserva');
A.eq(igual.fecha_captura, '2026-03-03T09:18:02.849Z', 'fecha_captura se conserva');
A.eq(igual.nivel_confianza, 'legacy', 'nivel_confianza se conserva');

// El formulario devuelve el texto tal cual lo pintó readField, que puede
// traer espacios de cortesía: eso no es una edición.
A.eq(JSON.stringify(writeField('  952020609 ', prov)), JSON.stringify(prov),
     'un espacio de más no cuenta como edición');

// --- 2. El dato SÍ se edita: se guarda texto plano ---
A.eq(writeField('952 999 000', prov), '952 999 000',
     'si el usuario cambia el valor, se guarda su texto');
A.eq(typeof writeField('952 999 000', prov), 'string',
     'y deja de ser un objeto: la procedencia antigua ya no describe ese valor');

// --- 3. Campos que ya eran texto plano, y huecos ---
A.eq(writeField('a@b.es', 'a@b.es'), 'a@b.es', 'texto plano sin cambios sigue siendo ese texto');
A.eq(writeField('c@d.es', 'a@b.es'), 'c@d.es', 'texto plano editado se actualiza');
A.eq(writeField('nuevo@x.es', undefined), 'nuevo@x.es', 'un campo que estaba vacío se rellena');
A.eq(writeField('nuevo@x.es', null), 'nuevo@x.es', 'idem si estaba a null');
A.eq(writeField('', ''), '', 'vacío a vacío no inventa nada');

// --- 4. Formas desconocidas: se respetan, no se destruyen ---
const raro = { algo: 1 };
A.eq(writeField('texto', raro), raro, 'un objeto sin clave `valor` se devuelve tal cual');
A.eq(JSON.stringify(writeField('', { valor: null })), JSON.stringify({ valor: null }),
     'un objeto con valor null tampoco se aplana');

// --- 5. Las dos rutas de guardado del detalle lo usan ---
const det = fs.readFileSync(path.join(__dirname, '../../../redesign/screens/detail.js'), 'utf8');
['phone', 'email', 'web', 'address'].forEach(function (campo) {
  const re = new RegExp('U\\.writeField\\([^)]*' + campo + '|' + campo + ':\\s*U\\.writeField');
  A.truthy(re.test(det), 'detail.js escribe `' + campo + '` a través de U.writeField');
});
A.eq((det.match(/U\.writeField\(/g) || []).length, 8,
     'las dos rutas de guardado (guardarFicha y saveContact) cubren los 4 campos');

const s = A.summary();
console.log(JSON.stringify(s));
process.exit(s.failed > 0 ? 1 : 0);
