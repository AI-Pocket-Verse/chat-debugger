import { describe, it, expect, beforeEach } from 'vitest'
import { useChatStore, messagesOf, mergeBySeq, EMPTY_MESSAGES, type ChatMessage } from './chat'

const msg = (id: string, content = ''): ChatMessage => ({ id, role: 'assistant', content })

beforeEach(() => {
  useChatStore.setState({ byRole: {}, hasMore: {}, hydrated: {}, loadingOlder: false, streaming: false })
})

describe('chat store 按角色分桶', () => {
  it('不同角色的消息互不串扰,切桶即切历史', () => {
    const s = useChatStore.getState()
    s.addMessage(1, { ...msg('a1'), role: 'user', content: '问角色甲' })
    s.addMessage(2, { ...msg('b1'), role: 'user', content: '问角色乙' })
    const st = useChatStore.getState()
    expect(messagesOf(st, 1).map((m) => m.content)).toEqual(['问角色甲'])
    expect(messagesOf(st, 2).map((m) => m.content)).toEqual(['问角色乙'])
    expect(messagesOf(st, 3)).toBe(EMPTY_MESSAGES)
  })

  it('appendDelta/patch/setTrace 按消息 id 跨桶定位(流式中切角色不串桶)', () => {
    const s = useChatStore.getState()
    s.addMessage(1, msg('ai-1'))
    s.addMessage(2, msg('ai-2'))
    s.appendDelta('ai-1', '我是角色甲')
    s.appendDelta('ai-2', '我是角色乙')
    s.patch('ai-2', { firstTokenMs: 88 })
    const st = useChatStore.getState()
    expect(messagesOf(st, 1)[0]!.content).toBe('我是角色甲')
    expect(messagesOf(st, 2)[0]!.content).toBe('我是角色乙')
    expect(messagesOf(st, 2)[0]!.firstTokenMs).toBe(88)
    expect(messagesOf(st, 1)[0]!.firstTokenMs).toBeUndefined()
  })

  it('clear 只清指定角色的桶,其他角色历史保留', () => {
    const s = useChatStore.getState()
    s.addMessage(1, msg('a'))
    s.addMessage(2, msg('b'))
    s.clear(1)
    const st = useChatStore.getState()
    expect(messagesOf(st, 1)).toHaveLength(0)
    expect(messagesOf(st, 2)).toHaveLength(1)
  })

  it('addMessage 分配单调递增 seq(分页游标依据)', () => {
    const s = useChatStore.getState()
    s.addMessage(1, msg('m1'))
    s.addMessage(1, msg('m2'))
    const [a, b] = messagesOf(useChatStore.getState(), 1)
    expect(a!.seq).toBeTypeOf('number')
    expect(b!.seq!).toBeGreaterThan(a!.seq!)
  })

  it('transient 消息进内存桶(可见)但标记不落库', () => {
    const s = useChatStore.getState()
    s.addMessage(1, { ...msg('warn', '⚠ 提示'), transient: true })
    const m = messagesOf(useChatStore.getState(), 1)[0]!
    expect(m.content).toBe('⚠ 提示')
    expect(m.transient).toBe(true)
  })

  it('hydrateRole 幂等:并发/重复调用只置一次 hydrated,不重复覆盖内存消息', async () => {
    const s = useChatStore.getState()
    s.addMessage(7, msg('inmem', '先到的内存消息'))
    await Promise.all([s.hydrateRole(7), s.hydrateRole(7)]) // 并发双调用(模拟 StrictMode)
    await useChatStore.getState().hydrateRole(7) // 已 hydrated 后再调 = 无操作
    const st = useChatStore.getState()
    expect(st.hydrated['7']).toBe(true)
    expect(messagesOf(st, 7).map((m) => m.id)).toEqual(['inmem']) // merge 不丢在途消息
  })
})

describe('mergeBySeq(分页/hydrate 合并)', () => {
  it('按 id 去重、按 seq 升序;同 id 后者字段覆盖前者', () => {
    const older: ChatMessage[] = [
      { ...msg('x', '早'), seq: 1 },
      { ...msg('y', '中'), seq: 2 },
    ]
    const loaded: ChatMessage[] = [
      { ...msg('y', '中·库里带trace'), seq: 2, firstTokenMs: 9 },
      { ...msg('z', '新'), seq: 3 },
    ]
    const merged = mergeBySeq(older, loaded)
    expect(merged.map((m) => m.id)).toEqual(['x', 'y', 'z'])
    expect(merged[1]!.content).toBe('中·库里带trace')
    expect(merged[1]!.firstTokenMs).toBe(9)
  })

  it('向上翻页:更早一页并入窗口头部,顺序正确', () => {
    const window: ChatMessage[] = [{ ...msg('c'), seq: 30 }, { ...msg('d'), seq: 40 }]
    const olderPage: ChatMessage[] = [{ ...msg('a'), seq: 10 }, { ...msg('b'), seq: 20 }]
    expect(mergeBySeq(olderPage, window).map((m) => m.id)).toEqual(['a', 'b', 'c', 'd'])
  })
})
