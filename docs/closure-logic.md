# Conflict-closure logic

This document is the source of truth for the deterministic analysis layer that
produces **ConflictClosure** (per stock) and **SectorIntelligence** (per sector).
Every rule below maps directly to code in `src/engine/` — no hidden heuristics,
no model calls, no randomness.

Pure functions, same inputs → same outputs, every time.

## Pipeline

```
adapter
  │
  ▼
BrokerStockOpinion[] + ReportSummary[] + EvidenceSnippet[] + Broker[]
  │
  ▼   src/engine/conflictClosure.ts
ConflictClosure { stanceDist, ratingDist, targetStats, consensus[],
                  disagreements[], outliers[], resultant, confidence }
  │
  ▼   src/engine/sectorIntelligence.ts
SectorIntelligence { signals[], resultantStates[], aggregateStance, ... }
  │
  ▼
view-model layer → presentational components
```

## 1. Dimensions

Every signal is classified into one of nine canonical axes
(`src/engine/types.ts::DisagreementDimension`):

| Dimension               | Source                                                   |
| ----------------------- | -------------------------------------------------------- |
| `stance`                | `BrokerStockOpinion.stance`                              |
| `rating`                | `BrokerStockOpinion.rating`                              |
| `target_price`          | `BrokerStockOpinion.targetPrice` (numeric aggregation)   |
| `growth`                | theme keywords (see `src/engine/classifiers.ts`)         |
| `margin`                | theme keywords                                           |
| `demand_or_pricing`     | theme keywords                                           |
| `order_book`            | theme keywords                                           |
| `timing_or_catalyst`    | theme keywords                                           |
| `management_execution`  | theme keywords                                           |

Theme → dimension uses the first-match keyword rules in
`THEME_DIMENSION_RULES`. The rule list is ordered specific-before-generic so
`"order book"` resolves to `order_book` before `growth` could match `"order"`.

For each broker's summary we emit one signal per matched theme (with the
summary's stance as polarity), plus an implicit stance + rating signal.

## 2. Consensus rules

A dimension's signals collapse into a `ConsensusPoint` when:

- at least one signal exists AND
- every non-neutral signal in the dimension has the same polarity.

The ConsensusPoint records the polarity, the brokers that contributed, the
raw theme strings they used, and the evidence-snippet ids backing those
themes.

**Target-price special case (numeric):**
- `spreadPct < 15%` → consensus on valuation (tight spread).
- `spreadPct` is `(high − low) / low × 100`.

## 3. Disagreement rules

A dimension produces a `DisagreementPoint` when:

- at least one signal is `bullish` AND at least one signal is `bearish`
  (neutrals alone never create disagreement).

DisagreementPoint carries separate bull / bear claim arrays, broker-id
arrays, and evidence-id arrays.

**Target-price special case (numeric):**
- `spreadPct >= 25%` → material divergence on valuation.
  The bull list uses opinions whose stance is `bullish`; the bear list uses
  opinions whose stance is `bearish`.

## 4. Outlier detection

A broker is flagged as an outlier when one or more of these fires:

### `target_price_z`
- Requires ≥ 3 brokers AND `targetStats.stdev > 0` AND broker has
  `targetPrice`.
- Fires if `|target − mean| / stdev > 1.25`.

### `stance_contrary`
- Majority stance must cover ≥ 66% of opinions (`STANCE_MAJORITY_PCT`).
- Fires if broker's stance disagrees with the majority AND broker's stance
  is not `neutral`.

### `rating_contrary`
- "Positive bucket" = { Buy, Overweight }; "negative bucket" = { Sell,
  Underweight }.
- If ≥ 66% of brokers fall in one bucket AND this broker's rating is in
  the opposing bucket → fires.

### Direction
- If broker's stance is `bullish`/`bearish`, direction = that.
- Otherwise (neutral with z-outlier), direction is inferred from the sign
  of the z-score.

### Multiple reasons
An outlier may match multiple rules; `primaryReason` is the first that
fired (ordered: z-score, stance, rating). `notes` concatenates the
deterministic explanation for each fired rule.

## 5. Resultant state

The state (`src/engine/types.ts::ResultantState`) is chosen in this order:

1. `consensus_bullish` if `bullish / total >= 0.75` OR
   (`bullish >= 2` AND `bearish == 0`).
