// ─────────────────────────────────────────────────────────────────────────
// Audit helpers — every set-action funnels through here so the entry shape
// stays consistent and `before/after` are stringified portably.
// ─────────────────────────────────────────────────────────────────────────

import type {
  OrgId, UserId, UserRole, ConfigAuditEntry, ConfigAuditArea,
} from '../../../src/domain'
import { asConfigAuditEntryId } from '../../../src/lib/ids'
import type { Repo } from '../persistence'

export interface AppendAuditArgs {
  readonly orgId: OrgId
  readonly area: ConfigAuditArea
  readonly key: string
  readonly before: unknown
  readonly after: unknown
  readonly actorUserId: UserId | null
  readonly actorRole: UserRole | null
  readonly reason: string | null
  readonly repo: Repo
  readonly now?: Date
}

export function appendAudit(args: AppendAuditArgs): ConfigAuditEntry {
  const occurredAt = (args.now ?? new Date()).toISOString()
  const entry: ConfigAuditEntry = {
    id: asConfigAuditEntryId(`aud_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`),
    orgId: args.orgId,
    area: args.area,
    key: args.key,
    before: args.before === undefined ? null : stringify(args.before),
    after: args.after === undefined ? null : stringify(args.after),
    actorUserId: args.actorUserId,
    actorRole: args.actorRole,
    reason: args.reason ?? null,
    occurredAt,
  }
  args.repo.appendConfigAuditEntry(entry)
  return entry
}

function stringify(v: unknown): string {
  if (v === null) return 'null'
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try { return JSON.stringify(v) } catch { return String(v) }
}
