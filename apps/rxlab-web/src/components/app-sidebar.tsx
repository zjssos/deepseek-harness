import * as React from 'react'
import { NavLink, useLocation } from 'react-router-dom'

import { modulesByGroup } from '@/modules/registry'
import { cn } from '@/lib/utils'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

/** Official shadcn sidebar shell driven by the rxlab workbench module manifest. */
export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { pathname } = useLocation()
  const stages = modulesByGroup('stage')
  const tools = modulesByGroup('tool')

  const isActive = (id: string): boolean =>
    pathname === `/${id}` || pathname.startsWith(`/${id}/`)

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="gap-2.5!">
              <NavLink to="/jobs">
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex size-8 items-center justify-center rounded-md text-sm font-bold">
                  RX
                </div>
                <span className="text-base font-semibold">rxlab</span>
                <span className="text-muted-foreground text-xs">配镜工作台</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>配镜流程</SidebarGroupLabel>
          <SidebarMenu>
            {stages.map(module => (
              <SidebarItem key={module.id} module={module} active={isActive(module.id)} />
            ))}
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>工具</SidebarGroupLabel>
          <SidebarMenu>
            {tools.map(module => (
              <SidebarItem key={module.id} module={module} active={isActive(module.id)} />
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}

/** One rail entry. */
function SidebarItem({
  module,
  active,
}: {
  readonly module: ReturnType<typeof modulesByGroup>[number]
  readonly active: boolean
}) {
  const Icon = module.icon
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={active}
        tooltip={module.label}
        className={cn(active && 'bg-sidebar-accent text-sidebar-accent-foreground')}
      >
        <NavLink to={`/${module.id}`}>
          <Icon className="size-4!" />
          <span>{module.label}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
