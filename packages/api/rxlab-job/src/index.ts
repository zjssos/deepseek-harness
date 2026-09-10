/**
 * Host Job Remote owner for the rxlab guide workbench: the `rxlabJob`
 * namespace over the `rxlab_job` storage domain. The controller opens the
 * domain, mints job and stage identities, and answers the work-order and guide
 * RPCs. This package mounts its own namespace on the Client side (see
 * `src/client/index.ts`) and is a rxlab-app data row; it deliberately never
 * joins the platform `api-remotes` assembly, because work orders are
 * rxlab-product data, not a generic Host capability.
 * @module @deepseek-ai/dsh-rxlab-job
 */

import { randomUUID } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { z } from 'zod'
import {
  consumerProfileSchema,
  guideDocumentSchema,
  guideRecordSchema,
  jobDomainSpec,
  jobRecordSchema,
  stageRecordSchema,
} from './domain.ts'
import { assembleGuide, STAGE_ORDER } from './guide.ts'
import type {
  JobBindSessionRequest,
  JobBindSessionValue,
  JobCreateRequest,
  JobCreateValue,
  JobDeleteRequest,
  JobDeleteValue,
  JobGenerateGuideRequest,
  JobGenerateGuideValue,
  JobGetRequest,
  JobGetValue,
  JobId,
  JobListRequest,
  JobListValue,
  JobSummary,
  JobUpdateRequest,
  JobUpdateValue,
  JobUpsertStageRequest,
  JobUpsertStageValue,
  StageId,
  StageRecordId,
} from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host business API and Remote namespace owner for rxlab work orders. */
    jobController: JobController
  }
}

type StoredJobRecord = z.infer<typeof jobRecordSchema>
type StoredStageRecord = z.infer<typeof stageRecordSchema>
type StoredGuideRecord = z.infer<typeof guideRecordSchema>

/** Canonical stage rank; unknown values sort last. */
function stageRank(stage: StageId): number {
  return STAGE_ORDER.indexOf(stage)
}

/** Brand one raw uuid as a job id. */
function newJobId(): JobId {
  return randomUUID() as JobId
}

/** The `${jobId}:${stage}` stage-row key. */
function stageKey(jobId: JobId, stage: StageId): StageRecordId {
  return `${String(jobId)}:${stage}` as StageRecordId
}

/** The `job/not-found` failure for one job id. */
function jobNotFound(id: JobId): RemoteError<'job/not-found'> {
  return new RemoteError('job/not-found', `rxlab job has no work order '${String(id)}'`, { id })
}

