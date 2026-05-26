// Generates additional forwarded-broker-email entries for the preview
// fixture so the Agreements & disagreements matrix has rich multi-broker
// coverage. Run: `node scripts/generate-dummy-emails.mjs --write`.
//
// Each note's body is composed of one bold intro paragraph (the thesis the
// dashboard picks up) followed by SIX topical paragraphs (one per engine
// dimension: margin / growth / demand / order_book / management /
// timing). Every topical paragraph LEADS with a tight KPI sentence — that
// first sentence is what the matrix cell renders as the bold KPI; the rest
// is the "why" subtitle and the popover excerpt.
//
// To extend: add another entry under STOCKS with `ctx` and `brokers`. Each
// `ctx` carries `<topic>BullKpi / <topic>BullWhy / <topic>BearKpi /
// <topic>BearWhy / <topic>HoldKpi / <topic>HoldWhy`. Every broker covers
// every topic, so the matrix has six rows per stock with bull/bear/agree
// cells coloured by each broker's stance.

import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURE = resolve(HERE, '..', 'src/adapters/serverOutput/previewFixture/emailApiResponse.sample.json')

// ── Broker catalog (domain + display name) ──────────────────────────────
const BROKERS = {
  KOTAK:    { domain: 'kotak.com',    name: 'Kotak Research',       analyst: 'Alankar Garude' },
  AMBIT:    { domain: 'ambit.co',     name: 'Ambit Research',       analyst: 'Sumit Jain' },
  JMFL:     { domain: 'jmfl.com',     name: 'JM Financial',         analyst: 'Nehal Shah' },
  IIFL:     { domain: 'iiflcap.com',  name: 'IIFL Capital',         analyst: 'Naman Bagrecha' },
  NUVAMA:   { domain: 'nuvama.com',   name: 'Nuvama Institutional', analyst: 'Prakash Kapadia' },
  GS:       { domain: 'gs.com',       name: 'Goldman Sachs',        analyst: 'Pulkit Patni' },
  AVENDUS:  { domain: 'avendus.com',  name: 'Avendus Spark',        analyst: 'Krishnan ASV' },
}

// ── Topical paragraph builders ─────────────────────────────────────────
//
// Each builder returns: "<KPI sentence>. <Why clause.>". The cell render
// in StreetMatrix.tsx splits at the first sentence boundary so the KPI
// appears bold on line 1 and the why appears on line 2.

const TOPICS = ['margin', 'growth', 'demand', 'order_book', 'management', 'timing']

// The engine's classifier (src/engine/classifiers.ts) routes a paragraph to
// a DisagreementDimension by matching one of these keywords as a substring.
// If the natural KPI / why text doesn't already mention the dimension's
// keyword, we splice a parenthesised anchor into the KPI so the classifier
// routes correctly — without forcing every analyst sentence to mention
// "margin" or "catalyst" verbatim.
const ANCHOR = {
  margin:     'margin',
  growth:     'growth',
  demand:     'demand',
  order_book: 'order pipeline',
  management: 'management',
  timing:     'catalyst',
}

function topicParagraph(topic, stance, ctx) {
  const key = `${topic}${cap(stance)}`        // e.g. marginBullKpi
  const kpi = ctx[`${key}Kpi`]
  const why = ctx[`${key}Why`]
  if (!kpi || !why) return GENERIC[topic][stance]
  const combined = `${kpi}. ${why}`
  if (combined.toLowerCase().includes(ANCHOR[topic])) return combined
  // Splice the keyword into the KPI so the cell still leads with the
  // headline number; the classifier picks the dimension up from the
  // parenthesised anchor.
  return `${kpi} (${ANCHOR[topic]}). ${why}`
}

function cap(s) { return s[0].toUpperCase() + s.slice(1) }

