// "Disagreements" — where the Street disagrees on a stock, and which
// brokers have historically been right. A single split-view explorer:
// pick a company (or a broker) on the left, read the full breakdown on
// the right. Implementation lives in components/disagreements/.

import type { ReportId, StockTicker } from '../../domain'
import type { FiltersState } from '../../app/filters'
import DisagreementsSplit from '../disagreements/DisagreementsSplit'

interface DisagreementsProps {
  readonly filters: FiltersState
  readonly onSelectTicker: (t: StockTicker) => void
  readonly onSelectReport: (id: ReportId) => void
}

export default function Disagreements({ filters, onSelectTicker, onSelectReport }: DisagreementsProps) {
  return <DisagreementsSplit filters={filters} onSelectTicker={onSelectTicker} onSelectReport={onSelectReport}/>
}
