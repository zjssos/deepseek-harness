/**
 * The tool modules' top bar. Tool modules carry no work-order binding, so this
 * header offers the way back to the work-order surface and nothing else — the
 * 更多 menu switches tools.
 */
import { ArrowLeft } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { moduleById } from '@/modules/registry'
import { MoreMenu } from './more-menu'
import { ThemeToggle } from './theme-toggle'

/** Tool-module top bar: back to the work orders, the module name, and switches. */
export function ModuleHeader() {
  const { pathname } = useLocation()
  const module = moduleById(pathname.split('/')[1] ?? '')

  return (
    <header className="bg-background flex h-(--header-height) shrink-0 items-center border-b">
      <div className="flex w-full min-w-0 items-center gap-2 px-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/jobs">
            <ArrowLeft className="size-3.5" />
            工单总览
          </Link>
        </Button>
        <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-4" />
        <span className="truncate text-sm font-medium">{module?.label ?? '工具'}</span>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <MoreMenu />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
