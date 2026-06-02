# CLAUDE.md

Conventions for working on junz.info.

## Stack

Static site built with **Eleventy 3** (Nunjucks templates), run through **Bun**.
Source lives in `src/`, builds to `_site/` (gitignored — never commit it).

- `just install` — install pinned dependencies from `bun.lock`
- `just build` — build into `_site/` (runs `install` first)
- `just serve` — Eleventy dev server with live reload (http://localhost:8080; runs `install` first)
- `just og` — regenerate the Open Graph image (`src/og-image.png`) from `src/assets/og/card.html`

`build`/`serve` depend on `install` so `bunx` uses the locked Eleventy — a bare
`bunx @11ty/eleventy` would otherwise float to the latest published version.

## Templates

All shared chrome lives in `src/_includes/base.njk` (the `<head>`, default nav,
`<main>` wrapper) and `src/_includes/footer.njk` (the social footer). Edit those
once and every page inherits the change — do **not** copy chrome into pages.

Two ways pages use the layout:

- **Regular pages** (`uses.njk`, `built.njk`, `now.njk`) — front matter with
  `layout: base.njk` plus the page body only (the inner contents of `<main>`).
- **Irregular pages** (`index.njk` = home, `resume.njk`) — `{% extends "base.njk" %}`
  with block overrides. Available blocks: `head` (extra `<head>`, e.g. JSON-LD),
  `nav`, `content`, `footer`.

Front matter keys: `title`, `description`, `bodyClass`, and `ogType` (defaults to
`website`). `title`/`description` are emitted with `| safe`, so keep them plain
text — no raw `<`, `&`, or unescaped quotes.

URLs follow Eleventy defaults: `src/uses.njk` → `/uses/`, `src/index.njk` → `/`.
Static files (`assets/`, `CNAME`, favicon, `og-image.png`) are passthrough-copied
from `src/` to the site root via `.eleventy.js`.

### Adding a page

Create `src/<name>.njk` with `layout: base.njk` + front matter, and link it from
wherever it belongs. For anything that needs a different head/nav/footer, use the
`{% extends %}` + blocks form instead.

## Writing posts

Posts live in `src/writing/` — an Obsidian vault (open *that folder* in Obsidian).
Each `.md` becomes `/writing/<slug>/` and is listed on the `/writing/` index; front
matter is `title`, `date`, `description`. Keep filenames hyphenated — they become
URL slugs.

Post bodies are **not** run through a template engine, so literal `{{ }}` / `{% %}`
(e.g. in code samples) render as-is; raw HTML works too.

Mark a work-in-progress with `draft: true`: it renders in `just serve` for preview
but is excluded from production builds (`just build` and CI), so it never reaches
the live site until you remove the flag.

Heads-up: these `.md` files are usually open in Obsidian, whose autosave races with
external writes (its buffer can silently overwrite them) — re-read immediately before
editing, or have the user make the change.

## Deploy & git

Pushing to `master` triggers `.github/workflows/deploy.yml`, which builds and
deploys to GitHub Pages (Pages source is **GitHub Actions**, not branch). The
custom domain is held by the `CNAME` file shipped in the build.

This repo also receives commits on `origin/master` from other Claude surfaces
(claude.ai/code), so local `master` can be behind even when the tree is clean.
**Always `git fetch` and check `origin/master` before rebasing or pushing**;
prefer rebasing local work onto `origin/master` for a clean fast-forward.

To verify the live site (`curl https://junz.info/`), disable the Bash sandbox —
it blocks outbound network, which otherwise surfaces as a misleading
`command not found: curl`.
