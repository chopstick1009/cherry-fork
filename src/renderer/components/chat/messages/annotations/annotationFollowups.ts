import { formatQuoteTokenPromptText } from '@renderer/components/composer/quoteToken'
import type { Annotation } from '@shared/data/types/annotation'

export function getLatestAssistantFollowups(
  annotations: readonly Annotation[],
  latestAssistantMessageId: string | null
): Annotation[] {
  if (!latestAssistantMessageId) return []
  return annotations.filter(
    (annotation) => annotation.kind === 'followup' && annotation.messageId === latestAssistantMessageId
  )
}

export function formatFollowupImport(
  annotation: Annotation,
  position: { turn: number; messageSeq: number }
): { label: string; description: string; promptText: string } {
  const question = annotation.content ?? ''
  const description = [
    '\u3010\u88ab\u5f15\u7528\u6d88\u606f\u7684\u5b9a\u4f4d\u4fe1\u606f\u3011',
    `\u89d2\u8272=${annotation.role}\uff1b`,
    `\u8f6e\u6b21=${position.turn}\uff1b`,
    `\u6d88\u606f\u5e8f\u53f7=${position.messageSeq}\uff1b`,
    `\u6d88\u606fID=${annotation.messageId}\uff1b`,
    `\u9009\u533a\u4f4d\u7f6e=[${annotation.start},${annotation.end})\uff1b`,
    '',
    '\u3010\u88ab\u5f15\u7528\u7684\u52a9\u624b\u56de\u590d\u7247\u6bb5\u3011',
    annotation.exact,
    '',
    '\u3010\u7528\u6237\u8ffd\u95ee\u3011',
    question
  ].join('\n')

  return {
    label: annotation.exact,
    description,
    promptText: formatQuoteTokenPromptText(description)
  }
}
