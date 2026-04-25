# Review adjudication · correction memory · replay learning loop

> Module 16. Server-side, deterministic, auditable corrections that
> turn one-off review findings into durable rules. The frontend `/v1`
> contract, Daily Worklog, broker-memory, change detection, By Stock /
> By Broker change rails, and every consumer surface render
> byte-for-byte unchanged.

## What it gives you

| Question                                              | Answered by                                  |
| ----------------------------------------------------- | -------------------------------------------- |
| The pipeline got broker / ticker / rating / target wrong on artifact X. Fix it. | `npm run ops -- correct --type=… --value=… --artifact=X` |
| Every email from broker Y mis-extracts target. Fix it for all future runs. | `npm run ops -- correct-rule --type=target --value=… --broker=Y` |
| Replay artifact X with corrections applied.          | `npm run ops -- replay-with-corrections --artifact=X` |
| Did the correction actually improve the materialized output? | `npm run ops -- diff --before=before.json --after=after.json` |
| Which corrections are pulling weight in production?  | `npm run ops -- correction-impact`           |
| This case is a great gold fixture. Promote it.       | `npm run ops -- promote-to-gold --artifact=X --out=N-name.json` |

## Where the code lives

| File                                                   | Purpose                                      |
| ------------------------------------------------------ | -------------------------------------------- |
| `server/src/corrections/types.ts`                      | `CorrectionRule`, `CorrectionPayload`, `CorrectionScope`, `CorrectionAuditEntry`, `CorrectionApplication`, `CorrectionRuleSet` + `indexRules()` |
| `server/src/corrections/matcher.ts`                    | pure `matchesScope` + `findApplicableRules` + `conflictSignature` |
| `server/src/corrections/apply.ts`                      | pure `applyArtifactCorrections`, `applyCandidateCorrections` |
| `server/src/corrections/promote.ts`                    | `promoteToGoldFixture` — read a persisted artifact + materialization, emit a gold-fixture draft |
| `server/src/corrections/__tests__/corrections.ts`      | 15 end-to-end assertions                     |
| `server/src/persistence/types.ts`                      | `Repo` extended with `upsertCorrectionRule`, `appendCorrectionAudit`, `bumpCorrectionImpact` |

## The correction model

A `CorrectionRule` is durable, plain data, and auditable end-to-end:

```ts
interface CorrectionRule {
  id, orgId, isReusable
  scope: CorrectionScope            // one-off or reusable predicate
  payload: CorrectionPayload        // discriminated union
  createdAt, createdBy, note
  enabled, supersededBy?
  applicationCount, reviewItemsResolved, aggregateQualityDelta
  audit: CorrectionAuditEntry[]
}
```

Payloads are typed and explicit:

| Kind                          | Effect                                               |
| ----------------------------- | ---------------------------------------------------- |
| `broker_override`             | Force the resolved brokerId on the candidate         |
| `ticker_override`             | Force the candidate's ticker                         |
| `rating_override`             | Force the rating + recompute stance                  |
| `target_price_override`       | Force the target price                               |
| `prior_target_override`       | Force the prior target                               |
| `report_type_override`        | Force the canonical reportType                       |
| `digest_split_override`       | Force per-ticker digest sections                     |
| `source_precedence`           | Pick body / attachment / linked as authoritative     |
| `linked_artifact_inclusion`   | `include_only` / `exclude` specific URLs             |
| `evidence_acceptance`         | `accept` / `reject` specific evidenceIds             |
| `summary_field_action`        | `suppress` / `approve` summary fields                |

Scope is one-off (`artifactId` / `messageId` / `reportId`) **or** reusable
(any AND-combination of `brokerId`, `senderEmailDomain`, `subjectRegex`,
`parserProfile`, `reportType`, `sourceType`, `linkedDomain`,
`extractionConflictSignature`). Empty scope never matches — operators
must be explicit about what a rule targets.

## Where in the pipeline corrections apply

```
extract email envelope
       ↓
extract attachment text
       ↓
extract linked artifact text
       ↓
applyArtifactCorrections      ← Module 16
       ↓                         (linked include/exclude)
build deterministic candidates
       ↓
applyCandidateCorrections     ← Module 16
       ↓                         (broker / ticker / rating / target /
       ↓                          prior / report-type)
LLM enrichment (sees corrected facts)
       ↓
materialize → canonical /v1 entities
       ↓                         (quality.correctedFields = [field, ...])
persist via HybridCanonicalStore
```

Two key invariants:

1. **Deterministic stays first.** Corrections never replace deterministic
   rules — they apply *after* the rules ran. This means a rule fix in
   the deterministic layer always wins over a stale correction that
   targeted the same case.
2. **LLM sees corrected facts.** Because corrections apply between
   extraction and enrichment, the LLM thesis / themes / risks reflect
   the operator-corrected ticker / rating / target. Materialized
   summaries stay coherent.

## One-off vs reusable

**One-off** corrections (`scope.artifactId` set):

- Fastest path to resolving a single review item.
- Won't help future emails.
- Don't accumulate maintenance cost.
- Default for "I'll fix this single misextraction now and move on."

**Reusable** rules (`scope.brokerId` / `parserProfile` / `subjectRegex`,
etc.):

