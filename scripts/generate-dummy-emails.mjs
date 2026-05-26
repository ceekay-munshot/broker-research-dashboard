// Generates additional forwarded-broker-email entries for the preview
// fixture so the Agreements & disagreements matrix has rich multi-broker
// coverage. Run: `node scripts/generate-dummy-emails.mjs`.
//
// Output: a JSON array of email entries that can be pasted into
// src/adapters/serverOutput/previewFixture/emailApiResponse.sample.json's
// data.emails[]. The script also splices the entries into the fixture in
// place when called with --write.
//
// The body text deliberately uses topical keywords ("margin", "growth",
// "demand", "order book", "management") so the dashboard's classifier
// extracts disagreement dimensions per stock.

import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURE = resolve(HERE, '..', 'src/adapters/serverOutput/previewFixture/emailApiResponse.sample.json')

// ── Broker catalog (domain + display name) ──────────────────────────────
const BROKERS = {
  KOTAK:     { domain: 'kotak.com',     name: 'Kotak Research',      analyst: 'Alankar Garude' },
  AMBIT:     { domain: 'ambit.co',      name: 'Ambit Research',      analyst: 'Sumit Jain' },
  JMFL:      { domain: 'jmfl.com',      name: 'JM Financial',        analyst: 'Nehal Shah' },
  IIFL:      { domain: 'iiflcap.com',   name: 'IIFL Capital',        analyst: 'Naman Bagrecha' },
  NUVAMA:    { domain: 'nuvama.com',    name: 'Nuvama Institutional', analyst: 'Prakash Kapadia' },
  GS:        { domain: 'gs.com',        name: 'Goldman Sachs',       analyst: 'Pulkit Patni' },
  AVENDUS:   { domain: 'avendus.com',   name: 'Avendus Spark',       analyst: 'Krishnan ASV' },
}

// ── Body-paragraph builders ────────────────────────────────────────────
//
// Each builder takes a stance ("bull" | "bear" | "hold") and returns a
// 60-180 char paragraph that mentions the topical keyword(s). The
// dashboard's classifier matches on substring → DisagreementDimension.

function marginParagraph(stance, ctx) {
  if (stance === 'bull') {
    return `Margin tailwind from ${ctx.marginBull}. EBITDA margin expands ${ctx.marginExpBps} bps over the next two years; operating margin compounding from here.`
  }
  if (stance === 'bear') {
    return `Margin compression looks structural — ${ctx.marginBear}. EBITDA margin contracts ${ctx.marginConBps} bps; operating margin won't snap back as cleanly as bulls model.`
  }
  return `Margin trajectory range-bound. EBITDA margin trends sideways at ${ctx.marginHold}% as ${ctx.marginNeutral} offsets pricing levers.`
}

function growthParagraph(stance, ctx) {
  if (stance === 'bull') {
    return `Growth runway intact — ${ctx.growthBull}. Revenue trajectory clocks ${ctx.growthBullPct}% CAGR over FY26-29E; deal TCV / order pipeline still accelerating.`
  }
  if (stance === 'bear') {
    return `Growth normalising hard — ${ctx.growthBear}. Revenue trajectory cools to ${ctx.growthBearPct}% CAGR; discretionary spend pullback isn't a quarter problem.`
  }
  return `Growth steady but unspectacular at ${ctx.growthHoldPct}% CAGR; we see neither inflection nor breakage.`
}

function demandParagraph(stance, ctx) {
  if (stance === 'bull') {
    return `Demand environment improving — ${ctx.demandBull}. Pricing power returning; volume and tariff levers both contribute to ${ctx.demandBullPct}% sales growth.`
  }
  if (stance === 'bear') {
    return `Demand softness persists — ${ctx.demandBear}. Pricing pressure intensifies, competitive dynamics worsen; volume won't compensate.`
  }
  return `Demand mix neutral — rural recovery offsets urban slowdown; pricing flat. Tariff increases unlikely in the near term.`
}

function orderBookParagraph(stance, ctx) {
  if (stance === 'bull') {
    return `Order book / backlog steady-state at ${ctx.orderBull}; pipeline visibility extends ${ctx.orderBullMonths} months. Execution-led re-rating likely.`
  }
  if (stance === 'bear') {
    return `Order book run-rate cooling — ${ctx.orderBear}. Backlog conversion stretching; revenue book-to-bill below 1.0x for the first time in eight quarters.`
  }
  return `Order book flat at ${ctx.orderHold}; book-to-bill ~1.0x. Execution paces are the only meaningful swing factor from here.`
}

