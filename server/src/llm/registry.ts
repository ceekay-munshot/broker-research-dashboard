// ─────────────────────────────────────────────────────────────────────────
// Prompt registry.
//
// Every enrichment task has a versioned `PromptDefinition` here. Prompt
// + schema changes bump the version; the version flows into the cache
// key + every `LlmCallRecord`, so prompt experiments are measurable in
// `npm run test:eval` and `npm run ops -- llm-stats`.
//
// Models below are recommendations, not hard requirements. Operators
// override at runtime via `--model=<id>` flags or by injecting a
// different `RealProviderOptions.defaultModel`.
// ─────────────────────────────────────────────────────────────────────────

import type {
  EnrichmentTaskId, PromptDefinition, StructuredOutputSchema,
} from './types'

// ── Output schemas ──────────────────────────────────────────────────────

const SUMMARY_ENRICHMENT_SCHEMA: StructuredOutputSchema = {
  name: 'SummaryEnrichment',
  schema: {
    type: 'object',
    required: ['thesis', 'keyPoints', 'themes', 'risks', 'catalysts', 'claims'],
    additionalProperties: false,
    properties: {
      thesis: { type: 'string', minLength: 10, maxLength: 600 },
      keyPoints: {
        type: 'array',
        minItems: 0,
        maxItems: 6,
        items: { type: 'string', minLength: 5, maxLength: 240 },
      },
      themes: {
        type: 'array',
        minItems: 0,
        maxItems: 8,
        items: { type: 'string', minLength: 2, maxLength: 60 },
      },
      risks: {
        type: 'array',
        minItems: 0,
        maxItems: 6,
        items: { type: 'string', minLength: 4, maxLength: 240 },
      },
      catalysts: {
        type: 'array',
        minItems: 0,
        maxItems: 6,
        items: {
          type: 'object',
          required: ['label'],
          additionalProperties: false,
          properties: {
            label: { type: 'string', minLength: 3, maxLength: 120 },
            expectedOn: { type: 'string', minLength: 0, maxLength: 32 },
          },
        },
      },
      /** Per-claim evidence pointers used by the grounding checker. */
      claims: {
        type: 'array',
        minItems: 0,
        maxItems: 32,
        items: {
          type: 'object',
          required: ['field', 'text', 'evidenceQuote', 'sourceKind', 'sourceId'],
          additionalProperties: false,
          properties: {
            field: { type: 'string' },           // 'thesis' | 'keyPoint' | 'theme' | 'risk' | 'catalyst'
            text: { type: 'string' },
            evidenceQuote: { type: 'string', minLength: 6 },
            sourceKind: { type: 'string' },      // 'email_body' | 'email_attachment' | 'linked_webpage' | 'linked_pdf'
            sourceId: { type: 'string' },
          },
        },
      },
    },
  },
}

const CHANGE_NARRATIVE_SCHEMA: StructuredOutputSchema = {
  name: 'ChangeNarrative',
  schema: {
    type: 'object',
    required: ['headline', 'narrative', 'claims'],
    additionalProperties: false,
    properties: {
      headline: { type: 'string', minLength: 10, maxLength: 200 },
      narrative: { type: 'string', minLength: 10, maxLength: 800 },
      claims: SUMMARY_ENRICHMENT_SCHEMA.schema as never, // same claim shape
    },
  },
}

const DIGEST_SPLIT_SCHEMA: StructuredOutputSchema = {
  name: 'DigestSplit',
  schema: {
    type: 'object',
    required: ['sections'],
    additionalProperties: false,
    properties: {
      sections: {
        type: 'array',
        minItems: 1,
        maxItems: 16,
        items: {
          type: 'object',
          required: ['ticker', 'startCharOffset', 'endCharOffset'],
          additionalProperties: false,
          properties: {
            ticker: { type: 'string', minLength: 1, maxLength: 16 },
            startCharOffset: { type: 'number' },
            endCharOffset: { type: 'number' },
          },
        },
      },
    },
  },
}

const LINKED_SYNTHESIS_SCHEMA: StructuredOutputSchema = {
  name: 'LinkedSynthesis',
  schema: {
    type: 'object',
    required: ['summary', 'claims'],
    additionalProperties: false,
    properties: {
      summary: { type: 'string', minLength: 20, maxLength: 800 },
      claims: SUMMARY_ENRICHMENT_SCHEMA.schema as never,
    },
  },
}

// ── Prompts ─────────────────────────────────────────────────────────────

const SUMMARY_ENRICHMENT_V1: PromptDefinition = {
  id: 'summary_enrichment',
  version: 'v1.0.0',
  description: 'Compose thesis + key points + themes + risks + catalysts from supplied evidence sources only.',
  systemPrompt:
    'You are a research analyst summarising a single broker note for an institutional buy-side desk. ' +
    'Every claim you make MUST be drawn verbatim or near-verbatim from the supplied evidence sources. ' +
    'Do not invent figures, names, ratings, or targets that are not in the evidence. ' +
    'Output ONLY a single JSON object that matches the requested schema. No prose, no commentary.',
  userPromptTemplate:
    `Broker: {{broker}}
Ticker: {{ticker}}
Subject: {{subject}}

EVIDENCE:
=== EMAIL BODY ===
{{bodyText}}
=== ATTACHMENT TEXTS ===
{{attachmentTexts}}
=== LINKED ARTIFACT TEXTS ===
{{linkedTexts}}

DETERMINISTIC FACTS (do not contradict, do not repeat verbatim):
- rating: {{rating}}
- targetPrice: {{targetPrice}}
- priorTargetPrice: {{priorTargetPrice}}
- reportType: {{reportType}}

Produce JSON of the form:
{
  "thesis": "<one-sentence overall thesis>",
  "keyPoints": ["...","..."],
  "themes": ["...","..."],
  "risks": ["...","..."],
  "catalysts": [{ "label": "...", "expectedOn": "<ISO date or empty string>" }],
  "claims": [
    {
      "field": "thesis|keyPoint|theme|risk|catalyst",
      "text": "<the value of that field as you emitted it>",
      "evidenceQuote": "<verbatim or near-verbatim snippet from one of the evidence sources>",
      "sourceKind": "email_body|email_attachment|linked_webpage|linked_pdf",
      "sourceId": "body|<filename>|<url>"
    }
  ]
}

If you cannot ground a field, omit it. Returning an empty array is correct when nothing is supportable.`,
  outputSchema: SUMMARY_ENRICHMENT_SCHEMA,
  recommended: { provider: 'openai', model: 'gpt-4o-mini' },
  fallback: { provider: 'anthropic', model: 'claude-3-5-haiku-latest' },
  temperature: 0.1,
  maxTokens: 1500,
  groundingFields: ['thesis', 'keyPoints', 'themes', 'risks', 'catalysts'],
}

