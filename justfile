default:
    @just --list

# Without an install, `bunx @11ty/eleventy` floats to the latest published Eleventy
# and ignores bun.lock; build/serve depend on this so the pinned version is always
# used. (CI installs separately with --frozen-lockfile.)
# Install pinned dependencies from bun.lock.
install:
    bun install

# Build the static site into _site/.
build: install
    bunx @11ty/eleventy

# Serve with live reload (Eleventy dev server, http://localhost:8080).
serve: install
    bunx @11ty/eleventy --serve

# Generate the résumé PDF into _site/resume.pdf (deploy.yml does the same for the
# live /resume.pdf — keep the Chrome flags in sync). Serves _site/ over localhost
# because root-relative asset paths break under file://. Chrome may write the PDF
# and then never exit (same quirk as `og`), so it's backgrounded, polled until the
# file stops growing, then killed.
resume-pdf: build
    #!/usr/bin/env bash
    set -euo pipefail
    out="{{justfile_directory()}}/_site/resume.pdf"
    rm -f "$out"
    python3 -m http.server 8123 --directory "{{justfile_directory()}}/_site" >/dev/null 2>&1 &
    server=$!
    trap 'kill "$server" 2>/dev/null || true' EXIT
    sleep 1
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
      --headless=new --disable-gpu --no-first-run \
      --disable-background-networking --disable-component-update \
      --user-data-dir="$(mktemp -d)" --no-pdf-header-footer \
      --print-to-pdf="$out" \
      "http://localhost:8123/resume/" >/dev/null 2>&1 &
    pid=$!
    prev=-1
    for _ in $(seq 1 60); do
      sleep 0.3
      [ -s "$out" ] || continue
      size=$(wc -c < "$out" | tr -d '[:space:]')
      [ "$size" -eq "$prev" ] && break
      prev=$size
    done
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
    test -s "$out"
    echo "Wrote _site/resume.pdf"

# Regenerate the Open Graph preview image (src/og-image.png) from src/assets/og/card.html.
# Chrome's --headless=new frequently writes the screenshot but then never exits, which
# used to hang this recipe indefinitely. So we launch it in the background, wait for the
# PNG to finish writing (its size stops growing), then kill Chrome ourselves before
# resizing. The extra flags + redirect keep the background-updater/crashpad noise out.
og:
    #!/usr/bin/env bash
    set -euo pipefail
    shot="{{justfile_directory()}}/src/assets/og/og-image@2x.png"
    out="{{justfile_directory()}}/src/og-image.png"
    rm -f "$shot"
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
      --headless=new --hide-scrollbars --disable-gpu \
      --no-first-run --disable-background-networking --disable-component-update \
      --force-device-scale-factor=2 --window-size=1200,630 \
      --user-data-dir="$(mktemp -d)" \
      --screenshot="$shot" \
      "file://{{justfile_directory()}}/src/assets/og/card.html" >/dev/null 2>&1 &
    pid=$!
    prev=-1
    # Poll up to ~18s for the PNG to appear and stop growing (two equal samples).
    for _ in $(seq 1 60); do
      sleep 0.3
      [ -s "$shot" ] || continue
      size=$(wc -c < "$shot" | tr -d '[:space:]')
      [ "$size" -eq "$prev" ] && break
      prev=$size
    done
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
    test -s "$shot"
    magick "$shot" -resize 1200x630 "$out"
    rm "$shot"
    echo "Wrote src/og-image.png"
