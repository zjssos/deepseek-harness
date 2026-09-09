/**
 * Workbench workspace → session-cwd mapping shared by the SPA module surfaces.
 * The host rxlab profile keeps one workspace root (settings namespace
 * `rxlab-workspace`); a session runs in the module subdirectory when its agent
 * preset has an entry here, and at the workspace root otherwise. The host
 * rxlab-usage row mirrors this map to attribute sessions to modules.
 */
export const MODULE_SESSION_SUBDIRS: Record<string, string> = {
  collect: 'collect',
}

/** Module subdirectory for one preset id, when that preset runs scoped. */
export function moduleSubdirOf(presetId: string | undefined): string | undefined {
  return presetId === undefined ? undefined : MODULE_SESSION_SUBDIRS[presetId]
}

/**
 * The session cwd for one creation request: the module subdirectory under the
 * workspace root, the workspace root itself, or undefined (host default) when
 * the workspace is unknown.
 */
export function sessionCwd(workspaceRoot: string | undefined, agentPreset: string | undefined): string | undefined {
  if (workspaceRoot === undefined) return undefined
  const subdir = moduleSubdirOf(agentPreset)
  return subdir === undefined ? workspaceRoot : `${workspaceRoot}/${subdir}`
}
