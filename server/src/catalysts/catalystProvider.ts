// ─────────────────────────────────────────────────────────────────────────
// Catalyst input seam.
//
// The catalyst engine reads upcoming events through a `CatalystInputProvider`
// so we can swap the source without touching the engine, the API, or the
// UI. Today we ship:
//
//   - FixtureCatalystProvider — backed by src/mocks/catalysts.ts
//   - EmptyCatalystProvider   — returns nothing; engine produces empty
//                                calendars (graceful)
//
// Future integrations slot in as additional implementations:
//   - HttpCatalystProvider — fetch from an external calendar API
//   - CsvCatalystProvider  — local file-backed dev fixture
// ─────────────────────────────────────────────────────────────────────────

import type { CatalystEvent, OrgId } from '../../../src/domain'
import { catalystEvents } from '../../../src/mocks/catalysts'

export interface CatalystInputProvider {
  /** Return all catalysts known for the org. The engine filters by
   *  `expectedAt` and book context. */
  listCatalysts(orgId: OrgId): readonly CatalystEvent[]
  /** Cheap "is anything available" check for the degraded label. */
  hasAnyCoverage(): boolean
}

export class FixtureCatalystProvider implements CatalystInputProvider {
  private readonly byOrg = new Map<string, CatalystEvent[]>()

  constructor(events: readonly CatalystEvent[] = catalystEvents) {
    for (const e of events) {
      const k = e.orgId as string
      const arr = this.byOrg.get(k) ?? []
      arr.push(e)
      this.byOrg.set(k, arr)
    }
    for (const arr of this.byOrg.values()) {
      arr.sort((a, b) => a.expectedAt.localeCompare(b.expectedAt))
    }
  }

  listCatalysts(orgId: OrgId): readonly CatalystEvent[] {
    return this.byOrg.get(orgId as string) ?? []
  }

  hasAnyCoverage(): boolean {
    return this.byOrg.size > 0
  }
}

export class EmptyCatalystProvider implements CatalystInputProvider {
  listCatalysts(): readonly CatalystEvent[] { return [] }
  hasAnyCoverage(): boolean { return false }
}
