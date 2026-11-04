import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { en } from './en'
import { zh } from './zh'
import { detectLang, translate, useLangStore } from '.'
import TraceGraphDialog from '../components/TraceGraphDialog'
import { sampleTrace } from '../test/fixtures'

const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

afterEach(() => useLangStore.setState({ pref: 'zh' }))

describe('i18n 词典', () => {
  it('中英文每条文案都非空,占位符一致', () => {
    for (const k of Object.keys(zh) as (keyof typeof zh)[]) {
      expect(en[k], k).toBeTruthy()
      expect(vars(en[k]), k).toEqual(vars(zh[k]))
    }
  })

  it('替换占位符,未提供的变量原样保留', () => {
    expect(translate('en', 'trace.hits', { hits: 1, total: 2 })).toBe('1/2 hit')
    expect(translate('zh', 'trace.hits', { hits: 1 })).toBe('1/{total} 命中')
  })

  it('浏览器首选中文 → zh,其余 → en', () => {
    const nav = (langs: string[]) => Object.defineProperty(navigator, 'languages', { value: langs, configurable: true })
    nav(['zh-TW', 'en'])
    expect(detectLang()).toBe('zh')
    nav(['en-US', 'zh-CN'])
    expect(detectLang()).toBe('en')
  })

  it('切到英文后界面文案随之切换', () => {
    useLangStore.setState({ pref: 'en' })
    render(<TraceGraphDialog open onOpenChange={() => {}} trace={sampleTrace()} />)
    expect(screen.getByText('Pipeline trace')).toBeInTheDocument()
    expect(screen.getByText('User input')).toBeInTheDocument()
  })
})
