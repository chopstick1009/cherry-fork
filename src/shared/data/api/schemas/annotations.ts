/** Data API schemas for persistent chat-message annotations. */

import * as z from 'zod'

import {
  ANNOTATION_CONTENT_MAX_LENGTH,
  ANNOTATION_CONTEXT_MAX_LENGTH,
  ANNOTATION_EXACT_MAX_LENGTH,
  type Annotation,
  AnnotationIdSchema,
  AnnotationKindSchema,
  AnnotationSchema
} from '../../types/annotation'
import { ContentMessageRoleSchema, MessageIdSchema } from '../../types/message'
import { TopicIdSchema } from '../../types/topic'

const AnchorFieldsSchema = z.strictObject({
  messageId: MessageIdSchema,
  role: ContentMessageRoleSchema,
  partId: z.string().min(1).max(255),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  exact: z.string().min(1).max(ANNOTATION_EXACT_MAX_LENGTH),
  prefix: z.string().max(ANNOTATION_CONTEXT_MAX_LENGTH),
  suffix: z.string().max(ANNOTATION_CONTEXT_MAX_LENGTH)
})

export const CreateAnnotationSchema = z
  .strictObject({
    ...AnchorFieldsSchema.shape,
    kind: AnnotationKindSchema,
    content: z.string().max(ANNOTATION_CONTENT_MAX_LENGTH).nullable().optional()
  })
  .superRefine((value, context) => {
    if (value.end <= value.start) {
      context.addIssue({ code: 'custom', path: ['end'], message: 'end must be greater than start' })
    }
    if (value.end - value.start !== value.exact.length) {
      context.addIssue({ code: 'custom', path: ['exact'], message: 'exact length must match the anchor range' })
    }
    if (value.kind !== 'underline' && !value.content?.trim()) {
      context.addIssue({ code: 'custom', path: ['content'], message: 'content is required for this annotation type' })
    }
  })
export type CreateAnnotationDto = z.infer<typeof CreateAnnotationSchema>

export const UpdateAnnotationSchema = z
  .strictObject({
    content: z.string().max(ANNOTATION_CONTENT_MAX_LENGTH).nullable().optional()
  })
  .refine((value) => value.content !== undefined, {
    path: ['content'],
    message: 'content is required'
  })
export type UpdateAnnotationDto = z.infer<typeof UpdateAnnotationSchema>

export type AnnotationSchemas = {
  '/topics/:topicId/annotations': {
    GET: {
      params: { topicId: string }
      response: Annotation[]
    }
    POST: {
      params: { topicId: string }
      body: CreateAnnotationDto
      response: Annotation
    }
  }

  '/annotations/:id': {
    GET: {
      params: { id: string }
      response: Annotation
    }
    PATCH: {
      params: { id: string }
      body: UpdateAnnotationDto
      response: Annotation
    }
    DELETE: {
      params: { id: string }
      response: void
    }
  }
}

export { AnnotationIdSchema, AnnotationSchema, TopicIdSchema }
