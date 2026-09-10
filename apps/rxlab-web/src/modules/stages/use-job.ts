/**
 * Work-order data hooks shared by the 工单总览 / 工单详情 pages and every stage
 * panel: list/get/create/update/bindSession/upsertStage/generateGuide/delete over
 * the generated `remote.rxlabJob` namespace, plus the `remote.rxlabUsage.jobUsage`
 * token/cost read. Reads use controlled refresh state (a nonce bumped after each
 * mutation), matching the fitting/catalog hook convention.
 */
import { useCallback, useEffect, useState } from 'react'

// Type-only: pulls the generated `remote.rxlabJob` namespace declarations into
// the ClientRemote type shared with the rest of the workbench.
import type {} from '@deepseek-ai/dsh-rxlab-job/remote'
// Type-only: pulls the generated `remote.rxlabUsage` namespace declarations.
import type {} from '@deepseek-ai/dsh-rxlab-usage/remote'
import type {
  ConsumerProfile,
  GuideDocument,
  JobId,
  JobPatch,
  JobRecord,
  JobSummary,
  StageId,
  StagePatch,
  StageRecord,
} from '@deepseek-ai/dsh-rxlab-job/types'
import type { JobUsageValue } from '@deepseek-ai/dsh-rxlab-usage/types'
import type { RxlabClientRuntime } from '@/rxlab/client'

export type LoadPhase = 'loading' | 'ready' | 'error'

/** One job list fetch snapshot. */
export interface JobListState {
  readonly phase: LoadPhase
  readonly items: readonly JobSummary[]
  readonly error?: string
}

/** One running job list plus a manual refresh trigger. */
export interface JobListController {
  readonly state: JobListState
  readonly reload: () => void
}

/** Human-readable failure text for a rejected Remote result. */
function failure(error: { readonly code: string; readonly message: string }): string {
  return `${error.code}: ${error.message}`
}

/**
 * Fetch the work-order list whenever the runtime connects, the query changes,
 * or a mutation asks for a refresh.
 * @param runtime - ready client runtime; absent keeps the list empty.
 * @param connected - whether the browser transport generation is established.
 * @param query - case-insensitive consumer-name substring.
 * @returns the last fetch snapshot and a reload trigger.
 */
export function useJobList(
  runtime: RxlabClientRuntime | undefined,
  connected: boolean,
  query: string,
): JobListController {
  const [state, setState] = useState<JobListState>({ phase: 'loading', items: [] })
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => { setNonce(value => value + 1) }, [])
  const queryKey = query.trim()

  useEffect(() => {
    if (runtime === undefined || !connected || runtime.remote.rxlabJob === undefined) return
    let alive = true
    setState({ phase: 'loading', items: [] })
    void runtime.remote.rxlabJob.listJobs({
      ...(queryKey.length === 0 ? {} : { query: queryKey }),
    })
      .then((result) => {
        if (!alive) return
        if (!result.ok) {
          setState({ phase: 'error', items: [], error: failure(result.error) })
          return
        }
        setState({ phase: 'ready', items: result.value.items })
      })
      .catch((cause: unknown) => {
        if (alive) {
          setState({ phase: 'error', items: [], error: cause instanceof Error ? cause.message : String(cause) })
        }
      })
    return () => { alive = false }
  }, [runtime, connected, queryKey, nonce])

  return { state, reload }
}

/** One full job projection (job, stage rows, guide). */
export interface JobDetail {
  readonly job: JobRecord
  readonly stages: readonly StageRecord[]
  readonly guide?: GuideDocument
}

/** One running job-detail fetch plus a manual refresh trigger. */
export interface JobDetailController {
  readonly state:
    | { readonly phase: 'loading' }
    | { readonly phase: 'error'; readonly error: string }
    | { readonly phase: 'ready'; readonly detail: JobDetail }
  readonly reload: () => void
}

/** Load one job's full projection, refetching on id/connection/mutation change. */
export function useJobDetail(
  runtime: RxlabClientRuntime | undefined,
  connected: boolean,
  id: JobId | undefined,
): JobDetailController {
  const [state, setState] = useState<JobDetailController['state']>({ phase: 'loading' })
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => { setNonce(value => value + 1) }, [])

  useEffect(() => {
    if (runtime === undefined || !connected || id === undefined || runtime.remote.rxlabJob === undefined) return
    let alive = true
    setState({ phase: 'loading' })
    void runtime.remote.rxlabJob.getJob({ id })
      .then((result) => {
        if (!alive) return
        if (!result.ok) {
          setState({ phase: 'error', error: failure(result.error) })
          return
        }
        setState({
          phase: 'ready',
          detail: {
            job: result.value.job,
            stages: result.value.stages,
            ...(result.value.guide === undefined ? {} : { guide: result.value.guide }),
          },
        })
      })
      .catch((cause: unknown) => {
        if (alive) setState({ phase: 'error', error: cause instanceof Error ? cause.message : String(cause) })
      })
    return () => { alive = false }
  }, [runtime, connected, id, nonce])

  return { state, reload }
}

