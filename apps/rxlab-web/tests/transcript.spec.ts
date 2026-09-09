/** foldTranscript row classification: human prompts stay user rows; injections collapse to context rows. */
import { describe, expect, it } from 'vitest'
import type { SessionLiveEventEntry } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import { foldTranscript, textOf } from '../src/modules/agent/transcript'

function at(seq: number, type: string, data: unknown, extra: Record<string, unknown> = {}): SessionLiveEventEntry {
  return {
    type: 'event',
    event: { seq, time: seq * 1000, type, data, ...extra } as unknown as SessionEvent,
  }
}

function userText(seq: number, text: string): SessionLiveEventEntry {
  return at(seq, 'user/message', {
    id: `m-${seq}`,
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  }, { surfaceOp: 'append' })
}

function injection(seq: number, source: Record<string, unknown>, text: string): SessionLiveEventEntry {
  return at(seq, 'user/message', {
    id: `m-${seq}`,
    role: 'user',
    content: [{ type: 'text', text }],
    source,
  }, { surfaceOp: 'append' })
}

describe('foldTranscript', () => {
  it('keeps a human prompt a user row with its attachments counted', () => {
    const rows = foldTranscript([
      userText(1, '帮我查一下'),
      at(2, 'user/message', {
        id: 'm-2',
        role: 'user',
        content: [{ type: 'image', attachment: {} }],
        source: { kind: 'user' },
      }, { surfaceOp: 'append' }),
    ])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ kind: 'user', text: '帮我查一下', attachmentCount: 0 })
    expect(rows[1]).toMatchObject({ kind: 'user', text: '', attachmentCount: 1 })
  })

  it('folds an agent-instructions baseline into a collapsed context row labeled by file path', () => {
    const text = '<system-reminder>\nInstructions from: AGENTS.md\n\nrule\n</system-reminder>'
    const rows = foldTranscript([
      injection(4, {
        kind: 'agent-instructions',
        form: 'instructions',
        baseline: true,
        changes: [{ action: 'set', path: 'AGENTS.md', digest: 'd1' }],
      }, text),
    ])
    expect(rows).toEqual([
      { kind: 'context', seq: 4, label: 'AGENTS.md', text },
    ])
  })

  it('labels plugin, skill-catalog, and skill-invocation sources from the durable source', () => {
    const rows = foldTranscript([
      injection(1, { kind: 'plugin', plugin: 'compact' }, 'compacted'),
      injection(2, { kind: 'skill-catalog', form: 'catalog', entries: [] }, '<available_skills>'),
      injection(3, { kind: 'skill-invocation', name: 'pdf', form: 'notice', summary: 'loaded' }, 'skill text'),
      injection(4, { kind: 'totally-new-producer' }, 'mystery'),
    ])
    expect(rows.map(row => row.kind === 'context' ? row.label : row.kind))
      .toEqual(['compact', '技能目录', 'pdf', 'totally-new-producer'])
  })

  it('reads only the first-seen path per agent-instructions change list', () => {
    const rows = foldTranscript([
      injection(1, {
        kind: 'agent-instructions',
        changes: [{ action: 'set', path: 'AGENTS.md' }, { action: 'replace', path: 'AGENTS.md' }, { action: 'set', path: 'CLAUDE.md' }],
      }, 'text'),
      injection(2, { kind: 'agent-instructions', changes: 'not-a-list' }, 'text2'),
    ])
    expect(rows.map(row => row.kind === 'context' ? row.label : row.kind)).toEqual(['AGENTS.md, CLAUDE.md', '工作区指令'])
  })

  it('still folds tool call/result pairs and assistant messages', () => {
    const rows = foldTranscript([
      userText(1, 'go'),
      at(2, 'assistant/message', {
        message: { id: 'a-1', role: 'assistant', content: [{ type: 'text', text: 'working' }], source: { kind: 'model' } },
        interrupted: false,
      }),
      at(3, 'tool/call', { turn: 1, step: 1, callId: 'call-1', name: 'read', arguments: '{}' }),
      at(4, 'tool/result', {
        turn: 1,
        step: 1,
        message: {
          id: 't-1',
          role: 'user',
          content: [{ type: 'tool-result', toolCallId: 'call-1', content: [{ type: 'text', text: 'file bytes' }] }],
          source: { kind: 'tool', callId: 'call-1' },
        },
      }),
    ])
    expect(rows.map(row => row.kind)).toEqual(['user', 'assistant', 'tool'])
    expect(rows[2]).toMatchObject({ name: 'read', completed: true, resultText: 'file bytes' })
  })

  it('joins multi-block message text with line breaks in order', () => {
    expect(textOf([
      { type: 'text', text: 'a' },
      { type: 'text', text: 'b' },
    ])).toBe('a\nb')
  })
})
