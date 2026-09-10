/**
 * The `rxlab_content` storage domain: zod record/draft schemas for the
 * knowledge/script content model and the `defineDomain` spec the
 * ContentController opens. The zod schemas validate at the durable read
 * boundary (per-record layout, version 1) and double as the controller's
 * create/replace validator; the inferred record types mirror the browser-safe
 * wire types in `types.ts`.
 * @module @deepseek-ai/dsh-rxlab-content/src/domain
 */

import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { ContentItemId } from './types.ts'

/** Content item key; branding has no runtime representation. */
export const contentItemId = z
  .string()
  .min(1)
  .max(64)
  .transform(value => value as ContentItemId)

/** ISO-8601 write instant stamped by the controller, never by callers. */
const updatedAt = z.string()

/** The closed content-family vocabulary. */
export const contentKindSchema = z.enum(['knowledge', 'script'])

/** The six workbench stages a content item may be tagged to. */
export const stageIdSchema = z.enum(['exam', 'frame', 'lens', 'fabrication', 'pickup', 'aftercare'])

/** One knowledge/script item before the controller mints id and updatedAt. */
export const contentItemDraftSchema = z.object({
  kind: contentKindSchema,
  stage: stageIdSchema.optional(),
  title: z.string().trim().min(1).max(200),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
  body: z.string().max(20000),
})

/** Validates every stored record at the durable boundary. */
export const contentItemSchema = contentItemDraftSchema.extend({
  id: contentItemId,
  updatedAt,
})

/**
 * The content domain spec: one `items` table keyed by {@link ContentItemId},
 * per-record layout so each knowledge/script entry is its own disposable
 * document. Version 1 is the first shipped shape of the content model.
 */
export const contentDomainSpec = defineDomain({
  name: 'rxlab_content',
  version: 1,
  layout: 'per-record',
  tables: {
    items: domainTable<ContentItemId, z.infer<typeof contentItemSchema>>(contentItemSchema),
  },
})
