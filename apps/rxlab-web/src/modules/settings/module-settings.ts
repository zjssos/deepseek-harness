/**
 * Workbench module → settings-namespace association for the settings hub.
 * Each entry lists the registered settings namespaces a module owns; the hub
 * renders one section per workbench module (registry `MODULES`), with editable
 * SchemaForm sections where an entry exists here and read-only workspace rows
 * otherwise. Pure data — imports module ids and namespace hints, never panels.
 */
import { agentDefaultModelDescriptor, llmDeepseekDescriptor } from '@/rxlab/settings-form/hints'
import type { NamespaceDescriptor } from '@/rxlab/settings-form/types'

/** Settings namespaces owned by one workbench module. */
export interface ModuleNamespaceSection {
  readonly moduleId: string
  readonly namespaces: readonly NamespaceDescriptor[]
}

/**
 * Modules whose settings surface is wired this round. Agent owns the model /
 * thinking deployment namespaces; the business modules (collect/wiki/fitting)
 * expose no settings namespaces yet, so their hub sections stay read-only.
 */
export const MODULE_NAMESPACE_SECTIONS: readonly ModuleNamespaceSection[] = [
  {
    moduleId: 'agent',
    namespaces: [llmDeepseekDescriptor, agentDefaultModelDescriptor],
  },
]
