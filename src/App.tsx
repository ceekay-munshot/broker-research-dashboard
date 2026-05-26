import { useState } from 'react'
import type { BrokerId, ReportId, StockTicker } from './domain'
import { useAdapterQuery } from './hooks/useAdapterQuery'
import type { FiltersState } from './app/filters'
import { DEFAULT_FILTERS } from './app/filters'
import type { TabId } from './app/tabs'

import Header from './components/Header'
import Sidebar from './components/Sidebar'
import Tabs from './components/Tabs'
import ReportDrawer from './components/ReportDrawer'
import StockDrawer from './components/StockDrawer'
import BrokerDetailDrawer from './components/BrokerDetailDrawer'

import Today from './components/views/Today'
import ByBroker from './components/views/ByBroker'
import ByStock from './components/views/ByStock'
import Disagreements from './components/views/Disagreements'
// Hidden tabs (admin menu only):
import Inbox from './components/views/Inbox'
import SectorFeed from './components/views/SectorFeed'
import Calibration from './components/views/Calibration'
import Dashboard from './components/views/Dashboard'
import Usage from './components/views/Usage'
import ControlPlane from './components/views/ControlPlane'
import { UsageBoot } from './usage/UsageContext'
import { emitUsage } from './usage/UsageClient'
import type { UsageSurface } from './domain'

export default function App() {
  const [activeTab, setActiveTabRaw] = useState<TabId>('today')
  // Wrap setActiveTab so every tab change emits a usage event.
  const setActiveTab = (t: TabId) => {
    setActiveTabRaw((prev) => {
      if (prev !== t) {
        emitUsage({
          eventType: 'view_tab',
          surface: t as unknown as UsageSurface,
          fromSurface: prev as unknown as UsageSurface,
        })
      }
      return t
    })
  }
  const [filters, setFilters] = useState<FiltersState>(DEFAULT_FILTERS)
  const [selectedReportId, setSelectedReportId] = useState<ReportId | null>(null)
  const [selectedTicker, setSelectedTicker] = useState<StockTicker | null>(null)
  // BrokerDetailDrawer state. Lives at the app root so the fixed overlay
  // escapes the scroll/transform context of <main>. Opening a report from
  // inside this drawer is allowed to layer on top — the user wants to
  // return to the timeline after viewing the report.
  const [selectedBrokerId, setSelectedBrokerId] = useState<BrokerId | null>(null)

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
    emitUsage({
      eventType: 'open_report',
      surface: activeTab as unknown as UsageSurface,
      contentKind: 'report',
      entityId: id as unknown as string,
      fromSurface: activeTab as unknown as UsageSurface,
    })
  }
  const onSelectTicker = (t: StockTicker) => {
    setSelectedReportId(null)
    setSelectedTicker(t)
    setSelectedBrokerId(null)
  }
  const onSelectBroker = (b: BrokerId) => {
    setSelectedReportId(null)
    setSelectedTicker(null)
    setSelectedBrokerId(b)
  }

  return (
    <div className="h-full flex flex-col">
      <UsageBoot/>
      <Header
        lastUpdated={kpi.data?.asOf ?? null}
        orgShortName={org.data?.shortName ?? null}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
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
                  onSelectBroker={onSelectBroker}
                  setActiveTab={setActiveTab}
                />
              </div>
            </div>
          </div>
        </main>
      </div>

      <BrokerDetailDrawer
        brokerId={selectedBrokerId}
        onClose={() => setSelectedBrokerId(null)}
        onSelectReport={(id) => setSelectedReportId(id)}
      />
      <StockDrawer
        ticker={selectedTicker}
        onClose={() => setSelectedTicker(null)}
        onSelectReport={onSelectReport}
      />
      <ReportDrawer
        reportId={selectedReportId}
        onClose={() => setSelectedReportId(null)}
        onSelectTicker={onSelectTicker}
      />
    </div>
  )
}

function ViewRouter({ tab, filters, onSelectReport, onSelectTicker, onSelectBroker, setActiveTab }: {
  tab: TabId;
  filters: FiltersState;
  onSelectReport: (id: ReportId) => void;
  onSelectTicker: (t: StockTicker) => void;
  onSelectBroker: (b: BrokerId) => void;
  setActiveTab: (t: TabId) => void;
}) {
  switch (tab) {
    // Customer-facing tabs (visible in main nav)
    case 'today':         return <Today         filters={filters} onSelectReport={onSelectReport} onSelectTicker={onSelectTicker} setActiveTab={setActiveTab}/>
    case 'stocks':        return <ByStock       filters={filters} onSelectReport={onSelectReport} onSelectTicker={onSelectTicker}/>
    case 'brokers':       return <ByBroker      filters={filters} onSelectReport={onSelectReport} onSelectBroker={onSelectBroker}/>
    case 'disagreements': return <Disagreements filters={filters} onSelectTicker={onSelectTicker}/>

    // Admin/operator tabs (reachable only via the AdminMenu in the header)
    case 'inbox':         return <Inbox setActiveTab={setActiveTab}/>
    case 'sector':        return <SectorFeed   filters={filters} onSelectReport={onSelectReport} onSelectTicker={onSelectTicker}/>
    case 'calibration':   return <Calibration  onSelectTicker={onSelectTicker}/>
    case 'dashboard':     return <Dashboard    filters={filters} onSelectReport={onSelectReport}/>
    case 'usage':         return <Usage/>
    case 'controlPlane':  return <ControlPlane/>
  }
}
