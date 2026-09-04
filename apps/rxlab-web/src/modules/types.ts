import type { LucideIcon } from 'lucide-react'
import type { ComponentType, LazyExoticComponent } from 'react'

/** Workbench availability of one rail module. */
export type ModuleStatus = 'planned'

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
  readonly panel: LazyExoticComponent<ComponentType<ModulePanelProps>>
}
