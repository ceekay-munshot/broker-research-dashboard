// Real Anthropic Messages request builder + response parser.

import type { PromptDefinition } from './types'

export interface AnthropicRequestArgs {
  readonly apiKey: string
  readonly baseUrl?: string
  readonly model: string
  readonly prompt: PromptDefinition
  readonly userPrompt: string
  readonly fetchImpl?: typeof fetch
  readonly timeoutMs?: number
  readonly anthropicVersion?: string
}

export interface AnthropicResult {
  readonly raw: unknown
  readonly tokensIn: number | null
  readonly tokensOut: number | null
}

/** Issue a Messages call. Claude has no strict JSON mode the way OpenAI
 *  does, so the system prompt instructs JSON-only output and we parse
 *  the first balanced JSON object out of the response. Schema
 *  validation downstream catches anything malformed. */
export async function callAnthropic(args: AnthropicRequestArgs): Promise<AnthropicResult> {
  const fetchImpl = args.fetchImpl ?? fetch
  const baseUrl = args.baseUrl ?? 'https://api.anthropic.com'
  const url = `${baseUrl.replace(/\/+$/, '')}/v1/messages`

  const body = {
    model: args.model,
    max_tokens: args.prompt.maxTokens,
    temperature: args.prompt.temperature,
    system: args.prompt.systemPrompt + '\n\nReturn ONLY a single JSON object. No code fences, no commentary.',
    messages: [{ role: 'user', content: args.userPrompt }],
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), args.timeoutMs ?? 30000)
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': args.apiKey,
        'anthropic-version': args.anthropicVersion ?? '2023-06-01',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Anthropic HTTP ${res.status} ${res.statusText} — ${text.slice(0, 240)}`)
    }
    const json = await res.json() as AnthropicMessagesResponse
    const text = (json.content ?? []).map((b) => b.text ?? '').join('')
    const parsed = parseFirstJsonObject(text)
    if (!parsed) throw new Error('Anthropic response did not contain a JSON object.')
    return {
      raw: parsed,
      tokensIn:  json.usage?.input_tokens  ?? null,
      tokensOut: json.usage?.output_tokens ?? null,
    }
  } finally {
    clearTimeout(timer)
  }
}

/** Find the first balanced `{...}` JSON object in `text` and parse it.
 *  Tolerant of leading prose / code fences. */
export function parseFirstJsonObject(text: string): unknown | null {
  let depth = 0
  let start = -1
  let inString = false
  let escape = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (escape) { escape = false; continue }
    if (ch === '\\') { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') {
      if (depth === 0) start = i
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0 && start >= 0) {
        const slice = text.slice(start, i + 1)
        try { return JSON.parse(slice) } catch { return null }
      }
    }
  }
  return null
}

interface AnthropicMessagesResponse {
  readonly content?: ReadonlyArray<{ readonly type?: string; readonly text?: string }>
  readonly usage?: {
    readonly input_tokens?: number
    readonly output_tokens?: number
  }
}
