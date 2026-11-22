import { setupTestDatabase } from '@test-helpers/db'
import { MockMainDbServiceUtils } from '@test-mocks/main/DbService'
import { v4 as uuid } from 'uuid'
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'

import { application } from '@application'
import { annotationTable } from '@data/db/schemas/annotation'
import { messageTable } from '@data/db/schemas/message'
import { topicTable } from '@data/db/schemas/topic'
import { DataApiError } from '@shared/data/api/errors'

const { notifyDataApiDataChangeMock } = vi.hoisted(() => ({ notifyDataApiDataChangeMock: vi.fn() }))
vi.mock('@data/dataApiDataChange', () => ({ notifyDataApiDataChange: notifyDataApiDataChangeMock }))
vi.mock('@application', async () => {
  const { mockApplicationFactory } = await import('@test-mocks/main/application')
  return mockApplicationFactory()
})

const { annotationService } = await import('../AnnotationService')

describe('AnnotationService', () => {
  const dbh = setupTestDatabase()

  beforeEach(() => {
    const withWriteTx = application.get('DbService').withWriteTx as Mock
    withWriteTx.mockImplementation((fn) => dbh.db.transaction(fn as never))
    MockMainDbServiceUtils.setDb(dbh.db)
    notifyDataApiDataChangeMock.mockClear()
  })

  async function seedConversation() {
    const topicId = uuid()
    const messageId = uuid()
    const rootId = uuid()
    await dbh.db.insert(topicTable).values({ id: topicId, orderKey: 'a0' })
    await dbh.db.insert(messageTable).values([
      { id: rootId, topicId, role: 'root', data: { parts: [] }, status: 'success' },
      {
        id: messageId,
        topicId,
        parentId: rootId,
        role: 'user',
        data: { parts: [{ type: 'text', text: 'Anchor text' }] },
        status: 'success'
      }
    ])
    return { topicId, messageId }
  }

  it('persists, lists, updates, and deletes annotations', async () => {
    const { topicId, messageId } = await seedConversation()
    const created = annotationService.create(topicId, {
      messageId,
      role: 'user',
      partId: 'part-1',
      kind: 'thought',
      start: 0,
      end: 6,
      exact: 'Anchor',
      prefix: '',
      suffix: ' text',
      content: '  Remember this  '
    })

    expect(created.content).toBe('Remember this')
    expect(annotationService.listByTopic(topicId)).toEqual([created])
    expect(annotationService.getById(created.id)).toEqual(created)
    expect(annotationService.update(created.id, { content: 'Updated thought' }).content).toBe('Updated thought')
    expect(notifyDataApiDataChangeMock).toHaveBeenCalledTimes(2)

    annotationService.delete(created.id)
    expect(annotationService.listByTopic(topicId)).toEqual([])
    expect(() => annotationService.getById(created.id)).toThrow(DataApiError)
    expect(notifyDataApiDataChangeMock).toHaveBeenCalledTimes(3)
  })

  it('rejects mismatched ownership and requires content for thought annotations', async () => {
    const first = await seedConversation()
    const second = await seedConversation()
    const anchor = {
      messageId: first.messageId,
      role: 'user' as const,
      partId: 'part-1',
      start: 0,
      end: 6,
      exact: 'Anchor',
      prefix: '',
      suffix: ' text',
      kind: 'underline' as const
    }

    expect(() => annotationService.create(second.topicId, anchor)).toThrow(DataApiError)
    expect(() => annotationService.create(first.topicId, { ...anchor, kind: 'thought', content: '   ' })).toThrow()
  })

  it('cascades annotation cleanup when its message is hard-deleted', async () => {
    const { topicId, messageId } = await seedConversation()
    const annotation = annotationService.create(topicId, {
      messageId,
      role: 'user',
      partId: 'part-1',
      kind: 'underline',
      start: 0,
      end: 6,
      exact: 'Anchor',
      prefix: '',
      suffix: ' text'
    })

    dbh.sqlite.prepare('DELETE FROM message WHERE id = ?').run(messageId)

    expect(dbh.db.select().from(annotationTable).all()).toEqual([])
    expect(() => annotationService.getById(annotation.id)).toThrow(DataApiError)
  })
})
