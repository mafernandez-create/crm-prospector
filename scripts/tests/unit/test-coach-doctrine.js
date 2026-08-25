// Unit tests para redesign/coach-doctrine.js — la doctrina FerroCom Coach
// vendorizada que alimenta el generador de correos con IA de la ficha.
//
// Lo que se protege aquí es lo que se rompe en silencio:
//   - que el bloque 0 siga siendo INVARIANTE (si deja de serlo, el prompt
//     caching deja de funcionar y nadie se entera: solo sube la factura),
//   - que supere el mínimo cacheable (~1024 tokens),
//   - que las PREFERENCIAS de Manolo ganen al dato genérico cuando chocan,
//   - que las muletillas prohibidas no se cuelen en la doctrina.

const path = require('path');
const A    = require('../_lib/assert');

A.reset();

// El módulo es un IIFE que se cuelga de window: se simula el global y se carga.
global.window = {};
require(path.resolve(__dirname, '..', '..', '..', 'redesign', 'coach-doctrine.js'));
const C = global.window.CoachDoctrine;

// ── 1) El módulo se expone entero ──────────────────────────────────────────
A.truthy(C, 'CoachDoctrine se cuelga de window');
A.isType(C.build, 'function', 'expone build()');
A.isType(C.buildPlano, 'function', 'expone buildPlano() (fallback sin caché)');
A.isType(C.detectarPerfil, 'function', 'expone detectarPerfil()');
A.isType(C.saludo, 'function', 'expone saludo()');
A.matches(C.VERSION, /^\d+\.\d+\.\d+$/, 'VERSION tiene forma semver');

// ── 2) Estructura del prompt y prompt caching ──────────────────────────────
const r = C.build({ tipo: 'seguimiento', perfil: 'Arquitecto / proyectista' });
A.eq(r.system.length, 2, 'build() devuelve exactamente 2 bloques de system');
A.truthy(r.system[0].cache_control, 'el bloque 0 lleva cache_control');
// TTL de 1h, no los 5 min por defecto: verificado en vivo que el proxy lo respeta
// (ephemeral_1h_input_tokens > 0). Con 5 min la caché expiraría entre correo y
// correo y el cache_control sería decorativo.
A.eq(r.system[0].cache_control.ttl, '1h', 'la caché usa TTL de 1h, no el de 5 min por defecto');
A.falsy(r.system[1].cache_control, 'el bloque 1 (variable) NO lleva cache_control');

// El bloque 0 debe ser idéntico byte a byte pase lo que pase: es lo que se cachea.
const variantes = [
  C.build({ tipo: 'primera',       perfil: 'Ingeniería del agua / obra civil' }),
  C.build({ tipo: 'reactivacion',  perfil: 'Constructora / promotora', interno: true }),
  C.build({ tipo: 'agradecimiento', perfil: 'X', conAuditor: false }),
];
const base = r.system[0].text;
for (const v of variantes) {
  A.eq(v.system[0].text, base, 'bloque 0 invariante para tipo=' + v.tipo);
}

// Mínimo cacheable de Anthropic: ~1024 tokens. Por debajo, la caché no entra
// y el cache_control es decorativo. Se estima a 4/3 tokens por palabra.
const tokensAprox = txt => Math.round(txt.trim().split(/\s+/).length * 4 / 3);
A.greaterThan(tokensAprox(base), 1024, 'el bloque 0 supera el mínimo cacheable (~1024 tok)');

// ── 3) Precedencia PREFERENCIAS > CORREO_FRIO ─────────────────────────────
// Conflicto real: CORREO_FRIO dice 50-125 palabras, PREFERENCIAS dice 200-230
// por decisión de Manolo (24-ago-2026). Debe ganar PREFERENCIAS, y decirlo.
A.contains(base, '200-230', 'el núcleo fija la longitud de correo frío de Manolo (200-230)');
A.matches(base, /PREVALECE|manda|prevalece/i, 'el núcleo declara la precedencia de forma explícita');
const frio = C.build({ tipo: 'primera', perfil: 'Arquitecto / proyectista' });
A.truthy(frio.esFrio, 'tipo "primera" se marca como correo en frío');
A.contains(frio.system[1].text, 'F6', 'el correo en frío arrastra su rúbrica F1-F6');
A.contains(frio.system[1].text, '200-230', 'la ficha de frío repite la longitud correcta, no la genérica');

// ── 4) Muletillas prohibidas: no deben aparecer como texto a imitar ───────
// Aparecen listadas como prohibidas, pero nunca dentro de un bloque de ejemplo.
A.contains(base, 'quedo a la espera de sus gratas noticias', 'la lista de muletillas prohibidas está presente');
const bloquesFragmentos = C.build({ tipo: 'catalogo', perfil: 'X' }).system[1].text;
A.falsy(
  /no dude en ponerse en contacto/i.test(bloquesFragmentos),
  'los fragmentos reutilizables no contienen muletillas prohibidas'
);

