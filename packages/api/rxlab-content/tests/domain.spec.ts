import { describe, expect, it } from 'vitest'
import { contentDomainSpec, contentItemDraftSchema, contentItemSchema } from '../src/domain.ts'
import type { ContentItemDraft } from '../src/types.ts'

const draft: ContentItemDraft = {
  kind: 'knowledge',
  stage: 'lens',
  title: '高折射率镜片的适用场景',
  tags: ['镜片', '折射率'],
  body: '高屈光不正、对大框边缘厚度敏感时选择更高折射率。',
}

describe('contentItemDraftSchema', () => {
  it('rejects an unknown kind', () => {
    const result = contentItemDraftSchema.safeParse({ ...draft, kind: 'manual' })
    expect(result.success).toBe(false)
  })

  it('rejects an unknown stage', () => {
    const result = contentItemDraftSchema.safeParse({ ...draft, stage: 'telepathy' })
    expect(result.success).toBe(false)
  })

  it('requires a non-empty title', () => {
    const result = contentItemDraftSchema.safeParse({ ...draft, title: '   ' })
    expect(result.success).toBe(false)
  })

  it('accepts the sample draft and keeps its tags', () => {
    const result = contentItemDraftSchema.parse(draft)
    expect(result.kind).toBe('knowledge')
    expect(result.stage).toBe('lens')
    expect(result.tags).toEqual(['镜片', '折射率'])
  })

  it('omits an absent stage instead of defaulting one', () => {
    const parsed = contentItemDraftSchema.parse({ ...draft, stage: undefined })
    expect(parsed.stage).toBeUndefined()
  })
})

describe('contentItemSchema', () => {
  it('round-trips a stored record with minted id and updatedAt', () => {
    const stored = contentItemSchema.parse({
      ...contentItemDraftSchema.parse(draft),
      id: 'test-item-1',
      updatedAt: '2026-09-10T00:00:00.000Z',
    })
    expect(stored.id).toBe('test-item-1')
    expect(stored.updatedAt).toBe('2026-09-10T00:00:00.000Z')
  })
})

describe('contentDomainSpec', () => {
  it('declares the per-record rxlab_content domain at version 1', () => {
    expect(contentDomainSpec.name).toBe('rxlab_content')
    expect(contentDomainSpec.version).toBe(1)
    expect(contentDomainSpec.layout).toBe('per-record')
    expect(Object.keys(contentDomainSpec.tables)).toEqual(['items'])
  })
})
