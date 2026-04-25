// Public surface of the server-side raw-artifact processing pipeline.
//
// See `docs/pipeline.md` for the full data flow.

export type {
  ProcessingState,
} from './states'
export { TERMINAL_STATES, ADVANCING_STATES, isTerminal } from './states'
export {
  PipelineError, type PipelineErrorCategory,
} from './errors'
export type {
  RawEmailArtifact, RawAttachmentRef, RawLinkedRef,
  RawEmailArtifactJob, ProcessingHistoryEntry,
  ParsedEmailArtifact, ExtractedTextArtifact,
  ParsedReportCandidate, ParsedReportOrigin, EvidenceSpan,
  EnrichedReportCandidate, LlmEnrichment,
  MaterializedOutputs, MaterializationJob, ReviewQueueItem,
} from './models'
export {
  type ProvenanceRef, type ProvenanceSourceKind,
  provFromBody, provFromAttachment, provFromLinkedWebpage,
  provFromLinkedPdf, provFromLlm,
} from './provenance'

export * from './extract'
export * from './deterministic'
export * from './enrich'

export { Pipeline, type PipelineOptions, type PipelineRunResult } from './pipeline'
export { runJobs } from './runner'
export { ReviewQueue } from './reviewQueue'
export { materialize, deterministicId, type MaterializeInput, type MaterializeResult } from './materialize'
