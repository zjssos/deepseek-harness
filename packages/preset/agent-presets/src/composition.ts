/**
 * Preset composition documents and `extends` resolution.
 *
 * A preset's `agent.cordis.yml` is one of two shapes. A top-level list is a
 * STANDALONE composition — the entry list the mount installs. A map carrying
 * `extends` is a DELTA preset: it names one base preset by id, and its `rows`
 * are the runtime patch list applied to that base's entry list, with the same
 * patch semantics the profile layer uses ({@link applyEntryPatches}): a row
 * with an `id` overrides that entry's fields (the whole `config` replaced, not
 * merged), and an `insert` row appends new entries. Inheritance is single: a
 * delta may extend a standalone preset or another delta, and the chain is
 * composed deepest-first.
 *
 * The resolution is the owning `resolve(request): Spec` step: it decides the
 * exact file the mount reads and the patches it applies, so mounting, health,
 * and the composition inventory answer from one place instead of re-deriving
 * the composition. Every failure here is loud — a delta naming a missing base,
 * a cycle, or a patch that matches nothing throws, because silently skipping
 * a patch would mount a composition nobody asked for.
 * @module @deepseek-ai/dsh-agent-presets/composition
 */

import { readFile } from 'node:fs/promises'
import { load } from 'js-yaml'
import { entryListSchema, type PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import type { EntryOptions } from '@deepseek-ai/cordis-plugin-loader'
import { PRESET_ID, type AgentPreset } from './preset.ts'

/**
 * Why `rows` cannot be an entry list, or undefined when it can.
 *
 * A shallow shape check, deliberately short of the loader's work: it does not
 * resolve plugin names or apply configs. What it catches is the hand-edit
 * that produces a file the loader cannot even begin with — and it must accept
 * everything the loader accepts, which is why rows are only required to be
 * maps carrying a plugin `name` (groups recurse into their own lists).
 *
 * Shared with the composition inventory, whose file reads race edits against
 * the health verdict and must judge the raced content by the same rule.
 * @param rows - the parsed composition document.
 * @param at - row-path prefix for nested diagnostics, empty at the top level.
 * @returns one human-readable reason, or undefined when the shape holds.
 */
export function entryListProblem(rows: unknown, at = ''): string | undefined {
  if (!Array.isArray(rows)) {
    return at === ''
      ? 'the composition must be a top-level list of plugin rows'
      : `group ${at} must hold a list of plugin rows`
  }
  for (const [index, row] of rows.entries()) {
    const label = at === '' ? `row ${String(index + 1)}` : `${at} row ${String(index + 1)}`
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      return `${label} is not a plugin row (expected a map with a "name")`
    }
    const { name, group, config } = row as { name?: unknown; group?: unknown; config?: unknown }
    if (typeof name !== 'string' || name === '') {
      return `${label} names no plugin (a "name" string is required)`
    }
    if (group === true) {
      const nested = entryListProblem(config, label)
      if (nested !== undefined) return nested
    }
  }
  return undefined
}

/** One parsed composition document, by its top-level shape. */
export type CompositionDocument =
  | { readonly kind: 'standalone'; readonly rows: EntryOptions[] }
  | { readonly kind: 'delta'; readonly baseId: string; readonly patches: PatchOptions[] }

/** Why the document at `path` is neither shape, rendered as one line. */
export class CompositionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CompositionError'
  }
}

/**
 * Why the parsed document cannot be a composition, or undefined when it can.
 *
 * The delta shape is deliberately narrow: `extends` must name a usable preset
 * id, `rows` must be a list, and a non-insert patch must carry the `id` it
 * targets — the loader's patch application would otherwise warn-and-skip it,
 * which for a preset means mounting rows nobody asked for. An entry-shaped
 * map (a missing `extends` on a map document) is the common hand-edit and
 * gets its own line.
 * @param document - the parsed composition document.
 * @returns one human-readable reason, or undefined when the document is a valid shape.
 */
export function documentProblem(document: unknown): string | undefined {
  if (Array.isArray(document)) return undefined
  if (typeof document !== 'object' || document === null || Array.isArray(document)) {
    return 'the composition must be a top-level list of plugin rows'
  }
  const record = document as { extends?: unknown; rows?: unknown }
  const base = record.extends
  if (typeof base !== 'string' || base === '') {
    // The map WITHOUT `extends` is the common hand-edit (a row key beside a
    // list); it is the same verdict the list shape reports, by the same text.
    return 'the composition must be a top-level list of plugin rows'
  }
  if (!PRESET_ID.test(base)) {
    return `extends must be a preset id matching ${String(PRESET_ID)}, got ${JSON.stringify(base)}`
  }
  if (record.rows !== undefined) {
    if (!Array.isArray(record.rows)) return 'the delta "rows" must be a list of patch rows'
    for (const [index, patch] of record.rows.entries()) {
      if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
        return `patch row ${String(index + 1)} is not a map`
      }
      const entry = patch as { id?: unknown; insert?: unknown }
      const hasInsert = entry.insert !== undefined
      if (!hasInsert && (typeof entry.id !== 'string' || entry.id === '')) {
        return `patch row ${String(index + 1)} carries no "id" (a row without one could never match an entry)`
      }
      if (hasInsert) {
        const shape = entryListProblem(entry.insert)
        if (shape !== undefined) return `patch row ${String(index + 1)} inserts an invalid entry list: ${shape}`
      }
    }
  }
  return undefined
}

