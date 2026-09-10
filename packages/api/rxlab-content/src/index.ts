/**
 * Host Content Remote owner for the rxlab workbench: the `rxlabContent`
 * namespace over the `rxlab_content` storage domain. This package mounts its
 * own namespace on the Client side (see `src/client/index.ts`) and is a
 * rxlab-app data row; it deliberately never joins the platform `api-remotes`
 * assembly, because knowledge and script entries are rxlab-product data, not a
 * generic Host capability.
 * @module @deepseek-ai/dsh-rxlab-content
 */

import { randomUUID } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { z } from 'zod'
import { contentDomainSpec, contentItemDraftSchema, contentItemSchema } from './domain.ts'
import type {
  ContentDeleteRequest,
  ContentDeleteValue,
  ContentGetRequest,
  ContentGetValue,
  ContentItemId,
  ContentItemSummary,
  ContentListRequest,
  ContentListValue,
  ContentUpsertRequest,
  ContentUpsertValue,
} from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host business API and Remote namespace owner for rxlab content. */
    contentController: ContentController
  }
}

type StoredContentItem = z.infer<typeof contentItemSchema>

/** Brand one raw uuid as a content item key. */
function newContentItemId(): ContentItemId {
  return randomUUID() as ContentItemId
}

/** Validate one wire value against a zod schema or throw the wire failure. */
function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown, subject: string): T {
  const parsed = schema.safeParse(value)
  if (parsed.success) return parsed.data
  throw new RemoteError('gateway/bad-request', `rxlab content ${subject} failed validation`, {
    issues: parsed.error.issues.map(issue => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  })
}

/**
 * Host service backing the generated `ctx.remote.rxlabContent` namespace.
 * Reads are synchronous from the open domain; writes queue on the domain's
 * write chain. Every item passes the domain zod schema here (the wire
 * boundary) so a rejected item can never reach the medium.
 */
export class ContentController extends TypertRemoteService {
  static inject = ['storageDomain']

  private table?: KvTable<ContentItemId, StoredContentItem>

  /**
   * Register the content namespace on the Typert Gateway.
   * @param ctx - Host context carrying the storage-domain facility.
   */
  constructor(ctx: Context) {
    super(ctx, 'contentController', { namespace: 'rxlabContent' })
  }

  /** Open the content domain for the life of this controller. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(contentDomainSpec)
    this.ctx.effect(() => () => domain.close(), 'rxlab_content.domainClose')
    this.table = domain.table('items')
  }

  /**
   * List content items, newest write first, with optional kind and stage
   * facets and a case-insensitive title/tags substring match.
   * @param request - filters; absent fields match everything.
   * @returns matching items projected to summaries.
   */
  @Remote('list')
  // oxlint-disable-next-line typescript/require-await -- synchronous memory reads keep the Remote surface's async signature
  async list(request: ContentListRequest): Promise<ContentListValue> {
    const table = this.requireTable()
    const query = request.query?.trim().toLocaleLowerCase()
    const rows = [...table.entries()].filter(([, item]) =>
      (request.kind === undefined || item.kind === request.kind)
      && (request.stage === undefined || item.stage === request.stage)
      && (query === undefined || query.length === 0
        || [item.title, ...item.tags].some(field => field.toLocaleLowerCase().includes(query))))
    rows.sort(([, left], [, right]) =>
      right.updatedAt.localeCompare(left.updatedAt)
      || String(left.id).localeCompare(String(right.id)))
    return { items: rows.map(([, item]) => summarize(item)) }
  }

  /**
   * Read one complete content item.
   * @param request - target item identity.
   * @returns the full stored item.
   * @throws RemoteError `content/not-found` when no item carries the id.
   */
  @Remote('get')
  // oxlint-disable-next-line typescript/require-await -- synchronous memory reads keep the Remote surface's async signature
  async get(request: ContentGetRequest): Promise<ContentGetValue> {
    const item = this.requireTable().get(request.id)
    if (item === undefined) {
      throw new RemoteError('content/not-found', `rxlab content has no item '${String(request.id)}'`, {
        id: request.id,
      })
    }
    return { item }
  }

  /**
   * Create or replace one content item. An absent request id mints a new item;
   * a present id replaces the stored item under that key. The write timestamp
   * is always minted here.
   * @param request - draft plus the optional target id.
   * @returns the stored item after durability.
   * @throws RemoteError `gateway/bad-request` when the draft fails its zod schema.
   */
  @Remote('upsert')
  async upsert(request: ContentUpsertRequest): Promise<ContentUpsertValue> {
    const draft = parseOrThrow(contentItemDraftSchema, request.item, 'item draft')
    const id = request.id ?? newContentItemId()
    const item = parseOrThrow(
      contentItemSchema,
      { ...draft, id, updatedAt: new Date().toISOString() },
      'item',
    )
    await this.requireTable().put(id, item)
    return { item }
  }

  /**
   * Delete one content item.
   * @param request - target item identity.
   * @returns whether an item existed under the id (false never writes).
   */
  @Remote('delete')
  async delete(request: ContentDeleteRequest): Promise<ContentDeleteValue> {
    return { removed: await this.requireTable().delete(request.id) }
  }

  private requireTable(): KvTable<ContentItemId, StoredContentItem> {
    if (this.table === undefined) {
      throw new RemoteError(
        'gateway/internal',
        'rxlab content domain is not open; the storage-domain row must be active before the content row',
        {},
      )
    }
    return this.table
  }
}

/** Project one stored item onto its list-row summary. */
function summarize(item: StoredContentItem): ContentItemSummary {
  return {
    id: item.id,
    kind: item.kind,
    ...(item.stage === undefined ? {} : { stage: item.stage }),
    title: item.title,
    tags: item.tags,
    updatedAt: item.updatedAt,
  }
}

export default ContentController
