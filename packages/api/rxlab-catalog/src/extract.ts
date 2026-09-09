/**
 * Deterministic collected-listing extraction and import-record building for
 * the rxlab catalog. Chinese e-commerce titles carry the attribute signal as
 * marketing vocabulary (纯钛, 半框, 商务, 8.3g, 1.67...); the matchers below
 * turn that signal into the domain's structured enums without any model
 * round-trip. Unmatched attributes stay absent — extraction never invents a
 * value. Model-assisted enrichment can later fill the gaps on the same
 * schema; the deterministic pass stays the authoritative first pass.
 * @module @deepseek-ai/dsh-rxlab-catalog/src/extract
 */

import {
  frameMaterialValues,
  refractiveIndexValues,
} from './domain.ts'
import type { z } from 'zod'
import type { catalogImportRequestSchema, wikiItemDraftSchema, wikiItemSchema } from './domain.ts'
import type {
  CatalogItemId,
  FrameMaterial,
  FrameShape,
  FrameStyle,
  FrameType,
  Gender,
  LensDesign,
  LensFunction,
  LensType,
  NosePad,
  RefractiveIndex,
} from './types.ts'

/** One spec-parameter name/value pair as captured from a detail page. */
export interface ParamPair {
  readonly name: string
  readonly value: string
}

/** The collected listing fields extraction reads. */
export interface ListingInput {
  /** Captured listing title. */
  readonly title: string
  /** Selected variant text, e.g. "BA7009B15-哑黑银". */
  readonly selectedSku?: string | undefined
  /** Spec-parameter pairs captured from the detail page. */
  readonly params?: readonly ParamPair[] | undefined
}

/** Record family the extractor assigns; `product` when no lens/frame signal exists. */
export type ExtractedKind = 'frame' | 'lens' | 'product'

/** Kind-specific attributes the extractor may produce, keyed by its union arm. */
export interface ExtractedAttributes {
  brand?: string | undefined
  model?: string | undefined
  color?: string | undefined
  weightG?: number | undefined
  lensWidth?: number | undefined
  lensHeight?: number | undefined
  bridgeWidth?: number | undefined
  templeLength?: number | undefined
  totalWidth?: number | undefined
  material?: FrameMaterial | undefined
  frameShape?: FrameShape | undefined
  frameType?: FrameType | undefined
  style?: FrameStyle | undefined
  gender?: Gender | undefined
  nosePad?: NosePad | undefined
  refractiveIndex?: RefractiveIndex | undefined
  abbe?: number | undefined
  lensDesign?: LensDesign | undefined
  lensType?: LensType | undefined
  lensFunctions?: LensFunction[] | undefined
  coating?: string | undefined
  diameterMm?: number | undefined
}

/** One extraction outcome: assigned family plus the attributes found. */
export interface ExtractResult {
  readonly kind: ExtractedKind
  readonly attrs: ExtractedAttributes
}

/** Chinese maker names recognized at the title head, in addition to latin brands. */
const ZH_BRANDS = [
  '暴龙', '海伦凯勒', '陌森', '海澜之家', '京东京造', '帕莎', '夏蒙', '派丽蒙',
  '普莱斯', '保圣', '欧拿', '精功', '镜宴', '目戏', '康视顿', '圣古力', '帕斯贝奇',
] as const

/** Material matchers in priority order; the first hit wins. */
const MATERIAL_RULES: readonly { pattern: RegExp; value: FrameMaterial }[] = [
  { pattern: /纯钛/, value: 'pure-titanium' },
  { pattern: /β钛|B钛|贝塔钛/i, value: 'beta-titanium' },
  { pattern: /铝镁钛|铝镁/, value: 'metal-alloy' },
  { pattern: /钛架|钛框|钛金属|钛合|纯钛镜/, value: 'titanium' },
  { pattern: /TR90/i, value: 'tr90' },
  { pattern: /塑钢|钨碳|钨钛/, value: 'plastic-steel' },
  { pattern: /板材|板料|醋酸/, value: 'acetate' },
  { pattern: /不锈钢/, value: 'stainless-steel' },
  { pattern: /\bPC框?\b/, value: 'pc' },
  { pattern: /合金|白铜|锰镍/, value: 'metal-alloy' },
]

