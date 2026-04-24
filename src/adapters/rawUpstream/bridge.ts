// ─────────────────────────────────────────────────────────────────────────
// The bridge entry point.
//
// Everything above this layer consumes `/v1`-shaped JSON. Everything
// below (the raw wire) is whatever the external upstream actually ships.
// `normalizeRawUpstream` is the single function that translates between
// those two worlds, driven by a `UpstreamNormalizationProfile`.
//
// The `HttpClient` invokes this on every response. With the identity
// profile it is a no-op — existing `upstream` / `local` / `mock-http`
// modes are byte-for-byte unchanged.
// ─────────────────────────────────────────────────────────────────────────

import type { UpstreamNormalizationProfile } from './types'

export function normalizeRawUpstream(
  raw: unknown,
  endpointKey: string,
  profile: UpstreamNormalizationProfile,
): unknown {
  const norm = profile.endpoints[endpointKey] ?? profile.defaultNormalizer
  return norm(raw)
}
