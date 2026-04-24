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
import type { InMemoryStore } from '../store/InMemoryStore'

// Orchestrator. On startup (or via `npm run server:ingest`) we walk the
// fixture tree, run each email through the admission gate, extract
// attachment text, normalize, and stash the produced records into the
// in-memory store. Rejections are counted + logged; nothing from a
// rejected fixture ever enters the store.

export interface IngestionReport {
  readonly accepted: number
  readonly rejected: number
  readonly reportsProduced: number
  readonly opinionsProduced: number
  readonly evidenceProduced: number
  readonly rejections: readonly IngestionRejection[]
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
  const rejections: IngestionRejection[] = []

  // Accepted and rejected trees are kept in distinct directories purely
  // for fixture ergonomics; the pipeline treats them identically.
  for (const sub of ['accepted', 'rejected']) {
    const dir = join(root, 'emails', sub)
    let files: string[]
    try {
      files = await readdir(dir)
    } catch {
      // Missing dir is fine — absence of rejected fixtures is allowed.
      continue
    }
    for (const file of files.filter((f) => f.endsWith('.json')).sort()) {
      const path = join(dir, file)
      const raw = JSON.parse(await readFile(path, 'utf8')) as InboundEmailFixture
      const fixtureDir = dirname(path)

      const result = validateSender(raw)
      if (!result.ok) {
        rejections.push(result.rejection)
        continue
      }

      // Extract every attachment's text up-front; a single-attachment
      // failure rejects the whole email (fail-safe; we'd rather surface
      // extraction problems than persist partial records).
      const attachmentTexts = new Map<string, string>()
      try {
        for (const att of raw.attachments) {
          const absPath = resolve(fixtureDir, att.fixturePath)
          const text = await extractor.extract({
            absolutePath: absPath,
            mimeType: att.mimeType,
            filename: att.filename,
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
    }
  }

  return {
    accepted,
    rejected: rejections.length,
    reportsProduced,
    opinionsProduced,
    evidenceProduced,
    rejections,
  }
}
