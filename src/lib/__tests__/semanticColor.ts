// Tests for the semantic-colour mapping helpers (src/lib/semanticColor.ts).
// These lock in the meaning→tone contract the colour audit established:
// a downgrade is RED, a buy idea is GREEN, amber is caution-only.
// Run: npx tsx src/lib/__tests__/semanticColor.ts

import {
  getSemanticTone, getRecommendationTone, getStanceTone, getChangeTone,
  getResultantStateTone, getArbTone, getSignificanceTone, getActionLabelTone,
  getDeliveryStatusTone, getFeedStatusTone, toneClass,
  TONE_TEXT_CLASS, TONE_CHIP_CLASS, TONE_SOLID_CLASS, TONE_HEX,
  RESULTANT_STATE_CHIP_CLASS,
  type SemanticTone,
} from '../semanticColor'

let failed = 0
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`  ok   ${label}`)
  } else {
    failed++
    console.error(`  FAIL ${label}${detail ? ` — got: ${detail}` : ''}`)
  }
}
/** Assert a value→tone mapping. */
function eq(label: string, actual: SemanticTone, expected: SemanticTone): void {
  check(`${label} => ${expected}`, actual === expected, actual)
}

console.log('semantic colour mapping\n')

// ── Ratings / recommendations ──────────────────────────────────────────────
eq('Buy',         getRecommendationTone('Buy'),         'positive')
eq('Overweight',  getRecommendationTone('Overweight'),  'positive')
eq('Hold',        getRecommendationTone('Hold'),        'neutral')
eq('Underweight', getRecommendationTone('Underweight'), 'negative') // bearish — never amber
eq('Sell',        getRecommendationTone('Sell'),        'negative')
eq('Not Rated',   getRecommendationTone('Not Rated'),   'neutral')

// ── Stance ─────────────────────────────────────────────────────────────────
eq('bullish stance', getStanceTone('bullish'), 'positive')
eq('neutral stance', getStanceTone('neutral'), 'neutral')
eq('bearish stance', getStanceTone('bearish'), 'negative')

// ── Numeric change — target-price moves, deltas ────────────────────────────
eq('TP +10% (numeric)',  getChangeTone(10),        'positive')
eq('TP -10% (numeric)',  getChangeTone(-10),       'negative')
eq('TP unchanged (0)',   getChangeTone(0),         'neutral')
eq('TP unknown (null)',  getChangeTone(null),      'neutral')
eq('TP unknown (undef)', getChangeTone(undefined), 'neutral')

// ── General free-text classifier — the task's sample cases ─────────────────
eq('Buy',           getSemanticTone('Buy'),           'positive')
eq('Sell',          getSemanticTone('Sell'),          'negative')
eq('Upgrade',       getSemanticTone('Upgrade'),       'positive')
eq('Downgrade',     getSemanticTone('Downgrade'),     'negative')
eq('TP raise',      getSemanticTone('TP raise'),      'positive')
eq('+10%',          getSemanticTone('+10%'),          'positive')
eq('TP cut',        getSemanticTone('TP cut'),        'negative')
eq('-10%',          getSemanticTone('-10%'),          'negative')
eq('Hold',          getSemanticTone('Hold'),          'neutral')
eq('Neutral',       getSemanticTone('Neutral'),       'neutral')
eq('Maintain',      getSemanticTone('Maintain'),      'neutral')
eq('Mixed ratings', getSemanticTone('Mixed ratings'), 'caution')
eq('Moderate ARB',  getSemanticTone('Moderate ARB'),  'caution')
// …and a few more from the audit's positive/negative example lists.
eq('Accumulate',    getSemanticTone('Accumulate'),    'positive')
eq('Outperform',    getSemanticTone('Outperform'),    'positive')
eq('Beat',          getSemanticTone('Beat'),          'positive')
eq('Reduce',        getSemanticTone('Reduce'),        'negative')
eq('Underperform',  getSemanticTone('Underperform'),  'negative')
eq('De-rating',     getSemanticTone('De-rating'),     'negative')
eq('Earnings miss', getSemanticTone('Earnings miss'), 'negative')
eq('Equal-weight',  getSemanticTone('Equal-weight'),  'neutral')
eq('Market perform',getSemanticTone('Market perform'),'neutral')

