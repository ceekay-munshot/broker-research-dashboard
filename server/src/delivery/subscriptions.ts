// Subscription resolver: given an org + content kind, return the list of
// targets to deliver to. Filters live on the subscription record; the
// scheduler asks the resolver per content kind.

import type {
  OrgId, DeliveryContentKind, WorkflowSubscription, DeliveryTarget,
} from '../../../src/domain'

export class SubscriptionRegistry {
  private readonly byKey = new Map<string, WorkflowSubscription>()

  register(sub: WorkflowSubscription): void {
    this.byKey.set(this.key(sub.orgId, sub.contentKind), sub)
  }

  get(orgId: OrgId, kind: DeliveryContentKind): WorkflowSubscription | null {
    return this.byKey.get(this.key(orgId, kind)) ?? null
  }

  listForOrg(orgId: OrgId): readonly WorkflowSubscription[] {
    const out: WorkflowSubscription[] = []
    for (const s of this.byKey.values()) if (s.orgId === orgId) out.push(s)
    return out
  }

  /** Resolve effective targets — subscription enabled + target enabled. */
  resolveTargets(orgId: OrgId, kind: DeliveryContentKind): readonly DeliveryTarget[] {
    const sub = this.get(orgId, kind)
    if (!sub || !sub.enabled) return []
    return sub.targets.filter((t) => t.enabled)
  }

  private key(orgId: OrgId, kind: DeliveryContentKind): string {
    return `${orgId as unknown as string}::${kind}`
  }
}
