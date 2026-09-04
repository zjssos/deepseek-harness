import { useEffect, useState } from 'react'
import { CircleAlert, Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { RxlabClientRuntime } from './client'
import {
  clearCredential,
  DEFAULT_API_KEY_REF,
  setCredential,
  useCredential,
} from './use-credentials'

export interface ModelSettingsDialogProps {
  readonly runtime: RxlabClientRuntime
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

/** Model/API-key settings: edit the DeepSeek credential the host resolves. */
export function ModelSettingsDialog({ runtime, open, onOpenChange }: ModelSettingsDialogProps) {
  const [ref, setRef] = useState(DEFAULT_API_KEY_REF)
  const [secret, setSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const credential = useCredential(runtime, ref)
  const effectiveRef = ref.trim().length > 0 ? ref.trim() : DEFAULT_API_KEY_REF

  // Refresh the described state whenever the dialog opens.
  useEffect(() => {
    if (open) credential.reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const save = async (): Promise<void> => {
    if (secret.trim().length === 0 || busy) return
    setBusy(true)
    setNotice(null)
    try {
      const ok = await setCredential(runtime, effectiveRef, secret.trim())
      if (ok) {
        setSecret('')
        setNotice(`已保存到 ${effectiveRef}（$DSH_HOME/.credentials.yaml），下一条消息即使用该凭据。`)
        credential.reload()
      } else {
        setNotice('保存失败：host 拒绝了该写入（只读部署或凭据服务不可用）。')
      }
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const clear = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    setNotice(null)
    try {
      const ok = await clearCredential(runtime, effectiveRef)
      if (ok) {
        setNotice(`已清除 ${effectiveRef}。`)
        credential.reload()
      } else {
        setNotice('清除失败：host 拒绝了该写入。')
      }
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>模型 / API Key 设置</DialogTitle>
          <DialogDescription>
            配置模型提供方使用的凭据。保存后写入 host 的
            <code className="mx-1 rounded bg-muted px-1 font-mono text-[11px]">$DSH_HOME/.credentials.yaml</code>，
            下一条消息即可使用（无需重启）。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="model-ref">凭据引用（环境变量名）</Label>
            <Input
              id="model-ref"
              value={ref}
              onChange={(event) => { setRef(event.target.value); credential.reload() }}
              spellCheck={false}
              className="font-mono text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              deepseek-official 适配器默认读取 DEEPSEEK_API_KEY；改了名则需与适配器配置一致。
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <Badge variant={credential.configured ? 'secondary' : 'outline'} className="gap-1">
              {credential.status === 'loading'
                ? <Loader2 className="size-3 animate-spin" />
                : credential.configured ? <ShieldCheck className="size-3" /> : null}
              {credential.status === 'loading'
                ? '检查中…'
                : credential.configured ? '已配置' : credential.status === 'error' ? '状态不可用' : '未配置'}
            </Badge>
            {credential.configured
              ? <span className="text-muted-foreground">凭据已存在（值不在此显示）</span>
              : null}
            {credential.error !== undefined && !credential.configured
              ? <span className="text-destructive">describe 失败：{credential.error}</span>
              : null}
          </div>

          {!credential.configured ? (
            <div className="space-y-1.5">
              <Label htmlFor="model-secret">API Key</Label>
              <div className="relative">
                <Input
                  id="model-secret"
                  type={showSecret ? 'text' : 'password'}
                  value={secret}
                  onChange={(event) => { setSecret(event.target.value) }}
                  placeholder="sk-…"
                  spellCheck={false}
                  autoComplete="off"
                  className="pr-9 font-mono text-sm"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="absolute right-1 top-1/2 size-7 -translate-y-1/2"
                  onClick={() => { setShowSecret(value => !value) }}
                  aria-label={showSecret ? '隐藏' : '显示'}
                >
                  {showSecret ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </Button>
              </div>
            </div>
          ) : null}

          {notice !== null ? (
            <div className="flex items-start gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span className="whitespace-pre-wrap">{notice}</span>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          {credential.configured ? (
            <Button variant="outline" onClick={() => { void clear() }} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              清除
            </Button>
          ) : (
            <Button onClick={() => { void save() }} disabled={busy || secret.trim().length === 0}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              保存
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
