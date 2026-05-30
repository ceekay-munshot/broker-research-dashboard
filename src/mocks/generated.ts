// ─────────────────────────────────────────────────────────────────────────
// Generated mock history — ~6 months of broker research for the Aranya org.
//
// Why this exists: the hand-written fixtures (reports.ts, summaries.ts, …)
// are a small, tightly-tuned slice dated to a fixed week. To let every
// dashboard feature be studied — date-range filters (1D…1Y), the "New today"
// card, per-broker timelines, multi-broker disagreements, rating
// changes/upgrades/downgrades, target moves — we synthesise a much larger,
// internally-consistent history HERE and the fixture files append it.
//
// Two design choices make this safe and useful:
//   • Dates are RELATIVE TO `now` (computed at module load). So "today" and
//     "this week" always have notes no matter when the app runs — the demo
//     never goes stale.
//   • The PRNG is SEEDED (mulberry32, constant seed). So the *structure*
//     (who covers what, ratings, targets) is identical across reloads — only
//     the absolute timestamps slide forward with real time.
//
// IDs are namespaced with a `g` (rpt_g0001, sum_g0001, …) so they can never
// collide with the hand-written rpt_0001… set. Org is Aranya only (the
// mock's default session org); Sahyadri/Vimana keep their hand-written sets.
// ─────────────────────────────────────────────────────────────────────────

import type {
  ResearchReport, ReportSummary, BrokerStockOpinion,
  BrokerEmail, Attachment, EvidenceSnippet,
  Rating, Stance, ReportType, NoteSignalKind, NoteSignalSource,
} from '../domain'
import {
  asOrgId, asBrokerId, asEmailId, asAttachmentId,
  asReportId, asSummaryId, asSectorId, asTicker, asEvidenceId,
} from '../lib/ids'
import { stocks } from '../reference/stockCatalog'

const ORG = asOrgId('org_aranya')
const NOW = new Date()
const DAY_MS = 86_400_000

// ── Seeded PRNG (mulberry32) — deterministic structure across reloads ──────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(0x5eed1234)
const randInt = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1))
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!
const chance = (p: number) => rand() < p

// ── Coverage universe ──────────────────────────────────────────────────────
// Aranya's 10 enabled houses. Each is given a deterministic coverage subset of
// the 15-stock catalog, so most stocks end up with 5–8 brokers → meaningful
// consensus & disagreement on the Stocks / Agreements tabs.
const BROKERS: readonly { id: string; short: string; bias: number }[] = [
  { id: 'brk_kotak',      short: 'Kotak',  bias:  0.6 },
  { id: 'brk_mosl',       short: 'MOSL',   bias:  0.5 },
  { id: 'brk_icici',      short: 'I-Sec',  bias:  0.0 },
  { id: 'brk_hdfc',       short: 'HDFC',   bias:  0.2 },
  { id: 'brk_axis',       short: 'Axis',   bias:  0.3 },
  { id: 'brk_nuvama',     short: 'Nuvama', bias: -0.5 },
  { id: 'brk_ambit',      short: 'Ambit',  bias:  0.4 },
  { id: 'brk_jmfin',      short: 'JM Fin', bias: -0.3 },
  { id: 'brk_iifl',       short: 'IIFL',   bias: -0.2 },
  { id: 'brk_plilladher', short: 'PL',     bias:  0.3 },
]

const RATINGS: readonly Rating[] = ['Sell', 'Underweight', 'Hold', 'Overweight', 'Buy']
function stanceFor(r: Rating): Stance {
  if (r === 'Buy' || r === 'Overweight') return 'bullish'
  if (r === 'Sell' || r === 'Underweight') return 'bearish'
  return 'neutral'
}

// Weighted pool so the "Report type" filter has a realistic spread across every
// category — updates dominate, but flash notes, earnings (review + preview),
// management meetings and field visits all appear often enough to study.
const REPORT_TYPES: readonly ReportType[] = [
  'update', 'update', 'flash', 'flash', 'earnings_review', 'earnings_preview',
  'management_meeting', 'field_visit', 'deep_dive', 'update',
]

