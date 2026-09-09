/**
 * Host Fitting Remote owner for the rxlab optometry module: the
 * `rxlabFitting` namespace over the `rxlab_fitting` storage domain. This
 * package mounts its own namespace on the Client side (see
 * `src/client/index.ts`) and is a rxlab-app data row; it deliberately never
 * joins the platform `api-remotes` assembly, because fitting records are
 * rxlab-product data, not a generic Host capability.
 * @module @deepseek-ai/dsh-rxlab-fitting
 */

import { randomUUID } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { z } from 'zod'
import { examRecordDraftSchema, fittingDomainSpec, fittingRecordSchema } from './domain.ts'
import { runDerive, summarizeRecord } from './prescription.ts'
import type {
  FittingDeriveRequest,
  FittingDeriveValue,
  FittingGetRequest,
  FittingGetValue,
  FittingListRequest,
  FittingListValue,
  FittingRecordId,
  FittingRemoveRequest,
  FittingRemoveValue,
  FittingUpsertRequest,
  FittingUpsertValue,
} from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host business API and Remote namespace owner for rxlab fitting. */
    fittingController: FittingController
  }
}

type StoredFittingRecord = z.infer<typeof fittingRecordSchema>

/** Brand one raw uuid as an exam record key. */
function newFittingRecordId(): FittingRecordId {
  return randomUUID() as FittingRecordId
}

/** Validate one wire value against a zod schema or throw the wire failure. */
function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown, subject: string): T {
  const parsed = schema.safeParse(value)
  if (parsed.success) return parsed.data
  throw new RemoteError('gateway/bad-request', `rxlab fitting ${subject} failed validation`, {
    issues: parsed.error.issues.map(issue => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  })
}

/**
 * Host service backing the generated `ctx.remote.rxlabFitting` namespace.
 * Reads are synchronous from the open domain; writes queue on the domain's
 * write chain. Every record passes the domain zod schema here (the wire
 * boundary) so a rejected record can never reach the medium. `derive` runs
 * the pure refraction engine over a draft without storing anything.
 */
export class FittingController extends TypertRemoteService {
  static inject = ['storageDomain']

  private table?: KvTable<FittingRecordId, StoredFittingRecord>

  /**
   * Register the fitting namespace on the Typert Gateway.
   * @param ctx - Host context carrying the storage-domain facility.
   */
  constructor(ctx: Context) {
    super(ctx, 'fittingController', { namespace: 'rxlabFitting' })
  }

  /** Open the fitting domain for the life of this controller. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(fittingDomainSpec)
    this.ctx.effect(() => () => domain.close(), 'rxlab_fitting.domainClose')
    this.table = domain.table('records')
  }

  /**
   * List exam records, newest write first, with a case-insensitive patient
   * and date substring match.
   * @param request - query; absent matches everything.
   * @returns matching rows projected to summaries.
   */
  @Remote('list')
  async list(request: FittingListRequest): Promise<FittingListValue> {
    const query = request.query?.trim().toLocaleLowerCase()
    const rows = [...this.requireTable().entries()]
      .filter(([, record]) =>
        query === undefined || query.length === 0
        || [record.patient, record.date].some(field =>
          field !== undefined && field.toLocaleLowerCase().includes(query)))
    rows.sort(([, left], [, right]) =>
      right.updatedAt.localeCompare(left.updatedAt)
      || String(left.id).localeCompare(String(right.id)))
    return { items: rows.map(([, record]) => summarizeRecord(record)) }
  }

  /**
   * Read one complete exam record.
   * @param request - target record identity.
   * @returns the full stored record.
   * @throws RemoteError `fitting/not-found` when no record carries the id.
   */
  @Remote('get')
  async get(request: FittingGetRequest): Promise<FittingGetValue> {
    const record = this.requireTable().get(request.id)
    if (record === undefined) {
      throw new RemoteError('fitting/not-found', `rxlab fitting has no exam record '${String(request.id)}'`, {
        id: request.id,
      })
    }
    return { record }
  }

  /**
   * Create or replace one exam record. An absent request id mints a new
   * record; a present id replaces the stored record under that key. The
   * write timestamp is always minted here.
   * @param request - full draft plus the optional target id.
   * @returns the stored record after durability.
   * @throws RemoteError `gateway/bad-request` when the draft fails its zod schema.
   */
  @Remote('upsert')
  async upsert(request: FittingUpsertRequest): Promise<FittingUpsertValue> {
    const draft = parseOrThrow(examRecordDraftSchema, request.record, 'exam record draft')
    const id = request.id ?? newFittingRecordId()
    const record = parseOrThrow(
      fittingRecordSchema,
      { ...draft, id, updatedAt: new Date().toISOString() },
      'exam record',
    )
    await this.requireTable().put(id, record)
    return { record }
  }

  /**
   * Delete one exam record.
   * @param request - target record identity.
   * @returns whether a record existed under the id (false never writes).
   */
  @Remote('delete')
  async delete(request: FittingRemoveRequest): Promise<FittingRemoveValue> {
    return { removed: await this.requireTable().delete(request.id) }
  }

  /**
   * Derive a prescription from a staged exam record without storing it.
   * FAIL findings suppress the prescription; WARN findings travel as review
   * notes alongside the derived value.
   * @param request - the staged record to derive from.
   * @returns prescription, validation findings, and lens/frame advice.
   * @throws RemoteError `gateway/bad-request` when the draft fails its zod schema.
   */
  @Remote('derive')
  async derive(request: FittingDeriveRequest): Promise<FittingDeriveValue> {
    const draft = parseOrThrow(examRecordDraftSchema, request.record, 'exam record draft')
    return runDerive(draft)
  }

  private requireTable(): KvTable<FittingRecordId, StoredFittingRecord> {
    if (this.table === undefined) {
      throw new RemoteError(
        'gateway/internal',
        'rxlab fitting domain is not open; the storage-domain row must be active before the fitting row',
        {},
      )
    }
    return this.table
  }
}

export default FittingController
