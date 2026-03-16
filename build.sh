#!/usr/bin/env bash
#
# build.sh — Pack src/ files back into a single self-contained HTML file.
#
# Usage:
#   ./build.sh                  # outputs pdf_overlay_compare.html
#   ./build.sh output.html      # outputs to custom path
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_DIR="$SCRIPT_DIR/src"
OUTPUT="${1:-$SCRIPT_DIR/pdf_overlay_compare.html}"

# Verify all source files exist
required_files=(
  "index.html"
  "styles.css"
  "vendor/pdfjs.js"
  "vendor/jspdf.js"
  "vendor/jszip.js"
  "vendor/pdfjs-worker-blob.js"
  "body.html"
  "app.js"
)

for f in "${required_files[@]}"; do
  if [[ ! -f "$SRC_DIR/$f" ]]; then
    echo "ERROR: Missing source file: src/$f" >&2
    exit 1
  fi
done

# Start with the template
cp "$SRC_DIR/index.html" "$OUTPUT.tmp"

# Replace each injection marker with the corresponding file content.
# We use Python for reliable multi-line substitution.
python3 - "$SRC_DIR" "$OUTPUT.tmp" << 'PYEOF'
import sys, os, re

src_dir = sys.argv[1]
tmp_file = sys.argv[2]

with open(tmp_file, 'r') as f:
    content = f.read()

# Map of marker -> source file (relative to src/)
injections = {
    'styles.css':                'styles.css',
    'vendor/pdfjs.js':           'vendor/pdfjs.js',
    'vendor/jspdf.js':           'vendor/jspdf.js',
    'vendor/jszip.js':           'vendor/jszip.js',
    'vendor/pdfjs-worker-blob.js': 'vendor/pdfjs-worker-blob.js',
    'body.html':                 'body.html',
    'app.js':                    'app.js',
}

for marker, filepath in injections.items():
    placeholder = f'/* __INJECT:{marker}__ */'
    full_path = os.path.join(src_dir, filepath)
    with open(full_path, 'r') as f:
        replacement = f.read()

    if placeholder not in content:
        print(f"WARNING: Marker not found: {placeholder}", file=sys.stderr)
        continue

    content = content.replace(placeholder, replacement)

with open(tmp_file, 'w') as f:
    f.write(content)

print(f"Injected {len(injections)} files into template.")
PYEOF

mv "$OUTPUT.tmp" "$OUTPUT"
echo "Build complete: $OUTPUT ($(wc -c < "$OUTPUT") bytes)"
