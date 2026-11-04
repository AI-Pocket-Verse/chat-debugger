import { useState } from 'react'
import type { ChatPipelineTrace } from '../types/trace'
import { PIPELINE_LAYERS, layerName, nodeTitle } from '../lib/pipeline'
import { useLang, useT } from '../i18n'
import { usePromptStore } from '../stores/prompt'
import { ModalShell } from './ui/ModalShell'

// 节点明细字段的中文标注;英文界面直接显示字段名
const KEY_ZH: Record<string, string> = {
  user_text: '用户文本', image_count: '图片数',
  category: '安全类目', risky: '是否风险', risk_level: '风险等级', block: '是否拦截',
  detected: '是否命中操控', severity: '严重度', strategy: '应对策略',
  label: '情绪标签', intensity: '强度', confidence: '置信度',
  surface_intent: '表层意图', primary_need: '核心需求', recommended_mode: '建议模式', must_not_assert: '禁止断言',
  fatigue_level: '疲惫度',
  executed: '是否执行', stage: '关系阶段', love_score: '好感', trust_score: '信任', dependency_risk: '依赖风险',
  position: '关系位置', trust_level: '信任层级', memory_strategy: '记忆策略',
  current_state: '动态状态', companion_override: '陪伴覆盖', laziness: '懒惰度',
  romance_expression: '恋爱表达', no_flirt: '禁调情', jealousy_mode: '吃醋模式', proactive_disabled: '主动禁用',
  dependency_gate_hit: '依赖门控命中',
  primary_task: '主任务', output_mode: '输出模式', need_memory: '需记忆', capability: '能力', use_memory: '用记忆', reason: '原因',
  action_type: '动作类型', strategy_key: '策略键', reply_mode: '回复模式', max_reply_chars: '最大回复字数', single_question_only: '仅单个提问',
  total_chars: '总字符数', sections: '分段数', trim_events: '截断次数',
  mem_used: '是否用记忆', recall_level: '召回档', recall_event_limit: '召回条数', tree_hole_recalled: '树洞召回', degraded: '是否降级',
  safety_mode: 'Guard 武装态',
  model: '模型', total_ms: '总耗时(ms)', first_token_ms: '首帧耗时(ms)',
}

export default function TraceGraphDialog({ open, onOpenChange, trace, firstTokenMs }: { open: boolean; onOpenChange: (b: boolean) => void; trace?: ChatPipelineTrace; firstTokenMs?: number }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const flash = usePromptStore((s) => s.flash)
  const t = useT()
  const lang = useLang()
  if (!trace) return null
  const toggle = (k: string) => setExpanded((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })
  const gen = trace.generation

  return (
    <ModalShell
      open={open}
      onOpenChange={onOpenChange}
      wide
      icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-[19px]"><circle cx="6" cy="6" r="2.2" /><circle cx="6" cy="18" r="2.2" /><circle cx="18" cy="12" r="2.2" /><path d="M8 7 16 11M8 17 16 13" /></svg>}
      title={t('trace.title')}
      desc={t('trace.desc')}
    >
      <div className="mb-4 flex flex-wrap items-center gap-4 text-[12px] font-semibold text-muted">
        <b className="inline-flex items-center gap-1.5 font-semibold"><span className="h-2.5 w-2.5 rounded-full bg-primary" />{t('trace.legendHit')}</b>
        <b className="inline-flex items-center gap-1.5 font-semibold"><span className="h-2.5 w-2.5 rounded-full bg-[#c9ced6]" />{t('trace.legendMiss')}</b>
        <b className="inline-flex items-center gap-1.5 font-semibold"><span className="h-2.5 w-2.5 rounded-full bg-red-500" />{t('trace.legendDanger')}</b>
        <span className="ml-auto font-normal text-muted/70">{t('trace.clickHint')}</span>
      </div>

      <div className="mb-4 flex flex-wrap gap-2.5 text-[11.5px]">
        {trace.terminal && <span className="rounded-lg border border-line/70 bg-surface px-2.5 py-1.5 text-muted">terminal: <b className="text-primary">{trace.terminal}</b></span>}
        {gen?.model && <span className="rounded-lg border border-line/70 bg-surface px-2.5 py-1.5 text-muted">model: <b className="text-primary">{gen.model}</b></span>}
        {gen?.total_ms ? <span className="rounded-lg border border-line/70 bg-surface px-2.5 py-1.5 text-muted">total_ms: <b className="text-primary">{gen.total_ms}</b></span> : null}
        <span className="rounded-lg border border-line/70 bg-surface px-2.5 py-1.5 text-muted">first_token_ms: <b className="text-primary">{firstTokenMs ?? gen?.first_token_ms ?? '—'}</b>{t('trace.selfMeasured')}</span>
      </div>

      {PIPELINE_LAYERS.map((L) => {
        const hits = L.nodes.filter((n) => n.hit(trace)).length
        return (
          <div key={L.idx} className="mb-4">
            <div className="mb-2.5 flex items-center gap-3">
              <span className="grid h-6 w-6 place-items-center rounded-lg bg-fg font-mono text-[11px] text-white">{L.idx}</span>
              <span className="font-semibold text-[15px]">{layerName(L)}</span>
              <span className="h-px max-w-[40px] flex-1 bg-line" />
              <span className="ml-auto font-mono text-[10px] text-muted/70">{t('trace.hits', { hits, total: L.nodes.length })}</span>
            </div>
            <div className="grid items-start gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(158px,1fr))' }}>
              {L.nodes.map((n) => {
                const hit = n.hit(trace)
                const danger = hit && n.danger?.(trace)
                const cls = danger ? 'border-red-200 bg-red-50' : hit ? 'border-primary/20 bg-accent-soft' : 'border-line/70 bg-surface opacity-60'
                const dot = danger ? 'bg-red-500' : hit ? 'bg-primary' : 'bg-[#c9ced6]'
                const txt = danger ? 'text-red-600' : hit ? 'text-primary' : 'text-muted'
                const isOpen = expanded.has(n.key)
                return (
                  <div key={n.key} onClick={() => toggle(n.key)} className={`cursor-pointer rounded-2xl border p-3 transition ${cls}`}>
                    <div className={`flex items-center gap-2 text-[13.5px] font-bold ${txt}`}><span className={`h-2.5 w-2.5 flex-none rounded-full ${dot}`} />{nodeTitle(n)}</div>
                    <div className="mt-1.5 pl-[17px] font-mono text-[11px] text-muted">{n.meta(trace)}</div>
                    {isOpen && (
                      <div className="mt-2.5 border-t border-dashed border-line pt-2.5 font-mono text-[11.5px] leading-relaxed text-muted">
                        {Object.entries(n.detail(trace)).map(([k, v]) => (
                          <div key={k}><span className="text-muted/60">{lang === 'zh' ? (KEY_ZH[k] ?? k) : k}:</span> {v}</div>
                        ))}
                        {n.link && (
                          <button onClick={(e) => { e.stopPropagation(); onOpenChange(false); flash(n.link!) }} className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-accent-soft px-2.5 py-1 font-sans font-semibold text-primary">{t('trace.linkSection', { name: n.link })}</button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </ModalShell>
  )
}
