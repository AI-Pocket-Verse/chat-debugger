/**
 * 示例后端：按 docs/backend-protocol.md 实现全部接口，回答与 trace 都是固定的假数据。
 * 用来本地体验观测台、或对照着实现自己的后端。不依赖任何第三方包。
 *
 *   pnpm mock                      # http://localhost:8680，Debug Key 为 mock-debug-key
 *   PORT=9000 DEBUG_KEY=xxx pnpm mock
 *   MOCK_LANG=en pnpm mock         # 假数据语言：zh / en；不设时按请求的 Accept-Language
 */
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.env.PORT ?? 8680)
const DEBUG_KEY = process.env.DEBUG_KEY ?? 'mock-debug-key'
const FORCED_LANG = process.env.MOCK_LANG === 'zh' || process.env.MOCK_LANG === 'en' ? process.env.MOCK_LANG : null

const MODELS = [
  { id: 'mock-fast', name: 'Mock Fast' },
  { id: 'mock-pro', name: 'Mock Pro' },
]
const DEFAULT_MODEL = 'mock-fast'

// 假数据文案，按语言各一份
const TEXT = {
  zh: {
    roles: [
      { name: '示例角色 A', brief: '沉稳的倾听者', persona: { identity_base: '你是「示例角色 A」，沉稳、耐心，先倾听再回应。', daily_style: '说话简短，语气温和。', safety_boundary: '不鼓励任何危险行为。' } },
      { name: '示例角色 B', brief: '活泼的聊天伙伴', persona: { identity_base: '你是「示例角色 B」，活泼、温暖。', daily_style: '回复简短自然，偶尔开个玩笑。', safety_boundary: '不鼓励任何危险行为。' } },
    ],
    role: (name) => `你是「${name}」，一个温和、耐心的聊天伙伴。`,
    rules: '回复简短自然，每次最多问一个问题。',
    safety: '不鼓励任何危险行为，遇到风险话题温和引导。',
    time: (iso) => `当前时间：${iso}`,
    emotion: '【策略：情绪承接】先接住情绪，再给建议。',
    recent: (input) => (input ? `用户刚说：${input}` : '（暂无）'),
    reply: (text, model) => `（示例后端 · ${model}）收到「${text}」。这是一段固定的假回答，用来演示流式输出和链路 trace。`,
    emotionName: '平静',
    intent: { surface: '闲聊', need: '被倾听', task: '闲聊' },
    position: '朋友',
    badKey: 'forbidden：X-Debug-Key 不正确',
    badToken: 'token 无效，请重新初始化会话',
    badModel: (m) => `未知模型：${m}`,
  },
  en: {
    roles: [
      { name: 'Sample Role A', brief: 'A calm listener', persona: { identity_base: 'You are “Sample Role A”: calm and patient; listen first, then respond.', daily_style: 'Keep replies short and gentle.', safety_boundary: 'Never encourage anything dangerous.' } },
      { name: 'Sample Role B', brief: 'A cheerful chat buddy', persona: { identity_base: 'You are “Sample Role B”: lively and warm.', daily_style: 'Short, natural replies with the occasional joke.', safety_boundary: 'Never encourage anything dangerous.' } },
    ],
    role: (name) => `You are “${name}”, a gentle and patient chat companion.`,
    rules: 'Keep replies short and natural; ask at most one question at a time.',
    safety: 'Never encourage anything dangerous; steer risky topics gently.',
    time: (iso) => `Current time: ${iso}`,
    emotion: '【Strategy: acknowledge feelings】Acknowledge the emotion first, then advise.',
    recent: (input) => (input ? `The user just said: ${input}` : '(none yet)'),
    reply: (text, model) => `(mock backend · ${model}) Got “${text}”. This is a canned reply that demonstrates streaming and the pipeline trace.`,
    emotionName: 'calm',
    intent: { surface: 'small talk', need: 'to be heard', task: 'small talk' },
    position: 'friend',
    badKey: 'forbidden: wrong X-Debug-Key',
    badToken: 'invalid token, please re-initialize the session',
    badModel: (m) => `unknown model: ${m}`,
  },
}

const ROLE_META = [
  { id: 1, gender: 1 },
  { id: 2, gender: 2 },
]
const OVERRIDABLE = ['Role', 'DialogueRules', 'EmotionStrategy', 'BehaviorPolicy']
const SAFETY = ['SafetyConstraints', 'PlatformRules']

let nextUid = 1000
/** token → { uid, roleId, stage } */
const sessions = new Map()
/** 全局 prompt 覆盖：段名 → 内容 */
let override = null
const history = []

