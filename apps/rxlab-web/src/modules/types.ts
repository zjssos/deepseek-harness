import type { LucideIcon } from 'lucide-react'
import type { ComponentType, LazyExoticComponent } from 'react'

import type { StageId } from '@deepseek-ai/dsh-rxlab-job/types'

/** Workbench availability of one module. */
export type ModuleStatus = 'planned' | 'active'

/**
 * Which surface a module belongs to: the work-order core, the six stages that
 * render inside the work-order workbench, or the tools reached from the top bar.
 */
export type ModuleGroup = 'core' | 'stage' | 'tool'

/** Props every module panel receives from the workspace host. */
export interface ModulePanelProps {
  readonly module: ModuleDefinition
}

/** One rxlab workbench module: identity plus its panel. */
export interface ModuleDefinition {
  /** Route path segment and lookup key. */
  readonly id: string
  /** Human label shown in navigation (zh copy for now; locale-owned later). */
  readonly label: string
  readonly tagline: string
  readonly description: string
  /** Concrete work the module will own once wired to the rxlab host. */
  readonly scope: readonly string[]
  readonly icon: LucideIcon
  readonly status: ModuleStatus
  /** Work-order core, an in-workbench stage, or a top-bar tool. */
  readonly group: ModuleGroup
  /** The workbench stage this panel edits; absent for 工单总览 and tools. */
  readonly stage?: StageId
  readonly panel: LazyExoticComponent<ComponentType<ModulePanelProps>>
}
