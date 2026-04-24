# Local backend — fixture-backed ingestion + `/v1` API

This is the dev-shaped backend that lives under `server/`. It proves the
end-to-end path the real system will run:

```
fixture email (.json)
  → sender allowlist validation         (server/src/ingestion/validateSender.ts)
  → DocumentTextExtractor                (server/src/ingestion/extractText.ts)
  → normalized domain records            (server/src/ingestion/normalize.ts)
  → in-memory store                      (server/src/store/InMemoryStore.ts)
  → HTTP /v1 API                         (server/src/api/routes.ts)
  → frontend HttpResearchAdapter         (VITE_RESEARCH_ADAPTER=http)
```

It is **not** a production backend. It is a narrow, backend-compatible
proof that the ingestion-and-serve path works and matches
[`docs/api-contract.md`](./api-contract.md) exactly.

## What's stubbed vs production-grade

| Concern                | Today                                                  | Production                                   |
| ---------------------- | ------------------------------------------------------ | -------------------------------------------- |
| Inbound mail transport | fixture JSON files                                     | MTA (Postfix / Cloudflare Email Workers) → normalized JSON queue |
| Auth                   | `VITE_API_TOKEN=dev-token`, server does not validate   | OIDC / SAML → bearer token → scope lookup    |
| Storage                | `InMemoryStore` in process memory                      | Postgres (or Supabase / DynamoDB)            |
| Document extraction    | plain text + weak PDF fallback                         | `pdf-parse` / `pdfminer` + OCR fallback      |
| Summary extraction     | conservative regex + keyword vocabulary                | LLM-assisted extraction (out of scope now)   |
| Conflict closure       | computed on read via `src/engine/`                     | same logic, likely cached server-side        |
| Rejections             | logged + counted at startup                            | durable log + operator console               |

Everything else (domain shapes, HTTP contract, error envelope,
pagination, CORS preflight, URL conventions) is production-shaped.

## Running the whole thing

Two processes:

**Terminal 1 — the local backend.** Runs ingestion over fixtures then
serves `/v1` on port 4000:
```bash
npm run server:dev
```
Expected output:
```
┌─ ingestion ────────────────────────────────────────────
│  accepted:          4
│  rejected:          2
│  reports produced:  4
│  opinions produced: 4
│  evidence produced: 12
│
│  rejections:
│    • [SENDER_NOT_ALLOWLISTED] morningcall@bloomberg.com → research@aranyacap.munshot.io
│        sender morningcall@bloomberg.com not in allowlist for org_aranya
│    • [UNKNOWN_RECIPIENT] research@kotak.com → someone@random.example
│        recipient someone@random.example does not match any org forwarding address
└────────────────────────────────────────────────────────
API listening on http://localhost:4000
```

**Terminal 2 — the frontend pointed at that backend:**
```bash
npm run dev:http
```
(this is sugar for `VITE_RESEARCH_ADAPTER=http VITE_API_BASE_URL=http://localhost:4000 VITE_API_TOKEN=dev-token vite`)

Open `http://localhost:5173`. The dashboard now renders entirely from
ingested fixtures.

## Ingest-only mode

Runs the pipeline and exits without starting the server. Useful for
verifying a new fixture passes admission + extraction:
```bash
npm run server:ingest
```

## Ports + env

| Variable         | Default                | Description                              |
| ---------------- | ---------------------- | ---------------------------------------- |
| `SERVER_PORT`    | `4000`                 | Port the HTTP server binds               |
| `VITE_API_BASE_URL` | `http://localhost:4000` | Frontend's base URL                   |
| `VITE_API_TOKEN` | any non-empty string   | Sent as `Authorization: Bearer` header   |

The server does not validate the bearer today — any value is accepted.

## Fixture format

Each file under `server/fixtures/emails/{accepted,rejected}/*.json`
represents a single inbound email in the shape the real MTA will
eventually hand us:

```json
{
  "messageId":      "<kotak-tcs-20260424T0915@kotak.com>",
  "envelopeSender": "research@kotak.com",
  "originalFrom":   "Kotak Institutional Equities <research@kotak.com>",
  "forwardedBy":    ["kavita.iyer@aranyacap.example"],
  "recipient":      "research@aranyacap.munshot.io",
  "subject":        "TCS: 4QFY26 preview — Deal TCV acceleration intact; Buy reiterated",
  "receivedAt":     "2026-04-24T09:15:30.000Z",
  "bodyText":       "We reiterate Buy on TCS with ...",
  "bodyHtml":       null,
  "attachments": [
    {
      "filename":     "TCS_Kotak_20260424.txt",
      "mimeType":     "text/plain",
      "fixturePath":  "../../attachments/TCS_Kotak_20260424.txt",
      "pageCount":    1,
      "language":     "en"
    }
  ]
}
```

