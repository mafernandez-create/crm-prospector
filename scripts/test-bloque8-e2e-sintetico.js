#!/usr/bin/env node
/* eslint-disable */
// ──────────────────────────────────────────────────────────────────────
// Test end-to-end SINTÉTICO Bloque 8 §19.1
//
// Simula el flujo completo de processSearchResults con snippets
// representativos de lo que DDG/Brave devolverían en queries reales
// sobre Camacho Poyato (UCO) y Reca Cardeña (UAL).
//
// Valida: se crean entradas con es_cliente_puente=true.
// ──────────────────────────────────────────────────────────────────────

// ── Réplica EXACTA de las funciones de index.html ──

const _UNIV_DOMAINS_ES = [
    '.edu','ac.es',
    'uco.es','ual.es','ujaen.es','ugr.es','us.es','upo.es','uca.es','uma.es','uhu.es','unia.es',
    'ucm.es','upm.es','uam.es','uc3m.es','urjc.es','uah.es','uned.es','ufv.es','comillas.edu','ie.edu','ceu.es','uax.es','uem.es','unav.edu','nebrija.es',
    'ub.edu','uab.cat','upc.edu','upf.edu','udg.edu','udl.cat','urv.cat','uoc.edu','uic.es','url.edu','uvic.cat',
    'uv.es','upv.es','ua.es','umh.es','uji.es','ucv.es',
    'usc.es','udc.es','uvigo.es',
    'ehu.eus','ehu.es','deusto.es','mondragon.edu',
    'usal.es','uva.es','uvalladolid.es','ubu.es','uemc.es','unileon.es',
    'uclm.es','unex.es','uniovi.es','unican.es','unavarra.es','unirioja.es','unir.net',
    'unizar.es','um.es','upct.es','ucam.edu','uib.es','uib.cat','ulpgc.es','ull.es',
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

function _h1(url, webEmails) {
    const fuentes = [];
    if (typeof url === 'string') fuentes.push(url.toLowerCase());
    if (Array.isArray(webEmails)) webEmails.forEach(e => typeof e === 'string' && fuentes.push(e.toLowerCase()));
    for (const f of fuentes) for (const d of _UNIV_DOMAINS_ES) if (f.includes(d)) return { hit: true, evidencia: `dominio:${d}` };
    return { hit: false };
}
function _h2(text) {
    if (!text || typeof text !== 'string') return { hit: false };
    const tribunalKW = /(presidente|vocal|secretari[oa]|miembro)\s+(del?\s+)?(tribunal|comisi[óo]n\s+evaluadora|comisi[óo]n\s+de\s+selecci[óo]n)/i;
    const oposicionKW = /(oposici[óo]n|plaza|concurso\s+(p[úu]blico|de\s+m[ée]ritos))/i;
    const ingenieriaKW = /(ingenier[íi]a\s+(hidr[áa]ulica|civil|agron[óo]mica|forestal|de\s+caminos|agroforestal)|cated[rí]a|universidad)/i;
    if (tribunalKW.test(text) && (oposicionKW.test(text) || ingenieriaKW.test(text))) return { hit: true, evidencia: 'tribunal_academico' };
    return { hit: false };
}
function _h3(text) {
    if (!text || typeof text !== 'string') return { hit: false };
    const t = text.toLowerCase();
    if (!/\b(2024|2025|2026)\b/.test(t)) return { hit: false };
    const ponenteKW = /(ponente|ponencia|conferenciante|moderador|keynote|panelista)/i;
    const eventoMatch = _EVENTOS_SECTOR_KW.find(kw => t.includes(kw));
    if (eventoMatch && ponenteKW.test(text)) return { hit: true, evidencia: `ponente_en_${eventoMatch}` };
    if (eventoMatch && /(participaci[óo]n|intervenci[óo]n|presentaci[óo]n|exposici[óo]n)/i.test(text)) return { hit: true, evidencia: `presentacion_en_${eventoMatch}` };
    return { hit: false };
}
function _h4(text) {
    if (!text || typeof text !== 'string') return { hit: false };
    const grupoCodigo = /grupo\s+(AGR|TEP|RNM|HUM|FQM|BIO|TIC|SEJ|CTS)[-\s]?\d{3,4}/i;
    const grupoTematico = /grupo\s+de\s+investigaci[óo]n\s+(en|del?|sobre)?\s*(hidr[áa]ulica|riego|regad[íi]o|agua|sostenibilidad\s+h[íi]drica|recursos\s+h[íi]dricos|saneamiento|depuraci[óo]n|edar)/i;
    const catedraAgua = /c[áa]tedra\s+(universitaria|de|del|del?)?\s*(agua|riego|hidr[áa]ulica|recursos\s+h[íi]dricos)/i;
    const yearRecent = /\b(2024|2025|2026)\b/.test(text);
    const publicacionKW = /(publicaci[óo]n|art[íi]culo|paper|investigaci[óo]n|tesis|doi|doi\.org|elsevier|scopus|wos|cited|citation)/i;
    if (grupoCodigo.test(text)) return { hit: true, evidencia: 'grupo_codigo' };
    if (catedraAgua.test(text)) return { hit: true, evidencia: 'catedra_agua' };
    if (grupoTematico.test(text) && (yearRecent || publicacionKW.test(text))) return { hit: true, evidencia: 'grupo_tematico_publicacion' };
    return { hit: false };
}

function evaluarPuenteAcademico(result, webEmails) {
    const text = ((result.title || '') + ' ' + (result.snippet || '')).trim();
    const evidencias = [];
    const h1 = _h1(result.url, webEmails); if (h1.hit) evidencias.push('h1:' + h1.evidencia);
    const h2 = _h2(text); if (h2.hit) evidencias.push('h2:' + h2.evidencia);
    const h3 = _h3(text); if (h3.hit) evidencias.push('h3:' + h3.evidencia);
    const h4 = _h4(text); if (h4.hit) evidencias.push('h4:' + h4.evidencia);
    return { hit: evidencias.length > 0, evidencias };
}

function extractStudioName(title, snippet, allowPersona) {
    if (!title) return null;
    let name = title.replace(/\|\s*LinkedIn$/i, '').replace(/\|\s*Instagram$/i, '').replace(/\|\s*Facebook$/i, '').replace(/\s*-\s*Páginas Amarillas$/i, '').replace(/\s*-\s*Infobel$/i, '').replace(/\s*\|\s*ArchDaily.*$/i, '').replace(/\s*::.*$/i, '').replace(/\s*-\s*Google Maps$/i, '').replace(/^Fotos y.*de\s*/i, '').replace(/\(@[^)]+\)/g, '').trim();
    const patterns = [
        /^([A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ\s&.]+(?:Arquitectos?|Arquitectura|Ingenieros?|Ingeniería|Studio|Estudio|SLP|SL|SA|SC))/i,
        /^(Estudio\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ\s&.]+)/i,
        /^([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s*[&+y]\s*[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)/i
    ];
    for (const p of patterns) { const m = name.match(p); if (m) return m[1].trim(); }
    if (allowPersona) {
        const personaPattern = /\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3})\b/g;
        const stopwords = /^(Universidad|Cátedra|Catedra|Grupo|Departamento|Escuela|Facultad|Comisión|Ministerio|Junta|Consejería|Diputación|Excelentísimo|Real|Sociedad|Asociación|Federación|Confederación|Colegio|Investigación|Investigaciones|Hidráulica|Agronómica|Civil|Ingeniería|Agraria|Reseña|Listado|Noticias|Información|Página|Inicio)\b/i;
        let m;
        while ((m = personaPattern.exec(name)) !== null) {
            const candidate = m[1].trim();
            if (stopwords.test(candidate)) continue;
            const words = candidate.split(/\s+/);
            if (words.length >= 2 && words.length <= 4 && !/(Congreso|Sociedad|Asociación|Federación|Universidad|Cátedra|Grupo)/i.test(candidate)) {
                return candidate;
            }
        }
        const sm = (snippet||'').match(/(?:catedr[áa]tico|profesor|investigador|director del grupo|coordinador)[\s\.,]+(?:de|del?|en)?[\s\.,]*([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3})/i);
        if (sm) return sm[1].trim();
    }
    if (name.length > 3 && name.length < 80 && !name.includes('Resultado') && !name.includes('Buscar')) {
        return name.split(/\s*[-|]\s*/)[0].trim();
    }
    return null;
}

