import type { DataApiDataChangeEffect } from '@shared/data/api/types'

export function affectsTopicAnnotations(effects: DataApiDataChangeEffect[], topicId: string): boolean {
  return effects.some((effect) => {
    switch (effect.endpoint) {
      case '/topics/:topicId/annotations':
        return !effect.routeParams || effect.routeParams.topicId === topicId
      case '/topics/:topicId/messages':
        return effect.kind === 'membership' && (!effect.routeParams || effect.routeParams.topicId === topicId)
      case '/topics/:id':
        return effect.routeParams
          ? effect.routeParams.id === topicId
          : !effect.entityIds || effect.entityIds.includes(topicId)
      default:
        return false
    }
  })
}
