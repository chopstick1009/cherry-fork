/**
 * Persistent annotations attached to rendered text in a chat message.
 *
 * The anchor coordinates are UTF-16 offsets in the visible text projection of
 * one message part. `exact`, `prefix`, and `suffix` let the renderer relocate
 * an annotation after markdown or streaming DOM has been rebuilt.
 */

import * as z from 'zod'

import { ContentMessageRoleSchema, MessageIdSchema } from './message'
import { TopicIdSchema } from './topic'

export const AnnotationIdSchema = z.uuidv4()
export const AnnotationKindSchema = z.enum(['underline', 'thought', 'followup'])
export type AnnotationKind = z.infer<typeof AnnotationKindSchema>

export const ANNOTATION_EXACT_MAX_LENGTH = 100_000
export const ANNOTATION_CONTEXT_MAX_LENGTH = 256
export const ANNOTATION_CONTENT_MAX_LENGTH = 100_000

export const AnnotationSchema = z.strictObject({
  id: AnnotationIdSchema,
  topicId: TopicIdSchema,
  messageId: MessageIdSchema,
  role: ContentMessageRoleSchema,
  partId: z.string().min(1).max(255),
  kind: AnnotationKindSchema,
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  exact: z.string().min(1).max(ANNOTATION_EXACT_MAX_LENGTH),
  prefix: z.string().max(ANNOTATION_CONTEXT_MAX_LENGTH),
  suffix: z.string().max(ANNOTATION_CONTEXT_MAX_LENGTH),
  content: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
})
export type Annotation = z.infer<typeof AnnotationSchema>
