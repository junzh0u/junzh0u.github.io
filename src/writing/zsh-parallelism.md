---
title: Parallelism in zsh in two small primitives
date: 2026-06-13
description: Shell scripts don't have to run one thing at a time. A bounded job pool and a coprocess-backed mutex — about ninety lines between them — make zsh scripts parallel and safe.
---

> [!tldr]
> Two small zsh helpers turn serial scripts into parallel ones: a job pool that caps concurrency at twice the CPU count, and a mutex built on a lock-holding coprocess. Used together they deadlock in a genuinely non-obvious way — the fix is a pair of parentheses, and finding it cost me an afternoon. Both live in [the-usual](https://github.com/junzh0u/the-usual), the toolkit I [source at the top of every script](/writing/the-usual/).

## Serial by default

A loop that processes a few hundred files one at a time is the default shape of a shell script, and it leaves the machine almost entirely idle. zsh has perfectly good job control — `cmd &` backgrounds, `wait` joins — but using it raw has two problems: fire off `&` in an unbounded loop and you'll spawn five hundred processes at once and melt the box; and the moment two jobs touch a shared resource, you need mutual exclusion. I wrote one primitive for each.

## A bounded job pool

The first is a throttle: before backgrounding the next job, block until there's a free slot. zsh exposes the current jobs as `$jobstates`, so "how many am I running" is just `${#jobstates}`. Here's [`concurrency.zsh`](https://github.com/junzh0u/the-usual/blob/main/concurrency.zsh) end to end:

```zsh
source ${${(%):-%x}:A:h}/log.zsh   # for log_warning_vvv, below

if (( $+commands[nproc] )); then
    MAX_CONCURRENCY=$(( $(nproc --all) * 2 ))
else
    MAX_CONCURRENCY=$(( $(sysctl -n hw.ncpu) * 2 ))
fi

function wait_if_too_many_jobs {
    local interval=0.1
    while (( ${#jobstates} >= $MAX_CONCURRENCY )); do
        log_warning_vvv "Reached max concurrency $MAX_CONCURRENCY, wait for $interval sec"
        sleep $interval
    done
}
```

The cap is twice the core count because most of my parallel work is I/O-bound — transcoding, hashing, moving files — so oversubscribing keeps the CPUs busy while jobs wait on disk. Usage is one line per loop iteration:

```zsh
for file in $files; do
    wait_if_too_many_jobs
    process "$file" &
done
wait
```

Call it before each `&`, finish with a bare `wait`. That's the entire contract. It polls every 100ms instead of waking on job completion, which sounds lazy and is — but for batch jobs that each run for seconds, the overhead is invisible and the code stays readable. (That `log_warning_vvv` only fires at `-vvv`, the noisiest level; the helper pulls in [the-usual's `log.zsh`](/writing/zsh-argparse/) for it, so it logs without needing the flag parser sourced too.)

## A mutex that survives Ctrl-C

The harder primitive is mutual exclusion: sometimes two invocations of a script must not run a critical section at once. The classic shell answer is a lock file, and the classic lock-file failure is the orphan — the script dies before cleanup, the stale lock stays, and the next run hangs forever on a lock nobody holds.

The trick I settled on: the script never holds the lock itself. It spawns a **coprocess** whose only job is to take an OS-level lock (`lockf` on macOS/BSD, `flock` on Linux) and then block — here's the heart of [`mutex.zsh`](https://github.com/junzh0u/the-usual/blob/main/mutex.zsh):

```zsh
coproc lockf -s $MUTEX sh -c "echo ready; read"
holder_pid=$!

# Block until the coprocess says it has the lock
if ! read -p; then
    wait $holder_pid
    return 1
fi
```

The coprocess takes the lock, prints `ready`, and sits on `read` doing nothing. The parent blocks on `read -p` — reading from the coprocess — until that `ready` arrives; that's the acquisition. Cleanup is a trap:

```zsh
trap "kill $holder_pid 2>/dev/null; wait $holder_pid 2>/dev/null" EXIT
```

When the script ends — normally, by error, by Ctrl-C — the trap kills the coprocess and the kernel releases the lock with it. There's still a lock *file* on disk (`lockf` and `flock` need one to lock against), but the file isn't the lock: the kernel state on it is, and that dies with the holder. A leftover file after a crash means nothing; the next run just locks it again. Both tools also take a timeout, so `mutex indexing 30` waits up to thirty seconds and fails cleanly instead of hanging — and a `try_mutex` variant passes a timeout of zero to make it non-blocking.

## Where the two primitives collide

Here's the bug that cost me the afternoon, and the reason this post exists. The mutex works by parking a background coprocess. The job pool finishes with a bare `wait`. And `wait` with no arguments waits for **all** background jobs — including the mutex's coprocess, which never exits on its own.

So a script that takes a mutex *and* runs a parallel loop deadlocks at the final `wait`: every worker finishes, and `wait` keeps blocking on the one process that is deliberately sitting there holding the lock forever. Until you see it, it looks like the mutex is randomly hanging. Once you see it, it's obvious.

> [!warning] The fix
> Wrap the parallel section in a subshell, so its `wait` only joins the jobs *it* started — never the mutex coprocess living in the parent:
>
> ```zsh
> mutex indexing          # held by the parent shell
>
> # Subshell so this `wait` waits only for these jobs,
> # not the mutex coprocess in the parent
> (
>     for file in $files; do
>         wait_if_too_many_jobs
>         process "$file" &
>     done
>     wait
> )
> # mutex still held here; released on EXIT
> ```

The subshell gives the parallel work its own job table; the coprocess stays in the parent's, untouched, and the `EXIT` trap cleans it up when the whole script ends. It's the exact shape of my one script that takes a lock and then fans out — the comment lives in the source so the next one gets the parentheses for free.

## Two lines per script

That's the whole kit — about ninety lines of zsh across the two files. A serial script goes parallel by adding `wait_if_too_many_jobs` above the `&` and a `wait` at the end; a racy one goes safe with `mutex <name>` at the top. The deadlock between them is the kind of lesson worth paying for exactly once — and then leaving a comment about, so the next script gets the parentheses for free.