// Generic fallback paragraphs (used only when a stock omits a KPI for a
// stance — they keep the matrix populated but read as filler).
const GENERIC = {
  margin: {
    bull: 'Margin trajectory improving — EBITDA margin ~50 bps better than peers',
    bear: 'Margin compression a real risk — EBITDA margin trending below guide',
    hold: 'Margin range-bound — EBITDA margin steady through the cycle',
  },
  growth: {
    bull: 'Growth runway intact — revenue trajectory at high-teens CAGR',
    bear: 'Growth normalising — revenue trajectory cools to mid-single-digits',
    hold: 'Growth steady — revenue trajectory in line with consensus',
  },
  demand: {
    bull: 'Demand environment improving — pricing power returning',
    bear: 'Demand softness persists — pricing pressure intensifying',
    hold: 'Demand mix neutral — pricing flat through the year',
  },
  order_book: {
    bull: 'Order book strong — pipeline visibility extends 24 months',
    bear: 'Order book cooling — backlog conversion stretching',
    hold: 'Order book steady — book-to-bill at ~1.0x',
  },
  management: {
    bull: 'Management execution exemplary — capex discipline best-in-class',
    bear: 'Management execution gaps showing — capex discipline slipping',
    hold: 'Management execution steady — capex discipline in line',
  },
  timing: {
    bull: 'Catalyst slate stacks well — clear inflection within two quarters',
    bear: 'Catalyst path slipping — rate cut benefit deferred',
    hold: 'Catalyst calendar light — no near-term inflection',
  },
}

// ── Stock contexts ─────────────────────────────────────────────────────
// Each stock defines KPI + why for every (topic, stance) it cares about.
// Generic fallbacks fill the gaps. Each broker has a stance (bull/bear/
// hold), a rating string, and a TP — they all cover all six topics.

