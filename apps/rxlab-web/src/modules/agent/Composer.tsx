import { useState } from 'react'
import { ArrowUp, CircleAlert, Loader2, Square } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { ModelCatalog } from '@deepseek-ai/dsh-api-session-controller/types'
import type { RxlabClientRuntime } from './client'
import { selectSessionModel } from './use-model-catalog'
import type { SessionView } from './use-sessions'

/** Flatten the catalog into `provider/model` row values. */
function rowsOf(catalog: ModelCatalog): { readonly value: string; readonly provider: string; readonly model: string }[] {
  const rows: { value: string; provider: string; model: string }[] = []
  for (const group of catalog.groups) {
    for (const model of group.models) {
      rows.push({ value: `${group.id}/${model.id}`, provider: group.id, model: model.id })
    }
  }
  return rows
}

/** Default row value matching the catalog's default selection. */
function defaultValueOf(catalog: ModelCatalog): string {
  return `${catalog.default.provider}/${catalog.default.model}`
}

export interface ComposerProps {
  readonly runtime: RxlabClientRuntime
  readonly view: SessionView
  readonly connected: boolean
  readonly modelState: {
    readonly status: 'idle' | 'loading' | 'ready' | 'error'
    readonly catalog?: ModelCatalog
    readonly error?: string
    readonly reload: () => void
  }
}

/** Bottom composer: model row, prompt input, send/cancel, queue + error banner. */
export function Composer({ runtime, view, connected, modelState }: ComposerProps) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [model, setModel] = useState<string | undefined>(undefined)

  const { face, snapshot } = view
  const catalogRows = modelState.catalog === undefined ? [] : rowsOf(modelState.catalog)
  const modelValue = model ?? (modelState.catalog === undefined ? undefined : defaultValueOf(modelState.catalog))

  const promptError = snapshot.promptError
  const canSend = connected && !snapshot.running && !sending && text.trim().length > 0

  const submit = async (): Promise<void> => {
    const promptText = text.trim()
    if (promptText.length === 0 || !connected || snapshot.running || sending) return
    setSending(true)
    setLocalError(null)
    setText('')
    try {
      const handle = face.beginSubmission({ mode: 'queue', text: promptText, attachments: [] })
      const result = await face.prompt([{ type: 'text', text: promptText }], 'queue', undefined, handle.requestId)
      if (!result.ok) {
        handle.abandon()
        setLocalError(`${result.error.code}: ${result.error.message}`)
      }
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSending(false)
    }
  }

  const cancel = async (): Promise<void> => {
    setLocalError(null)
    const result = await face.cancel()
    if (!result.ok) setLocalError(`${result.error.code}: ${result.error.message}`)
  }

  const changeModel = async (value: string): Promise<void> => {
    const [provider, ...rest] = value.split('/')
    if (provider === undefined) return
    const selectedModel = rest.join('/')
    setLocalError(null)
    setModel(value)
    const selection = await selectSessionModel(runtime, view.sessionId, {
      provider,
      model: selectedModel,
    })
    if (selection === undefined) setLocalError('模型选择失败')
  }

  return (
    <div className="border-t bg-background px-4 py-3">
      {promptError !== null ? (
        <div className="mb-2 flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {promptError.op === 'send' ? '发送失败：' : '停止失败：'}
            {promptError.error.code}: {promptError.error.message}
          </span>
        </div>
      ) : null}
      {localError !== null ? (
        <div className="mb-2 flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span className="whitespace-pre-wrap">{localError}</span>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Select
            value={modelValue}
            disabled={modelState.status !== 'ready' || snapshot.running}
            onValueChange={(value) => { void changeModel(value) }}
          >
            <SelectTrigger className="h-8 w-auto gap-1 text-xs" aria-label="模型">
              <SelectValue placeholder="模型">
                {modelState.status === 'ready' && modelValue !== undefined ? modelValue : '模型'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {modelState.status === 'error' ? (
                <button
                  type="button"
                  className="w-full px-2 py-1.5 text-left text-xs text-destructive"
                  onClick={modelState.reload}
                >
                  加载失败，点击重试：{modelState.error}
                </button>
              ) : null}
              {modelState.status === 'loading' ? (
                <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  模型目录加载中…
                </div>
              ) : null}
              {modelState.status === 'ready' && catalogRows.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">暂无可用模型</div>
              ) : null}
              {modelState.status === 'ready' && modelState.catalog !== undefined
                ? (
                  modelState.catalog.groups.map(group => (
                    <SelectGroup key={group.id}>
                      <SelectLabel>{group.name}</SelectLabel>
                      {group.models.map(model => (
                        <SelectItem key={model.id} value={`${group.id}/${model.id}`}>
                          {model.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))
                )
                : null}
            </SelectContent>
          </Select>
        </div>
        {snapshot.queue.length > 0 ? (
          <span className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground">
            {snapshot.queue.length} 条排队
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex items-end gap-2">
        <Textarea
          className="min-h-16 flex-1 resize-none"
          placeholder={connected ? '输入消息，Enter 发送，Shift+Enter 换行' : '等待连接…'}
          value={text}
          disabled={!connected || snapshot.running}
          onChange={(event) => { setText(event.target.value) }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void submit()
            }
          }}
        />
        {snapshot.running
          ? (
            <Button
              size="icon"
              variant="outline"
              onClick={() => { void cancel() }}
              disabled={!connected}
              aria-label="停止生成"
              className="size-10 shrink-0"
            >
              <Square className="size-4" />
            </Button>
          )
          : (
            <Button
              size="icon"
              className="size-10 shrink-0"
              onClick={() => { void submit() }}
              disabled={!canSend}
              aria-label="发送消息"
            >
              {sending ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
            </Button>
          )}
      </div>
      {!connected ? (
        <p className="mt-1 text-right text-[11px] text-muted-foreground">连接未建立，暂不能发送。</p>
      ) : null}
    </div>
  )
}
