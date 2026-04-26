// ─────────────────────────────────────────────────────────────────────────
// Operator CLI for the Module-25 delivery + workflow layer.
//
//   npm run ops -- delivery:list-schedules        [--org=<orgId>]
//   npm run ops -- delivery:list-subscriptions    [--org=<orgId>]
//   npm run ops -- delivery:list-channels
//   npm run ops -- delivery:run-due               [--org=<orgId>]
//   npm run ops -- delivery:preview --kind=<kind> [--org=<orgId>]
//   npm run ops -- delivery:resend --id=<attemptId>
//   npm run ops -- delivery:history               [--kind=<>] [--limit=<n>]
//   npm run ops -- delivery:suppressions          [--limit=<n>]
//   npm run ops -- delivery:channel-failures      [--limit=<n>]
//   npm run ops -- delivery:compare-payloads --before=<runId> --after=<runId>
//
// All commands print structured tables. Most are read-only; `run-due`,
// `resend`, `preview` (no side-effect) are the writers/effecters.
// ─────────────────────────────────────────────────────────────────────────

import type {
  OrgId, DeliveryContentKind,
} from '../../../src/domain'
import { DELIVERY_CONTENT_KINDS } from '../../../src/domain'
import {
  asDeliveryAttemptId, asDeliveryRunId,
} from '../../../src/lib/ids'
import type { DeliveryScheduler, DeliveryRegistry } from '../delivery'
import type { DeliveryDispatcher } from '../delivery/dispatcher'
import type { Repo } from '../persistence'

export interface DeliveryCliFlags {
  readonly orgId: OrgId
  readonly contentKind?: DeliveryContentKind
  readonly attemptId?: string
  readonly limit?: number
  readonly before?: string
  readonly after?: string
}

export function parseContentKind(s: string | undefined): DeliveryContentKind | undefined {
  if (!s) return undefined
  return DELIVERY_CONTENT_KINDS.includes(s as DeliveryContentKind) ? (s as DeliveryContentKind) : undefined
}

export function cmdDeliveryListSchedules(flags: DeliveryCliFlags, repo: Repo): void {
  const schedules = repo.listDeliverySchedules(flags.orgId)
  console.log('━'.repeat(72))
  console.log(`Delivery schedules — org=${flags.orgId as unknown as string}`)
  console.log('━'.repeat(72))
  console.log('content kind'.padEnd(28) + 'cadence'.padEnd(20) + 'enabled'.padEnd(9) + 'last fired           next due')
  for (const s of schedules) {
    console.log(
      s.contentKind.padEnd(28) + s.cadenceLabel.padEnd(20) +
      String(s.enabled).padEnd(9) +
      (s.lastFiredAt ?? '—').padEnd(22) + (s.nextDueAt ?? '—'),
    )
  }
}

export function cmdDeliveryListSubscriptions(flags: DeliveryCliFlags, registry: DeliveryRegistry): void {
  const subs = registry.subscriptions.listForOrg(flags.orgId)
  console.log('━'.repeat(72))
  console.log(`Delivery subscriptions — org=${flags.orgId as unknown as string}`)
  console.log('━'.repeat(72))
  for (const s of subs) {
    const filt = [
      s.filters.minSeverity ? `min=${s.filters.minSeverity}` : null,
      s.filters.heldOnly ? 'held-only' : null,
      s.filters.watchlistAllowed === false ? 'no-watchlist' : null,
    ].filter(Boolean).join(' ')
    console.log(`  ${s.contentKind.padEnd(28)} enabled=${s.enabled}  targets=${s.targets.length}  ${filt}`)
    for (const t of s.targets) {
      console.log(`      ${t.channel.padEnd(10)} ${t.label}  (enabled=${t.enabled})`)
    }
  }
}

export function cmdDeliveryListChannels(_flags: DeliveryCliFlags, registry: DeliveryRegistry): void {
  console.log('━'.repeat(72))
  console.log('Delivery channels')
  console.log('━'.repeat(72))
  for (const c of registry.listChannels()) {
    console.log(`  ${c.channel.padEnd(10)} available=${c.available}  ${c.description}`)
  }
}

export async function cmdDeliveryRunDue(flags: DeliveryCliFlags, scheduler: DeliveryScheduler): Promise<void> {
  const results = await scheduler.runDue(flags.orgId)
  if (results.length === 0) { console.log('no schedules due'); return }
  for (const r of results) {
    console.log(`[delivery:run-due] ${r.run.contentKind.padEnd(28)} status=${r.run.status.padEnd(18)} attempts=${r.attempts.length}` +
      (r.run.note ? ` · ${r.run.note}` : ''))
    for (const a of r.attempts) {
      console.log(`    ${a.channel.padEnd(10)} ${a.target.label.padEnd(28)} ${a.status}` +
        (a.errorMessage ? `  [${a.errorCategory}] ${a.errorMessage}` : ''))
    }
  }
}

