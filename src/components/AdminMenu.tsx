// AdminMenu — small dropdown in the header that exposes the hidden tabs
// (Inbox, Sector Feed, Calibration, Raw Dashboard, Pilot Analytics,
// Control Plane). Visible only when the resolved user role is admin or
// operator; ordinary customers never see it.
//
// Kept intentionally minimal: a single "Admin" button that opens a
// flyout with the admin routes. No nested menus, no settings panel.

import { useEffect, useRef, useState } from 'react'
import { ADMIN_TABS, type TabId } from '../app/tabs'
import { useCurrentUserRole } from '../hooks/useCurrentUserRole'

interface AdminMenuProps {
  readonly active: TabId
  readonly setActive: (id: TabId) => void
}

export default function AdminMenu({ active, setActive }: AdminMenuProps) {
  const role = useCurrentUserRole()
  const canSee = role === 'admin' || role === 'operator'
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!canSee) return null

  const activeIsAdmin = ADMIN_TABS.some((t) => t.id === active)

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`text-[11px] px-2 py-1 rounded border border-line/10 hover:border-line/20 transition-colors ${activeIsAdmin ? 'text-accent' : 'text-slate-400 hover:text-slate-200'}`}
      >
        Admin
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1 w-48 rounded-md border border-line/15 bg-ink-900/95 backdrop-blur-md shadow-lg z-30 py-1"
        >
          {ADMIN_TABS.map((t) => {
            const isActive = active === t.id
            return (
              <button
                key={t.id}
                role="menuitem"
                onClick={() => { setActive(t.id); setOpen(false) }}
                className={`block w-full text-left text-[12px] px-3 py-1.5 ${isActive ? 'text-accent bg-accent/10' : 'text-slate-300 hover:text-slate-100 hover:bg-line/[0.05]'}`}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
