# Extraction quality harness · review workflow · operator diagnostics

> The layer that makes the system **measurable and improvable**.
> Module 15 adds a server-side evaluation harness, per-field scoring,
> upgraded review categorization, replay-with-comparison tooling, and
> operator-facing scorecards. The frontend `/v1` contract is unchanged.

The Daily Worklog, broker-memory, change detection, By Stock and By
Broker change rails, divergence, sector feed, and every consumer
surface render byte-for-byte identically. This module is purely
additive on the server.

## What it gives you

| Question                                          | Answered by                                     |
| ------------------------------------------------- | ----------------------------------------------- |
| How often is deterministic extraction right?      | `npm run ops -- eval` + `field-stats`          |
| Where does LLM enrichment help / hurt?            | `npm run ops -- scorecard --bucket=enrichment` |
| Which artifacts need human review?                | `npm run ops -- list-review` + `top-failures`  |
| What changed after a parser fix?                  | `npm run ops -- diff --before=… --after=…`     |
| How do I know a parser improvement is real?       | snapshot before, replay, snapshot after, diff   |
| Where is each broker's extraction breaking?       | `scorecard --bucket=broker`                     |
| Which source type is least reliable?              | `scorecard --bucket=source`                     |

## Where the code lives

| File                                                      | Purpose                                       |
| --------------------------------------------------------- | --------------------------------------------- |
| `server/src/eval/types.ts`                                | `GoldFixture`, `ExpectedOutputs`, `EvalResult`|
| `server/src/eval/compare.ts`                              | pure compare function                         |
| `server/src/eval/scorecard.ts`                            | aggregations by broker / profile / source / report-type / enrichment |
| `server/src/eval/runner.ts`                               | runs every gold fixture through the live pipeline |
| `server/src/eval/diff.ts`                                 | replay-with-comparison snapshot diff          |
| `server/src/eval/fixtures/gold/*.json`                    | gold fixtures (raw artifact + expected output) |
| `server/src/pipeline/quality.ts`                          | `MaterializationQuality` + scoring rules      |

## Gold fixtures

Each fixture pairs a `RawEmailArtifact` with the canonical outputs you
expect a clean pipeline run to produce. Fields are:

```jsonc
{
  "name": "kotak-tcs-direct-pdf",
  "profile": "kotak_pdf",                    // parser-profile id (for grouping)
  "sourceType": "attachment",                // body | attachment | linked_webpage | linked_pdf | mixed
  "notes": "Single-ticker earnings review …",
  "raw": { /* full RawEmailArtifact */ },
  "expected": {
    "broker": "brk_kotak",
    "primary": {                              // single-report shorthand
      "ticker": "TCS",
      "rating": "Buy",
      "stance": "bullish",
      "targetPrice": 4200,
      "priorTargetPrice": 4050,
      "reportType": "earnings_review"
    },
    "minReports": 1,
    "minEvidence": 2,
    "linkedArtifactsContributed": false,
    "expectMaterialization": true,
    "expectReviewCategories": []
  }
}
```

Multi-ticker (digest) fixtures use `perTicker: { TICKER: ExpectedReport }`
instead of `primary`. Use `expectReviewCategories: ['CONFLICTING_RATINGS']`
to assert that the pipeline routes a hard case to review.

### Adding a fixture

1. Drop a JSON file into `server/src/eval/fixtures/gold/` with a
   leading `NN-` for ordering (e.g. `09-foo.json`).
2. Run `npm run test:eval` — every fixture is loaded automatically.
3. If a field comparison fails, fix either the parser, the regex, or
   the expectation. The test output names the field, expected, and
   actual values verbatim.

## Field-level scoring

`compareToGold(actual, expected)` produces one `FieldComparison` per
expected field. Outcomes:

| Outcome   | Meaning                                                |
| --------- | ------------------------------------------------------ |
| `match`   | Exact equality (or numeric within 2%)                  |
| `partial` | Numeric within 10% but outside 2%                      |
| `missing` | Expected, but actual is null / absent                  |
| `wrong`   | Both populated, values disagree beyond tolerance       |
| `extra`   | Actual populated, expected didn't ask                  |

`EvalResult.score` is the share of `match + partial` outcomes among
all comparisons. Aggregations group by:

- broker
- parser profile
- source type
- report type
- enrichment mode (`deterministic-only` vs `llm-enabled`)

Each scorecard also reports `deterministicFieldsCount` /
`llmFieldsCount` so you can see, at a glance, which layer is doing
which work.

## Quality metadata

The materializer emits a `MaterializationQuality` per `ResearchReport`.
Persisted via the `Repo` (file by default, SQLite path documented).
The `/v1` API does NOT expose it — internal operator surface only.

