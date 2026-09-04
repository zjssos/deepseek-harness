/**
 * Host Catalog Remote owner for the rxlab product Wiki: the `rxlabCatalog`
 * namespace over the `rxlab_catalog` storage domain. This package mounts its
 * own namespace on the Client side (see `src/client/index.ts`) and is a
 * rxlab-app data row; it deliberately never joins the platform `api-remotes`
 * assembly, because the catalog is rxlab-product data, not a generic Host
 * capability.
 * @module @deepseek-ai/dsh-rxlab-catalog
 */

import { randomUUID } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { z } from 'zod'
import { catalogDomainSpec, wikiItemDraftSchema, wikiItemSchema } from './domain.ts'
import type {
  CatalogGetRequest,
  CatalogGetValue,
  CatalogItemId,
  CatalogItemSummary,
  CatalogListRequest,
  CatalogListValue,
  CatalogRemoveRequest,
  CatalogRemoveValue,
  CatalogUpsertRequest,
  CatalogUpsertValue,
} from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host business API and Remote namespace owner for the rxlab catalog. */
    catalogController: CatalogController
  }
}

type StoredWikiItem = z.infer<typeof wikiItemSchema>

/** Brand one raw uuid as a catalog record key. */
function newCatalogItemId(): CatalogItemId {
  return randomUUID() as CatalogItemId
}

/** Validate one wire value against a zod schema or throw the wire failure. */
function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown, subject: string): T {
  const parsed = schema.safeParse(value)
  if (parsed.success) return parsed.data
  throw new RemoteError('gateway/bad-request', `rxlab catalog ${subject} failed validation`, {
    issues: parsed.error.issues.map(issue => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  })
}

/**
 * Host service backing the generated `ctx.remote.rxlabCatalog` namespace.
 * Reads are synchronous from the open domain; writes queue on the domain's
 * write chain and emit `domain/changed` after durability. Every record passes
 * the domain zod schema here (the wire boundary) so a rejected record can
 * never reach the medium and force an open-time `backup-and-skip`.
 */
export class CatalogController extends TypertRemoteService {
  static inject = ['storageDomain']

  private table?: KvTable<CatalogItemId, StoredWikiItem>

  /**
   * Register the catalog namespace on the Typert Gateway.
   * @param ctx - Host context carrying the storage-domain facility.
   */
  constructor(ctx: Context) {
    super(ctx, 'catalogController', { namespace: 'rxlabCatalog' })
  }

  /** Open the catalog domain for the life of this controller. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(catalogDomainSpec)
    this.ctx.effect(() => () => domain.close(), 'rxlab_catalog.domainClose')
    this.table = domain.table('items')
  }

  /**
   * List catalog rows, newest write first, with an optional family filter and
   * a case-insensitive brand/model/name substring match.
   * @param request - kind filter and query; absent fields match everything.
   * @returns matching rows projected to summaries.
   */
  @Remote('list')
  async list(request: CatalogListRequest): Promise<CatalogListValue> {
    const table = this.requireTable()
    const query = request.query?.trim().toLocaleLowerCase()
    const rows = [...table.entries()]
      .filter(([, item]) =>
        (request.kind === undefined || item.kind === request.kind)
        && (query === undefined || query.length === 0 || matchesQuery(item, query)))
    rows.sort(([, left], [, right]) =>
      right.updatedAt.localeCompare(left.updatedAt)
      || String(left.id).localeCompare(String(right.id)))
    return { items: rows.map(([, item]) => summarize(item)) }
  }

  /**
   * Read one complete catalog record.
   * @param request - target record identity.
   * @returns the full stored record.
   * @throws RemoteError `catalog/not-found` when no record carries the id.
   */
  @Remote('get')
  async get(request: CatalogGetRequest): Promise<CatalogGetValue> {
    const item = this.requireTable().get(request.id)
    if (item === undefined) {
      throw new RemoteError('catalog/not-found', `rxlab catalog has no record '${String(request.id)}'`, {
        id: request.id,
      })
    }
    return { item }
  }

  /**
   * Create or replace one catalog record. An absent draft id mints a new
   * record; a present id replaces the stored record under that key. The write
   * timestamp is always minted here.
   * @param request - full draft for the new or replaced record.
   * @returns the stored record after durability.
   * @throws RemoteError `gateway/bad-request` when the draft fails its zod schema.
   */
  @Remote('upsert')
  async upsert(request: CatalogUpsertRequest): Promise<CatalogUpsertValue> {
    const draft = parseOrThrow(wikiItemDraftSchema, request.item, 'item draft')
    const id = draft.id ?? newCatalogItemId()
    const record = parseOrThrow(wikiItemSchema, { ...draft, id, updatedAt: new Date().toISOString() }, 'item')
    await this.requireTable().put(id, record)
    return { item: record }
  }

  /**
   * Delete one catalog record.
   * @param request - target record identity.
   * @returns whether a record existed under the id (false never writes).
   */
  @Remote('delete')
  async delete(request: CatalogRemoveRequest): Promise<CatalogRemoveValue> {
    return { removed: await this.requireTable().delete(request.id) }
  }

  private requireTable(): KvTable<CatalogItemId, StoredWikiItem> {
    if (this.table === undefined) {
      throw new RemoteError(
        'gateway/internal',
        'rxlab catalog domain is not open; the storage-domain row must be active before the catalog row',
        {},
      )
    }
    return this.table
  }
}

function matchesQuery(item: StoredWikiItem, query: string): boolean {
  const candidates = [item.brand, item.model, item.name]
  return candidates.some(candidate =>
    candidate !== undefined && candidate.toLocaleLowerCase().includes(query))
}

/** Project one stored record onto its list-row summary. */
function summarize(item: StoredWikiItem): CatalogItemSummary {
  return {
    id: item.id,
    kind: item.kind,
    ...(item.brand === undefined ? {} : { brand: item.brand }),
    ...(item.model === undefined ? {} : { model: item.model }),
    name: item.name,
    origin: item.origin,
    updatedAt: item.updatedAt,
  }
}

export default CatalogController
