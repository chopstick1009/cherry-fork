import dayjs from 'dayjs'
import { Activity, GitBranch, Globe, MessagesSquare, Notebook, Send } from 'lucide-react'
import type { PropsWithChildren } from 'react'
import {
  createContext,
  lazy,
  Suspense,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore
} from 'react'
import { useTranslation } from 'react-i18next'

import { NormalTooltip } from '@cherrystudio/ui'
import type { TopicMessageFlowLiveState } from '@renderer/components/chat/flow'
import { getLatestAssistantFollowups } from '@renderer/components/chat/messages/annotations/annotationFollowups'
import {
  createResourcePaneCapability,
  type ResourcePaneConfig,
  ResourcePaneLocateOpener,
  type RightPanelCapability,
  type RightPanelComponentProps,
  type RightPanelComposition,
  RightPanelHeaderControls,
  RightPanelProvider,
  RightPanelShortcut,
  RightPanelViewport,
  useOptionalRightPanelState,
  useRightPanelActions,
  useRightPanelState
} from '@renderer/components/chat/panes/Shell'
import type { ResourceListRevealRequest } from '@renderer/components/chat/resourceList/base'
import { SessionBrowserView } from '@renderer/components/SessionBrowserView'
import { useQuery } from '@renderer/data/hooks/useDataApi'
import { usePreference } from '@renderer/data/hooks/usePreference'
import { useIpcOn } from '@renderer/ipc'
import { topicBrowserRuntimeService as browserRuntime } from '@renderer/services/AgentBrowserRuntimeService'
import { EVENT_NAMES, EventEmitter } from '@renderer/services/EventService'
import type { Annotation } from '@shared/data/types/annotation'
import { WebviewSecurityProfile } from '@shared/utils/webviewSecurity'

const TopicBranchPanel = lazy(() => import('./TopicBranchPanel'))

const TracePane = lazy(() =>
  import('@renderer/components/chat/trace/TracePane').then((module) => ({ default: module.TracePane }))
)

interface TopicRightPaneMeta {
  topicId?: string
  topicName?: string
  /** Container-level trace id. When developer mode is on, the Trace tab renders this trace tree. */
  traceId?: string
}

interface TopicRightPaneViewportCallbacks {
  onLocateMessage?: (messageId: string) => void
}

interface TopicRightPanelScope extends TopicRightPaneMeta {
  annotationTitle: string
  browserTitle: string
  branchTitle: string
  developerMode: boolean
  resourcePane: ResourcePaneConfig | null
  traceTitle: string
}

type TopicBranchLiveStateSetter = (topicId: string, state: TopicMessageFlowLiveState | null) => void

interface TopicBranchLiveStateStore {
  getSnapshot: (topicId: string) => TopicMessageFlowLiveState | null
  setSnapshot: TopicBranchLiveStateSetter
  subscribe: (topicId: string, listener: () => void) => () => void
}

function createTopicBranchLiveStateStore(): TopicBranchLiveStateStore {
  const snapshots = new Map<string, TopicMessageFlowLiveState>()
  const listeners = new Map<string, Set<() => void>>()

  const notify = (topicId: string) => {
    for (const listener of listeners.get(topicId) ?? []) listener()
  }

  return {
    getSnapshot: (topicId) => snapshots.get(topicId) ?? null,
    setSnapshot: (topicId, state) => {
      const current = snapshots.get(topicId) ?? null
      if (current === state) return
      if (state) {
        snapshots.set(topicId, state)
      } else {
        snapshots.delete(topicId)
      }
      notify(topicId)
    },
    subscribe: (topicId, listener) => {
      let topicListeners = listeners.get(topicId)
      if (!topicListeners) {
        topicListeners = new Set()
        listeners.set(topicId, topicListeners)
      }
      topicListeners.add(listener)

      return () => {
        topicListeners?.delete(listener)
        if (topicListeners?.size === 0) listeners.delete(topicId)
      }
    }
  }
}