function managementParagraph(stance, ctx) {
  if (stance === 'bull') {
    return `Management execution remains the structural moat — ${ctx.mgmtBull}. Capex discipline + capital return signal a high-conviction operator. Governance has improved.`
  }
  if (stance === 'bear') {
    return `Management execution gaps are showing — ${ctx.mgmtBear}. Capex discipline slipping; capital return commentary lacks credibility.`
  }
  return `Management track record is steady — execution in line with prior guidance; no material slippage on capex.`
}

function timingParagraph(stance, ctx) {
  if (stance === 'bull') {
    return `Catalyst slate stacks well — ${ctx.catalystBull}. We see the launch / ramp drive a clear earnings inflection in 2QFY27.`
  }
  if (stance === 'bear') {
    return `Catalyst path slipping — ${ctx.catalystBear}. The much-anticipated trough is being pushed out another quarter; rate cut benefit deferred.`
  }
  return `Catalyst calendar light over the next two quarters; we see no near-term inflection.`
}

// ── Stock contexts ─────────────────────────────────────────────────────
// Each stock defines context strings used by the paragraph builders, plus
// the broker views to generate. Stance maps to rating + TP per broker.

const STOCKS = [
  // ── KIMS already has 2 brokers (Kotak Reduce + a fwd of same).
  // Adding 3 fresh broker views with material disagreement.
  {
    ticker: 'KIMS',
    name: 'Krishna Institute of Medical Sciences',
    ctx: {
      marginBull: 'mature hospitals at ~29% margin and AP/Telangana ramp',
      marginExpBps: '160',
      marginBear: 'new-unit losses (Thane, Bengaluru, Nashik) stretch break-even another 6 quarters',
      marginConBps: '120',
      marginHold: '20',
      marginNeutral: 'mix shift',
      growthBull: 'ARPOB growth at 14% yoy and bed addition plans on track',
      growthBullPct: '24',
      growthBear: 'insurance empanelment delays at new units bite into FY27 occupancy',
      growthBearPct: '13',
      growthHoldPct: '18',
      demandBull: 'cash + insurance mix tilting up, new specialties opening realisation ceilings',
      demandBullPct: '21',
      demandBear: 'competitive pressure from Apollo and Manipal across South India intensifies',
      orderBull: 'pipeline of 4 new units (Nashik, Thane, Mahadevapura, Electronic City)',
      orderBullMonths: '24',
      orderBear: 'commissioning slipping; insurance empanelment is the binding constraint',
      orderHold: '4 units in pipeline',
      mgmtBull: 'QIP of ~₹15bn to deleverage and create headroom for inorganic optionality is disciplined',
      mgmtBear: 'execution credibility weakening — three commissioning delays in last six months',
      catalystBull: '24/7 break-even at Electronic City within two quarters; QIP closure',
      catalystBear: 'insurance empanelment timeline keeps slipping; FV unchanged at ₹695',
    },
    brokers: [
      { code: 'AMBIT',  stance: 'bull', rating: 'BUY',  tp: 880, focusTopics: ['margin','growth','management'] },
      { code: 'JMFL',   stance: 'bull', rating: 'ADD',  tp: 820, focusTopics: ['growth','demand','order_book'] },
      { code: 'NUVAMA', stance: 'bear', rating: 'SELL', tp: 650, focusTopics: ['margin','timing','management'] },
    ],
  },

  // ── HDFCLIFE — five-broker matrix to mirror the user's VNB / Bima Sugam screenshot.
  {
    ticker: 'HDFCLIFE',
    name: 'HDFC Life Insurance',
    ctx: {
      marginBull: 'higher non-par share in product mix lifts VNB margin to 28.6% by FY27E',
      marginExpBps: '180',
      marginBear: 'IRDAI commission caps compress VNB margin to 27.4%; bancassurance competition won\'t ease',
      marginConBps: '120',
      marginHold: '27.8',
      marginNeutral: 'product mix shift',
      growthBull: 'APE growth runway at 15%+ on non-par + ULIP traction',
      growthBullPct: '17',
      growthBear: 'LTCG alignment on ULIPs puts 5-8% of new business at risk; APE growth de-rates',
      growthBearPct: '10',
      growthHoldPct: '13',
      demandBull: 'tier-2/tier-3 retail demand re-accelerating; agency channel productivity up',
      demandBullPct: '15',
      demandBear: 'Bima Sugam structurally disintermediates distributors; pricing power erodes',
      orderBull: 'embedded value build at 18% CAGR; persistency holding above 87%',
      orderBullMonths: '36',
      orderBear: 'persistency may de-rate as Bima Sugam compresses adviser economics',
      orderHold: 'EV growth at low-teens',
      mgmtBull: 'capital management exemplary; capex discipline best-in-class among life players',
      mgmtBear: 'commentary on regulation underplays the structural risk; governance broadly OK',
      catalystBull: 'Bima Sugam medium-term enlarges TAM; non-par margin expansion is the near-term catalyst',
      catalystBear: 'LTCG headwind hits APE in 2QFY27; re-rating window pushed out',
    },
    brokers: [
      { code: 'JMFL',   stance: 'bull', rating: 'BUY',  tp: 780, focusTopics: ['margin','growth','management'] },
      { code: 'KOTAK',  stance: 'bull', rating: 'BUY',  tp: 760, focusTopics: ['margin','timing','management'] },
      { code: 'NUVAMA', stance: 'bear', rating: 'SELL', tp: 580, focusTopics: ['margin','demand','timing'] },
      { code: 'IIFL',   stance: 'hold', rating: 'HOLD', tp: 680, focusTopics: ['growth','timing','order_book'] },
      { code: 'AMBIT',  stance: 'bull', rating: 'ADD',  tp: 740, focusTopics: ['growth','demand','management'] },
    ],
  },

  // ── MARUTI — auto cycle, four broker mix on demand + margins.
  {
    ticker: 'MARUTI',
    name: 'Maruti Suzuki India',
    ctx: {
      marginBull: 'mix shift to UVs + cost programme drives 80bps operating margin uplift',
      marginExpBps: '80',
      marginBear: 'pricing aggression in entry hatchback drags EBITDA margin 90bps lower',
      marginConBps: '90',
      marginHold: '11.5',
      marginNeutral: 'mix vs discount tug-of-war',
      growthBull: 'UV penetration and CNG demand drive ~10% volume CAGR; export tailwind underestimated',
      growthBullPct: '12',
      growthBear: 'entry hatchback share losses continue; rural recovery isn\'t enough to offset urban slowdown',
      growthBearPct: '5',
      growthHoldPct: '8',
      demandBull: 'rural demand returning; festive bookings up 18% yoy with strong UV mix',
      demandBullPct: '14',
      demandBear: 'pricing pressure intensifies in sub-₹6L; competitive launches from Tata, Hyundai squeeze share',
      orderBull: 'order book pipeline (Brezza, Grand Vitara, Fronx waitlists) sustains 8 weeks of cover',
      orderBullMonths: '6',
      orderBear: 'order book waitlist halved over two quarters; cancellations rising',
      orderHold: '6 weeks of cover',
      mgmtBull: 'capex discipline through the EV transition; capital return guidance maintained',
      mgmtBear: 'execution on EV roadmap remains underwhelming; governance fine but pace lags peers',
      catalystBull: 'new Brezza variant launch and Suzuki Motor EV platform inflection in FY27',
      catalystBear: 'rural retail trough being pushed out another quarter; festive will be the test',
    },
    brokers: [
      { code: 'KOTAK',  stance: 'bull', rating: 'BUY',  tp: 14500, focusTopics: ['growth','demand','order_book'] },
      { code: 'JMFL',   stance: 'bear', rating: 'SELL', tp: 11200, focusTopics: ['demand','margin','timing'] },
      { code: 'GS',     stance: 'hold', rating: 'HOLD', tp: 12800, focusTopics: ['growth','margin','management'] },
      { code: 'IIFL',   stance: 'bull', rating: 'BUY',  tp: 13900, focusTopics: ['growth','order_book','management'] },
    ],
  },

  // ── TCS — IT services disagreement on BFSI deal TCV and discretionary spend.
  {
    ticker: 'TCS',
    name: 'Tata Consultancy Services',
    ctx: {
      marginBull: 'pyramid optimisation + utilisation gains push EBIT margin to 25.5% by FY27E',
      marginExpBps: '100',
      marginBear: 'wage hike + pricing pressure offset utilisation gains; EBIT margin range-bound',
      marginConBps: '70',
      marginHold: '24.6',
      marginNeutral: 'pricing vs wage offset',
      growthBull: 'BFSI deal TCV accelerating; GenAI attach drives incremental growth in FY27-28',
      growthBullPct: '10',
      growthBear: 'discretionary spend pullback in BFSI and retail verticals lingers through FY27',
      growthBearPct: '4',
      growthHoldPct: '7',
      demandBull: 'pricing power returning in deal renewals; AI-related TAM lifts pricing 3-5%',
      demandBullPct: '9',
      demandBear: 'pricing competitive in commoditised verticals; clients pushing back on rate cards',
      orderBull: 'deal TCV at $13bn quarterly run-rate; mega-deal pipeline 30% bigger yoy',
      orderBullMonths: '24',
      orderBear: 'deal ramp slower; book-to-bill below 1.0x for first time since FY23',
      orderHold: 'deal TCV at $11bn run-rate',
      mgmtBull: 'capex discipline and capital return commentary signal confident operator',
      mgmtBear: 'leadership transition pace and execution credibility under watch',
      catalystBull: 'GenAI attach inflection in FY27; multiple mega-deal closures pending in BFSI',
      catalystBear: 'BFSI discretionary trough being pushed out another quarter; rate cut benefit deferred',
    },
    brokers: [
      { code: 'KOTAK',  stance: 'bull', rating: 'BUY',  tp: 4500, focusTopics: ['growth','order_book','management'] },
      { code: 'JMFL',   stance: 'bull', rating: 'BUY',  tp: 4400, focusTopics: ['margin','growth','order_book'] },
      { code: 'AMBIT',  stance: 'hold', rating: 'HOLD', tp: 4100, focusTopics: ['demand','growth','timing'] },
      { code: 'AVENDUS', stance: 'bear', rating: 'SELL', tp: 3800, focusTopics: ['demand','margin','timing'] },
    ],
  },

  // ── HDFC Bank — deposit franchise debate, retail credit demand.
  {
    ticker: 'HDFCBANK',
    name: 'HDFC Bank',
    ctx: {
      marginBull: 'cost-of-deposits rolling down; NIM expands 20bps over FY26-27 as merger drag fades',
      marginExpBps: '20',
      marginBear: 'NIM compression persists as wholesale funding stays sticky; cost-of-deposits won\'t roll',
      marginConBps: '15',
      marginHold: '3.45',
      marginNeutral: 'funding mix shift',
      growthBull: 'retail credit + SME book growth at 15%; deposits granularising on branch productivity',
      growthBullPct: '15',
      growthBear: 'deposit growth lags credit growth; balance sheet won\'t compound the way bulls model',
      growthBearPct: '9',
      growthHoldPct: '12',
      demandBull: 'retail demand resilient — secured retail mix improving and asset quality holding',
      demandBullPct: '13',
      demandBear: 'unsecured retail stress visible; credit cost normalisation a real risk',
      orderBull: 'CASA pipeline strong post-merger; granular deposit franchise rebuilding',
      orderBullMonths: '36',
      orderBear: 'CASA ratio not recovering as quickly as guided; wholesale dependence persists',
      orderHold: 'CASA at 38%',
      mgmtBull: 'management transition handled cleanly; capex / branch expansion discipline intact',
      mgmtBear: 'merger-integration commentary still aspirational; governance fine but pace concerns',
      catalystBull: 'rate cut benefit kicks in 2HFY27; deposit franchise inflects with branch productivity',
      catalystBear: 'NIM trough timing keeps slipping; rate cut benefit deferred to FY28',
    },
    brokers: [
      { code: 'KOTAK',  stance: 'bull', rating: 'BUY',  tp: 2100, focusTopics: ['margin','growth','management'] },
      { code: 'JMFL',   stance: 'bull', rating: 'BUY',  tp: 2050, focusTopics: ['growth','order_book','management'] },
      { code: 'NUVAMA', stance: 'hold', rating: 'HOLD', tp: 1820, focusTopics: ['margin','demand','timing'] },
      { code: 'IIFL',   stance: 'bear', rating: 'SELL', tp: 1550, focusTopics: ['demand','margin','timing'] },
    ],
  },
]

