/**
 * Module → agent composition helpers shared by the SPA module surfaces. The
 * single authoritative source is the host settings namespace
 * `rxlab-module-agents` (registered by the rxlab-workspace-paths row); this
 * module mirrors the host's default base so the SPA still works when a host
 * does not compose that namespace (older hosts), and decodes the namespace
 * view into the same map shape.
 */
import type { JsonValue } from '@deepseek-ai/dsh-util-values'

/** Host settings namespace carrying the module → agent composition map. */
export const MODULE_AGENTS_SETTINGS_NAMESPACE = 'rxlab-module-agents'

/** One module's agent composition: the preset id and the workspace subdir its sessions run in. */
export interface ModuleAgentMapping {
  readonly preset: string
  readonly subdir: string
}

/** Module id → agent composition map (mirror of the host value). */
export type ModuleAgents = Readonly<Record<string, ModuleAgentMapping>>

/** Default module→agent base mirroring the host `rxlab-module-agents` base. */
export const DEFAULT_MODULE_AGENTS: ModuleAgents = {
  collect: { preset: 'collect', subdir: 'collect' },
}

/** Decode a settings view value into a module→agent map; malformed input falls back to the default. */
export function moduleAgentsOf(value: JsonValue | undefined): ModuleAgents {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return DEFAULT_MODULE_AGENTS
  const record = (value as Record<string, unknown>).modules
  if (typeof record !== 'object' || record === null || Array.isArray(record)) return DEFAULT_MODULE_AGENTS
  const out: Record<string, ModuleAgentMapping> = {}
  for (const [moduleId, entry] of Object.entries(record as Record<string, unknown>)) {
    if (typeof entry !== 'object' || entry === null) continue
    const candidate = entry as Record<string, unknown>
    if (typeof candidate.preset === 'string' && typeof candidate.subdir === 'string') {
      out[moduleId] = { preset: candidate.preset, subdir: candidate.subdir }
    }
  }
  return Object.keys(out).length > 0 ? out : DEFAULT_MODULE_AGENTS
}

/** The module entry whose preset id matches, or undefined when the preset runs at the workspace root. */
export function moduleEntryOf(
  moduleAgents: ModuleAgents,
  presetId: string | undefined,
): ModuleAgentMapping | undefined {
  if (presetId === undefined) return undefined
  return Object.values(moduleAgents).find(entry => entry.preset === presetId)
}

/**
 * The session cwd for one creation request: the module subdirectory under the
 * workspace root when the preset belongs to a module, the workspace root
 * itself, or undefined (host default) when the workspace is unknown.
 */
export function sessionCwd(
  workspaceRoot: string | undefined,
  moduleAgents: ModuleAgents,
  agentPreset: string | undefined,
): string | undefined {
  if (workspaceRoot === undefined) return undefined
  const entry = moduleEntryOf(moduleAgents, agentPreset)
  return entry === undefined ? workspaceRoot : `${workspaceRoot}/${entry.subdir}`
}
