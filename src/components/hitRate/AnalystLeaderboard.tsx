// The ranked list of analysts by hit rate — the scannable core of the tab.
// Name + big percentage on top, an accuracy bar + call count below. Low-
// confidence (thin-sample) analysts are dimmed so they don't read as proven.

import type { BrokerId } from '../../domain'
import type { AnalystHitRateRow } from '../../viewModels/hitRate'
import { TONE_TEXT_CLASS, TONE_SOLID_CLASS } from '../../lib/semanticColor'
import BrokerGlyph from '../BrokerGlyph'
import { hitRateTone, formatPct } from './shared'

interface Props {
  readonly rows: readonly AnalystHitRateRow[]
  readonly selectedBrokerId: BrokerId | null
  readonly onSelect: (id: BrokerId) => void
}

export default function AnalystLeaderboard({ rows, selectedBrokerId, onSelect }: Props) {
  return (
    <ul className="flex flex-col rounded border border-line/5 overflow-hidden">
      {rows.map((r, i) => (
        <Row
          key={r.brokerId as unknown as string}
          row={r}
          rank={i + 1}
          selected={r.brokerId === selectedBrokerId}
          onSelect={onSelect}
        />
      ))}
    </ul>
  )
}

function Row({ row, rank, selected, onSelect }: {
  row: AnalystHitRateRow
  rank: number
  selected: boolean
  onSelect: (id: BrokerId) => void
}) {
  const tone = hitRateTone(row.hitRate)
  const lowConf = row.confidence === 'very_low' || row.confidence === 'low'
  const barWidth = Math.round((row.hitRate ?? 0) * 100)

  return (
    <li className="border-b border-line/5 last:border-b-0">
      <button
        onClick={() => onSelect(row.brokerId)}
        className={`w-full text-left px-3 py-2.5 border-l-2 flex flex-col gap-1.5 transition-colors ${
          selected ? 'border-accent bg-line/[0.04]' : 'border-transparent hover:bg-line/[0.02]'
        } ${lowConf ? 'opacity-70' : ''}`}
        title={lowConf ? 'Limited track record — interpret with caution' : undefined}
      >
        <div className="flex items-center gap-2.5">
          <span className="w-4 text-[11px] text-slate-600 num text-right shrink-0">{rank}</span>
          <div className="flex-1 min-w-0">
            <BrokerGlyph shortName={row.shortName} color={row.color} size={5}/>
          </div>
          <span className={`num font-semibold text-[15px] shrink-0 ${TONE_TEXT_CLASS[tone]}`}>
            {formatPct(row.hitRate)}
          </span>
        </div>
        <div className="flex items-center gap-2 pl-[26px]">
          <span className="flex-1 h-1 rounded-full bg-line/10 overflow-hidden">
            <span className={`block h-full ${TONE_SOLID_CLASS[tone]}`} style={{ width: `${barWidth}%` }}/>
          </span>
          <span className="text-[10px] text-slate-500 num shrink-0">{row.sampleSize} calls</span>
        </div>
      </button>
    </li>
  )
}
