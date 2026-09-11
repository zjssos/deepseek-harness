/**
 * Pure parsing and normalization helpers shared by the hand-entry forms and
 * the CSV import path. No network, no browser — kept free of side effects so
 * the package unit tests can cover rejection paths offline.
 * @module @deepseek-ai/dsh-rxlab-collect/src/parse
 */

import type { CollectPlatform } from './types.ts'

/** Best-effort platform guess from a product URL host. */
export function platformFromUrl(url: string): CollectPlatform | undefined {
  if (/jd\.com/.test(url)) return 'jd'
  if (/taobao\.com|tmall\.com/.test(url)) return 'taobao'
  if (/1688\.com/.test(url)) return '1688'
  return undefined
}

/** Extract the numeric JD sku from a desktop or mobile item URL. */
export function jdSkuFromUrl(url: string): string | null {
  const match = url.match(/item(?:\.m)?\.jd\.com\/(?:product\/)?(\d+)/)
  return match?.[1] ?? null
}

/** The canonical JD desktop product URL for one sku. */
export function jdDesktopUrl(sku: string): string {
  return `https://item.jd.com/${sku}.html`
}

/** Extract the numeric Taobao/Tmall item id from an item URL (`id=` query). */
export function taobaoIdFromUrl(url: string): string | null {
  if (!/taobao\.com|tmall\.com/.test(url)) return null
  return url.match(/[?&]id=(\d+)/)?.[1] ?? null
}

/** The canonical Taobao desktop product URL for one item id. */
export function taobaoItemUrl(id: string): string {
  return `https://item.taobao.com/item.htm?id=${id}`
}

/**
 * Split CSV text into rows honouring double-quoted fields (a doubled quote is
 * an escaped quote). Returns the raw field grid; header semantics are applied
 * by {@link csvToRecords}.
 */
export function splitCsvLines(text: string): { rows: string[][]; errors: { row: number; reason: string }[] } {
  const errors: { row: number; reason: string }[] = []
  const rows: string[][] = []
  const physical = text.replace(/\r\n?/g, '\n').split('\n')
  let rowNo = 0
  let current: string[] = []
  let field = ''
  let inQuotes = false
  const pushField = (): void => { current.push(field); field = '' }
  const pushRow = (): void => {
    rowNo++
    if (inQuotes) {
      errors.push({ row: rowNo, reason: `第 ${rowNo} 行存在未闭合的引号` })
      inQuotes = false
    }
    rows.push(current)
    current = []
  }
  for (const line of physical) {
    const chars = Array.from(line)
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i]
      if (ch === undefined) continue
      if (inQuotes) {
        if (ch === '"') {
          if (chars[i + 1] === '"') {
            field += '"'
            i++
          } else {
            inQuotes = false
          }
        } else {
          field += ch
        }
      } else if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        pushField()
      } else {
        field += ch
      }
    }
    if (inQuotes) {
      field += '\n'
    } else {
      pushField()
      pushRow()
    }
  }
  if (field !== '' || current.length > 0) {
    // Trailing record without a final newline.
    pushField()
    pushRow()
  }
  return {
    rows: rows.filter(row => row.some(cell => cell.trim() !== '')),
    errors,
  }
}

/** Header names accepted (case-insensitive) with their canonical key. */
const HEADER_ALIASES: Readonly<Record<string, string>> = {
  platform: 'platform',
  平台: 'platform',
  url: 'url',
  链接: 'url',
  sku: 'sku',
  title: 'title',
  标题: 'title',
}

/** One parsed CSV row keyed by canonical field name. */
export interface CsvRecord {
  readonly platform: string
  readonly url: string
  readonly sku?: string
  readonly title?: string
}

/**
 * Parse CSV text with a header row into keyed records. The header must carry
 * `url`; a row is rejected when its url is blank, and a blank platform is
 * allowed because the caller infers it from the url host. The owning shop
 * never comes from the file: the import request names it.
 */
export function csvToRecords(text: string): { records: CsvRecord[]; errors: { row: number; reason: string }[] } {
  const { rows, errors } = splitCsvLines(text)
  const first = rows[0]
  if (first === undefined) {
    return { records: [], errors: [{ row: 1, reason: 'CSV 为空' }] }
  }
  const header = first.map(cell => HEADER_ALIASES[cell.trim().toLowerCase()] ?? '')
  const platformIdx = header.indexOf('platform')
  const urlIdx = header.indexOf('url')
  if (urlIdx < 0) {
    return {
      records: [],
      errors: [{ row: 1, reason: '表头缺少 url 列' }],
    }
  }
  const records: CsvRecord[] = []
  rows.slice(1).forEach((cells, index) => {
    const row = index + 2
    const platform = cells[platformIdx]?.trim() ?? ''
    const url = cells[urlIdx]?.trim() ?? ''
    if (url === '') {
      errors.push({ row, reason: `第 ${row} 行缺少 url` })
      return
    }
    const pick = (key: string): string | undefined => {
      const idx = header.indexOf(key)
      const value = idx >= 0 ? cells[idx]?.trim() ?? '' : ''
      return value === '' ? undefined : value
    }
    const sku = pick('sku')
    const title = pick('title')
    records.push({
      platform,
      url,
      ...(sku === undefined ? {} : { sku }),
      ...(title === undefined ? {} : { title }),
    })
  })
  return { records, errors }
}

/** Compact readable text from any thrown value. */
export function readableError(cause: unknown): string {
  if (cause instanceof Error) return cause.message
  return String(cause)
}
