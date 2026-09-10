/**
 * Consumer-profile display helpers shared by the work-order list, detail, and
 * the create/edit dialogs. zh copy until the app gains a locale dictionary.
 */
import type { ConsumerProfile, ConsumerUsage, Money } from '@deepseek-ai/dsh-rxlab-job/types'

/** zh label per consumer-usage value. */
export const USAGE_LABELS: Record<ConsumerUsage, string> = {
  far: '远用',
  near: '近用',
  computer: '电脑/办公',
  outdoor: '户外',
  all: '全天',
}

/** Every consumer-usage value in display order. */
export const USAGE_OPTIONS = Object.keys(USAGE_LABELS) as ConsumerUsage[]

/** Format one money value; empty string when absent. */
export function formatMoney(money: Money | undefined): string {
  return money === undefined ? '' : `${money.currency} ${money.amount}`
}

/** One-line consumer summary for list rows and headers. */
export function consumerSummary(consumer: ConsumerProfile): string {
  return [
    consumer.age === undefined ? undefined : `${String(consumer.age)} 岁`,
    consumer.usage === undefined ? undefined : USAGE_LABELS[consumer.usage],
    consumer.faceWidthMm === undefined ? undefined : `面宽 ${String(consumer.faceWidthMm)}mm`,
    consumer.budget === undefined ? undefined : `预算 ${formatMoney(consumer.budget)}`,
  ].filter((part): part is string => part !== undefined).join(' · ')
}