2. `consensus_bearish` if the mirror of (1).
3. `outlier_driven` if outliers exist AND removing them leaves a ≥ 2-broker
   subset whose non-neutral stances are all one polarity.
4. `mixed_constructive` if `bullish > bearish`.
5. `mixed_cautious` if `bearish > bullish`.
6. `unresolved` otherwise.

## 6. Strength band

```
strong:    brokerCount >= 3 AND dominant-stance rate >= 75%
moderate:  brokerCount >= 2 AND dominant-stance rate >= 60%
weak:      otherwise
```

## 7. Confidence score

```
stanceSkew        = max(bullish, neutral, bearish) / brokerCount
brokerCountFactor = min(brokerCount / 5, 1)
spreadFactor      = spreadPct == null ? 0.5 : clamp(1 − spreadPct / 60, 0, 1)

score = 0.4 × stanceSkew + 0.3 × brokerCountFactor + 0.3 × spreadFactor
band  = score >= 0.70 ? strong : score >= 0.40 ? moderate : weak
```

Every factor is surfaced in `ConfidenceDetail.rationale` so the score is
auditable at the UI level.

## 8. Narrative

`ResultantLogic.narrative` is a templated string chosen by `state`. No
free-form generation. Examples:

| State                 | Template (schematic)                                                  |
| --------------------- | --------------------------------------------------------------------- |
| `consensus_bullish`   | "Consensus Buy across N covering brokers (median X; Y% spread)."      |
| `consensus_bearish`   | "Consensus caution across N covering brokers (median X; Y% spread)."  |
| `mixed_constructive`  | "Mixed with constructive tilt: B bull vs E bear (N neutral); Y% spread." |
| `mixed_cautious`      | "Mixed with cautious tilt: E bear vs B bull (N neutral); Y% spread."  |
| `outlier_driven`      | "Street aligned ex-NAME; NAME bearish vs the rest (Y% spread)."       |
| `unresolved`          | "Unresolved: B bull / N neutral / E bear (Y% spread)."                |

## 9. Key drivers + open questions

- **Key drivers** — the supporting claims from every ConsensusPoint whose
  dimension is not `stance`/`rating` (those are reported elsewhere). Capped
  at 5.
- **Open questions** — each DisagreementPoint (excluding `stance` /
  `rating`) rendered as `"<topic>: <bullClaim>  vs.  <bearClaim>"`. Capped
  at 5.

## 10. Sector signal classification

For each theme key (lower-cased, trimmed) across all reports in the
sector's period, we track tickers it touched, brokers that surfaced it,
and polarities it appeared with, plus mention count + first/last seen.

Classification (`src/engine/sectorIntelligence.ts`, checked in order):

1. `unresolved_debate` — the theme appears with BOTH `bullish` and `bearish`
   polarities in the same sector.
2. `repeated_sector`  — ≥ 2 distinct tickers AND ≥ 2 distinct brokers.
3. `single_name`      — only one ticker carries this theme.
4. `broker_specific`  — multiple tickers but only one broker surfaces it.

Signals are sorted by class priority (unresolved > repeated > broker-specific
> single-name), then by mention count desc, then by `lastSeen` desc.

## 11. Sector aggregate stance

```
stanceScore  = average of { bullish: +1, neutral: 0, bearish: −1 } across every
               summary that contributed to the sector
aggregate    = stanceScore > 0.2 → bullish
               stanceScore < −0.2 → bearish
               otherwise → neutral
```

## 12. Thresholds — central list

All numeric thresholds live in `src/engine/conflictClosure.ts` at the top
of the file (or `sectorIntelligence.ts` for sector-side rules). Tuning the
engine is a single-file edit.

| Name                          | Value |
| ----------------------------- | ----- |
| `OUTLIER_Z_THRESHOLD`         | 1.25  |
| `STANCE_CONSENSUS_PCT`        | 0.75  |
| `STANCE_MAJORITY_PCT`         | 0.66  |
| `RATING_MAJORITY_PCT`         | 0.66  |
| `TARGET_CONSENSUS_SPREAD_PCT` | 15    |
| `TARGET_DISAGREEMENT_PCT`     | 25    |
| `CONFIDENCE_STRONG`           | 0.70  |
| `CONFIDENCE_MODERATE`         | 0.40  |
| Sector aggregate stance cut   | 0.20  |
