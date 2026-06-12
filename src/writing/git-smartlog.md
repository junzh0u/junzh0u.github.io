---
title: git-smartlog — Sapling's best view, for plain Git
date: 2026-06-12
description: git log and git branch lose track of your in-flight stack. Sapling's smartlog doesn't — so I rebuilt it for plain Git as a single self-contained zsh script.
---

> [!tldr]
> [Sapling](https://sapling-scm.com/)'s `smartlog` — your unpushed commits, drawn on top of the pushed base they fork from — is the view I missed most after leaving Meta. I wanted it back without switching version control systems, so I rebuilt it for plain Git: [git-smartlog](https://github.com/junzh0u/git-smartlog), one zsh script you drop on your `PATH` and run as `git smartlog`.

## The question Git won't answer

Git is great at answering "what's the history of this branch?" and terrible at answering "what am I working on?" `git log` walks the whole history without ever telling you which commits are yours and unpushed. `git branch` lists names with no sense of how anything stacks. The picture I actually want — a dozen times a day — is just my local commits, sitting on the spot where they fork off `origin/master`, and nothing else.

I miss that picture because I used to have it. At Meta, [Sapling](https://sapling-scm.com/) was the version control I used every day, and its `smartlog` (`sl`) showed exactly this: draft commits on top of the nearest public base, with relative times, authors, and refs. After I left, `sl` was the habit that had nowhere to land. But I wasn't going to switch version control systems for one view.

So I rebuilt the view.

## What it looks like

On a feature branch with a few local commits stacked on `origin/master`:

```text
$ git smartlog
  @  23de132889  14 minutes ago  junz
  │  Wire backoff into the HTTP client
  │
  o  a8d1958eb9  Today at 10:30  junz
  │  Add exponential backoff with jitter
  │
  o  2d6999d80d  Today at 08:05  junz
╭─╯  Extract retry policy into its own module
│
o  7582005a1c  Yesterday at 16:45  junz  origin/master
│  Bump dependencies
~
```

`@` is `HEAD`. The indented `o` nodes above the bend are my unpushed commits, newest first. Below the bend is the public base — the nearest pushed commit — and `~` is everything older, which I don't care about right now. One glance and I have the whole stack, where it forks off `master`, and how old each piece is.

There's also a `-u` flag that draws uncommitted changes as one more node on top, with per-file diff bars. Sapling has no equivalent — the idea is borrowed from [Jujutsu](https://github.com/jj-vcs/jj), which treats the working copy as a commit in its own right. I keep it baked into my alias (`alias sl='git-smartlog -u'`), so a dirty working tree shows up as just another thing on the stack:

```text
$ git smartlog -u
  @  Uncommitted changes  2 files, +26 -4
  │ http_client.go | 18 ++++++++++++++----
  │ retry.go       | 12 ++++++++++++
  │
  o  23de132889  14 minutes ago  junz
  │  Wire backoff into the HTTP client
  │
  o  a8d1958eb9  Today at 10:30  junz
╭─╯  Add exponential backoff with jitter
│
o  7582005a1c  Yesterday at 16:45  junz  origin/master
│  Bump dependencies
~
```

## The hard part: finding the base

Drawing the graph is the easy half. The part that took real care is deciding what counts as the **public base** — the nearest pushed commit your drafts sit on. Get that wrong and the smartlog lies to you, which is worse than not having one.

> [!warning] Gotcha
> `@{u}` — the branch's upstream — looks like the obvious base, and it works right up until you push your feature branch. Now the upstream is just a copy of your own branch, the merge-base with `HEAD` is `HEAD` itself, and the whole draft stack collapses to nothing. A local `main` fails the same way the moment you're standing on it.

What actually works: only consider remote-tracking trunks — `origin/HEAD`, `origin/main`, `origin/master`, and their `upstream/` twins — and among those, take the one whose merge-base with `HEAD` is closest to `HEAD`. That's Sapling's "nearest public ancestor" rule, and as a bonus it handles a stale fork remote (an `origin/master` sitting behind `upstream/main`) without a fuss. `@{u}` and the local `main` are still in the script, but only as last-resort fallbacks for when no remote trunk exists at all.

## One file, on purpose

I had one firm constraint: the script depends on zsh and git, and nothing else — not even the rest of my dotfiles. That way I can `scp` it to any box, including the BusyBox NAS where installing anything is a chore, and it just runs. All the data comes out of a couple of `git log` format strings (`%al` for the author, `%D` for the refs); the rest — the bend, the colors, the layout — [the script](https://github.com/junzh0u/git-smartlog/blob/master/git-smartlog) draws itself.

It also copies Sapling's output habits closely, so the view reads the same. Public commits authored by someone else render metadata-only — no author, no subject — which keeps shared-trunk history compact. Relative times follow Sapling's two-tier scheme: "14 minutes ago" under 90 minutes, then "Today at 10:30", "Yesterday", a weekday, and eventually a plain date. I kept the real `sl` around while building it and diffed the two outputs — rendered text and raw escape codes both — to keep the mirror honest.

## What it doesn't do

One deliberate limitation: it draws the current branch's stack and nothing else. Sapling shows every draft branch in the repo at once, through a full DAG renderer; this script doesn't try. When you work one branch at a time — which is me, almost always — the output matches `sl` exactly.

If you've ever lost track of which of your commits are pushed, or squinted at `git log --graph` looking for where your branch leaves `master`, this is the gap it fills — and it's a single file, one `curl` away (install and the `sl` alias are in [the README](https://github.com/junzh0u/git-smartlog)). It's not a Sapling reimplementation — it's Sapling's best view, made to run anywhere Git does.
