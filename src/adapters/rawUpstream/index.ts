// Public surface of the raw-upstream normalization bridge.
//
// See `docs/upstream-normalization-bridge.md` for the two-stage model.

export type { EndpointNormalizer, UpstreamNormalizationProfile } from './types'
export { normalizeRawUpstream } from './bridge'
export {
  compose, identity,
  unwrapEnvelope, camelCaseKeys,
  rename, alias,
  at, pluck,
  wrapAsPage, mapArray, mapPageItems,
  coerceNumericFields,
  type WrapAsPageOptions,
} from './transforms'
export { identityProfile } from './profiles/identity'
export { exampleDivergentProfile } from './profiles/exampleDivergent'