// ── Email entry builder ────────────────────────────────────────────────

const TOPIC_BUILDERS = {
  margin:     marginParagraph,
  growth:     growthParagraph,
  demand:     demandParagraph,
  order_book: orderBookParagraph,
  management: managementParagraph,
  timing:     timingParagraph,
}

function ratingFromCall(call) {
  // Map our internal stance code to a label that the dashboard's regex
  // picks up. The Rating enum accepts Buy/Add/Hold/Reduce/Sell etc.
  const map = { BUY: 'Buy', ADD: 'Add', HOLD: 'Hold', NEUTRAL: 'Hold', REDUCE: 'Reduce', SELL: 'Sell' }
  return map[call] ?? 'Hold'
}

function callOf(stance, rating) {
  // ner_results uses the broker's own verbiage — BUY / SELL / HOLD / REDUCE.
  return rating
}

function bodyFor(stock, broker, stance, topics) {
  const ctx = stock.ctx
  const intro = stanceIntro(stance, stock, broker)
  const paras = topics.map((t) => TOPIC_BUILDERS[t](stance, ctx))
  const close = stanceClose(stance, stock, broker)
  return [intro, ...paras, close].join('\n\n')
}

function stanceIntro(stance, stock, broker) {
  const r = ratingFromCall(broker.rating)
  const tp = broker.tp.toLocaleString()
  if (stance === 'bull') {
    return `*${stock.name} (${stock.ticker}) — ${broker.rating}, PT ₹${tp}*\nWe initiate / maintain a constructive view on ${stock.ticker}. The set-up is favourable: margin trajectory is improving, growth pipeline is intact, and management execution remains the structural anchor. We rate ${r} with a target of ₹${tp}.`
  }
  if (stance === 'bear') {
    return `*${stock.name} (${stock.ticker}) — ${broker.rating}, PT ₹${tp}*\nWe stay cautious on ${stock.ticker}. The risk-reward looks unattractive into FY27: margin compression risks are underappreciated, growth normalisation is biting, and the catalyst path keeps slipping. We rate ${r} with a target of ₹${tp}.`
  }
  return `*${stock.name} (${stock.ticker}) — ${broker.rating}, PT ₹${tp}*\nWe maintain a balanced view on ${stock.ticker}. The fundamentals are steady but the next leg of re-rating needs a sharper catalyst than we see today. We rate ${r} with a target of ₹${tp}.`
}

