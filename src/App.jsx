import React, { useEffect, useState } from 'react'
import Header from './components/Header.jsx'
import KpiCards from './components/KpiCards.jsx'
import Sidebar from './components/Sidebar.jsx'
import Tabs from './components/Tabs.jsx'
import ByBroker from './components/views/ByBroker.jsx'
import ByStock from './components/views/ByStock.jsx'
import Divergence from './components/views/Divergence.jsx'
import SectorFeed from './components/views/SectorFeed.jsx'

import {
  getLastUpdated, getKpis, getBrokers, getSectors,
  getStocks, getBrokerRatings, getReports, getDivergences,
} from './api/brokerApi.js'

const DEFAULT_FILTERS = {
  dateRange: '1M',
  brokers: [],
  tickers: [],
  sectors: [],
  ratings: [],
}

export default function App() {
  const [activeTab, setActiveTab] = useState('broker')
  const [filters, setFilters] = useState(DEFAULT_FILTERS)

  const [state, setState] = useState({
    lastUpdated: null,
    kpis: null,
    brokers: [],
    sectors: [],
    stocks: [],
    brokerRatings: [],
    reports: [],
    divergences: [],
    loaded: false,
  })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [lastUpdated, kpis, brokers, sectors, stocks, brokerRatings, reports, divergences] = await Promise.all([
        getLastUpdated(), getKpis(), getBrokers(), getSectors(),
        getStocks(), getBrokerRatings(), getReports(), getDivergences(),
      ])
      if (cancelled) return
      setState({ lastUpdated, kpis, brokers, sectors, stocks, brokerRatings, reports, divergences, loaded: true })
    })()
    return () => { cancelled = true }
  }, [])

  if (!state.loaded) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500 text-sm">
        <span className="animate-pulse">Loading research desk…</span>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <Header lastUpdated={state.lastUpdated}/>

      <div className="flex-1 flex min-h-0">
        <Sidebar
          brokers={state.brokers}
          sectors={state.sectors}
          stocks={state.stocks}
          filters={filters}
          setFilters={setFilters}
        />

        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="px-6 py-5 flex flex-col gap-5">
            <KpiCards kpis={state.kpis}/>
            <div className="panel">
              <Tabs active={activeTab} setActive={setActiveTab}/>
              <div className="p-5">
                {activeTab === 'broker' && (
                  <ByBroker brokers={state.brokers} reports={state.reports}/>
                )}
                {activeTab === 'stock' && (
                  <ByStock
                    stocks={state.stocks}
                    brokers={state.brokers}
                    brokerRatings={state.brokerRatings}
                    sectors={state.sectors}
                  />
                )}
                {activeTab === 'divergence' && (
                  <Divergence divergences={state.divergences} brokers={state.brokers}/>
                )}
                {activeTab === 'sector' && (
                  <SectorFeed
                    sectors={state.sectors}
                    reports={state.reports}
                    brokers={state.brokers}
                    stocks={state.stocks}
                  />
                )}
              </div>
            </div>

            <footer className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-white/5">
              <span>Broker Research OS · Module 01 · Email Intelligence</span>
              <span>Sample data — replace <span className="kbd">USE_MOCK</span> in <span className="kbd">src/api/brokerApi.js</span> to wire real endpoints.</span>
            </footer>
          </div>
        </main>
      </div>
    </div>
  )
}
