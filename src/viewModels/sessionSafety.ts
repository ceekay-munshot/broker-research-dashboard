// Pure transforms over `SessionSafetySnapshot` for the Session Safety panel.

import type {
  SessionSafetySnapshot, SecurityCheckStatus, AuthMode,
} from '../domain'

export interface SessionSafetyViewModel {
  readonly hasData: boolean
  readonly authMode: AuthMode
  readonly productionSafe: boolean
  readonly verdict: 'production_safe' | 'dev_only' | 'unsafe'
  readonly verdictTone: 'emerald' | 'amber' | 'rose'
  readonly currentSessionLabel: string
  readonly checks: SessionSafetySnapshot['checks']
  readonly recentDenials: SessionSafetySnapshot['recentDenials']
}

export function buildSessionSafetyViewModel(snap: SessionSafetySnapshot | null): SessionSafetyViewModel {
  if (!snap) {
    return {
      hasData: false,
      authMode: 'no_auth',
      productionSafe: false,
      verdict: 'unsafe',
      verdictTone: 'rose',
      currentSessionLabel: 'no session',
      checks: [],
      recentDenials: [],
    }
  }
  const anyFail = snap.checks.some((c) => c.status === 'fail')
  const verdict: SessionSafetyViewModel['verdict'] = anyFail
    ? 'unsafe'
    : snap.productionSafe ? 'production_safe' : 'dev_only'
  const verdictTone: SessionSafetyViewModel['verdictTone'] = verdict === 'production_safe'
    ? 'emerald' : verdict === 'unsafe' ? 'rose' : 'amber'
  const cs = snap.currentSession
  const currentSessionLabel = cs
    ? `${cs.role} · ${cs.email} · expires ${cs.expiresAt.slice(11, 16)}`
    : 'no session verified'
  return {
    hasData: true,
    authMode: snap.authMode,
    productionSafe: snap.productionSafe,
    verdict,
    verdictTone,
    currentSessionLabel,
    checks: snap.checks,
    recentDenials: snap.recentDenials,
  }
}

export const CHECK_TONE: Record<SecurityCheckStatus, string> = {
  pass:    'text-emerald-300 border-emerald-500/30',
  warn:    'text-amber-300 border-amber-500/30',
  fail:    'text-rose-300 border-rose-500/40',
  skipped: 'text-slate-500 border-line/10',
}
