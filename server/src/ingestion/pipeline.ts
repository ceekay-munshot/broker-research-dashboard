import { readFile, readdir } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  InboundEmailFixture, AdmittedInboundEmail, IngestionRejection,
  DocumentTextExtractor,
} from '../types'
import { validateSender } from './validateSender'
import { PlainTextAndWeakPdfExtractor } from './extractText'
import { normalizeAdmittedEmail } from './normalize'
import { listEmlFixtures, loadAndProfileEml } from './emlLoader'
import type { InMemoryStore } from '../store/InMemoryStore'
import type { ProfileId } from './profiles'

// Orchestrator. On startup (or via `npm run server:ingest`) we walk the
// fixture tree, run each email through the admission gate, extract
// attachment text, normalize, and stash the produced records into the
// in-memory store. Rejections are counted + logged; nothing from a
// rejected fixture ever enters the store.
//
// There are two parallel input streams:
//
//   1. server/fixtures/emails/{accepted,rejected}/*.json — hand-authored
//      fixtures (the original Module-6 demo data) scoped to org_aranya.
//   2. server/fixtures/eml/*.eml — real broker emails (Module-7 samples)
//      scoped to org_vimana, routed through the MIME parser + parser
//      profile registry.
//
// Both feed the same InMemoryStore; each uses its own recipient allowlist
// resolution so the streams never collide.

export interface IngestionReport {
  readonly accepted: number
  readonly rejected: number
  readonly reportsProduced: number
  readonly opinionsProduced: number
  readonly evidenceProduced: number
  readonly profileHits: Readonly<Record<string, number>>
  readonly rejections: readonly IngestionRejection[]
  readonly acceptedByFile: readonly {
    readonly filename: string
    readonly profile: ProfileId
    readonly orgId: string
    readonly brokerId: string
    readonly candidateCount: number
  }[]
}

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURES_ROOT = resolve(HERE, '..', '..', 'fixtures')

export async function runIngestion(store: InMemoryStore, opts: {
  readonly extractor?: DocumentTextExtractor
  readonly fixturesRoot?: string
} = {}): Promise<IngestionReport> {
  const extractor = opts.extractor ?? new PlainTextAndWeakPdfExtractor()
  const root = opts.fixturesRoot ?? FIXTURES_ROOT

  let accepted = 0
  let reportsProduced = 0
  let opinionsProduced = 0
  let evidenceProduced = 0
  const profileHits: Record<string, number> = {}
  const rejections: IngestionRejection[] = []
  const acceptedByFile: IngestionReport['acceptedByFile'][number][] = []

  // ── Stream 1: legacy JSON fixtures (org_aranya demo) ──────────────
  for (const sub of ['accepted', 'rejected']) {
    const dir = join(root, 'emails', sub)
    let files: string[]
    try { files = await readdir(dir) } catch { continue }

    for (const file of files.filter((f) => f.endsWith('.json')).sort()) {
      const path = join(dir, file)
      const raw = JSON.parse(await readFile(path, 'utf8')) as InboundEmailFixture
      const fixtureDir = dirname(path)

      const result = validateSender(raw)
      if (!result.ok) { rejections.push(result.rejection); continue }

      const attachmentTexts = new Map<string, string>()
      try {
        for (const att of raw.attachments) {
          const absPath = resolve(fixtureDir, att.fixturePath)
          const text = await extractor.extract({
            absolutePath: absPath, mimeType: att.mimeType, filename: att.filename,
          })
          attachmentTexts.set(att.filename, text)
        }
      } catch (e) {
        rejections.push({
          messageId: raw.messageId,
          envelopeSender: raw.envelopeSender,
          recipient: raw.recipient,
          reason: 'EXTRACTION_FAILED',
          detail: e instanceof Error ? e.message : String(e),
          receivedAt: raw.receivedAt,
          orgId: result.orgId,
        })
        continue
      }

      const admitted: AdmittedInboundEmail = {
        fixture: raw,
        orgId: result.orgId,
        brokerId: result.brokerId,
        attachmentTexts,
      }
      const normalized = normalizeAdmittedEmail(admitted)

      store.upsertEmail(normalized.email)
      store.upsertAttachments(normalized.attachments)
      if (normalized.report) {
        store.upsertReport(normalized.report)
        reportsProduced += 1
      }
      if (normalized.summary) store.upsertSummary(normalized.summary)
      if (normalized.evidence.length > 0) {
        store.upsertEvidence(normalized.evidence)
        evidenceProduced += normalized.evidence.length
      }
      if (normalized.opinion) {
        store.upsertOpinion(normalized.opinion)
        opinionsProduced += 1
      }
      accepted += 1
      acceptedByFile.push({
        filename: file,
        profile: 'unknown',  // legacy path isn't profile-driven
        orgId: admitted.orgId as unknown as string,
        brokerId: admitted.brokerId as unknown as string,
        candidateCount: normalized.report ? 1 : 0,
      })
    }
  }

  // ── Stream 2: real .eml fixtures routed through parser profiles ──
  const emlDir = join(root, 'eml')
  for (const path of await listEmlFixtures(emlDir)) {
    const result = await loadAndProfileEml(path)
    if (result.kind === 'rejected') { rejections.push(result.rejection); continue }

    const { outputs, match, filename } = result
    store.upsertEmail(outputs.email)
    store.upsertAttachments(outputs.attachments)
    for (const c of outputs.candidates) {
      store.upsertReport(c.report)
      store.upsertSummary(c.summary)
      store.upsertEvidence(c.evidence)
      if (c.opinion) {
        store.upsertOpinion(c.opinion)
        opinionsProduced += 1
      }
      reportsProduced += 1
      evidenceProduced += c.evidence.length
    }
    accepted += 1
    profileHits[match.profileId] = (profileHits[match.profileId] ?? 0) + 1
    acceptedByFile.push({
      filename,
      profile: match.profileId,
      orgId: outputs.email.orgId as unknown as string,
      brokerId: match.brokerId as unknown as string,
      candidateCount: outputs.candidates.length,
    })
  }

  return {
    accepted,
    rejected: rejections.length,
    reportsProduced,
    opinionsProduced,
    evidenceProduced,
    profileHits,
    rejections,
    acceptedByFile,
  }
}
