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
  // ── Healthcare ──────────────────────────────────────────────────────────

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

  'brk_iifl|APOLLOHOSP': [
    ...k('Revenue (₹ cr)', 21950, 26400, 30750),
    ...k('HealthCo GMV (₹ cr)', 16500, 21800, 27400),
    ...k('Hospital EBITDA (₹ cr)', 2920, 3640, 4380),
    ...k('PAT (₹ cr)', 1180, 1560, 1930),
    ...k('EPS (₹)', 82.0, 108.5, 134.3),
  ],
  'brk_kotak|APOLLOHOSP': [
    ...k('Revenue (₹ cr)', 22100, 26600, 30900),
    ...k('Hospital EBITDA (₹ cr)', 2960, 3680, 4420),
    ...k('EBITDA margin (%)', 23.7, 24.4, 25.0),
    ...k('PAT (₹ cr)', 1200, 1580, 1955),
  ],
  'brk_ambit|APOLLOHOSP': [
    ...k('Revenue (₹ cr)', 21800, 26200, 30500),
    ...k('Hospital EBITDA (₹ cr)', 2890, 3600, 4340),
    ...k('PAT (₹ cr)', 1160, 1545, 1910),
    ...k('EPS (₹)', 80.7, 107.5, 132.9),
  ],

  'brk_mosl|SUNPHARMA': [
    ...k('Revenue (₹ cr)', 48200, 54100, 60800),
    ...k('US Specialty rev (₹ cr)', 8400, 10200, 12300),
    ...k('EBITDA margin (%)', 28.5, 29.2, 30.0),
    ...k('PAT (₹ cr)', 11200, 13100, 15300),
    ...k('EPS (₹)', 46.7, 54.6, 63.8),
  ],
  'brk_kotak|SUNPHARMA': [
    ...k('Revenue (₹ cr)', 48000, 53800, 60400),
    ...k('EBITDA margin (%)', 28.4, 29.0, 29.7),
    ...k('PAT (₹ cr)', 11100, 13000, 15100),
  ],

  'brk_axis|DRREDDY': [
    ...k('Revenue (₹ cr)', 28600, 31100, 33700),
    ...k('EBITDA margin (%)', 26.8, 26.4, 26.6),
    ...k('PAT (₹ cr)', 5450, 5780, 6210),
    ...k('EPS (₹)', 65.5, 69.5, 74.7),
  ],

  // ── Financials · Banks ──────────────────────────────────────────────────

  'brk_mosl|HDFCBANK': [
    ...k('NII (₹ cr)', 117500, 132800, 149200),
    ...k('PPP (₹ cr)', 92400, 104600, 117800),
    ...k('NIM (%)', 3.42, 3.55, 3.68),
    ...k('PAT (₹ cr)', 67500, 78400, 90100),
    ...k('EPS (₹)', 88.7, 103.0, 118.4),
  ],
  'brk_kotak|HDFCBANK': [
    ...k('NII (₹ cr)', 118200, 133500, 150100),
    ...k('PPP (₹ cr)', 92800, 105200, 118500),
    ...k('NIM (%)', 3.44, 3.57, 3.70),
    ...k('Credit costs (bps)', 35, 38, 40),
    ...k('PAT (₹ cr)', 68000, 79100, 91000),
  ],
  'brk_jmfin|HDFCBANK': [
    ...k('NII (₹ cr)', 117800, 132400, 148500),
    ...k('PAT (₹ cr)', 67200, 77900, 89400),
    ...k('EPS (₹)', 88.3, 102.4, 117.5),
    ...k('Loan growth (%)', 13.8, 14.5, 14.2),
  ],
  'brk_iifl|HDFCBANK': [
    ...k('NII (₹ cr)', 116900, 130800, 145600),
    ...k('NIM (%)', 3.40, 3.48, 3.58),
    ...k('PAT (₹ cr)', 66400, 76200, 86800),
    ...k('Credit costs (bps)', 38, 44, 50),
  ],
  'brk_nuvama|HDFCBANK': [
    ...k('NII (₹ cr)', 117200, 131900, 147800),
    ...k('PPP (₹ cr)', 92100, 103900, 116900),
    ...k('PAT (₹ cr)', 67000, 77800, 89200),
  ],

  'brk_axis|ICICIBANK': [
    ...k('NII (₹ cr)', 76500, 86200, 96400),
    ...k('PPP (₹ cr)', 63800, 71900, 80500),
    ...k('NIM (%)', 4.35, 4.40, 4.45),
    ...k('PAT (₹ cr)', 42100, 48900, 56200),
    ...k('EPS (₹)', 60.0, 69.7, 80.1),
  ],
  'brk_kotak|ICICIBANK': [
    ...k('NII (₹ cr)', 76800, 86600, 96900),
    ...k('NIM (%)', 4.37, 4.42, 4.48),
    ...k('PAT (₹ cr)', 42400, 49300, 56700),
    ...k('Loan growth (%)', 15.5, 16.2, 16.0),
  ],
  'brk_nuvama|ICICIBANK': [
    ...k('NII (₹ cr)', 75900, 84800, 94100),
    ...k('PAT (₹ cr)', 41600, 47800, 54600),
    ...k('Credit costs (bps)', 48, 58, 65),
  ],

  'brk_plilladher|SBIN': [
    ...k('NII (₹ cr)', 156000, 172800, 190200),
    ...k('PPP (₹ cr)', 98000, 109500, 122000),
    ...k('NIM (%)', 3.10, 3.15, 3.20),
    ...k('PAT (₹ cr)', 72500, 82300, 93400),
    ...k('EPS (₹)', 81.3, 92.3, 104.7),
  ],

  // ── Financials · Insurance ──────────────────────────────────────────────

  'brk_kotak|HDFCLIFE': [
    ...k('APE (₹ cr)', 12420, 14580, 17150),
    ...k('VNB (₹ cr)', 3480, 4060, 4820),
    ...k('VNB margin (%)', 28.0, 27.8, 28.1),
    ...k('Embedded value (₹ cr)', 48200, 55100, 63500),
    ...k('PAT (₹ cr)', 1570, 1820, 2150),
  ],
  'brk_mosl|HDFCLIFE': [
    ...k('APE (₹ cr)', 12350, 14500, 17050),
    ...k('VNB (₹ cr)', 3460, 4040, 4790),
    ...k('VNB margin (%)', 28.0, 27.9, 28.1),
    ...k('PAT (₹ cr)', 1560, 1810, 2135),
    ...k('EPS (₹)', 7.3, 8.5, 10.0),
  ],
  'brk_jmfin|HDFCLIFE': [
    ...k('APE (₹ cr)', 12500, 14650, 17250),
    ...k('VNB (₹ cr)', 3510, 4090, 4860),
    ...k('VNB margin (%)', 28.1, 27.9, 28.2),
    ...k('PAT (₹ cr)', 1580, 1830, 2160),
  ],
  'brk_iifl|HDFCLIFE': [
    ...k('APE (₹ cr)', 12420, 14580, 17150),
    ...k('VNB (₹ cr)', 3450, 4000, 4720),
    ...k('VNB margin (%)', 27.8, 27.4, 27.5),
    ...k('PAT (₹ cr)', 1565, 1810, 2125),
  ],
  'brk_nuvama|HDFCLIFE': [
    ...k('APE (₹ cr)', 12380, 14450, 16900),
    ...k('VNB (₹ cr)', 3420, 3950, 4640),
    ...k('VNB margin (%)', 27.6, 27.3, 27.5),
    ...k('PAT (₹ cr)', 1550, 1790, 2100),
  ],
  'brk_ambit|HDFCLIFE': [
    ...k('APE (₹ cr)', 12450, 14600, 17180),
    ...k('VNB (₹ cr)', 3490, 4070, 4830),
    ...k('Embedded value (₹ cr)', 48400, 55400, 63800),
    ...k('PAT (₹ cr)', 1575, 1825, 2155),
  ],

  // ── Financials · Diversified ────────────────────────────────────────────

  'brk_jmfin|KOTAKBANK': [
    ...k('NII (₹ cr)', 28500, 32600, 37400),
    ...k('Pre-prov profit (₹ cr)', 24900, 28600, 33200),
    ...k('NIM (%)', 4.85, 4.92, 5.05),
    ...k('PAT (₹ cr)', 14800, 17100, 19950),
    ...k('EPS (₹)', 74.5, 86.0, 100.4),
  ],
  'brk_mosl|KOTAKBANK': [
    ...k('NII (₹ cr)', 28700, 32900, 37800),
    ...k('NIM (%)', 4.88, 4.95, 5.08),
    ...k('PAT (₹ cr)', 14950, 17350, 20250),
  ],
  'brk_axis|KOTAKBANK': [
    ...k('NII (₹ cr)', 28400, 32400, 37100),
    ...k('PAT (₹ cr)', 14700, 16950, 19750),
    ...k('Loan growth (%)', 18.5, 19.2, 18.8),
  ],

  // ── IT services ─────────────────────────────────────────────────────────

  'brk_kotak|TCS': [
    ...k('Revenue (₹ cr)', 254000, 280500, 309500),
    ...k('USD revenue (US$ bn)', 30.4, 33.6, 37.1),
    ...k('EBIT margin (%)', 24.8, 25.4, 25.8),
    ...k('PAT (₹ cr)', 49500, 55200, 61700),
    ...k('EPS (₹)', 135.0, 150.6, 168.4),
  ],
  'brk_mosl|TCS': [
    ...k('Revenue (₹ cr)', 253500, 279800, 308600),
    ...k('USD revenue (US$ bn)', 30.3, 33.5, 36.9),
    ...k('EBIT margin (%)', 24.7, 25.3, 25.7),
    ...k('PAT (₹ cr)', 49300, 54900, 61300),
  ],
  'brk_nuvama|TCS': [
    ...k('Revenue (₹ cr)', 251800, 275400, 300700),
    ...k('USD revenue (US$ bn)', 30.1, 32.9, 36.0),
    ...k('EBIT margin (%)', 24.4, 24.6, 24.8),
    ...k('PAT (₹ cr)', 48700, 53600, 58900),
  ],
  'brk_ambit|TCS': [
    ...k('Revenue (₹ cr)', 254400, 281200, 310700),
    ...k('EBIT margin (%)', 24.9, 25.5, 26.0),
    ...k('PAT (₹ cr)', 49700, 55400, 62000),
    ...k('EPS (₹)', 135.5, 151.2, 169.1),
  ],
  'brk_jmfin|TCS': [
    ...k('Revenue (₹ cr)', 253700, 279900, 308700),
    ...k('PAT (₹ cr)', 49400, 55100, 61500),
    ...k('EPS (₹)', 134.8, 150.4, 167.8),
  ],

  'brk_kotak|INFY': [
    ...k('Revenue (₹ cr)', 162400, 178000, 195800),
    ...k('USD revenue (US$ bn)', 19.4, 21.3, 23.4),
    ...k('EBIT margin (%)', 21.2, 21.8, 22.2),
    ...k('PAT (₹ cr)', 26800, 29800, 33100),
    ...k('EPS (₹)', 64.5, 71.7, 79.6),
  ],
  'brk_ambit|INFY': [
    ...k('Revenue (₹ cr)', 162800, 178500, 196300),
    ...k('EBIT margin (%)', 21.3, 22.0, 22.4),
    ...k('PAT (₹ cr)', 27000, 30000, 33300),
    ...k('EPS (₹)', 65.0, 72.2, 80.1),
  ],
  'brk_nuvama|INFY': [
    ...k('Revenue (₹ cr)', 161200, 175800, 192100),
    ...k('USD revenue (US$ bn)', 19.3, 21.0, 22.9),
    ...k('EBIT margin (%)', 21.0, 21.4, 21.7),
    ...k('PAT (₹ cr)', 26500, 29200, 32200),
  ],
  'brk_mosl|INFY': [
    ...k('Revenue (₹ cr)', 162500, 178100, 195900),
    ...k('EBIT margin (%)', 21.2, 21.8, 22.2),
    ...k('PAT (₹ cr)', 26850, 29850, 33150),
  ],

  'brk_nuvama|WIPRO': [
    ...k('Revenue (₹ cr)', 92500, 97800, 103500),
    ...k('EBIT margin (%)', 16.5, 17.0, 17.4),
    ...k('PAT (₹ cr)', 11800, 12700, 13700),
    ...k('EPS (₹)', 22.6, 24.3, 26.2),
  ],
  'brk_mosl|WIPRO': [
    ...k('Revenue (₹ cr)', 92700, 98100, 103800),
    ...k('PAT (₹ cr)', 11850, 12750, 13750),
  ],

  'brk_ambit|HCLTECH': [
    ...k('Revenue (₹ cr)', 122500, 134000, 146500),
    ...k('USD revenue (US$ bn)', 14.6, 16.0, 17.5),
    ...k('EBIT margin (%)', 18.6, 19.1, 19.5),
    ...k('PAT (₹ cr)', 17200, 19100, 21300),
    ...k('EPS (₹)', 63.4, 70.4, 78.5),
  ],
  'brk_kotak|HCLTECH': [
    ...k('Revenue (₹ cr)', 122800, 134300, 146800),
    ...k('EBIT margin (%)', 18.7, 19.2, 19.6),
    ...k('PAT (₹ cr)', 17300, 19200, 21400),
  ],

  // ── Energy ──────────────────────────────────────────────────────────────

  'brk_kotak|RELIANCE': [
    ...k('Revenue (₹ cr)', 925000, 1010000, 1098000),
    ...k('EBITDA (₹ cr)', 178000, 198500, 222000),
    ...k('Jio ARPU (₹)', 215, 235, 258),
    ...k('Retail EBITDA (₹ cr)', 23500, 27800, 33000),
    ...k('PAT (₹ cr)', 78500, 91200, 106500),
    ...k('EPS (₹)', 116.0, 134.8, 157.4),
  ],
  'brk_hdfc|RELIANCE': [
    ...k('Revenue (₹ cr)', 922000, 1005000, 1090000),
    ...k('EBITDA (₹ cr)', 176500, 196500, 219500),
    ...k('PAT (₹ cr)', 77800, 90100, 104900),
  ],
  'brk_mosl|RELIANCE': [
    ...k('Revenue (₹ cr)', 928000, 1015000, 1105000),
    ...k('Jio ARPU (₹)', 218, 240, 263),
    ...k('Retail EBITDA (₹ cr)', 23700, 28100, 33400),
    ...k('PAT (₹ cr)', 79200, 92000, 107400),
  ],

  'brk_kotak|ONGC': [
    ...k('Revenue (₹ cr)', 645000, 668000, 692000),
    ...k('Brent realisation (US$/bbl)', 74, 72, 71),
    ...k('EBITDA (₹ cr)', 198000, 205000, 213000),
    ...k('PAT (₹ cr)', 52000, 55500, 59500),
    ...k('EPS (₹)', 41.3, 44.1, 47.3),
  ],
  'brk_jmfin|ONGC': [
    ...k('Revenue (₹ cr)', 632000, 648000, 665000),
    ...k('Brent realisation (US$/bbl)', 68, 66, 65),
    ...k('EBITDA (₹ cr)', 188000, 192000, 197000),
    ...k('PAT (₹ cr)', 48500, 51200, 54300),
  ],

  // ── Industrials ─────────────────────────────────────────────────────────

  'brk_mosl|LT': [
    ...k('Revenue (₹ cr)', 245000, 285000, 327000),
    ...k('Order book (₹ cr)', 535000, 612000, 695000),
    ...k('Order inflow (₹ cr)', 282000, 318000, 355000),
    ...k('EBITDA margin (%)', 11.8, 12.3, 12.8),
    ...k('PAT (₹ cr)', 17400, 21200, 25400),
    ...k('EPS (₹)', 126.5, 154.3, 184.8),
  ],
  'brk_kotak|LT': [
    ...k('Revenue (₹ cr)', 244000, 283500, 325200),
    ...k('Order book (₹ cr)', 532000, 608000, 690000),
    ...k('EBITDA margin (%)', 11.7, 12.2, 12.7),
    ...k('PAT (₹ cr)', 17300, 21000, 25200),
  ],

  // ── Consumer · Auto ─────────────────────────────────────────────────────

  'brk_icici|MARUTI': [
    ...k('Volumes (000 units)', 2080, 2150, 2240),
    ...k('Revenue (₹ cr)', 145000, 154000, 165000),
    ...k('EBITDA margin (%)', 11.2, 11.5, 11.8),
    ...k('PAT (₹ cr)', 12800, 13700, 14900),
    ...k('EPS (₹)', 423, 453, 493),
  ],
  'brk_hdfc|MARUTI': [
    ...k('Volumes (000 units)', 2120, 2230, 2360),
    ...k('Revenue (₹ cr)', 148000, 159500, 172500),
    ...k('EBITDA margin (%)', 11.5, 12.0, 12.5),
    ...k('PAT (₹ cr)', 13200, 14500, 16100),
    ...k('EPS (₹)', 436, 480, 533),
  ],
  'brk_kotak|MARUTI': [
    ...k('Volumes (000 units)', 2110, 2200, 2310),
    ...k('Revenue (₹ cr)', 147500, 158000, 170500),
    ...k('PAT (₹ cr)', 13100, 14300, 15800),
  ],
  'brk_jmfin|MARUTI': [
    ...k('Volumes (000 units)', 2060, 2120, 2200),
    ...k('Revenue (₹ cr)', 144000, 152500, 162500),
    ...k('EBITDA margin (%)', 11.0, 11.2, 11.4),
    ...k('PAT (₹ cr)', 12600, 13400, 14500),
  ],
  'brk_iifl|MARUTI': [
    ...k('Volumes (000 units)', 2105, 2195, 2305),
    ...k('Revenue (₹ cr)', 147200, 157500, 169800),
    ...k('PAT (₹ cr)', 13050, 14250, 15700),
  ],
  'brk_gs|MARUTI': [
    ...k('Volumes (000 units)', 2090, 2160, 2250),
    ...k('Revenue (₹ cr)', 146000, 155500, 167000),
    ...k('EBITDA margin (%)', 11.3, 11.6, 11.9),
    ...k('PAT (₹ cr)', 12900, 13900, 15200),
  ],

  'brk_icici|TATAMOTORS': [
    ...k('Revenue (₹ cr)', 458000, 470000, 488000),
    ...k('JLR EBIT margin (%)', 7.5, 7.0, 6.8),
    ...k('India PV volumes (000)', 565, 580, 605),
    ...k('PAT (₹ cr)', 24500, 23800, 24800),
    ...k('EPS (₹)', 73.9, 71.8, 74.8),
  ],
  'brk_ambit|TATAMOTORS': [
    ...k('Revenue (₹ cr)', 472000, 498000, 528000),
    ...k('JLR EBIT margin (%)', 8.4, 9.2, 9.8),
    ...k('India PV volumes (000)', 588, 625, 668),
    ...k('PAT (₹ cr)', 28500, 32400, 36900),
    ...k('EPS (₹)', 85.9, 97.7, 111.3),
  ],
  'brk_hdfc|TATAMOTORS': [
    ...k('Revenue (₹ cr)', 465000, 482000, 502000),
    ...k('JLR EBIT margin (%)', 7.9, 8.0, 8.1),
    ...k('PAT (₹ cr)', 26200, 27500, 29400),
    ...k('EPS (₹)', 79.0, 83.0, 88.7),
  ],

  // ── Consumer · FMCG ─────────────────────────────────────────────────────

  'brk_iifl|HINDUNILVR': [
    ...k('Revenue (₹ cr)', 61500, 65800, 70900),
    ...k('UVG (%)', 3.0, 3.5, 4.5),
    ...k('EBITDA margin (%)', 23.5, 23.8, 24.2),
    ...k('PAT (₹ cr)', 10200, 11000, 12000),
    ...k('EPS (₹)', 43.4, 46.8, 51.1),
  ],
  'brk_kotak|HINDUNILVR': [
    ...k('Revenue (₹ cr)', 62200, 66800, 72200),
    ...k('UVG (%)', 4.0, 5.0, 6.0),
    ...k('EBITDA margin (%)', 23.8, 24.2, 24.6),
    ...k('PAT (₹ cr)', 10400, 11300, 12400),
  ],

  // ── Conglomerate / diversified (LTM) ───────────────────────────────────

  'brk_kotak|LTM': [
    ...k('Revenue (₹ cr)', 8200, 9100, 10100),
    ...k('EBITDA (₹ cr)', 1480, 1700, 1960),
    ...k('EBITDA margin (%)', 18.0, 18.7, 19.4),
    ...k('PAT (₹ cr)', 685, 810, 960),
    ...k('EPS (₹)', 48.5, 57.3, 67.9),
  ],
  'brk_krishnan_asv|LTM': [
    ...k('Revenue (₹ cr)', 8050, 8850, 9750),
    ...k('EBITDA (₹ cr)', 1430, 1620, 1850),
    ...k('PAT (₹ cr)', 660, 770, 905),
  ],
}
