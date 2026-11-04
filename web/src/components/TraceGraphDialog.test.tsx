import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TraceGraphDialog from './TraceGraphDialog'
import { sampleTrace } from '../test/fixtures'

describe('TraceGraphDialog', () => {
  it('renders 6 layers and hit counts', () => {
    render(<TraceGraphDialog open onOpenChange={() => {}} trace={sampleTrace()} firstTokenMs={420} />)
    for (const name of ['输入层', '前置安全 + PersonaGuard', '状态识别', '关系与人格', '行为策略路由', '装配 / 记忆 / 生成']) {
      expect(screen.getByText(name)).toBeInTheDocument()
    }
    // 输入层与安全层各命中 1/2(用户输入✓图片✗ / 安全检查✓PersonaGuard✗)
    expect(screen.getAllByText('1/2 命中').length).toBeGreaterThanOrEqual(1)
    // 节点标题存在
    expect(screen.getByText('用户输入')).toBeInTheDocument()
    expect(screen.getByText('图片输入')).toBeInTheDocument()
    // 生成段元信息
    expect(screen.getByText('420')).toBeInTheDocument()
  })
})
