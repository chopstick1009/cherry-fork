import type { Annotation } from '@shared/data/types/annotation'
import type { ContentMessageRole } from '@shared/data/types/message'

const EXCLUDED_SELECTOR =
  'script,style,svg,button,input,textarea,select,[role="button"],[hidden],[inert],[data-annotation-ignore]'
const BLOCK_TAGS = new Set(['P', 'DIV', 'LI', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TR', 'UL', 'OL'])

export interface TextProjectionSegment {
  node: Text
  start: number
  end: number
}

export interface TextProjection {
  source: Element
  text: string
  segments: TextProjectionSegment[]
}

export interface CapturedAnnotationAnchor {
  messageId: string
  role: ContentMessageRole
  partId: string
  start: number
  end: number
  exact: string
  prefix: string
  suffix: string
}

function appendSeparator(text: string, value: string): string {
  if (!text || text.endsWith(value) || text.endsWith('\n')) return text
  return text + value
}

function isExcluded(element: Element, source: Element): boolean {
  return element !== source && element.matches(EXCLUDED_SELECTOR)
}

/** Build the visible text projection used by persistent message anchors. */
export function projectVisibleText(source: Element): TextProjection {
  let text = ''
  const segments: TextProjectionSegment[] = []

  const visit = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.textContent ?? ''
      if (!value) return
      const start = text.length
      text += value
      segments.push({ node: node as Text, start, end: text.length })
      return
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return
    const element = node as Element
    if (isExcluded(element, source)) return

    if (element.tagName === 'BR') {
      text = appendSeparator(text, '\n')
      return
    }

    const isBlock = element !== source && BLOCK_TAGS.has(element.tagName)
    if (isBlock) text = appendSeparator(text, '\n')
    for (const child of element.childNodes) visit(child)
    if (isBlock) text = appendSeparator(text, '\n')
    else if (element.tagName === 'TD' || element.tagName === 'TH') text = appendSeparator(text, '\t')
  }

  visit(source)
  return { source, text, segments }
}

function elementForNode(node: Node): Element | null {
  return node instanceof Element ? node : node.parentElement
}

function getPartElement(node: Node): Element | null {
  return elementForNode(node)?.closest('[data-message-part-id]') ?? null
}

function getMessageElement(node: Node): Element | null {
  return elementForNode(node)?.closest('[data-message-id]') ?? null
}

function projectedPoint(projection: TextProjection, node: Node, offset: number): number {
  const direct = projection.segments.find((segment) => segment.node === node)
  if (direct) return direct.start + Math.max(0, Math.min(offset, direct.node.length))

  const document = projection.source.ownerDocument
  const point = document.createRange()
  try {
    point.setStart(node, offset)
  } catch {
    return 0
  }
  point.collapse(true)

  let previous = 0
  for (const segment of projection.segments) {
    const segmentStart = document.createRange()
    segmentStart.setStart(segment.node, 0)
    segmentStart.collapse(true)
    if (point.compareBoundaryPoints(Range.START_TO_START, segmentStart) <= 0) return segment.start

    const segmentEnd = document.createRange()
    segmentEnd.setStart(segment.node, segment.node.length)
    segmentEnd.collapse(true)
    if (point.compareBoundaryPoints(Range.START_TO_START, segmentEnd) <= 0) return segment.end
    previous = segment.end
  }
  return previous
}

function trimSelection(projection: TextProjection, start: number, end: number): { start: number; end: number } {
  const selected = projection.text.slice(start, end)
  const leading = selected.length - selected.trimStart().length
  const trailing = selected.length - selected.trimEnd().length
  return { start: start + leading, end: end - trailing }
}

/** Convert a DOM selection to a durable message-part anchor. */
export function captureAnnotationAnchor(
  selection: Selection | null,
  scope: Element | null
): CapturedAnnotationAnchor | null {
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return null

  const range = selection.getRangeAt(0)
  const startPart = getPartElement(range.startContainer)
  const endPart = getPartElement(range.endContainer)
  const message = getMessageElement(range.startContainer)
  const endMessage = getMessageElement(range.endContainer)
  if (
    !startPart ||
    startPart !== endPart ||
    !message ||
    message !== endMessage ||
    (scope && !scope.contains(message))
  ) {
    return null
  }

  const startElement = elementForNode(range.startContainer)
  const endElement = elementForNode(range.endContainer)
  if (
    !startElement ||
    !endElement ||
    startElement.closest(EXCLUDED_SELECTOR) ||
    endElement.closest(EXCLUDED_SELECTOR) ||
    startPart.closest('[data-annotation-ignore]')
  ) {
    return null
  }

  const role = message.getAttribute('data-message-role')
  if (role !== 'user' && role !== 'assistant' && role !== 'system') return null

  const projection = projectVisibleText(startPart)
  let start = projectedPoint(projection, range.startContainer, range.startOffset)
  let end = projectedPoint(projection, range.endContainer, range.endOffset)
  if (end < start) [start, end] = [end, start]
  const trimmed = trimSelection(projection, start, end)
  start = trimmed.start
  end = trimmed.end
  if (end <= start) return null

  const exact = projection.text.slice(start, end)
  const messageId = message.getAttribute('data-message-id') ?? ''
  const partId = startPart.getAttribute('data-message-part-id') ?? ''
  if (!messageId || !partId) return null

  return {
    messageId,
    role,
    partId,
    start,
    end,
    exact,
    prefix: projection.text.slice(Math.max(0, start - 256), start),
    suffix: projection.text.slice(end, end + 256)
  }
}

function scoreMatch(
  text: string,
  start: number,
  exactLength: number,
  annotation: Pick<Annotation, 'prefix' | 'suffix'>
): number {
  const before = text.slice(Math.max(0, start - annotation.prefix.length), start)
  const afterStart = start + exactLength
  const after = text.slice(afterStart, afterStart + annotation.suffix.length)
  let score = 0
  for (let i = 1; i <= Math.min(annotation.prefix.length, before.length); i++) {
    if (annotation.prefix.at(-i) !== before.at(-i)) break
    score++
  }
  for (let i = 0; i < Math.min(annotation.suffix.length, after.length); i++) {
    if (annotation.suffix[i] !== after[i]) break
    score++
  }
  return score
}

function locateExact(
  text: string,
  annotation: Pick<Annotation, 'exact' | 'prefix' | 'suffix'>
): { start: number; end: number } | null {
  const matches: Array<{ start: number; end: number; score: number }> = []
  let from = 0
  while (from <= text.length) {
    const start = text.indexOf(annotation.exact, from)
    if (start < 0) break
    matches.push({
      start,
      end: start + annotation.exact.length,
      score: scoreMatch(text, start, annotation.exact.length, annotation)
    })
    from = start + Math.max(1, annotation.exact.length)
  }
  if (matches.length === 0) return null
  if (matches.length === 1) return matches[0]
  matches.sort((left, right) => right.score - left.score)
  return matches[0].score > matches[1].score ? matches[0] : null
}

/** Find the current offsets for an annotation after its DOM has been rebuilt. */
export function locateAnnotation(
  projection: TextProjection,
  annotation: Annotation
): { start: number; end: number } | null {
  if (
    annotation.start >= 0 &&
    annotation.end <= projection.text.length &&
    projection.text.slice(annotation.start, annotation.end) === annotation.exact
  ) {
    return { start: annotation.start, end: annotation.end }
  }
  return locateExact(projection.text, annotation)
}

/** Convert projected UTF-16 offsets into one or more DOM ranges. */
export function rangesForOffsets(projection: TextProjection, start: number, end: number): Range[] {
  const ranges: Range[] = []
  for (const segment of projection.segments) {
    const segmentStart = Math.max(start, segment.start)
    const segmentEnd = Math.min(end, segment.end)
    if (segmentEnd <= segmentStart) continue
    const range = projection.source.ownerDocument.createRange()
    range.setStart(segment.node, segmentStart - segment.start)
    range.setEnd(segment.node, segmentEnd - segment.start)
    ranges.push(range)
  }
  return ranges
}

export function resolveAnnotationRanges(projection: TextProjection, annotation: Annotation): Range[] {
  const location = locateAnnotation(projection, annotation)
  return location ? rangesForOffsets(projection, location.start, location.end) : []
}
