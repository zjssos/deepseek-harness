/** Dark/light toggle, shared by the work-order and module top bars. */
import { Moon, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useTheme } from '@/lib/theme'

/** Switches the workbench between the light and dark themes. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
      onClick={() => { setTheme(theme === 'dark' ? 'light' : 'dark') }}
    >
      {theme === 'dark' ? <Sun /> : <Moon />}
    </Button>
  )
}
