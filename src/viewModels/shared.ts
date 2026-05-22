import type {
  Broker, ResearchReport, ReportSummary, Stance, Rating,
  BrokerId, ReportId, StockTicker, Iso8601, BrokerSource,
} from '../domain'
import { TONE_TEXT_CLASS, getRecommendationTone, getStanceTone } from '../lib/semanticColor'

// Shared view-model pieces used by more than one screen. Keep everything in
// this file a pure data transform — no React, no side effects.

export interface FeedItemViewModel {
  readonly reportId: ReportId
  readonly brokerId: BrokerId
  readonly brokerName: string
  readonly brokerShortName: string
  readonly brokerColor: string | null
  readonly ticker: StockTicker | null
  readonly stance: Stance
  readonly rating: Rating | null
  readonly headline: string
  readonly publishedAt: Iso8601
  readonly thesisOneLiner: string
  readonly targetPrice: number | null
  readonly priorTargetPrice: number | null
  /** How this note's broker was resolved — for the evidence tooltip. */
  readonly brokerEvidence: string | null
  readonly brokerSource: BrokerSource | null
}

// Rating / stance text colours, projected from the central semantic-tone
// system (src/lib/semanticColor.ts). Kept as lookup records so the many
// call-sites stay terse — but the colour *decision* lives in one place.
// Underweight is bearish, so it resolves to red, not amber.
export const STANCE_TEXT_COLOR: Readonly<Record<Stance, string>> = {
  bullish: TONE_TEXT_CLASS[getStanceTone('bullish')],
  neutral: TONE_TEXT_CLASS[getStanceTone('neutral')],
  bearish: TONE_TEXT_CLASS[getStanceTone('bearish')],
}

export const RATING_TEXT_COLOR: Readonly<Record<Rating, string>> = {
  'Buy':         TONE_TEXT_CLASS[getRecommendationTone('Buy')],
  'Overweight':  TONE_TEXT_CLASS[getRecommendationTone('Overweight')],
  'Hold':        TONE_TEXT_CLASS[getRecommendationTone('Hold')],
  'Underweight': TONE_TEXT_CLASS[getRecommendationTone('Underweight')],
  'Sell':        TONE_TEXT_CLASS[getRecommendationTone('Sell')],
  'Not Rated':   TONE_TEXT_CLASS[getRecommendationTone('Not Rated')],
}

export function buildFeedItem(
  report: ResearchReport,
  summary: ReportSummary | null,
  broker: Broker | null,
): FeedItemViewModel {
  return {
    reportId: report.id,
    brokerId: report.brokerId,
    brokerName: broker?.name ?? '—',
    brokerShortName: broker?.shortName ?? '—',
    brokerColor: broker?.brandColor ?? null,
    ticker: report.tickers[0] ?? null,
    stance: summary?.stance ?? 'neutral',
    rating: summary?.rating ?? null,
    headline: report.title,
    publishedAt: report.publishedAt,
    thesisOneLiner: summary?.thesis ?? '',
    targetPrice: summary?.targetPrice ?? null,
    priorTargetPrice: summary?.priorTargetPrice ?? null,
    brokerEvidence: report.brokerResolution?.brokerEvidence ?? null,
    brokerSource: report.brokerResolution?.brokerSource ?? null,
  }
}

export function indexBy<T, K extends string>(items: readonly T[], keyFn: (t: T) => K): ReadonlyMap<K, T> {
  const m = new Map<K, T>()
  for (const it of items) m.set(keyFn(it), it)
  return m
}

export function groupBy<T, K extends string>(items: readonly T[], keyFn: (t: T) => K): ReadonlyMap<K, T[]> {
  const m = new Map<K, T[]>()
  for (const it of items) {
    const k = keyFn(it)
    const bucket = m.get(k)
    if (bucket) bucket.push(it)
    else m.set(k, [it])
  }
  return m
}

export function formatShortDate(iso: Iso8601): string {
  const d = new Date(iso)
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

// Price formatter that respects the stock/opinion currency. Supports INR
// (₹ + en-IN grouping, e.g. ₹1,20,000) and USD; falls back to plain locale
// grouping when currency is unknown.
export function formatPrice(
  amount: number | null,
  currency: string | null | undefined,
  fractionDigits = 0,
): string {
  if (amount === null) return '—'
  const symbol = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : ''
  const locale = currency === 'INR' ? 'en-IN' : 'en-US'
  return `${symbol}${amount.toLocaleString(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}`
}

export function formatTargetDelta(current: number | null, prior: number | null): {
  readonly delta: number | null
  readonly direction: 'up' | 'down' | 'flat' | 'none'
} {
  if (current == null || prior == null) return { delta: null, direction: 'none' }
  const d = current - prior
  if (d > 0) return { delta: d, direction: 'up' }
  if (d < 0) return { delta: d, direction: 'down' }
  return { delta: 0, direction: 'flat' }
}
