# Delivery + workflow integrations (Module 25)

> Turn the dashboard's outputs (briefings, alerts, catalyst briefs,
> source incidents) into scheduled, routed, deduped, retryable
> deliveries across in-app / email / slack / webhook channels.

## Why this exists

The dashboard already produces five high-value content kinds. Module 25
wraps each one in a uniform delivery model so they can be:

* **scheduled** (daily / weekly / interval / event-driven),
* **routed** to per-content-kind targets via env-driven subscriptions,
* **rendered** with deterministic templates,
* **deduped** by fingerprint with TTL windows,
* **retried** with exponential backoff,
* **gated** by source freshness so stale data doesn't masquerade as fresh,
* **inspected** through a read-only Inbox tab + CLI preview.

## The five content kinds

| Content kind             | When it fires            | Depends on sources                   | Template summary |
| ------------------------ | ------------------------ | ------------------------------------ | --- |
| `morning_book_brief`     | Daily 07:30 UTC          | `raw_upstream` + `portfolio`         | exec summary + critical/high counts + on-book |
| `intraday_critical`      | Every 10 min             | `raw_upstream`                       | new critical/high alerts in last 15m |
| `coverage_hygiene`       | Daily 16:00 UTC          | `raw_upstream` + `portfolio`         | stale / single-broker coverage on book |
| `weekly_catalyst_brief`  | Mondays 06:00 UTC        | `catalyst_calendar` + `portfolio`    | next 14d events on book |
| `source_health_incident` | Event-driven (any failure)| (gate bypassed for this kind)        | which sources are failing + last error |

## Channels

Four channels share one interface and the same retry path.

| Channel   | Available by default | What's wired |
| --------- | -------------------- | --- |
| `in_app`  | yes                  | persisted attempts; the **Inbox** tab reads them |
| `email`   | stub                 | console-log fallback; promotes to real HTTP POST when `DELIVERY_EMAIL_HOST` + token env are set |
| `slack`   | stub                 | console-log fallback; sends to incoming-webhook URL when `DELIVERY_SLACK_WEBHOOK_URL_ENV` points to a real webhook env var |
| `webhook` | stub                 | real `fetch` when `DELIVERY_WEBHOOK_URL` is set |

Channels are bound at startup. Stubs persist `DeliveryAttempt`s so the
Inbox tab + CLI history still work — operators can verify what would
have been sent before flipping a real channel on.

## Subscriptions

Subscriptions = "this org wants this content kind delivered to these
targets, filtered by these conditions". One per `(org, content_kind)`.
Loaded from env at startup; no auth/user-management here.

```sh
# Default (unset): every kind goes to in_app:usr_default.
DELIVERY_DEFAULT_INAPP_USER=usr_arjun

# Override morning brief to also go to a PM email.
DELIVERY_SUB_MORNING_BOOK_BRIEF_TARGETS=in_app:usr_arjun,email:pm@aranya.com,slack:#research

# Filter intraday to high+ severities only, held names only.
DELIVERY_SUB_INTRADAY_CRITICAL_MIN_SEVERITY=high
DELIVERY_SUB_INTRADAY_CRITICAL_HELD_ONLY=1

# Mute a content kind entirely.
DELIVERY_SUB_COVERAGE_HYGIENE_ENABLED=0
```

## Source-freshness gating

Each template declares its `dependsOnSources`. Before rendering, the
scheduler asks the `SourceManager` for the current health snapshot and
makes one of three decisions:

* **proceed** — sources healthy, render normally.
* **proceed_degraded** — at least one dep is `stale`. Payload renders
  with a `DEGRADED` badge so recipients know the data isn't fresh.
* **defer** — at least one dep is `failing`. Run is recorded with
  `status=skipped_freshness` and no attempts are dispatched.

`source_health_incident` bypasses the gate — it's the one kind that
should fire *because* a source is failing.

## Suppression / dedup

Each rendered payload has a fingerprint (sha256 over content kind +
subject + body). After a successful send, a `DeliverySuppression` is
written for `(org, content_kind, target, fingerprint)` with a
content-kind-specific TTL:

| Content kind             | TTL    |
| ------------------------ | ------ |
| `morning_book_brief`     | 12 h   |
| `intraday_critical`      | 30 min |
| `coverage_hygiene`       | 12 h   |
| `weekly_catalyst_brief`  | ~weekly |
| `source_health_incident` | 1 h    |

Within the TTL, the same payload to the same target is `suppressed`,
not re-sent. Different payloads (different fingerprints) bypass
suppression — that's how a re-run with new data still lands.