/**
 * Read and parse one composition document, judging only its shape.
 * @param path - absolute path of the composition file.
 * @returns the parsed standalone rows or delta declaration.
 * @throws {@link CompositionError} when the file is unreadable, unparsable, or wrongly shaped.
 */
export async function readCompositionDocument(path: string): Promise<CompositionDocument> {
  let content: string
  try {
    content = await readFile(path, 'utf8')
  } catch (error) {
    throw new CompositionError(`the composition file cannot be read: ${String(error)}`)
  }
  let document: unknown
  try {
    document = load(content, { schema: entryListSchema })
  } catch (error) {
    /* v8 ignore next -- js-yaml throws YAMLException (an Error) for every parse failure; the fallback keeps a hostile value readable */
    throw new CompositionError(`the composition is not valid YAML: ${error instanceof Error ? error.message : String(error)}`)
  }
  const problem = documentProblem(document)
  if (problem !== undefined) throw new CompositionError(problem)
  if (Array.isArray(document)) return { kind: 'standalone', rows: document as EntryOptions[] }
  const record = document as { extends: string; rows?: PatchOptions[] }
  return { kind: 'delta', baseId: record.extends, patches: record.rows ?? [] }
}

/**
 * Every id one entry list declares, including entries inside groups.
 * @param rows - the parsed entry list.
 * @param into - the index to add to.
 */
function indexIds(rows: readonly EntryOptions[], into: Map<string, EntryOptions>): void {
  for (const entry of rows) {
    if (typeof entry.id === 'string' && entry.id !== '') into.set(entry.id, entry)
    if (entry.group === true && Array.isArray(entry.config)) indexIds(entry.config, into)
  }
}

/**
 * Whether every patch in the list can be applied to the base rows, matching
 * {@link applyEntryPatches} decision for decision. The composition is judged
 * BEFORE mounting so a delta that names an absent id, inserts into a
 * non-group, or renames an entry fails on the roster and at every mount,
 * never silently shortening the composition a session runs.
 * @param rows - the base entry list the patches target.
 * @param patches - the patch list, in application order.
 * @returns one human-readable reason, or undefined when every patch applies.
 */
export function patchProblem(rows: readonly EntryOptions[], patches: readonly PatchOptions[]): string | undefined {
  const entries = new Map<string, EntryOptions>()
  indexIds(rows, entries)
  for (const [index, patch] of patches.entries()) {
    const label = `patch row ${String(index + 1)}`
    if (patch.insert !== undefined) {
      if (patch.id === undefined) {
        indexIds(patch.insert, entries)
        continue
      }
      const target = entries.get(patch.id)
      if (target === undefined) return `${label} inserts into entry "${patch.id}", which the composition does not declare`
      if (target.group !== true) return `${label} inserts into entry "${patch.id}", which is not a group`
      indexIds(patch.insert, entries)
      continue
    }
    const target = entries.get(patch.id ?? '')
    if (target === undefined) return `${label} targets entry "${String(patch.id)}", which the composition does not declare`
    if (patch.name !== undefined && patch.name !== target.name) {
      return `${label} names "${patch.name}" but entry "${String(patch.id)}" names "${target.name}"`
    }
  }
  return undefined
}

/** One preset's resolved composition: what the mount installs, and what it was composed from. */
export interface PresetComposition {
  /** Absolute path of the entry-list file the mount reads. */
  readonly path: string
  /** Runtime patches applied after reading that file; empty for a standalone preset. */
  readonly patches: readonly PatchOptions[]
  /** The presets from the deepest standalone base to the selected one, in composition order. */
  readonly chain: readonly AgentPreset[]
}

/** Look up one preset by id within a fixed roster snapshot. */
export type PresetFinder = (id: string) => Promise<AgentPreset | undefined>

/**
 * Resolve the composition one preset mounts: walk its `extends` chain to the
 * deepest standalone base, flatten every delta's patches deepest-first, and
 * prove each layer's patches match the composition beneath it.
 * @param preset - the selected preset.
 * @param find - roster lookup by id, over the same roots the caller discovered with.
 * @returns the mountable composition.
 * @throws {@link CompositionError} when the chain is broken, cyclic, or a layer's patches match nothing.
 */
export async function resolveComposition(preset: AgentPreset, find: PresetFinder): Promise<PresetComposition> {
  const visited = new Set<string>([preset.id])
  const chain: AgentPreset[] = [preset]
  const layers: PatchOptions[][] = []
  let current = preset
  for (;;) {
    const document = await readCompositionDocument(current.path)
    if (document.kind === 'standalone') {
      // Deepest layer first: one flat list applied to the base file, with
      // inserts indexed as they are added, reproduces the per-layer order.
      const patches = layers.reverse().flat()
      const problem = patchProblem(document.rows, patches)
      if (problem !== undefined) {
        throw new CompositionError(`preset "${preset.id}": ${problem}`)
      }
      return { path: current.path, patches, chain: chain.reverse() }
    }
    const base = await find(document.baseId)
    if (base === undefined) {
      throw new CompositionError(
        `preset "${current.id}" extends "${document.baseId}", which the roster does not supply`,
      )
    }
    if (visited.has(base.id)) {
      throw new CompositionError(`preset "${current.id}" takes part in an extends cycle through "${base.id}"`)
    }
    visited.add(base.id)
    layers.push(document.patches)
    chain.push(base)
    current = base
  }
}
