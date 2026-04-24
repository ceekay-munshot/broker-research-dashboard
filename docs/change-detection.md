# Change detection / broker memory

> "What changed vs the previous note from the same broker on the same stock?"

Every research note the dashboard ingests gets compared to the
broker's previous comparable note on the same ticker. The comparison is
**deterministic** — set operations on the canonical `themes[]` /
`risks[]` arrays, numeric deltas on target price, and explicit equality
checks on rating / stance. No LLM, no fuzzy semantic matching.

## Where it lives

| Layer       | Path                                                                 |
| ----------- | -------------------------------------------------------------------- |
| Types       | [`src/viewModels/brokerMemory/types.ts`](../src/viewModels/brokerMemory/types.ts)         |
| Linker      | [`src/viewModels/brokerMemory/linker.ts`](../src/viewModels/brokerMemory/linker.ts)       |
| Comparator  | [`src/viewModels/brokerMemory/comparator.ts`](../src/viewModels/brokerMemory/comparator.ts) |
| Significance| [`src/viewModels/brokerMemory/significance.ts`](../src/viewModels/brokerMemory/significance.ts) |
| Builder     | [`src/viewModels/brokerMemory/builder.ts`](../src/viewModels/brokerMemory/builder.ts)     |
| Barrel      | [`src/viewModels/brokerMemory/index.ts`](../src/viewModels/brokerMemory/index.ts)         |

Consumers:
- **Daily Worklog** cards get a significance pill; the detail panel gets
  a dedicated **Change** tab that is auto-selected when the bucket is
  `major` or `moderate`.
- **By Stock** renders a "Latest broker changes" rail per ticker.
- **By Broker** renders a "What changed recently" panel per broker.

All surfaces are purely presentational — they pull from
`buildBrokerMemoryViewModel(...)`.

## Prior-note linking

Rule (deterministic, per `(brokerId, ticker)` bucket):

1. Walk all reports for the broker that cover this ticker, sorted by
   `publishedAt` ascending.
2. For report N, the prior comparable is report N−1 in the sorted list.
3. Report 0 has no prior — comparability is `first_coverage`.

A multi-ticker morning note (`tickers: [MARUTI, LT]`) participates in
**two** buckets: `(broker, MARUTI)` and `(broker, LT)`. The linker walks
them independently so MARUTI's prior is the most recent MARUTI note,
not the most recent morning brief.

### Comparability

Every link declares its confidence:

| Value            | When it fires                                                          |
| ---------------- | ---------------------------------------------------------------------- |
| `high`           | Both reports are single-ticker, same report-type family                |
| `medium`         | Both cover the ticker, but one side is a multi-ticker digest           |
| `low`            | Digest vs direct + different report-type families                      |
| `first_coverage` | No prior report from this broker on this ticker                        |

Type families:

| Family | Report types                                    |
| ------ | ----------------------------------------------- |
| core   | `initiation`, `update`, `deep_dive`             |
| event  | `flash`, `earnings_review`, `earnings_preview`  |
| digest | `morning_note`, `sector_note`                   |
| other  | `other`                                         |

A low-comparability pair incurs a `-5` significance penalty so a
digest-vs-direct flip doesn't masquerade as a view change.

## What the comparator produces

For each linked pair, a `ReportChangeSet`:

- **Metadata**: report types before/after, days since prior, comparability.
- **Rating**: `ratingBefore`, `ratingAfter`, `ratingChanged`.
- **Stance**: `stanceBefore`, `stanceAfter`, `stanceChanged`.
- **Target price**: `targetBefore`, `targetAfter`, `targetChangeAbs`,
  `targetChangePct`. Fallback: when no prior summary exists, use the
  current summary's self-reported `priorTargetPrice`.
- **Thematic delta** (set-based, lowercase-normalized):
  - `themesAdded` — new themes in current not in prior
  - `themesDropped` — themes in prior not in current
  - `themesRetained` — intersection (repeated thesis)
  - `risksAdded` / `risksDropped` / `risksRetained` — same, for risks
