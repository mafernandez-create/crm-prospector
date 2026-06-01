// Unit tests para el detector de referencias cruzadas (_REFCRUZ_PATRONES).
// Texto sintético en fixtures/sample-text.txt contiene menciones tipo
// CCRR, AAPP, INFRA, CICA, EMPRESA y autorreferencia que debe descartarse.

const fs   = require('fs');
const path = require('path');
const A    = require('../_lib/assert');
const { extractReferenciasFromText } = require('../_lib/crm-modules');

A.reset();

const text = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'sample-text.txt'), 'utf8');
// Studio "Demo Ingeniería Hidráulica" para verificar descarte de autorreferencia
const refs = extractReferenciasFromText(text, 'Estudio Demo Ingeniería Hidráulica');

// 1) Se detectan CCRR
const ccrr = refs.filter(r => r.tipo === 'CCRR');
A.greaterThan(ccrr.length, 0, 'CCRR: se detecta al menos una comunidad de regantes en el texto');

// 2) Se detectan AAPP (Ayuntamiento, Diputación, Junta, Confederación)
const aapp = refs.filter(r => r.tipo === 'AAPP');
A.greaterThan(aapp.length, 1, 'AAPP: se detectan ≥2 referencias (Ayuntamiento + Diputación + …)');

// 3) Se detectan INFRA (EDAR, ETAP, Desaladora)
const infra = refs.filter(r => r.tipo === 'INFRA');
A.greaterThan(infra.length, 1, 'INFRA: se detectan ≥2 (EDAR Lucena + ETAP Pozoblanco + Desaladora)');

// 4) Se detectan CICA (Aqualia, EMASESA, Aguas de…)
const cica = refs.filter(r => r.tipo === 'CICA');
A.greaterThan(cica.length, 0, 'CICA: al menos una empresa del ciclo del agua detectada');

// 5) Provincia inferida (al menos uno con provincia)
const conProv = refs.filter(r => r.provinciaInferida);
A.greaterThan(conProv.length, 0, 'Provincia: al menos una referencia con provincia inferida del contexto');

// 6) Autorreferencia: si el texto cita al propio estudio, NO debe aparecer
const autoText = text + ' En la misma página aparece Estudio Demo Ingeniería Hidráulica como autor.';
const refsAuto = extractReferenciasFromText(autoText, 'Estudio Demo Ingeniería Hidráulica');
const autoRef = refsAuto.find(r => r.nombre.toLowerCase().includes('demo ingenier'));
A.falsy(autoRef, 'Autorreferencia: el propio nombre del studio queda descartado');

const s = A.summary();
console.log(JSON.stringify(s));
process.exit(s.failed > 0 ? 1 : 0);
