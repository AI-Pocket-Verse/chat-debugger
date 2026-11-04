import { describe, it, expect } from 'vitest'
import { classifyFrame, parseExtraHeaders } from './backendClient'

describe('classifyFrame', () => {
  it('trace 帧:内层 data.status 命中 → kind=trace', () => {
    const f = classifyFrame({ code: 200, data: { status: 'pipeline_trace_final', trace: { req_id: 'r' } } })
    expect(f.kind).toBe('trace')
    if (f.kind === 'trace') expect((f.trace as any).status).toBe('pipeline_trace_final')
  })
  it('正文帧:内层 data.text → kind=delta', () => {
    const f = classifyFrame({ code: 200, data: { text: '你好' } })
    expect(f).toEqual({ kind: 'delta', text: '你好' })
  })
  it('结束帧:外层 type=done + code 200 → kind=done 无 error', () => {
    const f = classifyFrame({ code: 200, type: 'done' })
    expect(f).toEqual({ kind: 'done' })
  })
  it('错误帧:type=done + code!=200 → kind=done 带 error', () => {
    const f = classifyFrame({ code: 500, type: 'done', msg: 'boom' })
    expect(f.kind).toBe('done')
    if (f.kind === 'done') expect(f.error).toBe('boom')
  })
  it('processing/未知帧 → kind=other', () => {
    expect(classifyFrame({ code: 200, data: { stage: 'thinking' } })).toEqual({ kind: 'other' })
  })
  it('done 优先于内层文本(避免把结束帧当正文)', () => {
    const f = classifyFrame({ code: 200, type: 'done', data: { text: '' } })
    expect(f.kind).toBe('done')
  })
})

describe('parseExtraHeaders', () => {
  it('treats blank input as no headers', () => {
    expect(parseExtraHeaders('  ')).toEqual({})
  })
  it('accepts an object of string values', () => {
    expect(parseExtraHeaders('{"app_version": "9.9.9", "platform": "web"}')).toEqual({ app_version: '9.9.9', platform: 'web' })
  })
  it('returns an Error for invalid JSON, arrays and non-string values', () => {
    expect(parseExtraHeaders('{bad')).toBeInstanceOf(Error)
    expect(parseExtraHeaders('["a"]')).toBeInstanceOf(Error)
    expect(parseExtraHeaders('{"n": 1}')).toBeInstanceOf(Error)
  })
})
