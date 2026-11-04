import * as React from 'react'
import { Dialog, DialogContent, DialogClose, DialogTitle } from './dialog'

export function ModalShell({
  open,
  onOpenChange,
  icon,
  title,
  desc,
  wide,
  children,
  footer,
}: {
  open: boolean
  onOpenChange: (b: boolean) => void
  icon: React.ReactNode
  title: string
  desc?: string
  wide?: boolean
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={wide ? 'w-[min(1040px,96vw)]' : undefined}>
        <div className="flex items-center gap-3 border-b border-line/70 px-6 py-4">
          <div className="grid h-9 w-9 flex-none place-items-center rounded-[13px] bg-gradient-to-br from-primary to-accent text-white">{icon}</div>
          <div>
            {/* Radix 要求对话框有 Title(读屏用),样式与原来的 h3 一致 */}
            <DialogTitle className="font-semibold text-[19px] leading-tight">{title}</DialogTitle>
            {desc && <p className="mt-0.5 text-[11.5px] text-muted">{desc}</p>}
          </div>
          <DialogClose className="ml-auto grid h-8 w-8 place-items-center rounded-[11px] border border-line bg-surface text-[15px] text-muted hover:bg-white">
            ✕
          </DialogClose>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex items-center gap-2.5 border-t border-line/70 px-6 py-3.5">{footer}</div>}
      </DialogContent>
    </Dialog>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3.5">
      <label className="mb-1.5 block text-[12px] font-semibold text-muted">{label}</label>
      {children}
    </div>
  )
}

/** 分段单选按钮(预置关系态、界面语言共用) */
export function Seg<T extends string | number>({ options, value, onChange }: { options: { v: T; name: string; code?: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex flex-wrap gap-[3px] rounded-2xl border border-line bg-surface p-[3px] text-[12px] font-semibold">
      {options.map((o) => (
        <button key={String(o.v)} type="button" onClick={() => onChange(o.v)} className={`rounded-xl px-3 py-1.5 ${value === o.v ? 'bg-white text-primary shadow-glass' : 'text-muted'}`}>
          {o.code ? `${o.code}·${o.name}` : o.name}
        </button>
      ))}
    </div>
  )
}

export const inputCls =
  'w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-[13.5px] text-fg outline-none focus:border-primary focus:ring-2 focus:ring-accent-soft'

export function Btn({ variant = 'ghost', className = '', ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'ghost' | 'primary' | 'danger' }) {
  const base = 'rounded-[14px] px-4 py-2.5 text-[13px] font-semibold cursor-pointer'
  const v =
    variant === 'primary'
      ? 'text-white border-0 bg-gradient-to-br from-primary to-accent'
      : variant === 'danger'
        ? 'text-red-600 border border-red-200 bg-red-50'
        : 'text-muted border border-line bg-surface'
  return <button className={`${base} ${v} ${className}`} {...p} />
}