const ok = (data) => ({ code: 200, msg: 'ok', data })
const fail = (code, msg) => ({ code, msg })

/** 假数据语言：MOCK_LANG 优先，否则看浏览器的 Accept-Language */
function langOf(req) {
  if (FORCED_LANG) return FORCED_LANG
  return /^\s*zh/i.test(req.headers['accept-language'] ?? '') ? 'zh' : 'en'
}

function rolesFor(L) {
  return ROLE_META.map((m, i) => {
    const r = TEXT[L].roles[i]
    return { id: m.id, name: r.name, gender: m.gender, brief: r.brief, prompt_persona: r.persona }
  })
}

function baseSections(L, role, input) {
  const T = TEXT[L]
  const sections = [
    { name: 'Role', source_node: 'persona', content: T.role(role.name) },
    { name: 'DialogueRules', source_node: 'persona', content: T.rules },
    { name: 'SafetyConstraints', source_node: 'safety', content: T.safety },
    { name: 'CurrentTime', source_node: 'context', content: T.time(new Date().toISOString()) },
    { name: 'EmotionStrategy', source_node: 'emotion', content: T.emotion },
    { name: 'RecentContext', source_node: 'context', content: T.recent(input) },
  ]
  return sections.map((s) => {
    const content = override?.[s.name] ?? s.content
    return { ...s, content, chars: content.length, overridden: override?.[s.name] != null }
  })
}

function buildTrace(L, sess, text, reply, model) {
  const T = TEXT[L]
  const role = rolesFor(L).find((r) => r.id === sess.roleId) ?? rolesFor(L)[0]
  const sections = baseSections(L, role, text)
  const system = sections.map((s) => `# ${s.name}\n${s.content}`).join('\n\n')
  const genMs = model === 'mock-pro' ? 1600 : 900
  return {
    req_id: `req_${Date.now()}`, uid: sess.uid, role_id: role.id, role_name: role.name, content_type: 'text',
    terminal: reply ? 'model_reply_finalized' : undefined,
    stages: [
      { stage: 'safety', executed: true, delta_ms: 12, cumulative_ms: 12 },
      { stage: 'state', executed: true, delta_ms: 85, cumulative_ms: 97 },
      { stage: 'relationship', executed: true, delta_ms: 20, cumulative_ms: 117 },
      { stage: 'routing', executed: true, delta_ms: 64, cumulative_ms: 181 },
      { stage: 'prompt', executed: true, delta_ms: 8, cumulative_ms: 189 },
      { stage: 'generation', executed: !!reply, delta_ms: reply ? genMs : 0, cumulative_ms: reply ? 189 + genMs : 189 },
    ],
    input: { user_text: text, image_count: 0 },
    safety: { category: 'safe', risky: false, risk_level: 0, block: false, tier: 0, blocked: false, is_safety_card: false, persona_guard: { detected: false, severity: 0, should_reduce_romance: false, block_persona_update: false } },
    state: { emotion: { label: 'calm', name: T.emotionName, intensity: 2, risk_level: 0, is_peak_event: false, confidence: 0.8 }, fatigue_level: 0, hidden_intent: { surface_intent: T.intent.surface, primary_need: T.intent.need, confidence: 0.7, must_not_assert: false } },
    relationship: { executed: true, stage: `S${sess.stage}`, love_score: 40, trust_score: 55, dependency_risk: 0, dependency_gate_hit: false, cognitive: { relationship_position: T.position }, persona_state: { current_state: 'normal', companion_override: false, laziness_score: 0 }, boundary: { romance_expression: 'normal', no_flirt: false, jealousy_mode: false, proactive_disabled: false } },
    routing: { intent_frame: { primary_task: T.intent.task, secondary_tasks: [], focus_target: '', output_mode: 'text', need_vision: false, need_memory: false, need_recent_context: true, confidence: 0.8 }, route_decision: { capability: 'chat', output_mode: 'text', use_vision: false, use_memory: false, use_recent_context: true, need_image_category: false, confidence: 0.8 }, decision: { action_type: 'chat', strategy_key: 'default', persona_state: 'normal', reply_mode: 'short', max_reply_chars: 80, allow_question: true, allow_memory_ref: false, allow_playful: true, single_question_only: true } },
    prompt: { total_chars: system.length, sections, system_prompt: system, user_prompt: text },
    memory: { mem_used: false, tree_hole_recalled: false, memory_var_count: 0, recall_event_limit: 0, degraded: false, safety_mode: false },
    generation: reply ? { model, total_ms: genMs, assistant_text: reply, first_token_ms: 120, input_tokens: system.length, output_tokens: reply.length, total_tokens: system.length + reply.length, cached_tokens: 0, web_search_used: false, guard_replaced_count: 0 } : undefined,
    override_active: override != null,
  }
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}) } catch { resolve({}) }
    })
  })
}