```ts
interface MaterializationQuality {
  score: number               // 0..1
  tier: 'high' | 'medium' | 'low'

  deterministicFieldsCovered: { broker, ticker, rating, targetPrice, priorTargetPrice, reportType }
  llmContributed: boolean
  fieldProvenance: { thesis, keyPoints, themes, risks, catalysts }   // 'deterministic' | 'llm' | 'absent'

  sourcesUsed: { body, attachment, linkedWebpage, linkedPdf }
  evidenceCount: number
  evidenceCoverage: number    // (# fields with evidence) / (# populated fields)

  flags: {
    missingTargetForRatedNote: boolean
    thesisShorterThan: number
    noEvidenceForFields: string[]
  }
}
```

The composite `score` is a weighted blend (50% deterministic-coverage,
30% evidence-coverage, 20% source-diversity). `tier`:
- `score ≥ 0.7` → `high`
- `score ≥ 0.4` → `medium`
- else            → `low`

## Review queue upgrades

Three new categories fired post-materialization, each with explicit
severity:

| Category                   | Severity | Fires when                                                  |
| -------------------------- | -------- | ----------------------------------------------------------- |
| `EVIDENCE_MISMATCH`        | medium   | Summary fields populated without backing evidence           |
| `LOW_QUALITY_SUMMARY`      | low      | Tier=`low` + thesis < 30 chars                              |
| `MISSING_TARGET_FOR_RATED` | medium   | Buy/Sell rating extracted but no target price               |

`severityFor(category)` is exported from `server/src/pipeline/errors.ts`
for any consumer that needs it.

`npm run ops -- top-failures` lists categories sorted by frequency
across the durable review queue, with severity tags.

## Replay-with-comparison

When you change a parser, profile, or LLM prompt and want to verify
the change actually improved things:

1. Run a sync (`npm run ops -- sync`) or eval (`npm run ops -- eval`)
   to produce baseline materializations.
2. Snapshot the relevant `MaterializedRunOutputs` to JSON
   (any artifact replay returns this shape).
3. Apply your change. Re-run the same input.
4. Snapshot the new outputs.
5. `npm run ops -- diff --before=before.json --after=after.json`.

The diff reports per-ticker and per-summary changes on the fields
operators care about: `rating`, `targetPrice`, `priorTargetPrice`,
`reportType`, `summary.thesisLength`, `summary.themesCount`,
`summary.risksCount`, plus added/removed review categories.

`SnapshotDiff.summary` rolls up the totals: `changed`, `added`,
`removed`, `unchanged`.

## Operator daily / weekly workflow

```bash
# 1. After a sync, see how the gold fixtures fared.
npm run ops -- eval

# 2. If anything regressed, find the per-field hot spots.
npm run ops -- field-stats

# 3. Drill into the broker / profile / source that failed.
npm run ops -- scorecard --bucket=broker
npm run ops -- scorecard --bucket=source

# 4. See what landed in the review queue overnight.
npm run ops -- top-failures
npm run ops -- list-review

# 5. After fixing a parser, replay everything that was failing and diff.
npm run ops -- replay-failed
npm run ops -- diff --before=before.json --after=after.json
```

## What's deterministic vs LLM

Deterministic-first is non-negotiable:

- Broker, ticker(s), rating, target price, prior target price, report
  type, dates — **always** from deterministic extraction.
- The LLM may *suggest* but never *replace* these fields.
- `MaterializationQuality.fieldProvenance` records, per summary field,
  whether the deterministic layer or the LLM filled it.
- A scorecard aggregated over many runs tells you: are we using
  deterministic for ≥ 90% of the high-confidence fields? If LLM
  contribution dominates the deterministic fields, something is off.

When LLM is unavailable:

- `enrichmentDisabledCount` / `enrichmentFailedCount` are tracked in
  the per-org `SyncCheckpoint`.
- Materialization still produces complete records.
- Eval scores the deterministic-only path; you'll see the score on
  the `deterministic-only` enrichment-mode bucket.

## What metrics matter most

In rough priority order:

1. **Required-field success rate** — `field-stats` for `ticker`,
   `rating`, `targetPrice` should be ≥ 95% on the gold set.
2. **Review queue volume by severity** — high-severity items per day
   should be a small number; growing trend = parser / profile issue.
3. **Per-broker score** — if one broker's score drops, their email
   format changed.
4. **Source-type score** — a low score on `linked_pdf` flags a
   weakness in the linked-artifact extractor.
5. **Enrichment-mode delta** — `(llm-enabled.score) − (deterministic-only.score)`
   tells you whether the LLM is actually adding value.

## Verifying

```bash
npm run typecheck       # frontend + server
npm run test:contract   # /v1 mappers           (33/33)
npm run test:bridge     # raw-upstream bridge   (21/21)
npm run test:pipeline   # server pipeline       (10/10)
npm run test:sync       # live sync             (7/7)
npm run test:eval       # gold-set + scorecards (9/9)
npm run build           # frontend bundle (unchanged)
```

All six must stay green for any change touching this module.
