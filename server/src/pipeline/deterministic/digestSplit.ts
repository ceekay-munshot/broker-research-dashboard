// Digest splitting.
//
// Morning briefs and daily digests cover multiple tickers in a single
// email. The deterministic splitter looks for:
//
//   - Section headings: "TICKER: ..." or "[TICKER] ..." at line start
//   - Section delimiters: a blank line followed by "TICKER (sector)" or
//     just an isolated ticker line
//
// It returns a list of `(ticker, section text)` pairs. When the heuristic
// can't separate sections cleanly (e.g. interleaved text), it returns
// null — the caller surfaces `LOW_CONFIDENCE_DIGEST` for review.

import type { StockTicker } from '../../../../src/domain'
import { detectTickers } from './ticker'
import { asTicker } from '../../../../src/lib/ids'

export interface DigestSection {
  readonly ticker: StockTicker
  readonly text: string
}

export interface DigestSplitResult {
  readonly sections: readonly DigestSection[]
  readonly confident: boolean
}

export function splitDigest(body: string): DigestSplitResult {
  if (!body.trim()) return { sections: [], confident: false }

  // Line-anchored ticker headings, e.g. "TCS: Q4 results" or "[TCS] Q4..."
  const headingRe = /^\s*(?:\[)?([A-Z]{2,15})(?:\])?\s*[-:—]\s*/m
  const lines = body.split(/\r?\n/)
  const sectionStarts: { idx: number; ticker: StockTicker }[] = []
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(/^\s*(?:\[)?([A-Z]{2,15})(?:\])?\s*[-:—]\s*/)
    if (!m) continue
    const candidate = m[1]!
    const detected = detectTickers(candidate)
    if (detected.length === 1 && (detected[0] as unknown as string) === candidate) {
      sectionStarts.push({ idx: i, ticker: detected[0]! })
    }
  }

  if (sectionStarts.length >= 2) {
    const sections: DigestSection[] = []
    for (let s = 0; s < sectionStarts.length; s++) {
      const start = sectionStarts[s]!.idx
      const end = s + 1 < sectionStarts.length ? sectionStarts[s + 1]!.idx : lines.length
      sections.push({
        ticker: sectionStarts[s]!.ticker,
        text: lines.slice(start, end).join('\n').trim(),
      })
    }
    return { sections, confident: true }
  }

  // Fallback heuristic: when the body has clear "TICKER (Sector)" anchors
  // at line start, treat each as a section break.
  const anchorRe = /^\s*([A-Z]{2,15})\s*\(/m
  const anchorStarts: { idx: number; ticker: StockTicker }[] = []
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(/^\s*([A-Z]{2,15})\s*\(/)
    if (!m) continue
    const t = m[1]!
    if (detectTickers(t).length === 1) anchorStarts.push({ idx: i, ticker: asTicker(t) })
  }
  if (anchorStarts.length >= 2) {
    const sections: DigestSection[] = []
    for (let s = 0; s < anchorStarts.length; s++) {
      const start = anchorStarts[s]!.idx
      const end = s + 1 < anchorStarts.length ? anchorStarts[s + 1]!.idx : lines.length
      sections.push({
        ticker: anchorStarts[s]!.ticker,
        text: lines.slice(start, end).join('\n').trim(),
      })
    }
    return { sections, confident: true }
  }

  // Last resort: tickers detected but no clean section breaks → return
  // the whole body for each ticker, but flag low confidence so the
  // pipeline routes to the review queue.
  const all = detectTickers(body)
  if (all.length >= 2) {
    return {
      sections: all.map((t) => ({ ticker: t, text: body })),
      confident: false,
    }
  }
  // Suppress unused-variable warning in some toolchains.
  void anchorRe; void headingRe
  return { sections: [], confident: false }
}
