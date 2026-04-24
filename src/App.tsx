import { useState } from 'react'
import type { ReportId, StockTicker, Organization } from './domain'
import { useAdapterQuery } from './hooks/useAdapterQuery'
import { useScope } from './app/ScopeContext'
import { getActiveAdapterMode } from './adapters'
import type { FiltersState } from './app/filters'
import { DEFAULT_FILTERS } from './app/filters'
import type { TabId } from './app/tabs'

import Header from './components/Header'
import Sidebar from './components/Sidebar'
import Tabs from './components/Tabs'
import ReportDrawer from './components/ReportDrawer'
import StockDrawer from './components/StockDrawer'
import DevDiagnosticsChip from './app/DevDiagnosticsChip'

import Dashboard from './components/views/Dashboard'
import ByBroker from './components/views/ByBroker'
import ByStock from './components/views/ByStock'
import Divergence from './components/views/Divergence'
import SectorFeed from './components/views/SectorFeed'
import DailyWorklog from './components/views/DailyWorklog'

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('worklog')
  const [filters, setFilters] = useState<FiltersState>(DEFAULT_FILTERS)
  const [selectedReportId, setSelectedReportId] = useState<ReportId | null>(null)
  const [selectedTicker, setSelectedTicker] = useState<StockTicker | null>(null)

  // Sidebar + header depend on tenant-catalog data. Fetch once per scope.
  const org = useAdapterQuery((a, s) => a.getOrganization(s), [])
  const brokers = useAdapterQuery((a, s) => a.listBrokers(s), [])
  const sectors = useAdapterQuery((a, s) => a.listSectors(s), [])
  const stocks = useAdapterQuery((a, s) => a.listStocks(s), [])
  const kpi = useAdapterQuery((a, s) => a.getKpiSnapshot(s), [])

  const shellReady = !org.loading && !brokers.loading && !sectors.loading && !stocks.loading && !kpi.loading
  const shellError = org.error ?? brokers.error ?? sectors.error ?? stocks.error ?? kpi.error

  if (shellError) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-rose-400 text-sm">Bootstrap error: {shellError.message}</div>
      </div>
    )
  }
  if (!shellReady) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-slate-500 text-sm animate-pulse">Loading research desk…</div>
      </div>
    )
  }

  // Drawer invariant: only one drawer open at a time. Opening one closes the
  // other. That keeps the UI easy to reason about and avoids overlapping
  // fixed overlays.
  const onSelectReport = (id: ReportId) => {
    setSelectedTicker(null)
    setSelectedReportId(id)
  }
  const onSelectTicker = (t: StockTicker) => {
    setSelectedReportId(null)
    setSelectedTicker(t)
  }

  return (
    <div className="h-full flex flex-col">
      <Header
        lastUpdated={kpi.data?.asOf ?? null}
        orgShortName={org.data?.shortName ?? null}
      />

      <div className="flex-1 flex min-h-0">
        <Sidebar
          brokers={brokers.data ?? []}
          sectors={sectors.data ?? []}
          stocks={stocks.data ?? []}
          filters={filters}
          setFilters={setFilters}
        />

        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="px-6 py-5 flex flex-col gap-5">
            <div className="panel">
              <Tabs active={activeTab} setActive={setActiveTab}/>
              <div className="p-5">
                <ViewRouter
                  tab={activeTab}
                  filters={filters}
                  onSelectReport={onSelectReport}
                  onSelectTicker={onSelectTicker}
                  setActiveTab={setActiveTab}
                />
              </div>
            </div>

            <Footer org={org.data ?? null}/>
          </div>
        </main>
      </div>

      <ReportDrawer
        reportId={selectedReportId}
        onClose={() => setSelectedReportId(null)}
      />
      <StockDrawer
        ticker={selectedTicker}
        onClose={() => setSelectedTicker(null)}
        onSelectReport={onSelectReport}
      />
      <DevDiagnosticsChip />
    </div>
  )
}

function ViewRouter({ tab, filters, onSelectReport, onSelectTicker, setActiveTab }: {
  tab: TabId;
  filters: FiltersState;
  onSelectReport: (id: ReportId) => void;
  onSelectTicker: (t: StockTicker) => void;
  setActiveTab: (t: TabId) => void;
}) {
  switch (tab) {
    case 'worklog':    return <DailyWorklog onSelectReport={onSelectReport} onSelectTicker={onSelectTicker} onOpenDivergence={() => setActiveTab('divergence')}/>
    case 'dashboard':  return <Dashboard  filters={filters} onSelectReport={onSelectReport}/>
    case 'broker':     return <ByBroker   filters={filters} onSelectReport={onSelectReport}/>
    case 'stock':      return <ByStock    filters={filters} onSelectReport={onSelectReport} onSelectTicker={onSelectTicker}/>
    case 'divergence': return <Divergence filters={filters} onSelectTicker={onSelectTicker}/>
    case 'sector':     return <SectorFeed filters={filters} onSelectReport={onSelectReport} onSelectTicker={onSelectTicker}/>
  }
}

function Footer({ org }: { org: Organization | null }) {
  const scope = useScope()
  const mode = getActiveAdapterMode()
  return (
    <footer className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-line/5">
      <span>
        Broker Research OS · Read-only analytics client ·{' '}
        <span className="kbd" title="Runtime adapter mode (see docs/modes.md)">{mode}</span>
      </span>
      <span>
        Scope <span className="kbd">{scope.orgId}</span> / <span className="kbd">{scope.actingUserId}</span>
        {org && <span className="ml-2 text-slate-600">({org.forwardingAddress})</span>}
      </span>
    </footer>
  )
}
