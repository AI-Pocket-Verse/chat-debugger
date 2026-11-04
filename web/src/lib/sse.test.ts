import { describe, it, expect } from 'vitest'
import { splitSseEvents } from './sse'

describe('splitSseEvents', () => {
  it('保留完整信封(含内层 data),并留住尾部残片', () => {
    const buf = 'data: {"code":200,"data":{"status":"pipeline_trace"}}\n\ndata: {"code":200,"data":{"status":"do'
    const { events, rest } = splitSseEvents(buf)
    expect(events).toHaveLength(1)
    expect(events[0]?.data.status).toBe('pipeline_trace')
    expect(rest).toContain('"status":"do')
  })
  it('正文帧保留内层 text', () => {
    const { events } = splitSseEvents('data: {"code":200,"data":{"text":"你好"}}\n\n')
    expect(events[0]?.data.text).toBe('你好')
  })
  it('done 帧保留外层 type/code', () => {
    const { events } = splitSseEvents('data: {"code":200,"type":"done"}\r\n\r\n')
    expect(events[0]?.type).toBe('done')
    expect(events[0]?.code).toBe(200)
  })
  it('跳过非法 JSON 不抛错', () => {
    const { events } = splitSseEvents('data: not-json\n\n')
    expect(events).toHaveLength(0)
  })
})
