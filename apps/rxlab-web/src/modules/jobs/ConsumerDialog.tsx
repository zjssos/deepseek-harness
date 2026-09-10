/**
 * Consumer-profile create/edit dialog shared by the work-order list and detail
 * pages. Builds the wire {@link ConsumerProfile} from string fields and reports
 * the first validation failure instead of throwing.
 */
import { useEffect, useState } from 'react'
import { CircleAlert, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { ConsumerProfile, ConsumerStyle, ConsumerUsage, Money } from '@deepseek-ai/dsh-rxlab-job/types'
import { USAGE_LABELS, USAGE_OPTIONS } from './consumer'

const RIM_TYPES = ['full', 'half', 'rimless'] as const
const RIM_TYPE_LABELS: Record<(typeof RIM_TYPES)[number], string> = {
  full: '全框',
  half: '半框',
  rimless: '无框',
}

/** Props for {@link ConsumerDialog}. */
export interface ConsumerDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  /** Seed values for an edit; undefined opens the create form. */
  readonly initial?: ConsumerProfile | undefined
  readonly title: string
  /** Resolve to close the dialog; reject to show the message in place. */
  readonly onSubmit: (consumer: ConsumerProfile) => Promise<void>
}

/** Read one trimmed string field, or undefined when blank. */
function text(values: Record<string, string>, key: string): string | undefined {
  const value = (values[key] ?? '').trim()
  return value.length === 0 ? undefined : value
}

/** Parse one optional non-negative number field, reporting the first failure. */
function optionalNumber(
  values: Record<string, string>,
  key: string,
  label: string,
  report: (message: string) => void,
): number | undefined {
  const raw = (values[key] ?? '').trim()
  if (raw.length === 0) return undefined
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) {
    report(`「${label}」需要是 0 或正数。`)
    return undefined
  }
  return parsed
}

/** Assemble the consumer profile from the dialog's string fields. */
function profileOf(values: Record<string, string>, report: (message: string) => void): ConsumerProfile | undefined {
  const age = optionalNumber(values, 'age', '年龄', report)
  const faceWidthMm = optionalNumber(values, 'faceWidthMm', '面宽', report)
  const budgetAmount = optionalNumber(values, 'budgetAmount', '预算金额', report)
  if (age === undefined && (values.age ?? '').trim() !== '') return undefined
  if (faceWidthMm === undefined && (values.faceWidthMm ?? '').trim() !== '') return undefined
  if (budgetAmount === undefined && (values.budgetAmount ?? '').trim() !== '') return undefined

  const budget: Money | undefined = budgetAmount === undefined
    ? undefined
    : { amount: budgetAmount, currency: text(values, 'budgetCurrency') ?? 'CNY' }
  const style: ConsumerStyle | undefined = (() => {
    const shapePref = text(values, 'shapePref')
    const rimTypePref = text(values, 'rimTypePref')
    const colorPref = text(values, 'colorPref')
    if (shapePref === undefined && rimTypePref === undefined && colorPref === undefined) return undefined
    return {
      ...(shapePref === undefined ? {} : { shapePref }),
      ...(rimTypePref === undefined ? {} : { rimTypePref }),
      ...(colorPref === undefined ? {} : { colorPref }),
    }
  })()
  const oldRx = text(values, 'oldRx')
  const name = text(values, 'name')
  const usage = text(values, 'usage') as ConsumerUsage | undefined

  return {
    ...(name === undefined ? {} : { name }),
    ...(age === undefined ? {} : { age }),
    ...(faceWidthMm === undefined ? {} : { faceWidthMm }),
    ...(usage === undefined ? {} : { usage }),
    ...(budget === undefined ? {} : { budget }),
    ...(style === undefined ? {} : { style }),
    ...(oldRx === undefined ? {} : { oldRx }),
  }
}

/** String-field snapshot of an existing consumer profile. */
function valuesOf(consumer: ConsumerProfile | undefined): Record<string, string> {
  if (consumer === undefined) return { budgetCurrency: 'CNY' }
  return {
    ...(consumer.name === undefined ? {} : { name: consumer.name }),
    ...(consumer.age === undefined ? {} : { age: String(consumer.age) }),
    ...(consumer.faceWidthMm === undefined ? {} : { faceWidthMm: String(consumer.faceWidthMm) }),
    ...(consumer.usage === undefined ? {} : { usage: consumer.usage }),
    ...(consumer.budget === undefined ? {} : {
      budgetAmount: String(consumer.budget.amount),
      budgetCurrency: consumer.budget.currency,
    }),
    ...(consumer.style?.shapePref === undefined ? {} : { shapePref: consumer.style.shapePref }),
    ...(consumer.style?.rimTypePref === undefined ? {} : { rimTypePref: consumer.style.rimTypePref }),
    ...(consumer.style?.colorPref === undefined ? {} : { colorPref: consumer.style.colorPref }),
    ...(typeof consumer.oldRx === 'string' ? { oldRx: consumer.oldRx } : {}),
  }
}

