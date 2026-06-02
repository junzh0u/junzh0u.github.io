---
title: iTerm2 -> Ghostty
date: 2026-06-01
description: A placeholder post to confirm the writing pipeline works.
draft: true
---
## TL;DR

I replaced iTerm2 + tmux with Ghostty's own pane management and AppleScript support.

## iTerm2

I have been using iTerm2 for as far as I remember, maybe since the first day I had my own Mac.
iTerm2 has a lot great features that I love (TODO: list some here).

But over the years, it has been bulky, and I have tried many alternatives: Kitty, Alacritty, Warp, you name it.

Each of them are better than iTerm2 in some way or another, but none of them made me switch. Mainly because I have a very special niche need that only iTerm2 suits, let me explain.

## Always in Tmux

First, I like to always work in tmux. I even have this in my `.zshrc`:

```shell
if [[ -z "$TMUX" ]]; then
    exec tmux new-session -AD -s main
fi
```

so that whenever I open a new terminal, I'm inside tmux.

## Capture Pane

Besides the normal "continuation", i.e. I won't lose anything by accidentally closing my terminal. One more tmux feature that I rely on heavily is `capture-pane`.

There are so many times when I want to capture the output of a command **after** running it. I eventually came up with a solution:

```shell
tmux capture-pane -pS - | pick-cmd
```

`pick-cmd` is [a script that I wrote](https://gist.github.com/junzh0u/8cf5cc0abb51b8a2d68fa83e4911e9b9) that reads from stdin, parses command boundaries, presents them in fzf, then prints selected command blocks to stdout. Very convenient.

## iTerm2 Profiles

But one problem of *always* staying inside tmux is that: sshing into other hosts became a nuiance, because I want to stay inside tmux in the ssh session too.

So if run `ssh remote-host` inside a local tmux session, I ended up with a tmux inside ssh inside tmux.

That's where iTerm2 profile came to rescue, I can configure a `remote-host` profile where I explicit tell it to skip the local tmux and `ssh remote-host` directly. Problem solved.

## Ghostty's AppleScript support

I tried many terminal simulators along the years. Some of them are good, some of them are very good. But none of them can replace my iTerm2 profiles use scenario. Until Ghostty came along.

Ghostty doesn't have "profile" either. But it solved my problem in another way: it has native `capture-pane` functionality, through AppleScript support:

```applescript
tell application "Ghostty"
    set t to focused terminal of selected tab of front window
    perform action "write_screen_file:copy" on t
end tell
```

that, plus with [Ghostty's shell integration](https://ghostty.org/docs/features/shell-integration), means I finally don't *have to* stay in tmux for local sessions. I still uses tmux in ssh sessions though, and that's why I have [this wrapper](https://gist.github.com/junzh0u/611bc9f9b728ba0bac3cdeb4b6aecfa3).

## Final picture

TODO