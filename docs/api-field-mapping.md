# `/email/forwarded` → Dashboard field map

**Audience:** whoever splits the single `GET /email/forwarded` response into smaller,
optimized endpoints when this dashboard is folded into the Moonshot product.

**What this documents:** every field/keyword the dashboard reads from the Forward
Email API, exactly how it is used, and which UI component it ends up in. It also
flags fields the API returns that the dashboard does **not** yet consume, and
proposes an endpoint decomposition.

**Source of truth:** the pure transform
[`src/adapters/serverOutput/emailApiTransform.ts`](../src/adapters/serverOutput/emailApiTransform.ts)
(feed → `DashboardServerOutput`), plus the resolver/classifier modules it calls and
the view-models the UI renders. If code and this doc disagree, the code wins —
update this doc.

---

## 1. The pipeline at a glance

```
GET /email/forwarded?page&limit         (paginated; emailApiClient.ts)
        │   raw JSON pages
        ▼
extractForwardedEmails()  →  dedupe by id, sort by received_at desc
        ▼
per email → buildEmailBrokerContext()      (parse sender/subject/body once)
   per upload (1 body + N attachments):
     ├─ resolveBrokerForNote()      → which research house (scored evidence)
     ├─ candidatesFor(ner_results)  → covered stocks + ratings + target prices
     ├─ classifyNoteEntity()        → drop broker-as-entity, keep real stocks
     └─ extractNoteInsight()        → thesis / key numbers / signal (regex only)
        ▼
DashboardServerOutput { organization, brokers, sectors, stocks, kpi,
   emails, attachments, reports, summaries, opinions, conflictClosures,
   feedStatus, ... }                         (the single in-memory envelope)
        ▼
ServerOutputAdapter  (implements the many-method ResearchAdapter interface)
        ▼
useAdapterQuery() hooks → view-models → React components
```

Everything the four customer tabs show is **derived from the email feed**. The API
carries no broker catalog, stock master, or sector taxonomy — the transform
recovers brokers/stocks from the notes and matches them against local reference
data in [`src/reference/`](../src/reference) (`brokerCatalog.ts`, `stockCatalog.ts`,
`sectorCatalog.ts`). Those are matching dictionaries, **not** mock display data.

---

## 2. Response envelope

The loader ([`emailApiClient.ts`](../src/adapters/serverOutput/emailApiClient.ts))
reads page 1, then fetches pages `2…min(totalPages, 25)` in parallel.

| Field | Type | How it is used | Notes |
|---|---|---|---|
| `success` | bool | ignored by the transform | parser is shape-tolerant |
| `message` | string | ignored | |
| `data.total` | number | not used for rendering | useful later for true server pagination |
| `data.page` | number | not used (loader drives paging) | |
| `data.limit` | number | not used | client fixes `limit=100` |
| `data.totalPages` / `total_pages` | number | **drives the parallel page fetch** (`readTotalPages`) | capped at 25 pages |
| `data.emails[]` | array | **the payload** — every other shape (`data[]`, `emails`, `forwarded_emails`, `items`, `results`, bare array) is also accepted (`extractForwardedEmails`) | |

---

## 3. `ForwardedEmail` fields

Per `data.emails[]`. "UI surface" = where the user ultimately sees it.

| Field | How the transform uses it | UI surface |
|---|---|---|
| `id` | `eml_<id>` email id; **dedupe key**; `sourceMessageId` | (internal; drives "What changed today" grouping & dedupe) |
| `received_at` | `receivedAt` on every report/opinion → `publishedAt`; **sort key**; "today" filter; opinion recency (latest call wins); `feedStatus.lastExtractionReceivedAt` | **Overview** "What changed today" timestamps; "Last updated" / feed chip; date-range filter |
| `subject` | `email.subject`; for body notes → report **title** (after `stripBrokerPrefixes`); subject-company identity (`extractSubjectName`); broker subject-prefix evidence (`[IIFL]`, `Kotak:`) | Report title in **Overview / Report drawer / Broker drawer**; broker attribution |
| `text_body` | `bodyPreview` (240 chars); **note-insight** mining (thesis, key numbers, watchpoints, upside %, signal); **target-price** validation (`TP Rs 9,700` beats NER noise); body broker scan | **Report drawer** thesis/key points/key numbers; **Overview** note thesis & chips; target price everywhere |
| `original_sender_email` | `email.senderAddress`; **domain → broker** resolution (`kotak.com` → Kotak); sender-name fallback | broker attribution; "Received via" provenance |
| `original_sender_name` | `senderName` ("Received via"); broker context | provenance line |
| `forwarded_by_email` | `email.forwardedFrom`; sender-name fallback; forwarded-header context (the forwarder is **never** the broker) | provenance; ensures attribution skips the forwarder |
| `uploads[]` | see §4 — the body + attachments become **reports** | Reports, opinions, drawers |

