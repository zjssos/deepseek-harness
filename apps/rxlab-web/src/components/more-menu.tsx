/**
 * The tools and settings menu. Both top bars render it, so a tool module can be
 * reached from the work-order surface and vice versa without a module sidebar.
 */
import { MoreHorizontal } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toolModules } from '@/modules/registry'
import type { ModuleDefinition } from '@/modules/types'

/** Tools and settings, reachable from either top bar. */
export function MoreMenu() {
  const modules = toolModules()
  const settings = modules.filter(module => module.id === 'settings')
  const tools = modules.filter(module => module.id !== 'settings')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="更多">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>工具</DropdownMenuLabel>
        <DropdownMenuGroup>
          {tools.map(module => <MenuEntry key={module.id} module={module} />)}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>设置</DropdownMenuLabel>
        <DropdownMenuGroup>
          {settings.map(module => <MenuEntry key={module.id} module={module} />)}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** One tool or settings entry in the 更多 menu. */
function MenuEntry({ module }: { readonly module: ModuleDefinition }) {
  const Icon = module.icon
  return (
    <DropdownMenuItem asChild>
      <Link to={`/${module.id}`}>
        <Icon className="size-4" />
        {module.label}
      </Link>
    </DropdownMenuItem>
  )
}
