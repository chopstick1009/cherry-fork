import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import type { AnnotationKind } from '@shared/data/types/annotation'
import { AnnotationKindSchema } from '@shared/data/types/annotation'
import type { ContentMessageRole } from '@shared/data/types/message'

import { createUpdateTimestamps, uuidPrimaryKey } from './_columnHelpers'
import { messageTable } from './message'
import { topicTable } from './topic'

/**
 * Text annotations are owned by a topic and point at one content message.
 * Both foreign keys cascade because an annotation without its message anchor
 * cannot be rendered or meaningfully relocated.
 */
export const annotationTable = sqliteTable(
  'annotation',
  {
    id: uuidPrimaryKey(),
    topicId: text('topic_id')
      .notNull()
      .references(() => topicTable.id, { onDelete: 'cascade' }),
    messageId: text('message_id')
      .notNull()
      .references(() => messageTable.id, { onDelete: 'cascade' }),
    role: text().$type<ContentMessageRole>().notNull(),
    partId: text('part_id').notNull(),
    kind: text().$type<AnnotationKind>().notNull(),
    start: integer().notNull(),
    end: integer().notNull(),
    exact: text().notNull(),
    prefix: text().notNull().default(''),
    suffix: text().notNull().default(''),
    content: text(),
    ...createUpdateTimestamps
  },
  (t) => [
    index('annotation_topic_id_created_at_idx').on(t.topicId, t.createdAt),
    index('annotation_message_id_idx').on(t.messageId),
    check('annotation_kind_check', sql`${t.kind} IN ('underline', 'thought', 'followup')`),
    check('annotation_role_check', sql`${t.role} IN ('user', 'assistant', 'system')`),
    check('annotation_range_check', sql`${t.start} >= 0 AND ${t.end} > ${t.start}`)
  ]
)

export type AnnotationRow = typeof annotationTable.$inferSelect
export type InsertAnnotationRow = typeof annotationTable.$inferInsert

export { AnnotationKindSchema }
