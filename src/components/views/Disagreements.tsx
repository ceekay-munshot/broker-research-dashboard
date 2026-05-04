// "Disagreements" — where the Street disagrees + which brokers have been
// right or wrong. Combines the existing Divergence (resultant + outlier
// closure) view with the Calibration (per-broker / per-alert effectiveness)
// view in one stacked screen.
//
// The customer asks: "where is there alpha, controversy, or Street
// disagreement?" — Divergence answers "where" and Calibration answers
// "whose view should I weight more."

import type { StockTicker } from '../../domain'
import type { FiltersState } from '../../app/filters'
import Divergence from './Divergence'
import Calibration from './Calibration'

interface DisagreementsProps {
  readonly filters: FiltersState
  readonly onSelectTicker: (t: StockTicker) => void
}

export default function Disagreements({ filters, onSelectTicker }: DisagreementsProps) {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h2 className="text-slate-100 font-semibold text-lg">Disagreements</h2>
        <p className="text-slate-400 text-[12px]">Where the Street disagrees and which brokers have been right.</p>
      </header>

      <Section title="Where the Street disagrees">
        <Divergence
          filters={filters}
          onSelectTicker={onSelectTicker}
        />
      </Section>

      <Section title="Broker calibration">
        <Calibration onSelectTicker={onSelectTicker}/>
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
