import type { UpstreamNormalizationProfile } from '../types'
import { identity } from '../transforms'

/**
 * Default profile — the upstream already speaks `/v1`. Every response
 * passes through untouched. Use this when your production upstream
 * deliberately mirrors the contract in `docs/api-contract.md`.
 */
export const identityProfile: UpstreamNormalizationProfile = {
  name: 'identity',
  description: 'No-op. Upstream already speaks /v1 verbatim.',
  endpoints: {},
  defaultNormalizer: identity,
}
