// Unit tests Bloque 8 §19.1 — cliente puente académico
// Cubre h1 (dominio universidad), h2 (tribunal), h3 (ponente sectorial), h4 (grupo/cátedra)
// y un control negativo.

const A = require('../_lib/assert');
const {
  _h1_dominioUniversitario,
  _h2_tribunalAcademico,
  _h3_ponenciaCongreso,
  _h4_grupoInvestigacion,
  evaluarPuenteAcademico,
} = require('../_lib/crm-modules');

A.reset();

// h1: dominio universitario
A.truthy(
  _h1_dominioUniversitario('https://www.uco.es/grupo/X', null).hit,
  'h1: uco.es detectada como dominio universitario'
);
A.truthy(
  _h1_dominioUniversitario(null, ['investigador@ual.es']).hit,
  'h1: ual.es en email enriquecido'
);
A.falsy(
  _h1_dominioUniversitario('https://prointec.es/', null).hit,
  'h1: PROINTEC (no universitario) NO debe hacer hit'
);

// h2: tribunal académico
const txtTribunal = 'Luis Pérez es presidente del tribunal de la oposición a cátedra de ingeniería hidráulica de la universidad.';
A.truthy(_h2_tribunalAcademico(txtTribunal).hit, 'h2: tribunal de oposición + ing hidráulica detectado');

// h3: ponencia congreso sectorial reciente
const txtPonente = 'Participó como ponente en el congreso AEDyR 2025 con una presentación sobre desalación inversa.';
A.truthy(_h3_ponenciaCongreso(txtPonente).hit, 'h3: ponente en AEDyR 2025 detectado');
const txtPonenteAntiguo = 'Fue ponente en el congreso AEDyR 2018';
A.falsy(_h3_ponenciaCongreso(txtPonenteAntiguo).hit, 'h3: ponente >24 meses NO debe hacer hit (sin 2024/25/26)');

// h4: grupo de investigación + cátedra
A.truthy(_h4_grupoInvestigacion('Pertenece al grupo AGR-228 de la Universidad de Córdoba (publicación 2025).').hit, 'h4: grupo AGR-228 detectado');
A.truthy(_h4_grupoInvestigacion('Dirige la cátedra del agua de la universidad.').hit, 'h4: cátedra del agua detectada');

// Control negativo integrado (sin evidencias)
const negRes = evaluarPuenteAcademico({
  title: 'PROINTEC ingeniería integral',
  snippet: 'Empresa privada con sede en Madrid, dedicada a proyectos de transporte.',
  url: 'https://prointec.es/',
}, []);
A.falsy(negRes.hit, 'Control negativo: PROINTEC no tiene evidencias académicas');

const s = A.summary();
console.log(JSON.stringify(s));
process.exit(s.failed > 0 ? 1 : 0);
