/** Zh timestamp formatting shared by the workbench surfaces (locale-owned later). */

/**
 * Format one ISO timestamp for display, falling back to the raw value.
 * @param value - ISO timestamp as stored on a work-order or stage row.
 * @returns The zh locale date-time string, or `value` when it does not parse.
 */
export function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}
