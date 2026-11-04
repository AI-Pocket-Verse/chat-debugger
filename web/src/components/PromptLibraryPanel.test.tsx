import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import PromptLibraryPanel from './PromptLibraryPanel'
import { useConfigStore } from '../stores/config'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('PromptLibraryPanel', () => {
  it('还没填后端地址时不请求覆盖历史(生产构建首次打开)', async () => {
    useConfigStore.setState({ baseUrl: '', debugKey: '' })
    const fetchSpy = vi.fn(async () => new Response('{}'))
    vi.stubGlobal('fetch', fetchSpy)
    render(<PromptLibraryPanel />)
    await new Promise((r) => setTimeout(r, 0))
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
