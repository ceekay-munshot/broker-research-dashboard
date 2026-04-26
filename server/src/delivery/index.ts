// Barrel for the Module-25 delivery + workflow layer.

export { DeliveryRegistry } from './registry'
export { SubscriptionRegistry } from './subscriptions'
export { DeliveryDispatcher } from './dispatcher'
export type { DispatcherDeps, DispatchInputs } from './dispatcher'
export { DeliveryScheduler } from './scheduler'
export type { SchedulerDeps } from './scheduler'
export { fingerprintPayload, shouldSuppress, recordSuppression } from './suppression'
export {
  buildChannelConfigs, buildSubscriptionsForOrg,
} from './config'
export { ALL_TEMPLATES } from './templates'
export { buildChannels } from './channels/factory'
export type { DeliveryTemplateImpl, DeliveryChannelImpl, ChannelSendResult, ChannelSendInputs } from './types'

// Convenience: build a fully-wired registry from configs + scheduler.
import type { OrgId } from '../../../src/domain'
import type { Repo } from '../persistence'
import type { InMemoryStore } from '../store/InMemoryStore'
import type { SourceManager } from '../sources'
import { DeliveryRegistry } from './registry'
import { SubscriptionRegistry } from './subscriptions'
import { buildSubscriptionsForOrg, buildChannelConfigs } from './config'
import { ALL_TEMPLATES } from './templates'
import { buildChannels } from './channels/factory'
import { DeliveryScheduler } from './scheduler'

export interface BuildDeliveryStackArgs {
  readonly orgIds: readonly OrgId[]
  readonly repo: Repo
  readonly store: InMemoryStore
  readonly sourceManager?: SourceManager
  readonly env?: NodeJS.ProcessEnv
}

export interface DeliveryStack {
  readonly registry: DeliveryRegistry
  readonly scheduler: DeliveryScheduler
}

export function buildDeliveryStack(args: BuildDeliveryStackArgs): DeliveryStack {
  const env = args.env ?? process.env
  const subs = new SubscriptionRegistry()
  for (const orgId of args.orgIds) {
    for (const s of buildSubscriptionsForOrg(orgId, env)) subs.register(s)
  }
  const registry = new DeliveryRegistry(subs)
  for (const t of ALL_TEMPLATES) registry.registerTemplate(t)
  const channelConfigs = buildChannelConfigs(env)
  for (const c of channelConfigs) registry.registerChannelConfig(c)
  for (const ch of buildChannels(channelConfigs, { env })) registry.registerChannel(ch)
  const scheduler = new DeliveryScheduler({
    repo: args.repo, store: args.store, registry, sourceManager: args.sourceManager,
  })
  scheduler.ensureSchedules(args.orgIds)
  return { registry, scheduler }
}
