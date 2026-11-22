import { describe, expect, it } from 'vitest'

import type { Annotation } from '@shared/data/types/annotation'

import { formatFollowupImport, getLatestAssistantFollowups } from '../annotationFollowups'

const annotation = (id: string, messageId: string, kind: Annotation['kind'] = 'followup'): Annotation => ({
  id,
  topicId: 'topic-1',
  messageId,
  role: 'assistant',
  partId: 'part-1',
  kind,
  start: 0,
  end: 4,
  exact: 'quote',
  prefix: '',
  suffix: '',
  content: `Question ${id}`,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
})

describe('annotationFollowups', () => {
  it('returns every follow-up for only the latest assistant reply', () => {
    const annotations = [
      annotation('old', 'message-1'),
      annotation('thought', 'message-2', 'thought'),
      annotation('a', 'message-2'),
      annotation('b', 'message-2')
    ]

    expect(getLatestAssistantFollowups(annotations, 'message-2').map(({ id }) => id)).toEqual(['a', 'b'])
    expect(getLatestAssistantFollowups(annotations, null)).toEqual([])
  })

  it('formats a follow-up with its source locator, selected text, and question', () => {
    const quote = formatFollowupImport(annotation('a', 'message-2'), { turn: 3, messageSeq: 7 })

    expect(quote.label).toBe('quote')
    expect(quote.description).toContain('角色=assistant')
    expect(quote.description).toContain('轮次=3')
    expect(quote.description).toContain('消息序号=7')
    expect(quote.description).toContain('消息ID=message-2')
    expect(quote.description).toContain('选区位置=[0,4)')
    expect(quote.description).toContain('Question a')
    expect(quote.promptText.startsWith('<blockquote>')).toBe(true)
    expect(quote.promptText).toContain('quote')
    expect(quote.promptText).toContain('Question a')
  })
})
