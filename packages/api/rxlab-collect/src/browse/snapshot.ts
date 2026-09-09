/**
 * Readable page snapshots for the collect agent browse tools: one Playwright
 * page becomes `{ url, title, text, elements }`, where every interactive
 * element carries a `ref` the `browser_click`/`browser_type` tools resolve
 * through the injected `data-dsh-ref` attribute. Formatting is pure and
 * unit-covered; capture is the only Playwright-coupled part.
 * @module @deepseek-ai/dsh-rxlab-collect/src/browse/snapshot
 */

import type { Page } from 'playwright'

/** One interactive element of a snapshot; `ref` resolves clicks after navigation. */
export interface SnapshotElement {
  /** Positive reference number matching the injected `data-dsh-ref` attribute. */
  ref: number
  /** Lowercased HTML tag (`a`, `button`, `input`, …). */
  tag: string
  /** Human label: aria-label, visible text, placeholder, title, or name. */
  label: string
}

/** One captured page, ready for the model. */
export interface PageSnapshot {
  url: string
  title: string
  /** Visible body text, newlines collapsed, capped at the text budget. */
  text: string
  /** Visible interactive elements in document order. */
  elements: SnapshotElement[]
  /** True when the text budget cut the body text. */
  textTruncated: boolean
  /** True when more interactive elements exist than the cap kept. */
  elementsTruncated: boolean
}

/** Format budgets for one snapshot. */
export interface SnapshotCaps {
  /** Maximum number of interactive elements kept. */
  maxElements: number
  /** Maximum characters of body text kept. */
  maxTextChars: number
}

/** Selector for elements the model may act on. */
const INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="checkbox"]',
  '[role="combobox"]',
  '[onclick]',
].join(', ')

/**
 * Capture one page snapshot: inject `data-dsh-ref` on every kept interactive
 * element so later clicks resolve by ref, and read the visible body text.
 * @param page - the page to read.
 * @param caps - element and text budgets.
 * @returns the snapshot with truncation flags.
 */
export async function captureSnapshot(page: Page, caps: SnapshotCaps): Promise<PageSnapshot> {
  // The evaluate body is stringified and run in the page, so it must stay
  // self-contained: no nested named functions (tsx/esbuild keepNames would
  // reference a module-level `__name` helper the page does not have) and no
  // module-scope bindings (the selector list travels in as an argument).
  const raw = await page.evaluate(({ maxElements, maxTextChars, selector }) => {
    const elements: { ref: number; tag: string; label: string }[] = []
    let elementsTruncated = false
    for (const el of Array.from(document.querySelectorAll(selector))) {
      if (elements.length >= maxElements) {
        elementsTruncated = true
        break
      }
      const rect = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      if (rect.width <= 0 || rect.height <= 0
        || style.visibility === 'hidden' || style.display === 'none') {
        continue
      }
      const aria = el.getAttribute('aria-label')
      const text = ((el as HTMLElement).innerText || el.textContent || '').trim().replace(/\s+/g, ' ')
      let elementLabel = aria !== null && aria.trim().length > 0 ? aria.trim() : text
      if (elementLabel.length === 0) {
        for (const attribute of ['placeholder', 'title', 'name']) {
          const value = el.getAttribute(attribute)
          if (value !== null && value.trim().length > 0) {
            elementLabel = value.trim()
            break
          }
        }
      }
      elementLabel = elementLabel.slice(0, 120)
      if (elementLabel.length === 0) continue
      const ref = elements.length + 1
      el.setAttribute('data-dsh-ref', String(ref))
      elements.push({ ref, tag: el.tagName.toLowerCase(), label: elementLabel })
    }
    const rawText = document.body.innerText
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    return {
      url: location.href,
      title: document.title,
      text: rawText.slice(0, maxTextChars),
      elements,
      textTruncated: rawText.length > maxTextChars,
      elementsTruncated,
    }
  }, {
    maxElements: caps.maxElements,
    maxTextChars: caps.maxTextChars,
    selector: INTERACTIVE_SELECTOR,
  })
  return raw
}

/**
 * Render one snapshot as the model-facing text block. Pure so tests can pin
 * the layout; the click/type tools embed the same ref line format.
 * @param snapshot - the captured page.
 * @returns the formatted text.
 */
export function formatSnapshot(snapshot: PageSnapshot): string {
  const lines = [
    `URL: ${snapshot.url}`,
    `标题: ${snapshot.title}`,
    '',
    '页面文本:',
    snapshot.text,
    '',
    `可交互元素(${snapshot.elements.length} 个，用 ref 引用):`,
    ...snapshot.elements.map(element => `[${element.ref}] <${element.tag}> ${element.label}`),
  ]
  if (snapshot.textTruncated) lines.push('(页面文本被截断，可用 browser_scroll 或翻页查看更多)')
  if (snapshot.elementsTruncated) lines.push('(可交互元素超过上限，仅列出前面的部分)')
  return lines.join('\n')
}
