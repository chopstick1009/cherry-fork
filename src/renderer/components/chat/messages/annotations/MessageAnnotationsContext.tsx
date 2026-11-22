import {
  type ReactNode,
  createContext,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { useInvalidateCache, useMutation, useQuery } from '@renderer/data/hooks/useDataApi'
import { useDataChange } from '@renderer/data/hooks/useDataChange'
import { EVENT_NAMES, EventEmitter } from '@renderer/services/EventService'
import { toast } from '@renderer/services/toast'
import type { Annotation, AnnotationKind } from '@shared/data/types/annotation'

import {
  captureAnnotationAnchor,
  projectVisibleText,
  resolveAnnotationRanges,
  type CapturedAnnotationAnchor
} from './annotationAnchor'
import { affectsTopicAnnotations } from './annotationDataChanges'
import MessageAnnotationEditor from './MessageAnnotationEditor'

type AnnotationEditorState =
  | {
      mode: 'create'
      anchor: CapturedAnnotationAnchor
      kind: Exclude<AnnotationKind, 'underline'>
      content: string
      position: { x: number; y: number }
    }
  | { mode: 'edit'; annotation: Annotation; content: string; position: { x: number; y: number } }

interface ResolvedAnnotation {
  annotation: Annotation
  ranges: Range[]
}

interface MessageAnnotationsContextValue {
  annotations: Annotation[]
  createFromSelection: (kind: AnnotationKind, selection: Selection, scope: Element | null) => void
  canAnnotateSelection: (selection: Selection | null, scope: Element | null) => boolean
  isMutating: boolean
}

const MessageAnnotationsContext = createContext<MessageAnnotationsContextValue | null>(null)

const HIGHLIGHT_NAMES = {
  underline: 'chat-annotation-underline',
  thought: 'chat-annotation-thought',
  followup: 'chat-annotation-followup'
} as const

function getEditorCenter(root: HTMLElement | null): { x: number; y: number } {
  const shell = root?.closest<HTMLElement>('[data-chat-app-shell-root]')
  const region = shell?.querySelector<HTMLElement>('[data-chat-app-shell-main-region]')
  const shellBounds = (region ?? shell)?.getBoundingClientRect()
  if (!shellBounds) return { x: window.innerWidth / 2, y: window.innerHeight / 2 }

  const pane = shell?.querySelector<HTMLElement>('[data-right-pane][data-right-pane-mode="docked"]')
  const paneBounds = pane?.getBoundingClientRect()
  const left = Number.isFinite(shellBounds.left) ? shellBounds.left : 0
  const shellRight = Number.isFinite(shellBounds.right) ? shellBounds.right : window.innerWidth
  const right = paneBounds && paneBounds.width > 0 ? Math.min(shellRight, paneBounds.left) : shellRight
  const top = Number.isFinite(shellBounds.top) ? shellBounds.top : 0
  const height = Number.isFinite(shellBounds.height) && shellBounds.height > 0 ? shellBounds.height : window.innerHeight
  return { x: (left + right) / 2, y: top + height / 2 }
}

interface HighlightRegistryLike {
  set: (name: string, highlight: unknown) => void
  delete: (name: string) => void
}

interface HighlightConstructorLike {
  new (...ranges: Range[]): unknown
}

function getHighlightSupport(): { registry: HighlightRegistryLike; Highlight: HighlightConstructorLike } | null {
  const css = (globalThis as typeof globalThis & { CSS?: { highlights?: HighlightRegistryLike } }).CSS
  const Highlight = (globalThis as typeof globalThis & { Highlight?: HighlightConstructorLike }).Highlight
  if (!css?.highlights || !Highlight) return null
  return { registry: css.highlights, Highlight }
}

function clearHighlights(): void {
  const support = getHighlightSupport()
  if (!support) return
  Object.values(HIGHLIGHT_NAMES).forEach((name) => support.registry.delete(name))
}

function findPartElement(root: Element, annotation: Annotation): Element | null {
  return [...root.querySelectorAll('[data-message-part-id]')].find((element) => {
    const message = element.closest('[data-message-id]')
    return (
      element.getAttribute('data-message-part-id') === annotation.partId &&
      message?.getAttribute('data-message-id') === annotation.messageId
    )
  }) as Element | null
}

function pointInRange(event: React.MouseEvent, ranges: Range[]): boolean {
  return ranges.some((range) =>
    [...range.getClientRects()].some(
      (rect) =>
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
    )
  )
}

export function useOptionalMessageAnnotations(): MessageAnnotationsContextValue | undefined {
  return use(MessageAnnotationsContext) ?? undefined
}

interface MessageAnnotationsProviderProps {
  children: ReactNode
  topicId: string | undefined
}

export function MessageAnnotationsProvider({ children, topicId }: MessageAnnotationsProviderProps) {
  const { t } = useTranslation()
  const rootRef = useRef<HTMLDivElement>(null)
  const resolvedAnnotationsRef = useRef<ResolvedAnnotation[]>([])
  const [editor, setEditor] = useState<AnnotationEditorState | null>(null)
  const editorMovedRef = useRef(false)
  const routeTopicId = topicId ?? ''
  const { data, isLoading } = useQuery('/topics/:topicId/annotations', {
    enabled: !!topicId,
    params: { topicId: routeTopicId }
  })
  const { trigger: createAnnotation, isLoading: isCreating } = useMutation('POST', '/topics/:topicId/annotations', {
    refresh: ({ result }) => [`/topics/${result.topicId}/annotations`]
  })
  const { trigger: updateAnnotation, isLoading: isUpdating } = useMutation('PATCH', '/annotations/:id', {
    refresh: ({ result }) => [`/topics/${result.topicId}/annotations`]
  })
  const { trigger: deleteAnnotation, isLoading: isDeleting } = useMutation('DELETE', '/annotations/:id', {
    refresh: () => (topicId ? [`/topics/${topicId}/annotations`] : [])
  })
  const invalidateCache = useInvalidateCache()
  const editorLayoutKey = editor
    ? editor.mode === 'edit'
      ? `edit:${editor.annotation.id}`
      : `create:${editor.kind}:${editor.anchor.messageId}:${editor.anchor.start}:${editor.anchor.end}`
    : null

  useDataChange(['/topics/:topicId/annotations', '/topics/:topicId/messages', '/topics/:id'], (effects) => {
    if (topicId && affectsTopicAnnotations(effects, topicId)) {
      void invalidateCache(`/topics/${topicId}/annotations`)
    }
  })

  const annotations = useMemo(() => data ?? [], [data])
  const isMutating = isCreating || isUpdating || isDeleting
  const canAnnotateSelection = useCallback(
    (selection: Selection | null, scope: Element | null) => !!topicId && !!captureAnnotationAnchor(selection, scope),
    [topicId]
  )

  const rebuildHighlights = useCallback(() => {
    const root = rootRef.current
    const support = getHighlightSupport()
    if (!root || !support) return

    clearHighlights()
    const resolved: ResolvedAnnotation[] = []
    const rangesByKind: Record<AnnotationKind, Range[]> = {
      underline: [],
      thought: [],
      followup: []
    }

    for (const annotation of annotations) {
      const part = findPartElement(root, annotation)
      if (!part) continue
      const ranges = resolveAnnotationRanges(projectVisibleText(part), annotation)
      if (ranges.length === 0) continue
      resolved.push({ annotation, ranges })
      rangesByKind[annotation.kind].push(...ranges)
    }

    for (const kind of Object.keys(HIGHLIGHT_NAMES) as AnnotationKind[]) {
      if (rangesByKind[kind].length > 0) {
        support.registry.set(HIGHLIGHT_NAMES[kind], new support.Highlight(...rangesByKind[kind]))
      }
    }
    resolvedAnnotationsRef.current = resolved
  }, [annotations])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = undefined
        rebuildHighlights()
      }, 0)
    }
    const observer = new MutationObserver(schedule)
    observer.observe(root, { characterData: true, childList: true, subtree: true })
    schedule()
    return () => {
      if (timer) clearTimeout(timer)
      observer.disconnect()
      clearHighlights()
      resolvedAnnotationsRef.current = []
    }
  }, [rebuildHighlights])

  const createFromSelection = useCallback(
    (kind: AnnotationKind, selection: Selection, scope: Element | null) => {
      const anchor = captureAnnotationAnchor(selection, scope)
      if (!anchor || !topicId) return
      const position = getEditorCenter(rootRef.current)
      editorMovedRef.current = false
      selection.removeAllRanges()
      void EventEmitter.emit(EVENT_NAMES.OPEN_MESSAGE_ANNOTATIONS, { topicId })
      if (kind === 'underline') {
        void createAnnotation({
          params: { topicId },
          body: { ...anchor, kind, content: null }
        }).catch((error: unknown) => {
          toast.error(error instanceof Error ? error.message : t('webview.annotation.element_unavailable'))
        })
        return
      }
      setEditor({ mode: 'create', anchor, kind, content: '', position })
    },
    [createAnnotation, t, topicId]
  )

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const selection = window.getSelection()
      if (selection && !selection.isCollapsed) return
      const hit = resolvedAnnotationsRef.current.find(({ ranges }) => pointInRange(event, ranges))
      if (!hit) return
      event.preventDefault()
      setEditor({
        mode: 'edit',
        annotation: hit.annotation,
        content: hit.annotation.content ?? '',
        position: getEditorCenter(rootRef.current)
      })
      editorMovedRef.current = false
      void EventEmitter.emit(EVENT_NAMES.OPEN_MESSAGE_ANNOTATIONS, { topicId, annotationId: hit.annotation.id })
    },
    [topicId]
  )

  useLayoutEffect(() => {
    if (!editorLayoutKey) return
    const shell = rootRef.current?.closest<HTMLElement>('[data-chat-app-shell-root]')
    const region = shell?.querySelector<HTMLElement>('[data-chat-app-shell-main-region]')
    const pane = shell?.querySelector<HTMLElement>('[data-right-pane]')
    const updateCenter = () => {
      if (editorMovedRef.current) return
      const position = getEditorCenter(rootRef.current)
      setEditor((current) => (current ? { ...current, position } : current))
    }
    const observer = new ResizeObserver(updateCenter)
    if (shell) observer.observe(shell)
    if (region) observer.observe(region)
    if (pane) observer.observe(pane)
    window.addEventListener('resize', updateCenter)
    updateCenter()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateCenter)
    }
  }, [editorLayoutKey])

  const handleSave = useCallback(async () => {
    if (!editor || isMutating) return
    try {
      if (editor.mode === 'create') {
        if (!editor.content.trim() || !topicId) return
        await createAnnotation({
          params: { topicId },
          body: { ...editor.anchor, kind: editor.kind, content: editor.content }
        })
      } else {
        if (editor.annotation.kind !== 'underline' && !editor.content.trim()) return
        await updateAnnotation({
          params: { id: editor.annotation.id },
          body: { content: editor.annotation.kind === 'underline' ? null : editor.content }
        })
      }
      setEditor(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('webview.annotation.element_unavailable'))
    }
  }, [createAnnotation, editor, isMutating, t, topicId, updateAnnotation])

  const handleDelete = useCallback(async () => {
    if (!editor || editor.mode !== 'edit' || isMutating) return
    try {
      await deleteAnnotation({ params: { id: editor.annotation.id } })
      setEditor(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('webview.annotation.element_unavailable'))
    }
  }, [deleteAnnotation, editor, isMutating, t])

  const contextValue = useMemo<MessageAnnotationsContextValue>(
    () => ({ annotations, canAnnotateSelection, createFromSelection, isMutating: isMutating || isLoading }),
    [annotations, canAnnotateSelection, createFromSelection, isLoading, isMutating]
  )

  return (
    <MessageAnnotationsContext value={contextValue}>
      <div ref={rootRef} className="contents" data-message-annotations-scope onClick={handleClick}>
        {children}
      </div>
      {editor &&
        createPortal(
          <div className="chat-annotation-editor-layer">
            <MessageAnnotationEditor
              key={
                editor.mode === 'edit'
                  ? editor.annotation.id
                  : `${editor.kind}:${editor.anchor.messageId}:${editor.anchor.start}:${editor.anchor.end}`
              }
              canDelete={editor.mode === 'edit'}
              content={editor.content}
              excerpt={editor.mode === 'create' ? editor.anchor.exact : editor.annotation.exact}
              isSaving={isMutating}
              kind={editor.mode === 'create' ? editor.kind : editor.annotation.kind}
              position={editor.position}
              onChange={(content) => setEditor((current) => (current ? { ...current, content } : current))}
              onClose={() => setEditor(null)}
              onDelete={() => void handleDelete()}
              onPositionChange={(position) => {
                editorMovedRef.current = true
                setEditor((current) => (current ? { ...current, position } : current))
              }}
              onSave={() => void handleSave()}
            />
          </div>,
          document.body
        )}
    </MessageAnnotationsContext>
  )
}
