#!/bin/sh
# Renders a Rootie HTML file (story or sheet) to PNG with headless Chrome.
# Usage: ./render.sh <in.html> [out.png] [width] [height] [scale]
# Defaults fit an Instagram story: 1080x1920 at 3x. Fonts load from fonts/.
# Set CHROME to the browser binary on Linux.
set -eu

src=$1
out=${2:-${src%.html}.png}
width=${3:-1080}
height=${4:-1920}
scale=${5:-3}
chrome=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}

abs() { (cd "$(dirname "$1")" && printf '%s/%s' "$(pwd)" "$(basename "$1")"); }

"$chrome" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files \
  --force-device-scale-factor="$scale" --window-size="$width,$height" --virtual-time-budget=3000 \
  --screenshot="$(abs "$out")" "file://$(abs "$src")" 2>/dev/null
echo "rendered $out (${width}x${height} at ${scale}x)"
