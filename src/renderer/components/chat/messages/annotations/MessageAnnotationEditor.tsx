import { Lightbulb, MessagesSquare, Trash2, X } from 'lucide-react'
import { type PointerEvent as ReactPointerEvent, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, Textarea } from '@cherrystudio/ui'
import type { AnnotationKind } from '@shared/data/types/annotation'

interface MessageAnnotationEditorProps {
  kind: AnnotationKind
  content: string
  excerpt: string
  isSaving: boolean
  canDelete: boolean
  position: { x: number; y: number }
  onChange: (content: string) => void
  onClose: () => void
  onDelete: () => void
  onPositionChange: (position: { x: number; y: number }) => void
  onSave: () => void
}

function getEditorBounds() {
  const shell = document.querySelector<HTMLElement>('[data-chat-app-shell-root]')
  const region = shell?.querySelector<HTMLElement>('[data-chat-app-shell-main-region]')
  const bounds = (region ?? shell)?.getBoundingClientRect()
  const pane = shell?.querySelector<HTMLElement>('[data-right-pane][data-right-pane-mode="docked"]')
  const paneBounds = pane?.getBoundingClientRect()
  const left = Number.isFinite(bounds?.left) ? bounds!.left : 0
  const right = Number.isFinite(bounds?.right) ? bounds!.right : window.innerWidth
  const top = Number.isFinite(bounds?.top) ? bounds!.top : 0
  const bottom = Number.isFinite(bounds?.bottom) ? bounds!.bottom : window.innerHeight
  return {
    left,
    right: paneBounds && paneBounds.width > 0 ? Math.min(right, paneBounds.left) : right,
    top,
    bottom
  }
}

function clampCenter(value: number, start: number, end: number, halfSize: number): number {
  const inset = Math.min(halfSize + 12, (end - start) / 2)
  return Math.max(start + inset, Math.min(end - inset, value))
}

