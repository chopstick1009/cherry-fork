# Agent Note: Persistent annotations on chat message text

Status: proposed

English | [中文](2026-11-21-chat-message-annotations.zh.md)

## Problem

Chat readers need to retain a small piece of context while reading a conversation. The text-selection toolbar can copy a selection and attach a durable mark or private explanation to selected words. A browser `Range` is tied to one DOM instance, so it cannot survive markdown reconstruction, message streaming, virtual-list recycling, or an application restart.

## Proposal

Store annotations as a dedicated SQLite-backed DataApi resource owned by a topic and one message part. Each record keeps the visible-text UTF-16 range together with the selected text and bounded surrounding context. The renderer uses the exact text first and the surrounding context as a relocation fallback after the message DOM is rebuilt.

The chat message selection toolbar preserves copy, quote, and save-to-notes actions and adds underline, thought, and follow-up actions for eligible message text selections. Underline has no content and renders as a white dashed underline. Thought and follow-up require content. Thought renders with the current theme primary color and follow-up renders as a current-theme translucent highlight. Follow-up content remains an annotation and does not enter the composer, send pipeline, or model execution path.

Annotation controls are available only for a selection wholly contained in one chat message body and one text part. The existing global selection window and selections spanning multiple messages remain outside this feature. Existing marks can be opened to edit their content or deleted. Mark ranges are mounted through CSS Custom Highlight when available, with lifecycle cleanup and re-location on virtual-list remounts.

The service validates topic ownership, message ownership, and role consistency before insert. Topic and message foreign keys cascade annotation cleanup. Renderer mutations refresh the topic annotation query through the DataApi change notification path.

## Alternatives considered

- Storing marks in localStorage or a preference would make them unavailable to other windows and would bypass the application's backup and deletion semantics.
- Storing only DOM ranges would lose annotations whenever markdown or virtualized message DOM is recreated.
- Sending follow-up text through the normal chat composer would turn a reading annotation into an unsolicited model request and violate the requested behavior.

## Consequences

- The database schema gains a durable annotation table and an appended migration.
- Message rendering receives stable message and part metadata for anchor capture and restoration.
- Renderer code owns anchor projection, CSS Highlight lifecycle, and the small edit/delete surface. Main-process services own validation and persistence.
- The anchor remains tied to the message part's visible text. Large edits that remove the selected text can leave an annotation temporarily unresolved until the text returns or the user deletes it.

## Risks

- If message text changes enough that an exact anchor and its surrounding context no longer match, the renderer skips that annotation until the text is restored or the user deletes it.
- CSS Custom Highlight support is required for the visual mark layer. Unsupported runtimes keep the persisted records available while omitting their visual projection.
- Topic soft deletion hides annotations through the service query. Hard deletion uses the database cascade to remove them with the owning topic or message.
## Acceptance criteria

- AC1 — The chat message toolbar preserves copy, quote, and save-to-notes and adds underline, thought, and follow-up for a non-empty selection wholly inside one message body and one text part. Cross-message selections, editable controls, reasoning/tool controls, and the system-level selection window do not create annotations. (verification: renderer unit tests and Electron — chat UI owner)
- AC2 — Underline saves without content and renders a white dashed underline. Thought and follow-up require non-empty content, render with theme tokens, and persist across message reload and application restart. (verification: renderer unit tests, service tests, and Electron — chat UI and data owners)
- AC3 — Every saved mark stores a message-part anchor with UTF-16 start/end, exact text, and bounded prefix/suffix context. Exact matching and context relocation restore marks after markdown reconstruction and virtual-list unmount/remount. (verification: anchor unit tests and Electron — chat UI owner)
- AC4 — Clicking an existing mark opens the supported edit surface. Thought and follow-up can update content, and every annotation kind can be deleted. (verification: renderer unit tests and Electron — chat UI owner)
- AC5 — DataApi list/create/read/update/delete handlers validate topic and message ownership, append migration `0042`, and clean annotations when their topic or message is hard-deleted. (verification: schema, migration, handler, and service tests — data owner)
- AC6 — Saving a follow-up never fills the chat composer, sends a message, or starts model execution. Explicit batch import appends each follow-up on the latest assistant reply as a separate native quote token, using Cherry's blockquote format and a message-square icon. Each quote contains the assistant role, turn, message sequence and ID, selected range, source excerpt, and user follow-up; it appends to the existing draft without sending. (verification: renderer unit tests and Electron — chat UI owner)
- AC7 — Thought and follow-up editors open centered in the available chat workspace, stay within its bounds while dragging, and provide draggable/resizable excerpt and input panes based on DSH; creating or opening a mark reveals the Home annotations pane with that mark selected. (verification: renderer tests and Electron — chat UI owner)
- AC8 — The feature uses i18n labels, accessible controls, and light/dark theme tokens without hard-coded annotation colors. (verification: changed-file lint and Electron in both themes — chat UI owner)
- AC9 — The Home annotations pane is the default right panel. It presents a current-conversation count, one latest-follow-up import action, separator-based entries with the original mark style, annotation content, and a timestamp, plus a DSH-like empty state. (verification: renderer tests and Electron — chat UI owner)
- AC10 — Imported follow-up tokens expose the complete source-location, excerpt, and question text in a scrollable tooltip without a native delete tooltip. (verification: composer token tests and Electron — chat UI owner)

## Verification plan

Run focused shared-schema, service, migration, anchor, toolbar, and message-render tests. Run changed-file typecheck and lint. Use a tracked Electron instance to verify selection, persistence, virtual-list recycling, editing, deletion, light/dark themes, and the absence of follow-up submission side effects.

## Open questions

None. The requested behavior and ownership boundaries are fixed for this implementation.
