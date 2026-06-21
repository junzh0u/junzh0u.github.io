---
title: DMARC isn't about passing — it's about alignment
date: 2026-06-19
description: I wanted to send mail as my own domain from Gmail. SPF passed, DKIM passed, and it still got spam-filtered — because DMARC checks alignment, not just authentication. The fight, and the Cloudflare-only fix.
---

> [!tldr]
> I wanted to send mail as `junz@junz.info` while keeping my everyday Gmail inbox. Gmail's "Send mail as" made it *look* done — SPF passed, DKIM passed — and my mail still slipped into spam now and then. The missing concept is **alignment**: DMARC doesn't care that *some* domain authenticated, it cares that the authenticated domain *matches the one in your From: line*. Free Gmail can never make that match for a domain it doesn't own. The fix that kept everything on Cloudflare — and out of Google Workspace — was Cloudflare's Email Service as an outbound SMTP relay.

## What happened, in order

- **Added `junz@junz.info` to Gmail's "Send mail as," sending through Gmail.** Mail as my own domain went out fine — but every so often one landed in a Gmail recipient's spam. Not always; just often enough to bug me.
- **Pulled up the DMARC aggregate reports.** Every message scored *0% SPF aligned, 0% DKIM aligned* — failing DMARC on alignment, not on authentication.
- **Saw Cloudflare's "DMARC policy — Warning" and raised `p=none` → `p=quarantine`,** figuring stricter looked more legit. It backfired: the occasional spam-foldering became reliable.
- **Tried the textbook fix, Google Workspace.** Bailed after ten minutes — a second Google account to babysit, and an admin console built for IT departments, not one person with one domain.
- **Reverted — and now Gmail couldn't deliver to `@junz.info` at all,** though iCloud still could. Not DNS: Google still believed it owned the domain, and putting the MX records back didn't change that.
- **Deleted the Workspace account and its leftover verification record.** Not an instant fix — about half an hour later, Gmail could finally deliver to `junz.info` again.
- **Found Cloudflare Email Service — an outbound relay — onboarded the domain, and pointed Gmail's "Send mail as" at its SMTP.** The test send came back `dkim=pass` for `junz.info` and `dmarc=pass`. Aligned at last.
- **Re-raised DMARC to `p=quarantine`** — this time *after* my own mail aligned, the way round it should have been.

## The setup that looked finished

