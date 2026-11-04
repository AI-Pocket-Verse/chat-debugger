import { splitSseEvents, type SseEnvelope } from './sse'
import { t } from '../i18n'
import type { TraceFrame, TracePromptSection } from '../types/trace'

/**
 * 被测对话后端的连接配置。接口约定见 docs/backend-protocol.md。
 * base 含路径前缀（如 https://example.com/companion），接口拼成 `${base}/debug/token` 等。
 * headers 是用户在「连接配置」里填的额外请求头（如后端要求的客户端版本头），每个请求都带上。
 */
export interface BackendConfig { base: string; debugKey: string; token?: string; headers?: Record<string, string> }
export interface DebugToken { token: string; uid: number; user_code: string; memory_id: number; expires_at: number }
export interface RoleInfo { id: number; name: string; [k: string]: unknown }

// ── 诊断日志 ──────────────────────────────────────────────────────────────
// 这是调试页:所有后端请求都在 console 打印完整上下文(请求 URL/头、响应
// 状态/耗时/content-type/server、原始 body、envelope),便于排查「初始化
// 失败 / 被拒 / 打不通」到底卡在哪一层。密钥/Token 脱敏。
const DBG = '%c[backend]'
const DBG_CSS = 'color:#3370ff;font-weight:bold'
const redact = (v?: string) => (!v ? '(empty)' : v.length <= 8 ? `${v[0]}***` : `${v.slice(0, 4)}…${v.slice(-2)}(${v.length})`)

/** 日志里把信封中的 token 字段脱敏(`/debug/token` 响应含会话 token),不改原对象。 */
export function redactTokens(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(redactTokens)
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, k === 'token' && typeof x === 'string' ? redact(x) : redactTokens(x)]))
  }
  return v
}

/** 去掉 base 末尾的斜杠，避免拼出 `//debug/token`。 */
const trimBase = (base: string) => base.replace(/\/+$/, '')

function debugHeaders(cfg: BackendConfig) {
  return { 'Content-Type': 'application/json', 'X-Debug-Key': cfg.debugKey, ...cfg.headers }
}

function sessionHeaders(cfg: BackendConfig) {
  return { 'Content-Type': 'application/json', Authorization: cfg.token ?? '', ...cfg.headers }
}

/**
 * 解析「额外请求头」输入框里的 JSON 文本。空白视为无；必须是值全为字符串的对象。
 * 返回 Error 而不是抛出，便于配置界面直接显示原因。
 */
