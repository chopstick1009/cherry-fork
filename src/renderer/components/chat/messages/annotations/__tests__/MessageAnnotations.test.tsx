import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TextSelectionToolbar } from '../../../../TextSelectionToolbar'
import { MessageAnnotationsProvider } from '../MessageAnnotationsContext'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  invalidate: vi.fn()
}))

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@renderer/data/hooks/useDataApi', () => ({
  useQuery: () => ({ data: [], isLoading: false }),
  useMutation: (method: string) => ({
    trigger: method === 'POST' ? mocks.create : method === 'PATCH' ? mocks.update : mocks.remove,
    isLoading: false
  }),
  useInvalidateCache: () => mocks.invalidate
}))
vi.mock('@renderer/data/hooks/useDataChange', () => ({ useDataChange: vi.fn() }))

const topicId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const messageId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function renderAnnotations(children: React.ReactNode) {
  return render(
    <MessageAnnotationsProvider topicId={topicId}>
      <TextSelectionToolbar onCopy={vi.fn()} onQuote={vi.fn()} onSaveToNotes={vi.fn()} isSavingNote={false}>
        {children}
      </TextSelectionToolbar>
    </MessageAnnotationsProvider>
  )
}

async function selectText(startNode: Text, startOffset: number, endNode = startNode, endOffset = startNode.length) {
  fireEvent(startNode.parentElement!, new MouseEvent('pointerdown', { button: 0, bubbles: true }))
  const range = document.createRange()
  range.setStart(startNode, startOffset)
  range.setEnd(endNode, endOffset)
  window.getSelection()?.removeAllRanges()
  window.getSelection()?.addRange(range)
  fireEvent(document, new Event('selectionchange'))
  fireEvent(endNode.parentElement!, new MouseEvent('pointerup', { button: 0, bubbles: true }))
  await act(() => new Promise((resolve) => requestAnimationFrame(resolve)))
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.create.mockResolvedValue({ topicId })
  mocks.update.mockResolvedValue({ topicId })
  mocks.remove.mockResolvedValue(undefined)
  window.getSelection()?.removeAllRanges()
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(100, 100, 80, 20)
  })
})

describe('message annotations', () => {
  it('persists an underline directly from the selected message text', async () => {
    renderAnnotations(
      <article data-message-id={messageId} data-message-role="assistant">
        <p data-message-part-id={`${messageId}-part-0`}>Review this answer.</p>
      </article>
    )
    const text = screen.getByText('Review this answer.').firstChild as Text
    await selectText(text, 0, text, 6)
    await userEvent.setup().click(await screen.findByRole('button', { name: 'webview.annotation.underline' }))

    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith({
        params: { topicId },
        body: {
          messageId,
          role: 'assistant',
          partId: `${messageId}-part-0`,
          start: 0,
          end: 6,
          exact: 'Review',
          prefix: '',
          suffix: ' this answer.',
          kind: 'underline',
          content: null
        }
      })
    )
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('keeps follow-up text in the annotation editor and never routes it to chat', async () => {
    renderAnnotations(
      <article data-message-id={messageId} data-message-role="assistant">
        <p data-message-part-id={`${messageId}-part-0`}>Review this answer.</p>
      </article>
    )
    const text = screen.getByText('Review this answer.').firstChild as Text
    await selectText(text, 0, text, 6)
    const user = userEvent.setup()
    const followupButton = await screen.findByRole('button', { name: 'webview.annotation.followup' })
    expect(followupButton.querySelector('svg.lucide-messages-square')).toBeInTheDocument()
    await user.click(followupButton)
    const input = await screen.findByRole('textbox', { name: 'webview.annotation.followup_prompt' })
    expect(input).toHaveAttribute('placeholder', 'webview.annotation.followup_placeholder')
    const editor = screen.getByRole('dialog', { name: 'webview.annotation.followup' })
    expect(editor).toHaveStyle({ left: `${window.innerWidth / 2}px`, top: `${window.innerHeight / 2}px` })
    expect(editor).toHaveStyle({ width: '560px', height: '560px' })
    expect(editor.querySelector('.chat-annotation-editor-quote')).toHaveStyle({ flex: '0.5 1 0%' })
    expect(editor.querySelector('.chat-annotation-editor-input')).toHaveStyle({ flex: '0.5 1 0%' })
    expect(screen.queryByRole('button', { name: 'chat.message.quote' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'notes.save' })).not.toBeInTheDocument()
    const dragHandle = editor.querySelector('[data-annotation-editor-drag-handle]')!
    const initialPosition = editor.getAttribute('style')
    fireEvent(dragHandle, new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 140, clientY: 130 }))
    fireEvent(window, new MouseEvent('pointermove', { bubbles: true, clientX: 180, clientY: 160 }))
    fireEvent(window, new MouseEvent('pointerup', { bubbles: true, clientX: 180, clientY: 160 }))
    expect(editor.getAttribute('style')).not.toBe(initialPosition)
    await user.type(input, 'Why?')
    await user.click(screen.getByRole('button', { name: 'webview.annotation.save' }))

    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { topicId },
          body: expect.objectContaining({ kind: 'followup', content: 'Why?', exact: 'Review' })
        })
      )
    )
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.remove).not.toHaveBeenCalled()
  })

  it('closes from the header button without starting a drag', async () => {
    renderAnnotations(
      <article data-message-id={messageId} data-message-role="assistant">
        <p data-message-part-id={`${messageId}-part-0`}>Review this answer.</p>
      </article>
    )
    const text = screen.getByText('Review this answer.').firstChild as Text
    await selectText(text, 0, text, 6)
    await userEvent.setup().click(await screen.findByRole('button', { name: 'webview.annotation.thought' }))
    expect(await screen.findByRole('dialog', { name: 'webview.annotation.thought' })).toBeInTheDocument()

    await userEvent.setup().click(screen.getByRole('button', { name: 'webview.annotation.cancel' }))

    expect(screen.queryByRole('dialog', { name: 'webview.annotation.thought' })).not.toBeInTheDocument()
  })

  it('does not offer annotations for a selection spanning separate message parts', async () => {
    renderAnnotations(
      <article data-message-id={messageId} data-message-role="assistant">
        <p data-message-part-id={`${messageId}-part-0`}>First part</p>
        <p data-message-part-id={`${messageId}-part-1`}>Second part</p>
      </article>
    )
    const first = screen.getByText('First part').firstChild as Text
    const second = screen.getByText('Second part').firstChild as Text
    await selectText(first, 0, second, second.length)

    expect(screen.queryByRole('button', { name: 'webview.annotation.underline' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'webview.annotation.thought' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'webview.annotation.followup' })).not.toBeInTheDocument()
    expect(mocks.create).not.toHaveBeenCalled()
  })
})
