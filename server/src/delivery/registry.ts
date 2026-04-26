// Registry: holds the active templates + channels + subscriptions for a
// running server. Built once at startup; the scheduler + CLI look things
// up here.

import type {
  DeliveryContentKind, DeliveryChannel, DeliveryChannelConfig,
} from '../../../src/domain'
import type { DeliveryTemplateImpl, DeliveryChannelImpl } from './types'
import type { SubscriptionRegistry } from './subscriptions'

export class DeliveryRegistry {
  private readonly templates = new Map<DeliveryContentKind, DeliveryTemplateImpl>()
  private readonly channels = new Map<DeliveryChannel, DeliveryChannelImpl>()
  private readonly channelConfigs = new Map<DeliveryChannel, DeliveryChannelConfig>()

  constructor(public readonly subscriptions: SubscriptionRegistry) {}

  registerTemplate(t: DeliveryTemplateImpl): void {
    this.templates.set(t.contentKind, t)
  }
  registerChannel(c: DeliveryChannelImpl): void {
    this.channels.set(c.channel, c)
  }
  registerChannelConfig(c: DeliveryChannelConfig): void {
    this.channelConfigs.set(c.channel, c)
  }

  template(kind: DeliveryContentKind): DeliveryTemplateImpl | null {
    return this.templates.get(kind) ?? null
  }
  channel(c: DeliveryChannel): DeliveryChannelImpl | null {
    return this.channels.get(c) ?? null
  }
  channelConfig(c: DeliveryChannel): DeliveryChannelConfig | null {
    return this.channelConfigs.get(c) ?? null
  }

  listTemplates(): readonly DeliveryTemplateImpl[] {
    return [...this.templates.values()]
  }
  listChannels(): readonly DeliveryChannelImpl[] {
    return [...this.channels.values()]
  }
  listChannelConfigs(): readonly DeliveryChannelConfig[] {
    return [...this.channelConfigs.values()]
  }
}
