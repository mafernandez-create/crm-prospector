// =========================================================================
// scoring.mjs — Port 1:1 de gasCalculateScoringV2 (gas-batch-qualify.gs:80)
// Bloque 7.x del spec v1.1. NO MODIFICAR sin actualizar también el código
// client-side (index.html ~6075) y el GAS legacy (gas-batch-qualify.gs:80).
// =========================================================================

const TIPO_LEGACY_MAP = {
  arquitectura: 'ARQ', ingenieria: 'ING',
  promotora: 'OCV', constructora: 'OCV',
  aapp: 'AAPP', aguas: 'CICA', regantes: 'CCRR', concesionaria: 'CONC',
  almacen: 'almacen', colegio_profesional: 'colegio_profesional', otros: 'otros'
};

const SV2_QUADRANT_MAP = {
  'Alto_Alta': 1,  'Alto_Media': 2,  'Alto_Baja': 3,
  'Medio_Alta': 4, 'Medio_Media': 5, 'Medio_Baja': 6,
  'Bajo_Alta': 7,  'Bajo_Media': 8,  'Bajo_Baja': 9,
};

const SV2_QUADRANT_NAMES = {
  1: 'Estratégico',       2: 'Cliente core',     3: 'Cliente volumen',
  4: 'Puerta de entrada', 5: 'Cartera estándar', 6: 'Mantenimiento',
  7: 'Conector',          8: 'Seguimiento ligero', 9: 'Congelar',
};

const SV2_ACTIONS = {
  1: 'Visita trimestral. Cuenta clave. Profundizar relación y cartografiar red.',
  2: 'Visita trimestral. Comercial técnico. Mantener prescripción y detectar proyectos nuevos.',
  3: 'Visita semestral. Técnico-comercial. Sostener volumen.',
  4: 'Visita semestral. Exploratorio. Extraer info de cartera, identificar 2-3 targets accesibles a través de él.',
  5: 'Visita anual o en ruta. Mantener relación y captar cambios.',
  6: 'Contacto anual telefónico. Visita solo si pasa por zona.',
  7: 'Visita solo si en ruta a otro cliente A/B. Contacto cordial sin pitch.',
  8: 'Contacto telefónico anual. Confirmar vigencia.',
  9: 'Sin contacto programado. Re-evaluación a 18 meses.',
};

const GPF_FIT_FAMILIES = [
  ['evacuacion_mute',    ['evacuación','bajante','saneamiento pvc','insonori','acústic']],
  ['red_saneamiento',    ['colector','alcantarillado','red saneamiento','edar','depuradora','saneamiento']],
  ['riego_biopipe',      ['riego','regadío','pvc-o','pe100','conducción agua','biorientado']],
  ['abastecimiento',     ['abastecimiento','agua potable','red distribución','captación']],
  ['pe_presion_gas',     ['polietileno','pe 100','gas pe','condusan','presión gas']],
];

const R2_TARGET_KWS = [
  'regant','regadío','regadio','comunidad de riego',
  'edar','depuradora','abastecimiento','saneamiento','agua potable',
  'red de aguas','red de saneamiento','red de abastecimiento','colector',
  'ayuntamiento','diputación','diputacion','consorcio','mancomunidad',
  'junta de','sector público','sector publico',
  'urbanización','urbanizacion','infraestructura','vial','autovía','autovia',
  'pavimentación','pavimentacion',
];

const R3_KWS = [
  'proveedor exclusivo','proveedor preferente','proveedor habitual',
  'colaborador habitual','partner exclusivo','partner preferente',
];

const AWARD_KWS = ['premio','bienal','award','finalista','reconoci','distinción','medalla','ganador'];
const TEACH_KWS = ['profesor','docente','universidad','cátedra','master','máster'];

const R5_ZONA_PROVS = [
  'málaga','malaga','sevilla','granada','almería','almeria','jaén','jaen','córdoba','cordoba','huelva','cádiz','cadiz',
  'cáceres','caceres','badajoz',
  'toledo','cuenca','ciudad real','albacete','guadalajara',
  'madrid',
  'alicante','valencia','castellón','castellon',
  'murcia',
  'islas baleares','baleares','palma',
  'las palmas','tenerife','santa cruz de tenerife',
  'ceuta','melilla',
];

// ── Helpers ──

function getValor(campo) {
  if (campo === null || campo === undefined) return '';
  if (typeof campo === 'string') return campo;
  if (typeof campo === 'object' && 'valor' in campo) return campo.valor || '';
  return '';
}

export function getTipoPrincipal(studio) {
  if (!studio || !studio.type) return 'ARQ';
  if (Array.isArray(studio.type)) return studio.type.length > 0 ? studio.type[0] : 'ARQ';
  return TIPO_LEGACY_MAP[studio.type] || studio.type;
}

