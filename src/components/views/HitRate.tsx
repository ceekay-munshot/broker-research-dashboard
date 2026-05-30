// "Hit Rate" — which analysts call it right. A leaderboard of research houses
// ranked by how often their rated calls play out, with a drill-down table of a
// chosen analyst's calls: target, gain since the call, and whether it was met.
// Implementation lives in components/hitRate/.

import type { ReportId, StockTicker } from '../../domain'
import type { FiltersState } from '../../app/filters'
import HitRateSplit from '../hitRate/HitRateSplit'

interface HitRateProps {
  readonly filters: FiltersState
  readonly onSelectTicker: (t: StockTicker) => void
  readonly onSelectReport: (id: ReportId) => void
}

export default function HitRate({ filters, onSelectTicker, onSelectReport }: HitRateProps) {
  return <HitRateSplit filters={filters} onSelectTicker={onSelectTicker} onSelectReport={onSelectReport}/>
}
