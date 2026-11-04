import type { ChatPipelineTrace } from '../types/trace'

export function sampleTrace(): ChatPipelineTrace {
  return {
    req_id: 'req_abc', uid: 1, role_id: 2, role_name: '角色甲', content_type: 'text',
    terminal: 'model_reply_finalized',
    stages: [],
    input: { user_text: '最近工作压力好大', image_count: 0 },
    safety: { category: 'safe', risky: false, risk_level: 0, block: false, tier: 0, blocked: false, is_safety_card: false, persona_guard: { detected: false, severity: 0, should_reduce_romance: false, block_persona_update: false } },
    state: { emotion: { label: 'anxiety', name: '焦虑', intensity: 3, risk_level: 1, is_peak_event: false, confidence: 0.86 }, fatigue_level: 2, hidden_intent: { surface_intent: '吐槽', primary_need: '被陪伴', confidence: 0.8, must_not_assert: false } },
    relationship: { executed: true, stage: 'S2', love_score: 42, trust_score: 61, dependency_risk: 1, dependency_gate_hit: false, cognitive: { relationship_position: '伙伴' }, persona_state: { current_state: 'companion', companion_override: true, laziness_score: 0 }, boundary: { romance_expression: 'restrained', no_flirt: true, jealousy_mode: false, proactive_disabled: false } },
    routing: { intent_frame: { primary_task: '情绪陪伴', secondary_tasks: [], focus_target: '', output_mode: 'text', need_vision: false, need_memory: true, need_recent_context: true, confidence: 0.82 }, route_decision: { capability: 'chat', output_mode: 'text', use_vision: false, use_memory: true, use_recent_context: true, need_image_category: false, confidence: 0.8 }, decision: { action_type: 'comfort', strategy_key: 'emotion_hold', persona_state: 'companion', reply_mode: 'short', max_reply_chars: 80, allow_question: true, allow_memory_ref: true, allow_playful: false, single_question_only: true } },
    prompt: {
      total_chars: 1096,
      sections: [
        { name: 'Role', chars: 210, source_node: 'persona', content: '你是「角色甲」——沉稳可靠。' },
        { name: 'EmotionStrategy', chars: 180, source_node: 'emotion', overridden: true, content: '【策略：情绪承接】先接住情绪。' },
        { name: 'SafetyConstraints', chars: 240, source_node: 'safety', content: '安全边界:不鼓励危险行为。' },
      ],
      system_prompt: '# Role\n你是「角色甲」\n\n# EmotionStrategy\n【策略：情绪承接】',
      user_prompt: '最近工作压力好大',
    },
    memory: { mem_used: true, tree_hole_recalled: false, memory_var_count: 3, recall_level: 'more', recall_event_limit: 7, degraded: false, safety_mode: false },
    generation: { model: 'example-model', total_ms: 2333, assistant_text: '…', first_token_ms: 0, input_tokens: 0, output_tokens: 0, total_tokens: 0, cached_tokens: 0, web_search_used: false, guard_replaced_count: 0 },
  }
}
