import { useT } from '../i18n'
import { useUiStore } from '../stores/ui'

export default function Titlebar() {
  const openConfig = useUiStore((s) => s.openConfig)
  const t = useT()

  return (
    <header className="flex items-center justify-between border-b border-line bg-white px-5 py-2.5">
      <div className="flex items-center gap-2.5">
        <div className="grid h-8 w-8 place-items-center text-primary">
          {/* 一条心电图折线:对话链路 trace 的信号(与 favicon 同款,无底色) */}
          <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" className="w-8">
            <path d="M2 16 H12 L15 20 L18 5 L21 24 L23 16 H30" />
          </svg>
        </div>
        <span className="font-bold text-[15px] text-fg">{t('app.title')}</span>
      </div>

      <button
        onClick={() => openConfig(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-[12.5px] font-semibold text-muted hover:bg-surface"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
        </svg>
        {t('config.title')}
      </button>
    </header>
  )
}
