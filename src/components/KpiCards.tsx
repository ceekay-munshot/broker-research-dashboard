import type { KpiCardViewModel } from '../viewModels/dashboard'
import { TONE_HEX, TONE_TEXT_CLASS, getChangeTone, type SemanticTone } from '../lib/semanticColor'

interface KpiCardsProps {
  readonly kpis: readonly KpiCardViewModel[]
}

// A KPI trend is a directional signal: rising counts are favourable (green),
// falling unfavourable (red), flat neutral, and a mixed trend a caution.
const TREND_TONE: Readonly<Record<KpiCardViewModel['trend'], SemanticTone>> = {
  up:   'positive',
  down: 'negative',
  flat: 'neutral',
  mix:  'caution',
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}

function Delta({ value, windowDays }: { value: number; windowDays: number }) {
  if (value === 0) return <span className="text-slate-500 text-[11px]">flat</span>
  const positive = value > 0
  const windowLabel = `${windowDays}d`
  return (
    <span className={`flex items-center gap-1 text-[11px] num ${TONE_TEXT_CLASS[getChangeTone(value)]}`}>
      <span>{positive ? '▲' : '▼'}</span>
      <span>{positive ? '+' : ''}{value}</span>
      <span className="text-slate-500 ml-1">{windowLabel}</span>
    </span>
  )
}

function Sparkline({ trend }: { trend: KpiCardViewModel['trend'] }) {
  const paths: Record<KpiCardViewModel['trend'], string> = {
    up:   'M0 22 L10 18 L20 20 L30 14 L40 16 L50 10 L60 12 L70 6 L80 8',
    flat: 'M0 14 L10 15 L20 13 L30 14 L40 15 L50 13 L60 14 L70 13 L80 14',
    down: 'M0 6 L10 10 L20 9 L30 14 L40 13 L50 17 L60 16 L70 20 L80 22',
    mix:  'M0 18 L10 14 L20 16 L30 11 L40 15 L50 9  L60 14 L70 7  L80 12',
  }
  const color = TONE_HEX[TREND_TONE[trend]]
  return (
    <svg viewBox="0 0 80 28" className="w-20 h-7 opacity-80">
      <path d={paths[trend]} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function Card({ card }: { card: KpiCardViewModel }) {
  return (
    <div className="panel panel-hover p-4 flex flex-col gap-3 min-w-0">
      <div className="flex items-start justify-between">
        <div className="section-title">{card.label}</div>
        <Sparkline trend={card.trend}/>
      </div>
      <div className="flex items-end justify-between">
        <div className="num text-[28px] leading-none font-semibold text-slate-100 tracking-tight">
          {formatNumber(card.value)}
        </div>
        <Delta value={card.deltaValue} windowDays={card.deltaWindowDays}/>
      </div>
      <div className="text-[11px] text-slate-500">{card.hint}</div>
    </div>
  )
}

export default function KpiCards({ kpis }: KpiCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {kpis.map((c) => <Card key={c.key} card={c}/>)}
    </div>
  )
}
