// Promote a reviewed (and possibly corrected) production case into a
// gold-fixture skeleton operators can drop into
// `server/src/eval/fixtures/gold/`.

import type { OrgId } from '../../../src/domain'
import type { Repo } from '../persistence/types'
import type {
  Attachment, BrokerEmail, ResearchReport, ReportSummary, EvidenceSnippet, BrokerStockOpinion,
} from '../../../src/domain'

export interface GoldFixtureDraft {
  readonly name: string
  readonly profile: string
  readonly sourceType: 'body' | 'attachment' | 'linked_webpage' | 'linked_pdf' | 'mixed'
  readonly notes: string
  readonly raw: unknown                          // RawEmailArtifact
  readonly expected: {
    readonly broker: string
    readonly origin?: 'direct_attachment' | 'direct_body' | 'digest_split'
    readonly primary?: {
      readonly ticker: string
      readonly rating?: string
      readonly stance?: string
      readonly targetPrice?: number
      readonly priorTargetPrice?: number
      readonly reportType?: string
    }
    readonly perTicker?: Readonly<Record<string, GoldFixtureDraft['expected']['primary']>>
    readonly minReports?: number
    readonly minEvidence?: number
    readonly linkedArtifactsContributed?: boolean
    readonly expectMaterialization: boolean
    readonly expectReviewCategories: readonly string[]
  }
}

export function promoteToGoldFixture(
  repo: Repo,
  orgId: OrgId,
  artifactId: string,
  opts: { readonly name: string; readonly profile?: string; readonly notes?: string } = { name: '' },
): GoldFixtureDraft | null {
  const raw = repo.getRawEmail(orgId, artifactId)
  if (!raw) return null

  const reports = repo.loadCanonicalForOrg(orgId).reports.filter((r) => r.sourceEmailId === reportIdFromMessage(raw, repo))
  // Best effort: find the email materialized from this raw artifact.
  const dump = repo.loadCanonicalForOrg(orgId)
  const email: BrokerEmail | undefined = dump.emails.find((e) => e.sourceMessageId === raw.messageId)
  const linkedReports: readonly ResearchReport[] = email
    ? dump.reports.filter((r) => r.sourceEmailId === email.id)
    : reports
  const summaries: readonly ReportSummary[] = linkedReports.map((r) =>
    dump.summaries.find((s) => s.reportId === r.id))
    .filter((s): s is ReportSummary => s !== undefined)
  const evidence: readonly EvidenceSnippet[] = linkedReports.flatMap((r) =>
    dump.evidence.filter((e) => e.reportId === r.id))

  // Decide single vs digest expectation.
  const profile = opts.profile ?? guessProfile(raw)
  const sourceType = guessSourceType(raw, dump.attachments, email?.id ?? null)
  const reviewItems = repo.listReviewItems(orgId, true)
    .filter((it) => it.artifactId === artifactId)
  const expectedReviewCategories = [...new Set(reviewItems.map((it) => it.reasonCategory))]

  const broker = (linkedReports[0]?.brokerId ?? raw.artifact.envelope.from) as unknown as string

  const draft: GoldFixtureDraft = {
    name: opts.name || `promoted-${artifactId}`,
    profile,
    sourceType,
    notes: opts.notes ?? `Promoted from production case ${artifactId} on ${new Date().toISOString().slice(0, 10)}.`,
    raw: raw.artifact,
    expected: {
      broker,
      ...(linkedReports.length > 1
        ? {
            origin: 'digest_split' as const,
            perTicker: Object.fromEntries(linkedReports.map((r) => {
              const s = summaries.find((x) => x.reportId === r.id) ?? null
              const t = (r.tickers[0] ?? null) as unknown as string
              return [t, expectedFor(r, s)]
            })),
          }
        : linkedReports[0]
        ? {
            origin: linkedReports[0].sourceAttachmentId ? 'direct_attachment' as const : 'direct_body' as const,
            primary: expectedFor(linkedReports[0], summaries[0] ?? null),
          }
        : {}),
      minReports: linkedReports.length > 0 ? linkedReports.length : 0,
      minEvidence: evidence.length > 0 ? Math.min(2, evidence.length) : 0,
      expectMaterialization: linkedReports.length > 0,
      expectReviewCategories: expectedReviewCategories,
    },
  }
  return draft
}

function expectedFor(r: ResearchReport, s: ReportSummary | null) {
  return {
    ticker: (r.tickers[0] ?? null) as unknown as string,
    rating: s?.rating ?? undefined,
    stance: s?.stance ?? undefined,
    targetPrice: s?.targetPrice ?? undefined,
    priorTargetPrice: s?.priorTargetPrice ?? undefined,
    reportType: r.reportType,
  }
}

function guessProfile(raw: { artifact: { envelope: { from: string; subject: string } } }): string {
  const from = raw.artifact.envelope.from.toLowerCase()
  const subject = raw.artifact.envelope.subject.toLowerCase()
  if (from.includes('kotak.com')) return 'kotak_pdf'
  if (from.includes('jmfl.com') && subject.includes('morning')) return 'jmfl_morning_brief'
  if (from.includes('jmfl.com') && subject.includes('research of the day')) return 'jmfl_research_of_day'
  if (from.includes('jmfl.com') && subject.includes('digest')) return 'jmfl_daily_digest'
  if (from.includes('iifl')) return 'iifl_html_single'
  return 'unknown'
}

function guessSourceType(
  raw: { artifact: { attachmentRefs: readonly unknown[]; linkedRefs: readonly { hint: string }[] } },
  attachments: readonly Attachment[],
  emailId: string | null,
): GoldFixtureDraft['sourceType'] {
  const hasAtt = raw.artifact.attachmentRefs.length > 0
    || (emailId ? attachments.some((a) => a.emailId as unknown as string === emailId) : false)
  const hasLinked = raw.artifact.linkedRefs.length > 0
  if (hasAtt && hasLinked) return 'mixed'
  if (hasAtt) return 'attachment'
  if (hasLinked) {
    const first = raw.artifact.linkedRefs[0]!
    return first.hint === 'pdf' ? 'linked_pdf' : 'linked_webpage'
  }
  return 'body'
}

// Small helper — keep linter happy and document the lookup intent.
function reportIdFromMessage(_raw: unknown, _repo: Repo): unknown {
  return null  // unused: we look up reports by sourceEmailId via the dump.
}

void reportIdFromMessage  // touch to avoid unused-export warnings
const _opinionsTypeBinding: readonly BrokerStockOpinion[] = []
void _opinionsTypeBinding