// ── 5) Firma canónica (PREFERENCIAS, cuatro líneas con las dos marcas) ────
// Firma verificada el 25-ago-2026 contra los correos realmente enviados desde
// ma.fernandez@grupogpf.com. La doctrina la tenía mal y el CRM firmaba mal en
// producción: decía "Prescripción" y una línea de marcas que Manolo no usa.
A.contains(C.FIRMA_CLIENTE, 'Reciban un cordial saludo', 'firma: cierre formal correcto');
A.contains(C.FIRMA_CLIENTE, 'Manuel Fernández García', 'firma: nombre completo');
A.contains(C.FIRMA_CLIENTE, 'Promotor/Prescriptor.', 'firma: el cargo real, con el punto final');
A.contains(C.FIRMA_CLIENTE, 'Ctra. Atarfe a Sta. Fe s/n, 18230 Atarfe, Granada', 'firma: dirección postal');
A.contains(C.FIRMA_CLIENTE, 'T. +34 958438611', 'firma: teléfono fijo');
A.contains(C.FIRMA_CLIENTE, 'M. +34 647403603', 'firma: móvil');
A.contains(C.FIRMA_CLIENTE, 'ma.fernandez@grupogpf.com', 'firma: correo corporativo');
A.falsy(/Delegado Zona Sur/.test(C.FIRMA_CLIENTE), 'firma: NO usa el cargo de las plantillas estáticas retiradas');
A.falsy(/^Prescripción$/m.test(C.FIRMA_CLIENTE), 'firma: NO usa "Prescripción" a secas (era el error de la doctrina)');
A.falsy(/Ferroplast · Tuyper/.test(C.FIRMA_CLIENTE), 'firma: NO lleva la línea de marcas que Manolo no usa');
// El bloque de firma es el mismo en interno; lo que cambia es el cierre.
A.contains(C.FIRMA_INTERNA, 'Un abrazo', 'firma interna: cierre cercano');
A.contains(C.FIRMA_INTERNA, 'Manolo', 'firma interna: nombre corto');
A.contains(C.FIRMA_INTERNA, 'M. +34 647403603', 'firma interna: mantiene el bloque completo (es la firma de Mail)');

// ── Corpus de voz: real, presente y SIN nombres (este fichero se sirve público) ──
const nucleo = C.build({ tipo: 'seguimiento', perfil: 'X' }).system[0].text;
A.contains(nucleo, 'CORPUS DE VOZ', 'el núcleo incluye el corpus de voz');
A.contains(nucleo, 'me ahorráis medio día de rastreo', 'el corpus trae frases textuales suyas');
A.contains(nucleo, 'LA EXTENSIÓN SE GANA', 'el corpus destila los rasgos de su voz');
A.falsy(/inventado|EJEMPLO ILUSTRATIVO/i.test(nucleo), 'no queda rastro del ejemplo inventado');
// coach-doctrine.js se descarga sin login desde GitHub Pages: aquí no puede haber
// nombres de clientes ni de particulares. Si esto falla, hay una fuga de datos.
const nombresProhibidos = ['We Project', 'DAIA', 'Slow Beach', 'Harmonia', 'van Veen',
  'Aalt', 'La Herradura', 'Jarquil', 'Guadalsur', 'Zurita', 'Vilar', 'Vilella'];
for (const n of nombresProhibidos) {
  A.falsy(nucleo.indexOf(n) >= 0, 'privacidad: el núcleo público no filtra "' + n + '"');
}