const TopicBranchLiveStateStoreContext = createContext<TopicBranchLiveStateStore | null>(null)
type TopicRightPaneViewportValue = TopicRightPaneViewportCallbacks & { branchOpenCycle: number }
const TopicRightPaneViewportContext = createContext<TopicRightPaneViewportValue | null>(null)
interface TopicAnnotationPaneState {
  selectedId: string | null
  latestAssistantMessageId: string | null
  latestAssistantMessageSeq: number
  latestAssistantTurn: number
  select: (id: string | null) => void
  setLatestAssistant: (id: string | null, messageSeq: number, turn: number) => void
}
const TopicAnnotationPaneContext = createContext<TopicAnnotationPaneState | null>(null)
function useTopicBranchLiveStateStore(): TopicBranchLiveStateStore {
  const store = use(TopicBranchLiveStateStoreContext)
  if (!store) throw new Error('useTopicBranchLiveStateStore must be used within <TopicRightPane.Scope>')
  return store
}

function useTopicRightPaneViewport(): TopicRightPaneViewportValue {
  const value = use(TopicRightPaneViewportContext)
  if (!value) throw new Error('useTopicRightPaneViewport must be used within <TopicRightPane.Viewport>')
  return value
}

export function useTopicBranchLiveStateSetter(): TopicBranchLiveStateSetter {
  return useTopicBranchLiveStateStore().setSnapshot
}

