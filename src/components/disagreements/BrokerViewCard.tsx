// One broker's detailed view on a stock — rating, target (with prior), the
// bulleted claims, topic tags, and a link to the full report. Shared by the
// Agreements & disagreements "Broker views" matrix tab. Mirrors the card that
// previously lived in the Stock drawer.

import type { ReportId } from '../../domain'
import type { BrokerDetail } from '../../viewModels/stockStreetView'
import { RATING_TEXT_COLOR, formatPrice } from '../../viewModels/shared'
import BrokerGlyph from '../BrokerGlyph'

export default function BrokerViewCard({ detail, onSelectReport }: {
  detail: BrokerDetail
  onSelectReport: (id: ReportId) => void
}) {
  const targetMoved = detail.priorTargetPrice != null
    && detail.targetPrice != null
    && detail.priorTargetPrice !== detail.targetPrice
  return (
    <li className="rounded border border-line/5 bg-line/[0.02] p-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <BrokerGlyph shortName={detail.brokerShortName} color={detail.brokerColor} withName={false} size={6}/>
          <div className="flex flex-col min-w-0">
            <span className="text-slate-100 text-[12.5px] font-semibold truncate">{detail.brokerShortName}</span>
            {detail.author && <span className="text-[10.5px] text-slate-500 truncate">{detail.author}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 text-[11.5px]">
          {detail.rating && (
            <span className={`chip border border-line/10 bg-line/[0.04] ${RATING_TEXT_COLOR[detail.rating]} text-[10px]`}>{detail.rating}</span>
          )}
          {detail.targetPrice != null && (
            <span className="num text-slate-100">
              {formatPrice(detail.targetPrice, detail.targetCurrency, 0)}
              {targetMoved && detail.priorTargetPrice != null && (
                <span className="text-slate-500 text-[10px] ml-1">
                  (from {formatPrice(detail.priorTargetPrice, detail.targetCurrency, 0)})
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      {detail.bullets.length > 0 && (
        <ul className="flex flex-col gap-1 text-[12px] text-slate-300">
          {detail.bullets.map((b, i) => (
            <li key={i} className="flex gap-1.5 leading-snug">
              <span className="text-slate-600 shrink-0">•</span>
              <span className="line-clamp-2">{b}</span>
            </li>
          ))}
        </ul>
      )}

      {detail.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {detail.tags.map((t) => (
            <span key={t} className="chip border border-line/10 bg-line/[0.04] text-slate-400 text-[9.5px]">{t}</span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-end pt-1 border-t border-line/5">
        <button
          onClick={() => onSelectReport(detail.reportId)}
          className="text-accent text-[11px] hover:underline"
        >View report →</button>
      </div>
    </li>
  )
}
