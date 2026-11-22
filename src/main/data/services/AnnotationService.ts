import { and, asc, eq, isNull } from 'drizzle-orm'

import { application } from '@application'
import { notifyDataApiDataChange } from '@data/dataApiDataChange'
import { type AnnotationRow, annotationTable } from '@data/db/schemas/annotation'
import { messageTable } from '@data/db/schemas/message'
import { topicTable } from '@data/db/schemas/topic'
import { loggerService } from '@logger'
import { DataApiErrorFactory } from '@shared/data/api/errors'
import type { CreateAnnotationDto, UpdateAnnotationDto } from '@shared/data/api/schemas/annotations'
import type { Annotation } from '@shared/data/types/annotation'

import { timestampToISO } from './utils/rowMappers'

const logger = loggerService.withContext('DataApi:AnnotationService')

function rowToAnnotation(row: AnnotationRow): Annotation {
  return {
    id: row.id,
    topicId: row.topicId,
    messageId: row.messageId,
    role: row.role,
    partId: row.partId,
    kind: row.kind,
    start: row.start,
    end: row.end,
    exact: row.exact,
    prefix: row.prefix,
    suffix: row.suffix,
    content: row.content ?? null,
    createdAt: timestampToISO(row.createdAt),
    updatedAt: timestampToISO(row.updatedAt)
  }
}

function notifyAnnotationChange(annotation: Annotation, kind: 'membership' | 'projection'): void {
  notifyDataApiDataChange([
    {
      endpoint: '/topics/:topicId/annotations',
      kind,
      routeParams: { topicId: annotation.topicId },
      entityIds: [annotation.id]
    },
    {
      endpoint: '/annotations/:id',
      routeParams: { id: annotation.id }
    }
  ])
}

export class AnnotationService {
  private get dbService() {
    return application.get('DbService')
  }

  private get db() {
    return this.dbService.getDb()
  }

  private assertTopicAndMessageTx(
    tx: Pick<typeof this.db, 'select'>,
    topicId: string,
    messageId: string,
    role: string
  ): void {
    const [topic] = tx
      .select({ id: topicTable.id })
      .from(topicTable)
      .where(and(eq(topicTable.id, topicId), isNull(topicTable.deletedAt)))
      .limit(1)
      .all()
    if (!topic) throw DataApiErrorFactory.notFound('Topic', topicId)

    const [message] = tx
      .select({ id: messageTable.id, topicId: messageTable.topicId, role: messageTable.role })
      .from(messageTable)
      .where(and(eq(messageTable.id, messageId), isNull(messageTable.deletedAt)))
      .limit(1)
      .all()
    if (!message) throw DataApiErrorFactory.notFound('Message', messageId)
    if (message.topicId !== topicId) {
      throw DataApiErrorFactory.invalidOperation('attach annotation', 'message belongs to another topic')
    }
    if (message.role !== role) {
      throw DataApiErrorFactory.invalidOperation('attach annotation', 'message role does not match the anchor')
    }
  }

  listByTopic(topicId: string): Annotation[] {
    const [topic] = this.db
      .select({ id: topicTable.id })
      .from(topicTable)
      .where(and(eq(topicTable.id, topicId), isNull(topicTable.deletedAt)))
      .limit(1)
      .all()
    if (!topic) throw DataApiErrorFactory.notFound('Topic', topicId)

    return this.db
      .select({ annotation: annotationTable })
      .from(annotationTable)
      .where(eq(annotationTable.topicId, topicId))
      .orderBy(asc(annotationTable.createdAt), asc(annotationTable.id))
      .all()
      .map(({ annotation }) => rowToAnnotation(annotation))
  }

  getById(id: string): Annotation {
    const [result] = this.db
      .select({ annotation: annotationTable })
      .from(annotationTable)
      .innerJoin(topicTable, eq(annotationTable.topicId, topicTable.id))
      .where(and(eq(annotationTable.id, id), isNull(topicTable.deletedAt)))
      .limit(1)
      .all()
    if (!result) throw DataApiErrorFactory.notFound('Annotation', id)
    return rowToAnnotation(result.annotation)
  }

  create(topicId: string, dto: CreateAnnotationDto): Annotation {
    const annotation = this.dbService.withWriteTx((tx) => {
      this.assertTopicAndMessageTx(tx, topicId, dto.messageId, dto.role)
      const content = dto.kind === 'underline' ? null : dto.content?.trim() || null
      if (dto.kind !== 'underline' && !content) {
        throw DataApiErrorFactory.validation({ content: ['Content is required for this annotation type'] })
      }

      const [row] = tx
        .insert(annotationTable)
        .values({
          topicId,
          messageId: dto.messageId,
          role: dto.role,
          partId: dto.partId,
          kind: dto.kind,
          start: dto.start,
          end: dto.end,
          exact: dto.exact,
          prefix: dto.prefix,
          suffix: dto.suffix,
          content
        })
        .returning()
        .all()
      if (!row) throw DataApiErrorFactory.database(new Error('Insert did not return a row'), 'create annotation')
      return rowToAnnotation(row)
    })

    notifyAnnotationChange(annotation, 'membership')
    logger.info('Created annotation', { id: annotation.id, topicId: annotation.topicId, kind: annotation.kind })
    return annotation
  }

  update(id: string, dto: UpdateAnnotationDto): Annotation {
    const annotation = this.dbService.withWriteTx((tx) => {
      const [current] = tx
        .select({ annotation: annotationTable })
        .from(annotationTable)
        .innerJoin(topicTable, eq(annotationTable.topicId, topicTable.id))
        .where(and(eq(annotationTable.id, id), isNull(topicTable.deletedAt)))
        .limit(1)
        .all()
      if (!current) throw DataApiErrorFactory.notFound('Annotation', id)

      const content = current.annotation.kind === 'underline' ? null : dto.content?.trim() || null
      if (current.annotation.kind !== 'underline' && !content) {
        throw DataApiErrorFactory.validation({ content: ['Content is required for this annotation type'] })
      }

      const [row] = tx.update(annotationTable).set({ content }).where(eq(annotationTable.id, id)).returning().all()
      if (!row) throw DataApiErrorFactory.notFound('Annotation', id)
      return rowToAnnotation(row)
    })

    notifyAnnotationChange(annotation, 'projection')
    logger.info('Updated annotation', { id: annotation.id })
    return annotation
  }

  delete(id: string): void {
    const annotation = this.dbService.withWriteTx((tx) => {
      const [current] = tx
        .select({ annotation: annotationTable })
        .from(annotationTable)
        .innerJoin(topicTable, eq(annotationTable.topicId, topicTable.id))
        .where(and(eq(annotationTable.id, id), isNull(topicTable.deletedAt)))
        .limit(1)
        .all()
      if (!current) throw DataApiErrorFactory.notFound('Annotation', id)
      tx.delete(annotationTable).where(eq(annotationTable.id, id)).run()
      return rowToAnnotation(current.annotation)
    })

    notifyAnnotationChange(annotation, 'membership')
    logger.info('Deleted annotation', { id })
  }
}

export const annotationService = new AnnotationService()
