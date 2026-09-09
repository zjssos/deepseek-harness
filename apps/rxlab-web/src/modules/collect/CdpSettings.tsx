/**
 * CDP 浏览器控制（collect 模块设置区）：读取 `rxlab-collect-browser`
 * settings 分区当前值，展示浏览器/launcher 状态，并就地「打开/停止」由
 * launcher 行启动的真实 CDP 浏览器。zh copy until the app gains a locale
 * dictionary.
 */
import { useCallback, useEffect, useState } from 'react'
import { CircleAlert, Loader2, Play, Square } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type {} from '@deepseek-ai/dsh-rxlab-collect/remote'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { RxlabClientRuntime } from '@/rxlab/client'
import { useSettingsDescribe } from '@/rxlab/use-settings'
import { WorkspaceInfoBlock } from '@/rxlab/settings-form/WorkspaceInfoBlock'

const COLLECT_BROWSER_NAMESPACE = 'rxlab-collect-browser'

function recordOf(value: JsonValue | undefined): Record<string, JsonValue> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, JsonValue>
}

function str(value: JsonValue | undefined): string {
  return typeof value === 'string' ? value : ''
}

export interface CdpSettingsProps {
  readonly runtime: RxlabClientRuntime
  readonly connected: boolean
}

/** Settings-seat CDP browser status + open/stop controls for the collect module. */
export function CdpSettings({ runtime, connected }: CdpSettingsProps) {
  const { state } = useSettingsDescribe(runtime, connected)
  const [status, setStatus] = useState<{
    browser: { launchMode: string; endpointUp: boolean; contextOpen: boolean; cdpEndpoint: string } | null
    launcher: { running: boolean; endpointUp: boolean } | null
  }>({ browser: null, launcher: null })
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  const refresh = useCallback(() => { setNonce(value => value + 1) }, [])

  useEffect(() => {
    if (!connected || runtime.remote.rxlabCollect === undefined) return
    let alive = true
    void runtime.remote.rxlabCollect.browserStatus()
      .then((result) => {
        if (!alive || !result.ok) return
        const value = result.value
        setStatus({
          browser: value.browser === null ? null : {
            launchMode: value.browser.launchMode,
            endpointUp: value.browser.endpointUp,
            contextOpen: value.browser.contextOpen,
            cdpEndpoint: value.browser.cdpEndpoint,
          },
          launcher: value.launcher === null ? null : value.launcher,
        })
      })
      .catch(() => { /* status read degrades to empty on failure */ })
    return () => { alive = false }
  }, [runtime, connected, nonce])

  const values = state.status === 'ready'
    ? recordOf(state.value.namespaces.find(entry => entry.ns === COLLECT_BROWSER_NAMESPACE)?.value)
    : null

  const open = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    setNotice(null)
    try {
      const result = await runtime.remote.rxlabCollect.browserLaunch({
        ...values === null ? {} : {
          executablePath: str(values.executablePath),
          profileDir: str(values.profileDir),
        },
      })
      setNotice(result.ok ? result.value.detail : `${result.error.code}: ${result.error.message}`)
      refresh()
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const stop = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    setNotice(null)
    try {
      const result = await runtime.remote.rxlabCollect.browserStop()
      setNotice(result.ok ? (result.value.stopped ? '已停止 CDP 浏览器。' : '没有本行启动的浏览器进程。') : `${result.error.code}: ${result.error.message}`)
      refresh()
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const endpointUp = status.browser?.endpointUp === true || status.launcher?.endpointUp === true

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium">CDP 浏览器状态</p>
        <Badge variant={endpointUp ? 'secondary' : 'outline'}>
          {endpointUp ? 'CDP 就绪' : '未就绪'}
        </Badge>
      </div>
      <WorkspaceInfoBlock
        rows={[
          { label: '模式', value: status.browser?.launchMode ?? '—', mono: true },
          { label: '端点', value: status.browser?.cdpEndpoint ?? 'http://127.0.0.1:9222', mono: true },
          { label: 'launcher', value: status.launcher === null ? '未装配' : status.launcher.running ? '运行中' : '未运行' },
        ]}
      />
      {notice !== null ? (
        <div className="flex items-start gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span className="whitespace-pre-wrap">{notice}</span>
        </div>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => { void stop() }} disabled={busy || status.launcher?.running !== true}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Square className="size-3.5" />}
          停止
        </Button>
        <Button size="sm" onClick={() => { void open() }} disabled={busy}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
          打开 CDP 浏览器
        </Button>
      </div>
    </div>
  )
}
