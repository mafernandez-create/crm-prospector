// Test de PARIDAD de scoring: el espejo de tests (_lib/crm-modules.js) debe
// producir EXACTAMENTE lo mismo que la fuente de producción (batch-qualify/
// scoring.mjs) para cada fixture. Si divergen, salta en rojo → evita que los
// tests validen una lógica que ya no corre en producción.
//
// crm-modules.js es CommonJS (require); scoring.mjs es ESM (import dinámico).

const A = require('../_lib/assert');
const { calculateScoringV2: scoreMirror } = require('../_lib/crm-modules');

const YEAR = new Date().getFullYear();
const TODAY = new Date().toISOString().slice(0, 10);

// Campos de scoring que AMBAS copias deben devolver idénticos.
const FIELDS = [
  'priorityDirect', 'priorityDirectScore', 'priorityDirectScoreNatural',
  'priorityNetwork', 'priorityNetworkScore',
  'esCandidatoPuente', 'puenteActivo',
  'priorityQuadrant', 'priorityQuadrantName', 'priorityRecommendedAction',
  'engagementScore', 'scoringConfianza', 'directDistanceToNext',
];

// Batería de fixtures: cubre engagement, puente activo, candidato puente,
// datos escasos (confianza) y un caso fuerte.
const FIXTURES = [
  {
    label: 'plano-sin-engagement',
    studio: { type: 'ingenieria', data: {
      projects: [{ name: 'EDAR', type: 'depuradora', year: YEAR }],
      contact: { phone: '900', email: 'a@b.es' }, studio: { employees: '25' } } },
  },
  {
    label: 'engaged-arquitecto',
    studio: { type: 'arquitectura', data: {
      projects: [{ name: 'saneamiento', type: 'colector', year: YEAR }],
      contact: { phone: '900', email: 'a@b.es' },
      reports: [{ date: TODAY, probabilidad_cierre_pct: 70,
                  fecha_proxima_visita: (YEAR + 1) + '-01-01', proxima_accion: 'enviar ficha BC3' }] } },
  },
  {
    label: 'engaged-temperatura',
    studio: { type: 'ingenieria', data: {
      projects: [{ name: 'riego', type: 'regadío', location: 'Málaga', year: YEAR }],
      activities: [{ date: TODAY }],
      reports: [{ date: TODAY, temperatura: 4, compromisos: { por_nuestra_parte: ['muestra'] } }] } },
  },
  {
    label: 'puente-activo',
    studio: { type: 'ingenieria', es_cliente_puente: true, data: {
      projects: [
        { name: 'CCRR Genil', type: 'regant', location: 'Córdoba' },
        { name: 'EDAR', type: 'edar', location: 'Sevilla' },
        { name: 'P3', type: '', location: 'Málaga' },
        { name: 'P4', type: '', location: 'Granada' },
        { name: 'P5', type: '', location: 'Huelva' } ] } },
  },
  {
    label: 'candidato-puente-aapp',
    studio: { type: 'aapp', data: {
      projects: [
        { name: 'Ayuntamiento de Lucena', type: 'infraestructura', location: 'Córdoba' },
        { name: 'Diputación de Jaén', type: 'consorcio', location: 'Jaén' },
        { name: 'CCRR Genil-Cabra', type: 'regant', location: 'Córdoba' },
        { name: 'Red saneamiento', type: 'edar', location: 'Sevilla' },
        { name: 'Urbanización', type: 'urbanización', location: 'Málaga' } ] } },
  },
  {
    label: 'datos-escasos',
    studio: { type: 'promotora', data: {} },
  },
];

(async () => {
  const { calculateScoringV2: scoreSource } = await import('../../batch-qualify/scoring.mjs');
  for (const fx of FIXTURES) {
    const m = scoreMirror(fx.studio);
    const s = scoreSource(fx.studio);
    for (const f of FIELDS) {
      A.eq(m[f], s[f], `${fx.label} · ${f}`);
    }
  }
  const out = A.summary();
  console.log(JSON.stringify(out));
  process.exit(out.failed > 0 ? 1 : 0);
})();