## Retry / failure handling

Failed attempts get a backoff: `60s × 2^min(n−1, 6)` capped at 30 min.
The attempt's `nextRetryAt` carries the schedule. `delivery:resend
--id=<attemptId>` retries on demand. Categories tracked: `auth`,
`rate_limit`, `transient_5xx`, `transient_network`, `channel_disabled`,
`config`, `render`, `unknown`.

## Operator workflows

```sh
# What's wired
npm run ops -- delivery:list-schedules
npm run ops -- delivery:list-subscriptions
npm run ops -- delivery:list-channels

# Day-to-day
npm run ops -- delivery:run-due                # fire any due schedule
npm run ops -- delivery:preview --kind=morning_book_brief
npm run ops -- delivery:history --limit=20
npm run ops -- delivery:suppressions

# Recovery
npm run ops -- delivery:channel-failures
npm run ops -- delivery:resend --id=<attemptId>
npm run ops -- delivery:compare-payloads --before=<runId> --after=<runId>
```

## Channel-by-channel rollout

The safe path is **in-app first, email next, slack and webhook last**.
At every step, the Inbox tab + `delivery:preview` show what *would*
happen before a single byte leaves the host.

### 1. Verify the in-app inbox (always-on)

```sh
npm run ops -- delivery:run-due
```

Then open the **Inbox** tab. You should see one item per content kind
that produced a payload. Click through to confirm each routes to the
correct dashboard tab (briefing / mybook / catalysts / sources).

### 2. Add a real email channel

```sh
export DELIVERY_EMAIL_ENABLED=1
export DELIVERY_EMAIL_HOST=https://api.your-mail-vendor.com/v3
export DELIVERY_EMAIL_TOKEN_ENV=MAIL_TOKEN
export MAIL_TOKEN=...
export DELIVERY_EMAIL_FROM=alerts@yourorg.com
export DELIVERY_SUB_MORNING_BOOK_BRIEF_TARGETS=in_app:usr_arjun,email:pm@aranya.com
```

Then:

```sh
npm run ops -- delivery:list-channels        # email available=true
npm run ops -- delivery:preview --kind=morning_book_brief
npm run ops -- delivery:run-due              # actually sends now
npm run ops -- delivery:history --limit=5
```

Watch the Inbox tab for the in-app row, then check the inbox of the
email recipient. If it errors, `delivery:channel-failures` shows the
category + `delivery:resend` retries.

### 3. Add Slack

```sh
export DELIVERY_SLACK_ENABLED=1
export DELIVERY_SLACK_WEBHOOK_URL_ENV=SLACK_WEBHOOK_URL
export SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
export DELIVERY_SUB_INTRADAY_CRITICAL_TARGETS=in_app:usr_arjun,slack:#research-critical
```

Then `delivery:preview --kind=intraday_critical` and `delivery:run-due`.

### 4. Add webhook

```sh
export DELIVERY_WEBHOOK_ENABLED=1
export DELIVERY_WEBHOOK_URL=https://your-host/inbound/research
export DELIVERY_WEBHOOK_TOKEN_ENV=WEBHOOK_TOKEN
export WEBHOOK_TOKEN=...
export DELIVERY_SUB_SOURCE_HEALTH_INCIDENT_TARGETS=in_app:usr_oncall,webhook:default
```

The webhook channel POSTs structured JSON (kind + subject + summary +
text). Use it for in-house tooling, PagerDuty Events V2, etc.

## How analysts experience it

* **Morning** — they open the dashboard, the Inbox shows the morning
  brief with critical / high / on-book counts and a click-through to
  the Briefing tab.
* **Intraday** — every 10 min, if a critical alert lands, a row appears
  in the Inbox; if email/slack are wired, it also lands there.
* **Late afternoon** — coverage hygiene rolls up; analysts know which
  positions need attention.
* **Monday morning** — the weekly catalyst brief arrives with the
  upcoming events on book.
* **When something breaks upstream** — the source-health incident
  delivery lands explicitly, even if the morning brief is `deferred`.

## What this module deliberately does NOT do

* No auth / user-management. Subscriptions are env-driven; targets are
  identifier strings. A future Module 26 can layer ACLs.
* No rich HTML email templating engine. The renderers produce plaintext
  + lightweight markdown that real channels accept.
* No mutation surface in the dashboard. The Inbox is read-only —
  marking-as-read, snooze, etc. live elsewhere.
* No cron daemon. The CLI is the trigger today; a long-running daemon
  can call the same `Scheduler.runDue()` on a tick later.
