import { create } from 'zustand'
import type { ChatPipelineTrace } from '../types/trace'
import * as chatDb from '../lib/chatDb'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  trace?: ChatPipelineTrace // AI 消息(以及同轮 user 消息)本轮链路(final 优先)
  noTrace?: boolean // 本轮回复结束仍没收到 trace(早返回等)
  earlyReturn?: string // 推断的早返回类型
  firstTokenMs?: number
  seq?: number // 写入序号(chatDb 分页游标);addMessage 时分配
  transient?: boolean // 仅内存、不落库(如"无 token"临时提示),刷新即消失
}

export const PAGE_SIZE = 20

// 聊天记录按角色分桶(key=String(roleId)),持久化在 IndexedDB(lib/chatDb,每条消息
// 一条记录、增量写入,不落服务器)。内存里的 byRole 只是「已加载窗口」= 每角色历史的
// 尾部若干页;更早的用 loadOlder 按 20 条一页向上翻。
interface ChatState {
  byRole: Record<string, ChatMessage[]>
  hasMore: Record<string, boolean> // 该角色在已加载窗口之前是否还有更早的历史
  hydrated: Record<string, boolean> // 该角色是否已从 IndexedDB 载入首页
  loadingOlder: boolean
  streaming: boolean
  hydrateRole: (roleId: number) => Promise<void>
  loadOlder: (roleId: number) => Promise<void>
  addMessage: (roleId: number, m: ChatMessage) => void
  appendDelta: (id: string, text: string) => void
  setTrace: (id: string, t: ChatPipelineTrace) => void
  patch: (id: string, p: Partial<ChatMessage>) => void
  setStreaming: (b: boolean) => void
  clear: (roleId: number) => void
}

// 稳定空数组:selector 里 `?? EMPTY_MESSAGES` 防止每次渲染新建引用触发重渲。
export const EMPTY_MESSAGES: ChatMessage[] = []
export const messagesOf = (s: Pick<ChatState, 'byRole'>, roleId: number): ChatMessage[] =>
  s.byRole[String(roleId)] ?? EMPTY_MESSAGES

/** 按 id 去重合并两组消息并按 seq 排序(hydrate 与本地新增可能并发,取并集防丢)。 */
export function mergeBySeq(a: ChatMessage[], b: ChatMessage[]): ChatMessage[] {
  const map = new Map<string, ChatMessage>()
  for (const m of [...a, ...b]) map.set(m.id, { ...map.get(m.id), ...m })
  return [...map.values()].sort((x, y) => (x.seq ?? 0) - (y.seq ?? 0))
}

// 消息 id 全局唯一(send.ts genId),按 id 的更新跨桶查找 —— 流式回包途中
// 切角色,增量仍写回发起时那个角色的桶,不会串。
const mapMsg = (byRole: Record<string, ChatMessage[]>, id: string, fn: (m: ChatMessage) => ChatMessage) =>
  Object.fromEntries(
    Object.entries(byRole).map(([k, list]) => [k, list.some((m) => m.id === id) ? list.map((m) => (m.id === id ? fn(m) : m)) : list]),
  )

// ── 增量落盘:流式期间每个 token 都会改 store,不能每次都写库 ──────────────
// 改动的消息 id 进 dirty 集,250ms 防抖合并成一次批量 put;流式结束(setStreaming(false))
// 立即冲刷。极端情况(冲刷前关页)最多丢最后 250ms 的增量,可接受(调试工具)。
const dirty = new Set<string>()
let flushTimer: ReturnType<typeof setTimeout> | null = null

function flushDirty() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
  if (dirty.size === 0) return
  const { byRole } = useChatStore.getState()
  const records: chatDb.ChatMsgRecord[] = []
  for (const [rid, list] of Object.entries(byRole)) {
    for (const m of list) {
      if (dirty.has(m.id) && m.seq != null && !m.transient) records.push({ ...m, roleId: Number(rid), seq: m.seq })
    }
  }
  dirty.clear()
  void chatDb.putMessages(records)
}

function markDirty(id: string) {
  dirty.add(id)
  if (!flushTimer) flushTimer = setTimeout(flushDirty, 250)
}

// hydrate 进行中的角色(防 StrictMode 双调用/快速切换重复读同一页)
const hydrating = new Map<string, Promise<void>>()

export const useChatStore = create<ChatState>()((set, get) => ({
  byRole: {},
  hasMore: {},
  hydrated: {},
  loadingOlder: false,
  streaming: false,

  // 首次进入某角色:从 IndexedDB 取最新一页,与内存已有消息
  // 并集合并(防与刚发出的新消息竞态互吞)。
  hydrateRole: async (roleId) => {
    const key = String(roleId)
    if (get().hydrated[key]) return
    let p = hydrating.get(key)
    if (!p) {
      p = (async () => {
        const { messages, hasMore } = await chatDb.loadPage(roleId, null, PAGE_SIZE)
        set((s) => ({
          byRole: { ...s.byRole, [key]: mergeBySeq(messages, s.byRole[key] ?? []) },
          hasMore: { ...s.hasMore, [key]: hasMore },
          hydrated: { ...s.hydrated, [key]: true },
        }))
      })().finally(() => hydrating.delete(key))
      hydrating.set(key, p)
    }
    return p
  },

  // 向上翻一页:以当前窗口最早一条的 seq 为游标,取更早的 PAGE_SIZE 条并入窗口头部。
  loadOlder: async (roleId) => {
    const key = String(roleId)
    if (get().loadingOlder) return
    const oldest = (get().byRole[key] ?? []).find((m) => m.seq != null)
    if (!oldest?.seq) return
    set({ loadingOlder: true })
    try {
      const { messages, hasMore } = await chatDb.loadPage(roleId, oldest.seq, PAGE_SIZE)
      set((s) => ({
        byRole: { ...s.byRole, [key]: mergeBySeq(messages, s.byRole[key] ?? []) },
        hasMore: { ...s.hasMore, [key]: hasMore },
      }))
    } finally {
      set({ loadingOlder: false })
    }
  },

  addMessage: (roleId, m) => {
    const msg = { ...m, seq: chatDb.nextSeq() }
    set((s) => ({ byRole: { ...s.byRole, [String(roleId)]: [...messagesOf(s, roleId), msg] } }))
    if (!msg.transient) void chatDb.putMessages([{ ...msg, roleId, seq: msg.seq }])
  },
  appendDelta: (id, text) => {
    set((s) => ({ byRole: mapMsg(s.byRole, id, (m) => ({ ...m, content: m.content + text })) }))
    markDirty(id)
  },
  setTrace: (id, t) => {
    set((s) => ({ byRole: mapMsg(s.byRole, id, (m) => ({ ...m, trace: t, noTrace: false })) }))
    markDirty(id)
  },
  patch: (id, p) => {
    set((s) => ({ byRole: mapMsg(s.byRole, id, (m) => ({ ...m, ...p })) }))
    markDirty(id)
  },
  setStreaming: (b) => {
    set({ streaming: b })
    if (!b) flushDirty() // 流式结束立即落盘,不等防抖
  },
  clear: (roleId) => {
    set((s) => {
      const byRole = { ...s.byRole }
      delete byRole[String(roleId)]
      return { byRole, hasMore: { ...s.hasMore, [String(roleId)]: false } }
    })
    void chatDb.deleteRole(roleId)
  },
}))
