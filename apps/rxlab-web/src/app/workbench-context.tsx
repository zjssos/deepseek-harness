/**
 * The work order the work-order surface is bound to: the overview's list, the
 * workbench, the top-bar picker, and the right context rail all read this one
 * value.
 *
 * Only the work-order surface mounts this provider. The tool modules have no
 * work-order binding, so nothing here reaches them.
 *
 * The `/jobs/<id>` path is authoritative while the workbench is open; anywhere
 * else on the surface the binding is the last work order the operator opened,
 * remembered across reloads in localStorage.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

import type {
  GuideDocument,
  JobId,
  JobRecord,
  JobSummary,
  StageId,
  StageRecord,
  StageStatus,
} from '@deepseek-ai/dsh-rxlab-job/types'
import { STAGE_ORDER } from '@/modules/stages/stage-meta'
import { useJobDetail, useJobList, type LoadPhase } from '@/modules/stages/use-job'
import type { RxlabClientRuntime } from '@/rxlab/client'
import { useConnected, useRxlabClient } from '@/rxlab/use-sessions'

/** localStorage key remembering the last opened work order. */
const STORAGE_KEY = 'rxlab:current-job'

/** localStorage key remembering whether the right context rail is expanded. */
const RAIL_KEY = 'rxlab:context-rail'

/** The work-order workbench route, whose path segment names the open work order. */
const WORK_ORDER_ROUTE = /^\/jobs\/([^/]+)$/

/** Stage rows of a work-order surface with nothing open. */
const NO_STAGES: readonly StageRecord[] = []

/** Boot lifecycle of the embedded data layer, as the surface reports it. */
export type WorkbenchPhase = 'booting' | 'ready' | 'failed'

/** Fetch lifecycle of the open work order's projection. */
export type WorkbenchDetailPhase = 'idle' | 'loading' | 'error' | 'ready'

/** One stage's progress in the six-stage workflow. */
export interface StageProgress {
  readonly stage: StageId
  readonly status: StageStatus
  /** The stage row's last write; absent until the stage is first saved. */
  readonly updatedAt?: string
}

/** The bound work order plus the state every work-order surface reads. */
export interface WorkbenchJobValue {
  readonly phase: WorkbenchPhase
  readonly error?: string
  readonly runtime: RxlabClientRuntime | undefined
  readonly connected: boolean
  readonly jobs: readonly JobSummary[]
  readonly jobsPhase: LoadPhase
  readonly jobId: JobId | undefined
  readonly job: JobRecord | undefined
  readonly stages: readonly StageRecord[]
  /** The assembled guide document, when one has been generated. */
  readonly guide: GuideDocument | undefined
  readonly detailPhase: WorkbenchDetailPhase
  readonly detailError?: string
  /** Six-stage progress in canonical order; unwritten stages report `pending`. */
  readonly progress: readonly StageProgress[]
  /** Whether the right context rail is expanded. */
  readonly railOpen: boolean
  /** Bind or unbind the work order the surface acts on. */
  readonly selectJob: (id: JobId | undefined) => void
  readonly setRailOpen: (open: boolean) => void
  /** Re-read the bound work order after a stage or job write. */
  readonly reload: () => void
}

const WorkbenchJobContext = createContext<WorkbenchJobValue | undefined>(undefined)

/** The work order named by a path, when that path is the workbench route. */
function routeJobId(pathname: string): JobId | undefined {
  const segment = WORK_ORDER_ROUTE.exec(pathname)?.[1]
  return segment === undefined || segment.length === 0 ? undefined : (segment as JobId)
}

/** The remembered work order, or nothing when storage holds none. */
export function rememberedJobId(): JobId | undefined {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  return raw === null || raw.length === 0 ? undefined : (raw as JobId)
}

/**
 * Provides the work-order surface's bound work order, the data-layer lifecycle,
 * and the context-rail state. Mount only around the work-order routes.
 * @param props - The work-order subtree.
 * @returns The workbench job provider element.
 */
export function WorkbenchJobProvider({ children }: { readonly children: ReactNode }) {
  const { phase, error, runtime } = useRxlabClient()
  const connected = useConnected(runtime)
  const { pathname } = useLocation()
  const [remembered, setRemembered] = useState<JobId | undefined>(rememberedJobId)
  const [railOpen, setRailOpenState] = useState(() => window.localStorage.getItem(RAIL_KEY) !== 'closed')

  const pathJobId = routeJobId(pathname)
  const jobId = pathJobId ?? remembered

  // Opening a work order makes it the remembered one, so the overview and the
  // stage redirects resolve to the work order the operator last looked at.
  useEffect(() => {
    if (pathJobId === undefined) return
    window.localStorage.setItem(STORAGE_KEY, pathJobId)
    setRemembered(pathJobId)
  }, [pathJobId])

  const jobList = useJobList(runtime, connected, '')
  const detail = useJobDetail(runtime, connected, jobId)
  const reload = detail.reload

  const selectJob = useCallback((id: JobId | undefined): void => {
    if (id === undefined) window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, id)
    setRemembered(id)
  }, [])

  const setRailOpen = useCallback((open: boolean): void => {
    setRailOpenState(open)
    window.localStorage.setItem(RAIL_KEY, open ? 'open' : 'closed')
  }, [])

  const detailState = detail.state
  const job = detailState.phase === 'ready' ? detailState.detail.job : undefined
  const stages = detailState.phase === 'ready' ? detailState.detail.stages : NO_STAGES
  const guide = detailState.phase === 'ready' ? detailState.detail.guide : undefined

  const progress = useMemo<readonly StageProgress[]>(
    () => STAGE_ORDER.map((stage) => {
      const record = stages.find(entry => entry.stage === stage)
      if (record === undefined) return { stage, status: 'pending' as const }
      return { stage, status: record.status, updatedAt: record.updatedAt }
    }),
    [stages],
  )

  const value = useMemo<WorkbenchJobValue>(() => ({
    phase,
    ...(error === undefined ? {} : { error }),
    runtime,
    connected,
    jobs: jobList.state.items,
    jobsPhase: jobList.state.phase,
    jobId,
    job,
    stages,
    guide,
    detailPhase: jobId === undefined ? 'idle' : detailState.phase,
    ...(detailState.phase === 'error' ? { detailError: detailState.error } : {}),
    progress,
    railOpen,
    selectJob,
    setRailOpen,
    reload,
  }), [
    phase, error, runtime, connected, jobList.state, jobId, job, stages, guide,
    detailState, progress, railOpen, selectJob, setRailOpen, reload,
  ])

  return <WorkbenchJobContext.Provider value={value}>{children}</WorkbenchJobContext.Provider>
}

/**
 * Read the work-order surface's binding and rail state.
 * @returns The current {@link WorkbenchJobValue}.
 */
export function useWorkbenchJob(): WorkbenchJobValue {
  const value = useContext(WorkbenchJobContext)
  if (value === undefined) {
    throw new Error('useWorkbenchJob must be used within WorkbenchJobProvider.')
  }
  return value
}

/** Build the work-order workbench path for one stage view. */
export function jobStagePath(stage: StageId, jobId: JobId | undefined): string {
  return jobId === undefined ? '/jobs' : `/jobs/${jobId}?view=${stage}`
}
