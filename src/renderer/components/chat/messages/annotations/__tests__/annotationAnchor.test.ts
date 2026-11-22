import { afterEach, describe, expect, it } from 'vitest'

import type { Annotation } from '@shared/data/types/annotation'

import {
  captureAnnotationAnchor,
  locateAnnotation,
  projectVisibleText,
  rangesForOffsets,
  resolveAnnotationRanges
} from '../annotationAnchor'

function createSelection(start: Text, startOffset: number, end: Text, endOffset: number): Selection {
  const range = document.createRange()
  range.setStart(start, startOffset)
  range.setEnd(end, endOffset)
  const selection = window.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
  return selection
}

function annotation(overrides: Partial<Annotation>): Annotation {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    topicId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    messageId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    role: 'assistant',
    partId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc-part-0',
    kind: 'thought',
    start: 0,
    end: 1,
    exact: 'a',
    prefix: '',
    suffix: '',
    content: 'A thought',
    createdAt: '2026-11-21T00:00:00.000Z',
    updatedAt: '2026-11-21T00:00:00.000Z',
    ...overrides
  }
}

afterEach(() => {
  window.getSelection()?.removeAllRanges()
  document.body.innerHTML = ''
})

describe('annotation anchors', () => {
  it('captures a selection across text nodes in one message part', () => {
    document.body.innerHTML =
      '<div data-message-annotations-scope><article data-message-id="message-1" data-message-role="assistant"><div data-message-part-id="message-1-part-0">Hello <strong>world</strong> again</div></article></div>'
    const scope = document.querySelector('[data-message-annotations-scope]')!
    const part = document.querySelector('[data-message-part-id]')!
    const firstText = part.firstChild as Text
    const strongText = part.querySelector('strong')!.firstChild as Text

    const anchor = captureAnnotationAnchor(createSelection(firstText, 6, strongText, 5), scope)

    expect(anchor).toMatchObject({
      messageId: 'message-1',
      role: 'assistant',
      partId: 'message-1-part-0',
      start: 6,
      end: 11,
      exact: 'world'
    })
  })

  it('stores UTF-16 offsets for CJK and surrogate-pair selections', () => {
    document.body.innerHTML =
      '<div data-message-annotations-scope><article data-message-id="message-1" data-message-role="assistant"><div data-message-part-id="part-0">猫😀<strong>咖啡</strong>结束</div></article></div>'
    const scope = document.querySelector('[data-message-annotations-scope]')!
    const part = document.querySelector('[data-message-part-id]')!
    const firstText = part.firstChild as Text
    const strongText = part.querySelector('strong')!.firstChild as Text

    const anchor = captureAnnotationAnchor(createSelection(firstText, 1, strongText, 2), scope)

    expect(anchor).toMatchObject({ start: 1, end: 5, exact: '😀咖啡', prefix: '猫', suffix: '结束' })
  })

  it('rejects selections that cross message parts', () => {
    document.body.innerHTML =
      '<article data-message-id="message-1" data-message-role="assistant"><div data-message-part-id="part-0">First</div><div data-message-part-id="part-1">Second</div></article>'
    const message = document.querySelector('[data-message-id]')!
    const firstText = message.querySelector('[data-message-part-id="part-0"]')!.firstChild as Text
    const secondText = message.querySelector('[data-message-part-id="part-1"]')!.firstChild as Text

    expect(captureAnnotationAnchor(createSelection(firstText, 0, secondText, 6), message)).toBeNull()
  })

  it('relocates duplicate exact text using surrounding context', () => {
    const source = document.createElement('div')
    source.innerHTML = 'alpha target beta target gamma'
    const firstText = source.firstChild as Text
    document.body.append(source)
    const selection = createSelection(firstText, 18, firstText, 24)
    const captured = {
      exact: selection.toString(),
      prefix: 'alpha target beta ',
      suffix: ' gamma'
    }
    const projection = projectVisibleText(source)

    const located = locateAnnotation(
      projection,
      annotation({
        start: 18,
        end: 24,
        exact: captured.exact,
        prefix: captured.prefix,
        suffix: captured.suffix
      })
    )

    expect(located).toEqual({ start: 18, end: 24 })
  })

  it('does not guess when duplicate text has indistinguishable context', () => {
    const source = document.createElement('div')
    source.textContent = 'same text same'

    expect(
      locateAnnotation(
        projectVisibleText(source),
        annotation({ start: 5, end: 9, exact: 'same', prefix: '', suffix: '' })
      )
    ).toBeNull()
  })

  it('splits a resolved anchor into ranges for separate text nodes', () => {
    document.body.innerHTML = '<div data-message-part-id="part"><span>hello </span><span>world</span></div>'
    const part = document.querySelector('[data-message-part-id]')!
    const projection = projectVisibleText(part)
    const ranges = rangesForOffsets(projection, 3, 8)

    expect(ranges).toHaveLength(2)
    expect(ranges[0].toString()).toBe('lo ')
    expect(ranges[1].toString()).toBe('wo')
    expect(resolveAnnotationRanges(projection, annotation({ start: 3, end: 8, exact: 'lo wo' }))).toHaveLength(2)
  })
})
