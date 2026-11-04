import { ModalShell } from './ui/ModalShell'
import { useT } from '../i18n'

export default function NoTraceDialog({ open, onOpenChange, reason }: { open: boolean; onOpenChange: (b: boolean) => void; reason?: string }) {
  const t = useT()
  return (
    <ModalShell
      open={open}
      onOpenChange={onOpenChange}
      icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-[19px]"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>}
      title={t('bubble.noTrace')}
      desc={t('notrace.desc')}
    >
      <div className="mb-3.5 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-700">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 flex-none"><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></svg>
        <div>
          <b>{t('notrace.inferred')}</b>{reason ?? t('notrace.fallback')}
          <br />
          <span className="opacity-80">{t('notrace.note')}</span>
        </div>
      </div>
      <div className="text-[12.5px] leading-relaxed text-muted">
        {t('notrace.b.lead')}{t('notrace.b.clarify')} <span className="font-mono">clarify_sent</span> · {t('notrace.b.image')} <span className="font-mono">assistant_image_sent</span> · {t('notrace.b.risk')} <span className="font-mono">risk_blocked</span> · {t('notrace.b.tail')}
      </div>
    </ModalShell>
  )
}