/** Create/edit one work order's consumer profile. */
export function ConsumerDialog({ open, onOpenChange, initial, title, onSubmit }: ConsumerDialogProps) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setValues(valuesOf(initial))
    setNotice(null)
    setBusy(false)
  }, [open, initial])

  const setField = (key: string, value: string): void => {
    setValues(current => ({ ...current, [key]: value }))
  }

  const submit = async (): Promise<void> => {
    if (busy) return
    const consumer = profileOf(values, setNotice)
    if (consumer === undefined) return
    setBusy(true)
    setNotice(null)
    try {
      await onSubmit(consumer)
      onOpenChange(false)
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next) }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>录入消费者画像；除姓名外均可留空，后续仍可编辑。</DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="consumer-name">姓名</FieldLabel>
              <Input id="consumer-name" value={values.name ?? ''} placeholder="如 张三"
                onChange={(event) => { setField('name', event.target.value) }} />
            </Field>
            <Field>
              <FieldLabel htmlFor="consumer-age">年龄</FieldLabel>
              <Input id="consumer-age" inputMode="numeric" value={values.age ?? ''}
                onChange={(event) => { setField('age', event.target.value) }} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="consumer-face">面宽 (mm)</FieldLabel>
              <Input id="consumer-face" inputMode="decimal" value={values.faceWidthMm ?? ''}
                onChange={(event) => { setField('faceWidthMm', event.target.value) }} />
            </Field>
            <Field>
              <FieldLabel>主要用途</FieldLabel>
              <Select value={values.usage ?? ''} onValueChange={(value) => { setField('usage', value) }}>
                <SelectTrigger><SelectValue placeholder="请选择" /></SelectTrigger>
                <SelectContent>
                  {USAGE_OPTIONS.map(option => (
                    <SelectItem key={option} value={option}>{USAGE_LABELS[option]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="consumer-budget">预算金额</FieldLabel>
              <Input id="consumer-budget" inputMode="decimal" value={values.budgetAmount ?? ''}
                onChange={(event) => { setField('budgetAmount', event.target.value) }} />
            </Field>
            <Field>
              <FieldLabel htmlFor="consumer-currency">币种</FieldLabel>
              <Input id="consumer-currency" value={values.budgetCurrency ?? ''} placeholder="CNY"
                onChange={(event) => { setField('budgetCurrency', event.target.value) }} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Field>
              <FieldLabel htmlFor="consumer-shape">形状偏好</FieldLabel>
              <Input id="consumer-shape" value={values.shapePref ?? ''} placeholder="如 方框"
                onChange={(event) => { setField('shapePref', event.target.value) }} />
            </Field>
            <Field>
              <FieldLabel>框型偏好</FieldLabel>
              <Select value={values.rimTypePref ?? ''} onValueChange={(value) => { setField('rimTypePref', value) }}>
                <SelectTrigger><SelectValue placeholder="不限" /></SelectTrigger>
                <SelectContent>
                  {RIM_TYPES.map(type => (
                    <SelectItem key={type} value={type}>{RIM_TYPE_LABELS[type]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="consumer-color">颜色偏好</FieldLabel>
              <Input id="consumer-color" value={values.colorPref ?? ''} placeholder="如 黑色"
                onChange={(event) => { setField('colorPref', event.target.value) }} />
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="consumer-olds">旧镜处方 / 备注</FieldLabel>
            <Textarea id="consumer-olds" className="h-20" value={values.oldRx ?? ''}
              placeholder="可选：旧镜度数、佩戴年限等自由文本"
              onChange={(event) => { setField('oldRx', event.target.value) }} />
          </Field>
        </FieldGroup>

        {notice !== null ? (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span className="whitespace-pre-wrap">{notice}</span>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => { onOpenChange(false) }}>取消</Button>
          <Button disabled={busy} onClick={() => { void submit() }}>
            {busy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
