// ─────────────────────────────────────────────────────────────────────────
// Per-broker KPI estimates — the structured numbers each broker note
// carries forward in time. The view-model aggregates these across all
// brokers covering a ticker to produce the consensus estimates table.
//
// Whichever metrics the broker mentions are what appears — there is no
// per-stock hardcoded metric list anywhere. A banking broker mentions
// NII/NIM; a hospital broker mentions Revenue/EBITDA/ARPOB; whatever a
// note carries is what the consensus surface reflects.
//
// Keyed by `${brokerId}|${ticker}` so the data stays attached to the
// pair regardless of which specific report carries it.
// ─────────────────────────────────────────────────────────────────────────

export interface BrokerKpiEstimate {
  /** Metric name as written in the broker note, e.g. "Revenue (₹ cr)". */
  readonly metric: string
  /** Year offset relative to the latest reported FY at the time of the
   *  note. 0 = "A" (actual), 1/2 = forward "E" (estimate). */
  readonly yearOffset: number
  readonly value: number
}

/** Compact builder for a 3-period series across yearOffsets 0,1,2. */
function k(metric: string, ...vals: readonly number[]): BrokerKpiEstimate[] {
  return vals.map((value, i) => ({ metric, yearOffset: i, value }))
}

export const BROKER_ESTIMATES_BY_BROKER_TICKER: Readonly<Record<string, readonly BrokerKpiEstimate[]>> = {
  // ── KIMS (Krishna Institute of Medical Sciences) ────────────────────────

  'brk_ambit|KIMS': [
    ...k('Revenue (₹ cr)', 2620, 3280, 4000),
    ...k('EBITDA (₹ cr)', 715, 895, 1120),
    ...k('PAT (₹ cr)', 220, 300, 390),
    { metric: 'EPS (₹)', yearOffset: 1, value: 36.5 },
    { metric: 'EPS (₹)', yearOffset: 2, value: 47.8 },
  ],

  'brk_kotak|KIMS': [
    ...k('Revenue (₹ cr)', 2680, 3220, 3900),
    ...k('EBITDA (₹ cr)', 725, 870, 1080),
    ...k('EBITDA margin (%)', 27.0, 27.0, 27.7),
    { metric: 'PAT (₹ cr)', yearOffset: 1, value: 285 },
    { metric: 'PAT (₹ cr)', yearOffset: 2, value: 375 },
  ],

  'brk_jmfin|KIMS': [
    ...k('Revenue (₹ cr)', 2650, 3270, 3970),
    ...k('EBITDA (₹ cr)', 720, 885, 1100),
    ...k('PAT (₹ cr)', 215, 295, 385),
    ...k('EPS (₹)', 26.8, 36.4, 47.6),
  ],

  'brk_nuvama|KIMS': [
    ...k('Revenue (₹ cr)', 2640, 3260, 3950),
    ...k('EBITDA (₹ cr)', 705, 870, 1090),
    { metric: 'ARPOB (₹/day)', yearOffset: 1, value: 41200 },
    { metric: 'ARPOB (₹/day)', yearOffset: 2, value: 44500 },
    ...k('PAT (₹ cr)', 210, 290, 380),
  ],

  // ── APOLLOHOSP — only IIFL covers it in the current dataset. Note the
  //    different metric mix (HealthCo GMV) — that's because IIFL chose to
  //    highlight it. Another broker covering Apollo might not include it. ─

  'brk_iifl|APOLLOHOSP': [
    ...k('Revenue (₹ cr)', 21950, 26400, 30750),
    ...k('HealthCo GMV (₹ cr)', 16500, 21800, 27400),
    ...k('Hospital EBITDA (₹ cr)', 2920, 3640, 4380),
    ...k('PAT (₹ cr)', 1180, 1560, 1930),
    ...k('EPS (₹)', 82.0, 108.5, 134.3),
  ],

  // ── KOTAKBANK — banking metrics, very different shape from healthcare ──

  'brk_jmfin|KOTAKBANK': [
    ...k('NII (₹ cr)', 28500, 32600, 37400),
    ...k('Pre-prov profit (₹ cr)', 24900, 28600, 33200),
    ...k('NIM (%)', 4.85, 4.92, 5.05),
    ...k('PAT (₹ cr)', 14800, 17100, 19950),
    ...k('EPS (₹)', 74.5, 86.0, 100.4),
  ],
}
