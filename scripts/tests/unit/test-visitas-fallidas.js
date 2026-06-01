// Unit tests para detector de visitas fallidas (_NOVISITA_PATRONES).
// 6 motivos: ausente, reunido, olvido, persona_inadecuada, no_realizada, volver.

const fs   = require('fs');
const path = require('path');
const A    = require('../_lib/assert');
const { detectVisitasFallidasEnTexto } = require('../_lib/crm-modules');

A.reset();

const text  = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'sample-text.txt'), 'utf8');
const items = detectVisitasFallidasEnTexto(text);
const has   = (motivo) => items.some(it => it.motivo === motivo);

A.truthy(has('ausente'),            'Ausente: detecta "no estaba en la oficina / fuera de la oficina"');
A.truthy(has('reunido'),            'Reunido: detecta "estaba reunido con otro cliente"');
A.truthy(has('olvido'),             'Olvido: detecta "se le había olvidado nuestra cita previa"');
A.truthy(has('persona_inadecuada'), 'Persona inadecuada: detecta "la persona adecuada no estaba" / "atendió una administrativa"');
A.truthy(has('no_realizada'),       'No realizada: detecta "No pudimos realizar la visita" / "visita fallida"');
A.truthy(has('volver'),             'Volver: detecta "Quedamos en volver"');

const s = A.summary();
console.log(JSON.stringify(s));
process.exit(s.failed > 0 ? 1 : 0);