/** Shape matchers in priority order; the first hit wins. */
const SHAPE_RULES: readonly { pattern: RegExp; value: FrameShape }[] = [
  { pattern: /猫眼/, value: 'cat-eye' },
  { pattern: /眉毛框|眉线框|眉线/, value: 'browline' },
  { pattern: /飞行员|蛤蟆镜/, value: 'pilot' },
  { pattern: /椭圆/, value: 'oval' },
  { pattern: /方圆/, value: 'square-round' },
  { pattern: /圆框|圆形/, value: 'round' },
  { pattern: /方框|方形/, value: 'square' },
  { pattern: /多边形|不规则/, value: 'polygon' },
]

/** Style matchers in priority order; the first hit wins. */
const STYLE_RULES: readonly { pattern: RegExp; value: FrameStyle }[] = [
  { pattern: /商务/, value: 'business' },
  { pattern: /复古/, value: 'retro' },
  { pattern: /运动/, value: 'sport' },
  { pattern: /休闲/, value: 'casual' },
  { pattern: /潮|时尚|百搭|斯文|文艺|书呆子|高智感/, value: 'fashion' },
]

/** Lens-function matchers; several can hit one title. */
const FUNCTION_RULES: readonly { pattern: RegExp; value: LensFunction }[] = [
  { pattern: /防蓝光|蓝光/, value: 'blue-light' },
  { pattern: /变色/, value: 'photochromic' },
  { pattern: /偏光/, value: 'polarized' },
  { pattern: /染色/, value: 'tinted' },
  { pattern: /驾驶/, value: 'driving' },
]

/** Frame-family title signals; a hit classifies the listing as a frame. */
const FRAME_SIGNAL = /镜框|镜架|眼镜框|光学镜|钛架|平光镜/

/** Lens-family title signals, checked when no frame signal hit. */
const LENS_SIGNAL = /镜片/

/** First enum value whose pattern matches, or undefined. */
function firstMatch<V extends string>(
  rules: readonly { pattern: RegExp; value: V }[],
  text: string,
): V | undefined {
  for (const rule of rules) {
    if (rule.pattern.test(text)) return rule.value
  }
  return undefined
}

/** First spec parameter whose name contains any of the aliases. */
function paramValue(params: readonly ParamPair[] | undefined, aliases: readonly string[]): string | undefined {
  if (params === undefined) return undefined
  for (const alias of aliases) {
    const hit = params.find(pair => pair.name.includes(alias))
    if (hit !== undefined && hit.value.trim() !== '') return hit.value.trim()
  }
  return undefined
}

/** First finite number inside the text, or undefined. */
function numberIn(text: string | undefined): number | undefined {
  if (text === undefined) return undefined
  const match = text.match(/\d+(?:\.\d+)?/)
  if (match === null) return undefined
  const value = Number(match[0])
  return Number.isFinite(value) ? value : undefined
}

/** Material vocabulary value named by free text, or undefined. */
function materialFrom(text: string): FrameMaterial | undefined {
  const mapped = firstMatch(MATERIAL_RULES, text)
  if (mapped !== undefined) return mapped
  return frameMaterialValues.find(value => value === text.trim().toLowerCase())
}

/** Refractive-index vocabulary value named by free text, or undefined. */
function refractiveIndexFrom(text: string): RefractiveIndex | undefined {
  const match = text.match(/1\.(5[069]|6[017]|7[14])/)
  if (match !== null) {
    const value = `1.${match[1]}` as RefractiveIndex
    if (refractiveIndexValues.includes(value)) return value
  }
  return refractiveIndexValues.find(value => value === text.trim())
}

/** The frame-size marking `52□18-140`, validated to plausible optician ranges. */
function specMarkingFrom(text: string): Pick<
  ExtractedAttributes,
  'lensWidth' | 'bridgeWidth' | 'templeLength'
