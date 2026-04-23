/// <reference types="vite/client" />

// Typed Vite env. Values are read via `import.meta.env.*`; Vite inlines
// these at build time based on .env[.mode] files. See .env.example and
// docs/api-contract.md for the full list and semantics.
interface ImportMetaEnv {
  /** Which adapter backs getResearchAdapter() at runtime. Default: 'mock'. */
  readonly VITE_RESEARCH_ADAPTER?: 'mock' | 'http' | 'http-stub'
  /** Base URL for the HTTP adapter (required when VITE_RESEARCH_ADAPTER=http). */
  readonly VITE_API_BASE_URL?: string
  /** Optional bearer token used for Authorization header. */
  readonly VITE_API_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