function normalizeStudioKey(name) {
    return name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, '').substring(0, 30);
}

// ── Snippets sintéticos representativos de lo que DDG/Brave devolverían ──

const snippetsCordoba = [
    {
        title: 'Emilio Camacho Poyato - Profesor Titular',
        snippet: 'Director del grupo de investigación AGR-228 de la Universidad de Córdoba, especialista en eficiencia energética en sistemas de riego.',
        url: 'https://www.uco.es/agronomos/camacho/index.html',
    },
    {
        title: 'Grupo AGR-228 — Hidráulica y Riegos',
        snippet: 'Grupo de investigación AGR-228 de la Universidad de Córdoba dirigido por Emilio Camacho. Publicaciones recientes 2024 sobre eficiencia hídrica.',
        url: 'https://www.uco.es/investiga/grupos/agr228',
    },
    {
        title: 'PROINTEC Ingenieros y Arquitectos',
        snippet: 'Empresa de ingeniería con sede en Córdoba.',
        url: 'https://www.prointec.es',
    },
];

const snippetsAlmeria = [
    {
        title: 'Juan Reca Cardeña - Catedrático Ingeniería Hidráulica',
        snippet: 'Catedrático de la Universidad de Almería. Coordinador de la Cátedra Universitaria del Agua. Publicaciones 2025 sobre riego de precisión.',
        url: 'https://www.ual.es/personal/jreca',
    },
    {
        title: 'Cátedra Universitaria del Agua - UAL',
        snippet: 'La Cátedra Universitaria del Agua de la Universidad de Almería trabaja en eficiencia hídrica desde 2020. Director: Juan Reca Cardeña.',
        url: 'https://www.ual.es/catedras/agua',
    },
    {
        title: 'ICC Ingeniería - Almería',
        snippet: 'Empresa de ingeniería de Almería capital.',
        url: 'https://www.iccingenieria.es',
    },
];

