default:
    @just --list

serve port="8000":
    python3 -m http.server {{port}}

# Regenerate the Open Graph preview image (/og-image.png) from assets/og/card.html
og:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
      --headless=new --hide-scrollbars --disable-gpu \
      --force-device-scale-factor=2 --window-size=1200,630 \
      --user-data-dir="$(mktemp -d)" \
      --screenshot="{{justfile_directory()}}/assets/og/og-image@2x.png" \
      "file://{{justfile_directory()}}/assets/og/card.html"
    magick "{{justfile_directory()}}/assets/og/og-image@2x.png" -resize 1200x630 "{{justfile_directory()}}/og-image.png"
    rm "{{justfile_directory()}}/assets/og/og-image@2x.png"
    @echo "Wrote og-image.png"