/** Validate one wire value against a zod schema or throw the wire failure. */
function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown, subject: string): T {
  const parsed = schema.safeParse(value)
  if (parsed.success) return parsed.data
  throw new RemoteError('gateway/bad-request', `rxlab job ${subject} failed validation`, {
    issues: parsed.error.issues.map(issue => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  })
}

/** Project one stored job onto its list-row summary. */
function summarizeJob(job: StoredJobRecord): JobSummary {
  return {
    id: job.id,
    ...(job.consumer.name === undefined ? {} : { name: job.consumer.name }),
    status: job.status,
    stageIds: job.stageIds,
    ...(job.sessionId === undefined ? {} : { sessionId: job.sessionId }),
    ...(job.pricing === undefined ? {} : { pricing: job.pricing }),
    updatedAt: job.updatedAt,
  }
}

/**
 * Host service backing the generated `ctx.remote.rxlabJob` namespace. Reads
 * are synchronous from the open domain; writes queue on the domain's write
 * chain. Every record passes its domain zod schema here (the wire boundary)
 * so a rejected record can never reach the medium. `generateGuide` assembles
 * the guide deterministically from the stored stage artifacts.
 */
export class JobController extends TypertRemoteService {
  static inject = ['storageDomain']

  private jobs?: KvTable<JobId, StoredJobRecord>
  private stages?: KvTable<StageRecordId, StoredStageRecord>
  private guides?: KvTable<JobId, StoredGuideRecord>

  /**
   * Register the job namespace on the Typert Gateway.
   * @param ctx - Host context carrying the storage-domain facility.
   */
  constructor(ctx: Context) {
    super(ctx, 'jobController', { namespace: 'rxlabJob' })
  }

  /** Open the job domain for the life of this controller. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(jobDomainSpec)
    this.ctx.effect(() => () => domain.close(), 'rxlab_job.domainClose')
    this.jobs = domain.table('jobs')
    this.stages = domain.table('stages')
    this.guides = domain.table('guides')
  }

  /**
   * List jobs, newest write first, with a case-insensitive consumer-name
   * substring match.
   * @param request - query; absent matches everything.
   * @returns matching rows projected to summaries.
   */
  @Remote('listJobs')
  listJobs(request: JobListRequest): Promise<JobListValue> {
    const query = request.query?.trim().toLocaleLowerCase()
    const rows = [...this.requireJobs().entries()]
      .filter(([, job]) =>
        query === undefined || query.length === 0
        || (job.consumer.name !== undefined && job.consumer.name.toLocaleLowerCase().includes(query)))
    rows.sort(([, left], [, right]) =>
      right.updatedAt.localeCompare(left.updatedAt)
      || String(left.id).localeCompare(String(right.id)))
    return Promise.resolve({ items: rows.map(([, job]) => summarizeJob(job)) })
  }

  /**
   * Read one job with its stage rows and stored guide.
   * @param request - target job identity.
   * @returns the job, its stages in canonical order, and its guide when generated.
   * @throws RemoteError `job/not-found` when no job carries the id.
   */
  @Remote('getJob')
  getJob(request: JobGetRequest): Promise<JobGetValue> {
    const job = this.requireJobs().get(request.id)
    if (job === undefined) return Promise.reject(jobNotFound(request.id))
    const stages = [...this.requireStages().entries()]
      .filter(([, stage]) => stage.jobId === request.id)
      .map(([, stage]) => stage)
      .sort((left, right) => stageRank(left.stage) - stageRank(right.stage))
    const guide = this.requireGuides().get(request.id)
    return Promise.resolve({
      job,
      stages,
      ...(guide === undefined ? {} : { guide: guide.document }),
    })
  }

  /**
   * Create one draft job. The job id, timestamps, and default tracked-stage
   * set are minted here, never by callers.
   * @param request - the consumer profile to open the job for.
   * @returns the stored job after durability.
   * @throws RemoteError `gateway/bad-request` when the profile fails its zod schema.
   */
  @Remote('createJob')
  async createJob(request: JobCreateRequest): Promise<JobCreateValue> {
    const consumer = parseOrThrow(consumerProfileSchema, request.consumer, 'consumer profile')
    const now = new Date().toISOString()
    const job = parseOrThrow(jobRecordSchema, {
      id: newJobId(),
      consumer,
      status: 'draft',
      stageIds: [...STAGE_ORDER],
      createdAt: now,
      updatedAt: now,
    }, 'job record')
    await this.requireJobs().put(job.id, job)
    return { job }
  }

  /**
   * Patch one job's consumer, pricing, or status. Absent patch fields keep
   * their stored value; the write timestamp is always minted here.
   * @param request - target job identity and the fields to replace.
   * @returns the stored job after durability.
   * @throws RemoteError `job/not-found` when no job carries the id.
   * @throws RemoteError `gateway/bad-request` when a patched field fails its schema.
   */
  @Remote('updateJob')
  async updateJob(request: JobUpdateRequest): Promise<JobUpdateValue> {
    const existing = this.requireJob(request.id)
    const consumer = request.patch.consumer === undefined
      ? existing.consumer
      : parseOrThrow(consumerProfileSchema, request.patch.consumer, 'consumer profile')
    const job = parseOrThrow(jobRecordSchema, {
      ...existing,
      consumer,
      status: request.patch.status ?? existing.status,
      ...(request.patch.pricing === undefined
        ? existing.pricing === undefined ? {} : { pricing: existing.pricing }
        : { pricing: request.patch.pricing }),
      updatedAt: new Date().toISOString(),
    }, 'job record')
    await this.requireJobs().put(job.id, job)
    return { job }
  }

  /**
   * Bind the agent session working one job.
   * @param request - target job identity and the session id to bind.
   * @returns the stored job after durability.
   * @throws RemoteError `job/not-found` when no job carries the id.
   */
  @Remote('bindSession')
  async bindSession(request: JobBindSessionRequest): Promise<JobBindSessionValue> {
    const existing = this.requireJob(request.id)
    if (request.sessionId.trim().length === 0) {
      throw new RemoteError('gateway/bad-request', 'rxlab job sessionId must be a non-empty string', {})
    }
    const job = parseOrThrow(jobRecordSchema, {
      ...existing,
      sessionId: request.sessionId,
      updatedAt: new Date().toISOString(),
    }, 'job record')
    await this.requireJobs().put(job.id, job)
    return { job }
  }

  /**
   * Create or update one job's stage row. Absent patch fields keep their
   * stored value; a missing row starts `pending` with empty inputs/outputs.
   * @param request - job identity, stage, and the fields to replace.
   * @returns the stored stage row after durability.
   * @throws RemoteError `job/not-found` when no job carries the id.
   * @throws RemoteError `gateway/bad-request` when a patched field fails its zod schema.
   */
  @Remote('upsertStage')
  async upsertStage(request: JobUpsertStageRequest): Promise<JobUpsertStageValue> {
    this.requireJob(request.jobId)
    const key = stageKey(request.jobId, request.stage)
    const existing = this.requireStages().get(key)
    const stage = parseOrThrow(stageRecordSchema, {
      id: key,
      jobId: request.jobId,
      stage: request.stage,
      status: request.patch.status ?? existing?.status ?? 'pending',
      inputs: request.patch.inputs === undefined ? existing?.inputs ?? {} : request.patch.inputs,
      outputs: request.patch.outputs === undefined ? existing?.outputs ?? {} : request.patch.outputs,
      ...(request.patch.checks !== undefined
        ? { checks: request.patch.checks }
        : existing?.checks === undefined ? {} : { checks: existing.checks }),
      updatedAt: new Date().toISOString(),
    }, 'stage record')
    await this.requireStages().put(key, stage)
    return { stage }
  }

  /**
   * Assemble and store one job's guide from its stage artifacts. The
   * assembler is pure; the generated instant is minted here.
   * @param request - the job to assemble a guide for.
   * @returns the stored guide document.
   * @throws RemoteError `job/not-found` when no job carries the id.
   */
  @Remote('generateGuide')
  async generateGuide(request: JobGenerateGuideRequest): Promise<JobGenerateGuideValue> {
    const job = this.requireJob(request.jobId)
    const stages = [...this.requireStages().entries()]
      .filter(([, stage]) => stage.jobId === request.jobId)
      .map(([, stage]) => stage)
    const generatedAt = new Date().toISOString()
    const document = parseOrThrow(guideDocumentSchema, assembleGuide({
      job,
      stages,
      generatedAt,
    }), 'guide document')
    const record = parseOrThrow(guideRecordSchema, {
      jobId: job.id,
      document,
      generatedAt,
    }, 'guide record')
    await this.requireGuides().put(job.id, record)
    return { document }
  }

  /**
   * Delete one job and every stage row and guide it owns.
   * @param request - target job identity.
   * @returns whether a job existed under the id (false never writes).
   */
  @Remote('deleteJob')
  async deleteJob(request: JobDeleteRequest): Promise<JobDeleteValue> {
    const removed = await this.requireJobs().delete(request.id)
    if (!removed) return { removed }
    const stages = this.requireStages()
    for (const [key, stage] of stages.entries()) {
      if (stage.jobId === request.id) await stages.delete(key)
    }
    await this.requireGuides().delete(request.id)
    return { removed }
  }

  private requireJob(id: JobId): StoredJobRecord {
    const job = this.requireJobs().get(id)
    if (job === undefined) throw jobNotFound(id)
    return job
  }

  private requireJobs(): KvTable<JobId, StoredJobRecord> {
    if (this.jobs === undefined) {
      throw new RemoteError('gateway/internal', 'rxlab job domain is not open', {})
    }
    return this.jobs
  }

  private requireStages(): KvTable<StageRecordId, StoredStageRecord> {
    if (this.stages === undefined) {
      throw new RemoteError('gateway/internal', 'rxlab job domain is not open', {})
    }
    return this.stages
  }

  private requireGuides(): KvTable<JobId, StoredGuideRecord> {
    if (this.guides === undefined) {
      throw new RemoteError('gateway/internal', 'rxlab job domain is not open', {})
    }
    return this.guides
  }
}

export default JobController