function send(res, body) {
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export const server = createServer(async (req, res) => {
  // 观测台从浏览器直连后端，必须放行跨域
  res.setHeader('access-control-allow-origin', req.headers.origin ?? '*')
  res.setHeader('access-control-allow-headers', '*')
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.writeHead(204).end()

  const L = langOf(req)
  const T = TEXT[L]
  const path = new URL(req.url ?? '/', 'http://localhost').pathname
  const body = req.method === 'POST' ? await readBody(req) : {}

  if (path.startsWith('/debug/') && path !== '/debug/prompt-preview') {
    if (req.headers['x-debug-key'] !== DEBUG_KEY) return send(res, fail(403, T.badKey))
  }

  if (path === '/debug/token') {
    const roleId = body.ta_gender === 1 ? 1 : 2
    const uid = nextUid++
    const token = `mock-${roleId}-${uid}`
    sessions.set(token, { uid, roleId, stage: 0 })
    return send(res, ok({ tokens: [{ token, uid, user_code: `U${uid}`, memory_id: uid, expires_at: Date.now() + 86_400_000 }] }))
  }
  if (path === '/debug/roles') return send(res, ok({ roles: rolesFor(L) }))
  if (path === '/debug/models') return send(res, ok({ models: MODELS, default: DEFAULT_MODEL }))
  if (path === '/debug/preset') {
    for (const s of sessions.values()) if (s.uid === body.uid) s.stage = Number(body.stage ?? s.stage)
    return send(res, ok({ applied: true }))
  }
  if (path === '/debug/prompt-override') {
    const at = new Date().toISOString()
    if (body.action === 'history') return send(res, ok({ history: history.slice(0, body.limit ?? 50) }))
    if (body.action === 'set') {
      override = { ...override, ...body.sections }
      history.unshift({ at, action: 'set', operator: body.operator, sections: body.sections, ttl_seconds: body.ttl_seconds })
    }
    if (body.action === 'clear') {
      override = null
      history.unshift({ at, action: 'clear', operator: body.operator })
    }
    const touched = Object.keys(override ?? {}).some((k) => SAFETY.includes(k))
    return send(res, ok({ override_active: override != null, safety_touched: touched, overridable_sections: OVERRIDABLE, override: override ? { sections: override } : null }))
  }

  const sess = sessions.get(req.headers.authorization ?? '')
  if (path === '/debug/prompt-preview') {
    if (!sess) return send(res, fail(401, T.badToken))
    const roles = rolesFor(L)
    const role = roles.find((r) => r.id === sess.roleId) ?? roles[0]
    const sections = baseSections(L, role, body.input ?? '')
    return send(res, ok({ sections, total_chars: sections.reduce((n, s) => n + s.chars, 0) }))
  }
  if (path === '/chat') {
    if (!sess) return send(res, fail(401, T.badToken))
    // 没传 model 用默认模型；传了不认识的模型按业务错误返回 JSON 信封
    const model = typeof body.model === 'string' && body.model ? body.model : DEFAULT_MODEL
    if (!MODELS.some((m) => m.id === model)) return send(res, fail(400, T.badModel(model)))
    const text = String(body.content ?? '')
    const reply = T.reply(text, model)
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
    const frame = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`)
    const sessionId = `s_${sess.uid}`
    frame({ code: 200, data: { status: 'pipeline_trace', session_id: sessionId, ts: Date.now(), trace: buildTrace(L, sess, text, '', model) } })
    for (const ch of reply.match(/.{1,6}/gsu) ?? []) {
      await sleep(40)
      frame({ code: 200, data: { text: ch } })
    }
    frame({ code: 200, data: { status: 'pipeline_trace_final', session_id: sessionId, message_id: Date.now(), ts: Date.now(), trace: buildTrace(L, sess, text, reply, model) } })
    frame({ code: 200, type: 'done', data: {} })
    return res.end()
  }

  res.writeHead(404, { 'content-type': 'application/json' })
  res.end(JSON.stringify(fail(404, `unknown path ${path}`)))
})

export function start(port = PORT) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      console.log(`[mock-backend] http://localhost:${port}  X-Debug-Key: ${DEBUG_KEY}`)
      resolve(server)
    })
  })
}

// 直接运行（pnpm mock）时启动；被 scripts/demo.mjs 引入时由它调用 start()
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  start().catch((e) => {
    console.error(`[mock-backend] failed to start on port ${PORT}: ${e.message}`)
    process.exit(1)
  })
}
