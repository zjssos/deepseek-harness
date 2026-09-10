/**
 * 选片 stage panel: resolve the 验光 target, rank catalog lens candidates with
 * `remote.rxlabRecommend.suggest`, validate one with `validateLens`, and write
 * the chosen lens into the work order's stage-3 artifact.
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
import type { LensCandidate, RankedCandidate } from '@deepseek-ai/dsh-rxlab-recommend/types'
import type { CompatibilityReport, LensStageArtifact, LensStageInput } from '@deepseek-ai/dsh-rxlab-job/types'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { ModulePanelProps } from '@/modules/types'
import { useConnected } from '@/rxlab/use-sessions'
import { StageShell, type StageContext } from '@/modules/stages/StageShell'
import { ReportChecks } from '@/modules/stages/ReportChecks'
import { ExamTargetCard } from '@/modules/stages/ExamTargetCard'
import { upsertStage } from '@/modules/stages/use-job'
import { lensCandidateOf, useCatalogItems, useExamTarget } from '@/modules/stages/use-recommend'

const LENS_TYPE_LABELS: Record<LensCandidate['lensType'], string> = {
  single: '单光',
  reading: '老花',
  progressive: '渐进',
  bifocal: '双光',
  office: '办公',
}

/** One candidate paired with its display origin. */
interface CandidateEntry {
  readonly label: string
  readonly candidate: LensCandidate
  readonly catalogItemId?: string
}

export default function LensPanel(_props: ModulePanelProps) {
  return <StageShell stage="lens">{context => <LensWorkbench context={context} />}</StageShell>
}

/** Stage-3 workbench: target, candidate picking, suggestion, and artifact write. */
function LensWorkbench({ context }: { readonly context: StageContext }) {
  const runtime = context.runtime
  const connected = useConnected(runtime)
  const target = useExamTarget(runtime, connected, context.stages)
  const catalog = useCatalogItems(runtime, connected, 'lens')
  const catalogEntries = useMemo(
    () => catalog.items.flatMap((item) => {
      const mapped = lensCandidateOf(item)
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
        candidates: { lenses: catalogEntries.map(entry => entry.candidate) },
        ...(context.job.consumer.style === undefined ? {} : { preference: context.job.consumer.style }),
      })
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
      setRanked(result.value.lenses)
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
      const result = await runtime.remote.rxlabRecommend.validateLens({
        prescription: target.target.prescription,
        advice: target.target.advice,
        lens: entry.candidate,
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
      await upsertStage(runtime, context.job.id, 'lens', {
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
          <CardHeader className="pb-2"><CardTitle className="text-sm">本工单选片阶段校验</CardTitle></CardHeader>
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
            <CardTitle className="text-sm">候选镜片（参照库）</CardTitle>
            <CardDescription>从商品参照库取镜片，按处方目标校验与排序。</CardDescription>
          </div>
          <Button size="sm" className="gap-1.5" disabled={target.phase !== 'ready' || busy !== undefined} onClick={() => { void runSuggest() }}>
            {busy === 'suggest' ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            按处方推荐
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {catalogEntries.length === 0 ? (
            <p className="text-xs text-muted-foreground">参照库暂无可解析折射率的镜片；请到「内容管理 · 参照库」录入，或使用下方人工录入。</p>
          ) : (
            <>
              <Select
                value={chosen?.catalogItemId ?? ''}
                onValueChange={(value) => {
                  const entry = catalogEntries.find(candidate => candidate.catalogItemId === value)
                  if (entry !== undefined) void validate(entry)
                }}
              >
                <SelectTrigger className="w-full"><SelectValue placeholder="选择一条镜片进行校验" /></SelectTrigger>
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

      <ManualLensCard disabled={target.phase !== 'ready' || busy !== undefined} onValidate={validate} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">决策与产出</CardTitle>
          <CardDescription>校验通过后把所选镜片写入工单的选片阶段产出。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {chosen === undefined ? (
            <p className="text-xs text-muted-foreground">尚未选定候选镜片。</p>
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

/** Manual lens entry for candidates not in the reference library. */
function ManualLensCard({ disabled, onValidate }: {
  readonly disabled: boolean
  readonly onValidate: (entry: CandidateEntry) => Promise<void>
}) {
  const [index, setIndex] = useState('')
  const [lensType, setLensType] = useState<LensCandidate['lensType']>('single')
  const [features, setFeatures] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  const submit = (): void => {
    const parsedIndex = Number(index.trim())
    if (!Number.isFinite(parsedIndex) || parsedIndex <= 0) { setNotice('折射率必填且为正数，如 1.60。'); return }
    setNotice(null)
    const candidate: LensCandidate = {
      index: parsedIndex,
      lensType,
      features: features.split(',').map(part => part.trim()).filter(part => part.length > 0),
    }
    void onValidate({ label: `手填：${String(parsedIndex)}，${LENS_TYPE_LABELS[lensType]}`, candidate })
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">人工录入候选镜片</CardTitle>
        <CardDescription>不在参照库内的镜片：录入折射率、片型与功能后同样按处方校验。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <FieldGroup>
          <div className="grid grid-cols-3 gap-4">
            <Field>
              <FieldLabel htmlFor="m-lens-index">折射率</FieldLabel>
              <Input id="m-lens-index" inputMode="decimal" placeholder="1.60" value={index} onChange={(event) => { setIndex(event.target.value) }} />
            </Field>
            <Field>
              <FieldLabel>片型</FieldLabel>
              <Select value={lensType} onValueChange={(value) => { setLensType(value as LensCandidate['lensType']) }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(LENS_TYPE_LABELS) as LensCandidate['lensType'][]).map(type => (
                    <SelectItem key={type} value={type}>{LENS_TYPE_LABELS[type]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="m-lens-features">功能（逗号分隔）</FieldLabel>
              <Input id="m-lens-features" placeholder="uv, blue-light" value={features} onChange={(event) => { setFeatures(event.target.value) }} />
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

/** Whether two candidates carry the same index/type/features (suggest preserves the input objects). */
function sameCandidate(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

/** Map one chosen lens onto the stage-3 inputs. */
function inputsOf(entry: CandidateEntry): LensStageInput & Record<string, JsonValue> {
  const candidate = entry.candidate
  return {
    index: candidate.index,
    lensType: candidate.lensType,
    features: [...candidate.features],
    ...(entry.catalogItemId === undefined ? {} : { catalogItemId: entry.catalogItemId }),
  }
}

/** Map one chosen lens onto the stage-3 artifact. */
function artifactOf(entry: CandidateEntry): LensStageArtifact & Record<string, JsonValue> {
  const candidate = entry.candidate
  return {
    lensName: entry.label,
    index: candidate.index,
    lensType: candidate.lensType,
    features: [...candidate.features],
  }
}
