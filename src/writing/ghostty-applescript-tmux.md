---
title: Ghostty's AppleScript support replaced my tmux habit
date: 2026-06-01
description: Why iTerm2 kept me for years, and how Ghostty's AppleScript support finally got me to switch.
draft: true
---

> [!tldr]
> After years on iTerm2 + tmux, I switched to Ghostty. Its AppleScript support let me stop living inside tmux for local work — and that local tmux habit was the only thing tying me to iTerm2.

## iTerm2

I've used iTerm2 for as long as I can remember — probably since the first day I owned a Mac. It has a lot of features I love: triggers, smart selection, and a look far nicer than Terminal.app's at the time.

But over the years it's grown bulky, and I've tried plenty of alternatives — Kitty, Alacritty, Warp, you name it. Each is better than iTerm2 in some way, but none made me switch, because I have one very specific need that only iTerm2 met. Let me explain.

## Always in tmux

First, I like to always work inside tmux. I even have this in my `.zshrc`:

```shell
if [[ -z "$TMUX" ]]; then
    exec tmux new-session -AD -s main
fi
```

so that every new terminal drops me straight into tmux.

## Capture pane

Beyond the obvious continuity — I never lose a session by accidentally closing the terminal — the one tmux feature I lean on most is `capture-pane`.

So often I want to capture the output of a command **after** I've already run it. Eventually I landed on this:

```shell
tmux capture-pane -pS - | pick-cmd
```

`pick-cmd` is [a script I wrote](https://gist.github.com/junzh0u/8cf5cc0abb51b8a2d68fa83e4911e9b9): it reads from stdin, parses command boundaries, presents them in fzf, and prints the selected command blocks to stdout. Very convenient.

## iTerm2 profiles

But *always* staying inside tmux has a downside: ssh-ing into other hosts becomes a nuisance, because I also auto-attach to tmux on remote machines.

Run `ssh remote-host` from inside a local tmux session and I'd end up with tmux inside ssh inside tmux.

That's where iTerm2 profiles came to the rescue. I could set up a `remote-host` profile that runs `ssh remote-host` as the command, instead of launching my normal login shell and triggering the local tmux auto-attach. Problem solved.

## Ghostty's AppleScript support

For all the emulators I'd tried, none could cover my iTerm2-profiles workflow — until Ghostty came along.

Plenty about Ghostty won me over before I even got to the niche feature I needed: it's fast, it's genuinely pretty out of the box, it has a built-in quick (drop-down) terminal, and it's configured through a plain text file I can keep in version control instead of clicking through a preferences pane. That last point alone is a breath of fresh air after years of iTerm2's settings UI.

Ghostty doesn't have iTerm2-style profiles in the way I used them. But it solves the problem from the other direction: it offers the capture functionality I need through AppleScript:

```applescript
tell application "Ghostty"
    set t to focused terminal of selected tab of front window
    perform action "write_screen_file:copy" on t
end tell
```

> [!warning] Gotcha
> Despite its name, `write_screen_file` is the one that captures the full terminal contents I want — visible screen plus scrollback. `write_scrollback_file` sounds like the tmux equivalent, but [it leaves out the visible screen](https://github.com/ghostty-org/ghostty/issues/3496).

That, together with [Ghostty's shell integration](https://ghostty.org/docs/features/shell-integration), means I finally don't *have to* live inside tmux for local sessions — it warns me before I close a pane with a command still running, and on a local machine there's no flaky connection to drop in the first place.

And that's what dissolves the whole problem. The only reason I ever needed profiles was that I lived in tmux locally, so ssh-ing out stacked yet another tmux on top. Take tmux out of my local sessions and that nesting never happens — no profiles required. I still use tmux when I ssh out, which is why I wrote [this wrapper](https://gist.github.com/junzh0u/611bc9f9b728ba0bac3cdeb4b6aecfa3).

## Final picture

So here's where I've landed: Ghostty for everything local, no tmux unless I ssh out. The one feature I couldn't give up — capturing a command's output after I've already run it — came with me; it just runs through AppleScript now instead of tmux.

After all these years, I didn't expect an AppleScript hook to be the thing that finally moved me off iTerm2. But that was the missing piece — and once it clicked, the switch was easy.
