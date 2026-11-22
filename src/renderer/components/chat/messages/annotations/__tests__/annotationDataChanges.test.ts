import { describe, expect, it } from 'vitest'

import type { DataApiDataChangeEffect } from '@shared/data/api/types'

import { affectsTopicAnnotations } from '../annotationDataChanges'

const topicId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const otherTopicId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

describe('annotation data change matching', () => {
  it('matches annotation changes only for the owning topic', () => {
    const effect: DataApiDataChangeEffect = {
      endpoint: '/topics/:topicId/annotations',
      kind: 'projection',
      routeParams: { topicId }
    }

    expect(affectsTopicAnnotations([effect], topicId)).toBe(true)
    expect(affectsTopicAnnotations([effect], otherTopicId)).toBe(false)
  })

  it('refreshes after message membership changes, but not content-only changes', () => {
    const membership: DataApiDataChangeEffect = {
      endpoint: '/topics/:topicId/messages',
      kind: 'membership',
      routeParams: { topicId },
      entityIds: ['message-1']
    }
    const projection: DataApiDataChangeEffect = {
      endpoint: '/topics/:topicId/messages',
      kind: 'projection',
      routeParams: { topicId },
      entityIds: ['message-1']
    }

    expect(affectsTopicAnnotations([membership], topicId)).toBe(true)
    expect(affectsTopicAnnotations([projection], topicId)).toBe(false)
    expect(affectsTopicAnnotations([membership], otherTopicId)).toBe(false)
  })

  it('matches topic deletion by route or entity id', () => {
    const byRoute: DataApiDataChangeEffect = {
      endpoint: '/topics/:id',
      routeParams: { id: topicId },
      entityIds: [topicId]
    }
    const byEntity: DataApiDataChangeEffect = {
      endpoint: '/topics/:id',
      entityIds: [topicId]
    }

    expect(affectsTopicAnnotations([byRoute], topicId)).toBe(true)
    expect(affectsTopicAnnotations([byEntity], topicId)).toBe(true)
    expect(affectsTopicAnnotations([byEntity], otherTopicId)).toBe(false)
  })
})
