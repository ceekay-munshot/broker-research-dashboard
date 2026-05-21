// Customer-facing tabs. Six clean workflows, each answering one question.
// No long uppercase hints, no internal jargon — keep this as the surface
// the investor actually sees.
export const TABS = [
  { id: 'today',         label: 'Overview' },
  { id: 'portfolio',     label: 'My Portfolio' },
  { id: 'stocks',        label: 'Stocks' },
  { id: 'brokers',       label: 'Brokers' },
  { id: 'disagreements', label: 'Disagreements' },
  { id: 'catalysts',     label: 'Catalysts' },
] as const

// Hidden tabs — only reachable via the admin menu in the header.
// Operators / dev-mode users use these; ordinary customers never see them.
// Kept as separate routes (not removed) so the underlying functionality
// stays accessible without polluting the main nav.
export const ADMIN_TABS = [
  { id: 'inbox',        label: 'Inbox' },
  { id: 'sector',       label: 'Sector Feed' },
  { id: 'calibration',  label: 'Calibration' },
  { id: 'dashboard',    label: 'Raw Dashboard' },
  { id: 'usage',        label: 'Pilot Analytics' },
  { id: 'controlPlane', label: 'Control Plane' },
] as const

export type CustomerTabId = typeof TABS[number]['id']
export type AdminTabId    = typeof ADMIN_TABS[number]['id']
export type TabId         = CustomerTabId | AdminTabId
