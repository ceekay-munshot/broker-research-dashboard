# Ingestion parser profiles

This is the reference for how real-world broker `.eml` messages that land in
the Munshot/Vimana mailbox are turned into the canonical frontend records
documented in `docs/api-contract.md`. The upstream customer-side
forwarding flow is out of scope; the profiles take over once a raw `.eml`
byte blob arrives on our side.

The entry point is `server/src/ingestion/emlLoader.ts`. It parses the
`.eml` (RFC 5322 + MIME via `server/src/eml/parse.ts`, no dependency),
resolves the delivered recipient → org, picks a **parser profile** based
on the email's shape, and invokes that profile's extractor.

## Profile picker (server/src/ingestion/profiles/index.ts)

Deterministic first-match selector. Order matters; the most specific match
wins.

| Order | Profile id                 | Trigger                                                                            |
| ----- | -------------------------- | ---------------------------------------------------------------------------------- |
| 1     | `jmfl_research_of_day`     | `From: jmfsebgresearch@jmfl.com` · subject `Research of the Day` · has PDF         |
| 2     | `jmfl_morning_brief`       | `From: jmfsebgresearch@jmfl.com` · subject `JMFL: India Morning Brief`             |
| 3     | `jmfl_daily_digest`        | `From: jmfsebgresearch@jmfl.com` · subject `Daily Financial Market Digest`         |
| 4     | `iifl_html_single`         | `From: *@iiflcap.com`                                                              |
| 5     | `kotak_pdf`                | `From: *@kotak.com` · at least one `application/pdf` attachment                    |

If no profile matches, the email is rejected with `SENDER_NOT_ALLOWLISTED`
and the detail field records the sender + truncated subject for triage.

## How each pattern was found

The pattern classification comes directly from inspecting the real `.eml`
samples in `server/fixtures/eml/`. Every fixture file is a **golden
regression sample** — `npm run server:test` runs every one through the
parser + profile + extractor and asserts the expected profile id, broker
id, attachment count, candidate count, and idempotency.

### Pattern A — Kotak direct PDF email (`kotak_pdf`)

**Samples:** `23April2026_India_Daily.pdf.eml`, `Cyient  One Pager  Q4FY26  Result Update.eml`, `MORNING INSIGHT  24 APRIL 2026.eml`, `STOCK RECOMMENDATION  23 APRIL 2026.eml`.

Shape:
```
Delivered-To:  vimana@vimanacapital.com
From:          "Kotak Neo" <kspcg.research@kotak.com>
Return-Path:   <comtrack.bounces@kotak.com>
Content-Type:  multipart/mixed; boundary="..."
  - text/html          (tiny or empty body)
  - application/pdf    (the actual research)
```

What the profile does:
- Emits one `ReportCandidate` per email.
- Pulls the report title from the subject + PDF filename (filenames like
  `Cyient_One_Pager_Q4FY26_Result_Update.pdf` already encode company + report type).
- Runs the conservative rating / target / prior-target / ticker scans
  against `subject + filename + extracted PDF text`.
- Evidence snippets come from the PDF text when it was extractable; if
  the weak PDF extractor produced nothing, evidence is empty and the
  attachment's `parseStatus` is set to `failed` with a note pointing at
  the PDF-parse stub.

### Pattern B.1 — JMFL India Morning Brief (`jmfl_morning_brief`)

**Sample:** `FW_ JMFL_ India Morning Brief (23 April 2026)_ …`.

Shape:
```
From:     jmfsebgresearch <jmfsebgresearch@jmfl.com>
Subject:  FW: JMFL: India Morning Brief (<date>): <comma-separated companies>
Body:     forwarding preamble → top bulleted index → per-company detail blocks
```

Detail blocks look like:
```
Havells India | 4Q a beat, but how sustainable is it?

Rating Downgrade                   ADD                 INR 1,490

<body text>
```

What the profile does:
- Splits the body into sections keyed on the `Company | Headline` header
  pattern (ignoring bulleted-index lines with `•` and URL-only lines).
