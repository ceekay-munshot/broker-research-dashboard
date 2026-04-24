/// <reference types="vite/client" />

// Typed Vite env. Values are read via `import.meta.env.*`; Vite inlines
// these at build time based on .env[.mode] files. See .env.example and
// docs/modes.md for the full list and semantics.
interface ImportMetaEnv {
  /**
   * Which adapter backs getResearchAdapter() at runtime.
   *
   *   upstream          Production: external upstream API (read-only analytics client)
   *   local             Dev harness: local server/ parsing .eml fixtures
   *   mock              In-memory fixtures + engine (default; offline-friendly)
   *   mock-http         HttpResearchAdapter over stub fetch (adapter-layer tests)
   *   upstream-fixture  FixtureUpstreamAdapter over JSON fixtures in
   *                     src/adapters/upstream/fixtures (integration rehearsal)
   *
   * Legacy values `http` and `http-stub` are still accepted and mapped to
   * `upstream` and `mock-http` respectively (see AdapterMode.ts).
   */
  readonly VITE_RESEARCH_ADAPTER?: 'upstream' | 'local' | 'mock' | 'mock-http' | 'upstream-fixture' | 'http' | 'http-stub'
  /** Base URL for the HTTP adapter (required when mode=upstream or mode=local). */
  readonly VITE_API_BASE_URL?: string
  /**
   * Dev-only fallback bearer token. In production, the host supplies the
   * token via `window.__BROKER_RESEARCH_DASHBOARD__` or a URL param — see
   * `src/app/scopeBootstrap.ts` and docs/scope.md. This dashboard never
   * mints or refreshes tokens.
   */
  readonly VITE_API_TOKEN?: string
  /**
   * Raw-upstream → `/v1` normalization profile selector.
   *
   *   identity           (default) upstream already speaks /v1
   *   example |
   *   example-divergent  the bundled demonstration profile
   *
   * For a real vendor profile, the host injects the full profile object
   * via `window.__BROKER_RESEARCH_DASHBOARD__.normalizationProfile`. See
   * `docs/upstream-normalization-bridge.md`.
   */
  readonly VITE_UPSTREAM_PROFILE?: 'identity' | 'example' | 'example-divergent'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
