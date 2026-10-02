// Normalización de nombres de municipio para cruzar el CRM con el Atlas del Agua.
//
// El CRM guarda el municipio en studios.city escrito a mano; el Atlas usa el
// nombre oficial del INE. Hay tres desajustes recurrentes:
//   1. artículo invertido: «Carlota, La» / «Carlota (La)» ↔ «La Carlota»
//   2. guión y barra: «Vélez-Málaga», «Alacant/Alicante»
//   3. apóstrofo catalán/valenciano: «Ràfol d'Almúnia» ↔ «Ráfol de Almunia»
//
// Esta es la copia canónica. La copia del navegador es Util.normMuni /
// Util.clavesMunicipio en redesign/app.js; el test
// scripts/tests/unit/test-muni-claves.js comprueba que no divergen.

const ARTS = "el|la|los|las|l'|els|es|sa|ses|a|o|as|os";
const RX_COMA = new RegExp(`^(.*), (${ARTS})$`, 'i');
const RX_PAREN = new RegExp(`^(.*?)\\s*\\((${ARTS})\\)$`, 'i');

/** Minúsculas, sin tildes, espacios colapsados. */
export function normMuni(s) {
  return (s || '')
    .replace(/[\u2019\u02bc\u00b4\u0060]/g, "'")
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** «Ejido, El» → «El Ejido»; «Carlota (La)» → «La Carlota». */
export function desinvertir(nombre) {
  const n = (nombre || '').trim();
  const m = n.match(RX_COMA) || n.match(RX_PAREN);
  if (!m) return n;
  const art = m[2].charAt(0).toUpperCase() + m[2].slice(1).toLowerCase();
  const base = m[1].trim();
  return art.endsWith("'") ? art + base : art + ' ' + base;
}

/** Quita el artículo inicial y expande d'/l' a «de »/«la ». */
function sinArticulo(k) {
  return k
    .replace(/\b([dln])'\s*/g, (_, l) => (l === 'd' ? 'de ' : l + 'a '))
    .replace(new RegExp(`^(${ARTS}) `, 'i'), '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Nombres castellanos que el INE retiró. El CRM los tiene escritos como se dicen
 * y como figuran en el rótulo del ayuntamiento; el Atlas usa el nombre oficial,
 * que es el único. No es una variante ortográfica —«Jalón» y «Xaló» no se parecen
 * en nada—, así que ninguna regla los puentea: hay que nombrarlos uno a uno.
 *
 * Los 15 primeros son los municipios de Alicante donde Manolo tiene ficha y el
 * cruce fallaba (2-oct-2026); el último es de Castellón, mismo caso, fuera de zona.
 * Comprobado contra los 8.213 municipios del Atlas:
 * ninguna de estas claves es el nombre real de otro municipio, así que añadirla
 * no puede robarle la coincidencia a nadie. Si se añade una nueva, repetir esa
 * comprobación antes.
 */
const EXONIMOS = {
  'adsubia':               "l'Atzúbia",
  'alcocer de planes':     'Alcosser',
  'alcolecha':             'Alcoleja',
  'alqueria de aznar':     "l'Alqueria d'Asnar",
  'benichembla':           'Benigembla',
  'benimasot':             'Benimassot',
  'callosa de ensarria':   "Callosa d'en Sarrià",
  'calpe':                 'Calp',
  'cuatretondeta':         'Quatretondeta',
  'facheca':               'Fageca',
  'gayanes':               'Gaianes',
  'guadalest':             'el Castell de Guadalest',
  'jalon':                 'Xaló',
  'valle de alcala':       "la Vall d'Alcalà",
  'vergel':                'el Verger',
  'castellon de la plana': 'Castelló de la Plana',
};

/** Mete en `out` todas las grafías de `nombre` (sin pasar por los exónimos). */
function _anadirClaves(nombre, out) {
  const base = [nombre, desinvertir(nombre)].filter(Boolean);
  for (const v of base) {
    for (const w of [v, v.replace(/-/g, ' ')]) {
      const k = normMuni(w);
      if (k) { out.add(k); const sa = sinArticulo(k); if (sa) out.add(sa); }
    }
    if (v.includes('/')) {
      for (const p of v.split('/')) {
        for (const w of [p, desinvertir(p)]) {
          const k = normMuni(w);
          if (k) { out.add(k); const sa = sinArticulo(k); if (sa) out.add(sa); }
        }
      }
    }
  }
}

/**
 * Todas las grafías normalizadas con las que un municipio puede aparecer.
 * El consumidor debe probar primero la coincidencia exacta con provincia.
 */
export function clavesMunicipio(nombre) {
  const out = new Set();
  _anadirClaves(nombre, out);
  // Una sola pasada: ningún nombre oficial es a su vez clave de EXONIMOS.
  for (const k of [...out]) {
    if (EXONIMOS[k]) _anadirClaves(EXONIMOS[k], out);
  }
  return [...out];
}
