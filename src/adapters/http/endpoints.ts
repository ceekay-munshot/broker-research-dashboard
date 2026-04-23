import type {
  BrokerId, EmailId, ReportId, SectorId, StockTicker,
} from '../../domain'

// Every HTTP path the adapter uses, in one place. Changing a URL is a
// one-file diff; changing an ID type triggers a compile error here.
//
// Backend contract reference: docs/api-contract.md

const v1 = (p: string) => `/v1${p}`
const enc = (id: string) => encodeURIComponent(id)

export const endpoints = {
  // Session
  sessionScope: () => v1('/session/scope'),

  // Tenant / catalog
  organization:  () => v1('/organization'),
  currentUser:   () => v1('/me'),

  brokers:       () => v1('/brokers'),
  broker:        (id: BrokerId) => v1(`/brokers/${enc(id as unknown as string)}`),

  sectors:       () => v1('/sectors'),
  sector:        (id: SectorId) => v1(`/sectors/${enc(id as unknown as string)}`),

  stocks:        () => v1('/stocks'),
  stock:         (ticker: StockTicker) => v1(`/stocks/${enc(ticker as unknown as string)}`),

  // Raw inbound pipeline
  brokerEmails:        () => v1('/broker-emails'),
  brokerEmail:         (id: EmailId) => v1(`/broker-emails/${enc(id as unknown as string)}`),
  attachmentsForEmail: (id: EmailId) => v1(`/broker-emails/${enc(id as unknown as string)}/attachments`),

  // Normalized research artifacts
  researchReports:  () => v1('/research-reports'),
  researchReport:   (id: ReportId) => v1(`/research-reports/${enc(id as unknown as string)}`),
  reportSummary:    (id: ReportId) => v1(`/research-reports/${enc(id as unknown as string)}/summary`),
  reportEvidence:   (id: ReportId) => v1(`/research-reports/${enc(id as unknown as string)}/evidence`),

  // Derived analytics
  opinions:               () => v1('/opinions'),
  conflictClosures:       () => v1('/conflict-closures'),
  conflictClosure:        (ticker: StockTicker) => v1(`/conflict-closures/${enc(ticker as unknown as string)}`),
  sectorIntelligenceList: () => v1('/sector-intelligence'),
  sectorIntelligenceFor:  (id: SectorId) => v1(`/sector-intelligence/${enc(id as unknown as string)}`),

  // Dashboard + ops
  kpiSnapshot:     () => v1('/kpi-snapshot'),
  ingestionStatus: () => v1('/ingestion-status'),
} as const
