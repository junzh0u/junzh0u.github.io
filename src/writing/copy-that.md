---
title: copy-that — copy any command's output from anywhere
date: 2026-06-02
description: A deep dive on copy-that — capture-pane | pick-cmd | pbcopy — and how one alias copies any past command's output in tmux or Ghostty, locally or over SSH.
draft: true
---

> [!tldr]
> My [Ghostty post](/writing/ghostty-applescript-tmux/) ended with a capture trick that came with me off tmux. This is the whole machine behind it — now public as [copy-that](https://github.com/junzh0u/copy-that): one alias that fzf-picks any command from scrollback and drops its output on my Mac's clipboard, in Ghostty or tmux, locally or three SSH hops out.

## One alias

The whole feature is one alias:

```zsh
alias copy-that="capture-pane | pick-cmd | pbcopy"
```

Type `copy-that`, get an fzf list of every command still in scrollback (newest at the top), pick one or a few, and each block — the command, its output, and how long it took — lands on my clipboard. It's how I grab the output of something I ran ten commands ago without re-running it or dragging a mouse selection across pages of scrollback. (What I actually type is `ph` — short for paste-history, a name that stopped making sense two renames ago. Alias it to whatever two letters your fingers like.)

Here it is in action:

<link rel="stylesheet" href="/assets/vendor/asciinema-player/asciinema-player.css">
<div id="copy-that-cast"></div>
<script src="/assets/vendor/asciinema-player/asciinema-player.min.js"></script>
<script>
  AsciinemaPlayer.create('/assets/casts/copy-that.cast', document.getElementById('copy-that-cast'), {
    poster: 'npt:0:01',
    idleTimeLimit: 2,
  });
</script>

The pipeline reads like it could only work in one place: `capture-pane` is a tmux command, `pbcopy` is a macOS binary. But I run this everywhere — local Ghostty with no tmux, remote tmux over SSH, and the combinations in between. The trick is that two of those three names aren't what they seem: `capture-pane` is a wrapper that hides *which terminal* I'm in, and `pbcopy` sometimes isn't `pbcopy` at all, which hides *which machine* I'm on. Only `pick-cmd` in the middle is exactly what it looks like — and it's doing the strangest job of the three.

Stage by stage.

## Stage 1: scrollback out of any terminal

In tmux, dumping scrollback is built in: `tmux capture-pane -pS -` prints the whole buffer to stdout. But since [I stopped living inside tmux locally](/writing/ghostty-applescript-tmux/), half my sessions are plain Ghostty, where the same capability goes through AppleScript instead. So `capture-pane` on my `PATH` is [a wrapper](https://github.com/junzh0u/copy-that/blob/main/capture-pane) named after the tmux command it generalizes:

```zsh
if [[ -n $TMUX ]]; then
  tmux capture-pane -pS -
elif [[ -n $GHOSTTY_RESOURCES_DIR ]]; then
  osascript -e '
tell application "Ghostty"
    set t to focused terminal of selected tab of front window
    perform action "write_screen_file:copy" on t
end tell
' > /dev/null
  cat "$(pbpaste)"   # Ghostty puts the capture-file *path* on the clipboard
else
  echo "capture-pane: unsupported terminal (need tmux or Ghostty)" >&2
  exit 1
fi
```

The Ghostty path is a little Rube Goldberg — the AppleScript action writes the screen contents to a temp file and puts the *path* on the clipboard, so the script `pbpaste`s the path and `cat`s it. (And it has to be `write_screen_file`, not the more obvious-sounding `write_scrollback_file` — see [the gotcha in the Ghostty post](/writing/ghostty-applescript-tmux/).)

Either way, what comes out is plain text on stdout. Everything downstream is none the wiser about where it came from.

## Stage 2: finding the commands in a wall of text

Now the interesting problem. Scrollback is a flat wall of text with no structure — where does one command's output end and the next begin?

`pick-cmd` cheats: my prompt is already a machine-readable delimiter. I use [starship](https://starship.rs/) everywhere, configured so that every command is bracketed by two distinctive glyphs:

```toml
format = """($cmd_duration$status\n)$directory$all ... $line_break$character"""

[character]
success_symbol = '[❯](bold green)'
error_symbol = '[❯](bold red)'

[cmd_duration]
format = '󱞩 [$duration]($style) '
min_time = 0
show_milliseconds = true
```

Every command I type sits on a line starting with `❯`, and the *next* prompt opens with a `󱞩` duration line (plus the exit status, if it failed). So in scrollback, a finished command looks like:

```
~/W/junzh0u.github.io master
❯ which ph
ph: aliased to capture-pane | pick-cmd | pbcopy

󱞩 22ms
~/W/junzh0u.github.io master
❯
```

Which means parsing scrollback into commands takes two regexes and a tiny state machine — this is the heart of `pick-cmd` ([full script](https://github.com/junzh0u/copy-that/blob/main/pick-cmd)):

```python
PROMPT_START = re.compile(r'❯(.+)$')   # a command being entered
PROMPT_END = re.compile(r'󱞩')          # the next prompt's duration line

for line in lines:
    if PROMPT_END.match(line):
        if active and block:
            block.append(line)         # keep the duration line in the block
            commands.append(block)
        block = []
        active = False
    elif match := PROMPT_START.match(line):
        active = True
        block = ['$ ' + match.group(1).strip()]
    elif active:
        block.append(line)
```

A `❯` line opens a block; a `󱞩` line seals it. (Before any of this, the input gets a pass that strips ANSI escapes and carriage returns, so the regexes only ever see plain lines.) Each block keeps its closing line, so when fzf previews a block I can see at a glance that it failed with `✘ 1` or took twelve seconds.

> [!warning] Gotcha
> `min_time = 0` is load-bearing. By default starship only prints the duration line for commands slower than two seconds — and a block that never sees its `󱞩` is silently discarded when the next `❯` arrives. Leave the default threshold in place and the picker only knows about your slow commands.

The blocks go into fzf with `--tac` (newest first), `+s` (keep scrollback order while filtering), and `--multi` (grab several at once); the list shows just the command lines, the preview shows the full block, and whatever I pick is printed to stdout.

Keying a parser off a bespoke prompt sounds fragile, and it would be — except the prompt config and the parser are installed together on every machine I touch: the starship config lives in my dotfiles, and the scripts ship as [copy-that](https://github.com/junzh0u/copy-that), pinned to those same dotfiles as a submodule. The delimiter travels with the parser. (Yours doesn't have to match mine — the markers are a pair of env vars.) That, plus needing nothing but stdlib Python and fzf, is what makes stage 2 portable: it doesn't care about terminals or hosts at all, only about text.

## Stage 3: a clipboard that might be three hops away

On my Mac, `pbcopy` is the real thing and stage 3 is boring. The interesting case is when `copy-that` runs on a remote box: there's no clipboard there, and forwarding one over SSH means X11, which is slow and usually disabled anyway.

The answer is OSC 52, an escape sequence that asks the *terminal emulator* — which is running on my Mac, however many hops away — to write its own clipboard. The remote side just prints bytes; they ride the existing SSH connection home. My whole `osc52` script is basically one `printf`:

```sh
encoded=$(printf "%s" "$input" | base64 | tr -d '\n')
esc="\033]52;c;${encoded}\a"

# If inside tmux, wrap the sequence so tmux passes it through
if [ -n "$TMUX" ]; then
  esc="\033Ptmux;\033${esc}\033\\"
fi

printf "$esc"
```

The tmux branch matters because on remote hosts I *am* in tmux, and tmux owns the terminal — a raw escape sequence dies there instead of reaching the real emulator underneath. Two things make it survive: the sequence gets wrapped in a DCS passthrough (`\033Ptmux; … \033\\`), which tells tmux to forward it upstream uninterpreted, and tmux has to be configured to allow that — `set -g allow-passthrough on` in my tmux.conf, because since tmux 3.3 passthrough is off by default and the wrapped sequence is dropped silently.

> [!warning] Gotcha
> The inner `\033` has to be doubled inside the tmux wrapper — tmux's passthrough eats one level of escaping. Drop it and you'll copy a string that's missing its first byte, which is a wonderfully confusing bug to chase.

What stitches this into `copy-that` is one line in my `.zshrc`:

```zsh
(( $+commands[pbcopy] )) || alias pbcopy=osc52
```

Any box without a real `pbcopy` grows one. The alias text never changes; its last stage just quietly swaps implementations under it. (As a bonus, everything else I habitually pipe into `pbcopy` gains the same over-SSH superpower for free.)

## The same alias everywhere

So: local Ghostty, `copy-that` captures via AppleScript and copies with real `pbcopy`. Remote tmux over SSH, it captures via `tmux capture-pane` and the copy rides home as an OSC 52 sequence through the passthrough. Local tmux, nested sessions — some other mix of the same parts. I never think about which case I'm in, because each stage absorbs exactly one difference: `capture-pane` hides the terminal, the `pbcopy` polyfill hides the host, and `pick-cmd` between them only ever sees text.

None of it is clever on its own — maybe forty lines of shell and a hundred of Python. But it's the machinery that let the one feature I couldn't give up come along when I left tmux behind, and at this point those two letters are muscle memory I'd miss on any machine that didn't have them. Fortunately, none of mine are missing them.
