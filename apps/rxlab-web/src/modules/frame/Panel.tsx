/**
 * 选框 stage panel: resolve the 验光 target, rank catalog frame candidates with
 * `remote.rxlabRecommend.suggest`, validate one with `validateFrame`, and write
 * the chosen frame into the work order's stage-2 artifact.
 */
import { useMemo, useState } from 'react'
import { CircleAlert, Loader2, Sparkles } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import type { FrameCandidate, RankedCandidate } from '@deepseek-ai/dsh-rxlab-recommend/types'
import type { CompatibilityReport, FrameStageArtifact, FrameStageInput } from '@deepseek-ai/dsh-rxlab-job/types'
import type { ModulePanelProps } from '@/modules/types'
import { useConnected } from '@/rxlab/use-sessions'
import { StageShell, type StageContext } from '@/modules/stages/StageShell'
import { ReportChecks } from '@/modules/stages/ReportChecks'
import { ExamTargetCard } from '@/modules/stages/ExamTargetCard'
import { upsertStage } from '@/modules/stages/use-job'
import { frameCandidateOf, useCatalogItems, useExamTarget } from '@/modules/stages/use-recommend'

const FRAME_TYPE_LABELS: Record<FrameCandidate['frameType'], string> = {
  full: '全框',
  half: '半框',
  rimless: '无框',
}

/** One candidate paired with its display origin. */
interface CandidateEntry {
  readonly label: string
  readonly candidate: FrameCandidate
  readonly catalogItemId?: string
}

export default function FramePanel(_props: ModulePanelProps) {
  return <StageShell stage="frame">{context => <FrameWorkbench context={context} />}</StageShell>
}

