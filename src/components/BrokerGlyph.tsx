// Shared broker glyph: a brand-coloured square with the broker's initials,
// optionally followed by the short name. One design language for "which
// broker said this" across the Overview feed, the Stock drawer's
// "Street views at a glance", the Report drawer, etc. — so the same thing
// always looks the same.

interface BrokerGlyphProps {
  readonly shortName: string
  readonly color?: string | null
  /** Show the short name beside the square (default true). */
  readonly withName?: boolean
  /** Square size in Tailwind units — 4 (compact rows) or 6 (cards). */
  readonly size?: 4 | 5 | 6
}

const SIZE: Record<NonNullable<BrokerGlyphProps['size']>, { box: string; text: string }> = {
  4: { box: 'w-4 h-4', text: 'text-[8.5px]' },
  5: { box: 'w-5 h-5', text: 'text-[9px]' },
  6: { box: 'w-6 h-6', text: 'text-[10px]' },
}

export default function BrokerGlyph({ shortName, color, withName = true, size = 4 }: BrokerGlyphProps) {
  const s = SIZE[size]
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <span
        className={`${s.box} rounded-sm flex items-center justify-center ${s.text} font-bold text-ink-950 shrink-0`}
        style={{ background: color ?? '#94a3b8' }}
        aria-hidden
      >
        {shortName.slice(0, 3).toUpperCase()}
      </span>
      {withName && <span className="text-slate-200 truncate">{shortName}</span>}
    </span>
  )
}
