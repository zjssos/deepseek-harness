import { useEffect, useMemo, useState } from 'react'
import {
  Check,
  CircleAlert,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  Zap,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { RxlabClientRuntime } from '@/rxlab/client'
import {
  clearCredential,
  setCredential,
  useCredential,
} from '@/rxlab/use-credentials'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { updateNamespace, useSettingsDescribe } from '@/rxlab/use-settings'

export interface ModelSettingsDialogProps {
  readonly runtime: RxlabClientRuntime
  readonly connected: boolean
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  /** Reload the model catalog after a provider switch or key save. */
  readonly onProviderChanged?: () => void
}

/** Known provider presets for the quick-switch cards. */
interface ProviderPreset {
  readonly id: string
  readonly label: string
  readonly description: string
  /** `agent-default-model` provider value. */
  readonly provider: string
  /** `agent-default-model` model value. */
  readonly model: string
  /** Credential reference for the API key. */
  readonly credentialRef: string
  /**
   * Extra settings writes required to activate this provider's adapter.
   * Each entry is `[namespace, patch]`. DeepSeek needs nothing (always
   * active); OpenCode Go must populate the `llm-pi-ai` providers dict.
   */
  readonly activationWrites: readonly ActivationWrite[]
}

interface ActivationWrite {
  readonly ns: string
  readonly patch: Record<string, JsonValue>
}

const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek 官方',
    description: '直连 api.deepseek.com，模型参数由 DeepSeek 下发。',
    provider: 'deepseek-official',
    model: 'deepseek-v4-flash',
    credentialRef: 'DEEPSEEK_API_KEY',
    activationWrites: [],
  },
  {
    id: 'opencode-go',
    label: 'OpenCode Go',
    description: '国内多模型网关（DeepSeek / GLM / Kimi / Qwen 等），模型与参数由 OpenCode 托管。',
    provider: 'opencode-go',
    model: 'deepseek-v4-flash',
    credentialRef: 'OPENCODE_GO_API_KEY',
    activationWrites: [
      {
        ns: 'llm-pi-ai',
        patch: {
          providers: {
            // 主路由：pi-ai 内置 opencode-go 目录（27 个模型），端点、协议由目录下发。
            'opencode-go': {
              apiKeyEnv: 'OPENCODE_GO_API_KEY',
            },
            // 补充路由：pi-ai 目录暂未收录的 completions 协议模型。
            'opencode-go-ext-cc': {
              displayName: 'OpenCode Go (补充·CC)',
              apiKeyEnv: 'OPENCODE_GO_API_KEY',
              api: 'openai-completions',
              baseURL: 'https://opencode.ai/zen/go/v1',
              models: [
                { id: 'deepseek-v4.1-flash' },
                { id: 'deepseek-flash' },
                { id: 'glm-5' },
                { id: 'kimi-k2.5' },
                { id: 'mimo-v2.6-flash' },
                { id: 'mimo-v2.6-pro' },
                { id: 'mimo-v2-pro' },
                { id: 'mimo-v2-omni' },
                { id: 'hy3-preview' },
              ],
            },
            // 补充路由：pi-ai 目录暂未收录的 messages 协议模型。
            'opencode-go-ext-msg': {
              displayName: 'OpenCode Go (补充·MSG)',
              apiKeyEnv: 'OPENCODE_GO_API_KEY',
              api: 'anthropic-messages',
              baseURL: 'https://opencode.ai/zen/go',
              models: [
                { id: 'minimax-m2.5' },
                { id: 'qwen3.5-plus' },
              ],
            },
            // 补充路由：pi-ai 目录暂未收录的 responses 协议模型。
            'opencode-go-ext-rsp': {
              displayName: 'OpenCode Go (补充·RSP)',
              apiKeyEnv: 'OPENCODE_GO_API_KEY',
              api: 'openai-responses',
              baseURL: 'https://opencode.ai/zen/go/v1',
              models: [
                { id: 'grok-4.7' },
                { id: 'grok-4.5' },
              ],
            },
          },
        },
      },
    ],
  },
]

/**
 * Agent settings dialog — only two decisions: pick a provider and set its Key.
 * Model catalog, thinking mode, context window, and other parameters are
 * resolved by the provider itself; the Composer model selector handles
 * per-session model overrides.
 *
 * Switching to OpenCode Go also writes the `llm-pi-ai` settings namespace so
 * the dormant adapter wakes up and registers its catalog routes.
 */
