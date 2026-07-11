#!/bin/bash
# ============================================================
# Reconstruye Scout.app (lanzador de escritorio del prospector scout) y lo
# instala en el Escritorio y en Descargas con su icono.
#
# La app es un applet AppleScript: al hacer doble clic pregunta la provincia
# (y foco opcional) en un diálogo y ejecuta scripts/prospector-scout/run-scout.sh
# --medir en Terminal. NO reimplementa nada; solo lanza el runner.
#
# Assets versionados en esta carpeta (para poder regenerar sin el scratchpad):
#   - scout.applescript  → fuente del applet
#   - make_icon.py       → genera scout_1024.png (PIL) → icono
#   - Scout.icns         → icono ya compilado (por si no quieres regenerarlo)
#
# Uso:  bash scripts/prospector-scout/desktop-app/build.sh
# Requiere: osacompile, sips, iconutil (nativos de macOS); python3+PIL solo si
# quieres regenerar el icono desde cero.
# ============================================================
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"

# (opcional) regenerar el icono desde el script de PIL:
#   python3 "$HERE/make_icon.py" && \
#   rm -rf "$HERE/Scout.iconset" && mkdir "$HERE/Scout.iconset" && \
#   for s in 16 32 128 256 512; do \
#     sips -z $s $s "$HERE/scout_1024.png" --out "$HERE/Scout.iconset/icon_${s}x${s}.png"; \
#     d=$((s*2)); sips -z $d $d "$HERE/scout_1024.png" --out "$HERE/Scout.iconset/icon_${s}x${s}@2x.png"; \
#   done && iconutil -c icns "$HERE/Scout.iconset" -o "$HERE/Scout.icns"

for DEST in "$HOME/Desktop/Scout.app" "$HOME/Downloads/Scout.app"; do
    echo "→ construyendo $DEST"
    rm -rf "$DEST"
    osacompile -o "$DEST" "$HERE/scout.applescript"
    cp "$HERE/Scout.icns" "$DEST/Contents/Resources/applet.icns"
    # aplicar icono con la API nativa (Finder lo respeta de forma fiable)
    osascript -l JavaScript -e "
      ObjC.import('AppKit');
      var img = \$.NSImage.alloc.initWithContentsOfFile('$HERE/Scout.icns');
      \$.NSWorkspace.sharedWorkspace.setIconForFileOptions(img, '$DEST', 0);
    " >/dev/null
    touch "$DEST"
done
echo "✓ Scout.app instalada en Escritorio y Descargas."
