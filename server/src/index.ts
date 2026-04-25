import { runIngestion } from './ingestion'
import { startApiServer } from './api/server'
import { HybridCanonicalStore, createDefaultRepo } from './persistence'
import { organizations } from './config/organizations'

// Entry point for both `npm run server:dev` (ingest + serve) and
// `npm run server:ingest` (ingest only, print summary, exit).
//
// As of Module 14, the server boots a `HybridCanonicalStore` backed by
// the configured `Repo` (default: JsonFileRepo at SERVER_DATA_DIR).
// The store hydrates from the repo on cold start, so the API serves
// previously-materialized records instantly without waiting for a sync.

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2))
  const ingestOnly = args.has('--ingest-only')
  const port = Number(process.env.SERVER_PORT ?? 4000)

  const repo = createDefaultRepo()
  const store = new HybridCanonicalStore(repo)
  store.hydrateFrom(organizations.map((o) => o.id))

  console.log('┌─ ingestion ────────────────────────────────────────────')
  const report = await runIngestion(store)
  console.log(`│  accepted:          ${report.accepted}`)
  console.log(`│  rejected:          ${report.rejected}`)
  console.log(`│  reports produced:  ${report.reportsProduced}`)
  console.log(`│  opinions produced: ${report.opinionsProduced}`)
  console.log(`│  evidence produced: ${report.evidenceProduced}`)
  if (report.rejections.length > 0) {
    console.log('│')
    console.log('│  rejections:')
    for (const r of report.rejections) {
      console.log(`│    • [${r.reason}] ${r.envelopeSender} → ${r.recipient}`)
      console.log(`│        ${r.detail}`)
    }
  }
  console.log('└────────────────────────────────────────────────────────')

  if (ingestOnly) {
    // eslint-disable-next-line no-process-exit
    process.exit(0)
  }

  const server = await startApiServer({ port, store })
  const addr = server.address()
  const url = typeof addr === 'object' && addr !== null ? `http://localhost:${addr.port}` : `http://localhost:${port}`
  console.log(`API listening on ${url}`)
  console.log(`Point the frontend with:`)
  console.log(`  VITE_RESEARCH_ADAPTER=http VITE_API_BASE_URL=${url} VITE_API_TOKEN=dev-token npm run dev`)
}

main().catch((err) => {
  console.error('[server] fatal', err)
  // eslint-disable-next-line no-process-exit
  process.exit(1)
})
