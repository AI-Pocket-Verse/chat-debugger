import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getModels } from './backendClient'
import { send } from './send'
import { useChatStore } from '../stores/chat'
import { useConfigStore } from '../stores/config'

const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } })
const doneStream = () =>
  new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data: {"code":200,"type":"done"}\n\n')); c.close() } }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } })

beforeEach(() => {
  for (const m of ['log', 'groupCollapsed', 'groupEnd', 'error'] as const) vi.spyOn(console, m).mockImplementation(() => {})
  useChatStore.setState({ byRole: {}, hasMore: {}, hydrated: {}, loadingOlder: false, streaming: false })
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

/** 走真实的 send() → chat() 调用链,返回发给 /chat 的请求体 */
async function chatBodyWith(model: string): Promise<Record<string, unknown>> {
  useConfigStore.setState({ baseUrl: 'http://b.test', debugKey: 'k', model, roleId: 1, token: 't', uid: 1, sessions: { '1': { token: 't', uid: 1 } } })
  let body: Record<string, unknown> = {}
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => { body = JSON.parse(String(init.body)); return doneStream() })
  await send('hi')
  return body
}

describe('模型切换', () => {
  it('选了模型:/chat 请求体带 model', async () => {
    expect((await chatBodyWith('mock-pro')).model).toBe('mock-pro')
  })

  it('没选模型(后端默认):请求体不带 model 字段', async () => {
    expect(await chatBodyWith('')).not.toHaveProperty('model')
    expect(await chatBodyWith('   ')).not.toHaveProperty('model')
  })

  it('换后端地址时模型回到后端默认,只改 Debug Key 不动模型', () => {
    useConfigStore.setState({ baseUrl: 'http://a.test', debugKey: 'k', model: 'mock-pro' })
    useConfigStore.getState().set({ debugKey: 'k2' })
    expect(useConfigStore.getState().model).toBe('mock-pro')
    useConfigStore.getState().set({ baseUrl: 'http://b.test' })
    expect(useConfigStore.getState().model).toBe('')
  })
})

describe('getModels', () => {
  const cfg = { base: 'http://b.test/', debugKey: 'k' }

  it('解析列表与默认模型,丢掉没有 id 的条目', async () => {
    let url = ''
    vi.stubGlobal('fetch', async (u: string) => { url = u; return json({ code: 200, msg: 'ok', data: { models: [{ id: 'a', name: 'A' }, { name: 'x' }, { id: 'b' }], default: 'a' } }) })
    const r = await getModels(cfg)
    expect(url).toBe('http://b.test/debug/models')
    expect(r).toEqual({ models: [{ id: 'a', name: 'A' }, { id: 'b' }], default: 'a' })
  })

  it('后端没实现(业务码 404):抛错,由界面退回手填', async () => {
    vi.stubGlobal('fetch', async () => json({ code: 404, msg: 'unknown path /debug/models' }))
    await expect(getModels(cfg)).rejects.toThrow('unknown path')
  })
})
