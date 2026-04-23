import type { IngestionJob } from '../domain'
import {
  asOrgId, asEmailId, asIngestionJobId,
} from '../lib/ids'

// One IngestionJob per BrokerEmail. Status mirrors the email's current
// pipeline state; completedAt is set only for terminal states.
export const ingestionJobs: readonly IngestionJob[] = [
  // Acme ready
  j('job_0001', 'org_acme', 'eml_0001', 'ready',       '2026-04-22T11:14:25.000Z', '2026-04-22T11:18:02.000Z'),
  j('job_0002', 'org_acme', 'eml_0002', 'ready',       '2026-04-22T12:05:12.000Z', '2026-04-22T12:09:44.000Z'),
  j('job_0003', 'org_acme', 'eml_0003', 'ready',       '2026-04-22T13:02:03.000Z', '2026-04-22T13:05:01.000Z'),
  j('job_0004', 'org_acme', 'eml_0004', 'ready',       '2026-04-22T14:18:47.000Z', '2026-04-22T14:22:40.000Z'),
  j('job_0005', 'org_acme', 'eml_0005', 'ready',       '2026-04-22T09:42:21.000Z', '2026-04-22T09:46:58.000Z'),
  j('job_0006', 'org_acme', 'eml_0006', 'ready',       '2026-04-22T10:28:08.000Z', '2026-04-22T10:33:55.000Z'),
  j('job_0007', 'org_acme', 'eml_0007', 'ready',       '2026-04-22T15:12:42.000Z', '2026-04-22T15:15:14.000Z'),
  j('job_0008', 'org_acme', 'eml_0008', 'ready',       '2026-04-21T13:55:33.000Z', '2026-04-21T13:58:41.000Z'),
  j('job_0009', 'org_acme', 'eml_0009', 'ready',       '2026-04-18T14:08:14.000Z', '2026-04-18T14:11:02.000Z'),
  j('job_0010', 'org_acme', 'eml_0010', 'ready',       '2026-04-22T08:02:05.000Z', '2026-04-22T08:05:38.000Z'),
  j('job_0011', 'org_acme', 'eml_0011', 'ready',       '2026-04-17T12:30:02.000Z', '2026-04-17T12:32:28.000Z'),
  j('job_0012', 'org_acme', 'eml_0012', 'ready',       '2026-04-22T11:48:25.000Z', '2026-04-22T11:52:19.000Z'),
  j('job_0013', 'org_acme', 'eml_0013', 'ready',       '2026-04-16T10:11:52.000Z', '2026-04-16T10:14:21.000Z'),
  j('job_0014', 'org_acme', 'eml_0014', 'ready',       '2026-04-22T14:44:03.000Z', '2026-04-22T14:46:18.000Z'),
  j('job_0015', 'org_acme', 'eml_0015', 'ready',       '2026-04-14T16:21:02.000Z', '2026-04-14T16:25:40.000Z'),
  j('job_0016', 'org_acme', 'eml_0016', 'ready',       '2026-04-15T13:15:02.000Z', '2026-04-15T13:17:40.000Z'),
  j('job_0017', 'org_acme', 'eml_0017', 'ready',       '2026-04-23T08:11:47.000Z', '2026-04-23T08:16:22.000Z'),
  j('job_0018', 'org_acme', 'eml_0018', 'ready',       '2026-04-23T09:02:21.000Z', '2026-04-23T09:05:17.000Z'),
  j('job_0019', 'org_acme', 'eml_0019', 'ready',       '2026-04-23T10:18:02.000Z', '2026-04-23T10:21:40.000Z'),
  j('job_0020', 'org_acme', 'eml_0020', 'ready',       '2026-04-18T11:34:25.000Z', '2026-04-18T11:38:08.000Z'),
  j('job_0021', 'org_acme', 'eml_0021', 'ready',       '2026-04-15T15:50:02.000Z', '2026-04-15T15:52:41.000Z'),
  j('job_0022', 'org_acme', 'eml_0022', 'ready',       '2026-04-19T12:00:02.000Z', '2026-04-19T12:03:31.000Z'),

  // Acme in-flight
  j('job_0023', 'org_acme', 'eml_0023', 'queued',      '2026-04-23T11:02:02.000Z', null),
  j('job_0024', 'org_acme', 'eml_0024', 'queued',      '2026-04-23T11:18:02.000Z', null),
  j('job_0025', 'org_acme', 'eml_0025', 'queued',      '2026-04-23T11:41:02.000Z', null),
  j('job_0026', 'org_acme', 'eml_0026', 'parsing',     '2026-04-23T10:50:03.000Z', null),
  j('job_0027', 'org_acme', 'eml_0027', 'parsing',     '2026-04-23T10:32:03.000Z', null),
  j('job_0028', 'org_acme', 'eml_0028', 'failed',      '2026-04-22T19:10:02.000Z', '2026-04-22T19:11:18.000Z',
    'pdf_extraction_failed: image-only pages, OCR worker unavailable'),
  j('job_0029', 'org_acme', 'eml_0029', 'skipped',     '2026-04-20T17:30:02.000Z', '2026-04-20T17:30:02.000Z',
    'skipped: calendar invite, no research content'),
  j('job_0030', 'org_acme', 'eml_0030', 'skipped',     '2026-04-19T16:00:02.000Z', '2026-04-19T16:00:02.000Z',
    'skipped: disclaimer-only, no ticker payload'),

  // Northstar
  j('job_0031', 'org_northstar', 'eml_0031', 'ready',  '2026-04-22T11:14:26.000Z', '2026-04-22T11:18:49.000Z'),
  j('job_0032', 'org_northstar', 'eml_0032', 'ready',  '2026-04-22T09:42:22.000Z', '2026-04-22T09:46:17.000Z'),
  j('job_0033', 'org_northstar', 'eml_0033', 'ready',  '2026-04-21T13:55:35.000Z', '2026-04-21T13:59:11.000Z'),
  j('job_0034', 'org_northstar', 'eml_0034', 'ready',  '2026-04-21T11:18:05.000Z', '2026-04-21T11:20:42.000Z'),
  j('job_0035', 'org_northstar', 'eml_0035', 'ready',  '2026-04-23T08:11:48.000Z', '2026-04-23T08:16:55.000Z'),
  j('job_0036', 'org_northstar', 'eml_0036', 'queued', '2026-04-23T11:05:02.000Z', null),
  j('job_0037', 'org_northstar', 'eml_0037', 'parsing','2026-04-23T09:40:02.000Z', null),
  j('job_0038', 'org_northstar', 'eml_0038', 'skipped','2026-04-20T14:00:02.000Z', '2026-04-20T14:00:02.000Z',
    'skipped: disclaimer-only'),
]

function j(
  id: string, orgId: string, emailId: string,
  status: IngestionJob['status'],
  startedAt: string, completedAt: string | null,
  failureReason: string | null = null,
): IngestionJob {
  return {
    id: asIngestionJobId(id),
    orgId: asOrgId(orgId),
    emailId: asEmailId(emailId),
    status,
    startedAt,
    completedAt,
    failureReason,
    pipelineVersion: 'pipeline@2026.04.3',
  }
}
