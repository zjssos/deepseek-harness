import { Navigate, Route, Routes } from 'react-router-dom'

import { defaultModuleId } from '@/modules/registry'

import { AppShell } from './AppShell'
import { ModuleWorkspace } from './ModuleWorkspace'

export default function App() {
  const home = defaultModuleId()
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to={`/${home}`} replace />} />
        <Route path=":moduleId" element={<ModuleWorkspace />} />
        <Route path="*" element={<Navigate to={`/${home}`} replace />} />
      </Route>
    </Routes>
  )
}
