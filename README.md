# junz.info

Source for [junz.info](https://junz.info/) — a small static site built with
[Eleventy](https://www.11ty.dev/) and deployed to GitHub Pages.

## Develop

Requires [Bun](https://bun.sh) and [just](https://github.com/casey/just).

```sh
just serve         # dev server with live reload at http://localhost:8080
just build         # build the static site into _site/
```

`serve` and `build` install pinned dependencies first (`just install`), so the
locked Eleventy version is used rather than whatever `bunx` would fetch as latest.

## Layout

```
src/
  _includes/       # base.njk (shared <head>/nav/footer) + footer.njk
  *.njk            # one file per page → / , /uses/ , /built/ , /now/ , /resume/
  chat/            # bare meta-refresh redirect, passed through untouched
  assets/          # CSS, icons, images (passthrough-copied)
  CNAME .nojekyll favicon.ico og-image.png   # passthrough-copied to the site root
.github/workflows/deploy.yml                  # build + deploy on push to master
```

## Deploy

Pushing to `master` triggers a GitHub Action that builds the site and publishes
it to GitHub Pages (Pages source: **GitHub Actions**). The build output (`_site/`)
is generated, not committed.

See [CLAUDE.md](CLAUDE.md) for conventions.
