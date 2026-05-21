default:
    @just --list

serve port="8000":
    python3 -m http.server {{port}}
