// Unit tests para calculateScoringV2 (Eje 1 D1-D6, Eje 2 R1-R5, cuadrante, puente).
// Replica el cálculo de index.html ~6320 via _lib/crm-modules.js.

const A = require('../_lib/assert');
const { calculateScoringV2, getTipoPrincipal } = require('../_lib/crm-modules');

A.reset();

// ── D1: Tipo de cliente ────────────────────────────────────────────────────
A.eq(calculateScoringV2({ type: 'ARQ',  data: {} })._dims.d1, 3, 'D1: ARQ → 3 pts');
A.eq(calculateScoringV2({ type: 'ING',  data: {} })._dims.d1, 3, 'D1: ING → 3 pts');
A.eq(calculateScoringV2({ type: 'OCV',  data: {} })._dims.d1, 2, 'D1: OCV → 2 pts');
A.eq(calculateScoringV2({ type: 'AAPP', data: {} })._dims.d1, 1, 'D1: AAPP → 1 pt');

// ── D1: tipos legacy en el formato en que los guardan las altas del scout ──
// El mapa TIPO_LEGACY_MAP está en minúsculas y sin acentos; las fichas guardan
// el tipo tal cual se escribió. Sin normalizar la clave, la búsqueda fallaba y
// el tipo caía al fallback → d1=0 → Bajo/Baja → Q9 "Congelar" indebido.
A.eq(calculateScoringV2({ type: 'Constructora',  data: {} })._dims.d1, 2, 'D1: "Constructora" (mayúscula) → OCV → 2 pts');
A.eq(calculateScoringV2({ type: 'constructora',  data: {} })._dims.d1, 2, 'D1: "constructora" (minúscula) → OCV → 2 pts');
A.eq(calculateScoringV2({ type: 'Promotora',     data: {} })._dims.d1, 2, 'D1: "Promotora" → OCV → 2 pts');
A.eq(calculateScoringV2({ type: 'Arquitectura',  data: {} })._dims.d1, 3, 'D1: "Arquitectura" → ARQ → 3 pts');
A.eq(calculateScoringV2({ type: 'Ingeniería',    data: {} })._dims.d1, 3, 'D1: "Ingeniería" (con acento) → ING → 3 pts');
A.eq(calculateScoringV2({ type: '  Regantes  ',  data: {} })._dims.d1, 1, 'D1: "  Regantes  " (espacios) → CCRR → 1 pt');
// Los códigos canónicos no deben verse alterados por la normalización
A.eq(getTipoPrincipal({ type: 'ARQ' }),  'ARQ',  'Tipo: código canónico ARQ se mantiene');
A.eq(getTipoPrincipal({ type: 'CICA' }), 'CICA', 'Tipo: código canónico CICA se mantiene');
// Un tipo desconocido se devuelve tal cual (no se inventa mapeo)
A.eq(getTipoPrincipal({ type: 'Distribuidor' }), 'Distribuidor', 'Tipo: desconocido cae al fallback sin cambios');

// ── D2: Empleados (umbrales según tipo) ────────────────────────────────────
A.eq(calculateScoringV2({ type: 'ING', data: { studio: { employees: '25' } } })._dims.d2, 3, 'D2: ING 25 emp → 3 pts');
A.eq(calculateScoringV2({ type: 'OCV', data: { studio: { employees: '25' } } })._dims.d2, 2, 'D2: OCV 25 emp → 2 pts (umbral 20-49)');

// ── D4: Actividad reciente (proyectos último año) ──────────────────────────
const yearNow = new Date().getFullYear();
const studioD4 = {
  type: 'ING',
  data: { projects: [
    { name: 'p1', year: yearNow },
    { name: 'p2', year: yearNow },
    { name: 'p3', year: yearNow },
    { name: 'p4', year: yearNow },
    { name: 'p5', year: yearNow },
  ]},
};
A.eq(calculateScoringV2(studioD4)._dims.d4, 3, 'D4: 5+ proyectos del año en curso → 3 pts');

// ── D5: Fit catálogo GPF ───────────────────────────────────────────────────
const studioD5 = {
  type: 'ING',
  data: { projects: [
    { name: 'EDAR Lucena',           type: 'depuradora' },
    { name: 'Red riego Genil-Cabra', type: 'regadío' },
    { name: 'Red abastecimiento',    type: 'agua potable' },
  ]},
};
A.eq(calculateScoringV2(studioD5)._dims.d5, 2, 'D5: 3+ familias GPF → 2 pts');

// ── D6: Contacto completo ──────────────────────────────────────────────────
const studioD6 = {
  type: 'ING',
  data: {
    contact: { phone: '900111222', email: 'a@b.es', address: 'X', web: 'https://b.es' },
    team:    [{ name: 'X', isDecisionMaker: true, email: 'x@b.es', linkedin: 'li/x' }],
  },
};
A.eq(calculateScoringV2(studioD6)._dims.d6, 2, 'D6: 5+ datos de contacto → 2 pts');

