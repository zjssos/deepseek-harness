import * as React from 'react'
import { NavLink, useLocation } from 'react-router-dom'

import { MODULES } from '@/modules/registry'
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

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="gap-2.5!">
              <NavLink to="/agent">
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
          <SidebarGroupLabel>模块</SidebarGroupLabel>
          <SidebarMenu>
            {MODULES.map((module) => {
              const Icon = module.icon
              const active = pathname === `/${module.id}`
              return (
                <SidebarMenuItem key={module.id}>
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
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