// ── Simulación processSearchResults ──

function simularProcesamiento(snippets, province) {
    const foundStudios = new Map();
    snippets.forEach(result => {
        const puenteEval = evaluarPuenteAcademico(result, result.webEmails);
        const allowPersona = puenteEval.hit;  // Forzar a true si hay hit académico
        const studioName = extractStudioName(result.title, result.snippet, allowPersona);
        if (!studioName || studioName.length < 3) return;
        const key = normalizeStudioKey(studioName);
        const entry = {
            name: studioName, snippet: result.snippet, url: result.url,
            province, fuente_descubrimiento: puenteEval.hit ? 'academica' : 'geografica',
        };
        if (puenteEval.hit) {
            entry.es_cliente_puente = true;
            entry.puenteEvidencias = puenteEval.evidencias;
        }
        foundStudios.set(key, entry);
    });
    return Array.from(foundStudios.values());
}

console.log('═══════════════════════════════════════════════════════════');
console.log('Bloque 8 §19.1 — Test E2E sintético sobre snippets reales');
console.log('═══════════════════════════════════════════════════════════');
console.log();

console.log('▶ Córdoba/ING — procesando 3 snippets simulados…');
const resCordoba = simularProcesamiento(snippetsCordoba, 'Córdoba');
resCordoba.forEach((s, i) => {
    console.log(`  ${i+1}. "${s.name}"`);
    console.log(`     fuente=${s.fuente_descubrimiento} puente=${s.es_cliente_puente||false}`);
    if (s.puenteEvidencias) console.log(`     evidencias=[${s.puenteEvidencias.join(', ')}]`);
});
console.log();

console.log('▶ Almería/ING — procesando 3 snippets simulados…');
const resAlmeria = simularProcesamiento(snippetsAlmeria, 'Almería');
resAlmeria.forEach((s, i) => {
    console.log(`  ${i+1}. "${s.name}"`);
    console.log(`     fuente=${s.fuente_descubrimiento} puente=${s.es_cliente_puente||false}`);
    if (s.puenteEvidencias) console.log(`     evidencias=[${s.puenteEvidencias.join(', ')}]`);
});
console.log();

// ── Validaciones obligatorias §19.1 ──
const norm = (s) => (s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const camacho = resCordoba.find(s => norm(s.name).includes('camacho') && s.es_cliente_puente);
const reca = resAlmeria.find(s => norm(s.name).includes('reca') && s.es_cliente_puente);

console.log('═══════════════════════════════════════════════════════════');
console.log('VALIDACIÓN §19.1 OBLIGATORIA');
console.log('═══════════════════════════════════════════════════════════');
console.log(`Camacho Poyato auto-marcado puente: ${camacho ? '✅ SÍ' : '❌ NO'}`);
if (camacho) console.log(`  → "${camacho.name}" — evidencias: ${camacho.puenteEvidencias.join(', ')}`);
console.log(`Reca Cardeña auto-marcado puente:   ${reca ? '✅ SÍ' : '❌ NO'}`);
if (reca) console.log(`  → "${reca.name}" — evidencias: ${reca.puenteEvidencias.join(', ')}`);
console.log();

const ok = !!camacho && !!reca;
console.log(`Bloque 8 validación E2E sintético: ${ok ? '✅ PASA' : '❌ FALLA — requiere iteración'}`);
process.exit(ok ? 0 : 1);
