// Sample data for the static MVP. Shape mirrors what the ingestion API
// will eventually return — keep field names stable so swapping to a real
// fetch in src/api/brokerApi.js is a one-line change per view.

export const lastUpdated = '2026-04-23T08:42:00Z'

export const kpis = {
  brokersTracked: 27,
  reportsIngested: 1843,
  stocksCovered: 412,
  divergenceFlags: 31,
  deltas: {
    brokersTracked: { value: 2, window: '30d' },
    reportsIngested: { value: 146, window: '7d' },
    stocksCovered: { value: 18, window: '30d' },
    divergenceFlags: { value: 9, window: '7d' },
  },
}

export const brokers = [
  { id: 'gs',   name: 'Goldman Sachs',        shortName: 'GS',    color: '#d4af37' },
  { id: 'ms',   name: 'Morgan Stanley',       shortName: 'MS',    color: '#60a5fa' },
  { id: 'jpm',  name: 'JP Morgan',            shortName: 'JPM',   color: '#34d399' },
  { id: 'baml', name: 'BofA Securities',      shortName: 'BofA',  color: '#f87171' },
  { id: 'citi', name: 'Citi',                 shortName: 'Citi',  color: '#a78bfa' },
  { id: 'barc', name: 'Barclays',             shortName: 'BARC',  color: '#fbbf24' },
  { id: 'ubs',  name: 'UBS',                  shortName: 'UBS',   color: '#f472b6' },
  { id: 'jef',  name: 'Jefferies',            shortName: 'JEF',   color: '#22d3ee' },
  { id: 'nmr',  name: 'Nomura',               shortName: 'NMR',   color: '#fb7185' },
  { id: 'wf',   name: 'Wells Fargo',          shortName: 'WF',    color: '#4ade80' },
]

export const sectors = [
  { id: 'tech',       name: 'Technology',              reports: 412, flagged: 11, sentiment: +0.42 },
  { id: 'fin',        name: 'Financials',              reports: 276, flagged:  6, sentiment: +0.18 },
  { id: 'energy',     name: 'Energy',                  reports: 188, flagged:  5, sentiment: -0.11 },
  { id: 'health',     name: 'Healthcare',              reports: 231, flagged:  3, sentiment: +0.09 },
  { id: 'consumer',   name: 'Consumer Discretionary',  reports: 204, flagged:  4, sentiment: -0.04 },
  { id: 'industrial', name: 'Industrials',             reports: 152, flagged:  2, sentiment: +0.22 },
]

export const stocks = [
  { ticker: 'NVDA',  name: 'NVIDIA Corp.',        sector: 'tech',     price: 1142.30, ccy: 'USD' },
  { ticker: 'AAPL',  name: 'Apple Inc.',          sector: 'tech',     price:  218.74, ccy: 'USD' },
  { ticker: 'MSFT',  name: 'Microsoft Corp.',     sector: 'tech',     price:  436.82, ccy: 'USD' },
  { ticker: 'GOOGL', name: 'Alphabet Inc.',       sector: 'tech',     price:  189.41, ccy: 'USD' },
  { ticker: 'META',  name: 'Meta Platforms',      sector: 'tech',     price:  612.08, ccy: 'USD' },
  { ticker: 'TSLA',  name: 'Tesla Inc.',          sector: 'consumer', price:  248.19, ccy: 'USD' },
  { ticker: 'AMZN',  name: 'Amazon.com',          sector: 'consumer', price:  203.55, ccy: 'USD' },
  { ticker: 'JPM',   name: 'JPMorgan Chase',      sector: 'fin',      price:  229.04, ccy: 'USD' },
  { ticker: 'XOM',   name: 'Exxon Mobil',         sector: 'energy',   price:  116.72, ccy: 'USD' },
  { ticker: 'LLY',   name: 'Eli Lilly',           sector: 'health',   price:  781.20, ccy: 'USD' },
  { ticker: 'CAT',   name: 'Caterpillar',         sector: 'industrial', price: 342.60, ccy: 'USD' },
  { ticker: 'WMT',   name: 'Walmart',             sector: 'consumer', price:   82.14, ccy: 'USD' },
]

