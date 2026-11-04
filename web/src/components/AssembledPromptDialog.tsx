import { useState } from 'react'
import type { ChatPipelineTrace } from '../types/trace'
import { ModalShell } from './ui/ModalShell'
import { isSafetySection, highlightBrackets } from '../lib/sections'
import { useT } from '../i18n'

function Content({ text }: { text: string }) {
  return (
    <>
      {highlightBrackets(text).map((p, i) => (p.hi ? <span key={i} className="font-bold text-primary">{p.t}</span> : <span key={i}>{p.t}</span>))}
    </>
  )
}

export default function AssembledPromptDialog({ open, onOpenChange, trace }: { open: boolean; onOpenChange: (b: boolean) => void; trace?: ChatPipelineTrace }) {
  const [view, setView] = useState<'seg' | 'full'>('seg')
  const t = useT()
  if (!trace) return null
  const p = trace.prompt
  const sections = p?.sections ?? []
  // 总字数:system_prompt 实际长度(缺失时回退各段 chars 之和)+ user_prompt 长度
  const sysChars = p?.system_prompt?.length ?? sections.reduce((n, s) => n + (s.chars ?? 0), 0)
  const userChars = p?.user_prompt?.length ?? 0
  const totalChars = sysChars + userChars

  return (
    <ModalShell
      open={open}
      onOpenChange={onOpenChange}
      wide
      icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-[19px]"><path d="M4 7h16M4 12h10M4 17h7" /></svg>}
      title={t('assembled.title')}
      desc={t('assembled.desc', { n: sections.length, sys: sysChars, user: userChars, total: totalChars })}
    >
      <div className="mb-3.5 inline-flex rounded-full border border-line bg-surface p-[3px] text-[12px] font-semibold">
        <button onClick={() => setView('seg')} className={`rounded-full px-3.5 py-1.5 ${view === 'seg' ? 'bg-white text-primary shadow-glass' : 'text-muted'}`}>{t('assembled.segView')}</button>
        <button onClick={() => setView('full')} className={`rounded-full px-3.5 py-1.5 ${view === 'full' ? 'bg-white text-primary shadow-glass' : 'text-muted'}`}>{t('assembled.fullView')}</button>
      </div>

      {view === 'seg' ? (
        <div>
          {sections.map((s) => {
            const safety = isSafetySection(s.name)
            return (
              <div key={s.name} className={`mb-2.5 overflow-hidden rounded-2xl border ${safety ? 'border-red-200 bg-red-50' : 'border-line/70 bg-surface'}`}>
                <div className="flex items-center gap-2.5 px-3.5 py-3">
                  <span className="font-semibold text-[14.5px]">{s.name}</span>
                  {s.source_node && <span className="rounded bg-white px-1.5 py-0.5 font-mono text-[10px] text-muted">{s.source_node}</span>}
                  <span className="font-mono text-[10.5px] text-muted">{t('common.chars', { n: s.chars ?? 0 })}</span>
                  {s.overridden && <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white">{t('common.overridden')}</span>}
                  {safety && <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">{t('common.safety')}</span>}
                  <button onClick={() => navigator.clipboard?.writeText(s.content ?? '')} className="ml-auto rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-primary">{t('common.copy')}</button>
                </div>
                <pre className="m-0 whitespace-pre-wrap px-3.5 pb-3.5 text-[13px] leading-relaxed text-muted"><Content text={s.content ?? ''} /></pre>
              </div>
            )
          })}
          <div className="mb-2.5 overflow-hidden rounded-2xl border border-line/70 bg-surface">
            <div className="flex items-center gap-2.5 px-3.5 py-3">
              <span className="font-semibold text-[14.5px]">UserInput</span>
              <span className="rounded bg-white px-1.5 py-0.5 font-mono text-[10px] text-muted">user</span>
            </div>
            <pre className="m-0 whitespace-pre-wrap px-3.5 pb-3.5 text-[13px] leading-relaxed text-muted">{p?.user_prompt}</pre>
          </div>
        </div>
      ) : (
        <div className="whitespace-pre-wrap rounded-2xl border border-line/70 bg-surface p-4 font-mono text-[12.5px] leading-relaxed text-muted">{p?.system_prompt || t('common.empty')}</div>
      )}
    </ModalShell>
  )
}