function useTopicBranchLiveState(topicId: string): TopicMessageFlowLiveState | null {
  const store = useTopicBranchLiveStateStore()
  const subscribe = useCallback((listener: () => void) => store.subscribe(topicId, listener), [store, topicId])
  const getSnapshot = useCallback(() => store.getSnapshot(topicId), [store, topicId])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

function TopicBranchRightPanel({ active, scope }: RightPanelComponentProps<TopicRightPanelScope>) {
  const panelState = useRightPanelState()
  const branchLiveState = useTopicBranchLiveState(scope.topicId ?? '')
  const callbacks = useTopicRightPaneViewport()
  const canvasFocusKey = `${scope.topicId ?? ''}:${panelState.maximized ? 'maximized' : 'docked'}:${panelState.pdfLayoutRefreshKey}:${callbacks.branchOpenCycle}`
  const canvasLayoutReady = panelState.maximized || !panelState.pdfLayoutPending

  if (!scope.topicId) return null

  return (
    <Suspense fallback={null}>
      <TopicBranchPanel
        open={active}
        topicId={scope.topicId}
        topicName={scope.topicName}
        liveState={branchLiveState}
        focusKey={canvasFocusKey}
        layoutReady={canvasLayoutReady}
        onLocateMessage={callbacks.onLocateMessage}
      />
    </Suspense>
  )
}

function TopicAnnotationRightPanel({ scope }: RightPanelComponentProps<TopicRightPanelScope>) {
  const { t } = useTranslation()
  const state = use(TopicAnnotationPaneContext)
  const { data } = useQuery('/topics/:topicId/annotations', {
    enabled: !!scope.topicId,
    params: { topicId: scope.topicId ?? '' }
  })
  const annotations = useMemo(() => (Array.isArray(data) ? data : []), [data])
  const latestFollowups = getLatestAssistantFollowups(annotations, state?.latestAssistantMessageId ?? null)
  const sortedAnnotations = useMemo(
    () => [...annotations].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [annotations]
  )
  const importLabel = t('webview.annotation.import_followups', { count: latestFollowups.length })

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex min-h-12 shrink-0 items-center justify-between gap-2 border-b px-4 py-2">
        <span className="min-w-0 truncate text-sm font-semibold text-muted-foreground">
          {t('webview.annotation.current_session')} · {t('webview.annotation.count', { count: annotations.length })}
        </span>
        <NormalTooltip content={importLabel} side="bottom">
          <button
            aria-label={importLabel}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            disabled={latestFollowups.length === 0}
            onClick={() => {
              void EventEmitter.emit(EVENT_NAMES.IMPORT_MESSAGE_FOLLOWUPS, {
                topicId: scope.topicId,
                turn: state?.latestAssistantTurn ?? 0,
                messageSeq: state?.latestAssistantMessageSeq ?? 0,
                annotations: latestFollowups
              })
            }}
            type="button">
            <Send aria-hidden="true" className="size-5" />
          </button>
        </NormalTooltip>
      </header>
      <div className="min-h-0 flex-1 overflow-auto px-4">
        {sortedAnnotations.length ? (
          <ol className="flex flex-col">
            {sortedAnnotations.map((annotation) => (
              <AnnotationEntry
                key={annotation.id}
                annotation={annotation}
                selected={annotation.id === state?.selectedId}
                onSelect={() => state?.select(annotation.id)}
              />
            ))}
          </ol>
        ) : (
          <div className="flex min-h-full flex-col items-center justify-center gap-2 px-4 py-10 text-center text-muted-foreground">
            <MessagesSquare aria-hidden="true" className="size-9 opacity-80" />
            <p className="max-w-60 text-sm font-medium">{t('webview.annotation.empty_description')}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function AnnotationEntry({
  annotation,
  selected,
  onSelect
}: {
  annotation: Annotation
  selected?: boolean
  onSelect: () => void
}) {
  return (
    <li className="chat-annotation-entry">
      <button
        aria-current={selected ? 'true' : undefined}
        className="w-full min-w-0 text-left"
        onClick={onSelect}
        type="button">
        <blockquote className="chat-annotation-quote">
          <span className={`chat-annotation-excerpt chat-annotation-excerpt-${annotation.kind}`}>
            {annotation.exact}
          </span>
        </blockquote>
        {annotation.content && <span className="chat-annotation-content">{annotation.content}</span>}
        <time className="chat-annotation-time" dateTime={annotation.updatedAt}>
          {dayjs(annotation.updatedAt).format('YYYY/MM/DD HH:mm:ss')}
        </time>
      </button>
    </li>
  )
}

function TopicAnnotationPaneOpener({
  topicId,
  onLatestAssistant
}: {
  topicId?: string
  onLatestAssistant: (id: string | null, messageSeq: number, turn: number) => void
}) {
  const actions = useRightPanelActions()
  const pane = use(TopicAnnotationPaneContext)
  useEffect(
    () =>
      EventEmitter.on(EVENT_NAMES.OPEN_MESSAGE_ANNOTATIONS, (payload: unknown) => {
        if (!payload || typeof payload !== 'object') return
        const request = payload as { topicId?: unknown; annotationId?: unknown }
        if (request.topicId !== topicId) return
        pane?.select(typeof request.annotationId === 'string' ? request.annotationId : null)
        actions.tryOpen('annotations')
      }),
    [actions, pane, topicId]
  )
  useEffect(
    () =>
      EventEmitter.on(EVENT_NAMES.LATEST_ASSISTANT_MESSAGE, (payload: unknown) => {
        if (!payload || typeof payload !== 'object') return
        const update = payload as { topicId?: unknown; messageId?: unknown; messageSeq?: unknown; turn?: unknown }
        if (update.topicId === topicId) {
          onLatestAssistant(
            typeof update.messageId === 'string' ? update.messageId : null,
            typeof update.messageSeq === 'number' && Number.isSafeInteger(update.messageSeq) ? update.messageSeq : 0,
            typeof update.turn === 'number' && Number.isSafeInteger(update.turn) ? update.turn : 0
          )
        }
      }),
    [onLatestAssistant, topicId]
  )
  return null
}

function TopicBrowserRightPanel({ active, scope }: RightPanelComponentProps<TopicRightPanelScope>) {
  const actions = useRightPanelActions()
  if (!scope.topicId) return null
  return (
    <SessionBrowserView
      runtime={browserRuntime}
      sessionId={scope.topicId}
      securityProfile={WebviewSecurityProfile.AgentBrowser}
      isHostActive={active}
      target={{ id: `topic-browser:${scope.topicId}`, label: scope.browserTitle }}
      toolbarActions={<RightPanelHeaderControls canMaximize />}
      onEmpty={actions.close}
    />
  )
}

function TopicBrowserPaneOpener({ topicId }: { topicId?: string }) {
  const actions = useRightPanelActions()
  const [autoOpenPanel] = usePreference('app.browser.auto_open_panel')
  useIpcOn('browser.pane.open_requested', ({ sessionId, scope }) => {
    if (autoOpenPanel && scope === 'topic' && sessionId === topicId) actions.tryOpen('browser')
  })
  return null
}

function TopicTraceRightPanel({ active, scope }: RightPanelComponentProps<TopicRightPanelScope>) {
  if (!active) return null
  return (
    <Suspense fallback={null}>
      <TracePane payload={{ topicId: scope.topicId ?? '', traceId: scope.traceId ?? '' }} />
    </Suspense>
  )
}

/** Stable capability declarations; catalog order is the fallback order. */
const TRACE_PANE_ID = 'trace'
const TOPIC_RESOURCE_PANE_CAPABILITY = createResourcePaneCapability<TopicRightPanelScope>()
const TOPIC_TRACE_PANE_CAPABILITY = {
  component: TopicTraceRightPanel,
  resolve: (scope: TopicRightPanelScope) => ({
    id: TRACE_PANE_ID,
    instanceKey: `trace:${scope.topicId ?? 'unavailable'}:${scope.traceId ?? ''}`,
    title: scope.traceTitle,
    readiness: scope.developerMode && scope.topicId ? 'ready' : 'unavailable'
  })
} satisfies RightPanelCapability<TopicRightPanelScope>
const TOPIC_ANNOTATION_PANE_CAPABILITY = {
  component: TopicAnnotationRightPanel,
  resolve: (scope: TopicRightPanelScope) => ({
    id: 'annotations',
    instanceKey: `annotations:${scope.topicId ?? 'unavailable'}`,
    title: scope.annotationTitle,
    headerMode: 'content',
    readiness: scope.topicId ? 'ready' : 'unavailable'
  })
} satisfies RightPanelCapability<TopicRightPanelScope>
const TOPIC_RIGHT_PANEL_CAPABILITIES = [
  TOPIC_RESOURCE_PANE_CAPABILITY,
  TOPIC_ANNOTATION_PANE_CAPABILITY,
  {
    component: TopicBranchRightPanel,
    resolve: (scope) => ({
      id: 'branch',
      instanceKey: `branch:${scope.topicId ?? 'unavailable'}`,
      title: scope.branchTitle,
      readiness: scope.topicId ? 'ready' : 'unavailable',
      canMaximize: true
    })
  },
  {
    component: TopicBrowserRightPanel,
    resolve: (scope) => ({
      id: 'browser',
      instanceKey: `browser:${scope.topicId ?? 'unavailable'}`,
      title: scope.browserTitle,
      readiness: scope.topicId ? 'ready' : 'unavailable',
      headerMode: 'content',
      canMaximize: true
    })
  },
  TOPIC_TRACE_PANE_CAPABILITY
] satisfies readonly RightPanelCapability<TopicRightPanelScope>[]

function TopicRightPaneProvider({
  children,
  resourcePane,
  topicId,
  topicName,
  traceId,
  present = true,
  defaultOpen = false,
  onOpenChange,
  userOpenIntentSeq,
  revealRequest
}: PropsWithChildren<
  TopicRightPaneMeta & {
    resourcePane?: ResourcePaneConfig | null
    present?: boolean
    defaultOpen?: boolean
    onOpenChange?: (open: boolean) => void
    userOpenIntentSeq?: number
    revealRequest?: ResourceListRevealRequest
  }
>) {
  const { t } = useTranslation()
  const [enableDeveloperMode] = usePreference('app.developer_mode.enabled')
  const storeRef = useRef<TopicBranchLiveStateStore>(undefined as never)
  if (!storeRef.current) storeRef.current = createTopicBranchLiveStateStore()
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null)
  const [latestAssistantMessageId, setLatestAssistantMessageId] = useState<string | null>(null)
  const [latestAssistantMessageSeq, setLatestAssistantMessageSeq] = useState(0)
  const [latestAssistantTurn, setLatestAssistantTurn] = useState(0)
  const setLatestAssistant = useCallback((id: string | null, seq: number, turn: number) => {
    setLatestAssistantMessageId(id)
    setLatestAssistantMessageSeq(seq)
    setLatestAssistantTurn(turn)
  }, [])
  const annotationPaneState = useMemo<TopicAnnotationPaneState>(
    () => ({
      selectedId: selectedAnnotationId,
      latestAssistantMessageId,
      latestAssistantMessageSeq,
      latestAssistantTurn,
      select: setSelectedAnnotationId,
      setLatestAssistant
    }),
    [latestAssistantMessageId, latestAssistantMessageSeq, latestAssistantTurn, selectedAnnotationId, setLatestAssistant]
  )

  const scope = useMemo<TopicRightPanelScope>(
    () => ({
      topicId,
      topicName,
      traceId,
      annotationTitle: t('webview.annotation.title'),
      resourcePane: resourcePane ?? null,
      developerMode: enableDeveloperMode,
      browserTitle: t('settings.browser.title'),
      branchTitle: t('chat.message.flow.title'),
      traceTitle: t('trace.label')
    }),
    [enableDeveloperMode, resourcePane, t, topicId, topicName, traceId]
  )

  return (
    <RightPanelProvider
      capabilities={TOPIC_RIGHT_PANEL_CAPABILITIES}
      scope={scope}
      defaultPanelId={resourcePane ? 'resources' : 'annotations'}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      userOpenIntentSeq={userOpenIntentSeq}
      present={present}>
      <TopicBrowserPaneOpener topicId={topicId} />
      <ResourcePaneLocateOpener revealRequest={revealRequest} />
      <TopicBranchLiveStateStoreContext value={storeRef.current}>
        <TopicAnnotationPaneContext value={annotationPaneState}>
          <TopicAnnotationPaneOpener topicId={topicId} onLatestAssistant={setLatestAssistant} />
          {children}
        </TopicAnnotationPaneContext>
      </TopicBranchLiveStateStoreContext>
    </RightPanelProvider>
  )
}

function TopicRightPaneViewport({ onLocateMessage }: TopicRightPaneViewportCallbacks) {
  const branchActive = useOptionalRightPanelState()?.isActive('branch') ?? false
  const [branchOpening, setBranchOpening] = useState({ active: branchActive, cycle: 0 })

  if (branchOpening.active !== branchActive) {
    setBranchOpening({
      active: branchActive,
      cycle: branchOpening.cycle + (branchActive ? 1 : 0)
    })
  }

  const callbacks = useMemo<TopicRightPaneViewportValue>(
    () => ({ onLocateMessage, branchOpenCycle: branchOpening.cycle }),
    [onLocateMessage, branchOpening.cycle]
  )

  return (
    <TopicRightPaneViewportContext value={callbacks}>
      <RightPanelViewport />
    </TopicRightPaneViewportContext>
  )
}

function TopicRightPaneShortcuts({ browserEnabled = true }: { browserEnabled?: boolean }) {
  const { t } = useTranslation()
  const [browserControlEnabled] = usePreference('app.browser.agent_control.enabled')

  return (
    <>
      {browserEnabled && browserControlEnabled && (
        <RightPanelShortcut tab="browser" label={t('settings.browser.title')} icon={<Globe className="size-3.5" />} />
      )}
      <RightPanelShortcut tab="branch" label={t('chat.message.flow.title')} icon={<GitBranch className="size-3.5" />} />
      <RightPanelShortcut
        tab="annotations"
        label={t('webview.annotation.title')}
        icon={<Notebook className="size-3.5" />}
      />
      <RightPanelShortcut tab={TRACE_PANE_ID} label={t('trace.label')} icon={<Activity className="size-3.5" />} />
    </>
  )
}

export const TopicRightPane = {
  Scope: TopicRightPaneProvider,
  Viewport: TopicRightPaneViewport,
  Shortcuts: TopicRightPaneShortcuts
} satisfies RightPanelComposition
