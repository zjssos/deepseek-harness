/**
 * 全局设置 workbench: 各模块的 settings 分区（describe 视图驱动的标量编辑）
 * 与 Agent 预设管理（roster 列表/默认/复制/删除）。zh copy until the app gains
 * a locale dictionary; reads and writes the same settings-rxlab.yaml the host
 * owns, so edits apply without a restart for `applies: live` namespaces.
 */
import { useMemo, useState } from 'react'
import { CircleAlert, Loader2, Plus, RefreshCw, Settings, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import type { SettingsNamespaceView } from '@deepseek-ai/dsh-settings/types'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { ModulePanelProps } from '@/modules/types'
import { MODULES } from '@/modules/registry'
import { useConnected, useRxlabClient } from '@/rxlab/use-sessions'
import type { RxlabClientRuntime } from '@/rxlab/client'
import { SettingsSection } from '@/rxlab/settings-form/AgentSettingsSection'
import { WorkspaceInfoBlock } from '@/rxlab/settings-form/WorkspaceInfoBlock'
import {
  AGENT_PRESETS_NAMESPACE, copyPreset, deletePreset, setDefaultPreset,
  updateNamespace, unsetNamespaceField, useModuleAgents, usePresetRoster,
  useSettingsDescribe, useWorkspaceRoot,
} from '@/rxlab/use-settings'
import { MODULE_NAMESPACE_SECTIONS, namespaceSectionsOf } from './module-settings'
import { CdpSettings } from '@/modules/collect/CdpSettings'

const NAMESPACE_LABELS: Record<string, string> = {
  'llm-deepseek': 'DeepSeek 模型',
  'llm-pi-ai': 'PI-AI 模型',
  'agent-presets': 'Agent 预设',
  'web': 'Web 搜索 / 抓取',
  'permission-presets': '权限预设',
  'rxlab-workspace': '工作台工作空间',
}

function namespaceLabel(ns: string): string {
  return NAMESPACE_LABELS[ns] ?? ns
}

function asRecord(value: JsonValue): Record<string, JsonValue> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value
    : null
}

type Scalar =
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'boolean'; readonly value: boolean }
  | { readonly kind: 'other' }

function scalarOf(value: JsonValue): Scalar {
  if (typeof value === 'string') return { kind: 'string', value }
  if (typeof value === 'number') return { kind: 'number', value }
  if (typeof value === 'boolean') return { kind: 'boolean', value }
  return { kind: 'other' }
}

function FieldEditor({
  runtime, view, field, value, userOverridden, onSaved,
}: {
  runtime: RxlabClientRuntime
  view: SettingsNamespaceView
  field: string
  value: JsonValue
  userOverridden: boolean
  onSaved: (next: SettingsNamespaceView) => void
}) {
  const scalar = scalarOf(value)
  const [draft, setDraft] = useState<string>(scalar.kind === 'string' ? scalar.value : scalar.kind === 'number' ? String(scalar.value) : '')
  const [busy, setBusy] = useState(false)

  if (scalar.kind === 'other') {
    return (
      <div className="flex items-center justify-between gap-3 py-2">
        <span className="font-mono text-xs text-muted-foreground">{field}</span>
        <code className="min-w-0 truncate font-mono text-xs text-muted-foreground">{JSON.stringify(value)}</code>
      </div>
    )
  }

  if (scalar.kind === 'boolean') {
    const save = async (next: boolean): Promise<void> => {
      setBusy(true)
      const saved = await updateNamespace(runtime, view.ns, { [field]: next }, view.revision)
      setBusy(false)
      if (saved !== null) onSaved(saved)
    }
    return (
      <div className="flex items-center justify-between gap-3 py-2">
        <Label className="font-mono text-xs text-muted-foreground">{field}</Label>
        <Checkbox
          checked={scalar.value}
          disabled={busy}
          onCheckedChange={(checked) => { void save(checked === true) }}
        />
      </div>
    )
  }

  const commit = async (): Promise<void> => {
    if (busy) return
    if (scalar.kind === 'string') {
      const saved = await updateNamespace(runtime, view.ns, { [field]: draft }, view.revision)
      if (saved !== null) onSaved(saved)
      return
    }
    const parsed = Number(draft)
    if (Number.isNaN(parsed)) return
    const saved = await updateNamespace(runtime, view.ns, { [field]: parsed }, view.revision)
    if (saved !== null) onSaved(saved)
  }

  return (
    <div className="flex items-center gap-2 py-2">
      <Label className="shrink-0 font-mono text-xs text-muted-foreground">{field}</Label>
      <Input
        className="h-8 flex-1"
        value={draft}
        type={scalar.kind === 'number' ? 'number' : 'text'}
        onChange={(event) => { setDraft(event.target.value) }}
        onKeyDown={(event) => { if (event.key === 'Enter') void commit() }}
      />
      <Button size="sm" variant="outline" disabled={busy} onClick={() => { void commit() }}>保存</Button>
      {userOverridden ? (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => { void unsetField(runtime, view, field, onSaved) }}>清除</Button>
      ) : null}
    </div>
  )
}

/** Remove one field's user override so it re-inherits the composition base. */
async function unsetField(
  runtime: RxlabClientRuntime,
  view: SettingsNamespaceView,
  field: string,
  onSaved: (next: SettingsNamespaceView) => void,
): Promise<void> {
  const saved = await unsetNamespaceField(runtime, view.ns, field, view.revision)
  if (saved !== null) onSaved(saved)
}