/** Fetch one job's full projection; throws the readable failure text. */
export async function getJob(runtime: RxlabClientRuntime, id: JobId): Promise<JobDetail> {
  const result = await requireJobRemote(runtime).getJob({ id })
  if (!result.ok) throw new Error(failure(result.error))
  return {
    job: result.value.job,
    stages: result.value.stages,
    ...(result.value.guide === undefined ? {} : { guide: result.value.guide }),
  }
}

/** Open one draft work order for a consumer profile. */
export async function createJob(runtime: RxlabClientRuntime, consumer: ConsumerProfile): Promise<JobRecord> {
  const result = await requireJobRemote(runtime).createJob({ consumer })
  if (!result.ok) throw new Error(failure(result.error))
  return result.value.job
}

/** Patch one job's consumer/pricing/status. */
export async function updateJob(runtime: RxlabClientRuntime, id: JobId, patch: JobPatch): Promise<JobRecord> {
  const result = await requireJobRemote(runtime).updateJob({ id, patch })
  if (!result.ok) throw new Error(failure(result.error))
  return result.value.job
}

/** Bind the agent session working one job. */
export async function bindSession(runtime: RxlabClientRuntime, id: JobId, sessionId: string): Promise<JobRecord> {
  const result = await requireJobRemote(runtime).bindSession({ id, sessionId })
  if (!result.ok) throw new Error(failure(result.error))
  return result.value.job
}

/** Create or update one job's stage row. */
export async function upsertStage(
  runtime: RxlabClientRuntime,
  jobId: JobId,
  stage: StageId,
  patch: StagePatch,
): Promise<StageRecord> {
  const result = await requireJobRemote(runtime).upsertStage({ jobId, stage, patch })
  if (!result.ok) throw new Error(failure(result.error))
  return result.value.stage
}

/** Assemble and store one job's guide document. */
export async function generateGuide(runtime: RxlabClientRuntime, jobId: JobId): Promise<GuideDocument> {
  const result = await requireJobRemote(runtime).generateGuide({ jobId })
  if (!result.ok) throw new Error(failure(result.error))
  return result.value.document
}

/** Delete one job and its owned stage/guide rows. */
export async function deleteJob(runtime: RxlabClientRuntime, id: JobId): Promise<boolean> {
  const result = await requireJobRemote(runtime).deleteJob({ id })
  if (!result.ok) throw new Error(failure(result.error))
  return result.value.removed
}

/** One job's aggregated token/cost usage as read from `rxlabUsage.jobUsage`. */
export type JobUsageState =
  | { readonly phase: 'loading' }
  | { readonly phase: 'error'; readonly error: string }
  | { readonly phase: 'ready'; readonly usage: JobUsageValue }

/** One job-usage fetch plus a manual refresh trigger. */
export interface JobUsageController {
  readonly state: JobUsageState
  readonly reload: () => void
}

/** Fetch one job's token/cost usage, refetching on id/connection/refresh change. */
export function useJobUsage(
  runtime: RxlabClientRuntime | undefined,
  connected: boolean,
  id: JobId | undefined,
): JobUsageController {
  const [state, setState] = useState<JobUsageState>({ phase: 'loading' })
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => { setNonce(value => value + 1) }, [])

  useEffect(() => {
    if (runtime === undefined || !connected || id === undefined || runtime.remote.rxlabUsage === undefined) return
    let alive = true
    setState({ phase: 'loading' })
    void runtime.remote.rxlabUsage.jobUsage({ jobId: id })
      .then((result) => {
        if (!alive) return
        if (!result.ok) {
          setState({ phase: 'error', error: failure(result.error) })
          return
        }
        setState({ phase: 'ready', usage: result.value })
      })
      .catch((cause: unknown) => {
        if (alive) setState({ phase: 'error', error: cause instanceof Error ? cause.message : String(cause) })
      })
    return () => { alive = false }
  }, [runtime, connected, id, nonce])

  return { state, reload }
}

/** The generated job namespace, or a loud failure when the row is not composed. */
function requireJobRemote(runtime: RxlabClientRuntime): NonNullable<RxlabClientRuntime['remote']['rxlabJob']> {
  const remote = runtime.remote.rxlabJob
  if (remote === undefined) {
    throw new Error('rxlabJob namespace is not composed in this deployment.')
  }
  return remote
}
