// ─────────────────────────────────────────────────────────────────────────
// Forwarded-email feed bootstrap.
//
// Resolves the GET /email/forwarded feed into the ServerOutputAdapter before
// the first render:
//   • VITE_BACKEND_API_URL set → fetch the feed live, paginated.
//   • else VITE_PREVIEW_FIXTURE set → load the bundled sample response.
//   • else → no-op; the dashboard renders its empty shell.
//
// Inert in a build that sets neither flag. The bearer token (when fetching
// live) comes from the existing scope bootstrap — this never mints tokens.
// ─────────────────────────────────────────────────────────────────────────

import { getServerOutputAdapter } from '../adapters'
import { readScopeBootstrap } from './scopeBootstrap'
import {
  emailApiResponseToServerOutput,
  emailApiPagesToServerOutput,
} from '../adapters/serverOutput/emailApiTransform'
import { fetchForwardedEmailsDataset } from '../adapters/serverOutput/emailApiClient'
import type { DashboardServerOutput } from '../adapters/serverOutput/types'

/** Resolve the bearer token from the host scope bootstrap (a string or a
 *  provider function) or the dev-fallback env var. Never mints tokens. */
async function resolveAuthToken(): Promise<string | null> {
  const raw = readScopeBootstrap().token ?? import.meta.env.VITE_API_TOKEN
  const value = typeof raw === 'function' ? await raw() : raw
  return value ?? null
}

/** Resolve the target user index for `user_index` (API doc §2.3, §3.1).
 *  Required for service-token requests, ignored with a user JWT. */
function resolveUserIndex(): number | string | null {
  const hint = readScopeBootstrap().userIndexHint ?? import.meta.env.VITE_API_USER_INDEX
  return hint === undefined || hint === '' ? null : hint
}

export async function applyPreviewFixture(): Promise<void> {
  const backendUrl = import.meta.env.VITE_BACKEND_API_URL
  const useFixture = !!import.meta.env.VITE_PREVIEW_FIXTURE
  if (!backendUrl && !useFixture) return

  const adapter = getServerOutputAdapter()
  if (!adapter) {
    // eslint-disable-next-line no-console
    console.warn('[email-feed] active adapter is not the ServerOutputAdapter — skipping.')
    return
  }

  try {
    let payload: DashboardServerOutput
    if (backendUrl) {
      const pages = await fetchForwardedEmailsDataset({
        baseUrl: backendUrl,
        token: await resolveAuthToken(),
        userIndex: resolveUserIndex(),
      })
      // Live data: keep backend timestamps exactly as received — never
      // anchor, or customer-facing report dates and Today become wrong.
      payload = emailApiPagesToServerOutput(pages)
    } else {
      // Bundled sample only: anchor to now so the static fixture's
      // date-filtered surfaces (e.g. Today) are not empty in QA.
      const mod = await import('../adapters/serverOutput/previewFixture/emailApiResponse.sample.json')
      payload = emailApiResponseToServerOutput(mod.default, { anchorToNow: true })
    }
    adapter.setPayload(payload)
    // eslint-disable-next-line no-console
    console.info(
      `[email-feed] loaded ${payload.reports.length} reports, ` +
      `${payload.brokers.length} brokers, ${payload.stocks.length} stocks, ` +
      `${payload.opinions.length} opinions.`,
    )
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[email-feed] failed to load the forwarded-email feed:', err)
  }
}