---

## 4. `uploads[]` (`ForwardedEmailUpload`)

One upload becomes at most one **report**. `type === "BODY"` is the email body;
everything else is an attachment.

| Field | How the transform uses it | UI surface |
|---|---|---|
| `id` | `att_<id>` attachment id; `rpt_<id>` report id | (internal) |
| `type` | `isBody = type === 'BODY'` → body vs attachment branching; `reportType` inference (`flash` for bodies) | report-type label in drawers |
| `filename` | report **title** (cleaned); **broker evidence** (research PDFs are named `<House>_<Stock>_…`); attachment **dedupe** key (re-forwarded PDFs collapse) | Report title; broker attribution; dedupe |
| `mime_type` | `attachment.mimeType` | (download metadata) |
| `size_bytes` | `attachment.sizeBytes` | (download metadata) |
| `metadata.ner_results` | **the core extraction** — see §5 | Opinions, ratings, target prices, stocks |
| `document.document_id` | `attachment.storageRef` | (internal) |
| `document.signed_url` | `attachment.sourceUrl` | **Download** action target |

---

## 5. `uploads[].metadata.ner_results` — the extraction core

Shape: `{ "<Company name>": { ticker, rating, tp } }`. This is where almost all of
the dashboard's signal originates.

| NER field | How the transform uses it | UI surface |
|---|---|---|
| *(map key)* company name | candidate **stock display name**; entity-role classification (is this a company or the broker?); subject/title rescue index | Stock names across all tabs |
| `ticker` | candidate **ticker** → `opinion.ticker`, `report.tickers`, the `Stock` list. `"no match"`, `"n/a"`, and a small denylist (`DEFENCE`, `SBISENSEX`) are dropped; stoplist drops non-companies (`RBI`, `SEBI`, `EBITDA`…) | Ticker column / matrix rows / filters everywhere |
| `rating` | `mapRating()` → canonical `Rating` (`BUY→Buy`, `ADD/ACCUMULATE→Overweight`, `HOLD/NEUTRAL→Hold`, `REDUCE→Underweight`, `SELL→Sell`) → `opinion.rating` + `stance` + `summary.rating` | **Formal call** chips; consensus rating; stance counts; disagreement detection |
| `tp` | `parseTp()` strips `₹`/commas; `validateTargetPrices()` prefers explicit "TP Rs X" in the body, rejects values < 100 and NER noise, scopes per-company in multi-stock notes → `opinion.targetPrice` + `summary.targetPrice` | Target price column; avg/median/spread; high/low target outliers |

**Opinion vs identity rule:** a row with a valid ticker is a *covered stock* even
with no rating/TP. A row becomes an *opinion* only if it has a rating **or** a TP. A
note counts as a *digest* (`morning_note`) when ≥ 6 rows carry an opinion.

---

## 6. Fields the API returns but the dashboard does NOT consume yet

Important for endpoint design — don't pay to serve these to *this* client, but they
unlock features (noted) when wired:

