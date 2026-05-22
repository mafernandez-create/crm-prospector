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

  function getBriefing(id, studioName) {
    // Fase G: aquí leeremos briefings/{id}/items/ y devolveremos el más reciente
    if (MOCK[id]) return MOCK[id];
    // Fallback genérico si llega un id sin mock
    return {
      studio: studioName || ('Estudio ' + id),
      fecha: U.formatDateES(new Date()),
      keyFacts: [
        { label: 'Ubicación', value: '—' },
        { label: 'Cuadrante', value: '—' },
        { label: 'Influencia', value: '—' },
      ],
      secciones: {
        'Resumen ejecutivo': '<em>Sin briefing generado todavía. Genera uno con IA desde la ficha.</em>',
      },
    };
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
    const b = getBriefing(id, studioName);

    document.getElementById('topbar-current').textContent = 'Briefing · ' + b.studio;
    State.currentStudioId = id;

    const isMobile = window.innerWidth < 768;
    v.innerHTML = isMobile ? renderMobile(id, b) : renderDesktopColumn(id, b);

    wireCTAs(id);
  }

  /* ============================================================
     MOBILE — iPhone frame con header sticky
     ============================================================ */
  function renderMobile(id, b) {
    return (
      '<div class="iphone-frame">' +
        statusBar() +

        // Header sticky paper-warm
        '<div style="position:sticky; top:0; padding:14px var(--sp-4); background:var(--paper-warm); ' +
          'border-bottom:1px solid var(--line); flex:0 0 auto; z-index:5;">' +
          headerActions(id) +
          headerTitle(b) +
        '</div>' +

        // Body scroll con tipo grande para sol
        '<div style="flex:1; overflow:auto; padding:20px 22px 130px; font-size:17px; line-height:1.6; color:var(--fg-1);">' +
          keyFactsRow(b.keyFacts) +
          seccionesBlock(b.secciones) +
        '</div>' +

        ctaFlotante(id) +
        '<div class="home-indicator"></div>' +
      '</div>'
    );
  }

  function renderDesktopColumn(id, b) {
    return (
      '<div style="max-width:640px; margin:0 auto;">' +
        '<div style="padding:14px 0 18px; border-bottom:1px solid var(--line); margin-bottom:24px;">' +
          headerActions(id) +
          headerTitle(b) +
        '</div>' +
        '<div style="font-size:17px; line-height:1.6; color:var(--fg-1);">' +
          keyFactsRow(b.keyFacts) +
          seccionesBlock(b.secciones) +
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
        '<div style="display:flex; gap:4px;">' +
          '<button aria-label="Modo lectura" ' +
            'style="width:44px; height:44px; background:transparent; border:0; color:var(--fg-2); border-radius:8px; cursor:pointer;">' +
            I.Sun() +
          '</button>' +
          '<button aria-label="Guardar para después" ' +
            'style="width:44px; height:44px; background:transparent; border:0; color:var(--fg-2); border-radius:8px; cursor:pointer;">' +
            I.Save() +
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
        I.Edit() + ' Empezar informe de la visita' +
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
  window.Screens.briefing = { render: render };
})();
