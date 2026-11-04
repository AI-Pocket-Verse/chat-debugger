import { useEffect, useRef, useState } from 'react'
import { useConfigStore } from '../stores/config'
import { useT } from '../i18n'
import { roleDisplayName, useUiStore } from '../stores/ui'

function ChevronDown() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} className="w-2.5">
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

export default function TopBar() {
  const roleId = useConfigStore((s) => s.roleId)
  const setCfg = useConfigStore((s) => s.set)
  const roles = useUiStore((s) => s.roles)
  const openPreset = useUiStore((s) => s.openPreset)
  const [open, setOpen] = useState(false)
  const ddRef = useRef<HTMLDivElement>(null)
  const t = useT()
  const roleName = roleDisplayName(roles, roleId)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ddRef.current && !ddRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [])

  return (
    <div className="flex items-center gap-2.5 border-b border-line/70 px-5 py-3">
      {/* 角色下拉(自定义,不用原生 select) */}
      <div className="relative" ref={ddRef}>
        <button
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-[12.5px] font-semibold text-muted hover:bg-surface"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5">
            <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
          </svg>
          <span>{roleName}</span>
          <ChevronDown />
        </button>
        {open && (
          <div className="absolute left-0 top-[calc(100%+6px)] z-40 min-w-[160px] rounded-xl border border-line bg-white p-1.5 shadow-pop">
            {roles.map((r) => (
              <div
                key={r.id}
                onClick={() => { setCfg({ roleId: r.id }); setOpen(false) }}
                className={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-semibold ${r.id === roleId ? 'bg-accent-soft text-primary' : 'text-muted hover:bg-surface'}`}
              >
                {roleDisplayName(roles, r.id)}
                <span className="ml-auto font-mono text-[10px] text-muted/70">role {r.id}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <button onClick={() => openPreset(true)} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-[12.5px] font-semibold text-muted hover:bg-surface">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5"><path d="M3 6h18M6 12h12M9 18h6" /></svg>
        {t('preset.title')}
      </button>

      <div className="flex-1" />

      <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1.5 text-[12px] font-semibold text-primary">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
        trace on
      </span>
    </div>
  )
}