// Per-sector debate topics. Each topic names a driver and supplies a full,
// investor-legible claim for each polarity — a KPI sentence with a real
// number, then a "why" clause. The leading words include a dimension keyword
// (margin/growth/demand/order/execution/catalyst) so the closure engine's
// classifier (src/engine/classifiers.ts) files it under the right matrix row.
// Bull and bear read as two sides of the SAME debate, which is what makes the
// Agreements & disagreements matrix legible.
interface Topic {
  readonly label: string                 // short driver name (theme)
  readonly bull: (n: number) => string   // bull-side claim, parameterised by a metric
  readonly bear: (n: number) => string   // bear-side claim
  readonly neutral: (n: number) => string
  readonly unit: 'pct' | 'bps' | 'x'     // how to render the metric n
}
const fmt = (n: number, u: Topic['unit']) =>
  u === 'pct' ? `${n}%` : u === 'bps' ? `${n}bps` : `${n}x`

const SECTOR_TOPICS: Record<string, readonly Topic[]> = {
  sec_it: [
    { label: 'Deal TCV growth', unit: 'pct',
      bull: (n) => `Growth: deal TCV up ${n}% YoY with book-to-bill above 1.1x. Large-deal pipeline and vendor consolidation underpin double-digit FY27 revenue growth.`,
      bear: (n) => `Growth: deal TCV growth slowing to ${n}% YoY as discretionary projects slip. We see FY27 revenue growth decelerating toward mid-single digits.`,
      neutral: (n) => `Growth: deal TCV tracking ${n}% YoY, broadly in line; momentum hinges on the next two quarters of conversion.` },
    { label: 'EBIT margin trajectory', unit: 'bps',
      bull: (n) => `Margin: EBIT margin expanding ~${n}bps as utilisation and pyramid optimisation offset wage hikes. We model margin at the top of guidance.`,
      bear: (n) => `Margin: EBIT margin compressing ~${n}bps on wage inflation and weak utilisation. Pricing gives little room to recover near term.`,
      neutral: (n) => `Margin: EBIT margin roughly flat (±${n}bps); levers and headwinds offset through FY26.` },
    { label: 'GenAI / discretionary demand', unit: 'pct',
      bull: (n) => `Demand: GenAI attach now ~${n}% of new deals, reviving discretionary spend across BFSI and hi-tech verticals.`,
      bear: (n) => `Demand: discretionary spend still soft, GenAI only ~${n}% of deals and largely experimental — not yet a revenue driver.`,
      neutral: (n) => `Demand: GenAI attach ~${n}% of deals; early but not yet moving the topline.` },
  ],
  sec_fin: [
    { label: 'NIM trajectory', unit: 'bps',
      bull: (n) => `Margin: NIM troughing with ~${n}bps expansion into FY27 as deposit repricing catches up to the asset book.`,
      bear: (n) => `Margin: NIM compressing ~${n}bps as deposit costs stay sticky and the loan mix shifts to lower-yield secured credit.`,
      neutral: (n) => `Margin: NIM broadly stable (±${n}bps); funding costs and asset yields move together.` },
    { label: 'Loan growth', unit: 'pct',
      bull: (n) => `Growth: loan growth sustaining ~${n}% with retail credit demand intact and market-share gains from weaker peers.`,
      bear: (n) => `Growth: loan growth slowing to ~${n}% as the bank tightens unsecured underwriting amid rising stress.`,
      neutral: (n) => `Growth: loan growth ~${n}%, in line with system credit; no clear share shift.` },
    { label: 'Asset quality / credit cost', unit: 'bps',
      bull: (n) => `Execution: credit costs benign at ~${n}bps; management's underwriting discipline keeps slippages well contained.`,
      bear: (n) => `Execution: credit costs rising toward ~${n}bps as unsecured and microfinance books show early delinquency.`,
      neutral: (n) => `Execution: credit costs ~${n}bps, in line; asset quality stable pending the next cycle.` },
  ],
  sec_energy: [
    { label: 'Refining / O2C margin', unit: 'pct',
      bull: (n) => `Margin: refining spreads recovering, O2C EBITDA up ~${n}% as cracks normalise off the trough.`,
      bear: (n) => `Margin: refining spreads staying weak, O2C EBITDA down ~${n}% in a supply-surplus scenario.`,
      neutral: (n) => `Margin: O2C EBITDA roughly flat (±${n}%); spreads range-bound.` },
    { label: 'Upstream capex discipline', unit: 'pct',
      bull: (n) => `Execution: capex discipline driving an FCF inflection, free cash flow up ~${n}% and supporting capital returns.`,
      bear: (n) => `Execution: capex overruns of ~${n}% delay the FCF inflection; capital allocation remains a concern.`,
      neutral: (n) => `Execution: capex broadly to plan (±${n}%); FCF trajectory unchanged.` },
    { label: 'Retail EBITDA / ARPU', unit: 'pct',
      bull: (n) => `Demand: retail ARPU discipline and ~${n}% EBITDA step-up into FY27 underpin the sum-of-parts re-rating.`,
      bear: (n) => `Demand: retail EBITDA growth slowing to ~${n}% as tariff hikes meet competitive pushback.`,
      neutral: (n) => `Demand: retail EBITDA growing ~${n}%, in line; ARPU trajectory steady.` },
  ],
  sec_pharma: [
    { label: 'US generics pricing', unit: 'pct',
      bull: (n) => `Demand: US generics price erosion easing to ~${n}%, with new launches offsetting base-business decline.`,
      bear: (n) => `Demand: US generics pricing pressure persisting at ~${n}% erosion; channel consolidation keeps the base under stress.`,
      neutral: (n) => `Demand: US generics erosion ~${n}%, in line; launches roughly offset base decline.` },
    { label: 'Specialty franchise ramp', unit: 'pct',
      bull: (n) => `Growth: specialty franchise ramping ~${n}% as flagship brands gain share — the core re-rating driver.`,
      bear: (n) => `Growth: specialty ramp underwhelming at ~${n}%; R&D spend outpaces the revenue contribution.`,
      neutral: (n) => `Growth: specialty growing ~${n}%, tracking plan; ramp visibility improving.` },
    { label: 'Gross margin / gAPI cost', unit: 'bps',
      bull: (n) => `Margin: gross margin expanding ~${n}bps on a benign API cost tailwind and a richer product mix.`,
      bear: (n) => `Margin: gross margin compressing ~${n}bps as API costs rise and price erosion bites.`,
      neutral: (n) => `Margin: gross margin flat (±${n}bps); cost and pricing offset.` },
  ],
  sec_consumer: [
    { label: 'Volume / rural demand', unit: 'pct',
      bull: (n) => `Demand: volume growth recovering to ~${n}% as rural demand inflects and the festive read-through is strong.`,
      bear: (n) => `Demand: volume growth stalling at ~${n}% with rural recovery slower than modelled and down-trading visible.`,
      neutral: (n) => `Demand: volume growth ~${n}%, in line; rural recovery gradual.` },
    { label: 'Premiumisation / mix', unit: 'bps',
      bull: (n) => `Margin: premiumisation lifting realisations, gross margin up ~${n}bps on a richer mix.`,
      bear: (n) => `Margin: premiumisation stalling, gross margin down ~${n}bps as input costs outrun pricing.`,
      neutral: (n) => `Margin: mix-led margin roughly flat (±${n}bps) through the year.` },
    { label: 'EV / new-product roadmap', unit: 'pct',
      bull: (n) => `Catalyst: the EV and new-product roadmap adds ~${n}% to the FY27 TAM, with launches a clear re-rating catalyst.`,
      bear: (n) => `Catalyst: EV roadmap execution risk is high; we haircut the ~${n}% TAM uplift until launches prove out.`,
      neutral: (n) => `Catalyst: EV roadmap adds ~${n}% to TAM; timing and execution still to be proven.` },
  ],
  sec_industrial: [
    { label: 'Order inflow', unit: 'pct',
      bull: (n) => `Order book: order inflow at record highs, up ~${n}% YoY; the backlog extends revenue visibility well into FY28.`,
      bear: (n) => `Order book: order inflow slowing ~${n}% YoY as project awards are deferred; backlog conversion is the risk.`,
      neutral: (n) => `Order book: order inflow ~${n}% YoY, in line; backlog steady.` },
    { label: 'Execution / working capital', unit: 'pct',
      bull: (n) => `Execution: execution cycle tightening, working capital down ~${n}% of sales — a clear cash-flow positive.`,
      bear: (n) => `Execution: working capital stretching ~${n}% of sales as execution slips; cash conversion disappoints.`,
      neutral: (n) => `Execution: working capital ~${n}% of sales, in line; execution on track.` },
    { label: 'Margin expansion', unit: 'bps',
      bull: (n) => `Margin: operating margin expanding ~${n}bps on operating leverage and a better project mix.`,
      bear: (n) => `Margin: operating margin compressing ~${n}bps on competitive bidding and cost inflation.`,
      neutral: (n) => `Margin: operating margin roughly flat (±${n}bps); leverage offsets cost.` },
  ],
}
const POSITIVE = ['accelerating', 'inflecting higher', 'ahead of plan', 're-rating', 'structurally improving']
const NEGATIVE = ['under pressure', 'disappointing', 'derating', 'below plan', 'facing headwinds']
const NEUTRAL  = ['in line', 'broadly stable', 'mixed', 'tracking expectations', 'range-bound']

