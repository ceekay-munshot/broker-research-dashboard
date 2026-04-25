// ─────────────────────────────────────────────────────────────────────────
// Portfolio input seam.
//
// The dashboard reads portfolio state via a `PortfolioInputProvider` so we
// can swap the source without touching the relevance/coverage engines or
// the UI. Today we ship:
//
//   - FixturePortfolioProvider — reads from src/mocks/portfolios.ts
//   - HttpPortfolioProvider    — fetches GET /v1/portfolio-snapshot
//   - EmptyPortfolioProvider   — returns null (graceful "no portfolio")
//
// Future sources slot in as additional implementations:
//   - CsvPortfolioProvider     — local file-backed dev fixture
//   - PortfolioApiProvider     — third-party portfolio API
//
// The provider is consumed inside the ResearchAdapter implementations
// (Mock + HTTP) so the higher layers see a single uniform contract:
//   adapter.getPortfolioSnapshot(scope): Promise<PortfolioSnapshot | null>
// ─────────────────────────────────────────────────────────────────────────

import type { OrgScope, PortfolioSnapshot } from '../../domain'
import { portfolioSnapshots } from '../../mocks'

export interface PortfolioInputProvider {
  /** Returns the snapshot for the scope's org, or null if none. */
  getPortfolioSnapshot(scope: OrgScope): Promise<PortfolioSnapshot | null>
}

/** Reads from the in-memory `portfolioSnapshots` fixture array. */
export class FixturePortfolioProvider implements PortfolioInputProvider {
  async getPortfolioSnapshot(scope: OrgScope): Promise<PortfolioSnapshot | null> {
    const snap = portfolioSnapshots.find((p) => p.orgId === scope.orgId) ?? null
    return snap
  }
}

/** Always returns null. Use when no portfolio source is configured yet. */
export class EmptyPortfolioProvider implements PortfolioInputProvider {
  async getPortfolioSnapshot(_scope: OrgScope): Promise<PortfolioSnapshot | null> {
    return null
  }
}