// Individual broker ratings per stock (the "opinions matrix").
// Rating scale: Buy / Overweight / Hold / Underweight / Sell
export const brokerRatings = [
  // NVDA — contested name, four brokers disagree
  { broker: 'gs',   ticker: 'NVDA', rating: 'Buy',         targetPrice: 1320, priorTarget: 1240, growth: 0.38, updated: '2026-04-22' },
  { broker: 'ms',   ticker: 'NVDA', rating: 'Overweight',  targetPrice: 1280, priorTarget: 1200, growth: 0.33, updated: '2026-04-21' },
  { broker: 'jpm',  ticker: 'NVDA', rating: 'Overweight',  targetPrice: 1250, priorTarget: 1180, growth: 0.30, updated: '2026-04-18' },
  { broker: 'baml', ticker: 'NVDA', rating: 'Hold',        targetPrice: 1080, priorTarget: 1080, growth: 0.14, updated: '2026-04-17' },
  { broker: 'citi', ticker: 'NVDA', rating: 'Buy',         targetPrice: 1340, priorTarget: 1260, growth: 0.41, updated: '2026-04-15' },
  { broker: 'ubs',  ticker: 'NVDA', rating: 'Underweight', targetPrice:  920, priorTarget: 1050, growth: -0.05, updated: '2026-04-22' },
  { broker: 'jef',  ticker: 'NVDA', rating: 'Buy',         targetPrice: 1400, priorTarget: 1300, growth: 0.45, updated: '2026-04-20' },

  // AAPL
  { broker: 'gs',   ticker: 'AAPL', rating: 'Buy',         targetPrice: 245, priorTarget: 235, growth: 0.08, updated: '2026-04-20' },
  { broker: 'ms',   ticker: 'AAPL', rating: 'Overweight',  targetPrice: 242, priorTarget: 238, growth: 0.07, updated: '2026-04-18' },
  { broker: 'jpm',  ticker: 'AAPL', rating: 'Hold',        targetPrice: 220, priorTarget: 225, growth: 0.02, updated: '2026-04-21' },
  { broker: 'baml', ticker: 'AAPL', rating: 'Buy',         targetPrice: 250, priorTarget: 240, growth: 0.09, updated: '2026-04-22' },
  { broker: 'citi', ticker: 'AAPL', rating: 'Hold',        targetPrice: 225, priorTarget: 225, growth: 0.03, updated: '2026-04-15' },

  // MSFT
  { broker: 'gs',   ticker: 'MSFT', rating: 'Buy',         targetPrice: 490, priorTarget: 470, growth: 0.17, updated: '2026-04-19' },
  { broker: 'ms',   ticker: 'MSFT', rating: 'Overweight',  targetPrice: 485, priorTarget: 475, growth: 0.16, updated: '2026-04-22' },
  { broker: 'jef',  ticker: 'MSFT', rating: 'Buy',         targetPrice: 505, priorTarget: 490, growth: 0.20, updated: '2026-04-23' },
  { broker: 'barc', ticker: 'MSFT', rating: 'Overweight',  targetPrice: 480, priorTarget: 470, growth: 0.15, updated: '2026-04-17' },

  // GOOGL — mild divergence
  { broker: 'gs',   ticker: 'GOOGL', rating: 'Buy',        targetPrice: 215, priorTarget: 205, growth: 0.14, updated: '2026-04-21' },
  { broker: 'ms',   ticker: 'GOOGL', rating: 'Hold',       targetPrice: 188, priorTarget: 195, growth: 0.00, updated: '2026-04-16' },
  { broker: 'ubs',  ticker: 'GOOGL', rating: 'Underweight',targetPrice: 170, priorTarget: 175, growth: -0.08, updated: '2026-04-14' },
  { broker: 'citi', ticker: 'GOOGL', rating: 'Buy',        targetPrice: 220, priorTarget: 210, growth: 0.17, updated: '2026-04-22' },

  // TSLA — highly divergent
  { broker: 'gs',   ticker: 'TSLA', rating: 'Hold',        targetPrice: 255, priorTarget: 260, growth: 0.03, updated: '2026-04-22' },
  { broker: 'ms',   ticker: 'TSLA', rating: 'Overweight',  targetPrice: 320, priorTarget: 290, growth: 0.29, updated: '2026-04-20' },
  { broker: 'jpm',  ticker: 'TSLA', rating: 'Underweight', targetPrice: 190, priorTarget: 200, growth: -0.22, updated: '2026-04-18' },
  { broker: 'baml', ticker: 'TSLA', rating: 'Hold',        targetPrice: 240, priorTarget: 250, growth: 0.00, updated: '2026-04-16' },
  { broker: 'jef',  ticker: 'TSLA', rating: 'Buy',         targetPrice: 340, priorTarget: 310, growth: 0.37, updated: '2026-04-23' },
  { broker: 'nmr',  ticker: 'TSLA', rating: 'Sell',        targetPrice: 165, priorTarget: 180, growth: -0.32, updated: '2026-04-15' },

  // META
  { broker: 'gs',   ticker: 'META',  rating: 'Buy',        targetPrice: 680, priorTarget: 650, growth: 0.11, updated: '2026-04-22' },
  { broker: 'ms',   ticker: 'META',  rating: 'Overweight', targetPrice: 670, priorTarget: 640, growth: 0.09, updated: '2026-04-20' },
  { broker: 'ubs',  ticker: 'META',  rating: 'Hold',       targetPrice: 600, priorTarget: 615, growth: 0.00, updated: '2026-04-17' },

  // JPM
  { broker: 'gs',   ticker: 'JPM',   rating: 'Buy',        targetPrice: 255, priorTarget: 245, growth: 0.11, updated: '2026-04-21' },
  { broker: 'wf',   ticker: 'JPM',   rating: 'Overweight', targetPrice: 248, priorTarget: 240, growth: 0.08, updated: '2026-04-19' },
  { broker: 'baml', ticker: 'JPM',   rating: 'Hold',       targetPrice: 230, priorTarget: 230, growth: 0.00, updated: '2026-04-15' },

  // XOM — energy disagreement
  { broker: 'gs',   ticker: 'XOM',   rating: 'Buy',        targetPrice: 135, priorTarget: 130, growth: 0.16, updated: '2026-04-22' },
  { broker: 'jpm',  ticker: 'XOM',   rating: 'Hold',       targetPrice: 118, priorTarget: 120, growth: 0.01, updated: '2026-04-20' },
  { broker: 'barc', ticker: 'XOM',   rating: 'Underweight',targetPrice:  98, priorTarget: 105, growth: -0.16, updated: '2026-04-18' },

  // LLY
  { broker: 'ms',   ticker: 'LLY',   rating: 'Overweight', targetPrice: 860, priorTarget: 820, growth: 0.10, updated: '2026-04-22' },
  { broker: 'jef',  ticker: 'LLY',   rating: 'Buy',        targetPrice: 900, priorTarget: 860, growth: 0.15, updated: '2026-04-21' },
  { broker: 'citi', ticker: 'LLY',   rating: 'Hold',       targetPrice: 760, priorTarget: 780, growth: -0.03, updated: '2026-04-16' },

  // CAT, WMT, AMZN — lighter coverage
  { broker: 'gs',   ticker: 'CAT',   rating: 'Hold',       targetPrice: 340, priorTarget: 345, growth: -0.01, updated: '2026-04-19' },
  { broker: 'ms',   ticker: 'CAT',   rating: 'Overweight', targetPrice: 380, priorTarget: 365, growth: 0.11, updated: '2026-04-22' },

  { broker: 'wf',   ticker: 'WMT',   rating: 'Buy',        targetPrice: 92,  priorTarget: 88,  growth: 0.12, updated: '2026-04-21' },
  { broker: 'gs',   ticker: 'WMT',   rating: 'Hold',       targetPrice: 83,  priorTarget: 85,  growth: 0.01, updated: '2026-04-17' },

  { broker: 'gs',   ticker: 'AMZN',  rating: 'Buy',        targetPrice: 235, priorTarget: 225, growth: 0.15, updated: '2026-04-22' },
  { broker: 'jef',  ticker: 'AMZN',  rating: 'Buy',        targetPrice: 240, priorTarget: 230, growth: 0.18, updated: '2026-04-23' },
  { broker: 'ubs',  ticker: 'AMZN',  rating: 'Hold',       targetPrice: 200, priorTarget: 205, growth: -0.02, updated: '2026-04-15' },
]

