import { useEffect, useState } from 'react'
import { usePromptStore } from '../stores/prompt'
import { useUiStore } from '../stores/ui'
import { backendCfg, useConfigStore } from '../stores/config'
import { useChatStore, messagesOf } from '../stores/chat'
import { getPromptOverrideHistory, getPromptPreview } from '../lib/backendClient'
import { sectionLabel, isDynamicSection } from '../lib/sections'
import { useLang, useT } from '../i18n'

export default function PromptLibraryPanel() {
  const sections = usePromptStore((s) => s.sections)
  const flashing = usePromptStore((s) => s.flashing)
  const refreshContents = usePromptStore((s) => s.refreshContents)
  const openEdit = useUiStore((s) => s.openEdit)
  const editSection = useUiStore((s) => s.editSection)
  const baseUrl = useConfigStore((s) => s.baseUrl)
  const debugKey = useConfigStore((s) => s.debugKey)
  const token = useConfigStore((s) => s.token)
  const roleId = useConfigStore((s) => s.roleId)
  const t = useT()
  const lang = useLang()

  // 「刷新」= 无副作用重取当前拼装(CurrentTime/记忆等实时段),不发消息、不调 LLM。
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState('')
  const doRefresh = async () => {
    if (!token || refreshing) return
    setRefreshing(true)
    setRefreshMsg('')
    try {
      // 传最近一条用户消息(当前角色桶),让记忆召回贴近真实上一轮;无历史则空串走中性占位。
      const msgs = messagesOf(useChatStore.getState(), roleId)
      const lastUser = [...msgs].reverse().find((m) => m.role === 'user')?.content
      const { sections: secs } = await getPromptPreview(backendCfg(token), lastUser)
      refreshContents(secs)
      const time = new Date().toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-US', { hour12: false }) // 本地时区
      setRefreshMsg(t('panel.refreshed', { time }))
    } catch (e) {
      setRefreshMsg(t('panel.refreshFailed', { err: String(e).slice(0, 80) }))
    } finally {
      setRefreshing(false)
    }
  }

  // 每段「当前改动次数」(自上次 clear 起被 set 的次数)。用于左侧按改动次数着色。
  const [modCounts, setModCounts] = useState<Record<string, number>>({})

  // 拉全局覆盖历史 → 倒序(旧→新)累计:clear 清零,set 命中的段 +1。
  // editSection 变化(含保存/清除后关弹窗)也重拉,让改动次数近实时更新。
  useEffect(() => {
    // 还没填后端地址或口令时不请求:空地址会打到观测台自己的静态站上
    if (!baseUrl || !debugKey) { setModCounts({}); return }
    let alive = true
    getPromptOverrideHistory(backendCfg(), 200)
      .then((hist) => {
        if (!alive) return
        const counts: Record<string, number> = {}
        for (let i = hist.length - 1; i >= 0; i--) {
          const e = hist[i]
          if (!e) continue
          if (e.action === 'clear') { for (const k in counts) counts[k] = 0; continue }
          if (e.sections) for (const k of Object.keys(e.sections)) counts[k] = (counts[k] ?? 0) + 1
        }
        setModCounts(counts)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [baseUrl, debugKey, editSection])

  // 按 source_node 分组(保持首次出现顺序)
  const groups: { node: string; items: typeof sections }[] = []
  for (const s of sections) {
    const node = s.source_node ?? t('panel.otherGroup')
    let g = groups.find((x) => x.node === node)
    if (!g) { g = { node, items: [] }; groups.push(g) }
    g.items.push(s)
  }

  return (
    <aside className="flex flex-col overflow-hidden rounded-[22px] border border-line bg-white">
      <div className="px-5 pb-3 pt-5">
        <div className="flex items-center gap-2">
          <div className="font-semibold text-[15px]">{t('panel.title')}</div>
          <button
            type="button"
            onClick={doRefresh}
            disabled={!token || refreshing}
            title={!token ? t('panel.refreshNeedToken') : t('panel.refreshTip')}
            className="ml-auto flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11px] font-medium text-muted transition hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className={`w-3.5 ${refreshing ? 'animate-spin' : ''}`}><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" /></svg>
            {refreshing ? t('panel.refreshing') : t('panel.refresh')}
          </button>
        </div>
        <div className="mt-0.5 text-[11px] text-muted">{t('panel.subtitle')}</div>
        {refreshMsg && <div className={`mt-1 text-[11px] ${refreshMsg.startsWith('✓') ? 'text-primary' : 'text-red-600'}`}>{refreshMsg}</div>}
      </div>
      <div className="mx-4 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-primary/20 bg-accent-soft px-3 py-2 text-[11px] text-muted">
        <span className="h-2 w-2 rounded-full bg-primary" />{t('panel.legendHit')}
        <span className="h-2 w-2 rounded-sm bg-red-500" />{t('panel.legendSafety')}
        <span className="h-2 w-2 rounded-full bg-amber-500" />{t('panel.legendMod1')}
        <span className="h-2 w-2 rounded-full bg-violet-500" />{t('panel.legendMod2')}
      </div>

      <div className="mt-1 flex-1 overflow-y-auto px-3 pb-6">
        {sections.length === 0 ? (
          <div className="px-3 py-8 text-[12.5px] leading-relaxed text-muted">{t('panel.empty')}</div>
        ) : (
          groups.map((g) => (
            <div key={g.node} className="mb-2">
              <div className="flex items-center gap-2 px-2.5 py-2">
                <span className="font-mono text-[9.5px] text-muted/70">{g.node}</span>
                <span className="h-px flex-1 bg-line/60" />
              </div>
              {g.items.map((s) => {
                const mod = modCounts[s.name] ?? 0
                // 改动色优先(琥珀=1次 / 紫=2次+),否则回落命中/安全配色。浅底深字,文字清晰。
                const rowCls =
                  mod >= 2 ? 'border-violet-300 bg-violet-50'
                    : mod === 1 ? 'border-amber-300 bg-amber-50'
                      : s.safety && s.hit ? 'border-red-200 bg-red-50'
                        : s.hit ? 'border-primary/20 bg-accent-soft'
                          : 'border-transparent hover:bg-surface'
                const nameCls =
                  mod >= 2 ? 'text-violet-800'
                    : mod === 1 ? 'text-amber-800'
                      : s.safety && s.hit ? 'text-red-600'
                        : s.hit ? 'text-primary'
                          : 'text-muted'
                // 圆点保留命中/安全信息(与改动色互补)
                const dotCls = s.safety && s.hit ? 'bg-red-500' : s.hit ? 'bg-primary' : 'bg-[#c9ced6]'
                return (
                  <div
                    key={s.name}
                    role="button"
                    tabIndex={0}
                    onClick={() => openEdit(s.name)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEdit(s.name) } }}
                    className={`group relative mx-1 my-[3px] flex cursor-pointer items-center gap-2.5 rounded-xl border px-2.5 py-2.5 transition ${rowCls} ${flashing === s.name ? 'ring-2 ring-primary/40' : ''}`}
                  >
                    <span className={`h-[7px] w-[7px] flex-none rounded-full ${dotCls}`} />
                    <span className={`text-[13px] font-semibold ${nameCls}`} title={s.name}>{sectionLabel(s.name)}</span>
                    <span className="whitespace-nowrap font-mono text-[10px] text-muted/70">{t('common.chars', { n: s.chars ?? 0 })}</span>
                    {isDynamicSection(s.name) && (
                      <span className="whitespace-nowrap rounded bg-sky-100 px-1.5 py-0.5 text-[9px] font-bold text-sky-700" title={t('panel.dynamicTip')}>{t('panel.dynamicBadge')}</span>
                    )}
                    {mod > 0 && (
                      <span className={`ml-auto rounded px-1.5 py-0.5 text-[9px] font-bold ${mod >= 2 ? 'bg-violet-200 text-violet-800' : 'bg-amber-200 text-amber-800'}`}>{t('panel.modCount', { n: mod })}</span>
                    )}
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>
    </aside>
  )
}
