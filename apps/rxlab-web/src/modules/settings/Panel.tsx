/**
 * 全局设置 workbench: 工作空间概况、各模块状态一览、Agent 预设管理。
 *
 * Agent 接入商 / Key 配置已移到 Agent 模块对话框（ModelSettingsDialog），
 * 这里只保留模块概况和预设管理，不再重复暴露 llm-deepseek / agent-default-model
 * 的详细字段编辑。zh copy until the app gains a locale dictionary.
 */
import { useMemo, useState } from 'react'
import { CircleAlert, Download, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PanelHeader } from '@/components/panel-header'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import type { AgentPresetRow } from '@deepseek-ai/dsh-agent-presets/types'
// Type-only: pulls the generated `remote.rxlabBackup` namespace declarations
// into the ClientRemote type shared with the rest of the workbench.
import type {} from '@deepseek-ai/dsh-rxlab-backup/remote'
import type { BackupBundle } from '@deepseek-ai/dsh-rxlab-backup/types'
import type { ModulePanelProps } from '@/modules/types'
import { MODULES } from '@/modules/registry'
import { useConnected, useRxlabClient } from '@/rxlab/use-sessions'
import type { RxlabClientRuntime } from '@/rxlab/client'
import { WorkspaceInfoBlock } from '@/rxlab/settings-form/WorkspaceInfoBlock'
import {
  AGENT_PRESETS_NAMESPACE, copyPreset, deletePreset, setDefaultPreset,
  useModuleAgents, usePresetRoster, useSettingsDescribe, useWorkspaceRoot,
} from '@/rxlab/use-settings'

/* ── Module overview tab ─────────────────────────────────────────────── */

