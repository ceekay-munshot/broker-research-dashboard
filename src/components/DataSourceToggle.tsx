import { useDataSource } from '../app/ScopeContext'

// Mock ⇄ Live data-source toggle. A temporary comparison aid: flip the whole
// dashboard between the curated mock ("how it should look") and the live
// /email/forwarded feed ("what the API actually returns") so the API can be
// tuned to parity. Remove this control — and the mocks behind it — once the
// live feed reaches the desired output. Amber = mock, so it is never mistaken
// for live data. Styling mirrors ThemeToggle / the header chips.
export default function DataSourceToggle() {
  const { dataSource, setDataSource } = useDataSource()
  const isMock = dataSource === 'mock'

  return (
    <button
      onClick={() => setDataSource(isMock ? 'live' : 'mock')}
      aria-pressed={isMock}
      aria-label="Toggle data source between live API and mock"
      title={
        isMock
          ? 'Showing curated MOCK data (the target output). Click to switch to the live API feed.'
          : 'Showing the LIVE API feed. Click to compare against the curated mock (target output).'
      }
      className={
        'h-7 px-2.5 flex items-center gap-1.5 rounded border text-[11px] font-medium transition-colors ' +
        (isMock
          ? 'border-amber-400/40 text-amber-300 bg-amber-400/10 hover:border-amber-400/60'
          : 'border-line/10 text-slate-400 hover:text-slate-100 hover:border-line/20 hover:bg-line/5')
      }
    >
      <span className={`w-1.5 h-1.5 rounded-full ${isMock ? 'bg-amber-400' : 'bg-emerald-400'}`}/>
      {isMock ? 'Mock data' : 'Live API'}
    </button>
  )
}