const CHANGE_NARRATIVE_V1: PromptDefinition = {
  id: 'change_narrative',
  version: 'v1.0.0',
  description: 'Synthesise a one-paragraph "what changed vs prior" narrative grounded in both notes.',
  systemPrompt:
    'You are a research analyst comparing two broker notes from the same broker on the same stock. ' +
    'Describe ONLY changes that are supported by both supplied notes. ' +
    'Do not speculate. Output ONLY a single JSON object matching the schema.',
  userPromptTemplate:
    `Broker: {{broker}}  Ticker: {{ticker}}

CURRENT NOTE EVIDENCE:
{{currentEvidence}}

PRIOR NOTE EVIDENCE:
{{priorEvidence}}

DETERMINISTIC DELTAS (do not contradict):
- rating: {{ratingBefore}} -> {{ratingAfter}}
- targetPrice: {{targetBefore}} -> {{targetAfter}}
- reportType: {{reportTypeBefore}} -> {{reportTypeAfter}}

Output JSON: { headline, narrative, claims }.`,
  outputSchema: CHANGE_NARRATIVE_SCHEMA,
  recommended: { provider: 'anthropic', model: 'claude-3-5-haiku-latest' },
  fallback: { provider: 'openai', model: 'gpt-4o-mini' },
  temperature: 0.1,
  maxTokens: 1000,
  groundingFields: ['narrative'],
}

const DIGEST_SPLIT_ASSIST_V1: PromptDefinition = {
  id: 'digest_split_assist',
  version: 'v1.0.0',
  description: 'Identify per-ticker sections in a digest body when deterministic split is weak.',
  systemPrompt:
    'You are a parser. Given a multi-stock broker digest body, return character offsets that delimit each ' +
    'per-ticker section. Use ONLY the supplied body text. Do not infer tickers that are not in the text.',
  userPromptTemplate:
    `Body text (offsets are 0-indexed UTF-16 code units of this string):
"""
{{bodyText}}
"""

Output JSON: { sections: [{ ticker, startCharOffset, endCharOffset }] }.`,
  outputSchema: DIGEST_SPLIT_SCHEMA,
  recommended: { provider: 'openai', model: 'gpt-4o-mini' },
  fallback: { provider: 'anthropic', model: 'claude-3-5-haiku-latest' },
  temperature: 0,
  maxTokens: 800,
  groundingFields: [],
}

const LINKED_SYNTHESIS_V1: PromptDefinition = {
  id: 'linked_synthesis',
  version: 'v1.0.0',
  description: 'Summarise a heavy linked artifact (long PDF / webpage) when the email body is thin.',
  systemPrompt:
    'You are a research analyst. Summarise the supplied linked artifact for an institutional desk. ' +
    'Every claim must be grounded in the linked artifact text supplied. ' +
    'Output ONLY a JSON object matching the schema.',
  userPromptTemplate:
    `Linked artifact (URL: {{url}}, kind: {{kind}}):
"""
{{linkedText}}
"""

Email body for context:
"""
{{bodyText}}
"""

Output JSON: { summary, claims }.`,
  outputSchema: LINKED_SYNTHESIS_SCHEMA,
  recommended: { provider: 'anthropic', model: 'claude-3-5-haiku-latest' },
  fallback: { provider: 'openai', model: 'gpt-4o-mini' },
  temperature: 0.1,
  maxTokens: 1200,
  groundingFields: ['summary'],
}

// ── Registry ────────────────────────────────────────────────────────────

const ENTRIES: Readonly<Record<EnrichmentTaskId, PromptDefinition>> = {
  summary_enrichment:  SUMMARY_ENRICHMENT_V1,
  change_narrative:    CHANGE_NARRATIVE_V1,
  digest_split_assist: DIGEST_SPLIT_ASSIST_V1,
  linked_synthesis:    LINKED_SYNTHESIS_V1,
}

export const PROMPT_REGISTRY: Readonly<Record<EnrichmentTaskId, PromptDefinition>> = ENTRIES

export function listPrompts(): readonly PromptDefinition[] {
  return Object.values(ENTRIES)
}

export function getPrompt(id: EnrichmentTaskId): PromptDefinition {
  return ENTRIES[id]
}

/** Substitute `{{placeholders}}` in the user-prompt template. Missing
 *  placeholders are replaced with empty string — operators see the gap
 *  in the rendered prompt rather than a runtime error. */
export function renderUserPrompt(template: string, vars: Readonly<Record<string, string | number | null | undefined>>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
    const v = vars[k]
    if (v === undefined || v === null) return ''
    return String(v)
  })
}
