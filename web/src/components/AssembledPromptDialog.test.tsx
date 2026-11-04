import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AssembledPromptDialog from './AssembledPromptDialog'
import { sampleTrace } from '../test/fixtures'

describe('AssembledPromptDialog', () => {
  it('renders sections and switches to full view', async () => {
    render(<AssembledPromptDialog open onOpenChange={() => {}} trace={sampleTrace()} />)
    expect(screen.getByText('Role')).toBeInTheDocument()
    expect(screen.getByText('EmotionStrategy')).toBeInTheDocument()
    expect(screen.getByText('SafetyConstraints')).toBeInTheDocument()
    expect(screen.getByText('已覆盖')).toBeInTheDocument()
    // 切全文视图 → 出现 system_prompt 全文标记
    await userEvent.click(screen.getByText('全文视图'))
    expect(screen.getByText(/# Role/)).toBeInTheDocument()
  })
})
