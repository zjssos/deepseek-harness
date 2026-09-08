/**
 * Fold the Session event window into renderable conversation rows. The rxlab
 * conversation is a minimal surface row projection: user text, assistant text
 * (+ reasoning), tool cards assembled from the paired `tool/call` →
 * `tool/result` events, and collapsed context rows for every non-user
 * `user/message` injection (workspace instructions, skill catalogs, …). Every
 * other event type (turn/step boundaries, live transient chunks, assistant
 * attempts, headers) stays out of the rows — lifecycle state renders from the
 * Session snapshot instead.
 */
import type { SessionEventLikeEntry } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ContentBlock, MessageSource } from '@deepseek-ai/dsh-llm'

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

export type TranscriptRow = UserRow | AssistantRow | ToolRow | ContextRow

/**
 * One non-user `user/message` injection (workspace instructions, skill
 * catalog, plugin notice, …). The model-facing text is kept under the row's
 * disclosure; the collapsed row names only the producer, so preset-assembled
 * context never reads as a user turn.
 */
export interface ContextRow {
  readonly kind: 'context'
  readonly seq: number
  /** Producer label projected from the durable source. */
  readonly label: string
  /** Model-facing plain text, exactly as the message was logged. */
  readonly text: string
}

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

/** Read one non-empty string field off a source record; null for anything else. */
function sourceString(source: object, key: string): string | null {
  const value = (source as Record<string, unknown>)[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** Collect distinct string fields off one member array, in first-seen order. */
function sourceList(source: object, member: string, field: string): string[] {
  const list = (source as Record<string, unknown>)[member]
  if (!Array.isArray(list)) return []
  const seen: string[] = []
  for (const entry of list) {
    if (typeof entry !== 'object' || entry === null) continue
    const value = sourceString(entry, field)
    if (value !== null && !seen.includes(value)) seen.push(value)
  }
  return seen
}

/**
 * Project a non-user message source to the collapsed row's producer label.
 * MessageSourceMap is merge-extensible: known plugin kinds get their natural
 * label, and an unknown kind falls back to its durable kind string.
 * @param source - logged `user/message` source.
 * @returns the producer label shown on the collapsed context row.
 */
export function contextLabel(source: MessageSource): string {
  // Widen first: plugin-added kinds may or may not sit in this build's static
  // union, and every label below reads defensively off the record.
  const kind: string = source.kind
  if (kind === 'plugin') return sourceString(source, 'plugin') ?? kind
  switch (kind) {
    case 'skill-catalog': return '技能目录'
    case 'session-reference': return '会话召回'
    case 'agent-instructions': {
      const paths = sourceList(source, 'changes', 'path')
      return paths.length > 0 ? paths.join(', ') : '工作区指令'
    }
    case 'skill-invocation': return sourceString(source, 'name') ?? '技能'
    // `model`/`tool` sources never ride a user message; any other future
    // producer kind stays visible under its durable kind.
    default: return kind
  }
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
        // `source` tells a human prompt from a preset/plugin injection; only
        // the human turn renders as a user bubble.
        if (event.data.source.kind === 'user') {
          rows.push({
            kind: 'user',
            seq: Number(event.seq),
            text: textOf(content),
            attachmentCount: attachmentCountOf(content),
          })
        } else {
          rows.push({
            kind: 'context',
            seq: Number(event.seq),
            label: contextLabel(event.data.source),
            text: textOf(content),
          })
        }
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
