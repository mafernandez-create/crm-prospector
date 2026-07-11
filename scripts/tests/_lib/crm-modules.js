// Port Node-only de funciones críticas del CRM (index.html).
// Mantener en sincronía con las versiones del archivo monolito.
// Si una función diverge en producción, este módulo debe actualizarse.

// ── Constantes de tipo (index.html ~4935) ────────────────────────────────────
const TIPO_B2B_MAP = {
  ARQ: 'arquitectura', ING: 'ingenieria', OCV: 'constructora',
  AAPP: 'aapp', CCRR: 'regantes', CICA: 'aguas', CONC: 'concesionaria',
  colegio_profesional: 'colegio',
};
const TIPO_LEGACY_MAP = {
  arquitectura: 'ARQ', ingenieria: 'ING',
  promotora: 'OCV', constructora: 'OCV',
  aapp: 'AAPP', aguas: 'CICA', regantes: 'CCRR', concesionaria: 'CONC',
  almacen: 'almacen', colegio_profesional: 'colegio_profesional', otros: 'otros',
};

// ── Universidades y eventos (index.html ~4999/~5041) ─────────────────────────
const _UNIV_DOMAINS_ES = [
  '.edu','ac.es',
  'uco.es','ual.es','ujaen.es','ugr.es','us.es','upo.es','uca.es','uma.es','uhu.es','unia.es',
  'ucm.es','upm.es','uam.es','uc3m.es','urjc.es','uah.es','uned.es','ufv.es','comillas.edu','ie.edu','ceu.es','uax.es','uem.es','unav.edu','nebrija.es',
  'ub.edu','uab.cat','upc.edu','upf.edu','udg.edu','udl.cat','urv.cat','uoc.edu','uic.es','url.edu','uvic.cat',
  'uv.es','upv.es','ua.es','umh.es','uji.es','ucv.es',
  'usc.es','udc.es','uvigo.es',
  'ehu.eus','ehu.es','deusto.es','mondragon.edu',
  'usal.es','uva.es','uvalladolid.es','ubu.es','uemc.es','unileon.es',
  'uclm.es', 'unex.es', 'uniovi.es', 'unican.es', 'unavarra.es',
  'unirioja.es','unir.net', 'unizar.es',
  'um.es','upct.es','ucam.edu',
  'uib.es','uib.cat',
  'ulpgc.es','ull.es',
  'csic.es','ciemat.es','ieo.es','inia.es',
];

const _EVENTOS_SECTOR_KW = [
  'serea','seminario iberoamericano','feragua','federación comunidades regantes',
  'congreso nacional de comunidades de regantes','congreso nacional ccrr','fenacore',
  'aedyr','asociación española de desalación','congreso aedyr',
  'congreso nacional del agua','congreso del agua','world water',
  'iagua','cumbre inteligencia hídrica','foro agua','smagua','salón internacional del agua',
  'anci','asociación nacional constructores','ache','congreso hormigón estructural',
  'congreso iccp','congreso ciccp','congreso ingeniería civil',
  'aeryd','asociación española riegos y drenajes','tecnoambiente','siga','salón ciclo integral agua',
];

// ── Heurísticas Bloque 8 §19.1 ───────────────────────────────────────────────
function _h1_dominioUniversitario(url, webEmails) {
  const fuentes = [];
  if (typeof url === 'string') fuentes.push(url.toLowerCase());
  if (Array.isArray(webEmails)) webEmails.forEach(e => typeof e === 'string' && fuentes.push(e.toLowerCase()));
  for (const f of fuentes) {
    for (const d of _UNIV_DOMAINS_ES) {
      if (f.includes(d)) return { hit: true, evidencia: `dominio:${d}` };
    }
  }
  return { hit: false };
}

function _h2_tribunalAcademico(text) {
  if (!text || typeof text !== 'string') return { hit: false };
  const tribunalKW = /(presidente|vocal|secretari[oa]|miembro)\s+(del?\s+)?(tribunal|comisi[óo]n\s+evaluadora|comisi[óo]n\s+de\s+selecci[óo]n)/i;
  const oposicionKW = /(oposici[óo]n|plaza|concurso\s+(p[úu]blico|de\s+m[ée]ritos))/i;
  const ingenieriaKW = /(ingenier[íi]a\s+(hidr[áa]ulica|civil|agron[óo]mica|forestal|de\s+caminos|agroforestal)|cated[rí]a|universidad)/i;
  if (tribunalKW.test(text) && (oposicionKW.test(text) || ingenieriaKW.test(text))) {
    return { hit: true, evidencia: 'tribunal_academico' };
  }
  return { hit: false };
}

