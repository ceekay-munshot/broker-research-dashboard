// TEMPORARY SHIM. The broker catalog now lives in src/reference/brokerCatalog.ts
// (reference data, not a mock fixture — the live resolver depends on it). This
// re-export keeps the mock fixtures still behind the Mock⇄Live toggle working.
// Delete this file when the toggle and the mock fixtures are removed.
export { brokers } from '../reference/brokerCatalog'
