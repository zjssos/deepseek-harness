/**
 * Deterministic HTML export of a {@link GuideDocument}: a self-contained page
 * the operator can save or print. Pure string building — no DOM APIs beyond the
 * download helper, so it stays usable outside a browser test.
 */
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { GuideDocument } from '@deepseek-ai/dsh-rxlab-job/types'

/** Escape text for safe insertion into HTML markup/attributes. */
function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** Render one JSON parameter value as display text. */
function paramText(value: JsonValue): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

/** Render one list block when it carries entries. */
function listBlock(title: string, items: readonly string[] | undefined): string {
  if (items === undefined || items.length === 0) return ''
  return `<section><h3>${escapeHtml(title)}</h3><ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>`
}

/** Build the full standalone HTML page for one guide document. */
export function guideDocumentToHtml(document: GuideDocument): string {
  const consumer = document.consumer
  const meta = [
    consumer.name === undefined ? undefined : `消费者：${consumer.name}`,
    consumer.age === undefined ? undefined : `年龄：${String(consumer.age)}`,
    document.pricing === undefined ? undefined : `对客价格：${document.pricing.currency} ${String(document.pricing.amount)}`,
    `生成时间：${document.generatedAt}`,
  ].filter((part): part is string => part !== undefined)

  const chapters = document.chapters.map((chapter) => {
    const params = chapter.params === undefined ? [] : Object.entries(chapter.params)
    const paramsBlock = params.length === 0
      ? ''
      : `<section><h3>参数</h3><dl>${params.map(([key, value]) =>
        `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(paramText(value))}</dd>`).join('')}</dl></section>`
    const checksBlock = chapter.checks === undefined
      ? ''
      : `<section><h3>校验</h3><p>${escapeHtml(chapter.checks.overall)} · ${escapeHtml(chapter.checks.summary)}</p><ul>${chapter.checks.checks
        .map(check => `<li>[${escapeHtml(check.status)}] ${escapeHtml(check.name)}：${escapeHtml(check.detail)}</li>`)
        .join('')}</ul></section>`
    return `<article><h2>${escapeHtml(chapter.title)}</h2>${paramsBlock}${listBlock('策略', chapter.strategy)}${listBlock('清单', chapter.checklist)}${listBlock('话术', chapter.scripts)}${checksBlock}</article>`
  }).join('')

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>配镜指南 ${escapeHtml(String(document.jobId))}</title>
<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; margin: 2rem auto; max-width: 48rem; padding: 0 1rem; color: #1a1a1a; line-height: 1.6; }
  h1 { font-size: 1.5rem; }
  h2 { font-size: 1.15rem; margin-top: 2rem; border-bottom: 1px solid #e5e5e5; padding-bottom: .25rem; }
  h3 { font-size: .95rem; margin-bottom: .25rem; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: .25rem 1rem; margin: 0; }
  dt { color: #666; }
  dd { margin: 0; }
  ul { margin: .25rem 0; padding-left: 1.25rem; }
  .meta { color: #666; font-size: .85rem; }
</style>
</head>
<body>
<h1>配镜指南</h1>
<p class="meta">${meta.map(escapeHtml).join(' ｜ ')}</p>
${chapters}
</body>
</html>`
}

/** Trigger a browser download of one guide document as an HTML file. */
export function downloadGuideHtml(document: GuideDocument): void {
  const html = guideDocumentToHtml(document)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = window.document.createElement('a')
  anchor.href = url
  anchor.download = `guide-${String(document.jobId)}.html`
  anchor.click()
  URL.revokeObjectURL(url)
}