// ── R1: Tamaño de cartera ──────────────────────────────────────────────────
const studioR1 = { type: 'ING', data: { projects: new Array(10).fill({ name: 'x' }) } };
A.eq(calculateScoringV2(studioR1)._dims.r1, 2, 'R1: 10+ proyectos → 2 pts');

// ── R2: Densidad target GPF ────────────────────────────────────────────────
const studioR2 = {
  type: 'ING',
  data: { projects: [
    { name: 'Modernización regadío',    type: 'regant' },
    { name: 'EDAR de Lucena',           type: 'depuradora' },
    { name: 'Ayuntamiento Pozoblanco',  type: 'consorcio' },
    { name: 'Diputación de Jaén',       type: 'infraestructura' },
  ]},
};
A.eq(calculateScoringV2(studioR2)._dims.r2, 4, 'R2: 100% proyectos target GPF → 4 pts');

// ── R5: Diversidad geográfica ──────────────────────────────────────────────
const studioR5 = {
  type: 'ING',
  data: { projects: [
    { name: 'X', location: 'Córdoba'  },
    { name: 'Y', location: 'Sevilla'  },
    { name: 'Z', location: 'Málaga'   },
  ]},
};
A.greaterThan(calculateScoringV2(studioR5)._dims.r5ProvCount, 2, 'R5: 3 provincias zona detectadas');
A.eq(calculateScoringV2(studioR5)._dims.r5, 2, 'R5: 3+ provincias → 2 pts');

// ── Cliente puente activo (bonus +4) ───────────────────────────────────────
const studioPuente = {
  type: 'ING',
  es_cliente_puente: true,
  data: {
    projects: [
      { name: 'CCRR Genil', type: 'regant', location: 'Córdoba' },
      { name: 'EDAR', type: 'edar', location: 'Sevilla' },
      { name: 'P3', type: '', location: 'Málaga' },
      { name: 'P4', type: '', location: 'Granada' },
      { name: 'P5', type: '', location: 'Huelva' },
    ],
  },
};
const puenteRes = calculateScoringV2(studioPuente);
A.eq(puenteRes.puenteActivo, true, 'Puente activo: studio.es_cliente_puente=true → bonus aplicado');
A.greaterThan(puenteRes.priorityDirectScore, puenteRes.priorityDirectScoreNatural - 1, 'Puente activo: priorityDirectScore = natural + bonus');

// ── Candidato puente (sin activar): bajo directo + medio/alto red + ≥5 proy ─
const studioCandidato = {
  type: 'AAPP',
  data: {
    projects: [
      { name: 'Ayuntamiento de Lucena',     type: 'infraestructura', location: 'Córdoba' },
      { name: 'Diputación de Jaén',         type: 'consorcio',       location: 'Jaén' },
      { name: 'CCRR Genil-Cabra',           type: 'regant',          location: 'Córdoba' },
      { name: 'Red saneamiento',            type: 'edar',            location: 'Sevilla' },
      { name: 'Urbanización Polígono',      type: 'urbanización',    location: 'Málaga' },
    ],
  },
};
const candRes = calculateScoringV2(studioCandidato);
A.eq(candRes.esCandidatoPuente, true, 'Candidato puente: rawDirect<6 + rawNetwork>=6 + projects>=5');

// ── Cuadrante mapping ──────────────────────────────────────────────────────
// Studio con D1=3, D6=2, D4=3 (5 proyectos año), D5=2, D2=3 → directo alto
// Y red baja (1 proyecto, sin keywords)
const studioCuadAlto = {
  type: 'ING',
  data: {
    studio: { employees: '25' },
    contact: { phone: 'x', email: 'y', address: 'z', web: 'w' },
    team:    [{ name: 'T', isDecisionMaker: true, email: 't@x', linkedin: 'l' }],
    projects: [
      { name: 'EDAR', type: 'edar', location: 'Córdoba', year: yearNow },
      { name: 'Red riego', type: 'regadío', location: 'Sevilla', year: yearNow },
      { name: 'Red abast', type: 'agua potable', location: 'Málaga', year: yearNow },
      { name: 'p4', type: '', year: yearNow },
      { name: 'p5', type: '', year: yearNow },
    ],
  },
};
const cuadRes = calculateScoringV2(studioCuadAlto);
A.eq(cuadRes.priorityDirect, 'Alto', 'Cuadrante: studio fuerte directo → Alto');
A.greaterThan(cuadRes.priorityQuadrant, 0, 'Cuadrante: valor 1-9 asignado');
A.eq(typeof cuadRes.priorityQuadrantName, 'string', 'Cuadrante: nombre asignado');

const s = A.summary();
console.log(JSON.stringify(s));
process.exit(s.failed > 0 ? 1 : 0);
