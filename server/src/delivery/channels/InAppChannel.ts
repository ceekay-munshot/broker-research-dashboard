// In-app channel — always available; the dispatcher persists the
// `DeliveryAttempt` (with `inAppBody`) and the dashboard's Inbox view
// reads it from the Repo. There's nothing else to send.

import type { DeliveryChannelImpl, ChannelSendInputs, ChannelSendResult } from '../types'

export class InAppChannel implements DeliveryChannelImpl {
  readonly channel = 'in_app' as const
  readonly available = true
  readonly description = 'in-app inbox (always available; reads from persisted DeliveryAttempt)'
  async send(_input: ChannelSendInputs): Promise<ChannelSendResult> {
    return { ok: true, latencyMs: 0 }
  }
}
