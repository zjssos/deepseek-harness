import { Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { defaultModuleId, jobDetailPanel } from '@/modules/registry'

import { ModuleWorkspace, PanelFallback } from './ModuleWorkspace'
import { WorkbenchLayout } from './WorkbenchLayout'

/** Lazy job-detail/guide page at `/jobs/:jobId`. */
function JobDetailRoute() {
  const JobDetail = jobDetailPanel
  return (
    <Suspense fallback={<PanelFallback />}>
      <JobDetail />
    </Suspense>
  )
}

export default function App() {
  const home = defaultModuleId()
  return (
    <Routes>
      <Route element={<WorkbenchLayout />}>
        <Route index element={<Navigate to={`/${home}`} replace />} />
        <Route path="jobs/:jobId" element={<JobDetailRoute />} />
        <Route path=":moduleId" element={<ModuleWorkspace />} />
        <Route path="*" element={<Navigate to={`/${home}`} replace />} />
      </Route>
    </Routes>
  )
}
