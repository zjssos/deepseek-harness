/**
 * 验光配镜 workbench: capture staged refraction exam records, derive the
 * glasses prescription with the deterministic engine behind the
 * `remote.rxlabFitting` namespace, and project lens/frame advice. The panel
 * follows the wiki module's boot/lifecycle conventions.
 */
import { useEffect, useState, type ReactNode } from 'react'
import {
  Calculator,
  CircleAlert,
  Glasses,
  Loader2,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import type { ModulePanelProps } from '@/modules/types'
import type {
  AnamnesisData,
  CycloplegiaData,
  ExamRecordDraft,
  ExamStageEntry,
  FittingDeriveValue,
  FittingRecord,
  FittingRecordSummary,
  Prescription,
} from '@deepseek-ai/dsh-rxlab-fitting/types'
import type {
  CompatibilityCheck,
  CompatibilityReport,
  ExamStageArtifact,
  ExamStageInput,
} from '@deepseek-ai/dsh-rxlab-job/types'
import { useConnected } from '@/rxlab/use-sessions'
import type { RxlabClientRuntime } from '@/rxlab/client'
import { StageShell, type StageContext } from '@/modules/stages/StageShell'
import { ReportChecks } from '@/modules/stages/ReportChecks'
import { upsertStage } from '@/modules/stages/use-job'
import { fittingDerive, fittingGet, fittingRemove, fittingUpsert, useFittingRecords } from './use-fitting'

const USAGE_LABELS = { far: '远用', near: '近用', computer: '电脑/办公', outdoor: '户外', all: '全天' } as const

const USAGE_OPTIONS = Object.keys(USAGE_LABELS) as Array<keyof typeof USAGE_LABELS>

const CYCLOPLEGIA_LABELS = { none: '未做', fogging: '雾视', cycloplegia: '散瞳' } as const

const USAGE_DEFAULT = 'all' as const

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

export default function ExamPanel(_props: ModulePanelProps) {
  return <StageShell stage="exam">{context => <ExamWorkbench context={context} />}</StageShell>
}

/** Stage-1 面板: 选取/录入验光记录，推导处方并写入工单阶段产出。 */
function ExamWorkbench({ context }: { readonly context: StageContext }) {
  const runtime = context.runtime
  const connected = useConnected(runtime)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selected, setSelected] = useState<FittingRecordSummary | undefined>(undefined)
  const [detail, setDetail] = useState<FittingRecord | undefined>(undefined)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [report, setReport] = useState<{ record: ExamRecordDraft; outcome: FittingDeriveValue } | undefined>(undefined)
  const [confirmRemove, setConfirmRemove] = useState<FittingRecord | undefined>(undefined)
  const [removing, setRemoving] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedQuery(query) }, 250)
    return () => { window.clearTimeout(timer) }
  }, [query])

  const list = useFittingRecords(runtime, connected, debouncedQuery)

  useEffect(() => {
    if (selected === undefined || !connected) {
      setDetail(undefined)
      setDetailError(null)
      return
    }
    let alive = true
    setDetail(undefined)
    setDetailError(null)
    void fittingGet(runtime, selected.id)
      .then((record) => {
        if (alive) setDetail(record)
      })
      .catch((cause: unknown) => {
        if (alive) setDetailError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => { alive = false }
  }, [runtime, connected, selected, list.state.records])

  const onRemoveConfirmed = async (): Promise<void> => {
    if (confirmRemove === undefined || removing) return
    setRemoving(true)
    setBanner(null)
    try {
      await fittingRemove(runtime, { id: confirmRemove.id })
      if (selected?.id === confirmRemove.id) setSelected(undefined)
      list.reload()
      setConfirmRemove(undefined)
    } catch (cause) {
      setBanner(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setRemoving(false)
    }
  }

  const rows = list.state.records

  return (
    <div className="flex h-[calc(100svh-10.5rem)] min-h-[34rem] flex-col overflow-hidden rounded-xl border shadow-sm">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Glasses className="size-4 text-muted-foreground" />
          验光配镜
          <span className="text-xs font-normal text-muted-foreground">
            {connected ? `${String(rows.length)} 条记录` : '连接中'}
          </span>
        </div>
        <div className="relative min-w-44 flex-1">
          <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-8"
            placeholder="检索患者 / 日期"
            value={query}
            onChange={(event) => { setQuery(event.target.value) }}
          />
        </div>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => { setFormOpen(true) }}
        >
          <Plus className="size-3.5" />
          新建验光记录
        </Button>
      </div>

      {context.stageRecord?.checks === undefined ? null : (
        <div className="flex shrink-0 items-start gap-2 border-b px-4 py-2">
          <ReportChecks report={context.stageRecord.checks} />
        </div>
      )}

      {banner !== null ? (
        <div className="flex items-start gap-2 border-b bg-destructive/10 px-4 py-2 text-xs text-destructive">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span className="whitespace-pre-wrap">{banner}</span>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 md:flex-row">
        <Card className="flex min-h-0 flex-1 flex-col">
          <CardHeader className="px-4 py-3">
            <CardTitle className="text-sm">验光记录</CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 p-0 px-2 pb-2">
            {list.state.phase === 'loading'
              ? (
                <div className="space-y-2 p-2">
                  <Skeleton className="h-9 rounded-md" />
                  <Skeleton className="h-9 rounded-md" />
                  <Skeleton className="h-9 rounded-md" />
                </div>
              )
              : list.state.phase === 'error'
                ? (
                  <div className="flex items-start gap-2 p-3 text-xs text-destructive">
                    <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                    <span className="whitespace-pre-wrap">{list.state.error}</span>
                  </div>
                )
                : rows.length === 0
                  ? (
                    <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                      空态：还没有验光记录。点「新建验光记录」录入第一条。
                    </div>
                  )
                  : (
                    <ScrollArea className="h-full">
                      <div className="space-y-1 p-1">
                        {rows.map(row => (
                          <RecordRow
                            key={row.id}
                            row={row}
                            active={selected?.id === row.id}
                            onSelect={() => { setSelected(row) }}
                          />
                        ))}
                      </div>
                    </ScrollArea>
                  )}
          </CardContent>
        </Card>

        <Card className="flex min-h-0 w-full flex-col md:w-[26rem] lg:w-[30rem]">
          <CardHeader className="px-4 py-3">
            <CardTitle className="text-sm">记录详情</CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {selected === undefined
              ? (
                <p className="py-10 text-center text-xs text-muted-foreground">
                  选中左侧一条记录查看阶段事实，或发起处方计算。
                </p>
              )
              : detailError !== null
                ? (
                  <div className="flex items-start gap-2 text-xs text-destructive">
                    <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                    <span className="whitespace-pre-wrap">{detailError}</span>
                  </div>
                )
                : detail === undefined
                  ? <Skeleton className="h-40 rounded-md" />
                  : (
                    <>
                      <RecordDetail record={detail} />
                      <div className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          className="gap-1.5"
                          onClick={() => { void openDerive(runtime, detail, setReport, setBanner) }}
                        >
                          <Calculator className="size-3.5" />
                          计算处方
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-destructive hover:text-destructive"
                          onClick={() => { setConfirmRemove(detail) }}
                        >
                          <Trash2 className="size-3.5" />
                          删除
                        </Button>
                      </div>
                    </>
                  )}
          </CardContent>
        </Card>
      </div>

      <ExamFormDialog
        runtime={runtime}
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={() => {
          setFormOpen(false)
          list.reload()
        }}
        onDerived={(record, outcome) => { setReport({ record, outcome }) }}
      />

      <DeriveReportDialog
        report={report}
        runtime={runtime}
        context={context}
        onSaved={() => {
          setReport(undefined)
          list.reload()
        }}
        onClose={() => { setReport(undefined) }}
      />

      <AlertDialog open={confirmRemove !== undefined} onOpenChange={(open) => { if (!open) setConfirmRemove(undefined) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除这条验光记录？</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmRemove === undefined
                ? ''
                : `「${confirmRemove.patient ?? '未命名'}」将从 fitting 持久域删除，且不可恢复。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={removing}
              onClick={(event) => { event.preventDefault(); void onRemoveConfirmed() }}
            >
              {removing ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** One clickable summary row in the list pane. */
function RecordRow({
  row,
  active,
  onSelect,
}: {
  readonly row: FittingRecordSummary
  readonly active: boolean
  readonly onSelect: () => void
}) {
  const age = row.age === undefined ? '' : `${String(row.age)} 岁`
  const usage = row.usage === undefined ? '' : USAGE_LABELS[row.usage]
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors',
        active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
      ].join(' ')}
    >
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">{row.patient ?? '未命名'}</span>
        <span className="ml-1.5 text-muted-foreground">
          {[age, usage, row.date].filter(part => part !== undefined && part.length > 0).join(' · ')}
        </span>
      </span>
      <span className="shrink-0 text-[10px] text-muted-foreground">{formatTime(row.updatedAt)}</span>
    </button>
  )
}

/** Stage facts of one full record, one line per stage. */
function RecordDetail({ record }: { readonly record: FittingRecord }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium">{record.patient ?? '未命名'}</h3>
        {record.date !== undefined ? <span className="text-xs text-muted-foreground">{record.date}</span> : null}
      </div>
      <dl className="space-y-1.5 text-xs">
        {record.stages.map(stage => (
          <div key={stage.id} className="flex gap-3">
            <dt className="w-20 shrink-0 text-muted-foreground">{STAGE_LABELS[stage.id]}</dt>
            <dd className="min-w-0 break-words">{stageSummary(stage)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

const STAGE_LABELS: Record<ExamStageEntry['id'], string> = {
  anamnesis: '问诊',
  baseline: '基线',
  objective: '客观验光',
  cycloplegia: '调节放松',
  subjective: '主觉验光',
  binocular: '双眼平衡',
  trial: '试戴',
  add: '下加光',
  pdMeasure: '瞳距',
}

/** One-line human summary of one stage entry (zh copy per workbench convention). */
function stageSummary(stage: ExamStageEntry): string {
  switch (stage.id) {
    case 'anamnesis': {
      const d = stage.data
      return [`${String(d.age)} 岁`, d.firstExam ? '首验' : '复验', USAGE_LABELS[d.usage]]
        .filter(part => part.length > 0).join(' · ')
    }
    case 'baseline': {
      const d = stage.data
      return d.oldGlasses?.measured === true ? '含焦度计实测原镜度数' : '已录入'
    }
    case 'objective':
      return `${stage.data.method === 'autorefractor' ? '电脑验光' : '检影'}：右 ${readingText(stage.data.eyeR)} / 左 ${readingText(stage.data.eyeL)}`
    case 'cycloplegia':
      return CYCLOPLEGIA_LABELS[stage.data.method]
    case 'subjective': {
      const d = stage.data
      return `右 ${refinedText(d.eyeR)} / 左 ${refinedText(d.eyeL)}`
    }
    case 'binocular':
      return `右 ${String(stage.data.finalSphR)} / 左 ${String(stage.data.finalSphL)}`
    case 'trial': {
      const d = stage.data
      if (!d.performed) return '未试戴'
      return `适应${d.tolerated === true ? '' : '不良'}，回退 ${String(d.rollbackDiopters ?? 0)}D`
    }
    case 'add':
      return `右 ${String(stage.data.addR)} / 左 ${String(stage.data.addL)}`
    case 'pdMeasure': {
      const d = stage.data
      const pdH = d.pdH === undefined ? '' : `，瞳高 ${String(d.pdH)}`
      return `右 ${String(d.pdR)} / 左 ${String(d.pdL)}${pdH}`
    }
  }
}

function readingText(reading: { sph: number; cyl?: number | undefined; axis?: number | undefined }): string {
  const sph = `${String(reading.sph)}D`
  if (reading.cyl === undefined) return sph
  const axis = reading.axis === undefined ? '' : `×${String(reading.axis)}°`
  return `${sph} ${String(reading.cyl)}D${axis}`
}

/** One refined single-eye endpoint; the sphere field is `finalSph`. */
function refinedText(eye: { finalSph: number; finalCyl?: number | undefined; finalAxis?: number | undefined }): string {
  const sph = `${String(eye.finalSph)}D`
  if (eye.finalCyl === undefined) return sph
  const axis = eye.finalAxis === undefined ? '' : `×${String(eye.finalAxis)}°`
  return `${sph} ${String(eye.finalCyl)}D${axis}`
}

/** Run the derive RPC and surface failures on the workbench banner. */
async function openDerive(
  runtime: RxlabClientRuntime,
  record: ExamRecordDraft,
  setReport: (report: { record: ExamRecordDraft; outcome: FittingDeriveValue }) => void,
  setBanner: (message: string | null) => void,
): Promise<void> {
  setBanner(null)
  try {
    const outcome = await fittingDerive(runtime, record)
    setReport({ record, outcome })
  } catch (cause) {
    setBanner(cause instanceof Error ? cause.message : String(cause))
  }
}

/** 新建验光记录 dialog: core-stage entry form with a live derive preview. */
function ExamFormDialog({
  runtime,
  open,
  onOpenChange,
  onSaved,
  onDerived,
}: {
  readonly runtime: RxlabClientRuntime
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onSaved: () => void
  readonly onDerived: (record: ExamRecordDraft, outcome: FittingDeriveValue) => void
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<'idle' | 'derive' | 'save'>('idle')
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setValues({ date: new Date().toISOString().slice(0, 10) })
    setNotice(null)
  }, [open])

  const setField = (key: string, value: string): void => {
    setValues(current => ({ ...current, [key]: value }))
  }

  const build = (report: (message: string) => void): ExamRecordDraft | undefined => {
    return draftOf(values, report)
  }

  const onDerive = async (): Promise<void> => {
    if (busy !== 'idle') return
    const record = build(setNotice)
    if (record === undefined) return
    setBusy('derive')
    setNotice(null)
    try {
      const outcome = await fittingDerive(runtime, record)
      onDerived(record, outcome)
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy('idle')
    }
  }

  const onSave = async (): Promise<void> => {
    if (busy !== 'idle') return
    const record = build(setNotice)
    if (record === undefined) return
    setBusy('save')
    setNotice(null)
    try {
      await fittingUpsert(runtime, record)
      onSaved()
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy('idle')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>新建验光记录</DialogTitle>
          <DialogDescription>
            按验光流程录入分阶段事实；双眼终值默认取单眼终值。带 * 的字段必填。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="患者" fieldKey="patient" values={values} onField={setField} placeholder="如 张三" />
            <FormField label="日期">
              <Input
                value={values.date ?? ''}
                placeholder="如 2026-09-09"
                onChange={(event) => { setField('date', event.target.value) }}
              />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="年龄 *" fieldKey="age" values={values} onField={setField} inputMode="numeric" />
            <FormField label="用途 *">
              <Select value={values.usage ?? USAGE_DEFAULT} onValueChange={(value) => { setField('usage', value) }}>
                <SelectTrigger>
                  <SelectValue placeholder="请选择" />
                </SelectTrigger>
                <SelectContent>
                  {USAGE_OPTIONS.map(option => (
                    <SelectItem key={option} value={option}>{USAGE_LABELS[option]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="是否首验">
              <Select value={values.firstExam ?? 'no'} onValueChange={(value) => { setField('firstExam', value) }}>
                <SelectTrigger>
                  <SelectValue placeholder="请选择" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">否</SelectItem>
                  <SelectItem value="yes">是</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="调节放松">
              <Select value={values.cycloplegia ?? 'none'} onValueChange={(value) => { setField('cycloplegia', value) }}>
                <SelectTrigger>
                  <SelectValue placeholder="请选择" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CYCLOPLEGIA_LABELS) as Array<keyof typeof CYCLOPLEGIA_LABELS>).map(option => (
                    <SelectItem key={option} value={option}>{CYCLOPLEGIA_LABELS[option]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>

          <Separator />
          <p className="text-xs text-muted-foreground">客观验光（电脑验光 / 检影读数）</p>
          <div className="grid grid-cols-3 gap-3">
            <NumberField label="右眼球镜 *" fieldKey="objSphR" values={values} onField={setField} placeholder="-3.25" />
            <NumberField label="右眼柱镜" fieldKey="objCylR" values={values} onField={setField} />
            <NumberField label="右眼轴位" fieldKey="objAxisR" values={values} onField={setField} placeholder="0-180" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <NumberField label="左眼球镜 *" fieldKey="objSphL" values={values} onField={setField} placeholder="-3.25" />
            <NumberField label="左眼柱镜" fieldKey="objCylL" values={values} onField={setField} />
            <NumberField label="左眼轴位" fieldKey="objAxisL" values={values} onField={setField} placeholder="0-180" />
          </div>

          <Separator />
          <p className="text-xs text-muted-foreground">主觉终值（MPMVA / 红绿 / JCC 后的单眼定稿）</p>
          <div className="grid grid-cols-3 gap-3">
            <NumberField label="右眼球镜 *" fieldKey="finSphR" values={values} onField={setField} placeholder="-3.00" />
            <NumberField label="右眼柱镜" fieldKey="finCylR" values={values} onField={setField} />
            <NumberField label="右眼轴位" fieldKey="finAxisR" values={values} onField={setField} placeholder="0-180" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <NumberField label="左眼球镜 *" fieldKey="finSphL" values={values} onField={setField} placeholder="-3.25" />
            <NumberField label="左眼柱镜" fieldKey="finCylL" values={values} onField={setField} />
            <NumberField label="左眼轴位" fieldKey="finAxisL" values={values} onField={setField} placeholder="0-180" />
          </div>

          <Separator />
          <div className="grid grid-cols-3 gap-3">
            <NumberField label="右眼瞳距 (mm) *" fieldKey="pdR" values={values} onField={setField} inputMode="decimal" />
            <NumberField label="左眼瞳距 (mm) *" fieldKey="pdL" values={values} onField={setField} inputMode="decimal" />
            <NumberField label="瞳高 (mm)" fieldKey="pdH" values={values} onField={setField} inputMode="decimal" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <NumberField label="试戴回退 (D)" fieldKey="rollback" values={values} onField={setField} placeholder="0.25 的倍数" />
            <NumberField label="下加光右眼" fieldKey="addR" values={values} onField={setField} />
            <NumberField label="下加光左眼" fieldKey="addL" values={values} onField={setField} />
          </div>

          {notice !== null ? (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span className="whitespace-pre-wrap">{notice}</span>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={busy !== 'idle'} onClick={() => { onOpenChange(false) }}>
            取消
          </Button>
          <Button variant="outline" disabled={busy !== 'idle'} onClick={() => { void onDerive() }}>
            {busy === 'derive' ? <Loader2 className="size-3.5 animate-spin" /> : <Calculator className="size-3.5" />}
            计算处方
          </Button>
          <Button disabled={busy !== 'idle'} onClick={() => { void onSave() }}>
            {busy === 'save' ? <Loader2 className="size-3.5 animate-spin" /> : null}
            保存记录
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 处方计算 result dialog: prescription, findings, advice, and frame matches. */
function DeriveReportDialog({
  runtime,
  report,
  context,
  onClose,
  onSaved,
}: {
  readonly runtime: RxlabClientRuntime
  readonly report: { record: ExamRecordDraft; outcome: FittingDeriveValue } | undefined
  readonly context: StageContext
  readonly onClose: () => void
  readonly onSaved: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [adopting, setAdopting] = useState(false)
  const [frameMatches, setFrameMatches] = useState<string[]>([])

  // Frame geometry lives on the full catalog rows, not the summaries; fetch
  // details once per report and keep the FPD-matched names.
  useEffect(() => {
    if (report === undefined) {
      setFrameMatches([])
      return
    }
    const band = report.outcome.recommendation?.frameBand
    if (band === undefined) return
    let alive = true
    void runtime.remote.rxlabCatalog.list({ kind: 'frame' })
      .then(async (listed) => {
        if (!alive || !listed.ok) return
        const details = await Promise.all(listed.value.items.map(item =>
          runtime.remote.rxlabCatalog.get({ id: item.id })))
        const names = details
          .filter(entry => entry.ok && entry.value.item.kind === 'frame')
          .map(entry => (entry.ok ? entry.value.item : undefined))
          .filter(item => item !== undefined && item.kind === 'frame')
          .filter((item) => {
            const fpd = (item.lensWidth ?? 0) + (item.bridgeWidth ?? 0)
            return fpd >= band.fpdMin && fpd <= band.fpdMax
          })
          .map(item => item.name)
        if (alive) setFrameMatches(names)
      })
      .catch(() => undefined)
    return () => { alive = false }
  }, [runtime, report])

  if (report === undefined) return null
  const { record, outcome } = report
  const prescription = outcome.prescription
  const band = outcome.recommendation?.frameBand

  const onSave = async (): Promise<void> => {
    if (saving) return
    setSaving(true)
    try {
      await fittingUpsert(runtime, record)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const onAdopt = async (): Promise<void> => {
    if (adopting) return
    setAdopting(true)
    try {
      await upsertStage(runtime, context.job.id, 'exam', {
        status: 'done',
        inputs: { ...examInputsOf(record) },
        outputs: { ...examArtifactOf(outcome.prescription) },
        checks: examReportOf(outcome),
      })
      context.reload()
    } finally {
      setAdopting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>处方计算结果</DialogTitle>
          <DialogDescription>{outcome.summary}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {outcome.issues.length > 0 ? (
            <div className="space-y-1.5">
              {outcome.issues.map((issue, index) => (
                <div
                  key={index}
                  className={[
                    'flex items-start gap-2 rounded-md px-3 py-2 text-xs',
                    issue.level === 'FAIL' ? 'bg-destructive/10 text-destructive' : 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
                  ].join(' ')}
                >
                  <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                  <span className="whitespace-pre-wrap">{issue.message}</span>
                </div>
              ))}
            </div>
          ) : null}

          {prescription !== null ? (
            <>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">处方</p>
                <PrescriptionTable prescription={prescription} />
              </div>
              {(() => {
                const advice = outcome.recommendation
                if (advice === undefined || advice === null) return null
                return (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">配镜建议</p>
                    <dl className="space-y-1 text-xs">
                      <DetailRow label="折射率" value={advice.recommendedIndex} />
                      <DetailRow label="镜片类型" value={advice.lensTypes.join(' / ')} />
                      <DetailRow
                        label="镜架 FPD"
                        value={`${String(band?.fpdMin ?? 0)}-${String(band?.fpdMax ?? 0)}mm（目标 ${String(band?.targetFpd ?? 0)}）`}
                      />
                      <DetailRow label="无框/半框" value={advice.rimlessOk ? '可行' : '不建议，选全框'} />
                    </dl>
                  </div>
                )
              })()}
              {frameMatches.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">尺寸合适的镜架（来自商品 Wiki）</p>
                  <div className="flex flex-wrap gap-1.5">
                    {frameMatches.slice(0, 8).map((name, index) => (
                      <Badge key={`${String(index)}-${name}`} variant="secondary">{name}</Badge>
                    ))}
                  </div>
                </div>
              ) : null}
              {outcome.recommendation?.warnings.length ? (
                <div className="space-y-1 text-xs text-amber-700 dark:text-amber-400">
                  {outcome.recommendation.warnings.map((warning, index) => (
                    <p key={index}>· {warning}</p>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={saving || adopting} onClick={() => { onClose() }}>
            关闭
          </Button>
          <Button variant="outline" disabled={saving || adopting} onClick={() => { void onAdopt() }}>
            {adopting ? <Loader2 className="size-3.5 animate-spin" /> : null}
            写入工单阶段产出
          </Button>
          {prescription !== null ? (
            <Button disabled={saving || adopting} onClick={() => { void onSave() }}>
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
              保存记录
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** One prescription row pair: sphere / cylinder × axis / ADD / acuity. */
function PrescriptionTable({ prescription }: { readonly prescription: NonNullable<FittingDeriveValue['prescription']> }) {
  const eyeRow = (label: string, eye: typeof prescription.eyeL) => (
    <div className="flex gap-3 text-xs">
      <span className="w-10 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-words">
        {readingText(eye)}
        {eye.add !== undefined ? `　ADD ${String(eye.add)}` : ''}
        {eye.va !== undefined ? `　矫正 ${eye.va}` : ''}
      </span>
    </div>
  )
  return (
    <div className="space-y-1.5 rounded-md border px-3 py-2">
      {eyeRow('右眼', prescription.eyeR)}
      {eyeRow('左眼', prescription.eyeL)}
      <div className="flex gap-3 text-xs">
        <span className="w-10 shrink-0 text-muted-foreground">瞳距</span>
        <span className="min-w-0 flex-1 break-words">
          {prescription.pdL !== undefined && prescription.pdR !== undefined
            ? `右 ${String(prescription.pdR)} / 左 ${String(prescription.pdL)}，双眼 ${String(prescription.pd ?? '')}`
            : `双眼 ${String(prescription.pd ?? '')}`}
          {prescription.pdH !== undefined ? `，瞳高 ${String(prescription.pdH)}` : ''}
        </span>
      </div>
    </div>
  )
}

function DetailRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  )
}

function FormField({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function NumberField({
  label,
  fieldKey,
  values,
  onField,
  placeholder,
  inputMode,
}: {
  readonly label: string
  readonly fieldKey: string
  readonly values: Record<string, string>
  readonly onField: (key: string, value: string) => void
  readonly placeholder?: string
  readonly inputMode?: 'decimal' | 'numeric'
}) {
  return (
    <FormField label={label}>
      <Input
        value={values[fieldKey] ?? ''}
        placeholder={placeholder}
        inputMode={inputMode ?? 'decimal'}
        onChange={(event) => { onField(fieldKey, event.target.value) }}
      />
    </FormField>
  )
}

/** Parse one optional dioptre field; reports instead of throwing. */
function optionalNumber(values: Record<string, string>, key: string, label: string, report: (message: string) => void): number | undefined {
  const raw = (values[key] ?? '').trim()
  if (raw.length === 0) return undefined
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) {
    report(`「${label}」需要是数字。`)
    return undefined
  }
  return parsed
}

function requiredNumber(values: Record<string, string>, key: string, label: string, report: (message: string) => void): number | undefined {
  const parsed = optionalNumber(values, key, label, report)
  if (parsed === undefined) report(`「${label}」为必填。`)
  return parsed
}

/** Validate the form's fields and assemble the staged exam record draft. */
function draftOf(values: Record<string, string>, report: (message: string) => void): ExamRecordDraft | undefined {
  const age = requiredNumber(values, 'age', '年龄', report)
  if (age === undefined) return undefined
  const objSphR = requiredNumber(values, 'objSphR', '右眼球镜（客观）', report)
  const objSphL = requiredNumber(values, 'objSphL', '左眼球镜（客观）', report)
  const finSphR = requiredNumber(values, 'finSphR', '右眼球镜（主觉）', report)
  const finSphL = requiredNumber(values, 'finSphL', '左眼球镜（主觉）', report)
  const pdR = requiredNumber(values, 'pdR', '右眼瞳距', report)
  const pdL = requiredNumber(values, 'pdL', '左眼瞳距', report)
  if (objSphR === undefined || objSphL === undefined || finSphR === undefined || finSphL === undefined
    || pdR === undefined || pdL === undefined) return undefined

  const objCylR = optionalNumber(values, 'objCylR', '右眼柱镜（客观）', report)
  const objCylL = optionalNumber(values, 'objCylL', '左眼柱镜（客观）', report)
  const objAxisR = optionalNumber(values, 'objAxisR', '右眼轴位（客观）', report)
  const objAxisL = optionalNumber(values, 'objAxisL', '左眼轴位（客观）', report)
  const finCylR = optionalNumber(values, 'finCylR', '右眼柱镜（主觉）', report)
  const finCylL = optionalNumber(values, 'finCylL', '左眼柱镜（主觉）', report)
  const finAxisR = optionalNumber(values, 'finAxisR', '右眼轴位（主觉）', report)
  const finAxisL = optionalNumber(values, 'finAxisL', '左眼轴位（主觉）', report)
  if (objCylR === undefined || objCylL === undefined || objAxisR === undefined || objAxisL === undefined
    || finCylR === undefined || finCylL === undefined || finAxisR === undefined || finAxisL === undefined) {
    return undefined
  }
  const pdH = optionalNumber(values, 'pdH', '瞳高', report)
  const rollback = optionalNumber(values, 'rollback', '试戴回退', report)
  const addR = optionalNumber(values, 'addR', '下加光右眼', report)
  const addL = optionalNumber(values, 'addL', '下加光左眼', report)
  if (pdH === undefined || rollback === undefined || addR === undefined || addL === undefined) return undefined

  const usage = (values.usage ?? USAGE_DEFAULT) as AnamnesisData['usage']
  const patient = (values.patient ?? '').trim()
  const date = (values.date ?? '').trim()
  const stages: ExamStageEntry[] = [
    {
      id: 'anamnesis',
      data: { age, firstExam: values.firstExam === 'yes', usage },
    },
    {
      id: 'objective',
      data: {
        method: 'autorefractor',
        eyeR: { sph: objSphR, cyl: objCylR, axis: objAxisR },
        eyeL: { sph: objSphL, cyl: objCylL, axis: objAxisL },
      },
    },
    {
      id: 'cycloplegia',
      data: { method: (values.cycloplegia ?? 'none') as CycloplegiaData['method'] },
    },
    {
      id: 'subjective',
      data: {
        eyeR: { mpmvaSph: finSphR, finalSph: finSphR, finalCyl: finCylR, finalAxis: finAxisR },
        eyeL: { mpmvaSph: finSphL, finalSph: finSphL, finalCyl: finCylL, finalAxis: finAxisL },
      },
    },
    {
      id: 'binocular',
      data: { balanceDeltaL: 0, balanceDeltaR: 0, finalSphL: finSphL, finalSphR: finSphR },
    },
    {
      id: 'trial',
      data: { performed: true, tolerated: true, rollbackDiopters: rollback },
    },
    {
      id: 'pdMeasure',
      data: { pdR, pdL, pdH },
    },
  ]
  if (addR !== undefined && addR > 0) {
    const add: ExamStageEntry = { id: 'add', data: { addR, addL: addL ?? 0 } }
    stages.push(add)
  }

  return {
    ...(patient.length > 0 ? { patient } : {}),
    ...(date.length > 0 ? { date } : {}),
    stages,
  }
}

/** Map one derive outcome onto the deterministic stage-1 compatibility report. */
function examReportOf(outcome: FittingDeriveValue): CompatibilityReport {
  const checks: CompatibilityCheck[] = outcome.issues.map(issue => ({
    name: issue.stage ?? '处方',
    status: issue.level,
    detail: issue.message,
  }))
  const overall = checks.some(check => check.status === 'FAIL')
    ? 'FAIL'
    : checks.some(check => check.status === 'WARN') ? 'WARN' : 'OK'
  return { overall, checks, summary: outcome.summary }
}

/** Map one derived prescription onto the stage-1 artifact the guide prints. */
function examArtifactOf(prescription: Prescription | null): ExamStageArtifact {
  if (prescription === null) return {}
  return {
    ...(prescription.pd === undefined ? {} : { pdMm: prescription.pd }),
    sphereL: prescription.eyeL.sph,
    sphereR: prescription.eyeR.sph,
    ...(prescription.eyeL.cyl === undefined ? {} : { cylinderL: prescription.eyeL.cyl }),
    ...(prescription.eyeR.cyl === undefined ? {} : { cylinderR: prescription.eyeR.cyl }),
    prescriptionSummary: `右 ${readingText(prescription.eyeR)} / 左 ${readingText(prescription.eyeL)}`,
  }
}

/** Map the exam draft onto the stage-1 inputs; a stored record contributes its id. */
function examInputsOf(record: ExamRecordDraft): ExamStageInput {
  const id = (record as { readonly id?: unknown }).id
  return {
    ...(typeof id === 'string' ? { fittingRecordId: id } : {}),
    ...(record.date === undefined ? {} : { examDate: record.date }),
    ...(record.patient === undefined ? {} : { notes: record.patient }),
  }
}
