import { ModulePlaceholder } from '@/components/module-placeholder'
import type { ModulePanelProps } from '@/modules/types'

export default function AgentPanel({ module }: ModulePanelProps) {
  return <ModulePlaceholder module={module} />
}