function ModuleOverviewTab({
  runtime, connected,
}: { runtime: RxlabClientRuntime | undefined; connected: boolean }) {
  const { state, reload } = useSettingsDescribe(runtime, connected)
  const workspaceRoot = useWorkspaceRoot(runtime, connected)
  const moduleAgents = useModuleAgents(runtime, connected)

  if (runtime === undefined || !connected) {
    return <p className="text-sm text-muted-foreground">数据层未就绪。</p>
  }
  if (state.status === 'loading') {
    return <div className="flex flex-col gap-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
  }
  if (state.status === 'error') {
    return (
      <div className="flex items-start gap-2 text-sm text-destructive">
        <CircleAlert className="mt-0.5 size-4 shrink-0" />
        <span>读取设置失败：{state.message}</span>
      </div>
    )
  }

  const sessionDirOf = (moduleId: string): string => {
    const config = moduleAgents[moduleId]
    return config === undefined ? '工作空间根目录' : `工作空间/${config.subdir}`
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {state.value.writable ? '设置文件：settings-rxlab.yaml' : '当前部署为只读。'}
        </p>
        <Button size="sm" variant="outline" onClick={reload}>
          <RefreshCw data-icon="inline-start" />刷新
        </Button>
      </div>

      {/* 工作空间 */}
      {workspaceRoot !== undefined ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">工作空间</CardTitle>
          </CardHeader>
          <CardContent>
            <WorkspaceInfoBlock rows={[{ label: '根目录', value: workspaceRoot, mono: true }]} />
          </CardContent>
        </Card>
      ) : null}

      {/* 各模块概况 */}
      {MODULES.filter(module => module.id !== 'settings').map((module) => {
        const active = module.status === 'active'
        return (
          <Card key={module.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <module.icon className="size-4 text-muted-foreground" />
                <CardTitle className="text-sm">{module.label}</CardTitle>
                <Badge variant={active ? 'secondary' : 'outline'}>{active ? '已接入' : '规划中'}</Badge>
              </div>
              <CardDescription className="line-clamp-1">{module.tagline}</CardDescription>
            </CardHeader>
            <CardContent>
              <WorkspaceInfoBlock
                rows={[
                  { label: '会话目录', value: sessionDirOf(module.id), mono: true },
                  { label: '模块范围', value: `${module.scope.length} 项` },
                ]}
              />
              {module.id === 'agent' ? (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  接入商和 Key 请在 Agent 面板的设置对话框中管理。
                </p>
              ) : !active ? (
                <p className="mt-2 text-[11px] text-muted-foreground">模块规划中，接入后再提供设置。</p>
              ) : null}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

/* ── Preset management tab ───────────────────────────────────────────── */

function PresetTab({
  runtime, connected,
}: { runtime: RxlabClientRuntime | undefined; connected: boolean }) {
  const { state, reload } = usePresetRoster(runtime, connected)
  const describe = useSettingsDescribe(runtime, connected)
  const [copyOpen, setCopyOpen] = useState<AgentPresetRow | null>(null)
  const [deleting, setDeleting] = useState<AgentPresetRow | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const defaultRevision = useMemo(() => {
    if (describe.state.status !== 'ready') return undefined
    return describe.state.value.namespaces.find(ns => ns.ns === AGENT_PRESETS_NAMESPACE)?.revision
  }, [describe.state])

  if (runtime === undefined || !connected) {
    return <p className="text-sm text-muted-foreground">数据层未就绪。</p>
  }
  if (state.status === 'loading') return <Skeleton className="h-24" />
  if (state.status === 'error') {
    return (
      <div className="flex items-start gap-2 text-sm text-destructive">
        <CircleAlert className="mt-0.5 size-4 shrink-0" />
        <span>读取预设失败：{state.message}</span>
      </div>
    )
  }

  const roster = state.value

  const applyNotice = (error: string | undefined, ok: string): void => {
    if (error !== undefined) {
      setNotice(error)
      return
    }
    setNotice(ok)
    reload()
    describe.reload()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          预设管理：设为默认 / 复制 / 删除。
        </p>
        <Button size="sm" variant="outline" onClick={reload}>
          <RefreshCw data-icon="inline-start" />刷新
        </Button>
      </div>
      {notice !== null ? <p className="text-xs text-muted-foreground">{notice}</p> : null}
      {roster.presets.map(row => (
        <Card key={row.id}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm">
                {row.name ?? row.id}
                <span className="ml-2 font-mono text-xs text-muted-foreground">{row.id}</span>
              </CardTitle>
              <div className="flex shrink-0 items-center gap-1">
                <Badge variant={row.trust === 'system' ? 'secondary' : 'outline'}>
                  {row.trust === 'system' ? '内置' : '本地'}
                </Badge>
                {row.isDefault ? <Badge>默认</Badge> : null}
                {row.broken !== undefined ? <Badge variant="destructive">损坏</Badge> : null}
              </div>
            </div>
            {row.description !== undefined ? (
              <CardDescription className="line-clamp-2">{row.description}</CardDescription>
            ) : null}
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            {!row.isDefault && row.broken === undefined ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => { void setDefaultPreset(runtime, row.id, defaultRevision).then((error) => { applyNotice(error, `已将默认预设设为 ${row.id}`) }) }}
              >
                设为默认
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={() => { setCopyOpen(row) }}>
              <Plus data-icon="inline-start" />复制
            </Button>
            {row.trust === 'user' ? (
              <Button size="sm" variant="ghost" onClick={() => { setDeleting(row) }}>
                <Trash2 data-icon="inline-start" />删除
              </Button>
            ) : null}
            {row.broken !== undefined ? <p className="text-xs text-destructive">{row.broken}</p> : null}
          </CardContent>
        </Card>
      ))}
      <CopyDialog
        runtime={runtime}
        source={copyOpen}
        onClose={() => { setCopyOpen(null) }}
        onCopied={(error) => { applyNotice(error, '预设已复制。') }}
      />
      <DeleteDialog
        runtime={runtime}
        target={deleting}
        onClose={() => { setDeleting(null) }}
        onDeleted={(error) => { applyNotice(error, '预设已删除。') }}
      />
    </div>
  )
}

/* ── Dialogs ─────────────────────────────────────────────────────────── */

function CopyDialog({
  runtime, source, onClose, onCopied,
}: {
  runtime: RxlabClientRuntime
  source: AgentPresetRow | null
  onClose: () => void
  onCopied: (error: string | undefined) => void
}) {
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open={source !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>复制预设</DialogTitle>
          <DialogDescription>从 {source?.id} 复制一份到本地可写目录。</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="copy-id">新预设 id</Label>
            <Input id="copy-id" value={id} onChange={(event) => { setId(event.target.value) }} placeholder="my-preset" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="copy-name">显示名（可选）</Label>
            <Input id="copy-name" value={name} onChange={(event) => { setName(event.target.value) }} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button
            disabled={busy || source === null || id.trim() === ''}
            onClick={() => {
              if (source === null) return
              setBusy(true)
              void copyPreset(runtime, source.id, id.trim(), name.trim() === '' ? undefined : name.trim())
                .then((error) => {
                  setBusy(false)
                  onCopied(error)
                  if (error === undefined) onClose()
                })
            }}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}复制
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteDialog({
  runtime, target, onClose, onDeleted,
}: {
  runtime: RxlabClientRuntime
  target: AgentPresetRow | null
  onClose: () => void
  onDeleted: (error: string | undefined) => void
}) {
  return (
    <AlertDialog open={target !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除预设</AlertDialogTitle>
          <AlertDialogDescription>删除本地预设 {target?.id}？内置预设不可删除。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (target === null) return
              void deletePreset(runtime, target.id).then((error) => {
                onDeleted(error)
                if (error === undefined) onClose()
              })
            }}
          >
            删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/* ── Data backup tab ─────────────────────────────────────────────────── */

/** Local-time `yyyyMMdd-HHmm` stamp for the download file name. */
function backupStamp(now: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${String(now.getFullYear())}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
}

function DataBackupTab({
  runtime, connected,
}: { runtime: RxlabClientRuntime | undefined; connected: boolean }) {
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (runtime === undefined || !connected) {
    return <p className="text-sm text-muted-foreground">数据层未就绪。</p>
  }
  const backup = runtime.remote.rxlabBackup
  if (backup === undefined) {
    return <p className="text-sm text-muted-foreground">命名空间未就绪，需重启 dsh rxlab。</p>
  }

  const onExport = (): void => {
    setBusy(true)
    setError(null)
    setNotice(null)
    void backup.export({}).then((result) => {
      setBusy(false)
      if (!result.ok) {
        setError(`${result.error.code}: ${result.error.message}`)
        return
      }
      const bundle = result.value.bundle
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `rxlab-backup-${backupStamp(new Date())}.json`
      anchor.click()
      URL.revokeObjectURL(url)
      setNotice(`已导出 ${bundle.records.length} 条记录。`)
    }).catch((cause: unknown) => {
      setBusy(false)
      setError(cause instanceof Error ? cause.message : String(cause))
    })
  }

  const onImport = (file: File): void => {
    setBusy(true)
    setError(null)
    setNotice(null)
    void file.text().then((text) => {
      const bundle = JSON.parse(text) as BackupBundle
      return backup.import({ bundle })
    }).then((result) => {
      setBusy(false)
      if (!result.ok) {
        setError(`${result.error.code}: ${result.error.message}`)
        return
      }
      setNotice(`已写入 ${result.value.written} 条，跳过 ${result.value.skipped} 条。导入需重启 dsh rxlab 后生效。`)
    }).catch((cause: unknown) => {
      setBusy(false)
      setError(cause instanceof Error ? cause.message : String(cause))
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        导出或导入工作空间的全部业务数据（rxlab_* 存储域）。
      </p>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">导出全部数据</CardTitle>
          <CardDescription>把工作空间业务数据打包为一个 JSON 文件下载。</CardDescription>
        </CardHeader>
        <CardContent>
          <Button size="sm" variant="outline" disabled={busy} onClick={onExport}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Download data-icon="inline-start" />}
            导出全部数据
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">导入数据</CardTitle>
          <CardDescription>选择此前导出的 JSON bundle 写回工作空间；导入后需重启 dsh rxlab 生效。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Input
            type="file"
            accept="application/json"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file !== undefined) onImport(file)
              event.target.value = ''
            }}
          />
          {notice !== null ? <p className="text-xs text-muted-foreground">{notice}</p> : null}
          {error !== null ? (
            <div className="flex items-start gap-2 text-sm text-destructive">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

/* ── Root panel ──────────────────────────────────────────────────────── */

export default function SettingsPanel(props: ModulePanelProps) {
  const { runtime } = useRxlabClient()
  const connected = useConnected(runtime)

  if (runtime === undefined) {
    return <div className="flex flex-col gap-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
  }

  return (
    <div className="flex flex-col gap-(--workbench-panel-gap)">
      <PanelHeader
        icon={props.module.icon}
        title={props.module.label}
        description={props.module.tagline}
      />
      <ScrollArea className="h-(--workbench-full-height)">
        <Tabs defaultValue="modules">
          <TabsList>
            <TabsTrigger value="modules">模块概况</TabsTrigger>
            <TabsTrigger value="presets">Agent 预设</TabsTrigger>
            <TabsTrigger value="data">数据</TabsTrigger>
          </TabsList>
          <TabsContent value="modules" className="mt-3">
            <ModuleOverviewTab runtime={runtime} connected={connected} />
          </TabsContent>
          <TabsContent value="presets" className="mt-3">
            <PresetTab runtime={runtime} connected={connected} />
          </TabsContent>
          <TabsContent value="data" className="mt-3">
            <DataBackupTab runtime={runtime} connected={connected} />
          </TabsContent>
        </Tabs>
      </ScrollArea>
    </div>
  )
}
