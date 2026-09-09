/**
 * Workbench module → settings-namespace association for the settings hub.
 * Each entry lists the registered settings namespaces a module owns; the hub
 * renders one section per workbench module (registry `MODULES`), with editable
 * SchemaForm sections where an entry exists here and read-only workspace rows
 * otherwise. Pure data — imports module ids and namespace hints, never panels.
 */
import {
  agentDefaultModelDescriptor,
  collectBrowserDescriptor,
  llmDeepseekDescriptor,
} from '@/rxlab/settings-form/hints'
import type { NamespaceDescriptor } from '@/rxlab/settings-form/types'

/** Settings namespaces owned by one workbench module. */
export interface ModuleNamespaceSection {
  readonly moduleId: string
  readonly namespaces: readonly NamespaceDescriptor[]
}

/**
 * Modules whose settings surface is wired. Agent owns the model / thinking
 * deployment namespaces; collect owns its browser knobs; the remaining modules
 * (wiki/fitting) expose no settings namespaces yet, so their hub sections stay
 * read-only until their own agent integration lands.
 */
export const MODULE_NAMESPACE_SECTIONS: readonly ModuleNamespaceSection[] = [
  {
    moduleId: 'agent',
    namespaces: [llmDeepseekDescriptor, agentDefaultModelDescriptor],
  },
  {
    moduleId: 'collect',
    namespaces: [collectBrowserDescriptor],
  },
]

/** Namespace descriptors owned by one module id; empty when the module has none. */
export function namespaceSectionsOf(moduleId: string): readonly NamespaceDescriptor[] {
  const section = MODULE_NAMESPACE_SECTIONS.find(entry => entry.moduleId === moduleId)
  return section === undefined ? [] : section.namespaces
}