// ── Action labels (forwarded-note tags) ────────────────────────────────────
eq('action: BUY idea',         getActionLabelTone('BUY idea'),         'positive')
eq('action: Upgrade',          getActionLabelTone('Upgrade'),          'positive')
eq('action: Downgrade',        getActionLabelTone('Downgrade'),        'negative')
eq('action: Big upside',       getActionLabelTone('Big upside'),       'positive')
eq('action: Initiation',       getActionLabelTone('Initiation'),       'info')
eq('action: High-signal note', getActionLabelTone('High-signal note'), 'neutral')

// ── ARB band (Street disagreement) ─────────────────────────────────────────
eq('ARB none',     getArbTone('none'),     'neutral')
eq('ARB low',      getArbTone('low'),      'positive')
eq('ARB moderate', getArbTone('moderate'), 'caution')
eq('ARB high',     getArbTone('high'),     'negative')

// ── Resultant (Street) state ───────────────────────────────────────────────
eq('consensus_bullish',  getResultantStateTone('consensus_bullish'),  'positive')
eq('consensus_bearish',  getResultantStateTone('consensus_bearish'),  'negative')
eq('mixed_constructive', getResultantStateTone('mixed_constructive'), 'positive')
eq('mixed_cautious',     getResultantStateTone('mixed_cautious'),     'negative')
eq('unresolved',         getResultantStateTone('unresolved'),         'neutral')
eq('outlier_driven',     getResultantStateTone('outlier_driven'),     'caution')

// ── Change-significance buckets ────────────────────────────────────────────
eq('significance major',         getSignificanceTone('major'),          'negative')
eq('significance moderate',       getSignificanceTone('moderate'),       'caution')
eq('significance minor',          getSignificanceTone('minor'),          'neutral')
eq('significance first_coverage', getSignificanceTone('first_coverage'), 'info')

// ── Delivery + feed status ─────────────────────────────────────────────────
eq('delivery sent',       getDeliveryStatusTone('sent'),       'positive')
eq('delivery failed',     getDeliveryStatusTone('failed'),     'negative')
eq('delivery queued',     getDeliveryStatusTone('queued'),     'caution')
eq('delivery retrying',   getDeliveryStatusTone('retrying'),   'caution')
eq('delivery suppressed', getDeliveryStatusTone('suppressed'), 'neutral')
eq('feed live',    getFeedStatusTone('live'),    'positive')
eq('feed delayed', getFeedStatusTone('delayed'), 'caution')
eq('feed error',   getFeedStatusTone('error'),   'negative')
eq('feed waiting', getFeedStatusTone('waiting'), 'neutral')

// ── Tone class maps are complete, non-empty, and well-formed ───────────────
const TONES: readonly SemanticTone[] = ['positive', 'negative', 'neutral', 'caution', 'info', 'brand']
for (const t of TONES) {
  check(`text class for ${t}`,  TONE_TEXT_CLASS[t].startsWith('text-'), TONE_TEXT_CLASS[t])
  check(`chip class for ${t}`,  /border-/.test(TONE_CHIP_CLASS[t]) && /text-/.test(TONE_CHIP_CLASS[t]), TONE_CHIP_CLASS[t])
  check(`solid class for ${t}`, TONE_SOLID_CLASS[t].startsWith('bg-'), TONE_SOLID_CLASS[t])
  check(`hex for ${t}`,         /^#[0-9a-f]{6}$/i.test(TONE_HEX[t]), TONE_HEX[t])
}
check('toneClass default variant is text', toneClass('positive') === TONE_TEXT_CLASS.positive)
check('toneClass chip variant',            toneClass('negative', 'chip') === TONE_CHIP_CLASS.negative)
check('resultant-state chip map covers all six states', Object.keys(RESULTANT_STATE_CHIP_CLASS).length === 6)

// ── Audit guardrails — the misuses this module exists to prevent ───────────
check('a Downgrade is RED, never amber',     getSemanticTone('Downgrade') === 'negative')
check('Underweight is RED, never amber',     getRecommendationTone('Underweight') === 'negative')
check('a BUY idea is GREEN, never gold',     getActionLabelTone('BUY idea') === 'positive')
check('positive tone is emerald green',      TONE_HEX.positive === '#34d399')
check('negative tone is rose red',           TONE_HEX.negative === '#fb7185')
check('amber is reserved for caution',       TONE_TEXT_CLASS.caution.includes('amber'))
check('brand gold stays out of sentiment',   TONE_HEX.brand === '#d4af37' && getSemanticTone('Buy') !== 'brand')

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll checks passed')
