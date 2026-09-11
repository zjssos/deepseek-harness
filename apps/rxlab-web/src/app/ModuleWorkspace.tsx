import { Suspense } from 'react'
import { Navigate, useParams } from 'react-router-dom'

import { Skeleton } from '@/components/ui/skeleton'
import { jobStagePath, rememberedJobId } from '@/app/workbench-context'
import { defaultModuleId, moduleById } from '@/modules/registry'

/** Lazy-panel fallback shared by the module route and the work-order route. */
export function PanelFallback() {
  return (
    <div className="flex flex-col gap-(--workbench-panel-gap)">
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-md" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <Skeleton className="h-56 rounded-lg" />
    </div>
  )
}

/**
 * Renders a routed module's panel; unknown keys redirect to the work orders. The
 * six stage keys are not routes: they are views inside the work-order workbench,
 * so a bookmarked `/<stage>` lands on that stage of the last work order the
 * operator opened. This renders outside the work-order provider, so it reads the
 * remembered binding directly.
 */
export function ModuleWorkspace() {
  const { moduleId } = useParams()
  const module = moduleId === undefined ? undefined : moduleById(moduleId)
  if (module === undefined) return <Navigate to={`/${defaultModuleId()}`} replace />
  if (module.stage !== undefined) return <Navigate to={jobStagePath(module.stage, rememberedJobId())} replace />

  const Panel = module.panel
  return (
    <Suspense fallback={<PanelFallback />}>
      <Panel module={module} />
    </Suspense>
  )
}
