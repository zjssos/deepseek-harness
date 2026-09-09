/**
 * WorkspaceInfoBlock: read-only key/value rows for a workbench module's
 * settings section — what the module controls under the workspace (status,
 * workspace root, session subdirectory), shown before its editable fields.
 * zh copy until the app gains a locale dictionary.
 */

export interface WorkspaceInfoRow {
  /** zh row label. */
  readonly label: string
  readonly value: string
  /** Render the value in mono (paths, ids). */
  readonly mono?: boolean
}

export function WorkspaceInfoBlock({ rows }: { rows: readonly WorkspaceInfoRow[] }) {
  if (rows.length === 0) return null
  return (
    <dl className="flex flex-col gap-1.5">
      {rows.map(row => (
        <div key={row.label} className="flex items-baseline justify-between gap-4">
          <dt className="shrink-0 text-xs text-muted-foreground">{row.label}</dt>
          <dd className={`min-w-0 truncate text-right text-xs ${row.mono === true ? 'font-mono' : ''}`}>{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}
