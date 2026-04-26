import type {
  BrokerId, EmailId, ReportId, SectorId, StockTicker,
  AlertId, DigestId, AlertTriggerKind,
  CatalystId, PostEventReviewId,
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

  // Portfolio / watchlist
  portfolioSnapshot: () => v1('/portfolio-snapshot'),

  // Alerts / digests
  alerts:                () => v1('/alerts'),
  alert:                 (id: AlertId) => v1(`/alerts/${enc(id as unknown as string)}`),
  alertDigests:          () => v1('/alert-digests'),
  alertDigest:           (id: DigestId) => v1(`/alert-digests/${enc(id as unknown as string)}`),
  latestAlertDigest:     () => v1('/alert-digests/latest'),

  // Calibration / signal effectiveness
  calibrationSnapshot:        () => v1('/calibration/snapshot'),
  brokerCalibrations:         () => v1('/calibration/brokers'),
  brokerCalibration:          (id: BrokerId) => v1(`/calibration/brokers/${enc(id as unknown as string)}`),
  alertEffectivenessList:     () => v1('/calibration/alerts'),
  alertEffectiveness:         (kind: AlertTriggerKind) => v1(`/calibration/alerts/${enc(kind as unknown as string)}`),
  coverageSignal:             (t: StockTicker) => v1(`/calibration/coverage/${enc(t as unknown as string)}`),

  // Catalysts
  catalysts:                  () => v1('/catalysts'),
  catalyst:                   (id: CatalystId) => v1(`/catalysts/${enc(id as unknown as string)}`),
  catalystBrief:              (id: CatalystId) => v1(`/catalysts/${enc(id as unknown as string)}/brief`),
  postEventReviews:           () => v1('/post-event-reviews'),
  postEventReview:            (id: PostEventReviewId) => v1(`/post-event-reviews/${enc(id as unknown as string)}`),
  catalystPostEventReview:    (id: CatalystId) => v1(`/catalysts/${enc(id as unknown as string)}/post-event-review`),

  // Sources (Module 24)
  sourcesHealth:              () => v1('/sources/health'),

  // Delivery (Module 25)
  deliveries:                 () => v1('/deliveries'),
  delivery:                   (id: string) => v1(`/deliveries/${enc(id)}`),

  // Usage / pilot analytics (Module 26)
  usageEvents:                () => v1('/usage/events'),
  usageSnapshot:              () => v1('/usage/snapshot'),
  usageRoi:                   () => v1('/usage/roi'),
} as const