export async function cmdDeliveryPreview(flags: DeliveryCliFlags, scheduler: DeliveryScheduler): Promise<void> {
  if (!flags.contentKind) { console.error('delivery:preview requires --kind=<kind>'); process.exit(2) }
  const preview = await scheduler.preview(flags.orgId, flags.contentKind)
  console.log('━'.repeat(72))
  console.log(`Delivery preview — ${preview.contentKind} (org=${preview.orgId as unknown as string})`)
  console.log(`generated=${preview.generatedAt}`)
  console.log('━'.repeat(72))
  if (preview.freshnessGate.checked) {
    console.log(`freshness gate: decision=${preview.freshnessGate.decision}`)
    if (preview.freshnessGate.blockingFailing.length) console.log(`  blocking (failing): ${preview.freshnessGate.blockingFailing.join(', ')}`)
    if (preview.freshnessGate.degradingStale.length)  console.log(`  degrading (stale):  ${preview.freshnessGate.degradingStale.join(', ')}`)
  }
  if (preview.reason) console.log(`reason: ${preview.reason}`)
  if (preview.payload) {
    console.log()
    console.log(`subject: ${preview.payload.subject}`)
    console.log(`fingerprint: ${preview.payload.fingerprint}`)
    console.log()
    console.log(preview.payload.text)
    console.log()
    console.log(`would deliver to:`)
    for (const t of preview.wouldDeliverTo)   console.log(`  + ${t.channel.padEnd(10)} ${t.label}`)
    for (const t of preview.wouldSuppressFor) console.log(`  · ${t.channel.padEnd(10)} ${t.label} (suppressed by recent send)`)
  }
}

export async function cmdDeliveryResend(flags: DeliveryCliFlags, dispatcher: DeliveryDispatcher): Promise<void> {
  if (!flags.attemptId) { console.error('delivery:resend requires --id=<attemptId>'); process.exit(2) }
  const id = asDeliveryAttemptId(flags.attemptId)
  const result = await dispatcher.retry(flags.orgId, id)
  if (!result) { console.log(`attempt ${flags.attemptId} not found`); return }
  console.log(`[delivery:resend] ${result.id as unknown as string} → ${result.status}` +
    (result.errorMessage ? `  [${result.errorCategory}] ${result.errorMessage}` : ''))
}

export function cmdDeliveryHistory(flags: DeliveryCliFlags, repo: Repo): void {
  const attempts = repo.listDeliveryAttempts(flags.orgId, {
    contentKind: flags.contentKind, limit: flags.limit ?? 30,
  })
  if (attempts.length === 0) { console.log('no delivery history'); return }
  console.log('time                  status      channel    kind                          target')
  console.log('-'.repeat(100))
  for (const a of attempts) {
    console.log(
      a.enqueuedAt.slice(0, 19).replace('T', ' ').padEnd(22) +
      a.status.padEnd(12) +
      a.channel.padEnd(11) +
      a.contentKind.padEnd(30) +
      a.target.label,
    )
  }
}

export function cmdDeliverySuppressions(flags: DeliveryCliFlags, repo: Repo): void {
  const sup = repo.listDeliverySuppressions(flags.orgId, { limit: flags.limit ?? 30 })
  if (sup.length === 0) { console.log('no active suppressions'); return }
  for (const s of sup) {
    console.log(`  ${s.contentKind.padEnd(28)} ${s.channel.padEnd(10)} fp=${s.fingerprint.slice(0, 12)}…  expires=${s.expiresAt}`)
  }
}

export function cmdDeliveryChannelFailures(flags: DeliveryCliFlags, repo: Repo): void {
  const attempts = repo.listDeliveryAttempts(flags.orgId, { limit: flags.limit ?? 200 })
    .filter((a) => a.status === 'failed')
  if (attempts.length === 0) { console.log('no recent failures'); return }
  const byCat = new Map<string, number>()
  for (const a of attempts) {
    const k = a.errorCategory ?? 'unknown'
    byCat.set(k, (byCat.get(k) ?? 0) + 1)
  }
  console.log('failures by category:')
  for (const [cat, n] of [...byCat.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${cat}`)
  }
  console.log()
  console.log('recent failures:')
  for (const a of attempts.slice(0, 20)) {
    console.log(`  ${a.enqueuedAt.slice(0, 19)}  ${a.channel.padEnd(10)} ${a.contentKind.padEnd(28)} ${a.target.label}`)
    console.log(`    [${a.errorCategory}] ${a.errorMessage ?? ''}`)
  }
}

export function cmdDeliveryComparePayloads(flags: DeliveryCliFlags, repo: Repo): void {
  if (!flags.before || !flags.after) {
    console.error('delivery:compare-payloads requires --before=<runId> --after=<runId>')
    process.exit(2)
  }
  const before = repo.getDeliveryRun(flags.orgId, asDeliveryRunId(flags.before))
  const after = repo.getDeliveryRun(flags.orgId, asDeliveryRunId(flags.after))
  if (!before || !after) { console.error('one or both runs not found'); process.exit(2) }
  console.log(`A  ${before.id as unknown as string}  ${before.startedAt}  status=${before.status}  fp=${before.fingerprint.slice(0, 12)}…`)
  console.log(`B  ${after.id as unknown as string}  ${after.startedAt}  status=${after.status}  fp=${after.fingerprint.slice(0, 12)}…`)
  console.log(`fingerprint match: ${before.fingerprint === after.fingerprint}`)
  if (before.fingerprint === after.fingerprint) {
    console.log('payloads are identical (same rendered content).')
  } else {
    console.log('payloads differ — different rendered content.')
  }
}
