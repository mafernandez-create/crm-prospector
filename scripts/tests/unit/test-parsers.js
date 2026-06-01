// Unit tests para parsers comunes: getValor (legacy/objeto), unwrap Firestore,
// y _extractDocxText vía mock síntetico (sin descargar docx reales).

const A = require('../_lib/assert');
const { getValor } = require('../_lib/crm-modules');
const { unwrap, docFieldsToObj } = require('../_lib/firestore');

A.reset();

// getValor: variantes
A.eq(getValor('texto'),               'texto', 'getValor: string plano legacy');
A.eq(getValor({ valor: 'texto' }),    'texto', 'getValor: objeto con valor');
A.eq(getValor(null),                  '',      'getValor: null devuelve string vacío');
A.eq(getValor(undefined),             '',      'getValor: undefined devuelve string vacío');
A.eq(getValor({ valor: null }),       '',      'getValor: objeto con valor null devuelve string vacío');

// unwrap: tipos primitivos Firestore
A.eq(unwrap({ stringValue:  'foo' }), 'foo', 'unwrap: stringValue');
A.eq(unwrap({ integerValue: '42'  }), 42,    'unwrap: integerValue (string → int)');
A.eq(unwrap({ booleanValue: true  }), true,  'unwrap: booleanValue');
A.eq(unwrap({ nullValue:    null  }), null,  'unwrap: nullValue');

// unwrap: array y map anidados
const fields = {
  name:    { stringValue: 'Demo S.L.' },
  score:   { integerValue: '7' },
  tags:    { arrayValue: { values: [{ stringValue: 'a' }, { stringValue: 'b' }] } },
  contact: { mapValue: { fields: { phone: { stringValue: '900' } } } },
};
const obj = docFieldsToObj(fields);
A.eq(obj.name,    'Demo S.L.', 'docFieldsToObj: campo string');
A.eq(obj.score,   7,           'docFieldsToObj: campo int');
A.eq(obj.tags,    ['a','b'],   'docFieldsToObj: campo array de strings');
A.eq(obj.contact.phone, '900', 'docFieldsToObj: campo map anidado');

const s = A.summary();
console.log(JSON.stringify(s));
process.exit(s.failed > 0 ? 1 : 0);
