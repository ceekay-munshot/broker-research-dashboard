// Operator CLI subcommands for the alerts/digest layer.
//
//   npm run ops -- alerts:morning   --org=org_aranya
//   npm run ops -- alerts:intraday  --org=org_aranya
//   npm run ops -- alerts:hygiene   --org=org_aranya
//   npm run ops -- alerts:list      --org=org_aranya [--severity=critical] [--limit=20]
//   npm run ops -- alerts:digest:preview --id=digest_morning_brief_org_aranya_...
//   npm run ops -- alerts:replay    --org=org_aranya --window=7d
//   npm run ops -- alerts:digest:compare --before=<digestId> --after=<digestId>
//   npm run ops -- alerts:suppressed --org=org_aranya
//
// Each command operates on the persistent Repo + the in-memory store
// the CLI bootstraps. The same code path runs on the server boot.

import type { OrgId, AlertEvent, AlertDigest, AlertSeverity, DigestKind } from '../../../src/domain'
import { asAlertId, asDigestId } from '../../../src/lib/ids'
import type { HybridCanonicalStore } from '../persistence'
import { runAlertsForStore } from '../alerts/bootstrap'
import { severityRank } from '../alerts/severity'

export interface AlertsCliFlags {
  readonly orgId: OrgId
  readonly severity?: AlertSeverity
  readonly limit?: number
  readonly id?: string
  readonly before?: string
  readonly after?: string
  readonly window?: string  // e.g. "7d" | "24h" | "4h"
  readonly kind?: DigestKind
}

export async function cmdAlertsMorning(flags: AlertsCliFlags, store: HybridCanonicalStore): Promise<void> {
  await runDigestKind(flags, store, 'morning_brief')
}
export async function cmdAlertsIntraday(flags: AlertsCliFlags, store: HybridCanonicalStore): Promise<void> {
  await runDigestKind(flags, store, 'intraday_critical')
}
export async function cmdAlertsHygiene(flags: AlertsCliFlags, store: HybridCanonicalStore): Promise<void> {
  await runDigestKind(flags, store, 'coverage_hygiene')
}

async function runDigestKind(
  flags: AlertsCliFlags,
  store: HybridCanonicalStore,
  kind: DigestKind,
): Promise<void> {
  await runAlertsForStore(store, [flags.orgId], 'cli')
  const d = store.latestDigest(flags.orgId, kind)
  if (!d) {
    console.log(`[alerts:${kind}] no digest produced for ${flags.orgId as unknown as string}`)
    return
  }
  printDigest(store, d)
}

export function cmdAlertsList(flags: AlertsCliFlags, store: HybridCanonicalStore): void {
  const limit = flags.limit ?? 30
  const items = store.listAlerts(flags.orgId, { limit, includeSuppressed: false })
  const filtered = flags.severity
    ? items.filter((a) => a.severity === flags.severity)
    : items
  if (filtered.length === 0) {
    console.log(`[alerts:list] none for ${flags.orgId as unknown as string}`)
    return
  }
  for (const a of filtered) {
    console.log(formatAlertLine(a))
  }
  console.log(`\n${filtered.length} alerts (severity rank order ↑)`)
}

export function cmdAlertsDigestPreview(flags: AlertsCliFlags, store: HybridCanonicalStore): void {
  if (!flags.id) {
    // Default: show latest morning brief.
    const d = store.latestDigest(flags.orgId, flags.kind ?? 'morning_brief')
    if (!d) { console.log('no digest available'); return }
    printDigest(store, d)
    return
  }
  const digest = store.getDigest(flags.orgId, asDigestId(flags.id))
  if (!digest) { console.error(`no digest with id=${flags.id}`); process.exit(2) }
  printDigest(store, digest)
}

export async function cmdAlertsReplay(flags: AlertsCliFlags, store: HybridCanonicalStore): Promise<void> {
  // Replay re-runs the alert engine from canonical state. The window
  // flag changes the digest window; the trigger windowStart is fixed at
  // (now - 7d) inside `runAlerts` and isn't tunable per CLI yet.
  const summary = await runAlertsForStore(store, [flags.orgId], 'replay')
  for (const s of summary) {
    console.log(`[alerts:replay] org=${s.orgId as unknown as string}  emitted=${s.emitted}  suppressed=${s.suppressed}  digests=${s.digests}`)
  }
}