export function parseExtraHeaders(text: string): Record<string, string> | Error {
  if (!text.trim()) return {}
  let v: unknown
  try {
    v = JSON.parse(text)
  } catch {
    return new Error(t('headers.invalidJson'))
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return new Error(t('headers.notObject'))
  for (const [k, val] of Object.entries(v)) {
    if (typeof val !== 'string') return new Error(t('headers.notString', { key: k }))
  }
  return v as Record<string, string>
}

/** fetch + 请求/响应日志。返回原始 Response(body 未读)。网络层 reject 会被
 *  单独识别(CORS / mixed-content / DNS / 连接被拒),抛出可读错误。 */
async function backendFetch(url: string, init: RequestInit, label: string): Promise<Response> {
  const method = init.method ?? 'GET'
  const h = { ...(init.headers as Record<string, string> | undefined) }
  const shown = { ...h }
  // 除 Content-Type 外的请求头值一律脱敏:X-Debug-Key / Authorization,以及用户填的「额外请求头」(可能是网关鉴权头)
  for (const k of Object.keys(shown)) if (k.toLowerCase() !== 'content-type') shown[k] = redact(shown[k])
  console.groupCollapsed(`${DBG} → ${method} ${url}  (${label})`, DBG_CSS)
  console.log('request headers:', shown)
  if (init.body) console.log('request body:', typeof init.body === 'string' ? init.body : init.body)
  const t0 = performance.now()
  let res: Response
  try {
    res = await fetch(url, init)
  } catch (e) {
    const ms = Math.round(performance.now() - t0)
    console.error(
      `${DBG} ✗ network error (${ms}ms):`,
      DBG_CSS,
      e,
      '\n  Common causes: (1) mixed content (https page calling an http backend) (2) CORS does not allow this origin ' +
        '(3) DNS failure / connection refused. Check this request in the Network panel.',
    )
    console.groupEnd()
    throw new Error(t('err.network', { label, err: String((e as Error)?.message ?? e) }))
  }
  const ms = Math.round(performance.now() - t0)
  console.log(`status: ${res.status} ${res.statusText}   ${ms}ms`)
  console.log('response headers:', {
    'content-type': res.headers.get('content-type'),
    server: res.headers.get('server'),
    via: res.headers.get('via'),
    'access-control-allow-origin': res.headers.get('access-control-allow-origin'),
  })
  console.groupEnd()
  return res
}

/** 统一信封 {code,msg,data}:校验 code===200 并返回内层 data。
 *  会先读原始文本,识别「HTML 兜底(反向代理没指到后端)」「非 JSON」「业务错误 code!=200」
 *  三类问题并打印,便于定位。 */
async function unwrap<T = any>(res: Response, label: string): Promise<T> {
  const ct = res.headers.get('content-type') ?? ''
  const raw = await res.text().catch(() => '')

  // ① HTML 兜底:说明请求没被反代到后端,而是被前端 SPA(index.html)接住了
  if (/^\s*<(!doctype|html)/i.test(raw) || ct.includes('text/html')) {
    console.error(
      `${DBG} ✗ ${label}: got HTML instead of backend JSON; the URL probably does not point at the backend (SPA fallback). HTTP ${res.status}. First 200 chars of body:\n`,
      DBG_CSS,
      raw.slice(0, 200),
    )
    throw new Error(t('err.html', { label, status: res.status }))
  }

  // ② 非 JSON
  let j: any = null
  if (raw) {
    try {
      j = JSON.parse(raw)
    } catch {
      console.error(`${DBG} ✗ ${label}: response is not valid JSON. HTTP ${res.status}. First 300 chars of body:\n`, DBG_CSS, raw.slice(0, 300))
      throw new Error(t('err.nonJson', { label, status: res.status }))
    }
  }
  console.log(`${DBG} ← ${label} envelope:`, DBG_CSS, redactTokens(j))

  if (j && typeof j === 'object' && 'code' in j) {
    // ③ 后端业务错误(如 forbidden = Debug Key 错;版本类拒绝可在「额外请求头」里补版本头)
    if (j.code !== 200) {
      console.error(`${DBG} ✗ ${label}: rejected by backend  code=${j.code}  msg=${JSON.stringify(j.msg)}  HTTP ${res.status}`, DBG_CSS)
      throw new Error(`${label}: ${j.msg || `code ${j.code}`}  (code=${j.code}, HTTP ${res.status})`)
    }
    return j.data as T
  }
  // 没有 envelope 但 HTTP 非 2xx
  if (!res.ok) throw new Error(`${label} HTTP ${res.status}`)
  return j as T
}

export async function getToken(cfg: BackendConfig, ta_gender = 2): Promise<DebugToken> {
  console.log(`${DBG} init session: base=%o  X-Debug-Key=%o`, DBG_CSS, cfg.base, redact(cfg.debugKey))
  const res = await backendFetch(`${trimBase(cfg.base)}/debug/token`, { method: 'POST', headers: debugHeaders(cfg), body: JSON.stringify({ ta_gender, count: 1 }) }, 'debug/token')
  const d = await unwrap<{ tokens: DebugToken[] }>(res, 'debug/token')
  if (!d?.tokens?.length) throw new Error(t('err.noToken'))
  return d.tokens[0]!
}

export async function getRoles(cfg: BackendConfig): Promise<RoleInfo[]> {
  const res = await backendFetch(`${trimBase(cfg.base)}/debug/roles`, { method: 'GET', headers: debugHeaders(cfg) }, 'debug/roles')
  const d = await unwrap<{ roles: RoleInfo[] }>(res, 'debug/roles')
  return d?.roles ?? []
}

export async function preset(cfg: BackendConfig, body: Record<string, unknown>): Promise<unknown> {
  const res = await backendFetch(`${trimBase(cfg.base)}/debug/preset`, { method: 'POST', headers: debugHeaders(cfg), body: JSON.stringify(body) }, 'debug/preset')
  return unwrap(res, 'debug/preset')
}

// 模型列表(可选接口):后端没实现时调用方退回手填模型 ID。
export interface ModelInfo { id: string; name?: string }
export interface ModelsResp { models: ModelInfo[]; default?: string }
export async function getModels(cfg: BackendConfig): Promise<ModelsResp> {
  const res = await backendFetch(`${trimBase(cfg.base)}/debug/models`, { method: 'GET', headers: debugHeaders(cfg) }, 'debug/models')
  const d = await unwrap<Partial<ModelsResp>>(res, 'debug/models')
  const models = Array.isArray(d?.models) ? d.models.filter((m): m is ModelInfo => !!m && typeof m.id === 'string' && m.id !== '') : []
  return { models, default: typeof d?.default === 'string' ? d.default : undefined }
}

export interface OverrideResp { override_active: boolean; safety_touched: boolean; overridable_sections: string[]; override: unknown }
export async function promptOverride(cfg: BackendConfig, body: { action: 'set' | 'clear' | 'get'; sections?: Record<string, string>; keys?: Record<string, string>; ttl_seconds?: number; operator?: string }): Promise<OverrideResp> {
  const res = await backendFetch(`${trimBase(cfg.base)}/debug/prompt-override`, { method: 'POST', headers: debugHeaders(cfg), body: JSON.stringify(body) }, 'debug/prompt-override')
  return unwrap<OverrideResp>(res, 'debug/prompt-override')
}

// 覆盖修改记录(全局共享,存在后端):每条含 修改人 operator + 时间 at + 本次覆盖内容。
export interface OverrideHistoryEntry { at: string; action: 'set' | 'clear'; operator?: string; sections?: Record<string, string>; keys?: Record<string, string>; ttl_seconds?: number }
export async function getPromptOverrideHistory(cfg: BackendConfig, limit = 50): Promise<OverrideHistoryEntry[]> {
  const res = await backendFetch(`${trimBase(cfg.base)}/debug/prompt-override`, { method: 'POST', headers: debugHeaders(cfg), body: JSON.stringify({ action: 'history', limit }) }, 'debug/prompt-override/history')
  const d = await unwrap<{ history: OverrideHistoryEntry[] }>(res, 'debug/prompt-override/history')
  return d?.history ?? []
}

// 预览「当前会话此刻拼装的 prompt」(无副作用):供左侧不发消息也能刷新 CurrentTime/记忆等实时段。
// 走 AuthChecker(用当前 token 定位会话),故带 Authorization;可选 input=最近一条用户消息,让记忆召回更贴近真实。
export interface PromptPreviewResp { sections: TracePromptSection[]; total_chars: number }
export async function getPromptPreview(cfg: BackendConfig, input?: string): Promise<PromptPreviewResp> {
  const res = await backendFetch(
    `${trimBase(cfg.base)}/debug/prompt-preview`,
    { method: 'POST', headers: sessionHeaders(cfg), body: JSON.stringify({ input: input ?? '' }) },
    'debug/prompt-preview',
  )
  const d = await unwrap<{ sections: TracePromptSection[]; total_chars: number }>(res, 'debug/prompt-preview')
  return { sections: d?.sections ?? [], total_chars: d?.total_chars ?? 0 }
}

/** 把一条 SSE 信封归类为语义帧(trace 用内层 data.status,
 *  正文用内层 data.text,结束/错误用外层 type==='done' + code)。纯函数,便于单测。 */
export type StreamFrame =
  | { kind: 'trace'; trace: TraceFrame }
  | { kind: 'delta'; text: string }
  | { kind: 'done'; error?: string }
  | { kind: 'other' }
export function classifyFrame(env: SseEnvelope): StreamFrame {
  const d = env.data as Record<string, any> | undefined
  const status = d?.status
  if (status === 'pipeline_trace' || status === 'pipeline_trace_final') return { kind: 'trace', trace: d as TraceFrame }
  if (env.type === 'done') {
    if (env.code != null && env.code !== 200) return { kind: 'done', error: (d?.message as string) ?? env.msg ?? `error ${env.code}` }
    return { kind: 'done' }
  }
  if (typeof d?.text === 'string' && d.text.length > 0) return { kind: 'delta', text: d.text }
  return { kind: 'other' }
}

export interface ChatCallbacks {
  onTraceFrame?: (f: TraceFrame) => void
  onDelta?: (text: string) => void
  onFirstToken?: (ms: number) => void
  onDone?: () => void
  onError?: (e: unknown) => void
}

export async function chat(
  cfg: BackendConfig,
  body: { role_id: number; content: string; content_type?: string; model?: string },
  cb: ChatCallbacks,
  signal?: AbortSignal,
  timeoutMs = 60_000,
): Promise<void> {
  const ac = new AbortController()
  const onExtAbort = () => ac.abort()
  if (signal) {
    if (signal.aborted) ac.abort()
    else signal.addEventListener('abort', onExtAbort)
  }
  let timedOut = false
  const to = setTimeout(() => { timedOut = true; ac.abort() }, timeoutMs)
  const startedAt = performance.now()
  let firstToken = false
  const url = `${trimBase(cfg.base)}/chat`
  try {
    console.groupCollapsed(`${DBG} → POST ${url}  (chat SSE)`, DBG_CSS)
    console.log('request:', { role_id: body.role_id, model: body.model, content: body.content, Authorization: redact(cfg.token) })
    console.groupEnd()
    const res = await fetch(url, {
      method: 'POST',
      signal: ac.signal,
      headers: sessionHeaders(cfg),
      body: JSON.stringify({ content_type: 'text', ...body, debug_trace: true }),
    }).catch((e) => {
      console.error(`${DBG} ✗ chat network error:`, DBG_CSS, e, '\n  Mixed content / CORS / unreachable URL? Check the Network panel.')
      throw e
    })
    console.log(`${DBG} ← chat status ${res.status} ${res.statusText}  content-type=${res.headers.get('content-type')}`, DBG_CSS)
    if (!res.ok || !res.body) {
      const raw = await res.text().catch(() => '')
      console.error(`${DBG} ✗ chat HTTP ${res.status}. First 400 chars of body:\n`, DBG_CSS, raw.slice(0, 400))
      throw new Error(`chat HTTP ${res.status}: ${raw.slice(0, 200) || res.statusText}`)
    }
    // 业务错误(token 失效、口令错等)按信封约定是 HTTP 200 + JSON,不是事件流:读出 msg 当错误,别当空流吞掉
    if ((res.headers.get('content-type') ?? '').includes('application/json')) {
      const raw = await res.text().catch(() => '')
      let j: any = null
      try { j = JSON.parse(raw) } catch { /* 非 JSON,走下面的通用提示 */ }
      const hint = j?.code === 401 ? t('err.reinitHint') : ''
      const msg = j && j.code != null && j.code !== 200
        ? `chat: ${j.msg || `code ${j.code}`} (code=${j.code})${hint}`
        : t('err.jsonNotStream')
      console.error(`${DBG} ✗ ${msg}`, DBG_CSS)
      cb.onError?.(new Error(msg))
      cb.onDone?.()
      return
    }
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const { events, rest } = splitSseEvents(buf)
      buf = rest
      for (const env of events) {
        const f = classifyFrame(env)
        if (f.kind === 'trace') { cb.onTraceFrame?.(f.trace); continue }
        if (f.kind === 'done') { if (f.error) cb.onError?.(new Error(f.error)); cb.onDone?.(); return }
        if (f.kind === 'delta') {
          if (!firstToken) { firstToken = true; cb.onFirstToken?.(Math.round(performance.now() - startedAt)) }
          cb.onDelta?.(f.text)
        }
      }
    }
    // 流结束却没收到结束帧:网络断开 / 代理切断 / 后端异常退出,回答可能是半截的,必须提示
    cb.onError?.(new Error(t('err.streamEnded')))
    cb.onDone?.()
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      // 超时要提示(回答可能是半截的);用户主动中止则静默收尾
      if (timedOut) cb.onError?.(new Error(t('err.timeout', { s: Math.round(timeoutMs / 1000) })))
      cb.onDone?.()
    } else cb.onError?.(e)
  } finally {
    clearTimeout(to)
    if (signal) signal.removeEventListener('abort', onExtAbort)
  }
}