const STOCKS = [
  // ── KIMS — hospital chain; margin + execution are the swing factors.
  {
    ticker: 'KIMS',
    name: 'Krishna Institute of Medical Sciences',
    ctx: {
      marginBullKpi:    'EBITDA margin to 22.8% by FY28E (+360 bps)',
      marginBullWhy:    'Mature hospitals at ~29%; AP/Telangana ramp covers new-unit drag.',
      marginBearKpi:    'EBITDA margin stuck at 19.2% (-560 bps yoy)',
      marginBearWhy:    "Thane / Bengaluru / Nashik new units bleed; insurance empanelment slipping.",
      marginHoldKpi:    'EBITDA margin range-bound at ~20%',
      marginHoldWhy:    'Mature-unit margin gains offset by new-unit drag through FY27.',

      growthBullKpi:    'Revenue CAGR of 24% over FY26-29E',
      growthBullWhy:    'ARPOB growth at 14% yoy + 600 new beds across AP/TG/MH.',
      growthBearKpi:    'Revenue CAGR 13% — half what bulls model',
      growthBearWhy:    'Occupancy at new units lags; empanelment delays bite into FY27.',
      growthHoldKpi:    'Revenue CAGR 18% — steady but unspectacular',
      growthHoldWhy:    'Bed addition on track; ARPOB compounds at low-teens.',

      demandBullKpi:    'ARPOB ↑ 6% CAGR through FY29E',
      demandBullWhy:    'Cash + insurance mix tilting up; new specialties lift realisation.',
      demandBearKpi:    'ARPOB growth slows to ~3%',
      demandBearWhy:    'Competitive pressure from Apollo, Manipal across South India.',
      demandHoldKpi:    'ARPOB compounds at ~4% — in line with sector',
      demandHoldWhy:    'Pricing levers limited; volume drives the print.',

      order_bookBullKpi:'Pipeline of 4 new units; +600 beds by FY28',
      order_bookBullWhy:'Nashik, Thane, Mahadevapura, Electronic City — all in commissioning.',
      order_bookBearKpi:'Bed addition slipping; commissioning behind plan',
      order_bookBearWhy:'Insurance empanelment is the binding constraint; ramp-up stretched.',
      order_bookHoldKpi:'Bed pipeline intact at 4 units',
      order_bookHoldWhy:'Execution paces are now the only swing factor.',

      managementBullKpi:'QIP of ~₹15bn to deleverage + inorganic optionality',
      managementBullWhy:'Capital return discipline; ₹10bn debt reduction signalled.',
      managementBearKpi:'Three commissioning delays in six months',
      managementBearWhy:'Execution credibility weakening; capex slipping.',
      managementHoldKpi:'Management execution in line with prior guide',
      managementHoldWhy:'No material slippage; QIP timing the only watch.',

      timingBullKpi:    'Electronic City break-even within 2 quarters',
      timingBullWhy:    'QIP closure + insurance empanelment milestones near.',
      timingBearKpi:    'Insurance empanelment timeline pushed another 2 quarters',
      timingBearWhy:    'FV unchanged at ₹695; downgrade to REDUCE.',
      timingHoldKpi:    'Catalyst calendar light through 1HFY27',
      timingHoldWhy:    'QIP and empanelment are the only near-term triggers.',
    },
    brokers: [
      { code: 'AMBIT',  stance: 'bull', rating: 'BUY',    tp: 880 },
      { code: 'JMFL',   stance: 'bull', rating: 'ADD',    tp: 820 },
      { code: 'NUVAMA', stance: 'bear', rating: 'SELL',   tp: 650 },
    ],
  },

  // ── HDFC Life — five-broker matrix mirroring the user's VNB / Bima Sugam reference.
  {
    ticker: 'HDFCLIFE',
    name: 'HDFC Life Insurance',
    ctx: {
      marginBullKpi:    'VNB margin to 28.6% by FY27E (+180 bps)',
      marginBullWhy:    'Higher non-par share + bancassurance productivity gains.',
      marginBearKpi:    'VNB margin compresses to 27.4% (-120 bps)',
      marginBearWhy:    "IRDAI commission caps + bancassurance pricing pressure won't ease.",
      marginHoldKpi:    'VNB margin range-bound at ~27.8%',
      marginHoldWhy:    'Mix shift offsets regulatory drag; net change limited.',

      growthBullKpi:    'APE CAGR 17% over FY26-29E',
      growthBullWhy:    'Non-par + ULIP traction; tier-2 / tier-3 retail accelerating.',
      growthBearKpi:    'APE growth cools to 10%',
      growthBearWhy:    'LTCG alignment puts 5-8% of new business at risk; ULIP de-rates.',
      growthHoldKpi:    'APE CAGR 13% — steady through the cycle',
      growthHoldWhy:    'Mix shift offsets regulatory headwinds; no inflection.',

      demandBullKpi:    'Tier-2 / 3 retail demand +15% YoY',
      demandBullWhy:    'Agency channel productivity up; Bima Sugam expands TAM medium-term.',
      demandBearKpi:    'Persistency slips to ~85%',
      demandBearWhy:    'Bima Sugam structurally disintermediates distributors; pricing erodes.',
      demandHoldKpi:    'Persistency holding at 87%',
      demandHoldWhy:    'Pricing pressure offset by digital channel productivity.',

      order_bookBullKpi:'Embedded value CAGR 18%',
      order_bookBullWhy:'Persistency above 87%; new-business volume strong.',
      order_bookBearKpi:'EV growth slips to low-teens',
      order_bookBearWhy:'Persistency may de-rate as Bima Sugam compresses adviser economics.',
      order_bookHoldKpi:'EV growth at ~14% — sector-average',
      order_bookHoldWhy:'New-business steady; persistency holds.',

      managementBullKpi:'Capital management exemplary — best-in-class',
      managementBullWhy:'Capex discipline + governance among the strongest in life sector.',
      managementBearKpi:'Regulation commentary underplays structural risk',
      managementBearWhy:'Governance broadly OK but strategic response to Bima Sugam unclear.',
      managementHoldKpi:'Management execution steady',
      managementHoldWhy:'Capital allocation in line with guide; no slippage.',

      timingBullKpi:    'Non-par margin expansion drives 2QFY27 re-rating',
      timingBullWhy:    'Bima Sugam tailwind kicks in FY28; TAM expansion priced in.',
      timingBearKpi:    'LTCG headwind hits APE in 2QFY27',
      timingBearWhy:    'Re-rating window pushed to FY28; de-rating extends.',
      timingHoldKpi:    'Catalyst calendar quiet through FY27',
      timingHoldWhy:    'Regulatory clarity is the only swing factor.',
    },
    brokers: [
      { code: 'JMFL',   stance: 'bull', rating: 'BUY',  tp: 780 },
      { code: 'KOTAK',  stance: 'bull', rating: 'BUY',  tp: 760 },
      { code: 'NUVAMA', stance: 'bear', rating: 'SELL', tp: 580 },
      { code: 'IIFL',   stance: 'hold', rating: 'HOLD', tp: 680 },
      { code: 'AMBIT',  stance: 'bull', rating: 'ADD',  tp: 740 },
    ],
  },

  // ── Maruti — auto cycle: demand + EV roadmap are the swing factors.
  {
    ticker: 'MARUTI',
    name: 'Maruti Suzuki India',
    ctx: {
      marginBullKpi:    'EBITDA margin ↑ 80 bps to 11.5% by FY27E',
      marginBullWhy:    'Mix shift to UVs + cost programme drives the uplift.',
      marginBearKpi:    'EBITDA margin ↓ 90 bps to 10.0%',
      marginBearWhy:    'Entry-hatchback pricing aggression drags realisation.',
      marginHoldKpi:    'EBITDA margin steady at 11.0%',
      marginHoldWhy:    'Mix vs discount tug-of-war keeps margins range-bound.',

      growthBullKpi:    'Volume CAGR 12% over FY26-29E',
      growthBullWhy:    'UV penetration + CNG demand + export tailwind underestimated.',
      growthBearKpi:    'Volume CAGR slows to 5%',
      growthBearWhy:    'Entry-hatchback share losses persist; urban slowdown bites.',
      growthHoldKpi:    'Volume CAGR 8% — steady',
      growthHoldWhy:    'UV growth offsets entry-hatchback weakness.',

      demandBullKpi:    'Festive bookings +18% YoY',
      demandBullWhy:    'Rural demand returning; UV mix strong.',
      demandBearKpi:    'Sub-₹6L pricing pressure intensifies',
      demandBearWhy:    'Tata, Hyundai launches squeeze share; volume won\'t compensate.',
      demandHoldKpi:    'Demand mix balanced — rural up, urban soft',
      demandHoldWhy:    'Festive will be the test; tariff levers limited.',

      order_bookBullKpi:'Order book at 8 weeks of cover',
      order_bookBullWhy:'Brezza, Grand Vitara, Fronx waitlists sustaining.',
      order_bookBearKpi:'Order book halved over two quarters',
      order_bookBearWhy:'Cancellations rising; waitlists shrinking.',
      order_bookHoldKpi:'Order book at 6 weeks of cover',
      order_bookHoldWhy:'Steady but no surprise; execution paces the swing.',

      managementBullKpi:'Capex discipline through EV transition',
      managementBullWhy:'Capital return guidance maintained; governance solid.',
      managementBearKpi:'EV roadmap execution underwhelms',
      managementBearWhy:'Pace lags Tata Motors / Hyundai; capex slipping.',
      managementHoldKpi:'Management execution in line',
      managementHoldWhy:'No material slippage; EV pace the watch.',

      timingBullKpi:    'New Brezza launch + Suzuki EV platform in FY27',
      timingBullWhy:    'Catalyst slate stacks; clear inflection in 2HFY27.',
      timingBearKpi:    'Rural retail trough pushed another quarter',
      timingBearWhy:    'Festive will be the test; ramp deferred.',
      timingHoldKpi:    'Catalyst calendar light through 1HFY27',
      timingHoldWhy:    'EV transition is the only swing factor.',
    },
    brokers: [
      { code: 'KOTAK',  stance: 'bull', rating: 'BUY',  tp: 14500 },
      { code: 'JMFL',   stance: 'bear', rating: 'SELL', tp: 11200 },
      { code: 'GS',     stance: 'hold', rating: 'HOLD', tp: 12800 },
      { code: 'IIFL',   stance: 'bull', rating: 'BUY',  tp: 13900 },
    ],
  },

  // ── TCS — BFSI deal TCV + discretionary spend the debate.
  {
    ticker: 'TCS',
    name: 'Tata Consultancy Services',
    ctx: {
      marginBullKpi:    'EBIT margin to 25.5% by FY27E (+100 bps)',
      marginBullWhy:    'Pyramid optimisation + utilisation gains; offshore mix higher.',
      marginBearKpi:    'EBIT margin range-bound at 24.6%',
      marginBearWhy:    'Wage hike + pricing pressure offset utilisation gains.',
      marginHoldKpi:    'EBIT margin steady at 25.0%',
      marginHoldWhy:    'Mix vs wage tug-of-war keeps margins flat.',

      growthBullKpi:    'Revenue CAGR 10% in CC terms',
      growthBullWhy:    'BFSI deal TCV accelerating; GenAI attach drives incremental growth.',
      growthBearKpi:    'Revenue CAGR slows to 4% CC',
      growthBearWhy:    'BFSI + retail discretionary pullback lingers through FY27.',
      growthHoldKpi:    'Revenue CAGR 7% CC — steady through cycle',
      growthHoldWhy:    'BFSI stabilising; GenAI attach offsets discretionary weakness.',

      demandBullKpi:    'Deal renewal pricing +3-5% YoY',
      demandBullWhy:    'AI-related TAM lifts pricing; deal mix shifting up.',
      demandBearKpi:    'Pricing flat in commoditised verticals',
      demandBearWhy:    'Clients pushing back on rate cards; competitive intensity high.',
      demandHoldKpi:    'Pricing power neutral',
      demandHoldWhy:    'Deal mix improving but commoditised verticals drag.',

      order_bookBullKpi:'Deal TCV at $13bn quarterly run-rate',
      order_bookBullWhy:'Mega-deal pipeline 30% bigger YoY; conversion clean.',
      order_bookBearKpi:'Book-to-bill below 1.0x for the first time since FY23',
      order_bookBearWhy:'Deal ramp slower; conversion stretching.',
      order_bookHoldKpi:'Deal TCV at $11bn run-rate — steady',
      order_bookHoldWhy:'Mega-deals pipeline OK; smaller deals shrinking.',

      managementBullKpi:'Capex discipline + ₹17k cr buyback signal',
      managementBullWhy:'Capital return commentary inspires confidence.',
      managementBearKpi:'Leadership transition pace a question',
      managementBearWhy:'Execution credibility under watch; succession unclear.',
      managementHoldKpi:'Management execution steady',
      managementHoldWhy:'Capex in line with guide; succession proceeding.',

      timingBullKpi:    'GenAI attach inflection in FY27',
      timingBullWhy:    'Multiple mega-deal closures pending in BFSI; clear ramp.',
      timingBearKpi:    'BFSI discretionary trough pushed another quarter',
      timingBearWhy:    'Rate cut benefit deferred; ramp slips to FY28.',
      timingHoldKpi:    'Catalyst calendar mixed',
      timingHoldWhy:    'BFSI ramp the only meaningful swing factor.',
    },
    brokers: [
      { code: 'KOTAK',   stance: 'bull', rating: 'BUY',  tp: 4500 },
      { code: 'JMFL',    stance: 'bull', rating: 'BUY',  tp: 4400 },
      { code: 'AMBIT',   stance: 'hold', rating: 'HOLD', tp: 4100 },
      { code: 'AVENDUS', stance: 'bear', rating: 'SELL', tp: 3800 },
    ],
  },

  // ── HDFC Bank — deposit franchise + NIM the debate.
  {
    ticker: 'HDFCBANK',
    name: 'HDFC Bank',
    ctx: {
      marginBullKpi:    'NIM to 3.65% by FY27E (+20 bps)',
      marginBullWhy:    'Cost-of-deposits rolling down; merger drag fading.',
      marginBearKpi:    'NIM compresses to 3.30% (-15 bps)',
      marginBearWhy:    "Wholesale funding sticky; cost-of-deposits won't roll.",
      marginHoldKpi:    'NIM steady at 3.45%',
      marginHoldWhy:    'Funding mix shift offsets repricing drag.',

      growthBullKpi:    'Credit growth +15% YoY',
      growthBullWhy:    'Retail + SME book accelerating; deposits granularising.',
      growthBearKpi:    'Credit growth slows to 9%',
      growthBearWhy:    "Deposit growth lags credit; balance sheet won't compound.",
      growthHoldKpi:    'Credit growth 12% — sector-average',
      growthHoldWhy:    'Balanced book; no inflection.',

      demandBullKpi:    'Retail demand resilient; asset quality holding',
      demandBullWhy:    'Secured retail mix improving; credit cost ~50 bps.',
      demandBearKpi:    'Unsecured retail stress visible',
      demandBearWhy:    'Credit cost normalisation a real risk into FY27.',
      demandHoldKpi:    'Demand mix balanced',
      demandHoldWhy:    'Secured book steady; unsecured stress contained.',

      order_bookBullKpi:'CASA pipeline strong post-merger',
      order_bookBullWhy:'Granular deposit franchise rebuilding; CASA ratio recovering.',
      order_bookBearKpi:'CASA ratio recovery slower than guide',
      order_bookBearWhy:'Wholesale dependence persists; deposit mix sticky.',
      order_bookHoldKpi:'CASA ratio at 38% — steady',
      order_bookHoldWhy:'Branch productivity gains offset wholesale drag.',

      managementBullKpi:'Management transition handled cleanly',
      managementBullWhy:'Capex / branch expansion discipline intact post-merger.',
      managementBearKpi:'Merger-integration commentary aspirational',
      managementBearWhy:'Governance fine but pace of integration disappoints.',
      managementHoldKpi:'Management execution steady',
      managementHoldWhy:'Integration on track but no surprise upside.',

      timingBullKpi:    'Rate cut benefit kicks in 2HFY27',
      timingBullWhy:    'Deposit franchise inflects with branch productivity.',
      timingBearKpi:    'NIM trough timing pushed to FY28',
      timingBearWhy:    'Rate cut benefit deferred; re-rating slips.',
      timingHoldKpi:    'Rate cycle benefit timing uncertain',
      timingHoldWhy:    'Deposit growth pace the swing factor.',
    },
    brokers: [
      { code: 'KOTAK',  stance: 'bull', rating: 'BUY',  tp: 2100 },
      { code: 'JMFL',   stance: 'bull', rating: 'BUY',  tp: 2050 },
      { code: 'NUVAMA', stance: 'hold', rating: 'HOLD', tp: 1820 },
      { code: 'IIFL',   stance: 'bear', rating: 'SELL', tp: 1550 },
    ],
  },

  // ── Infosys — pure-play IT services, debate on deal-mix + utilisation.
  {
    ticker: 'INFY',
    name: 'Infosys',
    ctx: {
      marginBullKpi:    'EBIT margin to 22.0% by FY27E (+150 bps)',
      marginBullWhy:    'Utilisation gains + pyramid optimisation drive the uplift.',
      marginBearKpi:    'EBIT margin range-bound at 20.5%',
      marginBearWhy:    'Wage hikes + sub-contractor cost offset utilisation gains.',
      marginHoldKpi:    'EBIT margin steady at 21.2%',
      marginHoldWhy:    'Cost levers vs wage offset; margin sideways.',

      growthBullKpi:    'Revenue CAGR 9% CC over FY26-29E',
      growthBullWhy:    'Large-deal TCV at $4.5bn; GenAI attach drives incremental.',
      growthBearKpi:    'Revenue growth cools to 4% CC',
      growthBearWhy:    'BFSI + retail spend pullback; smaller deals shrinking.',
      growthHoldKpi:    'Revenue CAGR 6% CC',
      growthHoldWhy:    'Large deals offset smaller-deal weakness.',

      demandBullKpi:    'AI-related TAM lifts pricing 4-6%',
      demandBullWhy:    'Pricing power returning in renewals; deal mix shifting up.',
      demandBearKpi:    'Pricing flat to down in commoditised verticals',
      demandBearWhy:    'Clients pushing rate cards lower; competitive intensity high.',
      demandHoldKpi:    'Pricing neutral — mix offsets pressure',
      demandHoldWhy:    'AI deals lifting but commoditised IT services drag.',

      order_bookBullKpi:'Large-deal TCV at $4.5bn quarterly',
      order_bookBullWhy:'Pipeline 25% bigger YoY; mega-deal conversion strong.',
      order_bookBearKpi:'Book-to-bill ratio slipping below 1.0x',
      order_bookBearWhy:'Deal ramp slower; small-deal bookings weaken.',
      order_bookHoldKpi:'Deal TCV steady at $3.8bn',
      order_bookHoldWhy:'Mega-deals OK; smaller deals the swing.',

      managementBullKpi:'CEO succession proceeding cleanly',
      managementBullWhy:'Capital return + dividend policy maintained.',
      managementBearKpi:'CEO transition pace adds execution risk',
      managementBearWhy:'Capex discipline OK but strategic clarity lacking.',
      managementHoldKpi:'Management execution steady',
      managementHoldWhy:'Succession in motion; no material slippage.',

      timingBullKpi:    'BFSI deal ramp + GenAI attach in FY27',
      timingBullWhy:    'Multiple BFSI mega-deals near closure; clear inflection.',
      timingBearKpi:    'BFSI discretionary trough deferred to FY28',
      timingBearWhy:    'Rate cut benefit slips; ramp pushed out.',
      timingHoldKpi:    'Catalyst calendar mixed',
      timingHoldWhy:    'BFSI ramp the only meaningful swing.',
    },
    brokers: [
      { code: 'JMFL',    stance: 'bull', rating: 'BUY',  tp: 1900 },
      { code: 'KOTAK',   stance: 'bull', rating: 'BUY',  tp: 1850 },
      { code: 'NUVAMA',  stance: 'hold', rating: 'HOLD', tp: 1680 },
      { code: 'AMBIT',   stance: 'bear', rating: 'SELL', tp: 1450 },
      { code: 'AVENDUS', stance: 'bull', rating: 'ADD',  tp: 1820 },
    ],
  },
]

