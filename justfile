default:
    @just --list

# Build the static site into _site/
build:
    bunx @11ty/eleventy

# Serve with live reload (Eleventy dev server, http://localhost:8080)
serve:
    bunx @11ty/eleventy --serve

# Regenerate the Open Graph preview image (src/og-image.png) from src/assets/og/card.html
og:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
      --headless=new --hide-scrollbars --disable-gpu \
      --force-device-scale-factor=2 --window-size=1200,630 \
      --user-data-dir="$(mktemp -d)" \
      --screenshot="{{justfile_directory()}}/src/assets/og/og-image@2x.png" \
      "file://{{justfile_directory()}}/src/assets/og/card.html"
    magick "{{justfile_directory()}}/src/assets/og/og-image@2x.png" -resize 1200x630 "{{justfile_directory()}}/src/og-image.png"
    rm "{{justfile_directory()}}/src/assets/og/og-image@2x.png"
    @echo "Wrote src/og-image.png"
