#!/usr/bin/env node
/* eslint-disable */
// ──────────────────────────────────────────────────────────────────────
// Test unitario Bloque 8 (§19.1) — verifica que las 4 heurísticas
// detectan correctamente los 2 casos canónicos:
//   - Emilio Camacho Poyato (UCO Córdoba, Grupo AGR-0228)
//   - Juan Reca Cardeña (UAL Almería, Cátedra Universitaria del Agua)
// ──────────────────────────────────────────────────────────────────────

// ── Réplicas exactas de las constantes/funciones de index.html ──

const _UNIV_DOMAINS_ES = [
    '.edu','ac.es',
    'uco.es','ual.es','ujaen.es','ugr.es','us.es','upo.es','uca.es','uma.es','uhu.es','unia.es',
    'ucm.es','upm.es','uam.es','uc3m.es','urjc.es','uah.es','uned.es','ufv.es','comillas.edu','ie.edu','ceu.es','uax.es','uem.es','unav.edu','nebrija.es',
    'ub.edu','uab.cat','upc.edu','upf.edu','udg.edu','udl.cat','urv.cat','uoc.edu','uic.es','url.edu','uvic.cat',
    'uv.es','upv.es','ua.es','umh.es','uji.es','ucv.es',
    'usc.es','udc.es','uvigo.es',
    'ehu.eus','ehu.es','deusto.es','mondragon.edu',
    'usal.es','uva.es','uvalladolid.es','ubu.es','uemc.es','unileon.es',
    'uclm.es',
    'unex.es',
    'uniovi.es',
    'unican.es',
    'unavarra.es',
    'unirioja.es','unir.net',
    'unizar.es',
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
    const yearOk = /\b(2024|2025|2026)\b/.test(t);
    if (!yearOk) return { hit: false };
    const ponenteKW = /(ponente|ponencia|conferenciante|moderador|keynote|panelista)/i;
    const eventoMatch = _EVENTOS_SECTOR_KW.find(kw => t.includes(kw));
    if (eventoMatch && ponenteKW.test(text)) {
        return { hit: true, evidencia: `ponente_en_${eventoMatch}` };
    }
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

// ── Tests ──

const tests = [
    {
        nombre: 'Camacho Poyato (UCO Córdoba) - dominio universitario',
        result: {
            title: 'Emilio Camacho Poyato - Profesor Titular',
            snippet: 'Director del grupo de investigación AGR-228, especialista en eficiencia energética en riego.',
            url: 'https://www.uco.es/agronomos/camacho/index.html',
        },
        esperado_hit: true,
    },
    {
        nombre: 'Camacho Poyato - Grupo AGR-228 (heurística 4)',
        result: {
            title: 'Grupo de investigación AGR-228 — UCO',
            snippet: 'Grupo AGR-228 de la Universidad de Córdoba, sostenibilidad hídrica en regadío. Publicaciones recientes 2024 sobre eficiencia energética.',
            url: 'https://www.researchgate.net/grupo-agr-228',
        },
        esperado_hit: true,
    },
    {
        nombre: 'Reca Cardeña (UAL Almería) - dominio + cátedra agua',
        result: {
            title: 'Juan Reca Cardeña - Catedrático Universidad Almería',
            snippet: 'Cátedra Universitaria del Agua. Investigación en hidráulica y riego de precisión. Publicaciones recientes 2025.',
            url: 'https://www.ual.es/personal/jreca',
        },
        esperado_hit: true,
    },
    {
        nombre: 'Reca Cardeña - solo snippet sin URL universidad',
        result: {
            title: 'Juan Reca - Cátedra del Agua',
            snippet: 'Catedrático de la Universidad de Almería, miembro de la Cátedra Universitaria del Agua. Publicaciones 2024-2025 sobre riego.',
            url: 'https://example.com/personas',
        },
        esperado_hit: true,
    },
    {
        nombre: 'Empresa privada normal (control negativo)',
        result: {
            title: 'PROINTEC Ingenieros y Arquitectos',
            snippet: 'Empresa de ingeniería con sede en Almería capital. Proyectos de obra civil.',
            url: 'https://www.prointec.es',
        },
        esperado_hit: false,
    },
    {
        nombre: 'Tribunal de oposición ingeniería hidráulica (heurística 2)',
        result: {
            title: 'Acuerdo del Consejo de Gobierno - Tribunal',
            snippet: 'Presidente del tribunal de oposición a plaza de Profesor Titular de Ingeniería Hidráulica, Universidad de Córdoba. Acuerdo 2024.',
            url: 'https://www.uco.es/gobierno/2024/tribunales',
        },
        esperado_hit: true,
    },
    {
        nombre: 'Ponencia en SEREA 2024 (heurística 3)',
        result: {
            title: 'XX SEREA 2024 - Programa',
            snippet: 'Ponente invitado al XX Seminario Iberoamericano sobre Sistemas de Abastecimiento Urbano de Agua (SEREA 2024) celebrado en Sevilla.',
            url: 'https://serea2024.es/programa',
        },
        esperado_hit: true,
    },
];

let pasados = 0, fallados = 0;
console.log('═══════════════════════════════════════════════════════════');
console.log('Bloque 8 §19.1 — Test heurísticas puente académico');
console.log('═══════════════════════════════════════════════════════════');
console.log();

tests.forEach((t, i) => {
    const res = evaluarPuenteAcademico(t.result, t.result.webEmails);
    const ok = res.hit === t.esperado_hit;
    console.log(`Test ${i+1}: ${t.nombre}`);
    console.log(`  Esperado: hit=${t.esperado_hit}`);
    console.log(`  Obtenido: hit=${res.hit} evidencias=[${res.evidencias.join(', ')}]`);
    console.log(`  ${ok ? '✅ PASS' : '❌ FAIL'}`);
    console.log();
    if (ok) pasados++; else fallados++;
});

console.log('═══════════════════════════════════════════════════════════');
console.log(`Resultado: ${pasados}/${tests.length} pasados, ${fallados} fallados`);
console.log('═══════════════════════════════════════════════════════════');
process.exit(fallados > 0 ? 1 : 0);
