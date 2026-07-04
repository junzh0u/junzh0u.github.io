---
title: parcel-gmail-ingest — shipping emails into Parcel.app, hands-free
date: 2026-07-03
description: Parcel discontinued its built-in email ingestion, so I rebuilt the loop with the two parts you already have — Gmail filters queue carrier emails under a label, an Apps Script feeds Parcel's API. No servers, no OAuth app.
draft: true
---

> [!tldr]
> Parcel's built-in email ingestion has been [discontinued](https://mastodon.social/@parcel/115890114779508559), but its premium tier still has an [add-delivery API](https://parcelapp.net/help/api-add-delivery.html). The whole replacement is a Gmail filter plus a Google Apps Script: [parcel-gmail-ingest](https://github.com/junzh0u/parcel-gmail-ingest), ~130 lines, no servers, no OAuth app.

## Two parts you already have

Detection is Gmail filters, one per carrier, labeling ship notifications `parcel/inbox`:

```text
from:mcinfo@ups.com subject:"UPS Ship Notification"                   → parcel/inbox
from:TrackingUpdates@fedex.com subject:"Your shipment is on the way"  → parcel/inbox
```

Ingestion is an Apps Script on a 15-minute trigger: read the labeled threads, regex the tracking number out of the subject and the shipper out of the body, POST to Parcel, swap the label to `parcel/ingested`. Labels are the whole state machine — the pending queue is a label search, the audit log is another, and reprocessing is dragging a label in the Gmail UI.

That's the entire hint. If you can already see the rest, [the repo](https://github.com/junzh0u/parcel-gmail-ingest) is a worked example; what follows is just the parts that weren't obvious until they bit.

## The rate limit is the design

Parcel allows 20 API requests per day, *failures included*. Everything else falls out of that: each run caps at 20 threads, every added tracking number is remembered for good (a ring buffer in script properties), and errors split into exactly two kinds. A rejection (400) is permanent — log it, relabel anyway, never retry a doomed request into the budget. Everything else is transient — throw, abort the run, and the queue survives untouched for the next tick.

## The parts that bit

- Auth is a non-event *because* the code runs inside the account: no OAuth client, no refresh token — one authorize prompt, one API key in script properties. That asymmetry is the reason this is an Apps Script and not a cloud function.
- `getPlainBody()` renders bold HTML the markdown way. My first delivery arrived on my phone as `*PENSER SC*`, stars included.
- HTML preheaders mention the shipper before the visible copy does — my non-greedy FedEx regex matched from the hidden sentence and grazed across two more. Anchor on wording only the real sentence has.
- Gmail labels are thread-level: one reply re-surfaces an entire ingested thread. The label swap only keeps the queue search small — the real dedup is that persisted set of tracking numbers.
- A message is just `{getSubject, getPlainBody}` to the script, so the parser tests in plain Node against text from a real `.eml` — no deploys, no burned requests.
- Fresh deliveries show "No data available" until Parcel first polls the carrier. Normal.

Adding a carrier is one entry — subject regex, [carrier code](https://api.parcel.app/external/supported_carriers.json), shipper regex — plus one filter. Mine has been quietly emptying `parcel/inbox` ever since.