> | undefined {
  const match = text.match(/(\d{2,3})\s*[□\-－·]\s*(\d{1,2})\s*[-－—]\s*(\d{2,3})/)
  if (match === null) return undefined
  const lensWidth = Number(match[1])
  const bridgeWidth = Number(match[2])
  const templeLength = Number(match[3])
  if (lensWidth < 30 || lensWidth > 80) return undefined
  if (bridgeWidth < 10 || bridgeWidth > 30) return undefined
  if (templeLength < 120 || templeLength > 160) return undefined
  return { lensWidth, bridgeWidth, templeLength }
}

/** Extract structured attributes and the record family from one listing. */
export function extractListing(listing: ListingInput): ExtractResult {
  const title = listing.title
  const params = listing.params ?? []
  const selected = listing.selectedSku ?? ''
  const attrs: ExtractedAttributes = {}

  const latinBrand = title.match(/^([A-Za-z][A-Za-z0-9'+&.\-]{1,})/)?.[1]
  const zhBrand = ZH_BRANDS.find(brand => title.startsWith(brand))
  if (latinBrand !== undefined) attrs.brand = latinBrand
  else if (zhBrand !== undefined) attrs.brand = zhBrand
  const model = selected.match(/^([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)/)?.[1]
  if (model !== undefined && model !== '') attrs.model = model

  const weightText = title.match(/(\d+(?:\.\d+)?)\s*(?:g|克)(?![a-z])/i)
  const weight = (weightText !== null ? Number(weightText[1]) : undefined)
    ?? numberIn(paramValue(params, ['重量', '净重']))
  if (weight !== undefined && weight > 0 && weight < 100) attrs.weightG = weight

  const marking = specMarkingFrom(title)
    ?? specMarkingFrom(paramValue(params, ['规格', '尺寸']) ?? '')
  if (marking !== undefined) {
    attrs.lensWidth = marking.lensWidth
    attrs.bridgeWidth = marking.bridgeWidth
    attrs.templeLength = marking.templeLength
  }
  const lensWidth = numberIn(paramValue(params, ['镜圈宽度', '镜片宽度', '单片宽']))
  if (lensWidth !== undefined && lensWidth >= 30 && lensWidth <= 80) attrs.lensWidth = lensWidth
  const bridgeWidth = numberIn(paramValue(params, ['鼻梁', '中梁']))
  if (bridgeWidth !== undefined && bridgeWidth >= 10 && bridgeWidth <= 30) attrs.bridgeWidth = bridgeWidth
  const templeLength = numberIn(paramValue(params, ['镜腿']))
  if (templeLength !== undefined && templeLength >= 120 && templeLength <= 160) attrs.templeLength = templeLength
  const totalWidth = numberIn(paramValue(params, ['总宽', '全宽']))
  if (totalWidth !== undefined && totalWidth >= 100 && totalWidth <= 180) attrs.totalWidth = totalWidth
  const lensHeight = numberIn(paramValue(params, ['镜圈高度', '镜片高度', '框高']))
  if (lensHeight !== undefined && lensHeight >= 20 && lensHeight <= 70) attrs.lensHeight = lensHeight

  const color = paramValue(params, ['颜色', '色号'])
    ?? (selected.includes('-') ? selected.split('-').pop() : undefined)
  if (color !== undefined && /[\u4e00-\u9fff]/.test(color) && color.length <= 12) attrs.color = color

  const materialText = `${title} ${paramValue(params, ['材质', '材料']) ?? ''}`
  const material = materialFrom(materialText)
  if (material !== undefined) attrs.material = material

  attrs.frameType = /无框/.test(title)
    ? 'rimless'
    : /半框/.test(title)
      ? 'semi-rimless'
      : /全框/.test(title)
        ? 'full-rim'
        : undefined
  attrs.frameShape = firstMatch(SHAPE_RULES, title)
  attrs.style = firstMatch(STYLE_RULES, title)
  attrs.gender = /男女|情侣/.test(title)
    ? 'unisex'
    : /女/.test(title)
      ? 'female'
      : /男/.test(title)
        ? 'male'
        : undefined
  const nosePadText = `${title} ${paramValue(params, ['鼻托', '托叶']) ?? ''}`
  attrs.nosePad = /独立鼻托|可调鼻托|托叶/.test(nosePadText)
    ? 'separate'
    : /一体成型|一体鼻托/.test(nosePadText)
      ? 'integrated'
      : undefined

  const refractiveIndex = refractiveIndexFrom(title) ?? refractiveIndexFrom(paramValue(params, ['折射率']) ?? '')
  const abbe = numberIn(paramValue(params, ['阿贝']))
  const diameterMm = numberIn(paramValue(params, ['直径']))

  if (!FRAME_SIGNAL.test(title) && LENS_SIGNAL.test(title)) {
    const functions = FUNCTION_RULES.filter(rule => rule.pattern.test(title)).map(rule => rule.value)
    const design: LensDesign | undefined = /双面非球面/.test(title)
      ? 'double-aspheric'
      : /非球面/.test(title)
        ? 'aspheric'
        : /球面/.test(title)
          ? 'spherical'
          : undefined
    const lensType: LensType = /渐进/.test(title)
      ? 'progressive'
      : functions.includes('blue-light')
        ? 'blue-light'
        : functions.includes('photochromic')
          ? 'photochromic'
          : 'single-vision'
    return {
      kind: 'lens',
      attrs: {
        ...attrs,
        ...(refractiveIndex === undefined ? {} : { refractiveIndex }),
        ...(abbe === undefined ? {} : { abbe }),
        ...(diameterMm === undefined ? {} : { diameterMm }),
        ...(design === undefined ? {} : { lensDesign: design }),
        lensType,
        ...(functions.length === 0 ? {} : { lensFunctions: functions }),
        coating: paramValue(params, ['膜层', '镀膜', '膜']),
      },
    }
  }

  if (!FRAME_SIGNAL.test(title)) {
    return { kind: 'product', attrs }
  }

  return { kind: 'frame', attrs }
}

/** The validated import request shape. */
export type CatalogImportRequestData = z.infer<typeof catalogImportRequestSchema>
/** The validated draft union the import record builder targets. */
export type WikiItemDraftData = z.infer<typeof wikiItemDraftSchema>

/** One price-history entry as the import merge produces it. */
export interface PriceHistoryEntry {
  readonly value: number
  readonly capturedAt: string
  readonly source: 'collected' | 'manual'
  readonly captureId?: string | undefined
  readonly note?: string | undefined
}

/** Latest priceHistory value, or undefined when no reading is recorded. */
export function latestPrice(
  history: readonly { value: number }[] | undefined,
): number | undefined {
  const last = history?.[history.length - 1]
  return last?.value
}

/**
 * Append one collected price reading unless it repeats the latest value.
 * The history stays oldest-first and caps at 200 entries by dropping oldest.
 */
export function appendPrice(
  history: readonly PriceHistoryEntry[] | undefined,
  entry: { value: number; capturedAt: string; captureId?: string | undefined; note?: string | undefined },
): PriceHistoryEntry[] {
  const prior = [...history ?? []]
  const last = prior[prior.length - 1]
  const merged = [
    ...last !== undefined && last.value === entry.value ? prior.slice(0, -1) : prior,
    { ...entry, source: 'collected' as const },
  ]
  return merged.slice(-200)
}

/**
 * Build the draft record for one collected listing. The kind comes from the
 * extractor; a re-import of the same link keeps the existing id and operator
 * notes, refreshes the lineage, and appends the price reading.
 * @param request - validated import request.
 * @param existing - the record already stored under the same `source.linkId`, if any.
 * @param id - record id: the existing id on merge, else the controller-minted one.
 * @returns the draft-shaped record ready for the controller's upsert validation.
 */
export function buildImportDraft(
  request: CatalogImportRequestData,
  existing: z.infer<typeof wikiItemSchema> | undefined,
  id: CatalogItemId,
): WikiItemDraftData {
  const { kind, attrs } = extractListing({
    title: request.listing.title,
    ...(request.listing.selectedSku === undefined ? {} : { selectedSku: request.listing.selectedSku }),
    ...(request.listing.params === undefined ? {} : { params: request.listing.params }),
  })
  const capturedAt = request.source.capturedAt ?? new Date(0).toISOString()
  const source = {
    platform: request.source.platform,
    url: request.source.url,
    linkId: request.source.linkId,
    ...(request.source.shopName === undefined ? {} : { shopName: request.source.shopName }),
    ...(request.source.sku === undefined ? {} : { sku: request.source.sku }),
    ...(request.source.captureId === undefined ? {} : { captureId: request.source.captureId }),
    capturedAt,
  }
  const reading = request.listing.price === undefined ? undefined : {
    value: request.listing.price,
    capturedAt,
    ...(request.source.captureId === undefined ? {} : { captureId: request.source.captureId }),
    ...(request.listing.priceRaw === undefined ? {} : { note: request.listing.priceRaw }),
  }
  const priceHistory = reading === undefined
    ? existing?.priceHistory
    : appendPrice(existing?.priceHistory, reading)

  if (kind === 'frame') {
    return {
      kind,
      id,
      brand: attrs.brand,
      ...(attrs.model === undefined ? {} : { model: attrs.model }),
      name: request.listing.title.slice(0, 300),
      origin: 'collected',
      rawUrl: request.source.url,
      ...(existing?.notes === undefined ? {} : { notes: existing.notes }),
      ...(priceHistory === undefined ? {} : { priceHistory }),
      source,
      ...(attrs.material === undefined ? {} : { material: attrs.material }),
      ...(attrs.frameShape === undefined ? {} : { frameShape: attrs.frameShape }),
      ...(attrs.frameType === undefined ? {} : { frameType: attrs.frameType }),
      ...(attrs.style === undefined ? {} : { style: attrs.style }),
      ...(attrs.gender === undefined ? {} : { gender: attrs.gender }),
      ...(attrs.nosePad === undefined ? {} : { nosePad: attrs.nosePad }),
      ...(attrs.lensWidth === undefined ? {} : { lensWidth: attrs.lensWidth }),
      ...(attrs.lensHeight === undefined ? {} : { lensHeight: attrs.lensHeight }),
      ...(attrs.totalWidth === undefined ? {} : { totalWidth: attrs.totalWidth }),
      ...(attrs.bridgeWidth === undefined ? {} : { bridgeWidth: attrs.bridgeWidth }),
      ...(attrs.templeLength === undefined ? {} : { templeLength: attrs.templeLength }),
      ...(attrs.weightG === undefined ? {} : { weightG: attrs.weightG }),
      ...(attrs.color === undefined ? {} : { color: attrs.color }),
    }
  }
  if (kind === 'lens') {
    return {
      kind,
      id,
      brand: attrs.brand,
      ...(attrs.model === undefined ? {} : { model: attrs.model }),
      name: request.listing.title.slice(0, 300),
      origin: 'collected',
      rawUrl: request.source.url,
      ...(existing?.notes === undefined ? {} : { notes: existing.notes }),
      ...(priceHistory === undefined ? {} : { priceHistory }),
      source,
      refractiveIndex: attrs.refractiveIndex ?? '1.56',
      ...(attrs.abbe === undefined ? {} : { abbe: attrs.abbe }),
      ...(attrs.lensDesign === undefined ? {} : { lensDesign: attrs.lensDesign }),
      lensType: attrs.lensType ?? 'single-vision',
      ...(attrs.lensFunctions === undefined ? {} : { lensFunctions: attrs.lensFunctions }),
      ...(attrs.coating === undefined ? {} : { coating: attrs.coating }),
      ...(attrs.diameterMm === undefined ? {} : { diameterMm: attrs.diameterMm }),
    }
  }
  return {
    kind,
    id,
    ...(attrs.brand === undefined ? {} : { brand: attrs.brand }),
    name: request.listing.title.slice(0, 300),
    origin: 'collected',
    rawUrl: request.source.url,
    ...(existing?.notes === undefined ? {} : { notes: existing.notes }),
    ...(priceHistory === undefined ? {} : { priceHistory }),
    source,
    title: request.listing.title.slice(0, 500),
    ...(request.source.sku === undefined ? {} : { sku: request.source.sku }),
    ...(request.listing.price === undefined ? {} : { price: request.listing.price }),
    ...(request.listing.mainImageUrl === undefined ? {} : { images: [request.listing.mainImageUrl] }),
  }
}