// Most recent broker notes (what ingestion would extract from emails).
export const reports = [
  { id: 'r001', broker: 'gs',   ticker: 'NVDA',  date: '2026-04-22', headline: 'Raising estimates — Blackwell ramp tracking ahead of plan', stance: 'bullish',  themes: ['AI capex', 'Datacenter', 'Supply-side'] },
  { id: 'r002', broker: 'ubs',  ticker: 'NVDA',  date: '2026-04-22', headline: 'Downgrade: hyperscaler capex digestion risk into 2H',      stance: 'bearish',  themes: ['AI capex', 'Digestion', 'Hyperscalers'] },
  { id: 'r003', broker: 'jef',  ticker: 'TSLA',  date: '2026-04-23', headline: 'Robotaxi option value still underwritten by the Street',   stance: 'bullish',  themes: ['Autonomy', 'Optionality', 'Robotaxi'] },
  { id: 'r004', broker: 'nmr',  ticker: 'TSLA',  date: '2026-04-15', headline: 'Margin reset — price war unlikely to abate before Q3',      stance: 'bearish',  themes: ['Pricing', 'Margins', 'Competition'] },
  { id: 'r005', broker: 'ms',   ticker: 'MSFT',  date: '2026-04-22', headline: 'Azure growth sustaining — AI attach rate surprise',         stance: 'bullish',  themes: ['Cloud', 'AI attach', 'Enterprise'] },
  { id: 'r006', broker: 'gs',   ticker: 'XOM',   date: '2026-04-22', headline: 'Guyana cash-flow step-up into 2027 underappreciated',       stance: 'bullish',  themes: ['Upstream', 'FCF', 'Guyana'] },
  { id: 'r007', broker: 'barc', ticker: 'XOM',   date: '2026-04-18', headline: 'Brent deck cut — supply surplus widens through year-end',   stance: 'bearish',  themes: ['Oil price', 'Supply', 'Inventory'] },
  { id: 'r008', broker: 'citi', ticker: 'GOOGL', date: '2026-04-22', headline: 'Search resilience holding despite AI overhang',             stance: 'bullish',  themes: ['Search', 'AI overhang', 'Ad market'] },
  { id: 'r009', broker: 'baml', ticker: 'AAPL',  date: '2026-04-22', headline: 'Services re-rating as AI features pull iPhone cycle',       stance: 'bullish',  themes: ['Services', 'iPhone cycle', 'AI features'] },
  { id: 'r010', broker: 'jpm',  ticker: 'AAPL',  date: '2026-04-21', headline: 'Trim to Neutral — upgrade cycle likely muted',              stance: 'neutral',  themes: ['iPhone cycle', 'China', 'Consumer'] },
  { id: 'r011', broker: 'jef',  ticker: 'MSFT',  date: '2026-04-23', headline: 'Raising PT on Copilot monetization traction',               stance: 'bullish',  themes: ['Copilot', 'Monetization', 'Enterprise'] },
  { id: 'r012', broker: 'ms',   ticker: 'LLY',   date: '2026-04-22', headline: 'GLP-1 TAM expansion — cardio label a 2027 catalyst',         stance: 'bullish',  themes: ['GLP-1', 'TAM', 'Labels'] },
  { id: 'r013', broker: 'citi', ticker: 'LLY',   date: '2026-04-16', headline: 'Cautious — competitive intensity rising into year-end',    stance: 'neutral',  themes: ['GLP-1', 'Competition'] },
  { id: 'r014', broker: 'gs',   ticker: 'META',  date: '2026-04-22', headline: 'Reels monetization closing the gap to feed',                stance: 'bullish',  themes: ['Reels', 'Ad load', 'Engagement'] },
  { id: 'r015', broker: 'wf',   ticker: 'JPM',   date: '2026-04-19', headline: 'NII troughing — deposit beta inflection in view',            stance: 'bullish',  themes: ['NII', 'Deposit beta', 'Rates'] },
  { id: 'r016', broker: 'ms',   ticker: 'CAT',   date: '2026-04-22', headline: 'Services backlog at new highs — cycle extended',             stance: 'bullish',  themes: ['Backlog', 'Services', 'Late cycle'] },
  { id: 'r017', broker: 'jef',  ticker: 'AMZN',  date: '2026-04-23', headline: 'AWS reacceleration plus retail margin expansion',            stance: 'bullish',  themes: ['AWS', 'Retail margin', 'Advertising'] },
  { id: 'r018', broker: 'ubs',  ticker: 'GOOGL', date: '2026-04-14', headline: 'Regulatory overhang limits multiple expansion',              stance: 'bearish',  themes: ['Regulation', 'Multiple', 'DOJ'] },
  { id: 'r019', broker: 'jpm',  ticker: 'TSLA',  date: '2026-04-18', headline: 'Valuation disconnect from delivery trajectory',              stance: 'bearish',  themes: ['Valuation', 'Deliveries', 'Margins'] },
  { id: 'r020', broker: 'gs',   ticker: 'JPM',   date: '2026-04-21', headline: 'Capital markets tailwind through 2H — raising numbers',      stance: 'bullish',  themes: ['Capital markets', 'IB fees', 'FICC'] },
]

