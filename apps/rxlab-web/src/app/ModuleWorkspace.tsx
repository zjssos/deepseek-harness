import { Suspense } from 'react'
import { Navigate, useParams } from 'react-router-dom'

import { Skeleton } from '@/components/ui/skeleton'
import { defaultModuleId, moduleById } from '@/modules/registry'

function PanelFallback() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-4">
        <Skeleton className="size-12 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>
      <Skeleton className="h-48 rounded-xl" />
    </div>
  )
}

/** Renders the active module's panel; unknown keys redirect to the first module. */
export function ModuleWorkspace() {
  const { moduleId } = useParams()
  const module = moduleId === undefined ? undefined : moduleById(moduleId)
  if (module === undefined) return <Navigate to={`/${defaultModuleId()}`} replace />

  const Panel = module.panel
  return (
    <Suspense fallback={<PanelFallback />}>
      <Panel module={module} />
    </Suspense>
  )
}