// ── Email entry builder ────────────────────────────────────────────────

function ratingFromCall(call) {
  const map = { BUY: 'Buy', ADD: 'Add', HOLD: 'Hold', NEUTRAL: 'Hold', REDUCE: 'Reduce', SELL: 'Sell' }
  return map[call] ?? 'Hold'
}

function bodyFor(stock, broker, stance) {
  const intro = stanceIntro(stance, stock, broker)
  const paras = TOPICS.map((t) => topicParagraph(t, stance, stock.ctx))
  const close = stanceClose(stance)
  return [intro, ...paras, close].join('\n\n')
}

function stanceIntro(stance, stock, broker) {
  const r = ratingFromCall(broker.rating)
  const tp = broker.tp.toLocaleString()
  if (stance === 'bull') {
    return `*${stock.name} (${stock.ticker}) — ${broker.rating}, PT ₹${tp}*\nWe stay constructive on ${stock.ticker}. The set-up is favourable: margin trajectory is improving, growth pipeline is intact, demand environment is recovering and management execution remains the structural anchor. We rate ${r} with a target of ₹${tp}.`
  }
  if (stance === 'bear') {
    return `*${stock.name} (${stock.ticker}) — ${broker.rating}, PT ₹${tp}*\nWe stay cautious on ${stock.ticker}. The risk-reward looks unattractive into FY27: margin compression risks are underappreciated, growth normalisation is biting, demand softness persists and the catalyst path keeps slipping. We rate ${r} with a target of ₹${tp}.`
  }
  return `*${stock.name} (${stock.ticker}) — ${broker.rating}, PT ₹${tp}*\nWe maintain a balanced view on ${stock.ticker}. The fundamentals are steady but the next leg of re-rating needs a sharper catalyst than we see today. We rate ${r} with a target of ₹${tp}.`
}