/** Build the polarity-correct claim for a topic + stance, with a plausible
 *  metric. Returns the full "KPI. Why." sentence the matrix renders. */
function claimFor(topic: Topic, stance: Stance): string {
  const n = topic.unit === 'bps' ? randInt(40, 220)
    : topic.unit === 'x' ? randInt(8, 24)
    : randInt(4, 28)
  void fmt
  if (stance === 'bullish') return topic.bull(n)
  if (stance === 'bearish') return topic.bear(n)
  return topic.neutral(n)
}

function iso(daysAgo: number, hourUtc: number, min: number): string {
  const d = new Date(NOW.getTime() - daysAgo * DAY_MS)
  d.setUTCHours(hourUtc, min, 0, 0)
  return d.toISOString()
}
function utcDateOnly(daysAgo: number): string {
  return new Date(NOW.getTime() - daysAgo * DAY_MS).toISOString().slice(0, 10)
}

// ── Generation ───────────────────────────────────────────────────────────────

interface Gen {
  reports: ResearchReport[]
  summaries: ReportSummary[]
  opinions: BrokerStockOpinion[]
  emails: BrokerEmail[]
  attachments: Attachment[]
  evidence: EvidenceSnippet[]
}

function generate(): Gen {
  const reports: ResearchReport[] = []
  const summaries: ReportSummary[] = []
  const emails: BrokerEmail[] = []
  const attachments: Attachment[] = []
  const evidence: EvidenceSnippet[] = []

  // (broker,ticker) → latest note, for the derived opinions projection.
  const latestByPair = new Map<string, { report: ResearchReport; rating: Rating; target: number; upside: number }>()

  let n = 0   // report counter
  let ev = 0  // evidence counter

  // Force a handful of notes onto "today" / this week so the recent surfaces
  // are never empty. Filled as we go.
  const recencyQueue = [0, 0, 1, 1, 2, 3, 4, 5, 6]

  for (const stock of stocks) {
    const sector = stock.sectorId as unknown as string
    const topics = SECTOR_TOPICS[sector] ?? SECTOR_TOPICS.sec_it!
    const spot = stock.lastPrice ?? 1000

    // Which brokers cover this stock — deterministic subset of 5–8.
    const coverCount = randInt(5, 8)
    const shuffled = [...BROKERS].sort(() => rand() - 0.5)
    const covering = shuffled.slice(0, coverCount)

    for (const brk of covering) {
      // A series of notes for this (broker, stock) over ~6 months.
      const numNotes = randInt(3, 7)
      // Most recent note: bias toward recency; pull from the queue when available.
      let daysAgo = recencyQueue.length > 0 && chance(0.5)
        ? recencyQueue.shift()!
        : randInt(0, 40)

      // Rating walk seeded by the broker's structural bias.
      let ratingIdx = Math.max(0, Math.min(4, 2 + Math.round(brk.bias * 2) + randInt(-1, 1)))
      let prevTarget: number | null = null

      const series: { daysAgo: number; ratingIdx: number; target: number }[] = []
      for (let k = 0; k < numNotes; k++) {
        // Walk the rating occasionally as we step BACK in time.
        if (k > 0 && chance(0.35)) ratingIdx = Math.max(0, Math.min(4, ratingIdx + (chance(0.5) ? 1 : -1)))
        // Target around spot, tilted by rating (bulls above, bears below) + drift.
        const tilt = 1 + (ratingIdx - 2) * 0.06 + (rand() - 0.5) * 0.08
        const target = Math.round((spot * tilt) / 5) * 5
        series.push({ daysAgo, ratingIdx, target })
        daysAgo += randInt(16, 34) // older note
      }
      // series[0] is newest; iterate oldest→newest so signal/target deltas read right.
      series.reverse()

      for (let k = 0; k < series.length; k++) {
        const cur = series[k]!
        const prev = k > 0 ? series[k - 1]! : null
        const rating = RATINGS[cur.ratingIdx]!
        const stance = stanceFor(rating)
        const isFirst = k === 0
        // Pick TWO debate topics for this note so a stock accumulates views
        // across multiple matrix rows (Growth, Margins, Demand…). The first is
        // the headline driver; both become full claims classified by keyword.
        const shuffledTopics = [...topics].sort(() => rand() - 0.5)
        const topicA = shuffledTopics[0]!
        const topicB = shuffledTopics[1] ?? topicA
        const theme = topicA.label
        const mood = stance === 'bullish' ? pick(POSITIVE) : stance === 'bearish' ? pick(NEGATIVE) : pick(NEUTRAL)
        const reportType: ReportType = isFirst ? 'initiation' : pick(REPORT_TYPES)

        // Note signal: first = new coverage; rating step = upgrade/downgrade.
        let signalKind: NoteSignalKind | null = null
        let signalSource: NoteSignalSource | null = null
        if (isFirst) { signalKind = 'new_coverage'; signalSource = 'report_type' }
        else if (prev && cur.ratingIdx > prev.ratingIdx) { signalKind = 'upgrade'; signalSource = 'body' }
        else if (prev && cur.ratingIdx < prev.ratingIdx) { signalKind = 'downgrade'; signalSource = 'body' }

        const upside = +(((cur.target - spot) / spot) * 100).toFixed(2)
        n += 1
        const seq = String(n).padStart(4, '0')
        const rptId = `rpt_g${seq}`
        const sumId = `sum_g${seq}`
        const emlId = `eml_g${seq}`
        const attId = `att_g${seq}`
        const pubH = randInt(4, 12), pubM = randInt(0, 59)
        const publishedAt = iso(cur.daysAgo, pubH, pubM)
        const recvMin = pubM + randInt(40, 130)
        const receivedAt = iso(cur.daysAgo, pubH + Math.floor(recvMin / 60), recvMin % 60)
        const title = `${stock.ticker as unknown as string}: ${theme} ${mood}` +
          (signalKind === 'upgrade' ? ' — upgrading' : signalKind === 'downgrade' ? ' — downgrading' : '')
        const pageCount = randInt(8, 28)

        reports.push({
          id: asReportId(rptId), orgId: ORG, brokerId: asBrokerId(brk.id),
          sourceEmailId: asEmailId(emlId), sourceAttachmentId: asAttachmentId(attId),
          title, publishedAt, receivedAt, reportType,
          tickers: [asTicker(stock.ticker as unknown as string)],
          sectorIds: [asSectorId(sector)], pageCount, language: 'en',
          status: 'ready', summaryId: asSummaryId(sumId),
        })

        // Two full, dimension-tagged debate claims (the matrix rows) plus a
        // valuation line. claimA/claimB read as "KPI with a number. Why." so
        // the Street matrix shows a bold headline and a lighter rationale.
        const claimA = claimFor(topicA, stance)
        const claimB = claimFor(topicB, stance)
        // themes feed the closure classifier — keep the keyword-bearing label.
        const themesList = [topicA.label, topicB.label]
        const keyPoints = [
          claimA,
          claimB,
          `Valuation: our ₹${cur.target.toLocaleString('en-IN')} target implies ${upside >= 0 ? '+' : ''}${Math.round(upside)}% versus the last close, ` +
            (stance === 'bullish' ? 'and risk/reward skews favourable from here.'
              : stance === 'bearish' ? 'leaving little margin of safety at current levels.'
              : 'a balanced setup pending the next print.'),
        ]
        const evIds = [0, 1, 2].map(() => { ev += 1; return asEvidenceId(`ev_g${String(ev).padStart(5, '0')}`) })
        summaries.push({
          id: asSummaryId(sumId), orgId: ORG, reportId: asReportId(rptId),
          stance, rating,
          targetPrice: cur.target, priorTargetPrice: prevTarget, targetCurrency: 'INR',
          thesis: `${stock.name}: we rate the stock ${rating} with a ₹${cur.target.toLocaleString('en-IN')} target (${upside >= 0 ? '+' : ''}${Math.round(upside)}% upside). ${claimA}`,
          keyPoints,
          themes: themesList,
          risks: [stance === 'bullish'
            ? `Execution slippage versus the raised bar on ${topicA.label.toLowerCase()} is the key downside risk.`
            : `A sharper-than-modelled recovery in ${topicA.label.toLowerCase()} is the key upside risk to our cautious view.`],
          catalysts: [{ label: 'Next quarterly result', expectedOn: iso(cur.daysAgo - randInt(20, 60), 9, 30) }],
          confidence: +(0.6 + rand() * 0.3).toFixed(2),
          generatedAt: receivedAt, generatorVersion: 'mock-gen-1.0',
          evidenceIds: evIds,
          keyNumbers: [
            { label: 'PT', value: `₹${cur.target.toLocaleString('en-IN')}` },
            { label: 'Upside', value: `${upside >= 0 ? '+' : ''}${Math.round(upside)}%` },
          ],
          watchpoints: [topicA.label, topicB.label],
          upsidePct: upside,
          noteSignalKind: signalKind,
          noteSignalSource: signalSource,
          upsideChipPct: upside >= 15 ? upside : null,
          actionLabel: null,
        })
        const evFields: readonly ['thesis' | 'keyPoint', string][] = [['thesis', ''], ['keyPoint', '0'], ['keyPoint', '1']]
        evFields.forEach(([field, ref], i) => {
          evidence.push({
            id: evIds[i]!, orgId: ORG, reportId: asReportId(rptId), summaryId: asSummaryId(sumId),
            attachmentId: asAttachmentId(attId), pageNumber: randInt(1, pageCount),
            textSnippet: i === 0 ? claimA : keyPoints[i === 1 ? 1 : 2]!,
            charOffsetStart: null, charOffsetEnd: null, boundingBox: null,
            supportingField: field, fieldRef: ref,
          })
        })

        // Email + attachment (1:1, all ready).
        const dateTag = utcDateOnly(cur.daysAgo).replace(/-/g, '')
        emails.push({
          id: asEmailId(emlId), orgId: ORG, brokerId: asBrokerId(brk.id),
          senderAddress: `research@${brk.id.replace('brk_', '')}.com`,
          senderName: `${brk.short} Research`, recipientAddress: 'research@aranyacapital.in',
          subject: title, bodyPreview: `${stock.name} — ${rating}, PT ₹${cur.target.toLocaleString('en-IN')}. ${claimA}`,
          receivedAt, forwardedFrom: ['arjun@aranyacapital.in'],
          attachmentIds: [asAttachmentId(attId)], reportIds: [asReportId(rptId)],
          status: 'ready', statusMessage: null, sourceMessageId: `<${emlId}@${brk.id}>`,
        })
        // Vary the source artifact so the drawer's Source button exercises
        // every kind: PDF, spreadsheet, Word doc, web link — and roughly every
        // 5th note has no attachment URL so the email-source fallback shows.
        const stem = `${brk.short.replace(/\s+/g, '')}_${stock.ticker as unknown as string}_${dateTag}`
        const variant = n % 5
        const src =
          variant === 0 ? { ext: 'pdf',  mime: 'application/pdf', url: `https://research.${brk.id.replace('brk_', '')}.com/notes/${stem}.pdf` }
          : variant === 1 ? { ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', url: `https://research.${brk.id.replace('brk_', '')}.com/models/${stem}.xlsx` }
          : variant === 2 ? { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', url: `https://research.${brk.id.replace('brk_', '')}.com/notes/${stem}.docx` }
          : variant === 3 ? { ext: 'html', mime: 'text/html', url: `https://research.${brk.id.replace('brk_', '')}.com/web/${stem}` }
          : { ext: 'pdf', mime: 'application/pdf', url: null } // no link → email-source fallback
        attachments.push({
          id: asAttachmentId(attId), orgId: ORG, emailId: asEmailId(emlId),
          filename: `${stem}.${src.ext}`,
          mimeType: src.mime, sizeBytes: randInt(180_000, 2_400_000),
          checksumSha256: '', storageRef: `s3://mock/${attId}.${src.ext}`,
          sourceUrl: src.url,
          pageCount, language: 'en', parseStatus: 'ready', parseErrorMessage: null,
        })

        prevTarget = cur.target

        // Track latest per (broker,ticker) for opinions.
        const pairKey = `${brk.id}|${stock.ticker as unknown as string}`
        const existing = latestByPair.get(pairKey)
        if (!existing || publishedAt > existing.report.publishedAt) {
          latestByPair.set(pairKey, {
            report: reports[reports.length - 1]!, rating, target: cur.target, upside,
          })
        }
      }
    }
  }

  // Derived opinions — latest note per (broker, ticker).
  const opinions: BrokerStockOpinion[] = [...latestByPair.entries()].map(([key, v]) => {
    const [brokerId, ticker] = key.split('|') as [string, string]
    return {
      orgId: ORG, brokerId: asBrokerId(brokerId), ticker: asTicker(ticker),
      rating: v.rating, stance: stanceFor(v.rating),
      targetPrice: v.target, priorTargetPrice: v.report.summaryId ? null : null,
      targetCurrency: 'INR', lastReportId: v.report.id,
      lastUpdatedAt: v.report.publishedAt, impliedUpsidePct: v.upside,
    }
  })

  // A few in-flight emails (no report) so the Inbox shows queued/parsing/failed.
  const inflight: readonly { status: BrokerEmail['status']; msg: string | null }[] = [
    { status: 'queued', msg: null }, { status: 'parsing', msg: null },
    { status: 'failed', msg: 'PDF parse failed: encrypted attachment' },
    { status: 'queued', msg: null }, { status: 'parsing', msg: null },
  ]
  inflight.forEach((f, i) => {
    const brk = BROKERS[i % BROKERS.length]!
    const stock = stocks[i % stocks.length]!
    const emlId = `eml_gx${String(i + 1).padStart(3, '0')}`
    emails.push({
      id: asEmailId(emlId), orgId: ORG, brokerId: asBrokerId(brk.id),
      senderAddress: `research@${brk.id.replace('brk_', '')}.com`, senderName: `${brk.short} Research`,
      recipientAddress: 'research@aranyacapital.in',
      subject: `${stock.ticker as unknown as string}: inbound note`,
      bodyPreview: 'Awaiting extraction…', receivedAt: iso(randInt(0, 2), randInt(5, 12), randInt(0, 59)),
      forwardedFrom: ['arjun@aranyacapital.in'], attachmentIds: [], reportIds: [],
      status: f.status, statusMessage: f.msg, sourceMessageId: `<${emlId}@${brk.id}>`,
    })
  })

  return { reports, summaries, opinions, emails, attachments, evidence }
}

export const GENERATED: Gen = generate()
