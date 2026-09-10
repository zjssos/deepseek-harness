import type { LucideIcon } from 'lucide-react'
import type { ComponentType, LazyExoticComponent } from 'react'

import type { StageId } from '@deepseek-ai/dsh-rxlab-job/types'

/** Workbench availability of one rail module. */
export type ModuleStatus = 'planned' | 'active'

/**
 * Which sidebar group a module belongs to: the primary six-stage + 工单 nav, or
 * the secondary capabilities rail.
 */
export type ModuleGroup = 'stage' | 'tool'

/** Props every module panel receives from the workspace host. */
export interface ModulePanelProps {
  readonly module: ModuleDefinition
}

/** One rxlab workbench module: rail identity plus its workspace panel. */
export interface ModuleDefinition {
  /** URL path segment and rail key. */
  readonly id: string
  /** Human label shown in the rail (zh copy for now; locale-owned later). */
  readonly label: string
  readonly tagline: string
  readonly description: string
  /** Concrete work the module will own once wired to the rxlab host. */
  readonly scope: readonly string[]
  readonly icon: LucideIcon
  readonly status: ModuleStatus
  /** Primary stage rail vs secondary tool rail. */
  readonly group: ModuleGroup
  /** The workbench stage this panel edits; absent for 工单总览 and tools. */
  readonly stage?: StageId
  readonly panel: LazyExoticComponent<ComponentType<ModulePanelProps>>
}