- Emits one `ReportCandidate` per detail section — the digest goes
  in as multiple discrete reports under the parent email.
- Explicitly parses the rating-and-target line (`ADD   INR 1,490`)
  when present; else falls back to the standard rating/target inference.
- Evidence snippets are the first 1–2 sentences of the section body.

### Pattern B.2 — JMFL Daily Financial Market Digest (`jmfl_daily_digest`)

**Sample:** `FW_ JMFS Fundamental Research - Daily Financial Market Digest (24th April 2026).eml`.

Shape:
```
From:     jmfsebgresearch@jmfl.com
Subject:  FW: JMFS Fundamental Research - Daily Financial Market Digest (<date>)
Body:     plaintext digest: CompanyName: sentence explanation. Positive|Neutral|Negative
```

Repeats for every company, sometimes 5+ entries.

What the profile does:
- Splits at the `Positive|Negative|Neutral` trailing tag to get one
  entry per company.
- Emits one `ReportCandidate` per entry. Stance maps directly from the
  sentiment tag; **no rating or target price is ever synthesised**
  (digest entries are news flow, not recommendations).
- Evidence = the single digest sentence, recorded as `thesis`.
- Skips section headers like `Top Corporate News`, `Global Markets`,
  `Commodity Updates`.

### Pattern B.3 — JMFL Research of the Day (`jmfl_research_of_day`)

**Sample:** `FW_ Research of the Day.eml`.

Shape:
```
From:     jmfsebgresearch@jmfl.com
Subject:  FW: Research of the Day
MIME:     multipart/mixed → multipart/related → multipart/alternative
  Content: HTML digest body
  Attach:  IndiaMorningBrief_24Apr26.pdf (authoritative research)
  Inline:  image001.png (forwarded email signature image)
```

What the profile does:
- Treats the PDF as the authoritative artefact. Emits one
  `ReportCandidate` keyed on the PDF filename.
