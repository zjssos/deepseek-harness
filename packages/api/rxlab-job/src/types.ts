/**
 * Public wire vocabulary of the rxlab job Remote namespace: the durable
 * `rxlab_job` work-order model (one job, its six stage rows, and the
 * assembled guide), the per-stage inputs and artifacts, and the list/get/
 * create/update/bindSession/upsertStage/generateGuide/delete requests and
 * results. Types only — the zod schemas that validate this model live in
 * `domain.ts`, and the deterministic guide assembler lives in `guide.ts`.
 *
 * Optional fields are declared `T | undefined` (not bare `T`): the domain
 * schemas model them the same way, so a parsed stored record is directly
 * assignable to its wire interfaces under `exactOptionalPropertyTypes`.
 * @module @deepseek-ai/dsh-rxlab-job/src/types
 */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type {} from '@deepseek-ai/dsh-typert-protocol'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'

/** The six workbench stages, in canonical order. */
export type StageId = 'exam' | 'frame' | 'lens' | 'fabrication' | 'pickup' | 'aftercare'

/** Content kinds the content domain tags entries with. */
export type ContentKind = 'knowledge' | 'script'

/** Job lifecycle; a job is created `draft` and archived when retired. */
export type JobStatus = 'draft' | 'in-progress' | 'complete' | 'archived'

/** One stage row's lifecycle. */
export type StageStatus = 'pending' | 'in-progress' | 'done' | 'skipped'

/** One deterministic check's verdict. */
export type CheckStatus = 'OK' | 'WARN' | 'FAIL'

/** Identifies one work order (a generated uuid at create). */
export type JobId = Branded<'JobId'>

/** Identifies one stage row: the `${jobId}:${stage}` composite key. */
export type StageRecordId = Branded<'StageRecordId'>

/** A money amount in a named currency; amount is in the currency's minor scale's major unit. */
export interface Money {
  readonly amount: number
  readonly currency: string
}

/** How the consumer uses the glasses; drives lens-type advice. */
export type ConsumerUsage = 'far' | 'near' | 'computer' | 'outdoor' | 'all'

/** The consumer's stated style preferences, when any. */
export interface ConsumerStyle {
  readonly shapePref?: string | undefined
  readonly rimTypePref?: string | undefined
  readonly colorPref?: string | undefined
}

/**
 * The consumer profile a job is opened for. Cross-domain facts (`oldRx`) stay
 * as a compact self-contained JSON map; the fitting domain's schema is never
 * referenced here.
 */
export interface ConsumerProfile {
  readonly name?: string | undefined
  readonly age?: number | undefined
  readonly faceWidthMm?: number | undefined
  readonly usage?: ConsumerUsage | undefined
  readonly budget?: Money | undefined
  readonly style?: ConsumerStyle | undefined
  /** Compact old-prescription map captured at intake. */
  readonly oldRx?: JsonValue | undefined
}

/** One job's deterministic compatibility result for a stage. */
export interface CompatibilityCheck {
  readonly name: string
  readonly status: CheckStatus
  readonly detail: string
}

/** The compatibility report a stage carries as its `checks`. */
export interface CompatibilityReport {
  readonly overall: CheckStatus
  readonly checks: readonly CompatibilityCheck[]
  readonly summary: string
}

/** The stage-1 exam inputs (人工录入 / 参照库 / 上一阶段产出). */
export interface ExamStageInput {
  /** Prior fitting exam record's id; cross-domain reference only. */
  readonly fittingRecordId?: string | undefined
  readonly examDate?: string | undefined
  readonly notes?: string | undefined
}

/** The stage-1 exam artifact: the derived prescription facts the guide prints. */
export interface ExamStageArtifact {
  /** Binocular pupil distance in mm. */
  readonly pdMm?: number | undefined
  readonly sphereL?: number | undefined
  readonly sphereR?: number | undefined
  readonly cylinderL?: number | undefined
  readonly cylinderR?: number | undefined
  /** Consumer-facing one-line prescription summary. */
  readonly prescriptionSummary?: string | undefined
}