function stanceClose(stance) {
  if (stance === 'bull') {
    return 'Key risks: a sharper-than-expected demand disappointment or a margin surprise.'
  }
  if (stance === 'bear') {
    return 'Key risks: a sharper-than-expected demand recovery or a cost programme overshoot.'
  }
  return 'Key risks two-way: demand or margin surprise positively, or guidance is cut at 2QFY27.'
}

function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '.') }

function buildEmail(stock, broker, receivedAt) {
  const id = randomUUID()
  const uploadId = randomUUID()
  const docId = randomUUID()
  const bk = BROKERS[broker.code]
  const stance = broker.stance
  const subjectStem = `[${broker.code}] ${stock.name} (${stock.ticker}) — ${broker.rating}, PT ₹${broker.tp.toLocaleString()}`
  const subject = `Fwd: Fw: ${subjectStem}`
  const inner = bodyFor(stock, broker, stance)
  // No "Regards," in the forwarding wrapper — the dashboard's text
  // extractor treats that as a sign-off and stops reading prose.
  const text_body = [
    `---------- Forwarded message ---------`,
    `From: Simran Thakkar <simran@beascapital.in>`,
    `Date: ${new Date(receivedAt).toUTCString()}`,
    `Subject: Fw: ${subjectStem}`,
    `To: Chiraag Kapil <ceekay@muns.io>`,
    ``,
    `------------------------------`,
    `*From:* ${bk.analyst}, ${bk.name} <${slug(bk.analyst)}@${bk.domain}>`,
    `*Sent:* ${new Date(receivedAt).toUTCString()}`,
    `*To:* Simran Thakkar <simran@beascapital.in>`,
    `*Subject:* ${subjectStem}`,
    ``,
    `* ------------------------------ *`,
    ``,
    inner,
    ``,
    `Best regards,`,
    `*${bk.analyst}*`,
    `*Institutional Equities*`,
    `*${bk.name}*`,
    ``,
    `This email is intended solely for the recipient.`,
  ].join('\n')

  return {
    id,
    forwarded_by_email: 'ceekay@muns.io',
    original_sender_email: 'simran@beascapital.in',
    original_sender_name: 'Simran Thakkar',
    subject,
    metadata: null,
    text_body,
    status: 'PROCESSED',
    received_at: receivedAt,
    created_at: receivedAt,
    uploads: [
      {
        id: uploadId,
        type: 'BODY',
        filename: `${subjectStem.replace(/[^a-zA-Z0-9]+/g, '-')} body.txt`,
        mime_type: 'text/plain',
        size_bytes: text_body.length,
        status: 'UPLOADED',
        error: null,
        metadata: {
          ner_results: {
            [stock.ticker]: { tp: String(broker.tp), rating: broker.rating, ticker: stock.ticker },
            [stock.name]:   { tp: String(broker.tp), rating: broker.rating, ticker: stock.ticker },
            [bk.name]:      { tp: 'N/A', rating: 'N/A', ticker: 'No match' },
          },
        },
        document: {
          document_id: docId,
          title: `Email body - ${subject.slice(0, 60)}`,
          file_type: 'txt',
          category: 'filing',
          form: 'email',
          signed_url: '',
        },
      },
    ],
  }
}

