/* CRM Prospector · rediseño v1 · Fase C4 — Briefing (lectura) iPhone-first
 *
 * Origen: handoff mobile-screens.jsx · ScreenBriefing
 *
 * Estructura:
 *   - Header sticky (paper-warm):
 *     ← back · [Sun][Save]
 *     eyebrow "Briefing · 22 may 2026"
 *     h2 nombre empresa (display 22px, no-uppercase)
 *   - Body scrolleable con tipo grande (17px line-height 1.6) para sol:
 *     · 3 key facts row: Ubicación / Cuadrante / Score
 *     · 8 secciones del briefing narrativo:
 *       01 · Resumen ejecutivo
 *       02 · Histórico reciente
 *       03 · Compromisos abiertos
 *       04 · Señales de mercado
 *       05 · Perfil decisor
 *       06 · Capa sectorial
 *       07 · Próximos pasos
 *       08 · Riesgos
 *   - CTA flotante bottom: "Empezar informe de la visita" (azul GPF + shadow)
 *
 * Datos: Fase C4 = mock fijo. Fase G leerá `briefings/{id}/items/` (último).
 */
(function () {
  'use strict';

  const I = window.Icon;
  const State = window.State;
  const U = window.Util;
  const escape = U.escapeHtml;

  /* ============================================================
     MOCK CATALOG (Fase C4)
     ============================================================ */
  const MOCK = {
    '3012': {
      studio: 'J. Huesa Water Technology',
      fecha: '22 may 2026',
      keyFacts: [
        { label: 'Ubicación', value: 'Bollullos' },
        { label: 'Cuadrante', value: 'Q9 · Congelar' },
        { label: 'Influencia', value: '3 pts · baja' },
      ],
      secciones: {
        'Resumen ejecutivo':
          'Ingeniería en Bollullos ubicada en cuadrante <strong>Q9 (Congelar)</strong> con scoring bajo en influencia directa (3 pts) y red (0 pts). Primera visita para evaluar potencial real y detectar oportunidades no identificadas en el scoring inicial.',
        'Histórico reciente':
          '<em>Primera visita — sin historial registrado.</em>',
        'Compromisos abiertos':
          '<ul style="margin:0; padding-left:18px;"><li>Ninguno pendiente del comercial.</li></ul>',
        'Señales de mercado':
          'Datos insuficientes — no se han detectado adjudicaciones públicas recientes, cambios sectoriales específicos ni movimientos relevantes en redes profesionales del equipo. Conviene preparar la visita para extraer estos datos en persona.',
        'Perfil decisor':
          'Sin información concreta. El primer contacto debe identificar al socio o gerente que tome la decisión final sobre material de saneamiento e instalaciones hidráulicas.',
        'Capa sectorial':
          'No se han detectado prescriptores sectoriales en la zona Bollullos que estén usando ya GPF en proyectos comparables. Oportunidad de prescripción virgen.',
        'Próximos pasos':
          '<ol style="margin:0; padding-left:18px;"><li>Identificar al decisor en la visita.</li><li>Mostrar catálogo MUTE + BIOPIPE.</li><li>Si hay receptividad, enviar muestra técnica y agendar segunda visita.</li></ol>',
        'Riesgos':
          'Riesgo bajo: cuadrante Q9 implica que si la visita no genera interés, mover a "Congelar" sin más esfuerzo. Sin coste de oportunidad alto.',
      },
    },
    '2435': {
      studio: 'ARRAM Consultores',
      fecha: '21 may 2026',
      keyFacts: [
        { label: 'Ubicación', value: 'Badajoz' },
        { label: 'Cuadrante', value: 'Q4 · Puerta entrada' },
        { label: 'Influencia', value: '7 pts · alta' },
      ],
      secciones: {
        'Resumen ejecutivo':
          'Consultora de ingeniería extremeña con histórico en proyectos PRTR. Cuadrante <strong>Q4 (Puerta de entrada)</strong>. Última visita 10 mar 2026, pendiente de reactivar tras conexión LinkedIn aceptada hace 7 días.',
        'Histórico reciente':
          'Última visita 10/03/2026 con Antonio Ramírez (jefe de proyectos). Mostraron interés en MUTE para vivienda colectiva pero el proyecto se aplazó por demoras administrativas. Conexión LinkedIn aceptada el 15/05/2026.',
        'Compromisos abiertos':
          '<ul style="margin:0; padding-left:18px;"><li>Enviar tarifa MUTE actualizada (pendiente desde marzo).</li><li>Confirmar fecha de próxima visita.</li></ul>',
        'Señales de mercado':
          'PRTR Extremadura adjudicó 3 contratos relacionados en abril-mayo 2026 en zonas donde ARRAM redacta proyectos. Probable demanda en Q3/Q4 2026.',
        'Perfil decisor':
          'Antonio Ramírez (jefe proyectos) — receptivo a MUTE. Quien aprueba contrato es la directora gerente Marta López (no presente en visita marzo).',
        'Capa sectorial':
          'Compite con ALFA Ingeniería en Badajoz, que ya prescribe Geberit. Oportunidad si pasamos del jefe de proyectos a la directora gerente con casos de éxito comparables.',
        'Próximos pasos':
          '<ol style="margin:0; padding-left:18px;"><li>Email con tarifa MUTE actualizada hoy mismo.</li><li>Llamada esta semana para fijar visita.</li><li>Preparar 2 casos de éxito en vivienda colectiva similar.</li></ol>',
        'Riesgos':
          'Riesgo medio: si no contactamos esta semana, el momentum LinkedIn se enfría. Atrasada 7 días en la bandeja del agente.',
      },
    },
  };

  function getBriefingSync(id, studioName) {
    // Mock o fallback sin tener que esperar al fetch
    if (MOCK[id]) return MOCK[id];
    return {
      studio: studioName || ('Estudio ' + id),
      fecha: U.formatDateES(new Date()),
      keyFacts: keyFactsFromStudio(id),
      secciones: {
        'Resumen ejecutivo': '<em>Cargando briefing del servidor… si no hay ninguno, genera uno con IA desde la ficha.</em>',
      },
    };
  }

  async function fetchBriefingReal(id) {
    // Fase G: lee briefings/{id}/items/ y devuelve el más reciente normalizado.
    // Soporta dos formatos:
    //   - v1 (legacy): briefing = { resumen_ejecutivo, historico_reciente, ... }
    //   - v2 (Bloque 9 §19.2): markdown = "# Briefing pre-visita - ...\n..."
    if (!window.Data || !window.Data.getBriefingItems) return null;
    const items = await window.Data.getBriefingItems(id, 10);
    if (!items.length) return null;
    items.sort(function (a, b) { return String(b.id || '').localeCompare(String(a.id || '')); });
    const latest = items[0];

    const studioLabel = (State.studiosById[id] && State.studiosById[id].name) || ('Estudio ' + id);
    const fechaLabel = U.formatDateES(latest.id) || U.formatDateES(latest.updatedAt) || U.formatDateES(new Date());

    // ── markdown (v2 o v3) ───────────────────────────────────────
    if (latest.markdown) {
      return {
        studio: studioLabel,
        fecha: fechaLabel,
        keyFacts: keyFactsFromStudio(id),
        markdown: latest.markdown,
        formato: latest.formato || 'markdown_v2',
      };
    }

    // ── v1 legacy JSON ───────────────────────────────────────────
    const b = (latest.briefing && typeof latest.briefing === 'object') ? latest.briefing : {};
    return {
      studio: studioLabel,
      fecha: fechaLabel,
      keyFacts: keyFactsFromStudio(id),
      secciones: {
        'Resumen ejecutivo':   b.resumen_ejecutivo  || b.resumen   || b.summary || '<em>Sin contenido en esta sección.</em>',
        'Histórico reciente':  b.historico_reciente || b.historico || '<em>Sin contenido en esta sección.</em>',
        'Compromisos abiertos': b.compromisos_abiertos || b.compromisos || '<em>Sin contenido en esta sección.</em>',
        'Señales de mercado':  b['señales_mercado']  || b.senales_mercado || b['señales'] || '<em>Sin contenido en esta sección.</em>',
        'Perfil decisor':      b.perfil_decisor || b.decisor || '<em>Sin contenido en esta sección.</em>',
        'Capa sectorial':      b.sectorial || b.capa_sectorial || '<em>Sin contenido en esta sección.</em>',
        'Próximos pasos':      b.proximos_pasos || b.next_steps || '<em>Sin contenido en esta sección.</em>',
        'Riesgos':             b.riesgos || b.risks || '<em>Sin contenido en esta sección.</em>',
      },
    };
  }

  /* Mini-parser markdown → HTML. Soporta: # ## ### headings, párrafos,
     listas - y 1., negrita **, italic _, código `, blockquote >, ---. */
  function md2html(src) {
    if (!src) return '';
    const lines = String(src).split('\n');
    const out = [];
    let inList = false, listOrdered = false;
    function closeList() {
      if (inList) { out.push(listOrdered ? '</ol>' : '</ul>'); inList = false; }
    }
    function inline(s) {
      // Negrita ** -> <strong>
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      // Italic _foo_
      s = s.replace(/(^|\s)_([^_]+)_(\s|[.,;:!?]|$)/g, '$1<em>$2</em>$3');
      // Inline code `x`
      s = s.replace(/`([^`]+)`/g, '<code style="background:rgba(10,45,82,.06); padding:0.1em 0.35em; border-radius:3px; font-size:0.9em;">$1</code>');
      // Links [txt](url)
      s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
      return s;
    }
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const line = raw.replace(/\s+$/, '');
      // Headings
      if (/^###\s+/.test(line)) { closeList(); out.push('<h4 style="font-family:var(--font-display); font-size:14px; font-weight:600; color:var(--gpf-blue-700); margin:18px 0 6px;">' + inline(line.replace(/^###\s+/, '')) + '</h4>'); continue; }
      if (/^##\s+/.test(line))  { closeList(); out.push('<h3 style="font-family:var(--font-display); font-size:15px; letter-spacing:0.10em; text-transform:uppercase; color:var(--gpf-blue-900); margin:24px 0 10px; font-weight:700;">' + inline(line.replace(/^##\s+/, '')) + '</h3>'); continue; }
      if (/^#\s+/.test(line))   { closeList(); out.push('<h2 style="font-family:var(--font-display); font-size:24px; font-weight:600; color:var(--fg-1); margin:0 0 16px;">' + inline(line.replace(/^#\s+/, '')) + '</h2>'); continue; }
      // Separador
      if (/^---+\s*$/.test(line)) { closeList(); out.push('<hr style="border:0; border-top:1px solid var(--line); margin:18px 0;">'); continue; }
      // Blockquote
      if (/^>\s?/.test(line)) {
        closeList();
        out.push('<blockquote style="border-left:3px solid var(--gpf-blue-700); padding:6px 14px; margin:12px 0; background:rgba(10,45,82,.04); color:var(--fg-2); font-style:italic;">' + inline(line.replace(/^>\s?/, '')) + '</blockquote>');
        continue;
      }
      // Listas
      const mUl = line.match(/^[\-\*]\s+(.*)$/);
      const mOl = line.match(/^(\d+)\.\s+(.*)$/);
      if (mUl) {
        if (!inList || listOrdered) { closeList(); out.push('<ul style="margin:6px 0 12px 22px; padding:0;">'); inList = true; listOrdered = false; }
        out.push('<li style="margin:3px 0;">' + inline(mUl[1]) + '</li>');
        continue;
      }
      if (mOl) {
        if (!inList || !listOrdered) { closeList(); out.push('<ol style="margin:6px 0 12px 22px; padding:0;">'); inList = true; listOrdered = true; }
        out.push('<li style="margin:3px 0;">' + inline(mOl[2]) + '</li>');
        continue;
      }
      // Línea vacía
      if (line.trim() === '') { closeList(); continue; }
      // Párrafo normal
      closeList();
      out.push('<p style="margin:0 0 10px;">' + inline(line) + '</p>');
    }
    closeList();
    return out.join('\n');
  }

  function normQuadrantLocal(v) {
    if (v == null) return null;
    if (typeof v === 'string' && /^Q[1-9]$/.test(v)) return v;
    if (typeof v === 'number' && v >= 1 && v <= 9) return 'Q' + v;
    if (typeof v === 'string' && /^[1-9]$/.test(v)) return 'Q' + v;
    return null;
  }

  function keyFactsFromStudio(id) {
    const s = State.studiosById[id];
    if (!s) return [
      { label: 'Ubicación',  value: '—' },
      { label: 'Cuadrante',  value: '—' },
      { label: 'Influencia', value: '—' },
    ];
    return [
      { label: 'Ubicación',  value: s.city || s.province || '—' },
      { label: 'Cuadrante',  value: s.priorityQuadrantName || normQuadrantLocal(s.priorityQuadrant) || s.cuadrante || s.quadrant || '—' },
      { label: 'Score',      value: String(s.score || '—') },
    ];
  }

  /* ============================================================
     RENDER
     ============================================================ */
  function render(params) {
    const v = document.getElementById('view-briefing');
    if (!v) return;
    const id = (params && params.studioId) || State.currentStudioId || '3012';
    const studioName =
      (State.studiosById && State.studiosById[id] && State.studiosById[id].name) || null;
    State.currentStudioId = id;

    // 1. Pintar inmediatamente con mock o "Cargando…"
    const b0 = getBriefingSync(id, studioName);
    document.getElementById('topbar-current').textContent = 'Briefing · ' + b0.studio;
    const isMobile = window.innerWidth < 768;
    v.innerHTML = isMobile ? renderMobile(id, b0) : renderDesktopColumn(id, b0);
    wireCTAs(id);

    // 2. Intentar fetch real en background (Fase G)
    if (window.Data && window.Data.getBriefingItems) {
      fetchBriefingReal(id).then(function (real) {
        if (real) {
          v.innerHTML = isMobile ? renderMobile(id, real) : renderDesktopColumn(id, real);
          wireCTAs(id);
          console.info('[redesign/briefing] cargado desde Firestore para ' + id);
        }
      }).catch(function (e) {
        console.warn('[redesign/briefing] fetch fallido:', e.message);
      });
    }
  }

  function bodyContent(b) {
    // v2: markdown directo. v1: secciones por clave.
    if (b.markdown) {
      return md2html(b.markdown);
    }
    return seccionesBlock(b.secciones);
  }

  /* Cabecera/pie SOLO visibles al imprimir (clase .print-only).
     Inspiración: planning_murcia_abril_2026.html — banda azul GPF +
     metadatos clientes. */
  function printChrome(b) {
    const studioName = b.studio || '';
    const fecha = b.fecha || U.formatDateES(new Date());
    const provincia = (State.studiosById && State.studiosById[State.currentStudioId] &&
      State.studiosById[State.currentStudioId].province) || '';
    const cuadrante = (State.studiosById && State.studiosById[State.currentStudioId] &&
      State.studiosById[State.currentStudioId].priorityQuadrantName) || '';
    return (
      '<div class="print-only print-header">' +
        '<div class="print-brand">FERROPLAST · TUYPER</div>' +
        '<div class="print-doc-type">Briefing pre-visita</div>' +
      '</div>' +
      '<h1 class="print-only print-title">' + escape(studioName) + '</h1>' +
      '<div class="print-only print-meta">' +
        '<span><strong>Fecha visita:</strong> ' + escape(fecha) + '</span>' +
        (provincia ? '<span><strong>Provincia:</strong> ' + escape(provincia) + '</span>' : '') +
        (cuadrante ? '<span><strong>Cuadrante:</strong> ' + escape(cuadrante) + '</span>' : '') +
        '<span><strong>Generado:</strong> ' + escape(new Date().toLocaleDateString('es-ES')) + '</span>' +
      '</div>'
    );
  }

  /* ============================================================
     MOBILE — iPhone frame con header sticky
     ============================================================ */
  function renderMobile(id, b) {
    return (
      printChrome(b) +
      '<div class="iphone-frame">' +
        statusBar() +

        // Header sticky paper-warm
        '<div style="position:sticky; top:0; padding:14px var(--sp-4); background:var(--paper-warm); ' +
          'border-bottom:1px solid var(--line); flex:0 0 auto; z-index:5;">' +
          headerActions(id) +
          headerTitle(b) +
        '</div>' +

        // Body scroll con tipo grande para sol
        '<div style="flex:1; overflow:auto; padding:20px 22px 130px; font-size:17px; line-height:1.6; color:var(--fg-1);" class="briefing-body">' +
          keyFactsRow(b.keyFacts) +
          bodyContent(b) +
        '</div>' +

        ctaFlotante(id) +
        '<div class="home-indicator"></div>' +
      '</div>'
    );
  }

  function renderDesktopColumn(id, b) {
    // Helper para inyectar bodyContent en desktop sin tocar resto
    return (
      printChrome(b) +
      '<div style="max-width:760px; margin:0 auto;">' +
        '<div style="padding:14px 0 18px; border-bottom:1px solid var(--line); margin-bottom:24px;">' +
          headerActions(id) +
          headerTitle(b) +
        '</div>' +
        '<div style="font-size:16px; line-height:1.6; color:var(--fg-1);" class="briefing-body">' +
          keyFactsRow(b.keyFacts) +
          bodyContent(b) +
        '</div>' +
        '<div style="position:sticky; bottom:0; padding:16px 0 24px; ' +
          'background:linear-gradient(to bottom, transparent, var(--bg-app) 30%);">' +
          ctaBtn(id) +
        '</div>' +
      '</div>'
    );
  }

  /* ============================================================
     BLOQUES
     ============================================================ */
  function statusBar() {
    return (
      '<div class="statusbar">' +
        '<span style="font-variant-numeric:tabular-nums; font-weight:600; font-size:15px;">9:41</span>' +
        '<span class="right">' +
          '<span class="icon" style="width:17px; height:11px;">' + I.Signal() + '</span>' +
          '<span class="icon" style="width:15px; height:11px;">' + I.Wifi() + '</span>' +
          '<span class="icon" style="width:25px; height:12px;">' + I.Battery() + '</span>' +
        '</span>' +
      '</div>'
    );
  }

  function headerActions(id) {
    return (
      '<div style="display:flex; align-items:center; justify-content:space-between;">' +
        '<button class="back-btn" style="margin-left:-6px;" ' +
          'onclick="showView(\'detail\', { studioId: \'' + escape(id) + '\' })" aria-label="Volver">' +
          I.ArrowLeft() + ' <span>Atrás</span>' +
        '</button>' +
        '<div class="briefing-toolbar" style="display:flex; gap:4px;">' +
          '<button aria-label="Descargar Word" title="Descargar Word (.doc)" ' +
            'onclick="window.Screens.briefing.descargarDOC(\'' + escape(id) + '\')" ' +
            'style="width:44px; height:44px; background:transparent; border:0; color:var(--fg-2); border-radius:8px; cursor:pointer; font-weight:600; font-family:var(--font-mono); font-size:11px;">' +
            'W' +
          '</button>' +
          '<button aria-label="Descargar markdown" title="Descargar Markdown (.md)" ' +
            'onclick="window.Screens.briefing.descargarMD(\'' + escape(id) + '\')" ' +
            'style="width:44px; height:44px; background:transparent; border:0; color:var(--fg-2); border-radius:8px; cursor:pointer;">' +
            I.Download() +
          '</button>' +
          '<button aria-label="Imprimir o guardar PDF" title="Imprimir o Guardar como PDF (⌘P)" ' +
            'onclick="window.print()" ' +
            'style="width:44px; height:44px; background:transparent; border:0; color:var(--fg-2); border-radius:8px; cursor:pointer;">' +
            I.Printer() +
          '</button>' +
        '</div>' +
      '</div>'
    );
  }

  function headerTitle(b) {
    return (
      '<div style="margin-top:4px; padding-left:2px;">' +
        '<div class="eyebrow" style="margin-bottom:2px;">Briefing · ' + escape(b.fecha) + '</div>' +
        '<h2 style="font-family:var(--font-display); font-weight:600; font-size:22px; color:var(--fg-1); ' +
          'letter-spacing:-0.01em; text-transform:none; line-height:1.15; margin:0;">' +
          escape(b.studio) +
        '</h2>' +
      '</div>'
    );
  }

  function keyFactsRow(facts) {
    return (
      '<div style="display:flex; gap:18px; margin-bottom:24px; padding-bottom:18px; border-bottom:1px solid var(--line);">' +
        facts.map(function (f) {
          return (
            '<div style="flex:1; min-width:0;">' +
              '<div style="font-size:11px; color:var(--fg-3); letter-spacing:0.14em; ' +
                'text-transform:uppercase; font-weight:600; margin-bottom:3px;">' +
                escape(f.label) +
              '</div>' +
              '<div style="font-family:var(--font-display); font-size:17px; font-weight:600; ' +
                'color:var(--fg-1); letter-spacing:-0.005em; line-height:1.1;">' +
                escape(f.value) +
              '</div>' +
            '</div>'
          );
        }).join('') +
      '</div>'
    );
  }

  function seccionesBlock(secciones) {
    const ORDER = [
      'Resumen ejecutivo',
      'Histórico reciente',
      'Compromisos abiertos',
      'Señales de mercado',
      'Perfil decisor',
      'Capa sectorial',
      'Próximos pasos',
      'Riesgos',
    ];
    return ORDER.map(function (name, i) {
      const num = String(i + 1).padStart(2, '0');
      const contenido = secciones[name];
      if (!contenido) return '';
      return (
        '<h3 style="font-family:var(--font-display); font-size:13px; letter-spacing:0.18em; ' +
          'text-transform:uppercase; color:var(--gpf-blue-700); margin:0 0 10px; font-weight:700;">' +
          num + ' · ' + escape(name) +
        '</h3>' +
        '<div style="margin-bottom:22px; color:var(--fg-2);">' + contenido + '</div>'
      );
    }).join('');
  }

  function ctaBtn(id) {
    return (
      '<button class="btn btn-primary btn-block btn-lg" ' +
        'style="box-shadow:0 8px 24px rgba(10,45,82,.25);" ' +
        'onclick="showView(\'informe\', { studioId: \'' + escape(id) + '\' })">' +
        I.Edit() + ' Tras la visita · Redactar informe' +
      '</button>'
    );
  }

  function ctaFlotante(id) {
    // Posicionado absoluto sobre el iphone-frame
    return (
      '<div style="position:absolute; left:16px; right:16px; bottom:calc(var(--safe-bot) + 12px); z-index:10;">' +
        ctaBtn(id) +
      '</div>'
    );
  }

  /* ============================================================
     CTAs (los onclick inline ya navegan; aquí solo placeholder
     para Sun/Save futuros)
     ============================================================ */
  function wireCTAs(id) {
    // Futuras acciones de Sun (modo lectura sol) y Save (guardar offline)
    // se cablearán en Fase G+ junto al data layer real.
  }

  /* ============================================================
     EXPORT
     ============================================================ */
  window.Screens = window.Screens || {};
  /* Descarga el briefing actual como .md (busca primero el cache de Data,
     y si no, vuelve a fetchear). */
  async function descargarMD(studioId) {
    let md = null, fecha = null;
    try {
      const items = await window.Data.getBriefingItems(studioId, 1);
      if (items && items[0]) {
        md = items[0].markdown || null;
        fecha = items[0].fecha_visita || (items[0].iso_date || '').slice(0, 10);
      }
    } catch (_) {}
    if (!md) {
      // Fallback: si el briefing en pantalla es legacy v1, generar markdown
      // a partir de las secciones renderizadas. Simple text dump.
      const v = document.getElementById('view-briefing');
      md = '# Briefing\n\n' + (v ? v.innerText : '(sin contenido)');
    }
    const studioName = (State.studiosById[studioId] && State.studiosById[studioId].name) || ('Estudio_' + studioId);
    const safeName = studioName.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    const filename = 'briefing_' + safeName + (fecha ? '_' + fecha : '') + '.md';
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }

  /* Descarga como .doc (Word abre HTML como documento). El truco: envolver
     el HTML con namespaces de Word y servirlo con extensión .doc — Word
     lo abre y permite guardar como .docx desde ahí. No requiere librería. */
  async function descargarDOC(studioId) {
    let md = null, fecha = null;
    try {
      const items = await window.Data.getBriefingItems(studioId, 1);
      if (items && items[0]) {
        md = items[0].markdown || null;
        fecha = items[0].fecha_visita || (items[0].iso_date || '').slice(0, 10);
      }
    } catch (_) {}
    const studioName = (State.studiosById[studioId] && State.studiosById[studioId].name) || ('Estudio_' + studioId);

    // Convertir el markdown a HTML usando el mismo md2html ya cargado
    let bodyHTML;
    if (md) {
      bodyHTML = md2html(md);
    } else {
      // Fallback: tomar el HTML ya renderizado en la vista
      const v = document.getElementById('view-briefing');
      bodyHTML = v ? v.innerHTML : '<p>Sin contenido.</p>';
    }

    // Word espera HTML con XML headers + namespaces. Estilos inspirados
    // en planning_murcia_abril_2026.html (banda azul GPF, headings con
    // fondo, blockquote con barra lateral). Word conserva los estilos
    // al guardar como .docx.
    const provincia = (State.studiosById[studioId] && State.studiosById[studioId].province) || '';
    const cuadrante = (State.studiosById[studioId] && State.studiosById[studioId].priorityQuadrantName) || '';
    const hoy = new Date().toLocaleDateString('es-ES');

    const portada =
      '<table style="width:100%; background:#0a2d52; color:white; padding:10pt 12pt; margin-bottom:4pt;">' +
        '<tr>' +
          '<td style="color:#aed6f1; font-size:9pt; letter-spacing:0.08em; font-weight:700;">FERROPLAST · TUYPER</td>' +
          '<td style="text-align:right; font-size:10pt; font-weight:600; text-transform:uppercase; letter-spacing:0.05em;">Briefing pre-visita</td>' +
        '</tr>' +
      '</table>' +
      '<h1 style="color:#0a2d52; font-family:Calibri,sans-serif; font-size:20pt; font-weight:700; margin:10pt 0 2pt 0; line-height:1.15;">' + escape(studioName) + '</h1>' +
      '<table style="width:100%; border-bottom:2pt solid #0a2d52; margin-bottom:14pt; padding-bottom:6pt; font-size:10pt; color:#555;">' +
        '<tr>' +
          '<td style="padding:4pt 0;"><strong style="color:#222;">Fecha visita:</strong> ' + escape(fecha || hoy) + '</td>' +
          (provincia ? '<td style="padding:4pt 0;"><strong style="color:#222;">Provincia:</strong> ' + escape(provincia) + '</td>' : '<td></td>') +
          (cuadrante ? '<td style="padding:4pt 0;"><strong style="color:#222;">Cuadrante:</strong> ' + escape(cuadrante) + '</td>' : '<td></td>') +
          '<td style="padding:4pt 0; text-align:right;"><strong style="color:#222;">Generado:</strong> ' + escape(hoy) + '</td>' +
        '</tr>' +
      '</table>';

    const wordHTML =
      '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
            'xmlns:w="urn:schemas-microsoft-com:office:word" ' +
            'xmlns="http://www.w3.org/TR/REC-html40">' +
        '<head>' +
          '<meta charset="utf-8">' +
          '<title>' + escape(studioName) + '</title>' +
          '<style>' +
            'body { font-family: Calibri, Arial, sans-serif; font-size: 10.5pt; line-height: 1.5; color: #222; }' +
            'h1 { color:#0a2d52; font-family:Calibri,sans-serif; }' +
            'h2 { background:#1f3a5a; color:white; padding:6pt 12pt; font-family:Calibri,sans-serif; font-size:13pt; font-weight:600; margin:14pt 0 6pt 0; }' +
            'h3 { color:#1f3a5a; font-family:Calibri,sans-serif; font-size:11pt; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; margin:10pt 0 4pt 0; padding-left:10pt; border-left:3pt solid #2e6da4; }' +
            'h4 { color:#2e6da4; font-size:10.5pt; font-weight:600; margin:8pt 0 3pt 0; }' +
            'blockquote { background:#e8f0f7; border-left:4pt solid #2e6da4; padding:6pt 12pt; margin:8pt 0; color:#1a3a5c; font-size:10pt; }' +
            'code { background:#f0f5fc; border:1px solid #d0d8e8; color:#0a2d52; padding:1pt 4pt; font-family:"Courier New",monospace; font-size:9.5pt; }' +
            'strong, b { color:#0a2d52; font-weight:600; }' +
            'ul, ol { margin: 4pt 0 6pt 22pt; }' +
            'li { margin: 2pt 0; }' +
            'p { margin: 3pt 0; }' +
            'hr { border:0; border-top:1pt solid #d0d8e8; margin: 12pt 0; }' +
            'a { color:#2e6da4; }' +
          '</style>' +
        '</head>' +
        '<body>' + portada + bodyHTML + '</body>' +
      '</html>';

    const safeName = studioName.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    const filename = 'briefing_' + safeName + (fecha ? '_' + fecha : '') + '.doc';
    const blob = new Blob(['﻿', wordHTML], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }

  window.Screens.briefing = { render: render, descargarMD: descargarMD, descargarDOC: descargarDOC };
})();
