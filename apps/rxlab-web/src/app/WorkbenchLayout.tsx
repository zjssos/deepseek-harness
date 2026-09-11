import { Outlet, useLocation } from 'react-router-dom'

import { JobContextRail } from '@/components/job-context-rail'
import { ModuleHeader } from '@/components/module-header'
import { WorkOrderHeader } from '@/components/work-order-header'

import { WorkbenchJobProvider } from './workbench-context'

/** Paths belonging to the work-order surface: the overview and the workbench. */
const WORK_ORDER_SURFACE = /^\/jobs(\/|$)/

/**
 * The shell around every route. The work-order surface and the tool modules are
 * kept apart: the work-order surface binds a work order and carries its picker
 * and context rail, while a tool module is unaware of work orders and gets only
 * a way back to the overview.
 */
export function WorkbenchLayout() {
  const { pathname } = useLocation()

  if (!WORK_ORDER_SURFACE.test(pathname)) {
    return (
      <div className="flex h-svh w-full overflow-hidden">
        <main className="bg-background flex min-w-0 flex-1 flex-col">
          <ModuleHeader />
          <Workspace />
        </main>
      </div>
    )
  }

  return (
    <WorkbenchJobProvider>
      <div className="flex h-svh w-full overflow-hidden">
        <main className="bg-background flex min-w-0 flex-1 flex-col">
          <WorkOrderHeader />
          <Workspace />
        </main>
        <JobContextRail />
      </div>
    </WorkbenchJobProvider>
  )
}

/** The scrolling workspace both shells render the routed panel into. */
function Workspace() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex w-full flex-col gap-(--workbench-panel-gap) px-(--workbench-gutter) py-(--workbench-panel-gap)">
        <Outlet />
      </div>
    </div>
  )
}