- **Structural richness**: key-points count before/after, evidence
  count before/after.
- **Thematic availability**: `available` / `partial` / `unavailable`.
  `unavailable` when there's no prior at all (`first_coverage`) or no
  summary on either side.
- **Significance**: bucket, score, rule-level reasons.
- **Headline**: one-liner like *"Target cut 12.5% · Rating Hold → Sell ·
  2 new risks"* — mechanically composed from the deltas above.

## Significance scoring

Rule-based, points-based, every rule contributes a reason:

| Rule                | Points      | Fires when                                        |
| ------------------- | ----------- | ------------------------------------------------- |
| `rating_changed`    | +40         | Rating differs                                    |
| `stance_changed`    | +25         | Stance differs                                    |
| `tp_major`          | +35         | Target moved ≥ 15% (absolute)                     |
| `tp_moderate`       | +15         | 5% ≤ Target Δ < 15%                               |
| `tp_minor`          | +5          | 0 < Target Δ < 5%                                 |
| `risks_added_many`  | +15         | ≥2 new risks                                      |
| `risks_added_one`   | +8          | 1 new risk                                        |
| `risks_dropped_many`| +10         | ≥2 risks resolved                                 |
| `risks_dropped_one` | +5          | 1 risk resolved                                   |
| `themes_churn`      | +10         | ≥3 combined theme add+drop                        |
| `themes_delta`      | +4          | ≥1 theme add or drop (but <3)                     |
| `evidence_up`       | +4          | +3 or more evidence snippets                      |
| `low_comparability` | -5          | Comparability is `low`                            |

Buckets:

- `score ≥ 50` → **major**
- `score ≥ 20` → **moderate**
- else → **minor** (includes fully unchanged)
- Separately: `first_coverage` is its own bucket (no prior exists)

## Thesis-delta, conservatively

The comparator does **not** attempt to classify themes as "positive" or
"negative" on its own. The UI uses the existing canonical split:

- `themes[]` = things the broker's thesis rests on (mixed polarity;
  polarity is implied by stance)
- `risks[]` = explicit downside items

New themes + current stance `bullish` ⇒ surfaced as **new positive
points** in the UI. New risks are surfaced as **new negative points** /
**emerging risks**. Dropped risks become **resolved concerns**.
Retained themes become **repeated thesis**. Retained risks become
**carry-forward concerns**.

When summaries are absent on either side, the UI labels the thesis
delta *unavailable* and falls back to metadata-only deltas (type /
rating / target). We never invent thematic moves we can't ground.

## Degraded-data behavior

| Missing                        | What still works                           | What degrades                     |
| ------------------------------ | ------------------------------------------ | --------------------------------- |
| Summaries on both sides        | Metadata comparison (type, recency)        | All thematic + rating + target    |
| Evidence                       | Everything except `evidence_up` rule        | Evidence-delta signal unavailable |
| Prior note absent              | `first_coverage` bucket + initiation label | No delta computed                 |
| ConflictClosure (for divergence signalling used elsewhere) | Change detection unaffected | Stock-level "has divergence" falls back to opinion heuristic |

Degradation notes surface in `BrokerMemoryViewModel.degradations` and
are shown inline on the Worklog + Stock + Broker surfaces.

## Data flow summary

```
listResearchReports → linker (bucket by brokerId × ticker, sort, pair
                      each with its predecessor)
                    ↓
                    comparator (per linked pair + summaries + evidence
                                counts) → ReportChangeSet
                    ↓
                    builder (roll up into stockSummaries +
                             brokerSummaries + changeByKey)
                    ↓
            ┌───────┴─────────────┐
            ↓                     ↓
  Daily Worklog         By Stock + By Broker
 (card pill + Change     (recent-change rails)
  tab)
```

Nothing is persisted. Every re-render of the worklog rebuilds the
change-sets from fresh adapter data. This makes the comparison trivially
consistent across adapter modes (`upstream`, `local`, `mock`,
`mock-http`, `upstream-fixture`).
