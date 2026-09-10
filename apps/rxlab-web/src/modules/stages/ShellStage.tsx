/**
 * Generic form-driven stage shell for 加工 / 取镜 / 售后 (stages 4-6): an input
 * form, an artifact form, and a stage checklist, all persisted to the bound
 * work order's stage row. Fields are declared per stage; values serialize to
 * the stage's JSON inputs/outputs.
 */
import { useEffect, useState } from 'react'
import { CircleAlert, ListChecks, Loader2, Save } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { StageId, StageRecord, StageStatus } from '@deepseek-ai/dsh-rxlab-job/types'
import { useConnected } from '@/rxlab/use-sessions'
import { StageShell, type StageContext } from './StageShell'
import { ReportChecks } from './ReportChecks'
import { STAGE_LABELS, STAGE_TAGLINES } from './stage-meta'
import { upsertStage } from './use-job'

/** One declared form field of a shell stage. */
export interface ShellField {
  readonly key: string
  readonly label: string
  readonly kind: 'text' | 'number' | 'list'
  readonly placeholder?: string
}

/** One shell stage's declaration. */
export interface ShellStageSpec {
  readonly stage: StageId
  readonly inputFields: readonly ShellField[]
  readonly outputFields: readonly ShellField[]
  /** Deterministic checklist shown beside the forms. */
  readonly checklist: readonly string[]
}

/** Render one configured shell-stage panel; the default export the registry lazy-loads. */
export function ShellStagePanel(props: ShellStageSpec) {
  return <StageShell stage={props.stage}>{context => <ShellWorkbench context={context} spec={props} />}</StageShell>
}

/** Serialize one field's string form value into its JSON value (undefined drops the key). */
function fieldValue(field: ShellField, raw: string): JsonValue | undefined {
  const value = raw.trim()
  if (value.length === 0) return undefined
  if (field.kind === 'number') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  if (field.kind === 'list') {
    return value.split(',').map(part => part.trim()).filter(part => part.length > 0)
  }
  return value
}

/** Build the JSON object for one field group; reports the first invalid number. */
function buildObject(
  fields: readonly ShellField[],
  values: Record<string, string>,
  report: (message: string) => void,
): JsonValue | undefined {
  const out: Record<string, JsonValue> = {}
  for (const field of fields) {
    const raw = (values[field.key] ?? '').trim()
    if (raw.length === 0) continue
    if (field.kind === 'number' && !Number.isFinite(Number(raw))) {
      report(`「${field.label}」需要是数字。`)
      return undefined
    }
    const value = fieldValue(field, raw)
    if (value !== undefined) out[field.key] = value
  }
  return out
}

/** Seed form values from a stored stage's JSON groups. */
function seed(values: JsonValue | undefined, fields: readonly ShellField[]): Record<string, string> {
  const out: Record<string, string> = {}
  if (typeof values !== 'object' || values === null || Array.isArray(values)) return out
  const record = values as Record<string, JsonValue>
  for (const field of fields) {
    const value = record[field.key]
    if (value === undefined || value === null) continue
    if (field.kind === 'list' && Array.isArray(value)) {
      out[field.key] = value
        .filter((part): part is string => typeof part === 'string')
        .join(', ')
    } else if (typeof value === 'string' || typeof value === 'number') out[field.key] = String(value)
  }
  return out
}

/** The 加工 / 取镜 / 售后 shell: input + artifact forms and a checklist. */
function ShellWorkbench({ context, spec }: { readonly context: StageContext; readonly spec: ShellStageSpec }) {
  const connected = useConnected(context.runtime)
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [outputs, setOutputs] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const stageKey = context.stageRecord?.updatedAt ?? ''

  useEffect(() => {
    setInputs(seed(context.stageRecord?.inputs, spec.inputFields))
    setOutputs(seed(context.stageRecord?.outputs, spec.outputFields))
    // Re-seed only when the stored stage row changes identity, not on every render.
  }, [stageKey, spec])

  const save = async (): Promise<void> => {
    if (busy || !connected) return
    setBanner(null)
    const inputJson = buildObject(spec.inputFields, inputs, setBanner)
    if (inputJson === undefined) return
    const outputJson = buildObject(spec.outputFields, outputs, setBanner)
    if (outputJson === undefined) return
    setBusy(true)
    try {
      await upsertStage(context.runtime, context.job.id, spec.stage, {
        status: 'done' satisfies StageStatus,
        inputs: inputJson,
        outputs: outputJson,
      })
      context.reload()
    } catch (cause) {
      setBanner(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  if (!connected) return <Skeleton className="h-56 rounded-xl" />

  return (
    <div className="flex flex-col gap-4">
      {context.stageRecord?.checks === undefined ? null : (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">本工单{STAGE_LABELS[spec.stage]}阶段校验</CardTitle></CardHeader>
          <CardContent><ReportChecks report={context.stageRecord.checks} /></CardContent>
        </Card>
      )}

      {banner !== null ? (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span className="whitespace-pre-wrap">{banner}</span>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <FieldForm
          title="投入"
          description={STAGE_TAGLINES[spec.stage]}
          fields={spec.inputFields}
          values={inputs}
          onChange={(key, value) => { setInputs(current => ({ ...current, [key]: value })) }}
        />
        <FieldForm
          title="产出 artifact"
          description="加工/交付/随访的实际结果，将进入指南。"
          fields={spec.outputFields}
          values={outputs}
          onChange={(key, value) => { setOutputs(current => ({ ...current, [key]: value })) }}
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm"><ListChecks className="size-4 text-muted-foreground" />清单</CardTitle>
          <CardDescription>该阶段的确定性检查清单（内容管理可维护话术，清单随里程碑扩展）。</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            {spec.checklist.map(item => <li key={item}>{item}</li>)}
          </ul>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button size="sm" className="gap-1.5" disabled={busy} onClick={() => { void save() }}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          保存阶段
        </Button>
        <StageStateLabel record={context.stageRecord} />
      </div>
    </div>
  )
}

/** One declared field group rendered as a FieldGroup. */
function FieldForm({
  title, description, fields, values, onChange,
}: {
  readonly title: string
  readonly description: string
  readonly fields: readonly ShellField[]
  readonly values: Record<string, string>
  readonly onChange: (key: string, value: string) => void
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          {fields.map(field => (
            <Field key={field.key}>
              <FieldLabel htmlFor={`${title}-${field.key}`}>{field.label}</FieldLabel>
              <Input
                id={`${title}-${field.key}`}
                inputMode={field.kind === 'number' ? 'decimal' : undefined}
                placeholder={field.placeholder ?? (field.kind === 'list' ? '逗号分隔' : undefined)}
                value={values[field.key] ?? ''}
                onChange={(event) => { onChange(field.key, event.target.value) }}
              />
            </Field>
          ))}
        </FieldGroup>
      </CardContent>
    </Card>
  )
}

/** Small status line under the save button. */
function StageStateLabel({ record }: { readonly record: StageRecord | undefined }) {
  if (record === undefined) return <span className="text-xs text-muted-foreground">尚未保存</span>
  return <span className="text-xs text-muted-foreground">最近更新：{record.updatedAt}</span>
}
