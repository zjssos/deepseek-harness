import { NavLink, Outlet } from 'react-router-dom'
import { Moon, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTheme } from '@/lib/theme'
import { MODULES } from '@/modules/registry'
import { cn } from '@/lib/utils'

export function AppShell() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="bg-background flex h-full min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <div className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-md text-sm font-bold tracking-tight">
          RX
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-base font-semibold tracking-tight">rxlab</span>
          <span className="text-muted-foreground text-xs">配镜工作台</span>
        </div>
        <div className="ml-auto">
          <Button
            variant="ghost"
            size="icon"
            aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <Sun /> : <Moon />}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="flex w-16 shrink-0 flex-col items-center gap-1 border-r py-3" aria-label="模块导航">
          {MODULES.map((module) => {
            const Icon = module.icon
            return (
              <Tooltip key={module.id}>
                <TooltipTrigger asChild>
                  <NavLink
                    to={`/${module.id}`}
                    aria-label={module.label}
                    className={({ isActive }) =>
                      cn(
                        'flex size-10 items-center justify-center rounded-md transition-colors',
                        isActive
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                      )
                    }
                  >
                    <Icon className="size-5" aria-hidden />
                  </NavLink>
                </TooltipTrigger>
                <TooltipContent side="right">{module.label}</TooltipContent>
              </Tooltip>
            )
          })}
          <Separator className="my-2 w-8" />
        </nav>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl px-8 py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
