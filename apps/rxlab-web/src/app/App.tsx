import { Navigate, Route, Routes } from 'react-router-dom'

import { defaultModuleId } from '@/modules/registry'

import { ModuleWorkspace } from './ModuleWorkspace'
import { WorkbenchLayout } from './WorkbenchLayout'

export default function App() {
  const home = defaultModuleId()
  return (
    <Routes>
      <Route element={<WorkbenchLayout />}>
        <Route index element={<Navigate to={`/${home}`} replace />} />
        <Route path=":moduleId" element={<ModuleWorkspace />} />
        <Route path="*" element={<Navigate to={`/${home}`} replace />} />
      </Route>
    </Routes>
  )
}
