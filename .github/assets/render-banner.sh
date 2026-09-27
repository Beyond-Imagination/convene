#!/usr/bin/env sh
# banner.html → banner-light.png / banner-dark.png (2x). CHROME 환경변수로 크롬 경로를 바꿀 수 있다.
set -e
cd "$(dirname "$0")"
CHROME="${CHROME:-chrome}"
SRC="file:///$(pwd -W 2>/dev/null || pwd)/banner.html"

for theme in light dark; do
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files \
    --force-device-scale-factor=2 --window-size=1280,400 --virtual-time-budget=5000 \
    --screenshot="$(pwd -W 2>/dev/null || pwd)/banner-$theme.png" "$SRC#$theme"
done
