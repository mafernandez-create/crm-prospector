# Rediseño UI · CRM Prospector v1

Esta carpeta contiene la implementación del rediseño UI aprobado tras el handoff de **Claude Design** (mayo 2026), variante **"Azul corporativo"**.

Orientado a sustituir el `index.html` monolítico actual con una UI modular, sin build, manteniendo la lógica de negocio existente intacta.

---

## Estructura (objetivo final)

```
redesign/
├── README.md           ← este archivo
├── tokens.css          ← Fase A · paleta, tipografía, espacios, radios, sombras (DS GPF)
├── components.css      ← Fase B · estilos de componentes base
├── icons.js            ← Fase B · librería SVG inline (Lucide-style)
├── app.js              ← Fase B · router, state global, init
├── data.js             ← Fase G · capa Firestore + GAS endpoints
├── states.js           ← Fase F · helpers Empty/Loading/Error/Success/Keyboard
├── _demo.html          ← Fase B · página de inspección de componentes (storybook)
└── screens/
    ├── inicio.js       ← Fase C1
    ├── detail.js       ← Fase C2
    ├── comollegar.js   ← Fase C3
    ├── briefing.js     ← Fase C4
    ├── informe.js      ← Fase C5
    ├── dashboard.js    ← Fase D1 + D2 (responsive)
    ├── bandeja.js      ← Fase D3
    ├── studios.js      ← Fase D (listado + filtros)
    └── cmdk.js         ← Fase E
```

---

## Tokens del DS (Fase A · `tokens.css`)

### Paleta funcional · 7 colores

| Token | Hex | Cuándo usar |
|---|---|---|
| `--gpf-blue-900` | `#0a2d52` | Sidebar, headlines, hero próxima visita |
| `--gpf-blue-700` | `#124b8a` | **CTA primario** (`--cta`) |
| `--gpf-blue-500` | `#1f72c7` | Enlaces, focus ring, hover sutil |
| `--gpf-blue-100` | `#e6f0fa` | Superficie tintada, chips accent |
| `--mute-red` | `#c8102e` | **CTA crítico de campo** (Cómo llegar), alertas, badge atrasos |
| `--mute-red-dark` | `#8a0b20` | Hover `--cta-strong` |
| `--paper-warm` | `#f7f5f1` | **Fondo app** (NO blanco puro · decisión deliberada) |

Más neutros: `--ink-{900,700,500,300,200,100}`, `--paper` (blanco solo para tarjetas).

**Regla:** el rojo MUTE es escaso por diseño. Solo se usa en CTAs de campo (Cómo llegar), borrar, alertas atrasadas. Resto del UI = azul GPF + neutros.

### Cuadrantes Q1-Q9 · escala neutra → cálida

Cada cuadrante del scoring tiene su color en `--q-*` (de azul oscuro Q1 "Estratégico" a gris claro Q9 "Congelar").

### Tipografía · 3 familias

| Familia | Uso | Cargada via |
|---|---|---|
| **Barlow Condensed** (`--font-display`) | Headlines, KPIs, números grandes, uppercase | Google Fonts |
| **Inter** (`--font-sans`) | UI, body, tablas, formularios | Google Fonts |
| **IBM Plex Mono** (`--font-mono`) | Datos numéricos, kbd, valores tabulares | Google Fonts |

### Escala tipográfica (10 pasos)

`--fs-eyebrow` 11px · `--fs-cap` 12px · `--fs-body-s` 14px · `--fs-body` 16px · `--fs-body-l` 18px · `--fs-h4` 20px · `--fs-h3` 24px · `--fs-h2` 30px · `--fs-h1` 40px · `--fs-display` 64px

**Regla móvil:** body ≥16px para legibilidad bajo sol. Desktop puede bajar a 14px en tablas densas.

### Espaciado · base 4px

`--sp-1` 4px · `--sp-2` 8px · `--sp-3` 12px · `--sp-4` 16px · `--sp-5` 20px · `--sp-6` 24px · `--sp-7` 32px · `--sp-8` 48px

### Radios · industrial, escasos

`--radius-s` 2px · `--radius-m` 6px · `--radius-l` 10px · `--radius-pill` 999px

Solo chips usan pill. El resto sigue radios industriales (2/6/10).

### Sombras

`--shadow-1` sutil 1px · `--shadow-2` card hover 24px · `--shadow-modal` modal 60px

### Safe-area iOS

`--safe-top: 44px` · `--safe-bot: 34px`

Aplicar en frames móvil. El `index-redesign.html` declara `viewport-fit=cover` para que `env(safe-area-inset-*)` esté disponible.

---

## Componentes base (Fase B · `components.css`)

Disponibles (todos los IDs se documentan en `_demo.html` cuando exista):

- `.btn` con variantes `-primary`, `-strong` (rojo MUTE), `-ghost`, modificadores `-block`, `-lg`
- `.card`, `.card-flat`
- `.chip`, `.chip-accent`, `.chip-red`, `.chip-green`
- `.field`, `.field-label` (con focus visible azul GPF)
- `.row` (label/value)
- `.progress` con `.fill` y `.fill.red`
- `.skeleton` con shimmer animation
- `.sidebar` (desktop, con variante `.collapsed`)
- `.topbar` (desktop, con variante `.tight`)
- `.tabbar` (iPhone PWA, 4 tabs)
- `.topapp` (iPhone top app bar)
- `.iphone-frame` + `.statusbar` + `.home-indicator`
- `.sheet-overlay` + `.sheet` (bottom sheet)
- `.cmdk-overlay` + `.cmdk-palette` + `.cmdk-hit`

---

## Accesibilidad

- **Hit-area ≥44pt** en todo control móvil (CTA hero sube a 56pt)
- **Focus visible** anillo azul GPF de 2px con offset cuando se navega por teclado
- **`prefers-reduced-motion`** respetado (transiciones a 0.01ms)
- **Skip links** y `aria-label` en botones icono-only
- **Contraste ≥4.5:1** en todos los pares texto/fondo

---

## Cómo usar este DS

1. Todo se monta dentro de un wrapper `.crm-root` para aislar estilos del `index.html` viejo durante coexistencia.
2. Los tokens están en `:root` global — pueden referenciarse desde cualquier sitio con `var(--token)`.
3. Los componentes están scoped vía `.crm-root` en `components.css` (Fase B).
4. **No hardcodear hex** — usar siempre `var(--gpf-blue-700)`, nunca `#124b8a`.
5. **No hardcodear tamaños tipo** — usar siempre `var(--fs-body)`, nunca `16px`.

---

## Decisiones explícitas

Trazadas desde `rationale.jsx` del handoff:

- ❌ Se retiran acentos **verde** y **morado/violeta** del estado actual
- ❌ Se retiran emojis como iconos (se usan SVG Lucide stroke 1.75)
- ✅ Una superficie por jerarquía (paper warm para app, blanco para tarjetas)
- ✅ Un CTA primario único por pantalla
- ✅ Datos extremos acotados (>365d → "+1 año")
- ✅ Tipo body 16-17px en móvil para sol; 14px en desktop denso
- ✅ Números siempre tabulares (`font-variant-numeric: tabular-nums`)

---

## Estado actual

Implementación en curso. Ver `PLAN_IMPLEMENTACION.md` en la raíz del repo para detalle por fases y estado de cada commit.