function _h3_ponenciaCongreso(text) {
  if (!text || typeof text !== 'string') return { hit: false };
  const t = text.toLowerCase();
  if (!/\b(2024|2025|2026)\b/.test(t)) return { hit: false };
  const ponenteKW = /(ponente|ponencia|conferenciante|moderador|keynote|panelista)/i;
  const eventoMatch = _EVENTOS_SECTOR_KW.find(kw => t.includes(kw));
  if (eventoMatch && ponenteKW.test(text)) return { hit: true, evidencia: `ponente_en_${eventoMatch}` };
  if (eventoMatch && /(participaci[óo]n|intervenci[óo]n|presentaci[óo]n|exposici[óo]n)/i.test(text)) {
    return { hit: true, evidencia: `presentacion_en_${eventoMatch}` };
  }
  return { hit: false };
}

function _h4_grupoInvestigacion(text) {
  if (!text || typeof text !== 'string') return { hit: false };
  const grupoCodigo = /grupo\s+(AGR|TEP|RNM|HUM|FQM|BIO|TIC|SEJ|CTS)[-\s]?\d{3,4}/i;
  const grupoTematico = /grupo\s+de\s+investigaci[óo]n\s+(en|del?|sobre)?\s*(hidr[áa]ulica|riego|regad[íi]o|agua|sostenibilidad\s+h[íi]drica|recursos\s+h[íi]dricos|saneamiento|depuraci[óo]n|edar)/i;
  const catedraAgua = /c[áa]tedra\s+(universitaria|de|del|del?)?\s*(agua|riego|hidr[áa]ulica|recursos\s+h[íi]dricos)/i;
  const yearRecent = /\b(2024|2025|2026)\b/.test(text);
  const publicacionKW = /(publicaci[óo]n|art[íi]culo|paper|investigaci[óo]n|tesis|doi|doi\.org|elsevier|scopus|wos|cited|citation)/i;
  if (grupoCodigo.test(text)) return { hit: true, evidencia: 'grupo_codigo' };
  if (catedraAgua.test(text)) return { hit: true, evidencia: 'catedra_agua' };
  if (grupoTematico.test(text) && (yearRecent || publicacionKW.test(text))) {
    return { hit: true, evidencia: 'grupo_tematico_publicacion' };
  }
  return { hit: false };
}

function evaluarPuenteAcademico(result, webEmails) {
  const text = ((result.title || '') + ' ' + (result.snippet || '')).trim();
  const evidencias = [];
  const h1 = _h1_dominioUniversitario(result.url, webEmails);
  if (h1.hit) evidencias.push('h1:' + h1.evidencia);
  const h2 = _h2_tribunalAcademico(text);
  if (h2.hit) evidencias.push('h2:' + h2.evidencia);
  const h3 = _h3_ponenciaCongreso(text);
  if (h3.hit) evidencias.push('h3:' + h3.evidencia);
  const h4 = _h4_grupoInvestigacion(text);
  if (h4.hit) evidencias.push('h4:' + h4.evidencia);
  return { hit: evidencias.length > 0, evidencias };
}

// ── Helpers de tipo y valor (index.html ~5135) ───────────────────────────────
function getTiposArray(studio) {
  if (!studio || !studio.type) return ['ARQ'];
  if (Array.isArray(studio.type)) return studio.type.length > 0 ? studio.type : ['ARQ'];
  const code = TIPO_LEGACY_MAP[studio.type] || studio.type;
  return [code];
}
function getTipoPrincipal(studio) { return getTiposArray(studio)[0]; }
function getValor(campo) {
  if (campo === null || campo === undefined) return '';
  if (typeof campo === 'string') return campo;
  if (typeof campo === 'object' && 'valor' in campo) return campo.valor ?? '';
  return '';
}