My inbound mail was already sorted: [Cloudflare Email Routing](https://developers.cloudflare.com/email-routing/) catches everything to `*@junz.info` and forwards it to my personal Gmail. For outbound, Gmail has a built-in answer — **Settings → Accounts → "Send mail as"** — so I added `junz@junz.info`, set it to send through Gmail, and started replying as my own domain. Sent fine. Looked done.

It wasn't. Every so often a message to a Gmail recipient slipped into their spam folder — not every time, just enough to notice — and the DMARC aggregate reports (the `rua=` address in my `_dmarc` record, pointed at Cloudflare) told me why in one line:

```
Google LLC — 15 messages, 0% SPF aligned, 0% DKIM aligned
```

Every message I'd sent as `junz@junz.info` was failing DMARC — not just the ones that got filtered. At `p=none` a DMARC failure is only a *negative signal*, not a verdict, so Gmail junked some and waved the rest through: the failure was constant, the spam-foldering only intermittent. And it wasn't failing *authentication* — it was failing **alignment**. That distinction is the whole post.

## SPF passed. DKIM passed. DMARC failed.

The three records do different jobs, and the names hide how little they overlap:

- **SPF** says which servers are allowed to send for a domain (a DNS TXT record listing IPs/includes). It authenticates the **envelope** sender — the `MAIL FROM` the receiving server negotiates, *not* the `From:` you see in your client.
- **DKIM** cryptographically signs the message; the signature carries a `d=` tag naming the signing domain. A valid signature proves *that domain* vouched for the message.
- **DMARC** ties those to the one thing a human actually reads: the `From:` header. It passes only if SPF **or** DKIM not just *passes*, but **aligns** — the authenticated domain has to match your visible `From:` domain.

That last clause is the trap. When you use free Gmail's "Send mail as" and send *through Gmail*, the mail leaves Google's servers, so Google authenticates it as **Google's**:

- DKIM is signed `d=gmail.com` — a perfectly valid signature, for the wrong domain.
- The envelope sender is your `…@gmail.com` address, so SPF passes for **gmail.com**.
- But your `From:` says `junz.info`. Neither authenticated domain matches it.

So the receiver sees `spf=pass`, `dkim=pass`, and `dmarc=fail` — because both passes are for `gmail.com` while the header claims `junz.info`. There is no Gmail setting or DNS record that fixes this: free Gmail simply can't DKIM-sign as a domain it doesn't host. The fix has to move my *outbound* mail onto something that authenticates `junz.info` itself.

## The backfire: tightening DMARC first

Before I understood any of that, I did the worst possible thing: I saw the "DMARC policy — Warning" badge on Cloudflare nudging me off monitoring mode, and I stepped my policy from `p=none` up to `p=quarantine`.

`p=none` is *monitoring only* — receivers report failures but take no action. `p=quarantine` means **failing mail goes to spam**; `p=reject` blocks it outright. I had it backwards in my head: I thought tightening the policy would make my mail *more* trusted. It does the opposite — it tells the world to **punish** anything claiming to be `junz.info` that doesn't authenticate. And the mail that didn't authenticate was *my own*. Quarantine didn't fix the occasional spam-foldering — it turned the intermittent problem into a reliable one.

> [!warning] Don't raise DMARC until your senders align
> `p=none → quarantine → reject` is a hardening path you walk *after* you've confirmed every legitimate sender passes alignment — not before. Raising the policy while your own mail is unauthenticated just instructs receivers to junk you. Read the aggregate reports first; tighten only once they're clean.

## The detour I bailed on — note to future self: don't reopen this

This section is mostly a memo to a later version of me, because the trap is that the "obvious" fix looks *more* obvious every time you forget you already tried it. So, future me: **you have already gone down the Google Workspace road. Here is why it didn't work out. Don't do it again.**

The pitch is genuinely tempting: put `junz.info` on **Google Workspace**, and Gmail natively DKIM-signs as `junz.info` — alignment solved at the source, keep using Gmail exactly as before. It *does* fix the authentication problem. I started it, verified the domain, began the migration — and abandoned it after about ten minutes, for two reasons that haven't changed and won't:

- **It means living in two Google accounts.** Workspace provisions a **brand-new, standalone account** (`junz@junz.info`, separate login, separate inbox) sitting next to my existing personal one. Maintaining two Google identities day to day is more ongoing friction than the original problem ever caused.
- **The admin console UX is punishing.** Every simple thing — DKIM, default routing, a catch-all — is buried three menus deep in an interface built for IT departments managing hundreds of seats, not one person with one domain. Ten minutes in, I was clicking through routing rules to do what a single Cloudflare toggle does.

The fix worked on paper and cost more than the disease. That's the whole verdict — recorded here so I don't have to rediscover it the next time the Workspace option starts looking clever again.

> [!warning] Workspace doesn't let go cleanly
> Bailing out left a booby-trap. Suddenly **Gmail couldn't deliver to `@junz.info` at all** — but iCloud could. That's not DNS cache: an external sender working proves the public MX resolves fine everywhere, and a stale cache would break *every* sender, not just one. The tell is that it's *specifically Google* failing. As long as the Workspace account still "owns" the domain internally, Gmail short-circuits delivery to that phantom mailbox — and **reverting your MX records doesn't fix it**, because MX doesn't govern Google's internal routing; account ownership does. I had to fully **delete the Workspace account** and clean up its leftover `google-site-verification` TXT record — and even then it wasn't immediate: Gmail only started delivering to `junz.info` again about half an hour later, once Google's side caught up. None of that is visible in `dig`; the only real test is a live send.

## The fix: Cloudflare as the outbound relay

I wanted to stay on Cloudflare, where my DNS and inbound routing already live. The catch is that **Cloudflare Email Routing is receive-only** — it cannot send, so it can't fix outbound alignment. I'd written off Cloudflare for sending entirely until I hit its separate, newer product: [**Cloudflare Email Service**](https://developers.cloudflare.com/email-service/), an outbound relay that DKIM-signs as your domain and — crucially — exposes a plain **SMTP endpoint** you can drop straight into Gmail's "Send mail as → send through SMTP."

The shape of it:

- You **onboard the domain** in the Cloudflare dashboard. Because Cloudflare runs your DNS, it writes the records itself — an MX on a **`cf-bounce` subdomain** (not your apex, so Email Routing keeps owning inbound), plus the SPF/DKIM/DMARC TXT records the relay needs.
- You point Gmail's "Send mail as `junz@junz.info`" at Cloudflare's SMTP host with the generated credentials.
- Now mail you compose in your normal Gmail inbox **relays out through Cloudflare**, which signs it `d=junz.info` and sends it with an envelope on `cf-bounce.junz.info`. Both DKIM and SPF now authenticate a domain that *aligns* with your `From:`.

Same inbox, same compose window. Only the exit door changed. Here's the receiver's verdict on a test send, which is the entire point of the exercise:

```
Authentication-Results: mx.google.com;
  dkim=pass header.i=@cloudflare-smtp.net header.s=cf2024-1;
  dkim=pass header.i=@junz.info        header.s=cf-bounce;
  spf=pass   smtp.mailfrom=bounces@cf-bounce.junz.info;
  dmarc=pass (p=NONE) header.from=junz.info
```

`dkim=pass` for `@junz.info`, `spf=pass` on a `junz.info` subdomain, and the line that was failing for a week: **`dmarc=pass header.from=junz.info`**. (The header still reads `p=NONE` because that's where my policy sat when I captured it.) With alignment finally real, I've since raised the policy to **`p=quarantine`** — receivers now junk anything claiming to be `junz.info` that doesn't authenticate, and my own mail sails through because it finally does. This time the tightening came *after* the senders aligned, the way round it was always supposed to go.

## What I'd tell past me

- **"It passed" is not "it aligned."** A green SPF/DKIM check on a vanity-domain send tells you almost nothing until you confirm the authenticated domain *matches your `From:`*. Read the DMARC aggregate reports — the alignment columns are where the truth is.
- **Free Gmail "Send mail as" can never pass DMARC for a domain it doesn't host.** Stop looking for the Gmail setting; there isn't one. You need a real sender for the domain.
- **Don't raise your DMARC policy to fix delivery.** It does the opposite. Tighten last, not first.
- **"Provider X can deliver to me but provider Y can't" is a diagnosis, not a mystery.** External sender works → your public DNS is fine → the failing provider is holding internal state about your domain. It's never DNS cache when only one sender is affected.
- **Receiving and sending are different problems.** Cloudflare Email Routing handles one; Email Service handles the other. Knowing which half a tool covers saves you from expecting inbound config to fix outbound mail.

The whole thing was maybe a dozen DNS records and one SMTP setting in the end. The hard part was never the configuration — it was understanding that DMARC grades the one identity your recipient actually sees, and nothing else counts until that one lines up.
