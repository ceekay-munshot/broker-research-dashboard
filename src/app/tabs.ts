export const TABS = [
  { id: 'mybook',     label: 'My Book',            hint: 'Fund-aware morning view' },
  { id: 'briefing',   label: 'Alerts & Briefing',  hint: 'Daily digest + alert feed' },
  { id: 'worklog',    label: 'Daily Worklog',      hint: 'Triage what landed today' },
  { id: 'dashboard',  label: 'Dashboard',          hint: 'KPIs + rolling feed' },
  { id: 'broker',     label: 'By Broker',          hint: 'What each house is saying' },
  { id: 'stock',      label: 'By Stock',           hint: 'What the Street is saying' },
  { id: 'divergence', label: 'Divergence / ARB',   hint: 'Where the Street disagrees' },
  { id: 'sector',     label: 'Sector Feed',        hint: 'Rolling sector intelligence' },
  { id: 'calibration', label: 'Calibration',       hint: 'Broker + alert effectiveness' },
  { id: 'catalysts',   label: 'Catalysts',         hint: 'Calendar + pre-event briefs' },
  { id: 'sources',     label: 'Sources',           hint: 'Source integrations + health' },
  { id: 'inbox',       label: 'Inbox',             hint: 'Delivered briefs, alerts, incidents' },
  { id: 'usage',       label: 'Pilot Analytics',   hint: 'Adoption + delivery engagement + ROI' },
] as const

export type TabId = typeof TABS[number]['id']
