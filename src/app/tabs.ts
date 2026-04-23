export const TABS = [
  { id: 'dashboard',  label: 'Dashboard',         hint: 'KPIs + rolling feed' },
  { id: 'broker',     label: 'By Broker',          hint: 'What each house is saying' },
  { id: 'stock',      label: 'By Stock',           hint: 'What the Street is saying' },
  { id: 'divergence', label: 'Divergence / ARB',   hint: 'Where the Street disagrees' },
  { id: 'sector',     label: 'Sector Feed',        hint: 'Rolling sector intelligence' },
] as const

export type TabId = typeof TABS[number]['id']
