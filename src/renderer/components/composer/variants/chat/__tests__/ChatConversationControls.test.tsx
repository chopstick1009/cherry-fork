import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ChatConversationControls } from '../ChatConversationControls'

vi.mock('@renderer/components/cherryCloud/CherryCloudModelSelector', () => ({
  CherryCloudModelSelector: ({ trigger }: { trigger: React.ReactNode }) => trigger
}))

const renderControls = () =>
  render(
    <ChatConversationControls
      assistantId="assistant-1"
      assistantName="Translator"
      providers={[]}
      mentionedModels={[]}
      mentionedModelSelectorValue={[]}
      lockedMentionedModels={[]}
      mentionedModelMultiSelectMode={false}
      selectModelLabel="Select model"
      shouldAutoSelectCreatedAssistant={false}
      assistantTriggerAction="edit"
      side="bottom"
      onAssistantChange={vi.fn()}
      onModelSelect={vi.fn()}
      onMentionedModelsSelect={vi.fn()}
      onMentionedModelMultiSelectModeChange={vi.fn()}
      onMentionedModelSelectorRestore={vi.fn()}
    />
  )

describe('ChatConversationControls', () => {
  it('keeps the assistant name without repeating its avatar', () => {
    renderControls()

    const trigger = screen.getByRole('button', { name: /Translator/ })
    expect(trigger).toHaveTextContent('Translator')
    expect(trigger.querySelector('img')).toBeNull()
    expect(trigger.querySelector('svg')).toBeNull()
  })
})
