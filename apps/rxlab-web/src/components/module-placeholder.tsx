import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { ModuleDefinition } from '@/modules/types'

/** Shared "not wired yet" workspace body every planned module renders. */
export function ModulePlaceholder({ module }: { module: ModuleDefinition }) {
  const Icon = module.icon
  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start gap-4">
        <div className="bg-primary/10 text-primary flex size-12 shrink-0 items-center justify-center rounded-xl">
          <Icon className="size-6" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{module.label}</h1>
            <Badge variant="outline">模块待接入</Badge>
          </div>
          <p className="text-muted-foreground mt-1">{module.tagline}</p>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>模块说明</CardTitle>
          <CardDescription>{module.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-3 text-sm">
            本模块属于配镜工作台业务面。当前 rxlab 基建只提供工作台壳与模块框架；
            具体能力将按规划接入（模块内实现 → 注册到模块清单 → 对接 rxlab host 编排）。
          </p>
          <ul className="text-muted-foreground flex list-disc flex-col gap-1.5 pl-5 text-sm">
            {module.scope.map(item => <li key={item}>{item}</li>)}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
