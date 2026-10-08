/* eslint-disable */
// ──────────────────────────────────────────────────────────────────────
// Licitaciones «interesantes» del PLACSP Monitor → crm-prospector (8-oct-2026)
//
// Logica pura (sin red) para poder probarla: cruce del organo de contratacion
// con la cartera y conversion de cada licitacion en fila de
// public.placsp_interesantes. La red esta en scripts/placsp-interesantes.js.
//
// El organo llega como «Alcaldía del Ayuntamiento de Lloseta», «Junta de
// Gobierno Local del Ayuntamiento de Laredo», «Consejo de Administración de
// EMAYA…»: el cargo que firma va delante de la entidad. Se quita ese cargo y se
// compara el resto, normalizado, con el nombre de las fichas. Solo coincidencia
// exacta: un falso cruce manda a Manolo a la ficha equivocada; uno que falta
// solo deja la licitacion sin enlace.
// ──────────────────────────────────────────────────────────────────────

const CARGOS = [
  'junta de gobierno local', 'junta de gobierno',
  'presidencia del consejo de administracion', 'presidencia',
  'vicepresidencia del consejo de administracion', 'vicepresidencia',
  'consejo de administracion', 'consejero delegado', 'consejera delegada',
  'consejeria delegada', 'direccion general', 'direccion gerente', 'director general',
  'director gerente', 'gerencia', 'comite ejecutivo', 'comision ejecutiva',
  'apoderado mancomunado', 'apoderados mancomunados', 'alcaldia', 'pleno',
  'intendente', 'secretaria general',
];
// «Junta» a secas solo como cargo de otra entidad («Junta de la Mancomunidad…»):
// «Junta de Andalucía» es la entidad y no se toca.
const RX_CARGO = new RegExp('^(?:la |el )?(?:(?:' + CARGOS.join('|') + ') (?:de la |de los |de las |del |de )|junta (?:de la |de los |de las |del ))', 'i');

function sinAcentos(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Misma limpieza de formas societarias que placsp-fetch.js, mas acentos y «ayto.».
function normalizar(nombre) {
  if (!nombre) return '';
  return sinAcentos(nombre).toLowerCase()
    .replace(/\bayto\.?(?=\s)/g, 'ayuntamiento')
    .replace(/\b(s\.?l\.?|s\.?a\.?|s\.?l\.?u\.?|s\.?c\.?p\.?|s\.?m\.?e\.?|m\.?p\.?|sociedad limitada|sociedad an[oó]nima|sociedad cooperativa|ute|s\.?c\.?|c\.?b\.?)(?=[\s.,()]|$)/g, '')
    .replace(/[.,&\-_'"()¿?«»“”]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// «Alcaldía del Ayuntamiento de Lloseta» → «Ayuntamiento de Lloseta» (texto
// original, para enseñarlo). Quitar acentos de un texto NFC no cambia su
// longitud, asi que el corte hecho sobre la version sin acentos vale para el original.
function entidadLegible(organo) {
  let orig = String(organo || '').normalize('NFC').trim();
  // Puede haber dos cargos encadenados («Presidencia del Consejo de Administración de…»).
  for (let i = 0; i < 2; i++) {
    const m = sinAcentos(orig).toLowerCase().match(RX_CARGO);
    if (!m) break;
    orig = orig.slice(m[0].length);
  }
  return orig ? orig.charAt(0).toUpperCase() + orig.slice(1) : '';
}

// Lo mismo, normalizado para cruzar: «ayuntamiento de lloseta».
function entidadDelOrgano(organo) {
  return normalizar(entidadLegible(organo));
}

function indexarCartera(studios) {
  const idx = {};
  for (const s of studios || []) {
    const k = normalizar(s.name || '');
    if (k && !idx[k]) idx[k] = s.id;
  }
  return idx;
}

function buscarFicha(organo, idx) {
  const completo = normalizar(organo);
  if (completo && idx[completo]) return idx[completo];
  const entidad = entidadDelOrgano(organo);
  if (entidad && idx[entidad]) return idx[entidad];
  return null;
}

function fechaONull(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// Licitacion del contrato v1 del Monitor (crm_bridge.serializar) → fila.
// Sin primera_vez: la pone el default al insertar y el upsert no la pisa.
function aFila(lic, studioId, ahoraISO) {
  const presupuesto = lic.presupuesto_total != null ? lic.presupuesto_total : lic.presupuesto_sin_iva;
  return {
    monitor_id: lic.id,
    expediente: lic.expediente || null,
    titulo: (lic.titulo || '').slice(0, 500) || null,
    organo: lic.organo_contratacion || null,
    entidad: entidadLegible(lic.organo_contratacion) || null,
    estado: lic.estado || null,
    tipo_contrato: lic.tipo_contrato || null,
    presupuesto: presupuesto == null || isNaN(Number(presupuesto)) ? null : Number(presupuesto),
    fecha_presentacion: fechaONull(lic.fecha_presentacion),
    fecha_publicacion: fechaONull(lic.fecha_publicacion),
    lugar: lic.ubicacion_nombre || null,
    link: lic.link_licitacion || null,
    veredicto: lic.veredicto_comercial || null,
    veredicto_razon: lic.veredicto_razon || null,
    resumen_ia: lic.resumen_ia || null,
    marcada_at: fechaONull(lic.marcada_at),
    studio_id: studioId || null,
    vigente: true,
    actualizada: ahoraISO,
    datos: lic,
  };
}

module.exports = { normalizar, entidadLegible, entidadDelOrgano, indexarCartera, buscarFicha, aFila, sinAcentos };