const MessageAnnotationEditor = ({
  kind,
  content,
  excerpt,
  isSaving,
  canDelete,
  position,
  onChange,
  onClose,
  onDelete,
  onPositionChange,
  onSave
}: MessageAnnotationEditorProps) => {
  const { t } = useTranslation()
  const [size, setSize] = useState({ width: 560, height: 560 })
  const bounds = getEditorBounds()
  const width = Math.min(size.width, Math.max(280, bounds.right - bounds.left - 24))
  const height = Math.min(size.height, Math.max(240, bounds.bottom - bounds.top - 24))
  const [excerptShare, setExcerptShare] = useState(0.5)
  const splitRef = useRef<{ y: number; share: number; height: number } | null>(null)
  const dragRef = useRef<{
    pointerId: number
    clientX: number
    clientY: number
    x: number
    y: number
    width: number
    height: number
  } | null>(null)
  const requiresContent = kind !== 'underline'
  const titleKey = {
    thought: 'webview.annotation.thought',
    followup: 'webview.annotation.followup',
    underline: 'webview.annotation.underline'
  }[kind]
  const promptKey = kind === 'thought' ? 'webview.annotation.thought' : 'webview.annotation.followup_prompt'
  const placeholderKey =
    kind === 'thought' ? 'webview.annotation.thought_placeholder' : 'webview.annotation.followup_placeholder'

  const handleDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== undefined && event.button !== 0) return
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return
    if ((event.target as HTMLElement).closest('button,[data-annotation-resize-handle]')) return
    const surface = event.currentTarget.closest<HTMLElement>('[data-message-annotation-editor]')
    if (!surface) return
    const bounds = surface.getBoundingClientRect()
    const drag = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      x: position.x,
      y: position.y,
      width: bounds.width || width,
      height: bounds.height || height
    }
    dragRef.current = drag
    const move = (moveEvent: PointerEvent) => {
      if (dragRef.current && moveEvent.pointerId !== undefined && dragRef.current.pointerId !== moveEvent.pointerId)
        return
      if (!dragRef.current) return
      if (!Number.isFinite(moveEvent.clientX) || !Number.isFinite(moveEvent.clientY)) return
      const halfWidth = drag.width / 2
      const bounds = getEditorBounds()
      onPositionChange({
        x: clampCenter(drag.x + moveEvent.clientX - drag.clientX, bounds.left, bounds.right, halfWidth),
        y: clampCenter(drag.y + moveEvent.clientY - drag.clientY, bounds.top, bounds.bottom, drag.height / 2)
      })
    }
    const end = (endEvent: PointerEvent) => {
      if (dragRef.current && endEvent.pointerId !== undefined && dragRef.current.pointerId !== endEvent.pointerId)
        return
      if (!dragRef.current) return
      dragRef.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    event.currentTarget.setPointerCapture?.(event.pointerId)
    event.preventDefault()
    event.stopPropagation()
  }

  const handleDragMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || (event.pointerId !== undefined && drag.pointerId !== event.pointerId)) return
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return
    const bounds = getEditorBounds()
    const halfWidth = drag.width / 2
    onPositionChange({
      x: clampCenter(drag.x + event.clientX - drag.clientX, bounds.left, bounds.right, halfWidth),
      y: clampCenter(drag.y + event.clientY - drag.clientY, bounds.top, bounds.bottom, drag.height / 2)
    })
  }

  const handleDragEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current && (event.pointerId === undefined || dragRef.current.pointerId === event.pointerId))
      dragRef.current = null
  }

  const handleResizeStart = (edge: string, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== undefined && event.button !== 0) return
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return
    const origin = { x: event.clientX, y: event.clientY, width, height }
    const originPosition = position
    const left = position.x - size.width / 2
    const right = position.x + size.width / 2
    const top = position.y - size.height / 2
    const bottom = position.y + size.height / 2
    const bounds = getEditorBounds()
    const maxWidth = Math.max(280, bounds.right - bounds.left - 24)
    const maxHeight = Math.max(240, bounds.bottom - bounds.top - 24)
    const leftEdge = bounds.left + 12
    const rightEdge = bounds.right - 12
    const horizontal = edge.includes('e') || edge.includes('w')
    const vertical = edge.includes('n') || edge.includes('s')
    event.currentTarget.setPointerCapture(event.pointerId)
    const handleMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== event.pointerId) return
      if (!Number.isFinite(moveEvent.clientX) || !Number.isFinite(moveEvent.clientY)) return
      const nextWidth = horizontal
        ? Math.max(
            Math.min(360, maxWidth),
            Math.min(
              Math.min(maxWidth, edge.includes('w') ? right - leftEdge : rightEdge - left),
              origin.width + (edge.includes('w') ? -1 : 1) * (moveEvent.clientX - origin.x)
            )
          )
        : origin.width
      const nextHeight = vertical
        ? Math.max(
            Math.min(300, maxHeight),
            Math.min(
              Math.min(maxHeight, edge.includes('n') ? bottom - bounds.top - 12 : bounds.bottom - 12 - top),
              origin.height + (edge.includes('n') ? -1 : 1) * (moveEvent.clientY - origin.y)
            )
          )
        : origin.height
      const nextPosition = {
        x: edge.includes('w') ? right - nextWidth / 2 : edge.includes('e') ? left + nextWidth / 2 : originPosition.x,
        y: edge.includes('n') ? bottom - nextHeight / 2 : edge.includes('s') ? top + nextHeight / 2 : originPosition.y
      }
      setSize({
        width: nextWidth,
        height: nextHeight
      })
      onPositionChange(nextPosition)
    }
    const handleEnd = (endEvent: PointerEvent) => {
      if (endEvent.pointerId !== event.pointerId) return
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleEnd)
      window.removeEventListener('pointercancel', handleEnd)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleEnd)
    window.addEventListener('pointercancel', handleEnd)
    event.preventDefault()
    event.stopPropagation()
  }

  const handleSplitStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!Number.isFinite(event.clientY)) return
    const surface = event.currentTarget.closest<HTMLElement>('[data-message-annotation-editor]')
    if (!surface) return
    splitRef.current = { y: event.clientY, share: excerptShare, height: surface.getBoundingClientRect().height }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const handleSplitMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const split = splitRef.current
    if (!split || !Number.isFinite(event.clientY) || split.height <= 0) return
    setExcerptShare(Math.max(0.22, Math.min(0.72, split.share + (event.clientY - split.y) / split.height)))
  }

  return (
    <section
      aria-label={t(titleKey)}
      className="chat-annotation-editor absolute z-[120] flex -translate-x-1/2 -translate-y-1/2 flex-col"
      data-message-annotation-editor=""
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !isSaving) onClose()
        if (
          event.key === 'Enter' &&
          !event.shiftKey &&
          !event.altKey &&
          !event.nativeEvent.isComposing &&
          event.target instanceof HTMLTextAreaElement
        ) {
          event.preventDefault()
          if (!isSaving && content.trim()) onSave()
        }
      }}
      onPointerDown={(event) => event.stopPropagation()}
      role="dialog"
      style={{
        left: position.x,
        top: position.y,
        width,
        height,
        minWidth: Math.min(360, width),
        minHeight: Math.min(300, height),
        maxWidth: width,
        maxHeight: height
      }}>
      <header
        className="flex h-9 shrink-0 items-center gap-2"
        data-annotation-editor-drag-handle=""
        data-annotation-ignore=""
        onPointerCancel={handleDragEnd}
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}>
        {kind === 'followup' ? (
          <MessagesSquare aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
        ) : (
          <Lightbulb aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
        )}
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{t(titleKey)}</h2>
        <Button
          aria-label={t('webview.annotation.cancel')}
          className="size-7 shrink-0"
          disabled={isSaving}
          size="icon"
          variant="ghost"
          onClick={onClose}>
          <X aria-hidden="true" />
        </Button>
      </header>
      <blockquote className="chat-annotation-editor-quote" style={{ flex: `${excerptShare} 1 0%` }}>
        {excerpt}
      </blockquote>
      {requiresContent && (
        <div
          aria-label={t('common.resize_panel')}
          aria-orientation="horizontal"
          className="chat-annotation-editor-splitter"
          data-annotation-ignore=""
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp') setExcerptShare((share) => Math.max(0.22, share - 0.04))
            if (event.key === 'ArrowDown') setExcerptShare((share) => Math.min(0.72, share + 0.04))
          }}
          onPointerCancel={() => (splitRef.current = null)}
          onPointerDown={handleSplitStart}
          onPointerMove={handleSplitMove}
          onPointerUp={() => (splitRef.current = null)}
          role="separator"
          tabIndex={0}
        />
      )}
      {requiresContent && (
        <div className="chat-annotation-editor-input" style={{ flex: `${1 - excerptShare} 1 0%` }}>
          <label className="text-xs text-muted-foreground" htmlFor="message-annotation-content">
            {t(promptKey)}
          </label>
          <Textarea.Input
            id="message-annotation-content"
            aria-label={t(promptKey)}
            autoFocus
            className="chat-annotation-editor-textarea"
            disabled={isSaving}
            maxLength={100_000}
            onValueChange={onChange}
            placeholder={t(placeholderKey)}
            value={content}
          />
        </div>
      )}
      <footer className="flex shrink-0 items-center justify-between gap-3 pt-1">
        {canDelete ? (
          <Button variant="ghost" disabled={isSaving} onClick={onDelete}>
            <Trash2 aria-hidden="true" />
            {t('webview.annotation.delete')}
          </Button>
        ) : (
          <span />
        )}
        {requiresContent && (
          <Button disabled={isSaving || !content.trim()} onClick={onSave}>
            {t('webview.annotation.save')}
          </Button>
        )}
      </footer>
      <button
        aria-label={t('common.resize_panel')}
        className="chat-annotation-editor-resize"
        data-annotation-ignore=""
        data-annotation-resize-handle=""
        onPointerDown={(event) => handleResizeStart('se', event)}
        type="button"
      />
      {(['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'] as const)
        .filter((edge) => edge !== 'se')
        .map((edge) => (
          <button
            key={edge}
            aria-label={t('common.resize_panel')}
            className={`chat-annotation-editor-resize-edge chat-annotation-editor-resize-${edge}`}
            data-annotation-ignore=""
            data-annotation-resize-handle={edge}
            onPointerDown={(event) => handleResizeStart(edge, event)}
            type="button"
          />
        ))}
    </section>
  )
}

export default MessageAnnotationEditor
