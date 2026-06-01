#!/usr/bin/env node
/* eslint-disable */
// Test iteración Bloque 8: extracción de personas físicas académicas
// cuando el contexto activa heurísticas académicas.

// Réplica de extractStudioName con parámetro allowPersona
function extractStudioName(title, snippet, allowPersona) {
    if (!title) return null;
    let name = title
        .replace(/\|\s*LinkedIn$/i, '')
        .replace(/\|\s*Instagram$/i, '')
        .replace(/\|\s*Facebook$/i, '')
        .replace(/\s*-\s*Páginas Amarillas$/i, '')
        .replace(/\s*-\s*Infobel$/i, '')
        .replace(/\s*\|\s*ArchDaily.*$/i, '')
        .replace(/\s*::.*$/i, '')
        .replace(/\s*-\s*Google Maps$/i, '')
        .replace(/^Fotos y.*de\s*/i, '')
        .replace(/\(@[^)]+\)/g, '')
        .trim();
    const patterns = [
        /^([A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ\s&.]+(?:Arquitectos?|Arquitectura|Ingenieros?|Ingeniería|Studio|Estudio|SLP|SL|SA|SC))/i,
        /^(Estudio\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ\s&.]+)/i,
        /^([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s*[&+y]\s*[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)/i
    ];
    for (const pattern of patterns) {
        const match = name.match(pattern);
        if (match) return match[1].trim();
    }
    if (allowPersona) {
        const personaPattern = /\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3})\b/g;
        const stopwords = /^(Universidad|Cátedra|Catedra|Grupo|Departamento|Escuela|Facultad|Comisión|Ministerio|Junta|Consejería|Diputación|Excelentísimo|Real|Sociedad|Asociación|Federación|Confederación|Colegio|Investigación|Investigaciones|Hidráulica|Agronómica|Civil|Ingeniería|Agraria|Reseña|Listado|Noticias|Información|Página|Inicio)\b/i;
        let m;
        while ((m = personaPattern.exec(name)) !== null) {
            const candidate = m[1].trim();
            if (stopwords.test(candidate)) continue;
            const words = candidate.split(/\s+/);
            if (words.length >= 2 && words.length <= 4) {
                if (!/(Congreso|Sociedad|Asociación|Federación|Universidad|Cátedra|Grupo)/i.test(candidate)) {
                    return candidate;
                }
            }
        }
        const snippetMatch = (snippet||'').match(/(?:catedr[áa]tico|profesor|investigador|director del grupo|coordinador)[\s\.,]+(?:de|del?|en)?[\s\.,]*([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3})/i);
        if (snippetMatch) return snippetMatch[1].trim();
    }
    if (name.length > 3 && name.length < 80 && !name.includes('Resultado') && !name.includes('Buscar')) {
        return name.split(/\s*[-|]\s*/)[0].trim();
    }
    return null;
}

const tests = [
    {
        n: 'Camacho Poyato - perfil UCO',
        title: 'Emilio Camacho Poyato - Profesor Titular',
        snippet: 'Director del grupo de investigación AGR-228, especialista en eficiencia energética en riego.',
        allowPersona: true,
        esperado_contains: 'Camacho Poyato',
    },
    {
        n: 'Reca Cardena - cátedra del agua',
        title: 'Juan Reca Cardeña - Catedrático Universidad Almería',
        snippet: 'Cátedra Universitaria del Agua. Investigación en hidráulica y riego.',
        allowPersona: true,
        esperado_contains: 'Reca Cardena',
    },
    {
        n: 'Snippet con catedrático + nombre (extracción de snippet)',
        title: 'Cátedra del Agua - UAL',
        snippet: 'El catedrático Juan Reca Cardeña dirige la Cátedra del Agua desde 2020.',
        allowPersona: true,
        esperado_contains: 'Reca Cardena',
    },
    {
        n: 'Empresa normal (control negativo persona)',
        title: 'PROINTEC Ingenieros y Arquitectos',
        snippet: 'Empresa de ingeniería en Almería.',
        allowPersona: true,
        esperado_contains: 'PROINTEC',
    },
    {
        n: 'Fallback título limpio si allowPersona=false (comportamiento pre-Bloque 8)',
        title: 'Emilio Camacho Poyato - Profesor',
        snippet: 'Director del grupo AGR-228.',
        allowPersona: false,
        // Sin allowPersona, el fallback genérico devuelve "Emilio Camacho Poyato"
        // (compatible con comportamiento previo). Sólo cambia cuando hit académico.
        esperado_contains: 'Emilio Camacho Poyato',
    },
];

function normalize(s) {
    return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

let pasados = 0, fallados = 0;
console.log('═══════════════════════════════════════════════════════════');
console.log('Bloque 8 iter — Test extracción personas físicas');
console.log('═══════════════════════════════════════════════════════════');
console.log();

tests.forEach((t, i) => {
    const out = extractStudioName(t.title, t.snippet, t.allowPersona);
    const outNorm = normalize(out || '');
    let ok;
    if (t.esperado_contains === null) {
        // Control: aceptamos cualquier resultado pero no debe ser específicamente "Camacho Poyato"
        ok = !outNorm.includes('Camacho Poyato');
    } else {
        ok = outNorm.includes(normalize(t.esperado_contains));
    }
    console.log(`Test ${i+1}: ${t.n}`);
    console.log(`  allowPersona=${t.allowPersona}`);
    console.log(`  Obtenido: "${out}"`);
    console.log(`  Esperado contiene: "${t.esperado_contains}"`);
    console.log(`  ${ok ? '✅ PASS' : '❌ FAIL'}`);
    console.log();
    if (ok) pasados++; else fallados++;
});

console.log('═══════════════════════════════════════════════════════════');
console.log(`Resultado: ${pasados}/${tests.length} pasados, ${fallados} fallados`);
console.log('═══════════════════════════════════════════════════════════');
process.exit(fallados > 0 ? 1 : 0);
