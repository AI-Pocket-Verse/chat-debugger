import type { ChatMessage } from '../stores/chat'
import { useConfigStore } from '../stores/config'
import { roleDisplayName, useUiStore } from '../stores/ui'
import { useT } from '../i18n'

function EyeIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
}
function NodeIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3"><circle cx="6" cy="6" r="2.2" /><circle cx="6" cy="18" r="2.2" /><circle cx="18" cy="12" r="2.2" /><path d="M8 7 16 11M8 17 16 13" /></svg>
}
function WarnIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
}

export default function MessageBubble({ m, onOpen }: { m: ChatMessage; onOpen: () => void }) {
  const me = m.role === 'user'
  const noTrace = !me && m.noTrace
  // AI 头像跟随当前选中角色(与顶栏下拉一致),取角色名首字
  const roleId = useConfigStore((s) => s.roleId)
  const roles = useUiStore((s) => s.roles)
  const t = useT()
  const roleName = roleDisplayName(roles, roleId)
  const aiChar = [...roleName][0] ?? 'A'
  return (
    <div className={`flex items-end gap-3 ${me ? 'flex-row-reverse' : ''}`}>
      <div className={`grid h-9 w-9 flex-none place-items-center rounded-xl font-semibold text-white ${me ? 'bg-gradient-to-br from-slate-400 to-slate-500' : 'bg-gradient-to-br from-primary to-accent'}`}>{me ? t('bubble.me') : aiChar}</div>
      <div
        onClick={onOpen}
        className={`relative max-w-[78%] cursor-pointer px-[17px] py-3.5 text-[14.5px] leading-relaxed transition hover:-translate-y-px ${
          me
            ? 'rounded-[18px_18px_6px_18px] border border-primary/20 bg-accent-soft text-fg'
            : noTrace
              ? 'rounded-[18px_18px_18px_6px] border border-dashed border-amber-300 bg-amber-50/60 text-fg'
              : 'rounded-[18px_18px_18px_6px] border border-line/70 bg-surface text-fg'
        }`}
      >
        {m.content || (me ? '' : <span className="text-muted">…</span>)}
        {noTrace && <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10.5px] font-extrabold text-amber-700">{t('bubble.earlyReturn')}</span>}
        <div className={`mt-2 flex items-center gap-1.5 text-[11px] font-bold ${noTrace ? 'text-amber-600' : 'text-primary opacity-75'}`}>
          {me ? <><EyeIcon />{t('bubble.viewPrompt')}</> : noTrace ? <><WarnIcon />{t('bubble.noTrace')}</> : <><NodeIcon />{t('bubble.viewTrace')}</>}
        </div>
      </div>
    </div>
  )
}
