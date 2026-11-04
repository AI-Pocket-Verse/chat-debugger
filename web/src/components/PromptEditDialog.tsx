import { useCallback, useEffect, useState } from 'react'
import { useUiStore } from '../stores/ui'
import { usePromptStore } from '../stores/prompt'
import { backendCfg, useConfigStore } from '../stores/config'
import { promptOverride, getPromptOverrideHistory, type OverrideHistoryEntry } from '../lib/backendClient'
import { isSafetySection, isDynamicSection, sectionLabel } from '../lib/sections'
import { ModalShell, Field, inputCls, Btn } from './ui/ModalShell'
import { useT } from '../i18n'

// 后端存的 at 是 RFC3339(带时区,如 2026-07-08T16:30:00+08:00 或 …Z),按浏览器本地时区显示成 "07-08 16:30";
// 解析不了时退回原文截取
const pad = (n: number) => String(n).padStart(2, '0')
const fmtTime = (at?: string) => {
  const d = new Date(at ?? '')
  if (Number.isNaN(d.getTime())) return (at ?? '').replace('T', ' ').slice(5, 16)
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// 逐字 LCS 差异:只把 cur 中【不属于公共子序列】的字符标为改动(hi)——即真正新增/改掉的字,
// 中间没改的字保持原样。避免"一句话两端都改就把整句高亮"。相邻同类合并成段减少节点。
function diffChangedParts(orig: string, cur: string): { t: string; hi: boolean }[] {
  if (orig === cur) return [{ t: cur, hi: false }]
  const a = orig
  const b = cur
  const n = a.length
  const m = b.length
  if (n * m > 4_000_000) return [{ t: cur, hi: true }] // 过大不做 LCS,整段视为改动,避免卡顿
  const w = m + 1
  const dp = new Int32Array((n + 1) * w) // dp[i][j] = LCS(a[i:], b[j:])
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i * w + j] = a[i] === b[j] ? dp[(i + 1) * w + (j + 1)]! + 1 : Math.max(dp[(i + 1) * w + j]!, dp[i * w + (j + 1)]!)
  const parts: { t: string; hi: boolean }[] = []
  const push = (ch: string, hi: boolean) => {
    const last = parts[parts.length - 1]
    if (last && last.hi === hi) last.t += ch
    else parts.push({ t: ch, hi })
  }
  let i = 0
  let j = 0
  while (j < m) {
    if (i < n && a[i] === b[j]) { push(b[j] as string, false); i++; j++ } // 公共字符,不高亮
    else if (i < n && dp[(i + 1) * w + j]! >= dp[i * w + (j + 1)]!) { i++ } // orig 删除,cur 里没有,跳过
    else { push(b[j] as string, true); j++ } // cur 新增/改动 → 高亮
  }
  return parts
}

