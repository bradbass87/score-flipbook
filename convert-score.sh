#!/bin/sh
# Convert a score PDF into flipbook page images.
#
#   ./convert-score.sh "path/to/Score.pdf" score-slug
#
# Writes scores/<score-slug>/page-01.jpg, page-02.jpg, …
# Requires poppler: brew install poppler
set -e

PDF="$1"
SLUG="$2"
if [ -z "$PDF" ] || [ -z "$SLUG" ]; then
  echo "usage: $0 path/to/score.pdf score-slug" >&2
  exit 1
fi

DIR="$(dirname "$0")/scores/$SLUG"
mkdir -p "$DIR"
pdftoppm -jpeg -jpegopt quality=85 -r 150 "$PDF" "$DIR/page"

COUNT=$(ls "$DIR" | grep -c '^page-.*\.jpg$')
echo ""
echo "Wrote $COUNT pages to scores/$SLUG/"
echo "Embed snippet:"
echo ""
echo "<script src=\"https://bradbass87.github.io/score-flipbook/flipbook.js\" defer></script>"
echo "<div class=\"score-flipbook\" data-pages=\"https://bradbass87.github.io/score-flipbook/scores/$SLUG/page-{nn}.jpg\" data-count=\"$COUNT\"></div>"
