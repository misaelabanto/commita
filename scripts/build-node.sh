#!/usr/bin/env bash
set -euo pipefail

echo "Building Node.js-compatible bundle..."

bun build index.ts --outfile dist/index.js --target node --minify

# bun prepends "#!/usr/bin/env bun\n// @bun\n" — strip those and add node shebang
tail -n +3 dist/index.js > dist/index.tmp.js
printf '#!/usr/bin/env node\n' | cat - dist/index.tmp.js > dist/index.js
rm dist/index.tmp.js
chmod +x dist/index.js

echo "Built dist/index.js ($(wc -c < dist/index.js | tr -d ' ') bytes)"