// Divergence / ARB closure cases — where the Street disagrees materially.
export const divergences = [
  {
    id: 'd001',
    ticker: 'TSLA',
    title: 'TSLA — bull/bear spread is 106%',
    spread: { lowTarget: 165, highTarget: 340, lowBroker: 'nmr', highBroker: 'jef' },
    conflicts: [
      { topic: 'Auto margin trajectory', bull: 'Operating leverage reasserts as price war eases in 2H26', bear: 'Structural OEM competition has reset gross margin floor' },
      { topic: 'Robotaxi monetization', bull: 'Option value not priced — first city launch in H2 26', bear: 'Regulatory path unresolved in every major US metro' },
      { topic: 'Energy storage',         bull: 'Megapack backlog converts to >30% GM contribution by 2027', bear: 'Competitive bid pressure from CATL/BYD into utility deals' },
    ],
    aiConclusion: 'Placeholder — AI synthesis will distil the key disagreement and suggest the next data release that could resolve it.',
  },
  {
    id: 'd002',
    ticker: 'NVDA',
    title: 'NVDA — UBS underweight against a broadly bullish Street',
    spread: { lowTarget: 920, highTarget: 1400, lowBroker: 'ubs', highBroker: 'jef' },
    conflicts: [
      { topic: 'Hyperscaler capex',  bull: 'Capex guidance from top-4 implies >20% y/y growth sustained into 2027', bear: 'Digestion phase likely in 2H26 as deployed fleet ramps utilization' },
      { topic: 'Sovereign AI demand', bull: 'Incremental non-hyperscaler TAM adds $40bn over 24 months',            bear: 'Sovereign orders slippable, gross margin dilutive vs cloud' },
      { topic: 'Custom silicon risk', bull: 'CUDA lock-in and software stack protect share through 2027',           bear: 'TPU v6 and MTIA ramps start taking >15% of training workloads' },
    ],
    aiConclusion: 'Placeholder — AI will rank which catalyst (earnings, capex prints, custom silicon benchmarks) most likely closes the spread.',
  },
  {
    id: 'd003',
    ticker: 'XOM',
    title: 'XOM — crude price deck divergence drives 38% target spread',
    spread: { lowTarget: 98, highTarget: 135, lowBroker: 'barc', highBroker: 'gs' },
    conflicts: [
      { topic: 'Brent deck 2026–27',   bull: 'Long-dated $85/bbl supported by OPEC+ discipline and shale exit rates', bear: '$72/bbl mid-cycle as non-OPEC supply accelerates into a soft demand print' },
      { topic: 'Guyana cash return',   bull: 'FCF yield >10% at strip supports accelerated buyback through 2027',    bear: 'Capex creep in Stabroek Phase 6+ reduces distributable FCF' },
      { topic: 'Downstream integration', bull: 'Product Solutions margin set resilient into mid-cycle',              bear: 'Refining capacity additions in Asia compress crack spreads' },
    ],
    aiConclusion: 'Placeholder — AI will flag the macro assumption (Brent deck) as the dominant driver and map sensitivity.',
  },
  {
    id: 'd004',
    ticker: 'GOOGL',
    title: 'GOOGL — AI substitution vs. search resilience',
    spread: { lowTarget: 170, highTarget: 220, lowBroker: 'ubs', highBroker: 'citi' },
    conflicts: [
      { topic: 'Query volume',     bull: 'Gemini integration defending query counts, commercial intent intact', bear: 'AI answer engines eroding high-CPC query mix by >5% annualized' },
      { topic: 'Regulatory',       bull: 'DOJ remedy path leaves core distribution economics intact',           bear: 'Forced divestiture of default-search agreements compresses TAC leverage' },
      { topic: 'Cloud profitability', bull: 'GCP operating margin >20% inflection by 2026 exit',                  bear: 'AI infra build-out sustains margin drag through 2027' },
    ],
    aiConclusion: 'Placeholder — AI will correlate query-mix data with ad-pricing prints to score the thesis live.',
  },
]

export const ratingOptions = ['Buy', 'Overweight', 'Hold', 'Underweight', 'Sell']

export const stanceColor = {
  bullish: 'text-emerald-400',
  neutral: 'text-slate-300',
  bearish: 'text-rose-400',
}

export const ratingColor = {
  Buy:          'text-emerald-400',
  Overweight:   'text-emerald-300',
  Hold:         'text-slate-300',
  Underweight:  'text-amber-400',
  Sell:         'text-rose-400',
}