export function cmdAlertsDigestCompare(flags: AlertsCliFlags, store: HybridCanonicalStore): void {
  if (!flags.before || !flags.after) {
    console.error('alerts:digest:compare requires --before=<id> --after=<id>')
    process.exit(2)
  }
  const a = store.getDigest(flags.orgId, asDigestId(flags.before))
  const b = store.getDigest(flags.orgId, asDigestId(flags.after))
  if (!a || !b) { console.error('one or both digests not found'); process.exit(2) }
  console.log(`A  ${a.kind}  ${a.generatedAt}  alerts=${a.alertCount}  topSeverity=${a.topSeverity ?? '—'}`)
  console.log(`B  ${b.kind}  ${b.generatedAt}  alerts=${b.alertCount}  topSeverity=${b.topSeverity ?? '—'}`)
  console.log()
  const aIds = new Set(a.sections.flatMap((s) => s.alertIds.map((x) => x as unknown as string)))
  const bIds = new Set(b.sections.flatMap((s) => s.alertIds.map((x) => x as unknown as string)))
  const onlyA = [...aIds].filter((id) => !bIds.has(id))
  const onlyB = [...bIds].filter((id) => !aIds.has(id))
  console.log(`only-in-A: ${onlyA.length}`)
  for (const id of onlyA.slice(0, 8)) {
    const ev = store.getAlert(a.orgId, asAlertId(id))
    if (ev) console.log(`  - [${ev.severity}] ${ev.headline}`)
  }
  console.log(`only-in-B: ${onlyB.length}`)
  for (const id of onlyB.slice(0, 8)) {
    const ev = store.getAlert(b.orgId, asAlertId(id))
    if (ev) console.log(`  - [${ev.severity}] ${ev.headline}`)
  }
}

export function cmdAlertsSuppressed(flags: AlertsCliFlags, store: HybridCanonicalStore): void {
  const items = store.listAlerts(flags.orgId, { includeSuppressed: true, limit: 200 })
  const sup = items.filter((a) => a.suppressed)
  if (sup.length === 0) {
    console.log(`[alerts:suppressed] none for ${flags.orgId as unknown as string}`)
    return
  }
  for (const a of sup) {
    console.log(`${a.id}  [${a.severity}]  ${a.kind}  ${a.headline}`)
    console.log(`  reason: ${a.suppressedReason ?? 'unknown'}`)
  }
  console.log(`\n${sup.length} suppressed`)
}

// ── Output helpers ──────────────────────────────────────────────────────

function formatAlertLine(a: AlertEvent): string {
  const tag = a.severity.padEnd(8)
  const kind = a.kind.padEnd(34)
  return `${tag} ${kind} ${a.headline}`
}

function printDigest(store: HybridCanonicalStore, d: AlertDigest): void {
  console.log('━'.repeat(72))
  console.log(`${d.title}    [${d.kind}]`)
  console.log(`${d.subtitle}`)
  console.log(`generated: ${d.generatedAt}`)
  console.log(`window:    ${d.windowStart} → ${d.windowEnd}`)
  console.log(`alerts:    ${d.alertCount}    topSeverity: ${d.topSeverity ?? '—'}`)
  if (d.executiveSummary) {
    console.log()
    console.log(`Executive: ${d.executiveSummary}${d.executiveSummaryFromLlm ? '  [LLM]' : ''}`)
  }
  for (const sec of d.sections) {
    console.log()
    console.log(`▾ ${sec.title}`)
    console.log(`  ${sec.subtitle}`)
    if (sec.prose) {
      console.log(`  ${sec.prose}${sec.proseFromLlm ? '  [LLM]' : ''}`)
    }
    if (sec.alertIds.length === 0) {
      console.log(`  (no items)`)
      continue
    }
    const items = sec.alertIds
      .map((id) => store.getAlert(d.orgId, asAlertId(id as unknown as string)))
      .filter((a): a is AlertEvent => !!a)
      .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    for (const a of items.slice(0, 8)) {
      console.log(`  - [${a.severity}] ${a.headline}`)
    }
    if (items.length > 8) console.log(`  …+${items.length - 8} more`)
  }
  console.log('━'.repeat(72))
}
