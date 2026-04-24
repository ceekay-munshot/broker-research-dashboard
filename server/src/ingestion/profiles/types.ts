import type {
  BrokerEmail, Attachment, ResearchReport, ReportSummary, EvidenceSnippet,
  BrokerStockOpinion, OrgId, BrokerId,
} from '../../../../src/domain'
import type { ParsedEmail, ParsedAttachment } from '../../eml/parse'

// Canonical profile identifiers. Each `.eml` sample matches exactly one.
export type ProfileId =
  | 'kotak_pdf'                   // direct Kotak → vimana, single PDF, minimal body
  | 'jmfl_morning_brief'          // FW: JMFL India Morning Brief — multi-company digest
  | 'jmfl_daily_digest'           // FW: JMFS Daily Financial Market Digest — corp-news list
  | 'jmfl_research_of_day'        // FW: Research of the Day — JMFL digest + embedded PDF
  | 'iifl_html_single'            // IIFL direct, HTML-only single-topic
  | 'unknown'                     // no profile matched → rejection

export interface ProfileMatch {
  readonly profileId: ProfileId
  readonly brokerId: BrokerId
  readonly confidenceReason: string
}

// The input a profile's extractor sees: the fully-parsed email plus the
// resolved tenancy (orgId / brokerId), plus attachment payloads with their
// best-effort text already pulled by the DocumentTextExtractor. Profiles
// never read the filesystem.
export interface ProfileInput {
  readonly orgId: OrgId
  readonly brokerId: BrokerId
  readonly email: ParsedEmail
  readonly attachmentTexts: ReadonlyMap<string, string>
  /** ISO-8601 timestamp the server assigns the ingested email. */
  readonly receivedAt: string
}

// A profile can emit 1..N report-level records per email. The caller stitches
// them back into a single BrokerEmail (so the ops console shows the parent
// envelope) while adding every report / summary / evidence under it.
export interface ReportCandidate {
  readonly report: ResearchReport
  readonly summary: ReportSummary
  readonly evidence: readonly EvidenceSnippet[]
  readonly opinion: BrokerStockOpinion | null
}

export interface ProfileOutputs {
  readonly email: BrokerEmail
  readonly attachments: readonly Attachment[]
  readonly candidates: readonly ReportCandidate[]
}

export interface Profile {
  readonly id: ProfileId
  matches(email: ParsedEmail, attachments: readonly ParsedAttachment[]): ProfileMatch | null
  extract(input: ProfileInput): ProfileOutputs
}
