import type { ParsedEmail, ParsedAttachment } from '../../eml/parse'
import type { Profile, ProfileId, ProfileMatch } from './types'
import { kotakPdfProfile } from './kotakPdf'
import { jmflMorningBriefProfile } from './jmflMorningBrief'
import { jmflDailyDigestProfile } from './jmflDailyDigest'
import { jmflResearchOfDayProfile } from './jmflResearchOfDay'
import { iiflHtmlProfile } from './iiflHtml'

// Order matters. More specific profiles (subject-prefix-dependent) are
// listed first; broader sender-based profiles fall through. Two JMFL
// profiles are co-scoped to the same sender but disambiguate via subject.
export const PROFILES: readonly Profile[] = [
  jmflResearchOfDayProfile,   // FW: Research of the Day  (+PDF)
  jmflMorningBriefProfile,    // FW: JMFL: India Morning Brief
  jmflDailyDigestProfile,     // FW: JMFS Fundamental Research - Daily Financial Market Digest
  iiflHtmlProfile,            // @iiflcap.com HTML-only
  kotakPdfProfile,            // Kotak direct PDF
]

export function pickProfile(email: ParsedEmail, attachments: readonly ParsedAttachment[]): ProfileMatch | null {
  for (const p of PROFILES) {
    const m = p.matches(email, attachments)
    if (m) return m
  }
  return null
}

export function profileById(id: ProfileId): Profile | null {
  return PROFILES.find((p) => p.id === id) ?? null
}

export type { Profile, ProfileId, ProfileMatch, ProfileInput, ProfileOutputs, ReportCandidate } from './types'
