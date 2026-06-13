---
title: the-usual — the zsh I source at the top of every script
date: 2026-06-13
description: A small zsh toolkit — flags, logging, dry-run, parallelism, and locking — factored out of my dotfiles so each script can be a few lines of real work.
draft: true
---

> [!tldr]
> Most of my automation is small zsh scripts, and each one kept re-growing the same plumbing — a `--dry-run`, a `-v`, a `--help`, a confirmation prompt, a parallel loop, a lock. I factored all of it into [the-usual](https://github.com/junzh0u/the-usual): one file per capability, sourced at the top of a script, so the script itself stays a few lines of real work. Two of the pieces got their own write-ups — [the argument parser](/writing/zsh-argparse/) and [the parallelism primitives](/writing/zsh-parallelism/).

## The long tail of `~/bin`

Most of what I automate isn't a project — it's a five-line zsh script that backs up a database, transcodes a folder, or prunes some files. The work is small. The *plumbing* around it isn't: three weeks later that script wants a `--dry-run` so I can see what it would do, a `-v` for when it misbehaves, a `--help` because I've forgotten how to call it, a `-y` to stop prompting, maybe a parallel loop and a lock so two copies don't collide.

Write that per script and you get one of two bad outcomes: forty lines of copy-pasted `case "$1" in` at the top of every file, all slightly out of sync — or you give up and rewrite the whole thing in Python. I didn't want either. I wanted to write the plumbing once and source it.

## Source what you need

the-usual is one file per capability. A script names the ones it wants, in order, and gets nothing it didn't ask for:

```zsh
#!/usr/bin/env zsh
# === Argparse begins ===
source $ZDOTDIR/the-usual/argparse/_init.zsh  # expand -abc → -a -b -c
source $ZDOTDIR/the-usual/argparse/n.zsh      # -n / --dry-run
source $ZDOTDIR/the-usual/argparse/qv.zsh     # -q / -v + the log_* family
source $ZDOTDIR/the-usual/argparse/y.zsh      # -y / --yes
source $ZDOTDIR/the-usual/argparse/_h.zsh     # -h / --help (auto-generated) — last
# === Argparse ends ===
```

Each line adds a flag or two and nothing else; drop the ones a script doesn't need. That composition trick — and the auto-generated `--help` that falls out of it — is its own post: [I built an argument parser for my shell scripts](/writing/zsh-argparse/).

## What's in it

- [**`argparse/`**](https://github.com/junzh0u/the-usual/tree/main/argparse) — the composable parser above: `-h`/`--help` generated from whichever modules you sourced, `-n`/`--dry-run`, repeatable `-q`/`-v`, and `-y`/`--yes`. → [deep dive](/writing/zsh-argparse/)
- [**`log.zsh`**](https://github.com/junzh0u/the-usual/blob/main/log.zsh) — the `log_*` family: severity-colored, script-name-prefixed, stderr-bound, and verbosity-gated (`log_info_v` shows at `-v`, `log_info_vv` at `-vv`). Source it alone for logging without the flag parsing; `qv.zsh` layers `-q`/`-v` on top of it.
- [**`concurrency.zsh`**](https://github.com/junzh0u/the-usual/blob/main/concurrency.zsh) + [**`mutex.zsh`**](https://github.com/junzh0u/the-usual/blob/main/mutex.zsh) — a bounded job pool and a coprocess-held lock that turn a serial script parallel-and-safe. They interact in a way that cost me an afternoon: [the deep dive](/writing/zsh-parallelism/).
- [**`coreutils.zsh`**](https://github.com/junzh0u/the-usual/blob/main/coreutils.zsh) — portable wrappers over the GNU-vs-BSD coreutils gap: `file_size`, `file_mtime`, date parsing and formatting that behave the same on my Mac and my Linux boxes.
- [**`debug.zsh`**](https://github.com/junzh0u/the-usual/blob/main/debug.zsh) — `inspect`, a one-call dump of a variable, array, or associative array.

## Drop it anywhere

the-usual lives in my dotfiles as a submodule, checked out at `$ZDOTDIR/the-usual` — which is why the snippets above use that path. But nothing *inside* the toolkit hardcodes it. Each file finds its siblings relative to its own location, so the checkout can sit anywhere:

```zsh
source ${${(%):-%x}:A:h}/log.zsh      # a sibling file
source ${${(%):-%x}:A:h:h}/utils.zsh  # one level up — e.g. from argparse/
```

`${(%):-%x}` expands to the path of the file currently being sourced (`%x` under prompt expansion — more robust than `$0`, which `POSIX_ARGZERO` can change); `:A` makes it absolute and resolves symlinks; each `:h` strips one trailing component. So `concurrency.zsh` pulls in `log.zsh` from beside itself, and `argparse/_h.zsh` reaches up a level for `utils.zsh`, with no `$ZDOTDIR` and no install step.

> [!warning] Don't reassign `$0` to do this
> The tempting shorthand is `0=${(%):-%x}` at the top of the file, then `source $0:h/log.zsh`. Don't — these files are *sourced into the caller's scope*, so reassigning `$0` clobbers the calling script's own `$0` (and with it `current_script_name`, which reads it). Keep the inline `${${(%):-%x}:A:h}` form.

## Staying in the shell

None of the pieces is much code — the whole thing is a few hundred lines of zsh. What it buys is altitude: the long tail of `~/bin` gets a real `--help`, dry-run, tiered logging, parallelism, and locking without leaving the shell for a "real" language it doesn't need. The script stays five lines of real work, and the boilerplate is just `the-usual`.

The two pieces worth a closer look on their own: [the argument parser](/writing/zsh-argparse/) and [the parallelism primitives](/writing/zsh-parallelism/).
