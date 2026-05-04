// "Today" — the morning landing view. Combines the existing Briefing,
// MyBook (portfolio overview), DailyWorklog, and SectorFeed surfaces into
// one stacked screen so the customer can answer "what changed and what
// should I read first?" without tab-hopping.
//
// Each sub-section reuses the existing tab component as-is — no
// duplicated logic, just composition. Empty states cascade naturally:
// every sub-section already renders an "Awaiting server output"
// placeholder when its slice of the payload is missing.

import type { ReportId, StockTicker } from '../../domain'
import type { FiltersState } from '../../app/filters'
import Briefing from './Briefing'
import MyBook from './MyBook'
import DailyWorklog from './DailyWorklog'
import SectorFeed from './SectorFeed'

interface TodayProps {
  readonly filters: FiltersState
  readonly onSelectReport: (id: ReportId) => void
  readonly onSelectTicker: (t: StockTicker) => void
  readonly onOpenDisagreements: () => void
}

export default function Today({
  filters, onSelectReport, onSelectTicker, onOpenDisagreements,
}: TodayProps) {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h2 className="text-slate-100 font-semibold text-lg">Today</h2>
        <p className="text-slate-400 text-[12px]">What changed and what to read first.</p>
      </header>

      <Section title="Briefing">
        <Briefing
          onSelectReport={onSelectReport}
          onSelectTicker={onSelectTicker}
        />
      </Section>

      <Section title="On your book">
        <MyBook
          onSelectReport={onSelectReport}
          onSelectTicker={onSelectTicker}
          onOpenDivergence={onOpenDisagreements}
          onOpenBriefing={() => { /* already on Today which includes briefing */ }}
        />
      </Section>

      <Section title="Worklog">
        <DailyWorklog
          onSelectReport={onSelectReport}
          onSelectTicker={onSelectTicker}
          onOpenDivergence={onOpenDisagreements}
        />
      </Section>

      <Section title="Sector highlights">
        <SectorFeed
          filters={filters}
          onSelectReport={onSelectReport}
          onSelectTicker={onSelectTicker}
        />
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-[10.5px] uppercase tracking-[0.18em] text-slate-500">{title}</span>
        <span className="flex-1 h-px bg-line/10"/>
      </div>
      <div>{children}</div>
    </section>
  )
}
