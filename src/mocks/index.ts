// Barrel for every mock fixture. This is the only module the
// MockResearchAdapter imports from; treating it as a single data source keeps
// the adapter's filter logic easy to read.

export { organizations, DEFAULT_ORG_ID, SECONDARY_ORG_ID } from './organizations'
export { users, DEFAULT_USER_ID } from './users'
export { brokers } from './brokers'
export { sectors } from './sectors'
export { stocks } from './stocks'
export { brokerEmails } from './emails'
export { attachments } from './attachments'
export { reports } from './reports'
export { summaries } from './summaries'
export { evidenceSnippets } from './evidenceSnippets'
export { brokerStockOpinions } from './opinions'
export { consensusViews } from './consensus'
export { divergenceCases } from './divergences'
export { sectorKnowledgeItems } from './sectorKnowledge'
export { ingestionJobs } from './ingestionJobs'
export { kpiSnapshots, ingestionStatuses } from './kpi'
