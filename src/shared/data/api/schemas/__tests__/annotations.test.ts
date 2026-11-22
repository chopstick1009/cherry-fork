import { describe, expect, it } from 'vitest'

import { CreateAnnotationSchema, UpdateAnnotationSchema } from '../annotations'

const anchor = {
  messageId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  role: 'assistant',
  partId: 'message-part-0',
  start: 1,
  end: 4,
  exact: '😀猫',
  prefix: '前',
  suffix: '后'
}

describe('annotation schemas', () => {
  it('accepts UTF-16 anchor lengths and content-free underlines', () => {
    expect(CreateAnnotationSchema.safeParse({ ...anchor, kind: 'underline' }).success).toBe(true)
    expect(CreateAnnotationSchema.safeParse({ ...anchor, kind: 'thought', content: 'Keep this' }).success).toBe(true)
  })

  it('rejects inconsistent anchors and blank thought or follow-up content', () => {
    expect(CreateAnnotationSchema.safeParse({ ...anchor, end: 3, kind: 'underline' }).success).toBe(false)
    expect(CreateAnnotationSchema.safeParse({ ...anchor, kind: 'thought', content: '  ' }).success).toBe(false)
    expect(CreateAnnotationSchema.safeParse({ ...anchor, kind: 'followup', content: '\n ' }).success).toBe(false)
  })

  it('requires the content field when updating', () => {
    expect(UpdateAnnotationSchema.safeParse({}).success).toBe(false)
    expect(UpdateAnnotationSchema.safeParse({ content: 'Revised' }).success).toBe(true)
  })
})
