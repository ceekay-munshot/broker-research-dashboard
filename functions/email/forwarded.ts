// Cloudflare Pages Function: GET /email/forwarded?page=&limit=
//
// Same-origin proxy for the Munshot forwarded-email feed. The browser calls
// this route; the function injects the bearer token server-side and forwards
// to the real backend. The token is a Cloudflare SECRET (FORWARDED_API_TOKEN)
// — it is NEVER shipped to the browser bundle, and signed URLs in the payload
// are passed through untouched but never logged.
//
// Why a proxy (not a direct browser→backend call):
//   • keeps the admin/user JWT out of the public client bundle
//   • avoids cross-origin CORS between the dashboard origin and the API host
//
// Env (set via `.dev.vars` locally, Pages secrets in prod):
//   FORWARDED_API_BASE   e.g. https://fastapi.muns.io   (no trailing slash)
//   FORWARDED_API_TOKEN  bearer JWT for the Munshot backend
//
// The dashboard's emailApiClient calls `<origin>/email/forwarded?page&limit`;
// set VITE_BACKEND_API_URL to the site origin so that resolves here.

interface Env {
  readonly FORWARDED_API_BASE?: string
  readonly FORWARDED_API_TOKEN?: string
}

const REQUEST_TIMEOUT_MS = 30_000

export async function onRequestGet(
  context: { request: Request; env: Env },
): Promise<Response> {
  const { request, env } = context
  const url = new URL(request.url)

  const base = (env.FORWARDED_API_BASE ?? '').replace(/\/+$/, '')
  const token = env.FORWARDED_API_TOKEN ?? ''
  if (!base || !token) {
    return json(
      { error: 'proxy_not_configured', detail: 'FORWARDED_API_BASE / FORWARDED_API_TOKEN are unset on the Pages Function.' },
      500,
    )
  }

  // Whitelist + sanitise the only two query params we forward.
  const page = clampInt(url.searchParams.get('page'), 1, 1, 100_000)
  const limit = clampInt(url.searchParams.get('limit'), 100, 1, 100)
  const upstream = `${base}/email/forwarded?page=${page}&limit=${limit}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(upstream, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      signal: controller.signal,
    })

    // Pass the body through verbatim so the client-side transform sees the
    // backend's exact shape. Force JSON content-type; never cache (per-user,
    // token-scoped data) and never echo the upstream's auth headers.
    const body = await res.text()
    return new Response(body, {
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') ?? 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    })
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError'
    return json(
      { error: aborted ? 'upstream_timeout' : 'upstream_unreachable' },
      502,
    )
  } finally {
    clearTimeout(timer)
  }
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = raw === null ? NaN : Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(Math.trunc(n), max))
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}
