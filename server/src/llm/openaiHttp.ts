// Real OpenAI Chat Completions request builder + response parser.
//
// The HTTP boundary is `fetchImpl: typeof fetch` — defaults to the
// global `fetch`, tests inject a deterministic mock. The dashboard
// stays read-only; nothing here POSTs to upstream.

import type { PromptDefinition } from './types'

export interface OpenAiRequestArgs {
  readonly apiKey: string
  readonly baseUrl?: string
  readonly model: string
  readonly prompt: PromptDefinition
  readonly userPrompt: string
  readonly fetchImpl?: typeof fetch
  readonly timeoutMs?: number
}

export interface OpenAiResult {
  readonly raw: unknown
  readonly tokensIn: number | null
  readonly tokensOut: number | null
}

/** Issue a Chat Completions call with `response_format = json_object`
 *  and return the parsed JSON body the model emitted. */
export async function callOpenAi(args: OpenAiRequestArgs): Promise<OpenAiResult> {
  const fetchImpl = args.fetchImpl ?? fetch
  const baseUrl = args.baseUrl ?? 'https://api.openai.com'
  const url = `${baseUrl.replace(/\/+$/, '')}/v1/chat/completions`

  const body = {
    model: args.model,
    temperature: args.prompt.temperature,
    max_tokens: args.prompt.maxTokens,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: args.prompt.systemPrompt },
      { role: 'user',   content: args.userPrompt },
    ],
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), args.timeoutMs ?? 30000)
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${args.apiKey}`,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`OpenAI HTTP ${res.status} ${res.statusText} — ${text.slice(0, 240)}`)
    }
    const json = await res.json() as OpenAiChatCompletionResponse
    const content = json.choices?.[0]?.message?.content ?? ''
    let parsed: unknown
    try { parsed = JSON.parse(content) }
    catch (e) {
      throw new Error(`OpenAI returned non-JSON content: ${(e as Error).message}`)
    }
    return {
      raw: parsed,
      tokensIn:  json.usage?.prompt_tokens     ?? null,
      tokensOut: json.usage?.completion_tokens ?? null,
    }
  } finally {
    clearTimeout(timer)
  }
}

interface OpenAiChatCompletionResponse {
  readonly choices?: ReadonlyArray<{ readonly message?: { readonly content?: string } }>
  readonly usage?: {
    readonly prompt_tokens?: number
    readonly completion_tokens?: number
  }
}