`fixturePath` is resolved relative to the JSON file's directory.

## Allowlist rules (server/src/ingestion/validateSender.ts)

An email is **admitted** if and only if:

1. `recipient` matches some `Organization.forwardingAddress`.
2. `envelopeSender` — either the exact address or its domain — is on
   the org's allowlist AND resolves to an enabled broker id.
3. If `forwardedBy` is non-empty, the last-hop forwarder is on the
   org's allowed-forwarder list.

If any check fails the email is **rejected** with one of:
`UNKNOWN_RECIPIENT`, `SENDER_NOT_ALLOWLISTED`, `FORWARDER_NOT_ALLOWED`,
`ATTACHMENT_MISSING`, `EXTRACTION_FAILED`. Rejections are printed at
ingestion time; rejected emails never enter the store.

## Adding an allowed broker sender

Brokers come from [`src/mocks/brokers.ts`](../src/mocks/brokers.ts); the
allowlist in [`server/src/config/allowlist.ts`](../server/src/config/allowlist.ts)
is derived automatically from every enabled broker's `senderDomains`.
So to admit a new sender:

1. Add (or edit) the broker row in `src/mocks/brokers.ts` with the
   right `senderDomains`.
2. Confirm the broker appears in the relevant org's
   `enabledBrokerIds` in `src/mocks/organizations.ts`.
3. Restart `npm run server:dev`.

No code changes in `server/` needed.

## Adding an allowed forwarder

Edit `ALLOWED_FORWARDERS_BY_ORG` in
[`server/src/config/allowlist.ts`](../server/src/config/allowlist.ts).

## Adding an email fixture

1. Drop any raw attachment (plain text or PDF) under
   `server/fixtures/attachments/`.
2. Create a JSON under `server/fixtures/emails/accepted/` with the
   shape above. `fixturePath` points at the attachment relative to the
   JSON's directory (typically `../../attachments/<filename>`).
3. `npm run server:ingest` to confirm it's admitted and extracted.

Rejected fixtures live under `server/fixtures/emails/rejected/`.

## Conservative normalization

The normalizer (`server/src/ingestion/normalize.ts`) emits the optional
fields only when the source material contains them literally:

| Field                  | Rule                                                               |
| ---------------------- | ------------------------------------------------------------------ |
| `brokerId`             | resolved via allowlist (sender domain → broker)                    |
| `ticker`               | first known ticker appearing in subject + body + attachments       |
| `rating`               | first explicit `Buy`/`Overweight`/`Hold`/`Underweight`/`Sell` word |
| `targetPrice`          | `PT` / `target` / bare `₹N,NNN` pattern                            |
| `priorTargetPrice`     | `prior PT` or `from ₹N,NNN` pattern                                |
| `themes`               | keyword match against a fixed vocabulary (no LLM)                  |
| `keyPoints`            | bulleted lines or sentences with `%` / `y/y` / `bps` / `cr`        |
| `risks`                | lines beginning with `Risk:` / `Risks:`                            |
| `stance`               | derived from the rating                                            |
| `confidence`           | `0.75` when both rating and target resolve; `0.55` otherwise       |

If a ticker cannot be resolved from subject/body/attachment, the email
still enters the store as a `BrokerEmail` record with `status=ready`,
but no report / summary / opinion are produced — the ingestion ops view
will flag this as "admitted but not extractable" so an analyst can
follow up.

## Future replacements

- **Mailbox ingestion.** Swap the fixture-file loader in
  [`server/src/ingestion/pipeline.ts`](../server/src/ingestion/pipeline.ts)
  for an IMAP / Gmail / Postfix drop-folder watcher. The downstream
  normalizer is unchanged.
- **Real auth.** Replace the fixed `FIXED_SESSION_SCOPE` in
  [`server/src/api/routes.ts`](../server/src/api/routes.ts) with a
  proper token → scope decoder. The frontend already sends
  `Authorization: Bearer <token>` on every call.
- **Persistent store.** Implement the same reader interface as
  `InMemoryStore` over Postgres. Ingestion writes once on email intake;
  the store is read-only from the API's perspective.
- **Real PDF / OCR.** Swap `PlainTextAndWeakPdfExtractor` for a
  dependency-backed extractor that implements
  `DocumentTextExtractor`. Nothing else changes.
