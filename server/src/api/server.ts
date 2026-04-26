import { createServer, type Server } from 'node:http'
import { buildRouter } from './routes'
import type { InMemoryStore } from '../store/InMemoryStore'
import type { SourceManager } from '../sources'
import type { Repo } from '../persistence'

export interface StartServerOptions {
  readonly port: number
  readonly store: InMemoryStore
  readonly logRequests?: boolean
  /** Optional source manager — when provided, /v1/sources/health is served. */
  readonly sourceManager?: SourceManager
  /** Optional repo — when provided, /v1/deliveries is served. */
  readonly repo?: Repo
}

export async function startApiServer(opts: StartServerOptions): Promise<Server> {
  const router = buildRouter(opts.store, {
    sourceManager: opts.sourceManager,
    repo: opts.repo,
  })

  const server = createServer(async (req, res) => {
    const t0 = Date.now()
    await router.dispatch(req, res)
    if (opts.logRequests ?? true) {
      const ms = Date.now() - t0
      // eslint-disable-next-line no-console
      console.log(`${req.method} ${req.url} ${res.statusCode} ${ms}ms`)
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(opts.port, () => resolve())
  })

  return server
}
