// Tests for the boilerplate cleaner (src/lib/researchTextCleaners.ts).
// Locks in: (a) every canonical noise line the user surfaced returns true,
// (b) legitimate analyst bullets pass through untouched, (c) the filter
// never over-prunes a bullet that merely contains an email or phone.
// Run: npx tsx src/lib/__tests__/researchTextCleaners.ts

import { isBoilerplateKeyPoint, cleanDisplayKeyPoints } from '../researchTextCleaners'

let failed = 0
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`  ok   ${label}`)
  } else {
    failed++
    console.error(`  FAIL ${label}${detail ? ` — got: ${detail}` : ''}`)
  }
}

console.log('isBoilerplateKeyPoint — noise lines (must filter)\n')

// Contact + phone block — IIFL Investec pattern.
check('Contact + name + phone → boilerplate',
  isBoilerplateKeyPoint('Contact Aditya Jhawar +91 (22) 6849 7415'))

// Disclaimer bodies.
check('disclaimer "This communication forms part of..." → boilerplate',
  isBoilerplateKeyPoint("This communication forms part of an electronic communication sent to the intended recipient (or such person's authorised representative) for their sole use and is subject to important legal and regulatory restrictions, qualifications and disclaimers that may be accessed and read in the attached research publication."))
check('"The disclaimer is deemed to form part..." → boilerplate',
  isBoilerplateKeyPoint('The disclaimer is deemed to form part of this communication. In the event of a conflict between the disclaimer and this notice, the disclaimer shall'))

// Unsubscribe noise.
check('Click Here to unsubscribe → boilerplate',
  isBoilerplateKeyPoint('-- Click Here to unsubscribe from this newsletter.'))
check('inline "Click Here to unsubscribe" → boilerplate',
  isBoilerplateKeyPoint('Click Here to unsubscribe from this newsletter.'))

// Email + jurisdiction lines.
check('line starts with email → boilerplate',
  isBoilerplateKeyPoint('securities@investec.co.za or in the case of the UK or Australia: securities@investec.co.uk'))
check('"in the case of SA/UK/Australia" → boilerplate',
  isBoilerplateKeyPoint('Please contact us in the case of UK or Australia for further details.'))
check('"please obtain a copy thereof" → boilerplate',
  isBoilerplateKeyPoint('Please obtain a copy thereof from us by sending an e-mail to the relevant office.'))

// Sign-offs / generic headers.
check('Best regards → boilerplate', isBoilerplateKeyPoint('Best regards'))
check('Warm regards → boilerplate', isBoilerplateKeyPoint('Warm regards'))
check('Disclaimer (lone header) → boilerplate', isBoilerplateKeyPoint('Disclaimer'))
check('Please find attached → boilerplate', isBoilerplateKeyPoint('Please find attached our latest report.'))
check('SEBI Research Analyst Reg → boilerplate',
  isBoilerplateKeyPoint('SEBI Research Analyst Reg No: INH000000000'))
check('Compliance Officer → boilerplate',
  isBoilerplateKeyPoint('Compliance Officer: Mr X, +91 22 ...'))
check('mutual funds market risk → boilerplate',
  isBoilerplateKeyPoint('Mutual funds investments are subject to market risk.'))
check('investments in securities market → boilerplate',
  isBoilerplateKeyPoint('Investments in securities market are subject to market risks.'))
check('bare "--" separator → boilerplate', isBoilerplateKeyPoint('-- '))

// Empty / whitespace.
check('empty string → boilerplate', isBoilerplateKeyPoint(''))
check('whitespace only → boilerplate', isBoilerplateKeyPoint('   '))

console.log('\nisBoilerplateKeyPoint — clean analyst bullets (must pass through)\n')

// Genuine NephroPlus / Eris / Apollo bullets — must NOT be filtered.
check("Eris 'we expect …' bullet → not boilerplate",
  !isBoilerplateKeyPoint("We expect Eris' India business to clock ~11% Cagr over FY26-29ii, driven by robust traction in Sema (secondary sales tracking Rs40-50m/month in Apr-May'26), MS improvement in insulins (Aspart launch in FY27) and the Bhopal facility now being fully commissioned removing the key supply bottleneck."))
check('Apollo 24/7 EBITDA bullet → not boilerplate',
  !isBoilerplateKeyPoint('Apollo 24/7 Ebitda losses moderated 43% QoQ in 4Q and 44% YoY in FY26, driven by adjusted volumes.'))
check('Pricol "Consolidated EBITDA rose..." → not boilerplate',
  !isBoilerplateKeyPoint('Consolidated EBITDA rose 62% YoY to INR143cr, with EBITDA margin expanding 156bp YoY to 13% on a higher gross margin and lower employee expenses but was partially offset by a rise in other expenses.'))
check('"We forecast 16/17% Rev/Ebitda Cagr" → not boilerplate',
  !isBoilerplateKeyPoint('We forecast 16/17% Rev/Ebitda Cagr for the Hospitals over FY26-29ii, driven by occupancy ramp-up in existing hospitals (from 67-68%) and ~20% incremental bed additions over FY26-27.'))

// Bullets that MENTION an email or phone but are clearly analyst prose
// (defense against over-prune).
check('prose that contains an email mid-sentence → not boilerplate',
  !isBoilerplateKeyPoint('Management noted that customer queries should now route to research@example.com instead of the old support line, indicating a tighter ops shift.'))
check('prose that contains a phone number mid-sentence → not boilerplate',
  !isBoilerplateKeyPoint('The company guided that volumes should reach 2,500 units/month by FY27, up from 1,800 last quarter.'))
check('"contact" word inside a longer thesis sentence → not boilerplate',
  !isBoilerplateKeyPoint('We expect management to make first contact with potential capacity partners in 2H26 as the new product line ramps.'))

console.log('\ncleanDisplayKeyPoints — end-to-end\n')

const mixed = [
  'We expect 16/17% Rev/Ebitda Cagr for the Hospitals over FY26-29ii.',
  'Apollo 24/7 Ebitda losses moderated 43% QoQ in 4Q.',
  'Contact Aditya Jhawar +91 (22) 6849 7415',
  'This communication forms part of an electronic communication sent to the intended recipient.',
  'The Bhopal facility is now fully commissioned removing the key supply bottleneck.',
  '-- Click Here to unsubscribe from this newsletter.',
  'securities@investec.co.za or in the case of the UK or Australia: securities@investec.co.uk',
  'The disclaimer is deemed to form part of this communication.',
]
const cleaned = cleanDisplayKeyPoints(mixed)
check('cleanDisplayKeyPoints filters all noise', cleaned.length === 3,
  `expected 3 clean bullets, got ${cleaned.length}`)
check('cleanDisplayKeyPoints preserves order — bullet 1',
  cleaned[0]?.startsWith('We expect 16/17%'))
check('cleanDisplayKeyPoints preserves order — bullet 2',
  cleaned[1]?.startsWith('Apollo 24/7'))
check('cleanDisplayKeyPoints preserves order — bullet 3',
  cleaned[2]?.startsWith('The Bhopal facility'))

// Empty input.
check('cleanDisplayKeyPoints handles empty input',
  cleanDisplayKeyPoints([]).length === 0)

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll checks passed')
