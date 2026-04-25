import type { ReportType } from '../../../../src/domain'

/** Subject-line → ReportType. The order matters: more-specific phrases
 *  first. When nothing matches, default to `update`. */
export function detectReportType(subject: string): ReportType {
  const s = subject.toLowerCase()
  if (s.includes('preview'))                                  return 'earnings_preview'
  if (s.includes('result update') || s.includes('post print')
   || s.includes('result review') || s.includes('earnings review')
   || s.includes('results review'))                           return 'earnings_review'
  if (s.includes('initiation') || s.includes('initiate'))     return 'initiation'
  if (s.includes('flash'))                                    return 'flash'
  if (s.includes('morning') || s.includes('daily digest')
   || s.includes('research of the day'))                      return 'morning_note'
  if (s.includes('sector') || s.includes('thematic'))         return 'sector_note'
  if (s.includes('deep dive'))                                return 'deep_dive'
  return 'update'
}

/** True when the subject + body strongly suggest a multi-company digest
 *  (morning brief, daily digest, research of the day). Used as a hint
 *  for the digest splitter — not authoritative on its own. */
export function looksLikeDigest(subject: string, body: string): boolean {
  const s = subject.toLowerCase()
  if (s.includes('morning') || s.includes('daily digest')
   || s.includes('research of the day') || s.includes('digest')) return true
  // Many tickers covered AND multiple "TP ₹..." anchors in body suggests
  // a digest even when the subject is generic.
  const bodyTpHits = (body.match(/\bTP\s*₹?\s?\d/gi) ?? []).length
  return bodyTpHits >= 3
}
