import { annotationService } from '@data/services/AnnotationService'
import {
  AnnotationIdSchema,
  CreateAnnotationSchema,
  type AnnotationSchemas,
  TopicIdSchema,
  UpdateAnnotationSchema
} from '@shared/data/api/schemas/annotations'
import type { HandlersFor } from '@shared/data/api/types'

export const annotationHandlers: HandlersFor<AnnotationSchemas> = {
  '/topics/:topicId/annotations': {
    GET: async ({ params }) => annotationService.listByTopic(TopicIdSchema.parse(params.topicId)),
    POST: async ({ params, body }) => {
      const topicId = TopicIdSchema.parse(params.topicId)
      return annotationService.create(topicId, CreateAnnotationSchema.parse(body))
    }
  },

  '/annotations/:id': {
    GET: async ({ params }) => annotationService.getById(AnnotationIdSchema.parse(params.id)),
    PATCH: async ({ params, body }) =>
      annotationService.update(AnnotationIdSchema.parse(params.id), UpdateAnnotationSchema.parse(body)),
    DELETE: async ({ params }) => {
      annotationService.delete(AnnotationIdSchema.parse(params.id))
      return undefined
    }
  }
}
