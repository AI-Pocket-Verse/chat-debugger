/** 后端 SSE 信封:外层 {code,msg,type?,data} —— type 用于标记 done/error,data 是内层负载 */
export interface SseEnvelope { code?: number; msg?: string; type?: string; data?: any }

/** 解析 `data: {...}\n\n` 帧;返回完整信封数组 + 尾部残片(拼到下一 chunk 前)。
 *  保留整条信封(不丢外层 type/code),done/error 由外层 type 判定。 */
export function splitSseEvents(buffer: string): { events: SseEnvelope[]; rest: string } {
  const events: SseEnvelope[] = []
  let buf = buffer.replace(/\r/g, '')
  let idx: number
  while ((idx = buf.indexOf('\n\n')) !== -1) {
    const block = buf.slice(0, idx)
    buf = buf.slice(idx + 2)
    for (const line of block.split('\n')) {
      const t = line.trimStart()
      if (!t.startsWith('data:')) continue
      const payload = t.slice(5).trim()
      if (!payload) continue
      try {
        events.push(JSON.parse(payload) as SseEnvelope)
      } catch {
        /* skip malformed */
      }
    }
  }
  return { events, rest: buf }
}