- Fix the underlying pattern once.
- Apply to every future matching artifact.
- Earn `applicationCount` over time → high-impact rules surface in
  `correction-impact`.
- Default for "every email from sender Y has this same problem."

When in doubt: write a one-off first. If the same correction fires
across three or more artifacts in a week, promote it to a reusable
rule via `correct-rule` with the same payload but a broader scope.

## Provenance + quality

Every materialized `ResearchReport` ships with a `MaterializationQuality`
record (Module 15) that operators read via the CLI. Module 16 adds:

```ts
interface MaterializationQuality {
  ...
  correctedFields: string[]    // e.g. ['rating', 'targetPrice']
}
```

When the corrections layer overrides a field, the operator can see
which fields came from the deterministic layer, which from the LLM,
and which from a correction — three independent signals on the same
record.

## Replay loop

```bash
# 1. See what's in review.
npm run ops -- list-review

# 2. Snapshot the baseline materialization (any structured JSON dump
#    that compares as MaterializedRunOutputs).
npm run ops -- replay --id=raw_xxx          # baseline run
# capture the materialized outputs to before.json

# 3. Write the correction.
npm run ops -- correct --type=rating --value=Buy --artifact=raw_xxx --note="explicit Buy on PT raise"

# 4. Replay with corrections.
npm run ops -- replay-with-corrections --artifact=raw_xxx
# capture the corrected materialized outputs to after.json

# 5. Compare.
npm run ops -- diff --before=before.json --after=after.json
# Output:
#   ~  MARUTI.rating          "Hold" → "Buy"
#   ~  MARUTI.summary.thesisLength  82 → 82

# 6. If the result is sound, the rule stays. Mark the review item:
npm run ops -- clear-review --id=rev_xxx --note="resolved by cor_abc"
```

For reusable rules that should fire on existing artifacts, pair with:

```bash
npm run ops -- replay-failed                  # re-runs every failed/review
                                              # artifact through the pipeline,
                                              # corrections included.
```

## Impact measurement

Every time a rule fires during a pipeline run, the runner calls
`onCorrectionApplied` which bumps `applicationCount`. Operators read
the table:

```bash
npm run ops -- correction-impact
# top corrections by impact:
#   cor_abc123  app=42  resolved=12  Δquality=+3.20  rating_override
#   cor_def456  app=18  resolved=8   Δquality=+1.40  target_price_override
```

The most-frequent rules tell you where to invest in deterministic
parser improvements: a rule with `app=200` is probably masking a
pattern the deterministic layer should learn directly.

## Promote-to-gold

A reviewed-and-corrected production case is the highest-quality gold
fixture you can author. The CLI builds a draft skeleton from the
persisted raw artifact + the (corrected) materialization:

```bash
npm run ops -- promote-to-gold --artifact=raw_xxx \
  --name="iifl-maruti-flash-corrected" \
  --out=server/src/eval/fixtures/gold/09-iifl-maruti-flash-corrected.json
```

Open the file, sanity-check the `expected` block, drop it into the
gold directory, and the next `npm run test:eval` regression-tests the
corrected behavior forever.

## When to make a correction vs change code

**Make a correction when:**
- The problem is specific (one broker's quirky phrasing).
- The fix doesn't generalize cleanly (one analyst's email-template).
- You need the fix in production *now* and a code change is days away.
- The data is sensitive and the reviewer is the source of truth.

**Change deterministic code when:**
- The same correction fires across many distinct rules / brokers.
- The fix is a regex tweak that makes the parser objectively better.
- You'd otherwise carry 10+ near-identical reusable corrections.

The two paths compose cleanly: deterministic improvements remove the
need for stale corrections, and `correction-impact` tells you when a
class of corrections has earned its way into the deterministic layer.

## What's deterministic vs LLM-aware

Corrections are entirely deterministic:

- Apply / no-apply is decided by `matchesScope()` — a pure function
  over `MatchContext` and `CorrectionScope`.
- Application order is sorted by `(createdAt, id)` — stable across runs.
- `disabled` and `supersededBy` short-circuit before any apply.
- LLM is consulted only AFTER corrections — never to *make* a
  correction, only to enrich a corrected candidate.

Effect on operator visibility:

- Deterministic-only mode (no LLM): every correction still applies.
- LLM enabled: corrected fields stay corrected; LLM only contributes
  to summary fields, which are tracked separately in
  `quality.fieldProvenance`.

## Audit trail

Every rule carries an immutable `audit: CorrectionAuditEntry[]`:

```ts
{ at, actor, action: 'created'|'enabled'|'disabled'|'superseded'|'note', note?, replacedBy? }
```

Operators read it via `list-corrections`. There is no purge — even
disabled rules retain their audit so an operator six months from now
can answer "why does this name still have an override?".

## Verifying

```bash
npm run typecheck                # frontend + server
npm run test:contract            # /v1 mappers           (33/33)
npm run test:bridge              # raw-upstream bridge   (21/21)
npm run test:pipeline            # server pipeline       (10/10)
npm run test:sync                # live sync             (7/7)
npm run test:eval                # gold-set + scorecards (9/9)
npm run test:corrections         # corrections + replay  (15/15)
npm run build                    # frontend bundle (unchanged)
```

All seven must stay green for any change touching this module.