| Field | Status | Would enable |
|---|---|---|
| `status` (email) | ignored — every email is treated as `ready` | Inbox/health view; filtering `NOT_CUSTOMER` |
| `metadata.tickers` / `metadata.recommendations` (email-level) | ignored — only per-upload `ner_results` is read | a cheaper opinion path that skips re-deriving from NER |
| `uploads[].status` / `uploads[].error` | ignored | parse-failure surfacing in an ops view |
| `document.stock_ticker` | ignored (ticker comes from NER) | a fallback when NER misses |
| `document.category` / `document.form` / `document.file_type` | ignored | richer report-type than the title-regex `inferReportType()` |
| NER evidence offsets / page numbers | not present in feed | the Report drawer's evidence highlighter (`evidence` is currently `[]`) |
| sector / industry | **not present in feed** | real sector taxonomy (Live currently shows one synthetic `Research Coverage` sector vs the mock's six) |
| prior target price | not present | target **deltas** / upgrade-downgrade arrows (currently `priorTargetPrice: null`) |

---

## 7. Derived dashboard entities → which fields feed them, which UI reads them

The transform emits a `DashboardServerOutput`. Each slice maps to `ResearchAdapter`
methods the UI calls.

| Entity (adapter method) | Built from | Primary UI consumer |
|---|---|---|
| `brokers` (`listBrokers`) | `resolveBrokerForNote()` over filename/domain/subject/body, matched to `brokerCatalog`; unmatched → *Unmapped Research House* / *Other Sources* / *Unknown Broker* | **Brokers** tab cards; Sidebar broker filter; brand colours |
| `stocks` (`listStocks`) | every ticker referenced by an opinion or a report identity; name = longest NER entity name | Sidebar stock filter; Stocks tab rows; drawers |
| `sectors` (`listSectors`) | **synthetic single sector** (feed has none) | Sidebar sector filter (one entry on Live) |
| `opinions` (`listBrokerStockOpinions`) | latest `(broker,ticker)` call from NER rating/TP | **Stocks** matrix cells; consensus & spread |
| `reports` (`listResearchReports`) | one per deduped upload; `title`, `reportType`, `tickers`, `brokerResolution` | **Overview** "what changed"; **Brokers**/**Stock** drawers |
| `summaries` (`getReportSummary`) | `extractNoteInsight()` from `text_body` + NER rating/TP | **Report drawer** thesis/key points/numbers/signal chips |
| `conflictClosures` (`listConflictClosures`) | `buildConflictClosure()` over each multi-broker ticker's opinions+summaries | **Agreements & disagreements** tab; **Overview** "Where brokers disagree"; ARB band |
| `kpi` (`getKpiSnapshot`) | counts: research houses, reports, stocks, bullish∩bearish tickers | **Overview** KPI cards; header "Last updated" (`asOf`) |
| `feedStatus` | `received_at` of newest report; items today | header **feed chip** (live / waiting) |
| `organization` / `currentUser` | constants (`org_preview` / the desk user) | header org chip |
| `evidence`, `catalysts`, `alerts`, `portfolio`, `calibration`, `deliveries` | **empty** (no feed source) | empty states / hidden ops tabs (gated by `VITE_SHOW_OPS_TABS`) |

---

## 8. Field → UI component matrix (quick reference)

| API field | Overview | Stocks | Brokers | Disagreements | Report drawer |
|---|:--:|:--:|:--:|:--:|:--:|
| `received_at` | ✅ time + "today" | ✅ last-updated | ✅ recency | ✅ as-of | ✅ |
| `subject` / `filename` | ✅ title | | ✅ note title | | ✅ title |
| `text_body` | ✅ thesis/chips | | | | ✅ thesis/numbers |
| `original_sender_email` (domain) | ✅ broker | ✅ broker col | ✅ card | ✅ broker | ✅ provenance |
| `ner.ticker` | ✅ | ✅ rows | ✅ note ticker | ✅ | ✅ stocks |
| `ner.rating` | ✅ call | ✅ cells | ✅ stance counts | ✅ consensus | ✅ rating |
| `ner.tp` | ✅ | ✅ targets/spread | ✅ | ✅ targetStats | ✅ target |
| `document.signed_url` | | | | | ✅ download |

---

## 9. Recommended endpoint split (for the Moonshot integration)

The dashboard already speaks a many-resource contract (`ResearchAdapter`). The
single `/email/forwarded` response should be decomposed to match it, so the client
fetches only what each tab needs instead of the whole feed on boot.

**Pass-through / lightly-shaped (cheap, cacheable):**
- `GET /catalog/brokers`, `/catalog/stocks`, `/catalog/sectors` — the reference data
  the dashboard currently holds locally. Serving these makes attribution server-side
  and lets the UI drop `src/reference/`. **Add a real sector** per stock here.
- `GET /reports?page&limit&since` — the deduped report list (id, broker, tickers,
  title, type, received_at). The only endpoint that needs cursoring.
- `GET /reports/:id/summary` — lazy thesis/key-numbers/signal (today derived from
  `text_body`; move the regex extraction server-side and return it structured).
- `GET /reports/:id/evidence` — page/offset-anchored snippets to light up the Report
  drawer highlighter (not derivable from the current feed).

**Pre-computed analytics (move the engine server-side, return ready-to-render):**
- `GET /opinions?since` — latest `(broker,ticker)` calls with `priorTargetPrice` so
  the UI can show target deltas.
- `GET /closures` / `GET /closures/:ticker` — `conflictClosure` output (consensus,
  disagreements, outliers, target stats). Today computed in-browser per ticker.
- `GET /kpi` and `GET /feed-status` — tiny, poll-friendly header payloads.

**Why this shape:** boot cost drops from "download + transform every email" to a few
small catalog + KPI calls; heavy disagreement math runs once server-side and is
shared across users; report bodies and evidence load lazily per drawer. Keep the
current `emailApiTransform.ts` as the **reference implementation** of each endpoint's
logic — every rule above (broker resolution, TP validation, entity-role, closure)
already lives there and is unit-tested.

---

## 10. Appendix — the Mock⇄Live comparison toggle

A header button ([`DataSourceToggle.tsx`](../src/components/DataSourceToggle.tsx))
flips the whole dashboard between the **live feed** and the **curated mock** ("how it
should look"). Use it to drive the live API toward parity: anything the mock shows
that Live doesn't is an API/transform gap (e.g. real sectors, prior target prices,
evidence offsets — see §6). Remove the toggle and the `src/mocks/` fixtures once the
live feed is good enough. Reference data in `src/reference/` stays.
