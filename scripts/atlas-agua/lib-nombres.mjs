// ¿Este nombre de empresa ya está en el CRM? Coincidencia por nombre: siempre
// «posible», nunca un hecho. Copia única de la lógica, usada por el briefing
// (contexto-agua.mjs) y por el reparto de operadores (puente-operadores.mjs).
//
// Doctrina (memoria cruce-nombres-empresa-crm): el match normalizado se deja
// fichas. Un falso positivo cuesta un clic; un falso negativo, un alta
// duplicada. Así que se es generoso y se etiqueta la calidad del match:
//   '=' el núcleo del nombre coincide · '~' solo coincide una palabra propia.

import { normMuni } from './lib-muni.mjs';

// Las palabras del sector no distinguen a nadie: «Aguas y Servicios Costa Tropical»
// engancharía cualquier ficha con la palabra «servicios».
const GENERICAS = new Set(['agua', 'aguas', 'servicio', 'servicios', 'gestion', 'gestora',
  'grupo', 'empresa', 'sociedad', 'municipal', 'municipales', 'abastecimiento', 'saneamiento',
  'integral', 'integrales', 'tecnica', 'tecnicas', 'ciclo', 'consorcio', 'mancomunidad',
  'ayuntamiento', 'provincial', 'andalucia', 'publica', 'publicas', 'anonima',
  'ingenieria', 'ingenieros', 'ingeniero', 'arquitectura', 'arquitectos', 'proyecto',
  'proyectos', 'consultores', 'consultoria', 'estudio', 'asociados']);

// Las formas jurídicas tampoco distinguen: «CODEUR, S.A» y «Codeur» son la misma empresa.
const RX_JURIDICA = /\b(s\s*a\s*u?|s\s*l\s*[uple]*|s\s*c\s*[ap]*|ute|sll|slne|aie|coop|sociedad|limitada)\b/g;

/** Nombre reducido a su parte distintiva, en minúsculas y sin forma jurídica. */
export function nucleo(n) {
  return normMuni(n).replace(/[^a-z0-9ñ ]/g, ' ').replace(RX_JURIDICA, ' ')
                    .replace(/\s+/g, ' ').trim();
}

const palabra = (aguja, pajar) => new RegExp(`(^|[^a-z0-9ñ])${aguja}($|[^a-z0-9ñ])`).test(pajar);

/**
 * Nombres alternativos con los que buscar el mismo ente. El Atlas mete el alias
 * entre paréntesis o detrás de una barra —«Emproacsa (Aguas de Córdoba)»,
 * «Global Omnium / Aguas de Valencia»— y exigir todas las palabras a la vez
 * hacía invisible la ficha que sí existe (2293 EMPROACSA, 461 Aguas de Valencia).
 */
export function variantes(nombre) {
  const n = String(nombre || '').trim();
  if (!n) return [];
  const out = new Set([n]);
  const m = n.match(/^(.*?)\s*\((.+)\)\s*$/);
  if (m) { out.add(m[1].trim()); out.add(m[2].trim()); }
  [...out].forEach(v => {
    if (v.includes('/')) v.split('/').forEach(p => out.add(p.trim()));
  });
  return [...out].filter(v => nucleo(v).length >= 3);
}

/**
 * Indexa las fichas del CRM una vez y devuelve el buscador.
 * @param {Array<{id:string,name:string}>} todas  fichas del CRM
 */
/**
 * @param todas     fichas del CRM
 * @param toponimos nombres de sitio (ver lib-cruce.toponimos). Si lo único que
 *                  distingue a un nombre es un topónimo, solo valen las
 *                  coincidencias exactas: lo demás son vecinos del mismo pueblo.
 */
export function indexarNombres(todas, toponimos = new Set()) {
  const porNombre = todas.map(s => ({ s, nuc: nucleo(s.name) }));

  function _unaVariante(nuc) {
    const toks = nuc.split(' ').filter(t => t.length >= 4 && !GENERICAS.has(t));
    // Con dos o más palabras propias se exigen todas; con una sola basta esa palabra,
    // aunque arrastre vecinos.
    const cumple = toks.length
      ? x => toks.every(t => palabra(t, x.nuc))
      : x => palabra(nuc, x.nuc);
    return porNombre.filter(cumple).map(x => ({ ficha: x.s, exacta: x.nuc === nuc }));
  }

  /** Hasta `limite` candidatas, las exactas primero. Vacío = no la encuentro. */
  function candidatas(nombre, limite = 3) {
    const propias = nucleo(nombre).split(' ')
      .filter(t => t.length >= 4 && !GENERICAS.has(t));
    const soloExactas = propias.length > 0 && propias.every(t => toponimos.has(t));
    const vistas = new Map();
    for (const v of variantes(nombre)) {
      const nuc = nucleo(v);
      if (!nuc) continue;
      for (const c of _unaVariante(nuc)) {
        const prev = vistas.get(c.ficha.id);
        if (!prev) vistas.set(c.ficha.id, c);
        else if (c.exacta) prev.exacta = true;
      }
    }
    const res = soloExactas ? [...vistas.values()].filter(c => c.exacta) : [...vistas.values()];
    return res
      .sort((a, b) => (b.exacta - a.exacta) || String(a.ficha.name).length - String(b.ficha.name).length)
      .slice(0, limite);
  }

  /** Lo mismo, ya formateado para una tabla: «=3139 CODEUR, S.A». */
  function posibleFicha(nombre, limite = 3) {
    return candidatas(nombre, limite)
      .map(c => `${c.exacta ? '=' : '~'}${c.ficha.id} ${c.ficha.name}`);
  }

  return { candidatas, posibleFicha };
}