- Inline images are dropped from the attachment list (they're decoration).
- Evidence = the first 2 sentences of the PDF's text (if extractable).
- No digest splitting here — that's `jmfl_morning_brief`'s job; this
  profile just surfaces the parent PDF.

### Pattern C — IIFL direct HTML (no PDF) (`iifl_html_single`)

**Sample:** `India Auto _ Competition heats up in mid-size SUVs.eml`.

Shape:
```
From:         "Joseph George, IIFLCAP" <joseph.george@iiflcap.com>
Return-Path:  <...@delivery.iiflcap.com>
Content-Type: text/html   (no attachments)
```

What the profile does:
- Converts the HTML body to plain text via `server/src/eml/html.ts`
  (strips `<style>`/`<script>` blocks, decodes entities, preserves
  block-level newlines).
- Clips at the first disclaimer marker (`Disclaimer`, `This
  communication is confidential`, etc.) so boilerplate doesn't leak
  into evidence.
- Emits one `ReportCandidate` from the body.
- Rating/target/ticker inference runs against the clipped body.

## Broker identity extraction

The allowlist (`server/src/config/allowlist.ts`) derives admissible
sender-domain → broker-id mappings from the global
`Organization.enabledBrokerIds` and each broker's `senderDomains` in
`src/mocks/brokers.ts`. The loader cross-checks that the profile's
chosen broker agrees with the domain-resolved broker from the
allowlist. This prevents a rogue-profile match (e.g. someone spoofing a
Kotak subject from a different domain) from sneaking in.

The IIFL broker's `senderDomains` was extended to include `iiflcap.com`
(the real IIFL institutional-research delivery domain seen on sample
mail), in addition to the previous `iifl.com` / `iiflsecurities.com`.

Broker confidence reasoning is captured on every accepted email via
`ProfileMatch.confidenceReason` — a short string the ops console can
log or surface.

## Conservative extraction rules

These are shared across profiles in
`server/src/ingestion/profiles/common.ts`:

| Field              | Rule                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------- |
| `brokerId`         | domain-resolved via allowlist; profile must agree.                                        |
| `ticker`           | word-boundary match against the global stock catalog (`src/mocks/stocks.ts`).             |
| `rating`           | first match of a synonyms table (`BUY`/`ADD`/`HOLD`/`REDUCE`/`SELL` + peers).             |
| `targetPrice`      | `PT N`, `target N`, `INR N`, `Rs. N`, `₹N` patterns. Accepts commas.                      |
| `priorTargetPrice` | `prior PT N`, `prior target N`, `from N` patterns.                                        |
| `stance`           | derived from the rating (`Buy`/`Overweight` → bullish, `Sell`/`Underweight` → bearish).   |
| `reportType`       | subject-keyword classifier → one of the canonical `ReportType` enum values.               |
| `confidence`       | `0.72` when both rating and target parse, `0.5–0.55` otherwise.                           |

We **never** synthesise a ticker, rating, or target that isn't literally
present in the email body or attachment text. A missing field is
preferable to a hallucinated one.

## What remains heuristic vs deterministic

**Deterministic** (same input always produces same output):
- MIME parsing — RFC 822 header unfolding, multipart splitting,
  quoted-printable / base64 decoding, RFC 2047 encoded-word headers.
- Profile selection — first-match on sender + subject rules.
- ID generation — SHA-256 of `messageId` (+ slot suffix for digest
  entries). Re-ingesting the same `.eml` produces byte-identical IDs
  — see the idempotency assertion in `server:test`.
- All record shapes.

**Heuristic**, documented in-source:
- Section splitting on JMFL Morning Brief (pipe-delimited detail
  headers). Conservative — may emit the same company twice when the
  body includes both an index reference and a detail block. Dedup is
  by lowercased company name.
- Disclaimer clipping on IIFL bodies — a fixed list of marker strings.
- Weak PDF text extraction — the current implementation is just a
  printable-ASCII filter (`server/src/ingestion/extractText.ts`).
  Evidence from text-based PDFs comes through partially; scanned /
  image-based PDFs return empty text (no OCR), and the attachment's
  `parseStatus` records the weak-extraction miss.

## Running the pipeline

```bash
# Run ingestion only (JSON + .eml), print the summary, exit:
npm run server:ingest

# Golden-sample regression (assertions + idempotency):
npm run server:test

# Start the /v1 API serving ingested records on http://localhost:4000:
npm run server:dev

# Point the frontend at the local backend (Vimana tenant by default):
npm run dev:http
```

## Adding a new broker sender

1. Extend the broker's `senderDomains` in `src/mocks/brokers.ts`.
2. Add that broker id to the target org's `enabledBrokerIds` in
   `src/mocks/organizations.ts`.
3. Restart `npm run server:dev` — the allowlist is derived from the
   enabled-broker catalogue, so no `allowlist.ts` edit is needed for
   domain-based admission.

## Adding a new parser profile

1. Create `server/src/ingestion/profiles/<newProfile>.ts` implementing
   the `Profile` interface (see `server/src/ingestion/profiles/types.ts`).
2. Register it in `server/src/ingestion/profiles/index.ts` —
   remember to put more-specific matchers ahead of broader ones.
3. Drop at least one representative `.eml` into
   `server/fixtures/eml/`, then add its assertion to
   `server/src/__tests__/ingestEml.ts`.
4. Run `npm run server:test`; the runner will report pass/fail for the
   new fixture alongside the existing ones.

## Future replacements (not this step)

- **Real PDF text extraction** — swap `PlainTextAndWeakPdfExtractor`
  for a `pdf-parse` / `pdfjs-dist`-backed implementation. The
  `DocumentTextExtractor` interface boundary already exists;
  everything downstream stays unchanged.
- **Real mail intake** — replace the filesystem loader in
  `server/src/ingestion/pipeline.ts` with an IMAP / Gmail Push /
  Postfix drop-folder watcher. The parser profiles and admission gate
  don't change.
- **Real auth** — replace the fixed `FIXED_SESSION_SCOPE` in
  `server/src/api/routes.ts` with a token → scope decoder driven by
  the `Authorization: Bearer` header.
