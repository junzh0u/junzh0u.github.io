---
title: I built an argument parser for my shell scripts
date: 2026-06-13
description: Most shell scripts give up on real flag handling. A stack of small composable zsh files gives every script of mine -h, -n, -q/-v, and -y for free.
---

> [!tldr]
> I got tired of half-baked `case` statements for flags, so I built a tiny composable argument parser in zsh. Each capability is one file — source the ones you want, in order — and every script gets `--help` (auto-generated), `--dry-run`, repeatable `-q`/`-v` with tiered logging, and `--yes`, without writing that boilerplate again. It's the [`argparse/`](https://github.com/junzh0u/the-usual/tree/main/argparse) corner of [the-usual](https://github.com/junzh0u/the-usual), the toolkit I [source at the top of every script](/writing/the-usual/).

## The shell-script wall

Every shell script starts simple. Then you want a `--dry-run` flag so you can see what it *would* do. Then `-v`, to make it chatty when something breaks. Then `-h`, because three weeks later you've forgotten how to call your own script. Then `-y`, so it stops asking before every destructive step.

By that point you've usually got forty lines of `case "$1" in` at the top of the file, copy-pasted from the last script and slightly out of sync with it. And the moment you notice that, the temptation is to rewrite the whole thing in Python.

I didn't want to leave the shell — most of these scripts are five lines of real work wrapped in argument plumbing. So I built the plumbing once.

## Source order is the API

The pattern is a stack of files, each adding one capability, sourced in a fixed order:

```zsh
#!/usr/bin/env zsh
# === Argparse begins ===
source $ZDOTDIR/the-usual/argparse/_init.zsh  # expands -abc to -a -b -c
source $ZDOTDIR/the-usual/argparse/n.zsh      # adds -n (dry run)
source $ZDOTDIR/the-usual/argparse/qv.zsh     # adds -q/-v (verbosity) + the log_* family
source $ZDOTDIR/the-usual/argparse/_h.zsh     # adds -h (help), must be last
# === Argparse ends ===
```

Each file runs its own `zparseopts` call that pulls out the flags it owns and removes them from the argument list (`-D -E`). By the time `_h.zsh` runs last, the only thing left in `$@` is the script's real positional arguments. A script that never prompts just doesn't source `y.zsh`; one that never mutates anything skips `n.zsh`. You compose exactly the surface you want.

## Why `_init.zsh` exists

There's one wrinkle the very first file exists to solve. `zparseopts` will happily expand a bundled `-abc` into `-a -b -c` — but only when `a`, `b`, and `c` are declared in the *same* `zparseopts` call. Splitting each flag into its own file means separate calls, so `-qn` would never be understood: `qv.zsh` only knows about `q`, `n.zsh` only about `n`.

