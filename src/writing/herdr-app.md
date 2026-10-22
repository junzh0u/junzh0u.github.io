---
title: Herdr.app — giving herdr panes their own macOS permissions
date: 2026-10-21
description: Quit the Ghostty that started my herdr server, and every pane lost its permissions, with nothing left to grant. The fix was a twenty-line app bundle.
---

> [!tldr]
> macOS judges a process's privacy permissions by its *responsible process*. A herdr server started from Ghostty borrows that Ghostty's grants and loses them when it quits. Starting the server through a tiny signed `Herdr.app` gives every pane a stable identity of its own.

## The problem

I start [herdr](https://herdr.dev) by typing `herdr` in Ghostty. When I quit Ghostty, the herdr server lives on, and the next `herdr` reattaches to it. Then a Python script in a pane can't reach my LAN:

```text
OSError: [Errno 65] No route to host
```

`nc` from the same pane connects fine, and System Settings offers nothing to grant.

## Why

macOS Local Network privacy exempts Apple-signed tools like `nc`, and judges everything else by its **responsible process**: normally the app at the root of the launch chain. Here's how to look it up:

```python
import ctypes, os
lib = ctypes.CDLL("/usr/lib/system/libquarantine.dylib")
print(lib.responsibility_get_pid_responsible_for_pid(os.getpid()))
```

Every pane answers to the Ghostty *process* that started the server. Once that process quits, the server and its panes have no app to check grants against, and no app to prompt for.

## launchd isn't enough

Starting the server from a launchd agent makes it its own responsible process. But Homebrew's herdr is ad-hoc signed, so macOS treats every upgrade as a new program, and the grants die with each upgrade. Re-signing each build with my own certificate kept the grants, until a re-sign rewrote the binary under a running server (`-67034`, `errSecCSStaticCodeChanged`) and silently broke every check for days. [herdr#808](https://github.com/herdrdev/herdr/issues/808) and [herdr#4228](https://github.com/herdrdev/herdr/issues/4228) track all of this upstream.

## Herdr.app

The fix comes from [Paul Robello's gist](https://gist.github.com/paulrobello/6b57d1de3d47e2904fcaf3f27f3ef69a): give the server an app bundle whose executable `exec`s herdr in place.

```c
int main(int argc, char **argv) {
    (void)argc;
    argv[0] = "herdr";
    execv(HERDR_BIN, argv);   /* /opt/homebrew/bin/herdr */
    perror("Herdr.app: exec " HERDR_BIN);
    return 1;
}
```

I tested whether macOS's credit survives the `exec`, both through `open` and from launchd. It does: macOS credits the process to the bundle, not to whatever code it now runs. So my launchd agent now starts the bundle instead of the binary.

Two details make it hold up across upgrades. The launcher execs Homebrew's stable symlink, so upgrades never touch the bundle. And the bundle is signed with my own certificate instead of ad-hoc, so even a rebuild keeps its grants.

## Let panes ask

From [Clayton O'Neill's version](https://github.com/claytono/dotfiles/pull/192) I took the usage descriptions. Pane processes now belong to `Herdr.app`, so a request for the microphone, the camera, or control of another app needs an `NS…UsageDescription` key in *Herdr.app's* `Info.plist`. Without one, macOS denies the request without asking. His PR also replaces the launchd agent with a `herdr` wrapper; it's worth a read.

> [!warning] Gotchas
> The Local Network list has no **+** button: "Herdr" appears only after it first prompts. Full Disk Access and Accessibility never prompt; add "Herdr" by hand. And a dead host gives the same `No route to host`, so check it with `nc` first.

Thanks to Paul Robello and Clayton O'Neill, and to everyone digging into [herdr#808](https://github.com/herdrdev/herdr/issues/808).
