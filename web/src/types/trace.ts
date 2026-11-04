export interface TraceStage { stage: string; executed: boolean; delta_ms: number; cumulative_ms: number; skipped_reason?: string }
export interface TraceInput { user_text: string; image_count: number }
export interface TracePersonaGuard { detected: boolean; manipulation_type?: string; severity: number; targeted_layer?: string; response_strategy?: string; should_reduce_romance: boolean; block_persona_update: boolean; reason_codes?: string[] }
export interface TraceSafety { category: string; risky: boolean; risk_level: number; block: boolean; tier: number; blocked: boolean; is_safety_card: boolean; persona_guard: TracePersonaGuard }
export interface TraceEmotion { label: string; name: string; intensity: number; risk_level: number; is_peak_event: boolean; trigger_event?: string; confidence: number }
export interface TraceHiddenIntent { surface_intent: string; primary_need: string; recommended_mode?: string; confidence: number; certainty_level?: string; must_not_assert: boolean }
export interface TraceState { emotion: TraceEmotion; fatigue_level: number; hidden_intent: TraceHiddenIntent }
export interface TraceCognitive { relationship_position?: string; trust_level?: string; memory_richness?: string; memory_strategy?: string }
export interface TracePersonaState { current_state?: string; companion_override: boolean; laziness_score: number }
export interface TraceBoundary { romance_expression?: string; no_flirt: boolean; jealousy_mode: boolean; proactive_disabled: boolean }
export interface TraceRelation { executed: boolean; stage?: string; love_score: number; trust_score: number; dependency_risk: number; dependency_gate_hit: boolean; cognitive: TraceCognitive; persona_state?: TracePersonaState; boundary: TraceBoundary }
export interface TraceIntentFrame { primary_task: string; secondary_tasks: string[]; focus_target: string; output_mode: string; asset_strategy?: string; need_vision: boolean; need_memory: boolean; need_recent_context: boolean; confidence: number; intent_summary?: string }
export interface TraceRouteDecision { capability: string; output_mode: string; asset_strategy?: string; use_vision: boolean; use_memory: boolean; use_recent_context: boolean; need_image_category: boolean; confidence: number; reason?: string }
export interface TraceDecision { action_type: string; strategy_key: string; persona_state: string; reply_mode?: string; max_reply_chars: number; allow_question: boolean; allow_memory_ref: boolean; allow_playful: boolean; single_question_only: boolean; forbidden_actions?: string[]; reason_code?: string }
export interface TraceRouting { intent_frame?: TraceIntentFrame; route_decision?: TraceRouteDecision; decision: TraceDecision }
export interface TracePromptSection { name: string; chars: number; content?: string; overridden?: boolean; source_node?: string }
export interface TraceTrimEvent { section: string; before: number; after: number; reason: string }
export interface TracePrompt { total_chars: number; sections: TracePromptSection[]; trim_events?: TraceTrimEvent[]; romance_section?: string; system_prompt: string; user_prompt: string }
export interface TraceMemory { mem_used: boolean; tree_hole_recalled: boolean; memory_var_count: number; recall_level?: string; recall_event_limit: number; degraded: boolean; safety_mode: boolean }
export interface TraceGeneration { model?: string; total_ms: number; assistant_text?: string; first_token_ms: number; input_tokens: number; output_tokens: number; total_tokens: number; cached_tokens: number; web_search_used: boolean; guard_replaced_count: number }
export interface ChatPipelineTrace {
  req_id: string; uid: number; role_id: number; role_name: string; content_type: string
  terminal?: string; degrade_reasons?: string[]
  stages: TraceStage[]; input: TraceInput; safety: TraceSafety; state: TraceState
  relationship: TraceRelation; routing: TraceRouting; prompt: TracePrompt; memory: TraceMemory
  ui_flags?: Record<string, unknown>; generation?: TraceGeneration
  override_active?: boolean; override_safety_touched?: boolean
}
export type TraceFrame =
  | { status: 'pipeline_trace'; session_id: string; ts: number; trace: ChatPipelineTrace }
  | { status: 'pipeline_trace_final'; session_id: string; message_id: number; ts: number; trace: ChatPipelineTrace }