/** Stage-2 workbench: target, candidate picking, suggestion, and artifact write. */
function FrameWorkbench({ context }: { readonly context: StageContext }) {
  const runtime = context.runtime
  const connected = useConnected(runtime)
  const target = useExamTarget(runtime, connected, context.stages)
  const catalog = useCatalogItems(runtime, connected, 'frame')
  const catalogEntries = useMemo(
    () => catalog.items.flatMap((item) => {
      const mapped = frameCandidateOf(item)
      return mapped === undefined ? [] : [{ label: mapped.label, candidate: mapped.candidate, catalogItemId: String(item.id) }]
    }),
    [catalog.items],
  )
  const [chosen, setChosen] = useState<CandidateEntry | undefined>(undefined)
  const [report, setReport] = useState<CompatibilityReport | undefined>(undefined)
  const [ranked, setRanked] = useState<readonly RankedCandidate[] | undefined>(undefined)
  const [busy, setBusy] = useState<'suggest' | 'validate' | 'write' | undefined>(undefined)
  const [banner, setBanner] = useState<string | null>(null)

  if (target.phase === 'loading' || catalog.phase === 'loading') return <Skeleton className="h-56 rounded-xl" />

  const runSuggest = async (): Promise<void> => {
    if (target.phase !== 'ready' || busy !== undefined) return
    setBusy('suggest')
    setBanner(null)
    try {
      const result = await runtime.remote.rxlabRecommend.suggest({
        prescription: target.target.prescription,
        advice: target.target.advice,
        candidates: { frames: catalogEntries.map(entry => entry.candidate) },
        ...(context.job.consumer.style === undefined ? {} : { preference: context.job.consumer.style }),
      })
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
      setRanked(result.value.frames)
    } catch (cause) {
      setBanner(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(undefined)
    }
  }

  const validate = async (entry: CandidateEntry): Promise<void> => {
    if (target.phase !== 'ready' || busy !== undefined) return
    setBusy('validate')
    setBanner(null)
    try {
      const result = await runtime.remote.rxlabRecommend.validateFrame({
        prescription: target.target.prescription,
        advice: target.target.advice,
        frame: entry.candidate,
      })
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
      setChosen(entry)
      setReport(result.value.report)
    } catch (cause) {
      setBanner(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(undefined)
    }
  }

  const writeStage = async (): Promise<void> => {
    if (chosen === undefined || report === undefined || busy !== undefined) return
    setBusy('write')
    setBanner(null)
    try {
      await upsertStage(runtime, context.job.id, 'frame', {
        status: report.overall === 'FAIL' ? 'in-progress' : 'done',
        inputs: { ...inputsOf(chosen) },
        outputs: { ...artifactOf(chosen) },
        checks: report,
      })
      context.reload()
    } catch (cause) {
      setBanner(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ExamTargetCard target={target} />
      {context.stageRecord?.checks === undefined ? null : (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">本工单选框阶段校验</CardTitle></CardHeader>
          <CardContent><ReportChecks report={context.stageRecord.checks} /></CardContent>
        </Card>
      )}

      {banner !== null ? (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span className="whitespace-pre-wrap">{banner}</span>
        </div>
      ) : null}

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 pb-2">
          <div>
            <CardTitle className="text-sm">候选镜架（参照库）</CardTitle>
            <CardDescription>从商品参照库取带尺寸的镜架，按处方目标校验与排序。</CardDescription>
          </div>
          <Button size="sm" className="gap-1.5" disabled={target.phase !== 'ready' || busy !== undefined} onClick={() => { void runSuggest() }}>
            {busy === 'suggest' ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            按处方推荐
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {catalogEntries.length === 0 ? (
            <p className="text-xs text-muted-foreground">参照库暂无带尺寸的镜架；请到「内容管理 · 参照库」录入，或使用下方人工录入。</p>
          ) : (
            <>
              <Select
                value={chosen?.catalogItemId ?? ''}
                onValueChange={(value) => {
                  const entry = catalogEntries.find(candidate => candidate.catalogItemId === value)
                  if (entry !== undefined) void validate(entry)
                }}
              >
                <SelectTrigger className="w-full"><SelectValue placeholder="选择一条镜架进行校验" /></SelectTrigger>
                <SelectContent>
                  {catalogEntries.map(entry => (
                    <SelectItem key={entry.catalogItemId} value={entry.catalogItemId}>{entry.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {ranked === undefined ? null : (
                <div className="flex flex-col gap-1 pt-1">
                  <p className="text-xs font-medium text-muted-foreground">推荐顺序</p>
                  {ranked.map((entry, index) => (
                    <button
                      key={String(index)}
                      type="button"
                      onClick={() => {
                        const match = catalogEntries.find(candidate => sameCandidate(candidate.candidate, entry.candidate))
                        if (match !== undefined) void validate(match)
                      }}
                      className="flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent/60"
                    >
                      <span className="min-w-0 truncate">
                        {catalogEntries.find(candidate => sameCandidate(candidate.candidate, entry.candidate))?.label ?? '候选'}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <Badge variant={entry.report.overall === 'FAIL' ? 'destructive' : entry.report.overall === 'OK' ? 'secondary' : 'outline'}>
                          {entry.report.overall}
                        </Badge>
                        <span className="text-muted-foreground">得分 {entry.score}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <ManualFrameCard disabled={target.phase !== 'ready' || busy !== undefined} onValidate={validate} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">决策与产出</CardTitle>
          <CardDescription>校验通过后把所选镜架写入工单的选框阶段产出。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {chosen === undefined ? (
            <p className="text-xs text-muted-foreground">尚未选定候选镜架。</p>
          ) : (
            <>
              <p className="text-sm">已选：<span className="font-medium">{chosen.label}</span></p>
              <ReportChecks report={report} />
              <div>
                <Button size="sm" className="gap-1.5" disabled={report === undefined || busy !== undefined} onClick={() => { void writeStage() }}>
                  {busy === 'write' ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  写入阶段产出
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/** Manual frame entry for candidates not in the reference library. */
function ManualFrameCard({ disabled, onValidate }: {
  readonly disabled: boolean
  readonly onValidate: (entry: CandidateEntry) => Promise<void>
}) {
  const [values, setValues] = useState<Record<string, string>>({ frameType: 'full' })
  const [notice, setNotice] = useState<string | null>(null)
  const setField = (key: string, value: string): void => { setValues(current => ({ ...current, [key]: value })) }

  const submit = (): void => {
    const lensWidthA = Number((values.lensWidthA ?? '').trim())
    const bridgeDbl = Number((values.bridgeDbl ?? '').trim())
    if (!Number.isFinite(lensWidthA) || lensWidthA <= 0) { setNotice('镜片宽 A 必填且为正数。'); return }
    if (!Number.isFinite(bridgeDbl) || bridgeDbl <= 0) { setNotice('鼻梁距 DBL 必填且为正数。'); return }
    setNotice(null)
    const frameType = (values.frameType ?? 'full') as FrameCandidate['frameType']
    const candidate: FrameCandidate = {
      frameType,
      lensWidthA,
      bridgeDbl,
      ...(optional(values, 'frameWidth') === undefined ? {} : { frameWidth: optional(values, 'frameWidth') }),
      ...(optional(values, 'templeLength') === undefined ? {} : { templeLength: optional(values, 'templeLength') }),
      ...(optional(values, 'weight') === undefined ? {} : { weight: optional(values, 'weight') }),
      ...((values.shape ?? '').trim() === '' ? {} : { shape: (values.shape ?? '').trim() }),
    }
    void onValidate({ label: `手填：${FRAME_TYPE_LABELS[frameType]} ${String(lensWidthA)}+${String(bridgeDbl)}`, candidate })
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">人工录入候选镜架</CardTitle>
        <CardDescription>不在参照库内的镜架：录入尺寸后同样按处方校验。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <FieldGroup>
          <div className="grid grid-cols-3 gap-4">
            <Field>
              <FieldLabel>框型</FieldLabel>
              <Select value={values.frameType ?? 'full'} onValueChange={(value) => { setField('frameType', value) }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(FRAME_TYPE_LABELS) as FrameCandidate['frameType'][]).map(type => (
                    <SelectItem key={type} value={type}>{FRAME_TYPE_LABELS[type]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="m-lens-width">镜片宽 A (mm)</FieldLabel>
              <Input id="m-lens-width" inputMode="decimal" value={values.lensWidthA ?? ''} onChange={(event) => { setField('lensWidthA', event.target.value) }} />
            </Field>
            <Field>
              <FieldLabel htmlFor="m-bridge">鼻梁距 DBL (mm)</FieldLabel>
              <Input id="m-bridge" inputMode="decimal" value={values.bridgeDbl ?? ''} onChange={(event) => { setField('bridgeDbl', event.target.value) }} />
            </Field>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <Field>
              <FieldLabel htmlFor="m-frame-width">总宽 (mm)</FieldLabel>
              <Input id="m-frame-width" inputMode="decimal" value={values.frameWidth ?? ''} onChange={(event) => { setField('frameWidth', event.target.value) }} />
            </Field>
            <Field>
              <FieldLabel htmlFor="m-temple">镜腿长 (mm)</FieldLabel>
              <Input id="m-temple" inputMode="decimal" value={values.templeLength ?? ''} onChange={(event) => { setField('templeLength', event.target.value) }} />
            </Field>
            <Field>
              <FieldLabel htmlFor="m-weight">重量 (g)</FieldLabel>
              <Input id="m-weight" inputMode="decimal" value={values.weight ?? ''} onChange={(event) => { setField('weight', event.target.value) }} />
            </Field>
            <Field>
              <FieldLabel htmlFor="m-shape">形状</FieldLabel>
              <Input id="m-shape" value={values.shape ?? ''} onChange={(event) => { setField('shape', event.target.value) }} />
            </Field>
          </div>
        </FieldGroup>
        {notice !== null ? <p className="text-xs text-destructive">{notice}</p> : null}
        <div>
          <Button size="sm" variant="outline" disabled={disabled} onClick={submit}>校验手填候选</Button>
        </div>
      </CardContent>
    </Card>
  )
}

/** Read one optional positive numeric field. */
function optional(values: Record<string, string>, key: string): number | undefined {
  const raw = (values[key] ?? '').trim()
  if (raw.length === 0) return undefined
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

/** Whether two candidates carry the same dimensions/mount (suggest preserves the input objects). */
function sameCandidate(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

/** Map one chosen frame onto the stage-2 inputs. */
function inputsOf(entry: CandidateEntry): FrameStageInput {
  const candidate = entry.candidate
  return {
    frameType: candidate.frameType,
    lensWidthA: candidate.lensWidthA,
    bridgeDbl: candidate.bridgeDbl,
    ...(candidate.frameWidth === undefined ? {} : { frameWidth: candidate.frameWidth }),
    ...(candidate.templeLength === undefined ? {} : { templeLength: candidate.templeLength }),
    ...(candidate.weight === undefined ? {} : { weight: candidate.weight }),
    ...(candidate.shape === undefined ? {} : { shape: candidate.shape }),
    ...(entry.catalogItemId === undefined ? {} : { catalogItemId: entry.catalogItemId }),
  }
}

/** Map one chosen frame onto the stage-2 artifact. */
function artifactOf(entry: CandidateEntry): FrameStageArtifact {
  const candidate = entry.candidate
  return {
    frameName: entry.label,
    frameType: candidate.frameType,
    fpdMm: candidate.lensWidthA + candidate.bridgeDbl,
  }
}