So [`_init.zsh`](https://github.com/junzh0u/the-usual/blob/main/argparse/_init.zsh) runs first and pre-expands bundled short flags by hand:

```zsh
for arg in $argv; do
    [[ $arg == -- ]] && stop_expand=1
    if [[ -z $stop_expand ]] && [[ $arg =~ "^-[a-zA-Z0-9]{2,}$" ]]; then
        for (( i = 1; i < ${#arg}; i++ )); do
            expanded_args+=("-${arg:$i:1}")
        done
    else
        expanded_args+=($arg)
    fi
done
set -- "${(@)expanded_args}"
```

After this, `-qn` is two tokens and each module can claim its own. It stops at `--`, so anything after the separator passes through untouched. `_init.zsh` also declares two associative arrays — `OPTIONS_DESCRIPTION` and `EXIT_CODES_DESCRIPTION` — that everything downstream fills in.

## Help writes itself

This is the part I'm happiest with. Every module that adds a flag also appends a line describing it:

```zsh
OPTIONS_DESCRIPTION+=("-n, --dry-run" "Dry run mode")
```

So when [`_h.zsh`](https://github.com/junzh0u/the-usual/blob/main/argparse/_h.zsh) runs last, it holds a complete map of every flag this particular script accepts — gathered from whichever modules happened to be sourced — and `usage` just renders it:

```zsh
function usage {
    print "Usage: $(current_script_name) [options] ${ARGS_DESCRIPTION}"
    print "Options:"
    for key val in ${(kv)OPTIONS_DESCRIPTION}; do
        printf "    %-30s %s\n" "$key" "$val"
    done | sort
    ...
}
```

Being last gives `_h.zsh` a second job, too: its `zparseopts` runs with `-F`, which fails on any flag it doesn't recognize. Every earlier module has already removed the flags it owns, so anything still left *is* a typo — and it gets the usage text on stderr and exit code 2, instead of sliding through to the script as a bogus argument.

I never write a usage string. It's a side effect of which capabilities I composed. Exit codes work the same way: `_init.zsh` seeds `0 = Success`, `_h.zsh` adds `2 = Wrong usage`, scripts slot their own into the same table, and `--help` prints all of it.

## Verbosity that actually does something

[`qv.zsh`](https://github.com/junzh0u/the-usual/blob/main/argparse/qv.zsh) is the file that earns its keep. `-v` and `-q` are *repeatable* — it counts them and folds them into a single `VERBOSITY` level:

```zsh
zparseopts -D -E -- \
    {v,-verbose}+=FLAG_V \
    {q,-quiet}+=FLAG_Q
(( VERBOSITY = ${VERBOSITY:-0} + ${#FLAG_V} - ${#FLAG_Q} ))
```

That's all `qv.zsh` is — the flag-parsing half. The logging half lives in its own file, [`log.zsh`](https://github.com/junzh0u/the-usual/blob/main/log.zsh), which `qv.zsh` sources. `log.zsh` defines a family of functions keyed to `$VERBOSITY` — `log_info`, `log_warning_v`, `log_error_vv`, and so on, where the `_v`/`_vv` suffix is the level the message has to clear:

```zsh
function log_info_v  { _log_info_v 1 $* }
function log_info_vv { _log_info_v 2 $* }
```

So `-vv` surfaces the deep-detail logs and a bare invocation stays quiet. Every line is colored by severity, prefixed with the script's name, tagged `[DRY_RUN]` when `-n` is active, and written to stderr so it never pollutes a pipeline. There are even `mkdir_v` / `mv_v` wrappers that pass `-v` through to the underlying command only when the verbosity clears the bar.

Splitting logging out from the flag parsing means anything that wants the `log_*` family but not the `-q`/`-v` flags — a library function reading `$VERBOSITY` from the environment, say — can source `log.zsh` directly and skip `qv.zsh`. The [parallelism helpers](/writing/zsh-parallelism/) do exactly that.

And [`y.zsh`](https://github.com/junzh0u/the-usual/blob/main/argparse/y.zsh) is the small one: it adds `-y` plus a `yes_or_no` helper that rings the terminal bell before asking — so a long-running script that suddenly needs an answer actually gets my attention — and answers itself when `-y` was given.

## Dry-run is half a flag

[`n.zsh`](https://github.com/junzh0u/the-usual/blob/main/argparse/n.zsh) is the smallest module, and it's deliberately dumb: it sets `MODE_DRY_RUN=1` when `-n`/`--dry-run` is passed, exports it, and stops. It can't know which lines of your script are the destructive ones — only you do. So the convention is to guard the side effects yourself:

```zsh
if (( MODE_DRY_RUN )); then
    log_info "Would remove $f"
else
    rm "$f"
fi
```

`(( MODE_DRY_RUN ))` reads false when the flag is absent — an unset variable is arithmetic zero — and true once `n.zsh` has set it, so the guard needs no default. For a script that should bail before touching anything, the short form is `(( MODE_DRY_RUN )) && exit 0` once it's logged its plan.

The logging is the other half. Because every `log_*` line carries a `[DRY_RUN]` prefix whenever the flag is set — that tag from the section above — the same `log_info "Removing $f"` reads `[DRY_RUN] [my-script] Removing $f` in a dry run and `[my-script] Removing $f` for real. A `-n` run becomes a labeled transcript of exactly what a real run would do, line for line, which is the whole reason to have the flag.

## No hardcoded paths

One detail that makes the stack portable: a module like `_h.zsh` needs `current_script_name` from [`utils.zsh`](https://github.com/junzh0u/the-usual/blob/main/utils.zsh), and `qv.zsh` needs `log.zsh` — but neither knows where the checkout lives. They find their siblings relative to themselves:

```zsh
source ${${(%):-%x}:A:h:h}/utils.zsh   # from argparse/, reach up to the repo root
```

`${(%):-%x}` is the path of the file being sourced, `:A` makes it absolute, and each `:h` strips a component (two of them, to climb out of `argparse/`). No `$ZDOTDIR`, no install step — drop the checkout anywhere and the `source` lines still resolve.

## The payoff

A script written against this gets a real CLI for almost nothing:

```text
$ my-script --help
Usage: my-script [options] <args>
Options:
    -h, --help                     Print this help message
    -n, --dry-run                  Dry run mode
    -q, --quiet                    Decrease verbosity
    -v, --verbose                  Increase verbosity
Exit codes:
    0                              Success
    2                              Wrong usage
```

None of that was written by hand. It fell out of four `source` lines.

This is deeply tied to zsh — `zparseopts` and its parameter expansion do all the lifting — and a genuinely complex tool still deserves a real language. But for the long tail of personal automation living in `~/bin`, four source lines that hand back `--help`, dry-run, and tiered logging are what keep me from rewriting every five-line script in Python.