// ── 6) detectarPerfil() sobre formas reales del CRM ───────────────────────
const casos = [
  [{ name: 'Estudio de Arquitectura Pérez', type: 'estudio_arquitectura' }, 'Arquitecto / proyectista'],
  [{ name: 'Ingeniería Hidráulica del Sur', type: 'ingenieria' },           'Ingeniería del agua / obra civil'],
  [{ name: 'Comunidad de Regantes de Lorca', type: '' },                    'Comunidad de regantes'],
  [{ name: 'Aqualia Gestión Integral del Agua', type: '' },                 'Operador del ciclo del agua'],
  [{ name: 'Promotora Costa del Sol', type: 'promotora' },                  'Constructora / promotora'],
  [{ name: 'Ayuntamiento de Antequera', type: '' },                         'Técnico municipal'],
];
for (const [studio, esperado] of casos) {
  A.eq(C.detectarPerfil(studio), esperado, 'detectarPerfil: ' + studio.name);
}
// Códigos de tipo del CRM: mandan sobre el nombre. Sin este mapa, el 28% de la
// cartera (517 de 1.842, medido en vivo) caía al perfil genérico.
const codigos = [
  ['ARQ',  'Bueno & Asociados SLP',   'Arquitecto / proyectista'],
  ['ING',  'Ingenostrum SL',          'Ingeniería del agua / obra civil'],
  ['OCV',  'RECO Construcciones',     'Constructora / promotora'],
  ['CICA', 'Aguas de Jaén',           'Operador del ciclo del agua'],
  ['CCRR', 'CR del Genil',            'Comunidad de regantes'],
  ['AAPP', 'Diputación de Cádiz',     'Técnico municipal'],
];
for (const [code, name, esperado] of codigos) {
  A.eq(C.detectarPerfil({ type: code, name }), esperado, 'código ' + code + ' → ' + esperado);
}
A.eq(C.detectarPerfil({ type: 'arq', name: 'X' }), 'Arquitecto / proyectista',
  'el código de tipo no distingue mayúsculas');
A.eq(C.detectarPerfil({ type: { valor: 'CCRR', fuente_url: 'x' }, name: 'X' }), 'Comunidad de regantes',
  'el código funciona también en la forma {valor, fuente_url}');
// El código gana al nombre: una ficha ARQ cuyo nombre suene a constructora
// sigue siendo arquitecto, porque el tipo es dato clasificado a mano.
A.eq(C.detectarPerfil({ type: 'ARQ', name: 'Construcciones y Promociones del Sur' }),
  'Arquitecto / proyectista', 'el código de tipo tiene prioridad sobre el nombre');

A.eq(C.detectarPerfil({ name: 'Nosecuántos SL', type: '' }),
  'Decisor técnico (perfil no identificado)', 'detectarPerfil: fallback documentado');
A.eq(C.detectarPerfil(null), 'Decisor técnico (perfil no identificado)', 'detectarPerfil: tolera null');

// Campos que llegan como {valor, fuente_url} — forma habitual en este CRM.
A.eq(
  C.detectarPerfil({ name: 'Anónima', type: { valor: 'comunidad de regantes', fuente_url: 'x' } }),
  'Comunidad de regantes',
  'detectarPerfil: acepta campos {valor, fuente_url}'
);

// ── 7) saludo(): apellido, no nombre de pila (PREFERENCIAS) ───────────────
A.eq(C.saludo({ team: [{ name: 'Javier Ruiz Zurita' }] }), 'Estimado Sr. Ruiz Zurita:',
  'saludo: usa el apellido, no el nombre de pila');
A.eq(C.saludo({ team: [{ name: 'Javier' }] }), 'Estimados señores:',
  'saludo: sin apellido conocido cae al genérico, no inventa');
A.eq(C.saludo({}), 'Estimados señores:', 'saludo: sin contacto usa el genérico');
A.eq(C.saludo({ team: [{ name: 'Javier Vilar' }] }, true), 'Hola Javier:',
  'saludo: en interno tutea y usa el nombre de pila');

// ── 8) Todos los arquetipos construyen y traen su esqueleto ───────────────
const tipos = Object.keys(C.TIPOS);
A.greaterThan(tipos.length, 5, 'hay al menos 6 arquetipos definidos');
for (const t of tipos) {
  const b = C.build({ tipo: t, perfil: 'X' });
  A.eq(b.tipo, t, 'build() respeta el tipo "' + t + '"');
  A.contains(b.system[1].text, 'ARQUETIPO', 'tipo "' + t + '" incluye su esqueleto');
  A.contains(b.system[1].text, '"subject"', 'tipo "' + t + '" pide el JSON de salida');
  A.contains(b.system[1].text, '"aviso"', 'tipo "' + t + '" pide el campo aviso del coach');
}
// Un tipo desconocido no debe reventar: cae a seguimiento.
A.eq(C.build({ tipo: 'no-existe', perfil: 'X' }).tipo, 'seguimiento',
  'build() con tipo desconocido cae a seguimiento en vez de romper');

// ── 9) buildPlano(): mismo contenido, un solo string (proxy sin arrays) ───
const plano = C.buildPlano({ tipo: 'seguimiento', perfil: 'Arquitecto / proyectista' });
A.isType(plano.system, 'string', 'buildPlano devuelve system como string');
A.contains(plano.system, base.slice(0, 120), 'buildPlano conserva el núcleo íntegro');
A.contains(plano.system, '"subject"', 'buildPlano conserva las instrucciones de salida');

const s = A.summary();
console.log(JSON.stringify(s));
process.exit(s.failed > 0 ? 1 : 0);
