import { describe, it, expect } from 'vitest'
import { PIPELINE_LAYERS, nodeHit } from './pipeline'
import type { ChatPipelineTrace } from '../types/trace'

const base = (): ChatPipelineTrace => ({
  req_id: 'r', uid: 1, role_id: 2, role_name: '角色甲', content_type: 'text',
  stages: [], input: { user_text: 'hi', image_count: 0 },
  safety: { category: 'safe', risky: false, risk_level: 0, block: false, tier: 0, blocked: false, is_safety_card: false,
    persona_guard: { detected: false, severity: 0, should_reduce_romance: false, block_persona_update: false } },
  state: { emotion: { label: 'anxiety', name: '焦虑', intensity: 3, risk_level: 1, is_peak_event: false, confidence: 0.8 }, fatigue_level: 0,
    hidden_intent: { surface_intent: 'x', primary_need: 'y', confidence: 0.8, must_not_assert: false } },
  relationship: { executed: true, love_score: 40, trust_score: 60, dependency_risk: 1, dependency_gate_hit: false,
    cognitive: {}, boundary: { no_flirt: false, jealousy_mode: false, proactive_disabled: false } },
  routing: { decision: { action_type: 'comfort', strategy_key: 'k', persona_state: 's', max_reply_chars: 80, allow_question: true, allow_memory_ref: true, allow_playful: false, single_question_only: true } },
  prompt: { total_chars: 100, sections: [], system_prompt: '', user_prompt: 'hi' },
  memory: { mem_used: true, tree_hole_recalled: false, memory_var_count: 3, recall_event_limit: 7, degraded: false, safety_mode: false },
})

describe('nodeHit', () => {
  it('用户输入 恒绿; 图片输入 无图灰', () => {
    const t = base()
    expect(nodeHit('input.user', t)).toBe(true)
    expect(nodeHit('input.image', t)).toBe(false)
  })
  it('PersonaGuard 未 detected 灰; detected 绿', () => {
    const t = base()
    expect(nodeHit('safety.persona_guard', t)).toBe(false)
    t.safety.persona_guard.detected = true
    expect(nodeHit('safety.persona_guard', t)).toBe(true)
  })
  it('疲惫 >0 绿', () => {
    const t = base()
    expect(nodeHit('state.fatigue', t)).toBe(false)
    t.state.fatigue_level = 2
    expect(nodeHit('state.fatigue', t)).toBe(true)
  })
  it('依赖门控 由 dependency_gate_hit 决定', () => {
    const t = base()
    expect(nodeHit('relationship.dep_gate', t)).toBe(false)
    t.relationship.dependency_gate_hit = true
    expect(nodeHit('relationship.dep_gate', t)).toBe(true)
  })
  it('记忆 由 mem_used 决定', () => {
    const t = base()
    expect(nodeHit('memory.mem', t)).toBe(true)
    t.memory.mem_used = false
    expect(nodeHit('memory.mem', t)).toBe(false)
  })
  it('六层覆盖所有节点', () => {
    expect(PIPELINE_LAYERS).toHaveLength(6)
  })
})