// ── Cuadrantes scoring v2 (index.html ~6298) ─────────────────────────────────
const _SV2_QUADRANT_MAP = {
  'Alto_Alta': 1,  'Alto_Media': 2,  'Alto_Baja': 3,
  'Medio_Alta': 4, 'Medio_Media': 5, 'Medio_Baja': 6,
  'Bajo_Alta': 7,  'Bajo_Media': 8,  'Bajo_Baja': 9,
};
const _SV2_QUADRANT_NAMES = {
  1: 'Estratégico',       2: 'Cliente core',     3: 'Cliente volumen',
  4: 'Puerta de entrada', 5: 'Cartera estándar', 6: 'Mantenimiento',
  7: 'Conector',          8: 'Seguimiento ligero', 9: 'Congelar',
};
const _SV2_ACTIONS = {
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

// ── calculateScoringV2 (index.html ~6320) ────────────────────────────────────
// ── v2.1: engagement (informes/visitas) y confianza ─────────────────────────
// Port fiel de batch-qualify/scoring.mjs (fuente de producción). Mantener en
// paridad — lo verifica tests/unit/test-scoring-parity.js.
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
function calculateEngagement(studio, todayISO) {
  let e = 0;
  const last = _lastInteractionISO(studio);
  if (last) {
    const days = _daysBetween(last, todayISO);
    if (days <= 90) e += 2; else if (days <= 180) e += 1;
  }
  const reps = _reports(studio).filter(r => r && r.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const lastRep = reps.length ? reps[reps.length - 1] : null;
  if (lastRep) {
    const prob = Number(lastRep.probabilidad_cierre_pct);
    const temp = Number(lastRep.temperatura);
    if (!Number.isNaN(prob) && lastRep.probabilidad_cierre_pct != null) {
      if (prob >= 60) e += 2; else if (prob >= 30) e += 1;
    } else if (!Number.isNaN(temp) && lastRep.temperatura != null) {
      if (temp >= 4) e += 2; else if (temp >= 3) e += 1;
    }
    const prox = lastRep.fecha_proxima_visita;
    if (prox && /^\d{4}-\d{2}-\d{2}/.test(String(prox)) && String(prox).slice(0, 10) >= todayISO) e += 1;
    const comp = lastRep.compromisos && lastRep.compromisos.por_nuestra_parte;
    const proxAcc = lastRep.proxima_accion && String(lastRep.proxima_accion).trim() && lastRep.proxima_accion !== '—';
    if ((Array.isArray(comp) && comp.length > 0) || proxAcc) e += 1;
  }
  return Math.min(e, 6);
}
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

function calculateScoringV2(studio) {
  const data     = studio.data || {};
  const social   = data.social  || {};
  const contact  = data.contact || {};
  const team     = data.team    || [];
  const projects = data.projects || [];
  const tipoPpal = getTipoPrincipal(studio);

  // D1
  let d1 = 0;
  if (tipoPpal === 'ARQ' || tipoPpal === 'ING') d1 = 3;
  else if (tipoPpal === 'OCV') d1 = 2;
  else if (tipoPpal === 'AAPP' || tipoPpal === 'CCRR' || tipoPpal === 'CICA' || tipoPpal === 'CONC') d1 = 1;

  // D2
  let d2 = 0;
  const empVal = parseInt(getValor(data.studio?.employees)) || 0;
  if (empVal > 0) {
    if (tipoPpal === 'OCV') {
      if (empVal >= 50) d2 = 3; else if (empVal >= 20) d2 = 2; else if (empVal >= 5) d2 = 1;
    } else {
      if (empVal >= 20) d2 = 3; else if (empVal >= 10) d2 = 2; else if (empVal >= 3) d2 = 1;
    }
  }

  // D3 (sin dato fiable)
  const d3 = 0;

  // D4
  let d4 = 0, d4Recent = 0;
  const d4Cutoff = new Date(); d4Cutoff.setFullYear(d4Cutoff.getFullYear() - 1);
  d4Recent = projects.filter(p => {
    if (p.year) return parseInt(p.year) >= d4Cutoff.getFullYear();
    if (p.date) { try { return new Date(p.date) >= d4Cutoff; } catch(e) {} }
    return false;
  }).length;
  const d4Effective = d4Recent > 0 ? d4Recent : Math.round(projects.length * 0.6);
  if (d4Effective >= 5) d4 = 3; else if (d4Effective >= 3) d4 = 2; else if (d4Effective >= 1) d4 = 1;

  // D5
  let d5 = 0;
  const projText = projects.map(p => ((p.name||'') + ' ' + (p.type||'')).toLowerCase()).join(' ');
  const _GPF_FIT_FAMILIES = [
    ['evacuacion_mute',    ['evacuación','bajante','saneamiento pvc','insonori','acústic']],
    ['red_saneamiento',    ['colector','alcantarillado','red saneamiento','edar','depuradora','saneamiento']],
    ['riego_biopipe',      ['riego','regadío','pvc-o','pe100','conducción agua','biorientado']],
    ['abastecimiento',     ['abastecimiento','agua potable','red distribución','captación']],
    ['pe_presion_gas',     ['polietileno','pe 100','gas pe','condusan','presión gas']],
  ];
  let d5Fits = _GPF_FIT_FAMILIES.filter(([, kws]) => kws.some(kw => projText.includes(kw))).length;
  if ((tipoPpal === 'ARQ' || tipoPpal === 'ING') && projects.length > 0) d5Fits = Math.max(d5Fits, 1);
  if (d5Fits >= 3) d5 = 2; else if (d5Fits >= 1) d5 = 1;

  // D6
  let d6 = 0, d6Pts = 0;
  if (getValor(contact.phone)   && getValor(contact.phone)   !== 'No encontrado') d6Pts++;
  if (getValor(contact.email)   && getValor(contact.email)   !== 'No encontrado') d6Pts++;
  if (getValor(contact.address) && getValor(contact.address) !== 'No encontrado') d6Pts++;
  if (getValor(contact.web)     && getValor(contact.web)     !== 'No encontrado') d6Pts++;
  if (team.some(t => t.isDecisionMaker)) d6Pts++;
  if (team.some(t => t.email   && t.email   !== 'No encontrado')) d6Pts++;
  if (team.some(t => t.linkedin && t.linkedin !== 'No encontrado')) d6Pts++;
  if (d6Pts >= 5) d6 = 2; else if (d6Pts >= 2) d6 = 1;

  const rawDirect = d1 + d2 + d3 + d4 + d5 + d6;

  // R1
  let r1 = 0;
  if      (projects.length >= 10) r1 = 2;
  else if (projects.length >=  5) r1 = 1.5;
  else if (projects.length >=  2) r1 = 1;

  // R2
  const _R2_TARGET_KWS = [
    'regant','regadío','regadio','comunidad de riego',
    'edar','depuradora','abastecimiento','saneamiento','agua potable',
    'red de aguas','red de saneamiento','red de abastecimiento','colector',
    'ayuntamiento','diputación','diputacion','consorcio','mancomunidad',
    'junta de','sector público','sector publico',
    'urbanización','urbanizacion','infraestructura','vial','autovía','autovia',
    'pavimentación','pavimentacion',
  ];
  let r2TargetCount = 0;
  projects.forEach(p => {
    const t = ((p.name||p.nombre||'') + ' ' + (p.type||p.tipo||'') + ' ' + (p.descripcion||p.description||'')).toLowerCase();
    if (_R2_TARGET_KWS.some(kw => t.includes(kw))) r2TargetCount++;
  });
  const r2Pct = projects.length > 0 ? (r2TargetCount / projects.length) : 0;
  let r2 = 0;
  if      (r2Pct >= 0.75) r2 = 4;
  else if (r2Pct >= 0.50) r2 = 3;
  else if (r2Pct >= 0.25) r2 = 2;
  else if (r2TargetCount >= 1) r2 = 1;

  // R3
  const _R3_KWS = [
    'proveedor exclusivo','proveedor preferente','proveedor habitual',
    'colaborador habitual','partner exclusivo','partner preferente',
  ];
  const _r3Text = ((data.description||'') + ' ' +
    projects.map(p => (p.name||p.nombre||'') + ' ' + (p.descripcion||p.description||'')).join(' ')
  ).toLowerCase();
  const r3Hits = _R3_KWS.filter(kw => _r3Text.includes(kw)).length;
  let r3 = 0;
  if      (r3Hits >= 2) r3 = 2;
  else if (r3Hits >= 1) r3 = 1;

  // R4
  const liFollowers = parseInt((getValor(social.linkedin?.followers) || '').replace(/[^0-9]/g, '') || '0') || 0;
  const _awardKws = ['premio','bienal','award','finalista','reconoci','distinción','medalla','ganador'];
  const _teachKws = ['profesor','docente','universidad','cátedra','master','máster'];
  let socialCount = 0;
  if (getValor(social.linkedin?.url))   socialCount++;
  if (getValor(social.instagram?.url))  socialCount++;
  if (getValor(social.twitter?.url))    socialCount++;
  const _r4Signals = {
    li_followers:  liFollowers >= 1000,
    awards:        projects.some(p => _awardKws.some(kw => ((p.name||'')+(p.type||'')).toLowerCase().includes(kw)))
                   || _awardKws.some(kw => (data.description||'').toLowerCase().includes(kw)),
    teaching:      team.some(t => _teachKws.some(kw => ((t.role||'')+(t.bio||'')).toLowerCase().includes(kw))),
    wide_portfolio: projects.length >= 10,
    social_active: socialCount >= 2 && liFollowers >= 500,
  };
  const r4Signals = Object.values(_r4Signals).filter(Boolean).length;
  const r4 = r4Signals >= 4 ? 4 : r4Signals >= 2 ? 2 : 0;

  // R5
  const _R5_ZONA_PROVS = [
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
  const _r5Provs = new Set();
  projects.forEach(p => {
    const t = ((p.location||'') + ' ' + (p.name||p.nombre||'') + ' ' + (p.descripcion||p.description||'')).toLowerCase();
    _R5_ZONA_PROVS.forEach(prov => { if (t.includes(prov)) _r5Provs.add(prov); });
  });
  const r5ProvCount = _r5Provs.size;
  let r5 = 0;
  if      (r5ProvCount >= 3) r5 = 2;
  else if (r5ProvCount >= 1) r5 = 1;

  const rawNetwork = r1 + r2 + r3 + r4 + r5;
  const priorityNetwork = rawNetwork >= 10 ? 'Alta' : rawNetwork >= 6 ? 'Media' : 'Baja';

  const esCandidatoPuente = rawDirect < 6 && rawNetwork >= 6 && projects.length >= 5;
  const puenteActivo = studio.es_cliente_puente === true;
  // v2.1: ENGAGEMENT (informes de visita) suma al eje directo.
  const engagementScore = calculateEngagement(studio, _todayISO());
  const rawDirectFinal = rawDirect + (puenteActivo ? 4 : 0) + engagementScore;
  const priorityDirect = rawDirectFinal >= 10 ? 'Alto' : rawDirectFinal >= 6 ? 'Medio' : 'Bajo';
  // v2.1: distancia al siguiente umbral del eje directo ("casi sube de cuadrante").
  const directDistanceToNext = priorityDirect === 'Alto' ? 0
    : (priorityDirect === 'Medio' ? Math.max(0, 10 - rawDirectFinal) : Math.max(0, 6 - rawDirectFinal));
  // v2.1: confianza por completitud de datos.
  const scoringConfianza = calculateConfianza(studio);

  const priorityQuadrant = _SV2_QUADRANT_MAP[`${priorityDirect}_${priorityNetwork}`] || 5;

  return {
    priorityDirect,
    priorityDirectScore: rawDirectFinal,
    priorityDirectScoreNatural: rawDirect,
    esCandidatoPuente,
    puenteActivo,
    priorityNetwork,
    priorityNetworkScore: rawNetwork,
    priorityQuadrant,
    priorityQuadrantName: _SV2_QUADRANT_NAMES[priorityQuadrant],
    priorityRecommendedAction: _SV2_ACTIONS[priorityQuadrant],
    // v2.1
    engagementScore,
    scoringConfianza,
    directDistanceToNext,
    _dims: { d1, d2, d3, d4, d5, d6, r1, r2, r3, r4, r5, d4Recent, d4Effective, d5Fits, r2TargetCount, r2Pct, r3Hits, r4Signals, r5ProvCount, empVal },
  };
}

// ── Referencias cruzadas (index.html ~27441) ─────────────────────────────────
const _REFCRUZ_PROVINCIAS_ES = ['Almería','Cádiz','Córdoba','Granada','Huelva','Jaén','Málaga','Sevilla','Cáceres','Badajoz','Toledo','Cuenca','Ciudad Real','Albacete','Guadalajara','Madrid','Alicante','Valencia','Castellón','Murcia'];

function _inferirProvinciaCtx(ctx) {
  for (const p of _REFCRUZ_PROVINCIAS_ES) {
    const re = new RegExp(`\\b${p.replace('í','[ií]').replace('á','[áa]').replace('ó','[óo]').replace('é','[ée]')}\\b`, 'i');
    if (re.test(ctx)) return p;
  }
  return null;
}

const _REFCRUZ_PATRONES = [
  { tipo: 'CCRR', re: /\b(Comunidad de Regantes (?:de |del? )?[A-ZÁÉÍÓÚÑ][a-záéíóúñ\-]+(?:[\s\-][A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){0,4})\b/g },
  { tipo: 'CCRR', re: /\b(Valle Inferior del Guadalquivir|Piedras-Guadiana|Margen Derecha del Bembézar|Genil-Cabra|Bajo Guadalquivir|Genil[\-\s]Cabra)\b/g },
  { tipo: 'INFRA', re: /\b(EDAR (?:de |del? )?[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:[\s\-][A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)\b/g },
  { tipo: 'INFRA', re: /\b(ETAP (?:de |del? )?[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:[\s\-][A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)\b/g },
  { tipo: 'INFRA', re: /\b(Desaladora (?:de |del? )?[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)\b/g },
  { tipo: 'AAPP', re: /\b(Ayuntamiento (?:de |del? )?[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:[\s\-][A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){0,3})\b/g },
  { tipo: 'AAPP', re: /\b(Diputación (?:de |Provincial de )?[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)\b/g },
  { tipo: 'AAPP', re: /\b(Junta de (?:Andalucía|Extremadura|Castilla[\s\-][a-záéíóúñ\sLa]+))\b/g },
  { tipo: 'AAPP', re: /\b(Confederación Hidrográfica del [A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)\b/g },
  { tipo: 'CICA', re: /\b(Aqualia|EMASESA|EMACSA|FCC Aqualia|Hidralia|Hidragua|Canal de Isabel II|EMASA|EMUASA|EMASAGRA|Acciona Agua|Veolia|GIAHSA)\b/g },
  { tipo: 'CICA', re: /\b(Aguas (?:de |del? )?[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)\b/g },
];

const _REFCRUZ_STOP = /^(Junta de Comunidades|Diputación Provincial|Comunidad de Regantes|CR de|Aguas de|Ayuntamiento de|EDAR de|ETAP de|Desaladora de|Confederación Hidrográfica del|Aguas Residuales|Diseño)$/i;

function _refcruzEsRuido(nombre) {
  if (/^Empresa$/i.test(nombre.split(/\s+/)[0]) && nombre.split(/\s+/).length <= 3) return true;
  if (/(?:de|del?|en|por|para)$/i.test(nombre)) return true;
  if (_REFCRUZ_PROVINCIAS_ES.includes(nombre)) return true;
  return false;
}

function _refcruzNorm(s) {
  return (s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
}

function extractReferenciasFromText(text, selfName) {
  const referencias = new Map();
  const selfN = _refcruzNorm(selfName||'');
  for (const pat of _REFCRUZ_PATRONES) {
    const re = new RegExp(pat.re.source, pat.re.flags);
    let m;
    while ((m = re.exec(text)) !== null) {
      const nombre = (m[1] || m[0]).trim();
      if (nombre.length < 6) continue;
      if (_REFCRUZ_STOP.test(nombre)) continue;
      if (_refcruzEsRuido(nombre)) continue;
      const nN = _refcruzNorm(nombre);
      if (selfN && (nN === selfN || nN.includes(selfN) || selfN.includes(nN))) continue;
      const start = Math.max(0, m.index - 100);
      const end = Math.min(text.length, m.index + m[0].length + 100);
      const ctx = text.slice(start, end).replace(/\s+/g,' ').trim();
      const provInf = _inferirProvinciaCtx(ctx);
      const key = pat.tipo + '|' + nN;
      if (!referencias.has(key)) {
        referencias.set(key, { tipo: pat.tipo, nombre, provinciaInferida: provInf, contexto: ctx });
      } else if (!referencias.get(key).provinciaInferida && provInf) {
        referencias.get(key).provinciaInferida = provInf;
      }
    }
  }
  return Array.from(referencias.values());
}

// ── Acciones pendientes (index.html ~27627) ──────────────────────────────────
const _ACCION_TIPOS = {
  llamada:  { icon: '📱', detectRe: /\b(?:llamar(?:\s+(?:en|a|al))?|hacer\s+(?:una\s+)?llamada|contactar\s+(?:telef[óo]nicamente|por\s+tel[ée]fono)|seguimiento\s+telef[óo]nico)\b[\s\S]{0,100}/gi },
  email:    { icon: '📧', detectRe: /\b(?:enviar|env[íi]o\s+de|mandar|remitir|hacer\s+llegar|adjuntar)\s+(?:el\s+|la\s+|los\s+|las\s+|un\s+|una\s+)?(?:cat[áa]logo|documentaci[óo]n(?:\s+t[ée]cnica)?|presupuesto|info(?:rmaci[óo]n)?|propuesta(?:\s+t[ée]cnica)?|email|correo|mail|fichas?(?:\s+t[ée]cnicas?)?|certificad[oa]s?|archivo|presto|familias?\s+BIM|caso\s+de\s+[ée]xito|DAP|estudio\s+comparativo|memoria\s+t[ée]cnica)\b[\s\S]{0,150}/gi },
  material: { icon: '📦', detectRe: /\b(?:entregar|llevar|dejar|hacer\s+llegar)\s+(?:la\s+|el\s+|las\s+|los\s+|una\s+|un\s+)?(?:muestra|prototipo|material|piezas?\s+f[íi]sicas?|tubo|muestrario)\b[\s\S]{0,150}/gi },
  reunion:  { icon: '📅', detectRe: /\b(?:concertar|agendar|cerrar|programar|fijar|organizar)\s+(?:una\s+|la\s+|otra\s+|nueva\s+)?(?:reuni[óo]n|visita|cita|llamada\s+t[ée]cnica|prueba|encuentro|sesi[óo]n)\b[\s\S]{0,150}/gi },
};

function _accionDetectarPlazo(textoItem, baseDate) {
  // Trabajamos siempre en UTC para evitar off-by-one por timezone local.
  // Parsing fecha base como ISO o YYYY-MM-DD: ambos producen instante UTC consistente.
  const base = baseDate ? new Date(baseDate + (baseDate.length === 10 ? 'T00:00:00Z' : '')) : new Date();
  if (isNaN(base.getTime())) return { plazoTexto: null, fechaLimite: null };
  const t = textoItem.toLowerCase();
  const toISO = (d) => d.toISOString().slice(0, 10);
  const addDaysUTC = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };
  const addHoursUTC = (d, n) => { const x = new Date(d); x.setUTCHours(x.getUTCHours() + n); return x; };

  if (/\b(inmediato|urgente|cuanto antes|asap)\b/i.test(t)) {
    return { plazoTexto: 'urgente (24h)', fechaLimite: toISO(addDaysUTC(base, 1)) };
  }
  // Horas: acepta "48 horas", "48h", "48-72h", "48-72 horas"
  const horasM = t.match(/(\d{1,3})(?:\s*-\s*\d{1,3})?\s*h(?:oras?)?\b/);
  if (horasM) {
    const h = parseInt(horasM[1]);
    return { plazoTexto: `${horasM[0].trim()} (horas)`, fechaLimite: toISO(addHoursUTC(base, h)) };
  }
  // Días: "5 días", "10d", "5-10 días"
  const diasM = t.match(/(\d{1,2})(?:\s*-\s*\d{1,2})?\s*d(?:[íi]as?)?\b/);
  if (diasM) {
    return { plazoTexto: `${diasM[0].trim()}`, fechaLimite: toISO(addDaysUTC(base, parseInt(diasM[1]))) };
  }
  // Semanas
  const semM = t.match(/(\d{1,2})\s*semanas?\b/);
  if (semM) {
    return { plazoTexto: `${semM[0]}`, fechaLimite: toISO(addDaysUTC(base, parseInt(semM[1]) * 7)) };
  }
  if (/\b(una|1)\s+semana\b/i.test(t)) {
    return { plazoTexto: '1 semana', fechaLimite: toISO(addDaysUTC(base, 7)) };
  }
  // Fecha explícita "16 de diciembre [de YYYY]"
  const meses = { enero:0,febrero:1,marzo:2,abril:3,mayo:4,junio:5,julio:6,agosto:7,septiembre:8,octubre:9,noviembre:10,diciembre:11 };
  const fechaM = textoItem.match(/(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s+de\s+(\d{4}))?/i);
  if (fechaM) {
    const d = parseInt(fechaM[1]);
    const mes = meses[fechaM[2].toLowerCase()];
    let year = fechaM[3] ? parseInt(fechaM[3]) : base.getUTCFullYear();
    let fechaObj = new Date(Date.UTC(year, mes, d));
    if (!fechaM[3] && fechaObj < base) {
      fechaObj = new Date(Date.UTC(year + 1, mes, d));
    }
    return { plazoTexto: fechaM[0], fechaLimite: toISO(fechaObj) };
  }
  return { plazoTexto: null, fechaLimite: null };
}

function detectAccionesEnTexto(text) {
  const out = [];
  for (const [tipo, def] of Object.entries(_ACCION_TIPOS)) {
    const re = new RegExp(def.detectRe.source, def.detectRe.flags);
    let m;
    const vistos = new Set();
    while ((m = re.exec(text)) !== null) {
      const matchText = m[0].trim();
      if (matchText.length < 20 || matchText.length > 400) continue;
      const key = matchText.slice(0, 60).toLowerCase();
      if (vistos.has(key)) continue;
      vistos.add(key);
      out.push({ tipo, icon: def.icon, match: matchText });
    }
  }
  return out;
}

// ── Visitas no realizadas (index.html ~27891) ────────────────────────────────
const _NOVISITA_PATRONES = [
  { motivo: 'ausente', icon: '🚪', re: /\b(?:cliente|interlocutor|responsable)?\s*(?:no\s+(?:estaba|se\s+encontraba|estuvo)\s+(?:en\s+la\s+oficina|presente|disponible|en\s+su\s+puesto)|no\s+hab[íi]a\s+nadie|nadie\s+(?:nos\s+)?(?:atendi[óo]|recibi[óo])|estaba\s+fuera|fuera\s+de\s+(?:la\s+)?oficina|de\s+vacaciones|de\s+viaje|ausente)\b[\s\S]{0,150}/gi },
  { motivo: 'reunido',  icon: '👥', re: /\b(?:estaba|se\s+encontraba)\s+reunid[oa]\b[\s\S]{0,150}|\bocupad[oa]\s+con\s+otro\s+cliente\b[\s\S]{0,150}|\bno\s+pudo\s+atendernos\b[\s\S]{0,150}/gi },
  { motivo: 'olvido',   icon: '🤔', re: /\b(?:se\s+(?:le\s+)?(?:hab[íi]a\s+)?olvidad[oa]|se\s+olvid[óo]|no\s+(?:se\s+)?acord(?:[óo]|aba)|hab[íi]a\s+olvidado)\b[\s\S]{0,150}|\bno\s+(?:ten[íi]a|recordaba)\s+(?:la\s+)?(?:cita|reuni[óo]n|visita)\b[\s\S]{0,150}/gi },
  { motivo: 'persona_inadecuada', icon: '⚠️', re: /\b(?:la\s+persona\s+adecuada|el\s+responsable|el\s+decision\s+maker|la\s+persona\s+de\s+contacto|el\s+t[ée]cnico|el\s+arquitecto|el\s+ingeniero|el\s+director|el\s+gerente)\s+(?:no\s+(?:estaba|se\s+encontraba|estuvo))\b[\s\S]{0,150}|\batendi[óo]\s+(?:un\s+)?(?:becari[oa]|auxiliar|asistente|recepcionista|administrativ[oa])\b[\s\S]{0,150}/gi },
  { motivo: 'no_realizada', icon: '❌', re: /\b(?:no\s+(?:se\s+)?(?:pudo|pudimos|hemos\s+podido|consegu[íi])?\s*(?:realizar|completar|hacer|llevar\s+a\s+cabo)\s+(?:la\s+)?(?:visita|reuni[óo]n))\b[\s\S]{0,150}|\bvisita\s+(?:fallida|cancelada|reagendada|frustrada|aplazada)\b[\s\S]{0,150}|\b(?:tuvimos|hubo)\s+que\s+(?:reagendar|aplazar|cancelar|posponer)\b[\s\S]{0,150}/gi },
  { motivo: 'volver',   icon: '🔁', re: /\b(?:quedamos\s+en|qued[óo]\s+en|acordamos)\s+(?:volver|pasar(?:nos)?|venir|repetir)\b[\s\S]{0,150}|\bvolver(?:emos)?\s+(?:a\s+pasar|otro\s+d[íi]a|cuando|en\s+pr[óo]xima\s+ruta)\b[\s\S]{0,150}|\bpr[óo]xima\s+vez\s+que\s+pase\s+por\b[\s\S]{0,150}/gi },
];

function detectVisitasFallidasEnTexto(text) {
  const out = [];
  for (const pat of _NOVISITA_PATRONES) {
    const re = new RegExp(pat.re.source, pat.re.flags);
    let m;
    const vistos = new Set();
    while ((m = re.exec(text)) !== null) {
      const matchText = m[0].trim();
      if (matchText.length < 15 || matchText.length > 400) continue;
      const key = matchText.slice(0, 60).toLowerCase();
      if (vistos.has(key)) continue;
      vistos.add(key);
      out.push({ motivo: pat.motivo, icon: pat.icon, match: matchText });
    }
  }
  return out;
}

// ── Hash de acciones (index.html ~27686) ────────────────────────────────────
function _accionHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
  return Math.abs(h).toString(36);
}

module.exports = {
  // tipos
  TIPO_B2B_MAP, TIPO_LEGACY_MAP, getTiposArray, getTipoPrincipal, getValor,
  // bloque 8
  _UNIV_DOMAINS_ES, _EVENTOS_SECTOR_KW,
  _h1_dominioUniversitario, _h2_tribunalAcademico, _h3_ponenciaCongreso, _h4_grupoInvestigacion,
  evaluarPuenteAcademico,
  // scoring v2
  _SV2_QUADRANT_MAP, _SV2_QUADRANT_NAMES, _SV2_ACTIONS,
  calculateScoringV2,
  // referencias cruzadas
  _REFCRUZ_PATRONES, _REFCRUZ_STOP, _refcruzNorm, _inferirProvinciaCtx, extractReferenciasFromText,
  // acciones
  _ACCION_TIPOS, _accionDetectarPlazo, detectAccionesEnTexto, _accionHash,
  // visitas
  _NOVISITA_PATRONES, detectVisitasFallidasEnTexto,
};
