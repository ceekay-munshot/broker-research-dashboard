import type {
  OrgId, UserId, BrokerId, EmailId, AttachmentId,
  ReportId, SummaryId, EvidenceId, SectorId,
  IngestionJobId, StockTicker, PortfolioId,
  AlertId, DigestId, DigestRunId, NotificationId, AlertRuleId,
  BenchmarkId, CalibrationSnapshotId, SignalEventId,
  CatalystId, PreEventBriefId, PostEventReviewId,
} from '../domain/ids'
import type { SourceId, SyncRunId, BackfillJobId } from '../domain/sources'
import type {
  DeliveryScheduleId, DeliveryRunId, DeliveryAttemptId,
  DeliveryTargetId, SubscriptionId, SuppressionId,
} from '../domain/delivery'

// Typed cast helpers. The runtime value is unchanged; the cast only narrows
// the compile-time type. Every entry point that receives a raw string (mock
// fixtures, URL params, API payloads) should funnel through one of these.

export const asOrgId          = (s: string): OrgId          => s as OrgId
export const asUserId         = (s: string): UserId         => s as UserId
export const asBrokerId       = (s: string): BrokerId       => s as BrokerId
export const asEmailId        = (s: string): EmailId        => s as EmailId
export const asAttachmentId   = (s: string): AttachmentId   => s as AttachmentId
export const asReportId       = (s: string): ReportId       => s as ReportId
export const asSummaryId      = (s: string): SummaryId      => s as SummaryId
export const asEvidenceId     = (s: string): EvidenceId     => s as EvidenceId
export const asSectorId       = (s: string): SectorId       => s as SectorId
export const asIngestionJobId = (s: string): IngestionJobId => s as IngestionJobId
export const asTicker         = (s: string): StockTicker    => s as StockTicker
export const asPortfolioId    = (s: string): PortfolioId    => s as PortfolioId
export const asAlertId        = (s: string): AlertId        => s as AlertId
export const asDigestId       = (s: string): DigestId       => s as DigestId
export const asDigestRunId    = (s: string): DigestRunId    => s as DigestRunId
export const asNotificationId = (s: string): NotificationId => s as NotificationId
export const asAlertRuleId    = (s: string): AlertRuleId    => s as AlertRuleId
export const asBenchmarkId    = (s: string): BenchmarkId    => s as BenchmarkId
export const asCalibrationSnapshotId = (s: string): CalibrationSnapshotId => s as CalibrationSnapshotId
export const asSignalEventId  = (s: string): SignalEventId  => s as SignalEventId
export const asCatalystId     = (s: string): CatalystId     => s as CatalystId
export const asPreEventBriefId = (s: string): PreEventBriefId => s as PreEventBriefId
export const asPostEventReviewId = (s: string): PostEventReviewId => s as PostEventReviewId

export const asSourceId      = (s: string): SourceId      => s as SourceId
export const asSyncRunId     = (s: string): SyncRunId     => s as SyncRunId
export const asBackfillJobId = (s: string): BackfillJobId => s as BackfillJobId

export const asDeliveryScheduleId = (s: string): DeliveryScheduleId => s as DeliveryScheduleId
export const asDeliveryRunId      = (s: string): DeliveryRunId      => s as DeliveryRunId
export const asDeliveryAttemptId  = (s: string): DeliveryAttemptId  => s as DeliveryAttemptId
export const asDeliveryTargetId   = (s: string): DeliveryTargetId   => s as DeliveryTargetId
export const asSubscriptionId     = (s: string): SubscriptionId     => s as SubscriptionId
export const asSuppressionId      = (s: string): SuppressionId      => s as SuppressionId