// ── Main: build all entries, write or print ────────────────────────────

function main() {
  const entries = []
  const NOW = Date.UTC(2026, 4, 25, 12, 0, 0)
  let cursor = NOW
  for (const stock of STOCKS) {
    for (const broker of stock.brokers) {
      cursor -= 8 * 60 * 60 * 1000 // 8 hours apart
      const iso = new Date(cursor).toISOString()
      entries.push(buildEmail(stock, broker, iso))
    }
  }

  // Sort newest-first so the resulting JSON reads naturally.
  entries.sort((a, b) => b.received_at.localeCompare(a.received_at))

  if (process.argv.includes('--write')) {
    const raw = readFileSync(FIXTURE, 'utf8')
    const parsed = JSON.parse(raw)
    // Drop any previously-generated entries (their subjects all use the
    // signature "[CODE] <Name> (<TICKER>) — <Rating>, PT ₹..." pattern with
    // an uppercase broker tag) so reruns don't pile up duplicates.
    const SIG = /^Fwd: Fw: \[(?:KOTAK|AMBIT|JMFL|IIFL|NUVAMA|GS|AVENDUS)\] /
    parsed.data.emails = parsed.data.emails.filter((e) => !SIG.test(String(e.subject ?? '')))
    parsed.data.emails = [...entries, ...parsed.data.emails]
    parsed.data.total = parsed.data.emails.length
    writeFileSync(FIXTURE, JSON.stringify(parsed, null, 4) + '\n')
    console.log(`Inserted ${entries.length} entries into ${FIXTURE}`)
    console.log(`New total: ${parsed.data.total}`)
  } else {
    console.log(JSON.stringify(entries, null, 2))
  }
}

main()
