import type { ChatMessage } from '../stores/chat'

// IndexedDB 持久层:每条消息一条记录,增量写入 + 按 [roleId, seq] 索引分页读取。
// 不用 localStorage:它有 5MB 配额上限,且每个流式 token 都要整库序列化重写。
// 所有 API 在无 indexedDB 的环境(vitest/jsdom)下安全降级为 no-op。

export interface ChatMsgRecord extends ChatMessage {
  roleId: number
  seq: number
}

const DB_NAME = 'chat-debugger'
const STORE = 'messages'
const IDX = 'role_seq'

const hasIDB = () => typeof indexedDB !== 'undefined'

// seq:单调递增写入序号(毫秒×1000 + 进程内自增),跨刷新仍保序;分页游标按它定位。
let seqCounter = Date.now() * 1000
export const nextSeq = (): number => ++seqCounter

// IDB 不可用(Safari 隐私模式/配额/损坏)时降级为「仅内存」:所有写静默丢弃、读返回空,
// 只告警一次,不向调用方抛错(store 的 fire-and-forget 调用因此无需逐处 .catch)。
let idbWarned = false
function warnIDB(e: unknown) {
  if (idbWarned) return
  idbWarned = true
  console.warn('[chatDb] IndexedDB is unavailable; chat history is kept in memory only and is lost on reload:', e)
}

let dbPromise: Promise<IDBDatabase> | null = null
function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex(IDX, ['roleId', 'seq'])
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    // 失败不毒化缓存:清掉 promise,下次调用可重试(如配额临时满后恢复)
    dbPromise.catch(() => { dbPromise = null })
  }
  return dbPromise
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

/** 批量写入/覆盖消息记录(按 id upsert)。失败静默降级(warnIDB),不抛错。 */
export async function putMessages(records: ChatMsgRecord[]): Promise<void> {
  if (!hasIDB() || records.length === 0) return
  try {
    const db = await openDb()
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    for (const r of records) store.put(r)
    await txDone(tx)
  } catch (e) {
    warnIDB(e)
  }
}

/** 取某角色 beforeSeq 之前(不含)的最近 limit 条,按 seq 升序返回;beforeSeq=null 表示取最新一页。 */
export async function loadPage(
  roleId: number,
  beforeSeq: number | null,
  limit: number,
): Promise<{ messages: ChatMsgRecord[]; hasMore: boolean }> {
  if (!hasIDB()) return { messages: [], hasMore: false }
  try {
    const db = await openDb()
    const tx = db.transaction(STORE, 'readonly')
    const idx = tx.objectStore(STORE).index(IDX)
    const range = IDBKeyRange.bound([roleId, -Infinity], [roleId, beforeSeq ?? Infinity], false, beforeSeq != null)
    const out: ChatMsgRecord[] = []
    let hasMore = false
    await new Promise<void>((resolve, reject) => {
      const cur = idx.openCursor(range, 'prev') // 从新到旧,多取 1 条探测 hasMore
      cur.onsuccess = () => {
        const c = cur.result
        if (!c) return resolve()
        if (out.length >= limit) {
          hasMore = true
          return resolve()
        }
        out.push(c.value as ChatMsgRecord)
        c.continue()
      }
      cur.onerror = () => reject(cur.error)
    })
    return { messages: out.reverse(), hasMore }
  } catch (e) {
    warnIDB(e)
    return { messages: [], hasMore: false } // 降级:当作无历史,纯内存继续可用
  }
}

/** 删除某角色的全部消息(换新测试号/清空历史)。失败静默降级,不抛错。 */
export async function deleteRole(roleId: number): Promise<void> {
  if (!hasIDB()) return
  try {
    const db = await openDb()
    const tx = db.transaction(STORE, 'readwrite')
    const idx = tx.objectStore(STORE).index(IDX)
    const range = IDBKeyRange.bound([roleId, -Infinity], [roleId, Infinity])
    await new Promise<void>((resolve, reject) => {
      const cur = idx.openCursor(range)
      cur.onsuccess = () => {
        const c = cur.result
        if (!c) return resolve()
        c.delete()
        c.continue()
      }
      cur.onerror = () => reject(cur.error)
    })
    await txDone(tx)
  } catch (e) {
    warnIDB(e)
  }
}
