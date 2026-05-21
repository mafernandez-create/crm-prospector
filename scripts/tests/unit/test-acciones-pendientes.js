// Unit tests para detector de acciones pendientes (_ACCION_TIPOS) y plazos.
// 4 tipos: 📱 llamada · 📧 email · 📦 material · 📅 reunión + cálculo de plazo.

const fs   = require('fs');
const path = require('path');
const A    = require('../_lib/assert');
const { detectAccionesEnTexto, _accionDetectarPlazo } = require('../_lib/crm-modules');

A.reset();

const text = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'sample-text.txt'), 'utf8');
const acciones = detectAccionesEnTexto(text);

// Helper: ¿hay al menos una acción de este tipo?
const has = (tipo) => acciones.some(a => a.tipo === tipo);

A.truthy(has('llamada'),  'Llamada: detecta "llamar al cliente en 48-72h"');
A.truthy(has('email'),    'Email: detecta "enviar documentación técnica"');
A.truthy(has('material'), 'Material: detecta "entregar la muestra de tubo PVC-O"');
A.truthy(has('reunion'),  'Reunión: detecta "concertar una reunión técnica"');

// Plazo 48-72h
const baseDate = '2025-12-01';
const p1 = _accionDetectarPlazo('Llamar al cliente en 48-72h para confirmar interés', baseDate);
A.truthy(p1.fechaLimite, 'Plazo 48-72h: detecta y devuelve fechaLimite');
A.contains(p1.plazoTexto || '', 'horas', 'Plazo 48-72h: plazoTexto incluye "horas"');

// Plazo "16 de diciembre"
const p2 = _accionDetectarPlazo('Concertar una reunión técnica con el director de proyectos para el 16 de diciembre', baseDate);
A.eq(p2.fechaLimite, '2025-12-16', 'Plazo fecha explícita: "16 de diciembre" → 2025-12-16');

const s = A.summary();
console.log(JSON.stringify(s));
process.exit(s.failed > 0 ? 1 : 0);