export function ModelSettingsDialog({
  runtime, connected, open, onOpenChange, onProviderChanged,
}: ModelSettingsDialogProps) {
  const describe = useSettingsDescribe(runtime, connected)
  const [notice, setNotice] = useState<{ text: string; kind: 'info' | 'error' } | null>(null)

  const activeProvider = useMemo(() => {
    if (describe.state.status !== 'ready') return undefined
    const view = describe.state.value.namespaces.find(ns => ns.ns === 'agent-default-model')
    if (view === undefined) return undefined
    const value = view.value
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
    return (value as Record<string, unknown>).provider as string | undefined
  }, [describe.state])

  const revisionOf = (ns: string): number | undefined => {
    if (describe.state.status !== 'ready') return undefined
    return describe.state.value.namespaces.find(entry => entry.ns === ns)?.revision
  }

  useEffect(() => {
    if (open) {
      describe.reload()
      setNotice(null)
    }
  }, [open, describe.reload])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>接入商</DialogTitle>
          <DialogDescription>
            选择提供方并填入 Key，模型和参数由提供方自动下发。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {PROVIDER_PRESETS.map(preset => (
            <ProviderCard
              key={preset.id}
              runtime={runtime}
              preset={preset}
              active={activeProvider === preset.provider}
              revisionOf={revisionOf}
              onSwitch={() => {
                setNotice({ text: `已切换到 ${preset.label}，模型目录刷新中…`, kind: 'info' })
                describe.reload()
                onProviderChanged?.()
              }}
              onKeySaved={() => {
                setNotice({ text: 'Key 已保存，模型目录刷新中…', kind: 'info' })
                onProviderChanged?.()
              }}
              onError={(message) => { setNotice({ text: message, kind: 'error' }) }}
            />
          ))}
        </div>

        {notice !== null ? (
          <div className={[
            'flex items-start gap-2 rounded-md px-3 py-2 text-xs',
            notice.kind === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-muted/60',
          ].join(' ')}>
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>{notice.text}</span>
          </div>
        ) : null}

        <p className="text-center text-[11px] text-muted-foreground">
          具体模型可在聊天输入框的模型选择器里按会话切换。
        </p>
      </DialogContent>
    </Dialog>
  )
}

/** One provider card: status + credential editor + one-click switch. */
function ProviderCard({
  runtime, preset, active, revisionOf, onSwitch, onKeySaved, onError,
}: {
  readonly runtime: RxlabClientRuntime
  readonly preset: ProviderPreset
  readonly active: boolean
  readonly revisionOf: (ns: string) => number | undefined
  readonly onSwitch: () => void
  readonly onKeySaved: () => void
  readonly onError: (message: string) => void
}) {
  const credential = useCredential(runtime, preset.credentialRef)
  const [secret, setSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [busy, setBusy] = useState(false)

  const switchTo = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      // 1) Write activation settings (e.g. llm-pi-ai provider profile).
      for (const write of preset.activationWrites) {
        const result = await updateNamespace(runtime, write.ns, write.patch, revisionOf(write.ns))
        if (result === null) {
          onError(`激活失败：写入 ${write.ns} 被拒绝。`)
          return
        }
      }
      // 2) Switch the default model provider.
      const result = await updateNamespace(
        runtime,
        'agent-default-model',
        { provider: preset.provider, model: preset.model },
        revisionOf('agent-default-model'),
      )
      if (result !== null) onSwitch()
      else onError('切换失败：写入 agent-default-model 被拒绝。')
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const saveKey = async (): Promise<void> => {
    if (secret.trim().length === 0 || busy) return
    setBusy(true)
    try {
      const ok = await setCredential(runtime, preset.credentialRef, secret.trim())
      if (ok) {
        setSecret('')
        credential.reload()
        onKeySaved()
      } else {
        onError('保存凭据失败。')
      }
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const clearKey = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      const ok = await clearCredential(runtime, preset.credentialRef)
      if (ok) credential.reload()
      else onError('清除凭据失败。')
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={[
        'flex flex-col gap-2.5 rounded-lg border p-3 transition-colors',
        active ? 'border-primary bg-primary/5' : 'hover:border-muted-foreground/30',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Zap className={`size-4 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
          <span className="text-sm font-medium">{preset.label}</span>
        </div>
        {active ? (
          <Badge className="gap-1"><Check className="size-3" />当前</Badge>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs"
            disabled={busy}
            onClick={() => { void switchTo() }}
          >
            {busy ? <Loader2 className="size-3 animate-spin" /> : null}
            切换
          </Button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">{preset.description}</p>

      {/* Key 状态 */}
      <div className="flex items-center gap-2">
        <Badge
          variant={credential.configured ? 'secondary' : 'outline'}
          className="gap-1 text-[10px]"
        >
          {credential.status === 'loading'
            ? <Loader2 className="size-2.5 animate-spin" />
            : credential.configured ? <ShieldCheck className="size-2.5" /> : null}
          {credential.status === 'loading'
            ? '检查中'
            : credential.configured ? 'Key 已配置' : 'Key 未配置'}
        </Badge>
        <span className="font-mono text-[10px] text-muted-foreground">{preset.credentialRef}</span>
      </div>

      {/* Key 编辑 / 清除 */}
      {credential.configured ? (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-fit px-2 text-xs text-muted-foreground"
          disabled={busy}
          onClick={() => { void clearKey() }}
        >
          清除 Key
        </Button>
      ) : (
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <Input
              type={showSecret ? 'text' : 'password'}
              value={secret}
              onChange={(event) => { setSecret(event.target.value) }}
              placeholder="sk-…"
              spellCheck={false}
              autoComplete="off"
              className="h-7 pr-7 font-mono text-[11px]"
              onKeyDown={(event) => { if (event.key === 'Enter') void saveKey() }}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="absolute right-0.5 top-1/2 size-6 -translate-y-1/2"
              onClick={() => { setShowSecret(value => !value) }}
              aria-label={showSecret ? '隐藏' : '显示'}
            >
              {showSecret ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
            </Button>
          </div>
          <Button
            size="sm"
            className="h-7 shrink-0 px-2.5 text-xs"
            disabled={busy || secret.trim().length === 0}
            onClick={() => { void saveKey() }}
          >
            {busy ? <Loader2 className="size-3 animate-spin" /> : null}
            保存
          </Button>
        </div>
      )}
    </div>
  )
}