// ── v2.1: helpers de engagement (informes/visitas) y confianza ──

function _todayISO() { return new Date().toISOString().slice(0, 10); }
function _daysBetween(isoA, isoB) {
  const a = new Date(isoA + 'T00:00:00Z').getTime();
  const b = new Date(isoB + 'T00:00:00Z').getTime();
  return Math.round((b - a) / 86400000);
}

function _reports(studio)    { return (studio.data && studio.data.reports)    || []; }
function _activities(studio) { return (studio.data && studio.data.activities) || []; }

function _lastInteractionISO(studio) {
  const ds = [];
  _reports(studio).forEach(r => { if (r && r.date) ds.push(String(r.date).slice(0, 10)); });
  _activities(studio).forEach(a => { if (a && a.date) ds.push(String(a.date).slice(0, 10)); });
  return ds.length ? ds.sort().pop() : null;
}

// EJE DIRECTO v2.1 — bloque ENGAGEMENT (tope +6). Valor real de la relación,
// extraído de los informes de visita. Defensivo: cada señal suma solo si hay dato.
function calculateEngagement(studio, todayISO) {
  let e = 0;
  // E1: visita reciente
  const last = _lastInteractionISO(studio);
  if (last) {
    const days = _daysBetween(last, todayISO);
    if (days <= 90) e += 2; else if (days <= 180) e += 1;
  }
  // Último informe por fecha
  const reps = _reports(studio).filter(r => r && r.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const lastRep = reps.length ? reps[reps.length - 1] : null;
  if (lastRep) {
    // E2: interés del cliente — probabilidad_cierre_pct (0-100) o temperatura (~1-5)
    const prob = Number(lastRep.probabilidad_cierre_pct);
    const temp = Number(lastRep.temperatura);
    if (!Number.isNaN(prob) && lastRep.probabilidad_cierre_pct != null) {
      if (prob >= 60) e += 2; else if (prob >= 30) e += 1;
    } else if (!Number.isNaN(temp) && lastRep.temperatura != null) {
      if (temp >= 4) e += 2; else if (temp >= 3) e += 1;
    }
    // E3: próxima visita agendada en el futuro
    const prox = lastRep.fecha_proxima_visita;
    if (prox && /^\d{4}-\d{2}-\d{2}/.test(String(prox)) && String(prox).slice(0, 10) >= todayISO) e += 1;
    // E4: advance / compromiso por nuestra parte
    const comp = lastRep.compromisos && lastRep.compromisos.por_nuestra_parte;
    const proxAcc = lastRep.proxima_accion && String(lastRep.proxima_accion).trim() && lastRep.proxima_accion !== '—';
    if ((Array.isArray(comp) && comp.length > 0) || proxAcc) e += 1;
  }
  return Math.min(e, 6);
}

// CONFIANZA v2.1 — completitud de datos que alimentan el scoring.
// Evita clasificar "con seguridad" a estudios casi sin datos.
function calculateConfianza(studio) {
  const data = studio.data || {};
  const contact = data.contact || {};
  const checks = [
    ((data.projects || []).length > 0),
    (!!getValor(contact.phone) || !!getValor(contact.email)),
    (!!studio.type),
    ((parseInt(getValor((data.studio || {}).employees), 10) || 0) > 0),
    ((data.reports || []).length > 0),
  ];
  const have = checks.filter(Boolean).length;
  if (have >= 4) return 'alta';
  if (have >= 2) return 'media';
  return 'baja';
}

// ── calculateScoringV2 — v2.1 (engagement + confianza). Fuente ÚNICA de la
//    fórmula: el cliente del rediseño solo LEE priorityQuadrant de Supabase. ──

export function calculateScoringV2(studio) {
  const data     = studio.data || {};
  const social   = data.social  || {};
  const contact  = data.contact || {};
  const team     = data.team    || [];
  const projects = data.projects || [];
  const tipoPpal = getTipoPrincipal(studio);

  // D1: Tipo de cliente
  let d1 = 0;
  if (tipoPpal === 'ARQ' || tipoPpal === 'ING') d1 = 3;
  else if (tipoPpal === 'OCV') d1 = 2;
  else if (['AAPP','CCRR','CICA','CONC'].includes(tipoPpal)) d1 = 1;

  // D2: Tamaño
  let d2 = 0;
  const empVal = parseInt(getValor((data.studio || {}).employees), 10) || 0;
  if (empVal > 0) {
    if (tipoPpal === 'OCV') {
      if (empVal >= 50) d2 = 3; else if (empVal >= 20) d2 = 2; else if (empVal >= 5) d2 = 1;
    } else {
      if (empVal >= 20) d2 = 3; else if (empVal >= 10) d2 = 2; else if (empVal >= 3) d2 = 1;
    }
  }

  // D3: Facturación (sin_dato_fiable hoy)
  const d3 = 0;

  // D4: Actividad reciente
  let d4 = 0, d4Recent = 0;
  const d4Cutoff = new Date(); d4Cutoff.setFullYear(d4Cutoff.getFullYear() - 1);
  for (const p of projects) {
    if (p.year && parseInt(p.year, 10) >= d4Cutoff.getFullYear()) d4Recent++;
    else if (p.date) {
      try { if (new Date(p.date) >= d4Cutoff) d4Recent++; } catch (_) {}
    }
  }
  const d4Effective = d4Recent > 0 ? d4Recent : Math.round(projects.length * 0.6);
  if (d4Effective >= 5) d4 = 3; else if (d4Effective >= 3) d4 = 2; else if (d4Effective >= 1) d4 = 1;

  // D5: Fit catálogo GPF
  let d5 = 0;
  const projText = projects.map(p => ((p.name||'') + ' ' + (p.type||'')).toLowerCase()).join(' ');
  let d5Fits = 0;
  for (const [, kws] of GPF_FIT_FAMILIES) {
    if (kws.some(kw => projText.includes(kw))) d5Fits++;
  }
  if ((tipoPpal === 'ARQ' || tipoPpal === 'ING') && projects.length > 0) d5Fits = Math.max(d5Fits, 1);
  if (d5Fits >= 3) d5 = 2; else if (d5Fits >= 1) d5 = 1;

  // D6: Contacto completo
  let d6 = 0, d6Pts = 0;
  if (getValor(contact.phone)   && getValor(contact.phone)   !== 'No encontrado') d6Pts++;
  if (getValor(contact.email)   && getValor(contact.email)   !== 'No encontrado') d6Pts++;
  if (getValor(contact.address) && getValor(contact.address) !== 'No encontrado') d6Pts++;
  if (getValor(contact.web)     && getValor(contact.web)     !== 'No encontrado') d6Pts++;
  if (team.some(t => t.isDecisionMaker)) d6Pts++;
  if (team.some(t => t.email && t.email !== 'No encontrado')) d6Pts++;
  if (team.some(t => t.linkedin && t.linkedin !== 'No encontrado')) d6Pts++;
  if (d6Pts >= 5) d6 = 2; else if (d6Pts >= 2) d6 = 1;

  // v2.1: D3 (facturación) retirado del cómputo — siempre fue 0 (sin dato fiable).
  // Se reactivará si algún día hay fuente de facturación. (d3 se mantiene declarado = 0.)
  const rawDirect = d1 + d2 + d4 + d5 + d6;

  // ── EJE 2: VALOR DE RED — R1+R2+R3+R4+R5 ──

  // R1: Tamaño de cartera detectable
  let r1 = 0;
  if      (projects.length >= 10) r1 = 2;
  else if (projects.length >=  5) r1 = 1.5;
  else if (projects.length >=  2) r1 = 1;

  // R2: Densidad GPF de la cartera
  let r2TargetCount = 0;
  for (const pj of projects) {
    const pt2 = ((pj.name||pj.nombre||'') + ' ' + (pj.type||pj.tipo||'') + ' ' + (pj.descripcion||pj.description||'')).toLowerCase();
    if (R2_TARGET_KWS.some(kw => pt2.includes(kw))) r2TargetCount++;
  }
  const r2Pct = projects.length > 0 ? (r2TargetCount / projects.length) : 0;
  let r2 = 0;
  if      (r2Pct >= 0.75)        r2 = 4;
  else if (r2Pct >= 0.50)        r2 = 3;
  else if (r2Pct >= 0.25)        r2 = 2;
  else if (r2TargetCount >= 1)   r2 = 1;

  // R3: Exclusividad
  let r3Text = (data.description || '').toLowerCase();
  for (const pj3 of projects) {
    r3Text += ' ' + ((pj3.name||pj3.nombre||'') + ' ' + (pj3.descripcion||pj3.description||'')).toLowerCase();
  }
  const r3Hits = R3_KWS.filter(kw => r3Text.includes(kw)).length;
  let r3 = 0;
  if      (r3Hits >= 2) r3 = 2;
  else if (r3Hits >= 1) r3 = 1;

  // R4: Posición referente
  const liFollowers = parseInt(String(getValor((social.linkedin || {}).followers) || '').replace(/[^0-9]/g, '') || '0', 10) || 0;

  let socialCount = 0;
  if (getValor((social.linkedin || {}).url))   socialCount++;
  if (getValor((social.instagram || {}).url))  socialCount++;
  if (getValor((social.twitter || {}).url))    socialCount++;

  let awardsHit = projects.some(p => {
    const pt = ((p.name||'') + (p.type||'')).toLowerCase();
    return AWARD_KWS.some(kw => pt.includes(kw));
  });
  if (!awardsHit) {
    const desc = (data.description || '').toLowerCase();
    awardsHit = AWARD_KWS.some(kw => desc.includes(kw));
  }

  const teachingHit = team.some(t => {
    const tx = ((t.role||'') + (t.bio||'')).toLowerCase();
    return TEACH_KWS.some(kw => tx.includes(kw));
  });

  let r4Signals = 0;
  if (liFollowers >= 1000)               r4Signals++;
  if (awardsHit)                          r4Signals++;
  if (teachingHit)                        r4Signals++;
  if (projects.length >= 10)              r4Signals++;
  if (socialCount >= 2 && liFollowers >= 500) r4Signals++;

  const r4 = r4Signals >= 4 ? 4 : r4Signals >= 2 ? 2 : 0;

  // R5: Diversidad geográfica
  const r5ProvsSet = new Set();
  for (const pj5 of projects) {
    const pt5 = ((pj5.location||'') + ' ' + (pj5.name||pj5.nombre||'') + ' ' + (pj5.descripcion||pj5.description||'')).toLowerCase();
    for (const pv of R5_ZONA_PROVS) {
      if (pt5.includes(pv)) r5ProvsSet.add(pv);
    }
  }
  let r5 = 0;
  if      (r5ProvsSet.size >= 3) r5 = 2;
  else if (r5ProvsSet.size >= 1) r5 = 1;

  // Spec §7.3
  const rawNetwork = r1 + r2 + r3 + r4 + r5;
  const priorityNetwork = rawNetwork >= 10 ? 'Alta' : rawNetwork >= 6 ? 'Media' : 'Baja';

  // CLIENTE PUENTE §7.2.1 — candidatura se evalúa sobre el directo "natural"
  // (sin engagement ni bonus), para no enmascarar perfiles bajos-pero-conectores.
  const esCandidatoPuente = rawDirect < 6 && rawNetwork >= 6 && projects.length >= 5;
  const puenteActivo = studio.es_cliente_puente === true;

  // v2.1: ENGAGEMENT (informes de visita) suma al eje directo — captura el valor
  // real de la relación, que antes el scoring ignoraba por completo.
  const engagementScore = calculateEngagement(studio, _todayISO());
  const rawDirectFinal = rawDirect + (puenteActivo ? 4 : 0) + engagementScore;
  const priorityDirect = rawDirectFinal >= 10 ? 'Alto' : rawDirectFinal >= 6 ? 'Medio' : 'Bajo';

  // v2.1: distancia al siguiente umbral del eje directo ("casi sube de cuadrante")
  const directDistanceToNext = priorityDirect === 'Alto' ? 0
    : (priorityDirect === 'Medio' ? Math.max(0, 10 - rawDirectFinal) : Math.max(0, 6 - rawDirectFinal));

  // v2.1: confianza por completitud de datos (evita clasificar a ciegas)
  const scoringConfianza = calculateConfianza(studio);

  // Cuadrante
  const priorityQuadrant = SV2_QUADRANT_MAP[priorityDirect + '_' + priorityNetwork] || 5;

  return {
    priorityDirect,
    priorityDirectScore: rawDirectFinal,
    priorityDirectScoreNatural: rawDirect,
    esCandidatoPuente,
    puenteActivo,
    priorityNetwork,
    priorityNetworkScore: rawNetwork,
    priorityQuadrant,
    priorityQuadrantName: SV2_QUADRANT_NAMES[priorityQuadrant],
    priorityRecommendedAction: SV2_ACTIONS[priorityQuadrant],
    // v2.1
    engagementScore,
    scoringConfianza,
    directDistanceToNext,
  };
}

// ── buildScoringV2Updates (con histórico) ──

export function buildScoringV2Updates(studio, trigger) {
  const v2 = calculateScoringV2(studio);
  const histEntry = {
    fecha: new Date().toISOString(),
    priorityDirect: v2.priorityDirect,
    priorityDirectScore: v2.priorityDirectScore,
    priorityNetwork: v2.priorityNetwork,
    priorityNetworkScore: v2.priorityNetworkScore,
    priorityQuadrant: v2.priorityQuadrant,
    trigger: trigger || 'github_actions',
  };
  const prevHistory = Array.isArray(studio.scoringHistory) ? studio.scoringHistory : [];
  const newHistory = prevHistory.concat([histEntry]).slice(-20);
  const updates = { ...v2 };
  updates.es_candidato_puente = v2.esCandidatoPuente;
  updates.scoringHistory = newHistory;
  return updates;
}
