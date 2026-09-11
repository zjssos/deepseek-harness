/**
 * The one title block every workbench module panel renders: module identity and
 * status on the left, panel actions on the right, one dense row so a module's
 * work starts where the operator's attention does.
 */
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/** Props for the shared module panel header. */
export interface PanelHeaderProps {
  readonly icon: LucideIcon
  readonly title: string
  /** One-line module intent; omitted when the module has none to add. */
  readonly description?: string
  /** Status chips rendered beside the title, e.g. a lifecycle badge. */
  readonly status?: ReactNode
  /** Trailing controls aligned to the header end. */
  readonly actions?: ReactNode
  readonly className?: string
}

/**
 * Render the shared module panel header.
 * @param props - Module identity, status chips, and trailing actions.
 * @returns The panel header element.
 */
export function PanelHeader({
  icon: Icon,
  title,
  description,
  status,
  actions,
  className,
}: PanelHeaderProps) {
  return (
    <header className={cn('flex flex-wrap items-center gap-x-3 gap-y-2', className)}>
      <div className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-md border">
        <Icon className="size-4" />
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <h2 className="text-base leading-tight font-semibold">{title}</h2>
          {status}
        </div>
        {description === undefined ? null : (
          <p className="text-muted-foreground truncate text-sm">{description}</p>
        )}
      </div>
      {actions === undefined ? null : (
        <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </header>
  )
}
