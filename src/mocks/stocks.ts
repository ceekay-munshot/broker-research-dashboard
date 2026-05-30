// TEMPORARY SHIM. The stock "company master" now lives in
// src/reference/stockCatalog.ts (reference data the live entityRole/resolver
// depend on). This re-export keeps the mock fixtures still behind the Mock⇄Live
// toggle working. Delete this file when the toggle and the mocks are removed.
export { stocks } from '../reference/stockCatalog'
