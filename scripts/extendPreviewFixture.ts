// One-shot generator: appends ~6 months of historical broker-note emails
// to the preview fixture, so the demo dashboard reads like it has been
// running for a while. Numbers are demo-grade, not market-accurate.
//
// Run with: npx tsx scripts/extendPreviewFixture.ts
// Idempotent-ish: it drops any previously-generated entries (tagged by
// the `__generated: true` marker in metadata) before inserting fresh ones.

import { readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'

const FIXTURE = resolve('src/adapters/serverOutput/previewFixture/emailApiResponse.sample.json')

interface BrokerSpec {
  readonly code: string          // 'AMBIT', 'KOTAK' etc — used in the subject prefix
  readonly senderName: string
  readonly senderEmail: string
  readonly house: string         // 'Ambit Research', 'Kotak Institutional Equities' etc
}

const BROKERS: Readonly<Record<string, BrokerSpec>> = {
  AMBIT:  { code: 'AMBIT',  senderName: 'Sumit Jain',   senderEmail: 'sumit.jain@ambit.co',          house: 'Ambit Research' },
  KOTAK:  { code: 'KOTAK',  senderName: 'Aakash Mehta', senderEmail: 'aakash.mehta@kotak.com',       house: 'Kotak Institutional Equities' },
  JMFL:   { code: 'JMFL',   senderName: 'Nehal Shah',   senderEmail: 'nehal.shah@jmfl.com',          house: 'JM Financial' },
  NUVAMA: { code: 'NUVAMA', senderName: 'Ravi Tiwari',  senderEmail: 'ravi.tiwari@nuvama.com',       house: 'Nuvama Institutional Equities' },
  IIFL:   { code: 'IIFL',   senderName: 'Pooja Bansal', senderEmail: 'pooja.bansal@iiflcap.com',     house: 'IIFL Securities' },
}

interface StockSpec {
  readonly ticker: string
  readonly name: string
}

const STOCKS: Readonly<Record<string, StockSpec>> = {
  KIMS:     { ticker: 'KIMS',     name: 'Krishna Institute of Medical Sciences' },
  HDFCLIFE: { ticker: 'HDFCLIFE', name: 'HDFC Life Insurance Company' },
  HDFCBANK: { ticker: 'HDFCBANK', name: 'HDFC Bank' },
  MARUTI:   { ticker: 'MARUTI',   name: 'Maruti Suzuki India Ltd' },
  TCS:      { ticker: 'TCS',      name: 'Tata Consultancy Services' },
  KOTAKBANK:{ ticker: 'KOTAKBANK',name: 'Kotak Mahindra Bank' },
  APOLLOHOSP:{ ticker: 'APOLLOHOSP', name: 'Apollo Hospitals' },
}

interface Note {
  readonly broker: keyof typeof BROKERS
  readonly stock: keyof typeof STOCKS
  /** ISO publish date (used for received_at / created_at). */
  readonly date: string
  readonly rating: string        // 'BUY' | 'ADD' | 'HOLD' | 'NEUTRAL' | 'REDUCE' | 'SELL' | 'OVERWEIGHT' | 'UNDERWEIGHT'
  readonly tp: number            // target price (₹)
  /** What the broker emphasised this round — drives the body copy variation. */
  readonly angle: 'initiation' | 'upgrade' | 'downgrade' | 'maintain_bull' | 'maintain_bear' | 'target_raise' | 'target_cut' | 'mixed'
}

// Six-month timeline stories. Each (broker, stock) gets several entries so
// the drawer's BrokerStockTimeline shows a meaningful evolution. The most
// recent entries already exist in the fixture (May 2026) — these are the
// older history that precedes them.

const NOTES: readonly Note[] = [
  // ── AMBIT × KIMS — Bullish story with target raises over 6 months ──────
  { broker: 'AMBIT', stock: 'KIMS', date: '2025-12-08T04:30:00.000Z', rating: 'BUY', tp: 720, angle: 'initiation' },
  { broker: 'AMBIT', stock: 'KIMS', date: '2026-01-22T04:30:00.000Z', rating: 'BUY', tp: 770, angle: 'target_raise' },
  { broker: 'AMBIT', stock: 'KIMS', date: '2026-02-18T04:30:00.000Z', rating: 'BUY', tp: 800, angle: 'maintain_bull' },
  { broker: 'AMBIT', stock: 'KIMS', date: '2026-03-25T04:30:00.000Z', rating: 'BUY', tp: 845, angle: 'target_raise' },
  { broker: 'AMBIT', stock: 'KIMS', date: '2026-04-28T04:30:00.000Z', rating: 'BUY', tp: 870, angle: 'maintain_bull' },

  // ── KOTAK × KIMS — Mixed: initiation neutral → upgrade → trim ─────────
  { broker: 'KOTAK', stock: 'KIMS', date: '2025-11-20T08:00:00.000Z', rating: 'ADD', tp: 680, angle: 'initiation' },
  { broker: 'KOTAK', stock: 'KIMS', date: '2026-01-10T08:00:00.000Z', rating: 'BUY', tp: 740, angle: 'upgrade' },
  { broker: 'KOTAK', stock: 'KIMS', date: '2026-02-25T08:00:00.000Z', rating: 'REDUCE', tp: 660, angle: 'downgrade' },
  { broker: 'KOTAK', stock: 'KIMS', date: '2026-03-18T08:00:00.000Z', rating: 'ADD', tp: 700, angle: 'upgrade' },
  { broker: 'KOTAK', stock: 'KIMS', date: '2026-04-22T08:00:00.000Z', rating: 'UNDERWEIGHT', tp: 695, angle: 'maintain_bear' },

  // ── JMFL × HDFCLIFE — Steady bull with periodic target moves ──────────
  { broker: 'JMFL', stock: 'HDFCLIFE', date: '2025-12-02T05:00:00.000Z', rating: 'BUY', tp: 680, angle: 'initiation' },
  { broker: 'JMFL', stock: 'HDFCLIFE', date: '2026-01-15T05:00:00.000Z', rating: 'BUY', tp: 720, angle: 'target_raise' },
  { broker: 'JMFL', stock: 'HDFCLIFE', date: '2026-02-20T05:00:00.000Z', rating: 'ADD', tp: 740, angle: 'maintain_bull' },
  { broker: 'JMFL', stock: 'HDFCLIFE', date: '2026-04-05T05:00:00.000Z', rating: 'ADD', tp: 760, angle: 'target_raise' },

  // ── KOTAK × HDFCBANK — Maintain Buy with two TP step-ups ──────────────
  { broker: 'KOTAK', stock: 'HDFCBANK', date: '2025-11-15T07:30:00.000Z', rating: 'BUY', tp: 1850, angle: 'initiation' },
  { broker: 'KOTAK', stock: 'HDFCBANK', date: '2026-01-08T07:30:00.000Z', rating: 'BUY', tp: 1950, angle: 'target_raise' },
  { broker: 'KOTAK', stock: 'HDFCBANK', date: '2026-02-28T07:30:00.000Z', rating: 'BUY', tp: 2000, angle: 'maintain_bull' },
  { broker: 'KOTAK', stock: 'HDFCBANK', date: '2026-04-12T07:30:00.000Z', rating: 'BUY', tp: 2080, angle: 'target_raise' },

  // ── IIFL × HDFCBANK — Bear thesis that hardens over time ──────────────
  { broker: 'IIFL', stock: 'HDFCBANK', date: '2025-12-12T06:00:00.000Z', rating: 'HOLD', tp: 1680, angle: 'initiation' },
  { broker: 'IIFL', stock: 'HDFCBANK', date: '2026-02-05T06:00:00.000Z', rating: 'REDUCE', tp: 1620, angle: 'downgrade' },
  { broker: 'IIFL', stock: 'HDFCBANK', date: '2026-03-20T06:00:00.000Z', rating: 'SELL', tp: 1580, angle: 'downgrade' },
  { broker: 'IIFL', stock: 'HDFCBANK', date: '2026-04-30T06:00:00.000Z', rating: 'SELL', tp: 1550, angle: 'target_cut' },

  // ── NUVAMA × MARUTI — Reverses from Buy to Sell mid-cycle ─────────────
  { broker: 'NUVAMA', stock: 'MARUTI', date: '2025-11-25T09:00:00.000Z', rating: 'BUY', tp: 13800, angle: 'initiation' },
  { broker: 'NUVAMA', stock: 'MARUTI', date: '2026-01-18T09:00:00.000Z', rating: 'HOLD', tp: 13200, angle: 'downgrade' },
  { broker: 'NUVAMA', stock: 'MARUTI', date: '2026-03-02T09:00:00.000Z', rating: 'REDUCE', tp: 12600, angle: 'downgrade' },
  { broker: 'NUVAMA', stock: 'MARUTI', date: '2026-04-15T09:00:00.000Z', rating: 'SELL', tp: 11400, angle: 'target_cut' },

  // ── KOTAK × TCS — Two-step bull confirmation ──────────────────────────
  { broker: 'KOTAK', stock: 'TCS', date: '2025-12-04T08:00:00.000Z', rating: 'BUY', tp: 4200, angle: 'initiation' },
  { broker: 'KOTAK', stock: 'TCS', date: '2026-02-08T08:00:00.000Z', rating: 'BUY', tp: 4350, angle: 'target_raise' },
  { broker: 'KOTAK', stock: 'TCS', date: '2026-03-28T08:00:00.000Z', rating: 'BUY', tp: 4450, angle: 'maintain_bull' },
  { broker: 'KOTAK', stock: 'TCS', date: '2026-04-25T08:00:00.000Z', rating: 'BUY', tp: 4550, angle: 'target_raise' },

  // ── AMBIT × HDFCLIFE — Late initiation with quick upgrade ─────────────
  { broker: 'AMBIT', stock: 'HDFCLIFE', date: '2026-01-29T04:30:00.000Z', rating: 'ADD', tp: 705, angle: 'initiation' },
  { broker: 'AMBIT', stock: 'HDFCLIFE', date: '2026-03-08T04:30:00.000Z', rating: 'BUY', tp: 745, angle: 'upgrade' },
  { broker: 'AMBIT', stock: 'HDFCLIFE', date: '2026-04-20T04:30:00.000Z', rating: 'BUY', tp: 760, angle: 'target_raise' },
]

// ── Body / subject templates ─────────────────────────────────────────────

const ANGLE_HEADLINE: Readonly<Record<Note['angle'], (n: Note) => string>> = {
  initiation:     (n) => `Initiating coverage with ${n.rating} and a target of ₹${n.tp}. The set-up is favourable: margin trajectory is improving, growth pipeline is intact, and management execution remains the structural anchor.`,
  upgrade:        (n) => `Upgrading to ${n.rating} with a revised target of ₹${n.tp}. Recent management commentary and execution data support a higher conviction stance from here.`,
  downgrade:      (n) => `Downgrading to ${n.rating} with a target of ₹${n.tp}. Near-term execution risk and a less constructive macro set-up argue for a more cautious posture.`,
  maintain_bull:  (n) => `Maintaining ${n.rating} with a target of ₹${n.tp}. The structural thesis is intact and the print continues to validate our framework.`,
  maintain_bear:  (n) => `Reiterating ${n.rating} at ₹${n.tp}. The risk/reward remains unattractive at current levels; we prefer to wait for a better entry.`,
  target_raise:   (n) => `Raising target to ₹${n.tp} on incremental upside to our estimates. Maintain ${n.rating}.`,
  target_cut:     (n) => `Trimming target to ₹${n.tp} on softer realisations and a slower ramp than modelled. ${n.rating} reiterated.`,
  mixed:          (n) => `Print was mixed; we hold ${n.rating} with target ₹${n.tp} pending more visibility on key drivers.`,
}

const ANGLE_PARAS: Readonly<Record<Note['angle'], readonly string[]>> = {
  initiation: [
    'Demand environment improving — cash + insurance mix tilting up, new specialties opening realisation ceilings. Pricing power returning; volume and tariff levers both contribute to mid-teens growth.',
    'Management execution remains the structural moat. Capex discipline + capital return signal a high-conviction operator. Governance has improved.',
    'Risks to our call: a sharper-than-expected margin disappointment or a regulatory shock. We see the risk-reward favouring the long side over the next 4-6 quarters.',
  ],
  upgrade: [
    'Quarter delivered ahead of consensus and ahead of our prior estimates. Pipeline visibility extended; we lift FY27 estimates.',
    'Operating leverage kicking in as fixed-cost absorption improves. Margin compounding visibility through FY28.',
    'Watchpoints: working capital cycle and incremental capex intensity. Both manageable; we re-rate the multiple.',
  ],
  downgrade: [
    'Print was a mixed bag: top-line broadly in line but execution softness in newer segments dragged margins. We cut FY27 estimates.',
    'Channel checks suggest pricing pressure in core markets is persisting longer than initially expected; downside risk to FY27 realisations.',
    'We move to the sidelines pending clearer evidence of margin stabilisation. Watch the next 1-2 prints for confirmation.',
  ],
  maintain_bull: [
    'Underlying growth drivers remain intact — the latest data points reinforce our prior framework rather than disturb it.',
    'Execution staying ahead of consensus expectations; management commentary on next-leg drivers is constructive.',
    'No meaningful change to estimates; the structural call remains the same.',
  ],
  maintain_bear: [
    'Set-up still unattractive at current levels — valuation is rich versus our growth path and risk-reward is asymmetrically skewed.',
    'Catalysts on the cautious side are tracking; bull-case dependencies look further away than the market is pricing.',
    'We hold rating and target; would need a clear execution surprise to revisit.',
  ],
  target_raise: [
    'Incremental data points (volume, pricing, margin) all skew above our prior. We push FY28 estimates up; PT follows.',
    'Estimate revisions: APE/Revenue +2-4%, EBITDA/VNB +3-5%, PAT +3-4% across FY27-28E.',
    'Risks to the higher target: execution slip-ups in next 1-2 quarters; macro shock that re-rates the sector.',
  ],
  target_cut: [
    'Q4 print missed our estimates on realisations and segment mix; we cut FY27 forecasts to reflect.',
    'Estimate revisions: Revenue -2-3%, EBITDA -3-5%, PAT -4-6% across the forecast period.',
    'Maintain rating but on a lower bar — we want to see execution improve before we move higher.',
  ],
  mixed: [
    'Quarter delivered a mixed read — headline numbers were broadly in line but the segment mix and forward indicators sent conflicting signals.',
    'We hold our rating pending the next print, which should be more diagnostic on near-term margin trajectory.',
    'Risks roughly balanced; we prefer to wait for a clearer set-up.',
  ],
}

function templateBody(note: Note): string {
  const stock = STOCKS[note.stock]
  const broker = BROKERS[note.broker]
  const date = new Date(note.date).toUTCString().replace('GMT', 'GMT')
  const headline = ANGLE_HEADLINE[note.angle](note)
  const paras = ANGLE_PARAS[note.angle].join('\n\n')
  return `---------- Forwarded message ---------
From: Simran Thakkar <simran@beascapital.in>
Date: ${date}
Subject: Fw: [${broker.code}] ${stock.name} (${stock.ticker}) — ${note.rating}, PT ₹${note.tp}
To: Chiraag Kapil <ceekay@muns.io>

------------------------------
*From:* ${broker.senderName}, ${broker.house} <${broker.senderEmail}>
*Sent:* ${date}
*To:* Simran Thakkar <simran@beascapital.in>
*Subject:* [${broker.code}] ${stock.name} (${stock.ticker}) — ${note.rating}, PT ₹${note.tp}

* ------------------------------ *

*${stock.name} (${stock.ticker}) — ${note.rating}, PT ₹${note.tp}*
${headline}

${paras}

Best regards,
*${broker.senderName}*
*Institutional Equities*
*${broker.house}*

This email is intended solely for the recipient.`
}

interface EmailEntry {
  readonly id: string
  readonly forwarded_by_email: string
  readonly original_sender_email: string
  readonly original_sender_name: string
  readonly subject: string
  readonly metadata: { readonly __generated: true }
  readonly text_body: string
  readonly status: 'PROCESSED'
  readonly received_at: string
  readonly created_at: string
  readonly uploads: readonly unknown[]
}

function buildEntry(note: Note): EmailEntry {
  const stock = STOCKS[note.stock]
  const broker = BROKERS[note.broker]
  const subject = `Fwd: Fw: [${broker.code}] ${stock.name} (${stock.ticker}) — ${note.rating}, PT ₹${note.tp}`
  const body = templateBody(note)
  return {
    id: randomUUID(),
    forwarded_by_email: 'ceekay@muns.io',
    original_sender_email: 'simran@beascapital.in',
    original_sender_name: 'Simran Thakkar',
    subject,
    metadata: { __generated: true },
    text_body: body,
    status: 'PROCESSED',
    received_at: note.date,
    created_at: note.date,
    uploads: [
      {
        id: randomUUID(),
        type: 'BODY',
        filename: `-${broker.code}-${stock.ticker}-${note.rating}-PT-${note.tp} body.txt`,
        mime_type: 'text/plain',
        size_bytes: body.length,
        status: 'UPLOADED',
        error: null,
        metadata: {
          ner_results: {
            [stock.ticker]: { tp: String(note.tp), rating: note.rating, ticker: stock.ticker },
            [stock.name]:    { tp: String(note.tp), rating: note.rating, ticker: stock.ticker },
            [broker.house]:  { tp: 'N/A', rating: 'N/A', ticker: 'No match' },
          },
        },
        document: {
          document_id: randomUUID(),
          title: `Email body - ${subject.slice(0, 80)}`,
          file_type: 'txt',
          category: 'filing',
          form: 'email',
          signed_url: '',
        },
      },
    ],
  }
}

// ── Main ────────────────────────────────────────────────────────────────

interface FixtureRoot {
  data: {
    total: number
    page: number
    limit: number
    totalPages: number
    emails: EmailEntry[]
  }
  message: string
  success: boolean
}

const raw = readFileSync(FIXTURE, 'utf8')
const json = JSON.parse(raw) as FixtureRoot

// Drop any previously-generated entries so this script is rerunnable.
const before = json.data.emails.length
json.data.emails = json.data.emails.filter((e) => {
  const meta = e.metadata as { readonly __generated?: boolean } | null | undefined
  return !meta || meta.__generated !== true
})
const removed = before - json.data.emails.length

const generated = NOTES.map(buildEntry)
// Sort generated newest-first to match the existing convention in the
// fixture (which is roughly reverse-chronological).
generated.sort((a, b) => b.received_at.localeCompare(a.received_at))

// Append after the existing entries so the most recent (May 2026) notes
// stay at the top of the list.
json.data.emails = [...json.data.emails, ...generated]
json.data.total = json.data.emails.length
json.data.totalPages = Math.ceil(json.data.emails.length / Math.max(1, json.data.limit))

writeFileSync(FIXTURE, JSON.stringify(json, null, 4) + '\n')

console.log(`extendPreviewFixture: removed ${removed} generated entries, added ${generated.length}. Total now ${json.data.emails.length}.`)
