/* eslint-disable */
// ──────────────────────────────────────────────────────────────────────
// Relevancia de una adjudicacion PLACSP para el CRM (29-sep-2026)
//
// El CPV solo no basta: los organos de contratacion codifican mal (una
// "reparacion de aerotermia" con 45232100, "mantenimiento de centrales" con
// 45252200) y el 71300000 "servicios de ingenieria" lo lleva igual una
// recogida de residuos que un control de calidad de estructuras. Regla:
//   1. Tiene que tener al menos un CPV de la lista (como antes).
//   2. Si el titulo delata otra cosa (electricidad, telecos, climatizacion,
//      ascensores, limpieza...) y NO habla de agua, fuera.
//   3. Si solo entra por CPV de ingenieria (713...), el titulo tiene que hablar
//      de agua, redes o urbanizacion; si no, es ingenieria de otra cosa.
// ──────────────────────────────────────────────────────────────────────

// Fuera 45231400 (lineas electricas) y 45232300 (lineas telefonicas y de
// comunicaciones): metian Elecnor fibra, soterramientos de media tension...
const CPV_RELEVANTES = [
  '71300000','71310000','71311000','71320000','71321000','71322000',
  '45232000','45232100','45232120','45232150','45232400',
  '45231100','45231110','45231300',
  '45240000','45252100','45252200',
];

function sinAcentos(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Agua de verdad (castellano, catalan, gallego).
const RX_AGUA = new RegExp([
  'agua', 'aigua', 'auga', 'abastec', 'abastim', 'saneam', 'sanejament', 'alcantarill', 'clavegueram',
  'depura', 'edar', 'etap', 'edam', 'desalad', 'potabiliz', 'colector', 'emisario', 'pluvial',
  'residuales', 'riego', 'regadio', 'hidraul', 'hidric', 'tuberi', 'canonad', 'conduccion de a',
  'red de distrib', 'bombeo', 'impulsion', 'deposito', 'embalse', 'balsa', 'drenaje', 'inundab',
  'cauce', 'ciclo integral',
].join('|'));

// Redes y urbanizacion: bastan para una ingenieria, no para salvar un titulo
// que ya dice "electrica" o "fibra" (una canalizacion puede ser de cables).
const RX_URBANO = new RegExp([
  'canaliza', 'conduccio', 'xarxa', 'rede de', 'redes', 'urbaniza', 'reurbaniza', 'vial', 'calle',
  'avenida', 'plaza', 'infraestructura', 'obra civil', 'pozo',
].join('|'));

// Titulos que delatan otra cosa aunque el CPV diga agua.
const RX_OTRA_COSA = new RegExp([
  'electric', 'electri', 'baja tension', 'media tension', 'alta tension', 'alumbrado', 'fotovolt',
  'fibra optica', 'telecomunic', 'telefon', 'aerotermia', 'climatiza', 'calefacc', 'ascensor',
  'elevador', 'contraincend', 'contra incend', 'limpieza', 'vigilancia y seguridad', 'seguridad privada',
  'plagas', 'jardineria', 'residuos', 'recogida de', 'mobiliario', 'software', 'licencia',
  'comite cientific', 'eventos', 'formacion', 'optomecanica', 'balizas',
].join('|'));

function tieneCpv(a) {
  return (a.cpvCodes || []).some(c => CPV_RELEVANTES.includes(c));
}

function soloIngenieria(a) {
  const rel = (a.cpvCodes || []).filter(c => CPV_RELEVANTES.includes(c));
  return rel.length > 0 && rel.every(c => c.startsWith('713'));
}

// Devuelve { ok, motivo } para poder contar por que se cae cada una.
function evaluar(a) {
  if (!tieneCpv(a)) return { ok: false, motivo: 'cpv' };
  const t = sinAcentos(a.title);
  const agua = RX_AGUA.test(t);
  if (RX_OTRA_COSA.test(t) && !agua) return { ok: false, motivo: 'otra_cosa' };
  if (soloIngenieria(a) && !agua && !RX_URBANO.test(t)) return { ok: false, motivo: 'ingenieria_sin_agua' };
  return { ok: true, motivo: '' };
}

function filtrarRelevantes(adjudicaciones) {
  const caidas = { cpv: 0, otra_cosa: 0, ingenieria_sin_agua: 0 };
  const ok = [];
  for (const a of adjudicaciones) {
    const r = evaluar(a);
    if (r.ok) ok.push(a); else caidas[r.motivo]++;
  }
  return { ok, caidas };
}

module.exports = { CPV_RELEVANTES, evaluar, filtrarRelevantes, sinAcentos };
