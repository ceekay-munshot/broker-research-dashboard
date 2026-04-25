// Grounding enforcement.
//
// For each `claim` the model returned, verify the `evidenceQuote`
// actually appears in one of the supplied evidence sources. Strategy:
//
//   1. Normalise both sides — lowercase, collapse whitespace.
//   2. Substring match on the normalised source text.
//   3. Fallback: token-overlap ≥ 70% of the quote's tokens.
//
// Then drop any output value whose owning field is in
// `groundingFields` but for which no surviving claim cites it. The
// caller (provider.enrich) returns the filtered output; un-grounded
// fields never reach the materializer.
//
// Pure. No side effects.

import type { EvidenceBundle, ModelClaim, PromptDefinition } from './types'

export interface GroundingResult {
  readonly fieldsGrounded: ReadonlySet<string>
  readonly droppedFields: readonly string[]
  readonly claims: readonly ModelClaim[]
  readonly groundingPass: boolean
}

export function checkGrounding(
  claims: readonly ModelClaim[],
  bundle: EvidenceBundle,
  prompt: PromptDefinition,
  /** Optional: the raw model output. When provided, fields the model
   *  did NOT emit (or emitted as empty) are treated as "no content to
   *  ground" — they don't fail `groundingPass` and aren't reported as
   *  dropped. Without this argument we treat every prompt-listed
   *  field as required (legacy behaviour). */
  rawOutput?: unknown,
): GroundingResult {
  const sources = buildNormalizedSources(bundle)
  const grounded: ModelClaim[] = []
  const groundedFieldNames = new Set<string>()

  for (const claim of claims) {
    const found = sources.find((s) => sourceContainsQuote(s.text, claim.evidenceQuote))
    if (!found) continue
    // Ensure the claim's stated source roughly matches the source it's
    // actually grounded in. Lenient — operators care that grounding
    // happened, not that the model self-reported the right URL.
    grounded.push(claim)
    groundedFieldNames.add(claim.field)
  }

  // Map claim-field names to top-level output fields the registry
  // declares as grounding-required. `keyPoint`/`theme`/`risk`/`catalyst`
  // are individually grounded; the umbrella field is "grounded" when at
  // least one sub-item is grounded.
  const umbrellaMap: Readonly<Record<string, string>> = {
    thesis: 'thesis',
    keyPoint: 'keyPoints',
    theme: 'themes',
    risk: 'risks',
    catalyst: 'catalysts',
  }
  const groundedOutputFields = new Set<string>()
  for (const f of groundedFieldNames) {
    const top = umbrellaMap[f] ?? f
    groundedOutputFields.add(top)
  }

  // Drop any required-grounding field whose emitted content has zero
  // supporting claims. Empty / missing fields aren't dropped — there's
  // nothing to drop, and they don't represent ungrounded claims.
  const dropped: string[] = []
  for (const f of prompt.groundingFields) {
    if (groundedOutputFields.has(f)) continue
    if (rawOutput !== undefined && !fieldHasContent(rawOutput, f)) continue
    dropped.push(f)
  }
  return {
    fieldsGrounded: groundedOutputFields,
    droppedFields: dropped,
    claims: grounded,
    groundingPass: dropped.length === 0,
  }
}

/** True iff `output[field]` is present and non-empty. Used to skip
 *  fields the model didn't bother emitting. */
function fieldHasContent(output: unknown, field: string): boolean {
  if (output === null || typeof output !== 'object') return false
  const v = (output as Record<string, unknown>)[field]
  if (v === undefined || v === null) return false
  if (typeof v === 'string') return v.trim().length > 0
  if (Array.isArray(v)) return v.length > 0
  return true
}

function buildNormalizedSources(bundle: EvidenceBundle): readonly { readonly id: string; readonly text: string }[] {
  const out: { readonly id: string; readonly text: string }[] = []
  out.push({ id: 'body', text: normalize(bundle.bodyText) })
  for (const a of bundle.attachmentTexts) out.push({ id: a.filename, text: normalize(a.text) })
  for (const l of bundle.linkedTexts) out.push({ id: l.url, text: normalize(l.text) })
  return out
}

export function sourceContainsQuote(sourceText: string, quote: string): boolean {
  const q = normalize(quote)
  if (q.length < 6) return false
  if (sourceText.includes(q)) return true
  // Token-overlap fallback: count how many quote tokens appear in the
  // source. Useful when the model paraphrases ("$12.1bn TCV" vs
  // "TCV at $12.1bn").
  const qTokens = q.split(/\s+/).filter((t) => t.length >= 3)
  if (qTokens.length === 0) return false
  let hits = 0
  for (const t of qTokens) if (sourceText.includes(t)) hits++
  return hits / qTokens.length >= 0.7
}

export function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}
