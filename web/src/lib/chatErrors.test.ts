import { afterEach, describe, expect, it, vi } from 'vitest'
import { chat, getToken, redactTokens } from './backendClient'
import { send } from './send'
import { useChatStore, messagesOf } from '../stores/chat'
import { useConfigStore } from '../stores/config'

const cfg = { base: 'http://b.test', debugKey: 'k', token: 'tok' }
const sse = (chunks: string[]) =>
  new Response(new ReadableStream({ start(c) { const e = new TextEncoder(); chunks.forEach((x) => c.enqueue(e.encode(x))); c.close() } }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } })
const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } })

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

function run(res: Response | (() => Promise<Response>), timeoutMs?: number) {
  vi.stubGlobal('fetch', typeof res === 'function' ? res : async () => res)
  const errs: string[] = []
  let done = 0
  return chat(cfg, { role_id: 1, content: 'hi' }, { onError: (e) => errs.push((e as Error).message), onDone: () => done++ }, undefined, timeoutMs)
    .then(() => ({ errs, done }))
}

describe('chat() 错误路径', () => {
  it('HTTP 200 + JSON 业务错误(token 失效):onError 带 msg 与重新初始化提示', async () => {
    const { errs, done } = await run(json({ code: 401, msg: 'token 无效' }))
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('token 无效')
    expect(errs[0]).toContain('重新初始化')
    expect(done).toBe(1)
  })

  it('流结束但没有结束帧:提示回答可能不完整', async () => {
    const { errs } = await run(sse(['data: {"code":200,"data":{"text":"半截"}}\n\n']))
    expect(errs[0]).toContain('提前结束')
  })

  it('超时(fetch 响应 abort):onError 含「超过 N 秒」', async () => {
    vi.stubGlobal('fetch', (_u: string, init: RequestInit) => new Promise((_r, rej) => {
      init.signal!.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    }))
    const errs: string[] = []
    await chat(cfg, { role_id: 1, content: 'hi' }, { onError: (e) => errs.push((e as Error).message) }, undefined, 20)
    expect(errs[0]).toMatch(/超过 \d+ 秒/)
  })
})

describe('日志脱敏', () => {
  it('redactTokens 脱敏信封里的 token', () => {
    const out = JSON.stringify(redactTokens({ code: 200, data: { tokens: [{ token: 'SECRET-TOKEN-ABCDEFGHIJ', uid: 1 }] } }))
    expect(out).not.toContain('SECRET-TOKEN-ABCDEFGHIJ')
  })

  it('getToken 的真实调用链:console 里不出现会话 token 与额外请求头的值', async () => {
    vi.stubGlobal('fetch', async () => json({ code: 200, data: { tokens: [{ token: 'SECRET-TOKEN-ABCDEFGHIJ', uid: 1 }] } }))
    const logs: unknown[][] = []
    for (const m of ['log', 'groupCollapsed', 'error'] as const) vi.spyOn(console, m).mockImplementation((...a) => { logs.push(a) })
    const t = await getToken({ base: 'http://b.test', debugKey: 'DEBUGKEY-123456', headers: { 'X-Api-Token': 'GATEWAY-SECRET' } })
    expect(t.token).toBe('SECRET-TOKEN-ABCDEFGHIJ')
    const text = JSON.stringify(logs)
    expect(text).not.toContain('SECRET-TOKEN-ABCDEFGHIJ')
    expect(text).not.toContain('GATEWAY-SECRET')
    expect(text).not.toContain('DEBUGKEY-123456')
  })
})

describe('send() 早返回(无 trace)', () => {
  it('快速结束且没有 trace 的回复立刻被标成 noTrace,不依赖 5 秒定时器', async () => {
    useChatStore.setState({ byRole: {}, hasMore: {}, hydrated: {}, loadingOlder: false, streaming: false })
    useConfigStore.setState({ baseUrl: 'http://b.test', debugKey: 'k', roleId: 1, token: 't', uid: 1, sessions: { '1': { token: 't', uid: 1 } } })
    vi.stubGlobal('fetch', async () => sse(['data: {"code":200,"data":{"text":"你是指哪方面呢"}}\n\n', 'data: {"code":200,"type":"done"}\n\n']))
    await send('hello')
    const ai = messagesOf(useChatStore.getState(), 1).find((m) => m.role === 'assistant')!
    expect(ai.noTrace).toBe(true)
    expect(ai.earlyReturn).toContain('clarify_sent')
  })
})

describe('切换后端地址', () => {
  it('改 baseUrl / debugKey 会清掉已缓存的会话 token', () => {
    useConfigStore.setState({ baseUrl: 'http://a.test', debugKey: 'k', roleId: 1, token: 'ta', uid: 1, sessions: { '1': { token: 'ta', uid: 1 } } })
    useConfigStore.getState().set({ baseUrl: 'http://b.test' })
    const s = useConfigStore.getState()
    expect(s.sessions).toEqual({})
    expect(s.token).toBe('')
    // 同值不清
    useConfigStore.getState().setSession(1, { token: 'tb', uid: 2 })
    useConfigStore.getState().set({ baseUrl: 'http://b.test' })
    expect(useConfigStore.getState().sessions['1']?.token).toBe('tb')
  })
})
