/**
 * Fold the Session event window into renderable conversation rows. The rxlab
 * conversation is a minimal surface row projection: user text, assistant text
 * (+ reasoning), and tool cards assembled from the paired `tool/call` →
 * `tool/result` events. Every other event type (turn/step boundaries, live
 * transient chunks, assistant attempts, headers) stays out of the rows —
 * lifecycle state renders from the Session snapshot instead.
 */
import type { SessionEventLikeEntry } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'

/** A user prompt row: visible text plus a count of non-text attachments. */
export interface UserRow {
  readonly kind: 'user'
  readonly seq: number
  readonly text: string
  readonly attachmentCount: number
}

/** One settled assistant reply. */
export interface AssistantRow {
  readonly kind: 'assistant'
  readonly seq: number
  readonly text: string
  readonly reasoning: string
  readonly interrupted: boolean
}

/** A tool execution card, completed once its result event arrives. */
export interface ToolRow {
  readonly kind: 'tool'
  readonly seq: number
  readonly callId: string
  readonly name: string
  /** Raw JSON arguments exactly as the model produced them. */
  readonly argumentsText: string
  readonly resultText: string
  readonly error: { readonly name: string; readonly code: string } | null
  readonly completed: boolean
}

export type TranscriptRow = UserRow | AssistantRow | ToolRow

/** Concatenate the plain-text blocks of a message. */
export function textOf(blocks: readonly ContentBlock[]): string {
  let out = ''
  for (const block of blocks) {
    if (block.type === 'text' && block.text.length > 0) {
      out += out.length === 0 ? block.text : `\n${block.text}`
    }
  }
  return out
}

/** Concatenate the reasoning blocks of a message. */
export function reasoningOf(blocks: readonly ContentBlock[]): string {
  let out = ''
  for (const block of blocks) {
    if (block.type === 'reasoning' && block.text.length > 0) {
      out += out.length === 0 ? block.text : `\n${block.text}`
    }
  }
  return out
}

function attachmentCountOf(blocks: readonly ContentBlock[]): number {
  let count = 0
  for (const block of blocks) {
    if (block.type === 'image' || block.type === 'file') count += 1
  }
  return count
}

/**
 * Fold an event-window snapshot into ordered conversation rows.
 * @param entries - contiguous event-window entries.
 * @returns the row projection in seq order.
 */
export function foldTranscript(entries: readonly SessionEventLikeEntry[]): TranscriptRow[] {
  const rows: TranscriptRow[] = []
  const openTools = new Map<string, number>()
  for (const entry of entries) {
    if (entry.type !== 'event') continue
    const event = entry.event
    switch (event.type) {
      case 'user/message': {
        const content = event.data.content
        rows.push({
          kind: 'user',
          seq: Number(event.seq),
          text: textOf(content),
          attachmentCount: attachmentCountOf(content),
        })
        break
      }
      case 'assistant/message': {
        const content = event.data.message.content
        rows.push({
          kind: 'assistant',
          seq: Number(event.seq),
          text: textOf(content),
          reasoning: reasoningOf(content),
          interrupted: event.data.interrupted === true,
        })
        break
      }
      case 'tool/call': {
        const index = rows.length
        rows.push({
          kind: 'tool',
          seq: Number(event.seq),
          callId: event.data.callId,
          name: event.data.name,
          argumentsText: event.data.arguments,
          resultText: '',
          error: null,
          completed: false,
        } as ToolRow)
        openTools.set(event.data.callId, index)
        break
      }
      case 'tool/result': {
        const block = event.data.message.content[0]
        if (block?.type !== 'tool-result') break
        const callId = block.toolCallId
        const index = openTools.get(callId)
        if (index === undefined) break
        const row = rows[index]
        if (row === undefined || row.kind !== 'tool') break
        openTools.delete(callId)
        rows[index] = {
          ...row,
          completed: true,
          resultText: textOf(block.content),
          ...(event.data.error === undefined
            ? {}
            : { error: { name: event.data.error.name, code: event.data.error.code } }),
        }
        break
      }
      default:
        break
    }
  }
  return rows
}
