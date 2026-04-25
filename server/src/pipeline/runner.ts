import type { OrgId } from '../../../src/domain'
import type { Pipeline } from './pipeline'
import type { MaterializationJob, RawEmailArtifact, RawEmailArtifactJob } from './models'

/** Run a batch of raw artifacts through the pipeline and produce a
 *  `MaterializationJob` summary. The pipeline writes through to its
 *  configured `InMemoryStore` if any. */
export async function runJobs(
  pipeline: Pipeline,
  artifacts: readonly RawEmailArtifact[],
): Promise<MaterializationJob> {
  const startedAt = new Date().toISOString()
  const jobs: RawEmailArtifactJob[] = []

  for (const a of artifacts) {
    const result = await pipeline.run(a)
    jobs.push(result.job)
  }

  const counts = {
    total: jobs.length,
    materialized: jobs.filter((j) => j.state === 'materialized_ready').length,
    failed:       jobs.filter((j) => j.state === 'failed').length,
    reviewNeeded: jobs.filter((j) => j.state === 'review_needed').length,
  }
  const orgId = (artifacts[0]?.orgId ?? 'org_unknown') as unknown as OrgId
  return {
    startedAt,
    completedAt: new Date().toISOString(),
    orgId,
    jobs,
    counts,
  }
}
