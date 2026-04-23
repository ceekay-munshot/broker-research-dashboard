// Thin API facade for the research dashboard.
//
// The MVP resolves every call from local sample data in src/data/sampleData.js.
// When the ingestion backend lands, only the bodies of these functions need to
// change — the shapes they return should stay identical so the UI components
// never touch transport concerns.
//
// Intended real endpoints (rough sketch, subject to the backend spec):
//   GET  /api/kpis?window=7d
//   GET  /api/brokers
//   GET  /api/sectors
//   GET  /api/stocks
//   GET  /api/broker-ratings?ticker=&broker=
//   GET  /api/reports?since=&broker=&ticker=&sector=&stance=
//   GET  /api/divergences?minSpread=0.25

import {
  lastUpdated,
  kpis,
  brokers,
  sectors,
  stocks,
  brokerRatings,
  reports,
  divergences,
} from '../data/sampleData.js'

const USE_MOCK = true

// Simulate a small network round-trip so loading states behave naturally.
const delay = (ms = 80) => new Promise((res) => setTimeout(res, ms))

async function request(path, params) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  const res = await fetch(`/api${path}${qs}`, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`)
  return res.json()
}

export async function getLastUpdated() {
  if (USE_MOCK) { await delay(); return lastUpdated }
  return request('/last-updated')
}

export async function getKpis() {
  if (USE_MOCK) { await delay(); return kpis }
  return request('/kpis')
}

export async function getBrokers() {
  if (USE_MOCK) { await delay(); return brokers }
  return request('/brokers')
}

export async function getSectors() {
  if (USE_MOCK) { await delay(); return sectors }
  return request('/sectors')
}

export async function getStocks() {
  if (USE_MOCK) { await delay(); return stocks }
  return request('/stocks')
}

export async function getBrokerRatings(filters = {}) {
  if (USE_MOCK) {
    await delay()
    return brokerRatings.filter((r) =>
      (!filters.ticker || r.ticker === filters.ticker)
      && (!filters.broker || r.broker === filters.broker),
    )
  }
  return request('/broker-ratings', filters)
}

export async function getReports(filters = {}) {
  if (USE_MOCK) {
    await delay()
    return reports.filter((r) =>
      (!filters.broker  || r.broker === filters.broker)
      && (!filters.ticker || r.ticker === filters.ticker)
      && (!filters.stance || r.stance === filters.stance),
    )
  }
  return request('/reports', filters)
}

export async function getDivergences() {
  if (USE_MOCK) { await delay(); return divergences }
  return request('/divergences')
}