function NamespaceCard({
  runtime, view, onSaved,
}: {
  runtime: RxlabClientRuntime
  view: SettingsNamespaceView
  onSaved: (next: SettingsNamespaceView) => void
}) {
  const record = asRecord(view.value)
  const user = asRecord(view.user ?? null)
  const fields = record === null ? [] : Object.entries(record)
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm">{namespaceLabel(view.ns)}</CardTitle>
          <div className="flex items-center gap-1">
            {view.applies === 'restart' ? <Badge variant="secondary">需重启</Badge> : <Badge variant="secondary">即时生效</Badge>}
          </div>
        </div>
        <CardDescription className="font-mono text-xs">{view.ns}</CardDescription>
      </CardHeader>
      <CardContent>
        {fields.length === 0 ? (
          <p className="text-xs text-muted-foreground">该分区没有可编辑的标量字段。</p>
        ) : fields.map(([field, value]) => (
          <FieldEditor
            key={field}
            runtime={runtime}
            view={view}
            field={field}
            value={value}
            userOverridden={user !== null && field in user}
            onSaved={onSaved}
          />
        ))}
      </CardContent>
    </Card>
  )
}

function ModuleSettingsTab({
  runtime, connected,
}: { runtime: RxlabClientRuntime | undefined; connected: boolean }) {
  const { state, reload } = useSettingsDescribe(runtime, connected)
  const workspaceRoot = useWorkspaceRoot(runtime, connected)
  const moduleAgents = useModuleAgents(runtime, connected)
  const [savedViews, setSavedViews] = useState<ReadonlyMap<string, SettingsNamespaceView>>(new Map())

  const views = useMemo(() => {
    if (state.status !== 'ready') return []
    const overrides = new Map(savedViews)
    return state.value.namespaces.map(view => overrides.get(view.ns) ?? view)
  }, [state, savedViews])

  if (runtime === undefined || !connected) {
    return <p className="text-sm text-muted-foreground">数据层未就绪。</p>
  }
  if (state.status === 'loading') {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    )
  }
  if (state.status === 'error') {
    return (
      <div className="flex items-start gap-2 text-sm text-destructive">
        <CircleAlert className="mt-0.5 size-4 shrink-0" />
        <span>读取设置失败：{state.message}</span>
      </div>
    )
  }

  const onSaved = (next: SettingsNamespaceView): void => {
    setSavedViews(prev => new Map(prev).set(next.ns, next))
  }

  const ownedNamespaces = new Set<string>(
    MODULE_NAMESPACE_SECTIONS.flatMap(section => section.namespaces.map(descriptor => descriptor.ns)),
  )
  ownedNamespaces.add(AGENT_PRESETS_NAMESPACE)
  const remaining = views.filter(view => !ownedNamespaces.has(view.ns))

  const sessionDirOf = (moduleId: string): string => {
    const config = moduleAgents[moduleId]
    return config === undefined ? '工作空间根目录' : `工作空间/${config.subdir}`
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {state.value.writable ? '写入直接落到 settings-rxlab.yaml。' : '当前部署为只读，无法保存修改。'}
        </p>
        <Button size="sm" variant="outline" onClick={reload}>
          <RefreshCw data-icon="inline-start" />刷新
        </Button>
      </div>

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
            <CardContent className="flex flex-col gap-3">
              <WorkspaceInfoBlock
                rows={[
                  { label: '会话目录', value: sessionDirOf(module.id), mono: true },
                  { label: '模块范围', value: `${module.scope.length} 项` },
                ]}
              />
              {module.id === 'collect' ? <CdpSettings runtime={runtime} connected={connected} /> : null}
              {namespaceSectionsOf(module.id).length > 0
                ? (
                  <SettingsSection
                    runtime={runtime}
                    connected={connected}
                    descriptors={namespaceSectionsOf(module.id)}
                  />
                )
                : (
                  <p className="text-xs text-muted-foreground">
                    {active
                      ? '该模块当前无可编辑设置；运行参数由 host 插件配置（cordis.yml / settings namespace）管理。'
                      : '模块规划中，接入后再提供设置。'}
                  </p>
                )}
            </CardContent>
          </Card>
        )
      })}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">其他分区（Host 全局）</CardTitle>
          <CardDescription>不属于某个工作台模块的部署分区，与工作空间等 host 级设置并列编辑。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {workspaceRoot !== undefined ? (
            <WorkspaceInfoBlock rows={[{ label: '工作空间根目录', value: workspaceRoot, mono: true }]} />
          ) : null}
          {remaining.map(view => (
            <NamespaceCard key={view.ns} runtime={runtime} view={view} onSaved={onSaved} />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

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
          会话按 process-wide 组装运行；此处管理预设目录与默认值，供后续按模块独立组装预设时使用。
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

export default function SettingsPanel(_props: ModulePanelProps) {
  const { runtime } = useRxlabClient()
  const connected = useConnected(runtime)

  if (runtime === undefined) {
    return <div className="flex flex-col gap-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
  }

  return (
    <ScrollArea className="h-[calc(100svh-10.5rem)]">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
        <div className="flex items-center gap-2">
          <Settings className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">全局设置</h2>
        </div>
        <Tabs defaultValue="modules">
          <TabsList>
            <TabsTrigger value="modules">模块设置</TabsTrigger>
            <TabsTrigger value="presets">Agent 预设</TabsTrigger>
          </TabsList>
          <TabsContent value="modules" className="mt-3">
            <ModuleSettingsTab runtime={runtime} connected={connected} />
          </TabsContent>
          <TabsContent value="presets" className="mt-3">
            <PresetTab runtime={runtime} connected={connected} />
          </TabsContent>
        </Tabs>
      </div>
    </ScrollArea>
  )
}
