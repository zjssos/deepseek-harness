/**
 * Shared inputs for the 选框 / 选片 stages: resolve the prescription and fitting
 * advice produced by the 验光 stage (via the referenced fitting record), load
 * the candidate catalog rows, and map catalog vocabulary onto the recommend
 * engine's candidate vocabulary.
 */
import { useEffect, useState } from 'react'

// Type-only: pulls the generated `remote.rxlabRecommend` namespace declarations.
import type {} from '@deepseek-ai/dsh-rxlab-recommend/remote'
import type { FrameCandidate, LensCandidate } from '@deepseek-ai/dsh-rxlab-recommend/types'
import type { FittingRecommendation, FittingRecordId, Prescription } from '@deepseek-ai/dsh-rxlab-fitting/types'
import type { StageRecord } from '@deepseek-ai/dsh-rxlab-job/types'
import type { WikiItem } from '@deepseek-ai/dsh-rxlab-catalog/types'
import type { RxlabClientRuntime } from '@/rxlab/client'

/** The prescription target a candidate is validated against. */
export interface ExamTarget {
  readonly prescription: Prescription
  readonly advice: FittingRecommendation
  /** The fitting record the target was derived from, for provenance. */
  readonly fittingRecordId: string
}

/** Resolution state of the 验光 stage target. */
export type ExamTargetState =
  | { readonly phase: 'loading' }
  | { readonly phase: 'missing'; readonly reason: string }
  | { readonly phase: 'error'; readonly error: string }
  | { readonly phase: 'ready'; readonly target: ExamTarget }

/** Read the stage-1 inputs' fitting-record reference from stored JSON. */
export function fittingRecordIdOf(inputs: unknown): string | undefined {
  if (typeof inputs !== 'object' || inputs === null || Array.isArray(inputs)) return undefined
  const id = (inputs as Record<string, unknown>).fittingRecordId
  return typeof id === 'string' && id.length > 0 ? id : undefined
}

/**
 * Resolve the 验光 target from the bound job's stage rows: the exam stage's
 * `fittingRecordId` → `rxlabFitting.get` → `rxlabFitting.derive`. Both the
 * prescription and the fitting advice must derive, otherwise the stage reports
 * `missing`.
 * @param runtime - ready client runtime.
 * @param connected - browser transport ready.
 * @param stages - the bound job's stage rows.
 * @returns the derivation state.
 */
export function useExamTarget(
  runtime: RxlabClientRuntime | undefined,
  connected: boolean,
  stages: readonly StageRecord[],
): ExamTargetState {
  const recordId = fittingRecordIdOf(stages.find(record => record.stage === 'exam')?.inputs)
  const [state, setState] = useState<ExamTargetState>({ phase: 'loading' })

  useEffect(() => {
    if (runtime === undefined || !connected) return
    if (recordId === undefined) {
      setState({ phase: 'missing', reason: '验光阶段尚未写入 fitting 记录引用；请先在「验光」阶段完成并采纳处方。' })
      return
    }
    let alive = true
    setState({ phase: 'loading' })
    void runtime.remote.rxlabFitting.get({ id: recordId as FittingRecordId })
      .then(async (record) => {
        if (!record.ok) throw new Error(`${record.error.code}: ${record.error.message}`)
        const derived = await runtime.remote.rxlabFitting.derive({ record: record.value.record })
        if (!derived.ok) throw new Error(`${derived.error.code}: ${derived.error.message}`)
        if (derived.value.prescription === null || derived.value.recommendation === null) {
          if (alive) setState({ phase: 'missing', reason: `验光未通过校验，无法作为选框/选片目标：${derived.value.summary}` })
          return
        }
        if (alive) {
          setState({
            phase: 'ready',
            target: {
              prescription: derived.value.prescription,
              advice: derived.value.recommendation,
              fittingRecordId: recordId,
            },
          })
        }
      })
      .catch((cause: unknown) => {
        if (alive) setState({ phase: 'error', error: cause instanceof Error ? cause.message : String(cause) })
      })
    return () => { alive = false }
  }, [runtime, connected, recordId])

  return state
}

/** Catalog rows of one kind, loaded in full so recommendation sees geometry. */
export interface CatalogItemsState {
  readonly phase: 'loading' | 'ready' | 'error'
  readonly items: readonly WikiItem[]
  readonly error?: string
}

/** Load every full catalog row of one kind (frame or lens). */
export function useCatalogItems(
  runtime: RxlabClientRuntime | undefined,
  connected: boolean,
  kind: 'frame' | 'lens',
): CatalogItemsState {
  const [state, setState] = useState<CatalogItemsState>({ phase: 'loading', items: [] })
  useEffect(() => {
    if (runtime === undefined || !connected) return
    let alive = true
    setState({ phase: 'loading', items: [] })
    void runtime.remote.rxlabCatalog.list({ kind })
      .then(async (listed) => {
        if (!alive) return
        if (!listed.ok) throw new Error(`${listed.error.code}: ${listed.error.message}`)
        const details = await Promise.all(listed.value.items.map(item => runtime.remote.rxlabCatalog.get({ id: item.id })))
        if (!alive) return
        const items = details.flatMap(entry => (entry.ok ? [entry.value.item] : []))
        setState({ phase: 'ready', items })
      })
      .catch((cause: unknown) => {
        if (alive) setState({ phase: 'error', items: [], error: cause instanceof Error ? cause.message : String(cause) })
      })
    return () => { alive = false }
  }, [runtime, connected, kind])
  return state
}

const FRAME_TYPE_MAP: Record<string, FrameCandidate['frameType']> = {
  'full-rim': 'full',
  'semi-rimless': 'half',
  rimless: 'rimless',
}

/** Map one catalog frame row onto a recommend frame candidate; undefined when geometry is missing. */
export function frameCandidateOf(item: WikiItem): { readonly candidate: FrameCandidate; readonly label: string } | undefined {
  if (item.kind !== 'frame') return undefined
  if (item.lensWidth === undefined || item.bridgeWidth === undefined) return undefined
  const frameType = item.frameType === undefined ? 'full' : FRAME_TYPE_MAP[item.frameType] ?? 'full'
  return {
    candidate: {
      frameType,
      lensWidthA: item.lensWidth,
      bridgeDbl: item.bridgeWidth,
      ...(item.totalWidth === undefined ? {} : { frameWidth: item.totalWidth }),
      ...(item.templeLength === undefined ? {} : { templeLength: item.templeLength }),
      ...(item.weightG === undefined ? {} : { weight: item.weightG }),
      ...(item.frameShape === undefined ? {} : { shape: item.frameShape }),
    },
    label: item.name,
  }
}

const LENS_TYPE_MAP: Record<string, LensCandidate['lensType']> = {
  'single-vision': 'single',
  progressive: 'progressive',
  bifocal: 'bifocal',
  office: 'office',
}

/** Map one catalog lens row onto a recommend lens candidate; undefined when the index is unparseable. */
export function lensCandidateOf(item: WikiItem): { readonly candidate: LensCandidate; readonly label: string } | undefined {
  if (item.kind !== 'lens') return undefined
  const index = Number(item.refractiveIndex)
  if (!Number.isFinite(index)) return undefined
  const lensType = LENS_TYPE_MAP[item.lensType] ?? 'single'
  return {
    candidate: { index, lensType, features: [...(item.lensFunctions ?? [])] },
    label: `${item.name}（${item.refractiveIndex}，${item.lensType}）`,
  }
}
