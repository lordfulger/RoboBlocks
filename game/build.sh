#!/bin/bash
# Builds the RoboBlocks game into one self-contained page:
#   game/dist/roboblocks.html   (the page; three.js loads from a CDN)
#   server/public/index.html    (the same page, served by the dedicated server)
set -e
cd "$(dirname "$0")"
mkdir -p dist
{
  cat src/00-head.html
  echo '<script src="https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.min.js"></script>'
  echo '<script>'
  echo '(() => {'
  echo "'use strict';"
  for f in src/*.js; do echo "// ---- $(basename $f) ----"; cat "$f"; done
  echo '})();'
  echo '</script>'
} > dist/roboblocks.html
node -e "const s=require('fs').readFileSync('dist/roboblocks.html','utf8'); const m=s.match(/<script>\n([\s\S]*)<\/script>/); try { new Function(m[1]); console.log('syntax ok', s.length, 'bytes'); } catch(e) { console.log('SYNTAX ERROR', e.message); process.exit(1); }"
mkdir -p ../server/public && cp dist/roboblocks.html ../server/public/index.html
