import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ScopedChatComposer } from '@/components/chat/ScopedChatComposer'

function renderComposer(multiline: boolean) {
  const onSend = vi.fn()
  render(
    <ScopedChatComposer
      value="Fyrsta lína"
      onChange={vi.fn()}
      onSend={onSend}
      disabled={false}
      placeholder="Skrifaðu"
      sendLabel="Senda"
      multiline={multiline}
    />,
  )
  return onSend
}

describe('ScopedChatComposer keyboard behavior', () => {
  it('can keep the draft editable while a context requirement disables only send', () => {
    render(
      <ScopedChatComposer
        value="Uppkast"
        onChange={vi.fn()}
        onSend={vi.fn()}
        disabled={false}
        sendDisabled
        placeholder="Skrifaðu"
        sendLabel="Senda"
      />,
    )
    expect(screen.getByRole('textbox')).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Senda' })).toBeDisabled()
  })

  it('keeps plain Enter available for paragraphs in multiline mode', () => {
    const onSend = renderComposer(true)
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('supports Ctrl/Cmd+Enter as an optional multiline send shortcut', () => {
    const onSend = renderComposer(true)
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', ctrlKey: true })
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it('retains Enter-to-send for the single-line composer', () => {
    const onSend = renderComposer(false)
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    expect(onSend).toHaveBeenCalledTimes(1)
  })
})
