// ─────────────────────────────────────────────────────────────────────────
// Raw-upstream normalization bridge — types.
//
// This layer sits at the HTTP boundary. It takes whatever the real
// external upstream API returns on the wire and produces JSON that
// matches the dashboard's internal, documented `/v1` contract
// (see `docs/api-contract.md`). Everything above this layer — the
// mapper layer in `src/adapters/upstream/`, canonical domain types,
// view-models, Daily Worklog, change detection, stock / broker surfaces
// — sees only `/v1`-shaped input and does not know the wire ever looked
// different.
//
// Nothing here talks to React, the adapter factory, or any fetch impl.
// Pure JSON-to-JSON transforms keyed by endpoint.
// ─────────────────────────────────────────────────────────────────────────

/** A per-endpoint normalizer: takes whatever the upstream returned at that
 *  endpoint, returns JSON the `/v1` mappers can parse. */
export type EndpointNormalizer = (raw: unknown) => unknown

/** Endpoint keys line up one-to-one with the keys the `HttpResearchAdapter`
 *  uses when calling the HTTP client — e.g. `organization`, `brokers`,
 *  `researchReports`, `conflictClosure`, etc. See RESOURCE_CATALOG in
 *  `src/adapters/upstream/degraded.ts`. */
export interface UpstreamNormalizationProfile {
  /** Short identifier; surfaced in diagnostics + docs. */
  readonly name: string
  /** Human-readable description. Optional. */
  readonly description?: string
  /** Per-endpoint normalizers. Endpoints not present fall through to
   *  `defaultNormalizer`. */
  readonly endpoints: Readonly<Record<string, EndpointNormalizer>>
  /** Applied to any endpoint not listed in `endpoints`. */
  readonly defaultNormalizer: EndpointNormalizer
}