/** The stage-2 frame inputs: the candidate frame measured at the counter. */
export interface FrameStageInput {
  readonly frameType?: 'full' | 'half' | 'rimless' | undefined
  /** Single-lens width A in mm. */
  readonly lensWidthA?: number | undefined
  /** Bridge (DBL) in mm. */
  readonly bridgeDbl?: number | undefined
  readonly frameWidth?: number | undefined
  readonly templeLength?: number | undefined
  readonly weight?: number | undefined
  readonly shape?: string | undefined
  /** Catalog item this frame was chosen from; cross-domain reference only. */
  readonly catalogItemId?: string | undefined
}

/** The stage-2 frame artifact: the chosen frame. */
export interface FrameStageArtifact {
  readonly frameName?: string | undefined
  readonly frameType?: 'full' | 'half' | 'rimless' | undefined
  /** Frame pupil distance: lensWidthA + bridgeDbl, in mm. */
  readonly fpdMm?: number | undefined
  readonly material?: string | undefined
}

/** The stage-3 lens inputs: the candidate lens. */
export interface LensStageInput {
  readonly index?: number | undefined
  readonly lensType?: 'single' | 'reading' | 'progressive' | 'bifocal' | 'office' | undefined
  readonly features?: readonly string[] | undefined
  /** Catalog item this lens was chosen from; cross-domain reference only. */
  readonly catalogItemId?: string | undefined
}

/** The stage-3 lens artifact: the chosen lens. */
export interface LensStageArtifact {
  readonly lensName?: string | undefined
  readonly index?: number | undefined
  readonly lensType?: 'single' | 'reading' | 'progressive' | 'bifocal' | 'office' | undefined
  readonly features?: readonly string[] | undefined
}

/** The stage-4 fabrication inputs handed to the lab. */
export interface FabricationStageInput {
  readonly lab?: string | undefined
  readonly edgeType?: string | undefined
  readonly coatings?: readonly string[] | undefined
  readonly expectedAt?: string | undefined
}

/** The stage-4 fabrication artifact returned by the lab. */
export interface FabricationStageArtifact {
  readonly lab?: string | undefined
  readonly edgeType?: string | undefined
  readonly coatings?: readonly string[] | undefined
  readonly completedAt?: string | undefined
}

/** The stage-5 pickup inputs. */
export interface PickupStageInput {
  readonly appointmentAt?: string | undefined
  readonly contact?: string | undefined
}

/** The stage-5 pickup artifact. */
export interface PickupStageArtifact {
  readonly pickedAt?: string | undefined
  readonly adjustNotes?: string | undefined
  readonly handedOverBy?: string | undefined
}

/** The stage-6 aftercare inputs. */
export interface AftercareStageInput {
  readonly warrantyMonths?: number | undefined
  readonly carePoints?: readonly string[] | undefined
}

/** The stage-6 aftercare artifact. */
export interface AftercareStageArtifact {
  readonly followUpAt?: string | undefined
  readonly carePoints?: readonly string[] | undefined
  readonly warrantyNote?: string | undefined
}

/** One durable work order with a server-minted id and write timestamps. */
export interface JobRecord {
  readonly id: JobId
  readonly consumer: ConsumerProfile
  readonly status: JobStatus
  /** Stages this job tracks, in canonical order after a create. */
  readonly stageIds: readonly StageId[]
  /** The agent session working this job, when bound. */
  readonly sessionId?: string | undefined
  readonly pricing?: Money | undefined
  readonly createdAt: string
  readonly updatedAt: string
}

/** One durable stage row, keyed `${jobId}:${stage}`. */
export interface StageRecord {
  readonly id: StageRecordId
  readonly jobId: JobId
  readonly stage: StageId
  readonly status: StageStatus
  /** The stage's 投入 as entered. */
  readonly inputs: JsonValue
  /** The stage's 产出 artifact. */
  readonly outputs: JsonValue
  /** The deterministic compatibility report, when the stage ran checks. */
  readonly checks?: CompatibilityReport | undefined
  readonly updatedAt: string
}

