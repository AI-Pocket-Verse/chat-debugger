import type { ChatPipelineTrace } from '../types/trace'
import { t as tr, type MsgKey } from '../i18n'

// 层名、节点标题的文案 key 分别是 `layer.<idx>`、`node.<key>`(见 i18n/zh.ts)
export interface PipelineNode {
  key: string
  hit: (t: ChatPipelineTrace) => boolean
  danger?: (t: ChatPipelineTrace) => boolean
  meta: (t: ChatPipelineTrace) => string
  detail: (t: ChatPipelineTrace) => Record<string, string>
  link?: string // 关联左侧 prompt 段名
}
export interface PipelineLayer { idx: string; nodes: PipelineNode[] }

export const layerName = (l: PipelineLayer) => tr(`layer.${l.idx}` as MsgKey)
export const nodeTitle = (n: PipelineNode) => tr(`node.${n.key}` as MsgKey)

const s = (v: unknown) => (v === undefined || v === null ? '—' : String(v))

export const PIPELINE_LAYERS: PipelineLayer[] = [
  { idx: '01', nodes: [
    { key: 'input.user', hit: t => !!t.input?.user_text, meta: t => tr('common.chars', { n: t.input?.user_text?.length ?? 0 }), detail: t => ({ user_text: s(t.input?.user_text), image_count: s(t.input?.image_count) }) },
    { key: 'input.image', hit: t => (t.input?.image_count ?? 0) > 0, meta: t => `image_count ${t.input?.image_count ?? 0}`, detail: t => ({ image_count: s(t.input?.image_count) }) },
  ] },
  { idx: '02', nodes: [
    { key: 'safety.check', hit: () => true, danger: t => !!t.safety?.risky || !!t.safety?.block, meta: t => `${s(t.safety?.category)}`, detail: t => ({ category: s(t.safety?.category), risky: s(t.safety?.risky), risk_level: s(t.safety?.risk_level), block: s(t.safety?.block) }), link: 'SafetyConstraints' },
    { key: 'safety.persona_guard', hit: t => !!t.safety?.persona_guard?.detected, meta: t => (t.safety?.persona_guard?.detected ? s(t.safety.persona_guard.manipulation_type) : tr('trace.legendMiss')), detail: t => ({ detected: s(t.safety?.persona_guard?.detected), severity: s(t.safety?.persona_guard?.severity), strategy: s(t.safety?.persona_guard?.response_strategy) }) },
  ] },
  { idx: '03', nodes: [
    { key: 'state.emotion', hit: t => !!t.state?.emotion, meta: t => tr('meta.intensity', { name: s(t.state?.emotion?.name), n: s(t.state?.emotion?.intensity) }), detail: t => ({ label: s(t.state?.emotion?.label), intensity: s(t.state?.emotion?.intensity), risk_level: s(t.state?.emotion?.risk_level), confidence: s(t.state?.emotion?.confidence) }), link: 'EmotionStrategy' },
    { key: 'state.intent', hit: t => !!t.state?.hidden_intent, meta: t => s(t.state?.hidden_intent?.primary_need), detail: t => ({ surface_intent: s(t.state?.hidden_intent?.surface_intent), primary_need: s(t.state?.hidden_intent?.primary_need), recommended_mode: s(t.state?.hidden_intent?.recommended_mode), must_not_assert: s(t.state?.hidden_intent?.must_not_assert) }) },
    { key: 'state.fatigue', hit: t => (t.state?.fatigue_level ?? 0) > 0, meta: t => `fatigue ${t.state?.fatigue_level ?? 0}`, detail: t => ({ fatigue_level: s(t.state?.fatigue_level) }) },
  ] },
  { idx: '04', nodes: [
    { key: 'relationship.state', hit: t => !!t.relationship?.executed, meta: t => tr('meta.trust', { stage: s(t.relationship?.stage), n: s(t.relationship?.trust_score) }), detail: t => ({ executed: s(t.relationship?.executed), stage: s(t.relationship?.stage), love_score: s(t.relationship?.love_score), trust_score: s(t.relationship?.trust_score), dependency_risk: s(t.relationship?.dependency_risk) }), link: 'RelationshipState' },
    { key: 'relationship.cognitive', hit: t => !!t.relationship?.cognitive && Object.keys(t.relationship.cognitive).length > 0, meta: t => s(t.relationship?.cognitive?.relationship_position), detail: t => ({ position: s(t.relationship?.cognitive?.relationship_position), trust_level: s(t.relationship?.cognitive?.trust_level), memory_strategy: s(t.relationship?.cognitive?.memory_strategy) }) },
    { key: 'relationship.persona', hit: t => !!t.relationship?.persona_state, meta: t => s(t.relationship?.persona_state?.current_state), detail: t => ({ current_state: s(t.relationship?.persona_state?.current_state), companion_override: s(t.relationship?.persona_state?.companion_override), laziness: s(t.relationship?.persona_state?.laziness_score) }) },
    { key: 'relationship.boundary', hit: t => { const b = t.relationship?.boundary; return !!b && (b.no_flirt || b.jealousy_mode || b.proactive_disabled || (!!b.romance_expression && b.romance_expression !== 'normal')) }, meta: t => s(t.relationship?.boundary?.romance_expression), detail: t => ({ romance_expression: s(t.relationship?.boundary?.romance_expression), no_flirt: s(t.relationship?.boundary?.no_flirt), jealousy_mode: s(t.relationship?.boundary?.jealousy_mode), proactive_disabled: s(t.relationship?.boundary?.proactive_disabled) }) },
    { key: 'relationship.dep_gate', hit: t => !!t.relationship?.dependency_gate_hit, meta: t => tr(t.relationship?.dependency_gate_hit ? 'meta.depGateOn' : 'meta.depGateOff'), detail: t => ({ dependency_gate_hit: s(t.relationship?.dependency_gate_hit), dependency_risk: s(t.relationship?.dependency_risk) }) },
  ] },
  { idx: '05', nodes: [
    { key: 'routing.intent_frame', hit: t => !!t.routing?.intent_frame, meta: t => s(t.routing?.intent_frame?.primary_task), detail: t => ({ primary_task: s(t.routing?.intent_frame?.primary_task), output_mode: s(t.routing?.intent_frame?.output_mode), need_memory: s(t.routing?.intent_frame?.need_memory), confidence: s(t.routing?.intent_frame?.confidence) }) },
    { key: 'routing.route', hit: t => !!t.routing?.route_decision, meta: t => `${s(t.routing?.route_decision?.capability)}·${s(t.routing?.route_decision?.output_mode)}`, detail: t => ({ capability: s(t.routing?.route_decision?.capability), output_mode: s(t.routing?.route_decision?.output_mode), use_memory: s(t.routing?.route_decision?.use_memory), reason: s(t.routing?.route_decision?.reason) }) },
    { key: 'routing.decision', hit: t => !!t.routing?.decision, meta: t => s(t.routing?.decision?.action_type), detail: t => ({ action_type: s(t.routing?.decision?.action_type), strategy_key: s(t.routing?.decision?.strategy_key), reply_mode: s(t.routing?.decision?.reply_mode), max_reply_chars: s(t.routing?.decision?.max_reply_chars), single_question_only: s(t.routing?.decision?.single_question_only) }), link: 'BehaviorPolicy' },
  ] },
  { idx: '06', nodes: [
    { key: 'prompt.build', hit: t => (t.prompt?.sections?.length ?? 0) > 0, meta: t => tr('meta.sections', { n: t.prompt?.sections?.length ?? 0, chars: s(t.prompt?.total_chars) }), detail: t => ({ total_chars: s(t.prompt?.total_chars), sections: s(t.prompt?.sections?.length), trim_events: s(t.prompt?.trim_events?.length ?? 0) }) },
    { key: 'memory.mem', hit: t => !!t.memory?.mem_used, meta: t => `mem_used·${s(t.memory?.recall_level)}`, detail: t => ({ mem_used: s(t.memory?.mem_used), recall_level: s(t.memory?.recall_level), recall_event_limit: s(t.memory?.recall_event_limit), tree_hole_recalled: s(t.memory?.tree_hole_recalled), degraded: s(t.memory?.degraded) }), link: 'MemoryRecall' },
    { key: 'memory.guard', hit: t => !!t.memory?.safety_mode, meta: t => `safety_mode ${s(t.memory?.safety_mode)}`, detail: t => ({ safety_mode: s(t.memory?.safety_mode) }) },
    { key: 'generation.llm', hit: t => !!t.generation, meta: t => (t.generation ? `${s(t.generation.model)}·${s(t.generation.total_ms)}ms` : tr('meta.beforeDispatch')), detail: t => ({ model: s(t.generation?.model), total_ms: s(t.generation?.total_ms), first_token_ms: s(t.generation?.first_token_ms) }) },
  ] },
]

const NODE_INDEX = new Map(PIPELINE_LAYERS.flatMap(l => l.nodes).map(n => [n.key, n]))
export function nodeHit(key: string, t: ChatPipelineTrace): boolean {
  const n = NODE_INDEX.get(key)
  return n ? n.hit(t) : false
}