export default function PromptEditDialog() {
  const name = useUiStore((s) => s.editSection)
  const openEdit = useUiStore((s) => s.openEdit)
  const sections = usePromptStore((s) => s.sections)
  const markOverridden = usePromptStore((s) => s.markOverridden)
  const cfg = useConfigStore()
  const t = useT()
  const section = sections.find((s) => s.name === name)
  const [text, setText] = useState('')
  const [ttl, setTtl] = useState(0)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [history, setHistory] = useState<OverrideHistoryEntry[]>([])
  // 后端上本段当前生效的覆盖内容(有则优先展示为"已覆盖"并预填编辑框);undefined=无覆盖
  const [serverOverride, setServerOverride] = useState<string | undefined>(undefined)

  const operator = cfg.operator // 修改人:「连接配置」里填的操作人,随 override 发给后端记录

  // 拉全局修改记录(存在后端,所有人共享)
  const loadHistory = useCallback(() => {
    getPromptOverrideHistory(backendCfg(), 50)
      .then(setHistory)
      .catch(() => setHistory([]))
  }, [cfg.baseUrl, cfg.debugKey])

  // 仅在「切换到另一个段」(name 变)时初始化。除拉历史外,还拉一次后端上的【当前生效覆盖】:
  // 有本段覆盖就优先填进编辑框并标"已覆盖"——修复"编辑改动后刷新又回原文"(左侧分段来自
  // persona 种子=原文,并不反映覆盖;覆盖优先只发生在后端拼 prompt 时)。
  // 不依赖 section 身份:否则 markOverridden 保存后重跑会清掉刚设的提示。
  useEffect(() => {
    if (!name || !section) return
    setTtl(0); setMsg('')
    setText(section.content ?? '') // 先用原文兜底
    setServerOverride(undefined)
    loadHistory()
    let alive = true
    promptOverride(backendCfg(), { action: 'get' })
      .then((r) => {
        if (!alive) return
        const ov = (r.override as { sections?: Record<string, string> } | null)?.sections?.[name]
        if (ov != null) { setServerOverride(ov); setText(ov) } // 有覆盖 → 优先展示覆盖内容
      })
      .catch(() => {})
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name])

  if (!name || !section) return null
  const safety = isSafetySection(name)
  const dynamic = isDynamicSection(name) // 运行时动态数据(时间/记忆):只读,不支持覆盖修改
  const isOverridden = serverOverride != null // 以后端当前覆盖为准(刷新后不丢),不用本地 section.overridden
  // 本段相关记录:set 命中本段,或 clear(清全部,也影响本段)
  const mine = history.filter((e) => e.action === 'clear' || (e.sections && name in e.sections))
  // 本段「当前改动次数」(clear 清零重算):1 次=琥珀,2 次+=紫,用于编辑内容区着色
  let modCount = 0
  for (let i = history.length - 1; i >= 0; i--) {
    const e = history[i]
    if (!e) continue
    if (e.action === 'clear') modCount = 0
    else if (e.sections && name in e.sections) modCount++
  }
  // 相对原文(section.content)的改动高亮:只要编辑内容 ≠ 原文就高亮(含未保存的首次编辑)
  const diffParts = diffChangedParts(section.content ?? '', text)
  const hasDiff = diffParts.some((x) => x.hi)
  // 编辑框左侧色条:1 次=琥珀 / 2 次+=紫
  const accentCls = modCount >= 2 ? 'border-l-4 border-l-violet-400' : modCount === 1 ? 'border-l-4 border-l-amber-400' : ''

  const apply = async (content: string) => {
    setBusy(true); setMsg('')
    try {
      const r = await promptOverride(backendCfg(), { action: 'set', sections: { [name]: content }, ttl_seconds: ttl, operator })
      markOverridden(name, true)
      setServerOverride(content)
      loadHistory()
      if (r.safety_touched) setMsg(t('edit.safetyTouched'))
      else openEdit(null)
    } catch (e) { setMsg(String(e)) } finally { setBusy(false) }
  }
  const save = () => apply(text)
  const clear = async () => {
    // 协议的 clear 没有段名,清的是后端全部段的覆盖(全局共享):必须让用户知道
    if (!window.confirm(t('edit.clearConfirm'))) return
    setBusy(true); setMsg('')
    try { await promptOverride(backendCfg(), { action: 'clear', operator }); markOverridden(name, false); setServerOverride(undefined); openEdit(null) }
    catch (e) { setMsg(String(e)) } finally { setBusy(false) }
  }
  // 回滚 = 把该版本内容载回编辑框(需再点「保存覆盖」才应用,避免共享环境误触发全局覆盖)
  const rollback = (content: string) => { setText(content); setMsg(t('edit.rollbackLoaded')) }

  return (
    <ModalShell
      open={!!name}
      onOpenChange={(b) => !b && openEdit(null)}
      icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-[19px]"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>}
      title={t('edit.title', { name: sectionLabel(name) })}
      desc={t('edit.desc')}
      footer={
        <>
          <span className="mr-auto text-[11.5px] text-muted/70">{dynamic ? t('edit.statusDynamic') : isOverridden ? t('edit.statusOverridden') : t('edit.statusDefault')}</span>
          {!dynamic && isOverridden && <Btn variant="danger" disabled={busy} onClick={clear}>{t('edit.clearAll')}</Btn>}
          <Btn onClick={() => openEdit(null)}>{dynamic ? t('common.close') : t('common.cancel')}</Btn>
          {!dynamic && <Btn variant="primary" disabled={busy} onClick={save}>{busy ? t('edit.saving') : t('edit.save')}</Btn>}
        </>
      }
    >
      {safety && (
        <div className="mb-3.5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[12px] text-red-600">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 flex-none"><path d="M12 2 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6z" /></svg>
          <div><b>{t('edit.safetyTitle')}</b>{t('edit.safetyBefore')}<span className="font-mono">override_safety_touched</span>{t('edit.safetyAfter')}</div>
        </div>
      )}
      {dynamic && (
        <div className="mb-3.5 flex items-start gap-2.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-[12px] text-sky-700">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 flex-none"><path d="M12 6v6l4 2" /><circle cx="12" cy="12" r="9" /></svg>
          <div><b>{t('edit.dynamicTitle')}</b>{t('edit.dynamicBody')}</div>
        </div>
      )}
      <Field label={t('edit.contentLabel', { node: section.source_node ?? '—' })}>
        {modCount > 0 && (
          <div className={`mb-1.5 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-bold ${modCount >= 2 ? 'bg-violet-100 text-violet-800' : 'bg-amber-100 text-amber-800'}`}>
            <span className={`h-2 w-2 rounded-full ${modCount >= 2 ? 'bg-violet-500' : 'bg-amber-500'}`} />
            {modCount >= 2 ? t('edit.modN', { n: modCount }) : t('edit.mod1')}
          </div>
        )}
        {hasDiff && (
          <div className="mb-1.5 rounded-xl border border-line/70 bg-white px-3 py-2 text-[13px] leading-relaxed">
            <div className="mb-1 text-[10.5px] font-semibold text-muted/70">{t('edit.diffTitle')}</div>
            <div className="whitespace-pre-wrap text-fg">
              {diffParts.map((x, i) =>
                x.hi ? (
                  <span key={i} className="rounded bg-amber-200 px-0.5 font-bold text-amber-900">{x.t}</span>
                ) : (
                  <span key={i}>{x.t}</span>
                ),
              )}
            </div>
          </div>
        )}
        <textarea readOnly={dynamic} className={`${inputCls} min-h-[150px] resize-y leading-relaxed ${accentCls} ${dynamic ? 'cursor-not-allowed opacity-70' : ''}`} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      {!dynamic && (
        <>
      <Field label={t('edit.ttl')}>
        <input type="number" className={`${inputCls} w-32`} value={ttl} onChange={(e) => setTtl(Number(e.target.value) || 0)} />
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted/70">
          {t('edit.ttlLead')}<b className="text-muted">{t('edit.ttlZero')}</b>{t('edit.ttlZeroTail')}<b className="text-muted">{t('edit.ttlPos')}</b>{t('edit.ttlTail')}
        </p>
      </Field>

      <Field label={t('edit.history', { op: operator || t('edit.noOperator') })}>
        {mine.length === 0 ? (
          <div className="text-[12px] text-muted/70">{t('edit.historyEmpty')}</div>
        ) : (
          <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
            {mine.map((e, i) => {
              const content = e.action === 'clear' ? '' : e.sections?.[name] ?? ''
              return (
                <div key={i} className="flex items-start gap-2.5 rounded-xl border border-line/70 bg-surface px-2.5 py-2 text-[11.5px]">
                  <div className="flex-none">
                    <div className="font-mono text-muted/70">{fmtTime(e.at)}</div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${e.action === 'clear' ? 'bg-red-100 text-red-600' : 'bg-accent-soft text-primary'}`}>{e.action === 'clear' ? t('edit.actionClear') : t('edit.actionSet')}</span>
                      <span className="max-w-[92px] truncate text-muted" title={e.operator}>{e.operator || '—'}</span>
                    </div>
                  </div>
                  <span className="min-w-0 flex-1 self-center truncate text-muted" title={content}>{e.action === 'clear' ? t('edit.clearedAll') : content.slice(0, 80) || t('common.empty')}</span>
                  {e.action === 'set' && content && (
                    <button onClick={() => rollback(content)} className="flex-none self-center rounded-full bg-accent-soft px-2.5 py-1 text-[10.5px] font-bold text-primary">{t('edit.rollback')}</button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Field>
        </>
      )}

      {msg && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-600">{msg}</div>}
    </ModalShell>
  )
}