function stanceClose(stance, stock, broker) {
  if (stance === 'bull') {
    return `Risks to our call: a sharper-than-expected margin disappointment or a regulatory shock. We see the risk-reward favouring the long side over the next 4-6 quarters.`
  }
  if (stance === 'bear') {
    return `Risks to our cautious view: a sharper-than-expected demand recovery or a margin surprise on cost programmes. Until we see those, we stay on the side-lines.`
  }
  return `Risks two-way: either margin or demand surprise positively, and the next leg of re-rating begins; or guidance is cut at 2QFY27 and the de-rating extends.`
}

function buildEmail(stock, broker, receivedAt) {
  const id = randomUUID()
  const uploadId = randomUUID()
  const docId = randomUUID()
  const bk = BROKERS[broker.code]
  const stance = broker.stance
  // Title format: "[Broker] <Company Name> (<TICKER>) — <Rating> PT ₹<n>".
  // The dashboard's extractSubjectName cuts at the first " — " or "(", so
  // putting the company name first (and the ticker inside parentheses)
  // gives a subjectName that matches the NER's longer entityName entry.
  const subjectStem = `[${broker.code}] ${stock.name} (${stock.ticker}) — ${broker.rating}, PT ₹${broker.tp.toLocaleString()}`
  const subject = `Fwd: Fw: ${subjectStem}`
  const inner = bodyFor(stock, broker, stance, broker.focusTopics)
  // NOTE: do NOT put a "Regards," line above the actual broker prose — the
  // extractor's TAIL_MARKER regex would treat that as the sign-off and stop
  // reading before the topical paragraphs (margin / growth / etc.).
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
            [stock.ticker]: { tp: String(broker.tp), rating: callOf(stance, broker.rating), ticker: stock.ticker },
            [stock.name]:   { tp: String(broker.tp), rating: callOf(stance, broker.rating), ticker: stock.ticker },
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

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '.')
}

// ── Main: build all entries, write or print ────────────────────────────

function main() {
  const entries = []
  // Distribute received_at over the last 14 days so the feed feels active.
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
