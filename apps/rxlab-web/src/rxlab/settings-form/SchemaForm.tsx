/**
 * SchemaForm: schema-friendly editor for one settings namespace. Field order,
 * labels, controls, and select options come from a {@link NamespaceDescriptor}
 * hint map; writes go through `settings/update` with the view's revision so a
 * stale form is refused, and a per-field user override can be removed to
 * re-inherit the composition base. zh copy until the app gains a locale
 * dictionary.
 */
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { SettingsNamespaceView } from '@deepseek-ai/dsh-settings/types'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { RxlabClientRuntime } from '@/rxlab/client'
import { unsetNamespaceField, updateNamespace } from '@/rxlab/use-settings'
import type { NamespaceDescriptor, SettingsFieldHint } from './types'

/** Select value representing "no user override" (Radix items reject empty values). */
const UNSET_SENTINEL = '__unset__'

function recordOf(value: JsonValue): Record<string, JsonValue> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, JsonValue>)
    : null
}

function scalarString(value: JsonValue | undefined): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function displayJson(value: JsonValue | undefined, max = 240): string {
  if (value === undefined) return '—'
  const text = JSON.stringify(value)
  return text.length <= max ? text : `${text.slice(0, max)}…`
}

export interface SchemaFormProps {
  readonly runtime: RxlabClientRuntime
  readonly view: SettingsNamespaceView
  readonly descriptor: NamespaceDescriptor
  /** Called with the fresh namespace view after any committed write. */
  readonly onSaved: (next: SettingsNamespaceView) => void
}

/** Editor rows for every hinted field of one namespace section. */
export function SchemaForm({ runtime, view, descriptor, onSaved }: SchemaFormProps) {
  const record = recordOf(view.value)
  const user = recordOf(view.user ?? null)
  const fields = Object.entries(descriptor.fields)
  if (record === null || fields.length === 0) return null
  return (
    <div className="flex flex-col gap-3">
      {fields.map(([field, hint]) => (
        <FieldEditor
          key={`${descriptor.ns}:${field}`}
          runtime={runtime}
          ns={descriptor.ns}
          field={field}
          hint={hint}
          value={record[field]}
          userOverridden={user !== null && field in user}
          revision={view.revision}
          onSaved={onSaved}
        />
      ))}
    </div>
  )
}

function FieldEditor({
  runtime, ns, field, hint, value, userOverridden, revision, onSaved,
}: {
  runtime: RxlabClientRuntime
  ns: string
  field: string
  hint: SettingsFieldHint
  value: JsonValue | undefined
  userOverridden: boolean
  revision: number
  onSaved: (next: SettingsNamespaceView) => void
}) {
  const [busy, setBusy] = useState(false)

  const commit = async (next: JsonValue): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      const saved = await updateNamespace(runtime, ns, { [field]: next }, revision)
      if (saved !== null) onSaved(saved)
    } finally {
      setBusy(false)
    }
  }

  const unset = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      const saved = await unsetNamespaceField(runtime, ns, field, revision)
      if (saved !== null) onSaved(saved)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-medium">{hint.label}</Label>
        {userOverridden ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-xs text-muted-foreground"
            disabled={busy}
            onClick={() => { void unset() }}
          >
            恢复默认
          </Button>
        ) : null}
      </div>
      <EditorControl hint={hint} value={value} busy={busy} commit={commit} unset={unset} />
      {hint.help !== undefined ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">{hint.help}</p>
      ) : null}
    </div>
  )
}

function EditorControl({
  hint, value, busy, commit, unset,
}: {
  hint: SettingsFieldHint
  value: JsonValue | undefined
  busy: boolean
  commit: (next: JsonValue) => Promise<void>
  unset: () => Promise<void>
}) {
  const options = hint.options ?? []

  if (hint.control === 'readonly') {
    return (
      <code className="w-fit rounded bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">
        {displayJson(value)}
      </code>
    )
  }

  if (hint.control === 'boolean') {
    return (
      <div className="py-0.5">
        <Checkbox
          checked={value === true}
          disabled={busy}
          onCheckedChange={(checked) => { void commit(checked === true) }}
        />
      </div>
    )
  }

  if (hint.control === 'select' && options.length > 0) {
    const hasUnset = options.some(option => option.value === '')
    const current = value === undefined || value === ''
      ? (hasUnset ? UNSET_SENTINEL : undefined)
      : scalarString(value)
    return (
      <Select
        value={current}
        disabled={busy}
        onValueChange={(next) => {
          if (next === UNSET_SENTINEL) void unset()
          else void commit(next)
        }}
      >
        <SelectTrigger className="h-8">
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          {options.map(option => (
            <SelectItem
              key={option.value}
              value={option.value === '' ? UNSET_SENTINEL : option.value}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  return <TextNumberEditor hint={hint} value={value} busy={busy} commit={commit} />
}

function TextNumberEditor({
  hint, value, busy, commit,
}: {
  hint: SettingsFieldHint
  value: JsonValue | undefined
  busy: boolean
  commit: (next: JsonValue) => Promise<void>
}) {
  const [draft, setDraft] = useState<string>(scalarString(value))
  const isNumber = hint.control === 'number'

  const commitDraft = async (): Promise<void> => {
    if (isNumber) {
      const parsed = Number(draft)
      if (Number.isNaN(parsed)) return
      await commit(parsed)
      return
    }
    await commit(draft)
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        className="h-8 flex-1 font-mono text-sm"
        value={draft}
        type={isNumber ? 'number' : 'text'}
        spellCheck={false}
        disabled={busy}
        onChange={(event) => { setDraft(event.target.value) }}
        onKeyDown={(event) => { if (event.key === 'Enter') void commitDraft() }}
      />
      {hint.unit !== undefined ? <span className="shrink-0 text-xs text-muted-foreground">{hint.unit}</span> : null}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 shrink-0"
        disabled={busy}
        onClick={() => { void commitDraft() }}
      >
        保存
      </Button>
    </div>
  )
}