/** One guide chapter: the assembled per-stage guide section. */
export interface GuideChapter {
  readonly stage: StageId
  readonly title: string
  /** Parameters taken from the stage artifact and content overrides. */
  readonly params?: Readonly<Record<string, JsonValue>> | undefined
  readonly strategy?: readonly string[] | undefined
  readonly checklist?: readonly string[] | undefined
  readonly scripts?: readonly string[] | undefined
  readonly checks?: CompatibilityReport | undefined
}

/** The structured guide document the workbench renders and exports. */
export interface GuideDocument {
  readonly jobId: JobId
  readonly consumer: ConsumerProfile
  readonly chapters: readonly GuideChapter[]
  readonly pricing?: Money | undefined
  readonly generatedAt: string
}

/** The stored guide row: the document plus the instant it was assembled. */
export interface GuideRecord {
  readonly jobId: JobId
  readonly document: GuideDocument
  readonly generatedAt: string
}

/** List-row projection of one job. */
export interface JobSummary {
  readonly id: JobId
  /** Consumer display name, when the profile carries one. */
  readonly name?: string | undefined
  readonly status: JobStatus
  readonly stageIds: readonly StageId[]
  readonly sessionId?: string | undefined
  readonly pricing?: Money | undefined
  readonly updatedAt: string
}

/** List jobs: optional case-insensitive consumer-name substring. */
export interface JobListRequest {
  readonly query?: string | undefined
}

/** Ordered job summaries for one {@link JobListRequest}, newest write first. */
export interface JobListValue {
  readonly items: readonly JobSummary[]
}

/** Open one job with its stage rows and assembled guide. */
export interface JobGetRequest {
  readonly id: JobId
}

/** One job's full projection, or the not-found failure. */
export interface JobGetValue {
  readonly job: JobRecord
  readonly stages: readonly StageRecord[]
  /** The stored guide, when one has been generated. */
  readonly guide?: GuideDocument | undefined
}

/** Create one draft job for a consumer profile. */
export interface JobCreateRequest {
  readonly consumer: ConsumerProfile
}

/** The stored job after one {@link JobCreateRequest}. */
export interface JobCreateValue {
  readonly job: JobRecord
}

/** The mutable job fields `updateJob` accepts. */
export interface JobPatch {
  readonly consumer?: ConsumerProfile | undefined
  readonly pricing?: Money | undefined
  readonly status?: JobStatus | undefined
}

/** Patch one job's mutable fields. */
export interface JobUpdateRequest {
  readonly id: JobId
  readonly patch: JobPatch
}

/** The stored job after one {@link JobUpdateRequest}. */
export interface JobUpdateValue {
  readonly job: JobRecord
}

/** Bind the agent session working one job. */
export interface JobBindSessionRequest {
  readonly id: JobId
  readonly sessionId: string
}

/** The stored job after one {@link JobBindSessionRequest}. */
export interface JobBindSessionValue {
  readonly job: JobRecord
}

/** The stage fields `upsertStage` accepts; absent fields keep the stored value. */
export interface StagePatch {
  readonly status?: StageStatus | undefined
  readonly inputs?: JsonValue | undefined
  readonly outputs?: JsonValue | undefined
  readonly checks?: CompatibilityReport | undefined
}

/** Create or update one job's stage row. */
export interface JobUpsertStageRequest {
  readonly jobId: JobId
  readonly stage: StageId
  readonly patch: StagePatch
}

/** The stored stage row after one {@link JobUpsertStageRequest}. */
export interface JobUpsertStageValue {
  readonly stage: StageRecord
}

/** Assemble and store one job's guide from its stage artifacts. */
export interface JobGenerateGuideRequest {
  readonly jobId: JobId
}

/** The assembled guide for one {@link JobGenerateGuideRequest}. */
export interface JobGenerateGuideValue {
  readonly document: GuideDocument
}

/** Delete one job and its owned stage and guide rows. */
export interface JobDeleteRequest {
  readonly id: JobId
}

/** Receipt after one {@link JobDeleteRequest}. */
export interface JobDeleteValue {
  /** Whether a job existed under the id (false never writes). */
  readonly removed: boolean
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** No job carries that identity. */
    'job/not-found': { readonly id: JobId }
  }
}
