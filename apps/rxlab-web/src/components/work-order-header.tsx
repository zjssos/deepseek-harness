/**
 * The work-order surface's top bar. Only the work-order module renders it, so
 * the work-order picker and the context-rail toggle live here; the tool modules
 * have no work-order binding and use {@link ModuleHeader} instead.
 */
import { ChevronRight, PanelRight } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import type { JobId } from '@deepseek-ai/dsh-rxlab-job/types'
import { useWorkbenchJob } from '@/app/workbench-context'
import { JOB_STATUS_LABELS } from '@/lib/job-labels'
import { MoreMenu } from './more-menu'
import { ThemeToggle } from './theme-toggle'

/** Sentinel Select value for "no work order bound"; Radix items reject the empty string. */
const NO_JOB = '__none__'

/** The work-order workbench route, whose path names the bound work order. */
const WORKBENCH_ROUTE = /^\/jobs\/[^/]+$/

/** Work-order top bar: the work-order trail, the picker, and the rail toggle. */
export function WorkOrderHeader() {
  const { pathname } = useLocation()
  const { job, railOpen, setRailOpen } = useWorkbenchJob()
  const inWorkbench = WORKBENCH_ROUTE.test(pathname)

  return (
    <header className="bg-background flex h-(--header-height) shrink-0 items-center border-b">
      <div className="flex w-full min-w-0 items-center gap-2 px-3">
        <nav className="flex min-w-0 items-center gap-1.5 text-sm" aria-label="当前位置">
          {inWorkbench ? (
            <>
              <Link to="/jobs" className="text-muted-foreground hover:text-foreground shrink-0 transition-colors">
                工单总览
              </Link>
              <ChevronRight className="text-muted-foreground size-3.5 shrink-0" />
              <span className="truncate font-medium">{job?.consumer.name ?? '工单工作台'}</span>
            </>
          ) : (
            <span className="truncate font-medium">工单总览</span>
          )}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <JobPicker />
          <MoreMenu />
          <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-4" />
          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:inline-flex"
            aria-label={railOpen ? '收起工单上下文' : '展开工单上下文'}
            aria-pressed={railOpen}
            onClick={() => { setRailOpen(!railOpen) }}
          >
            <PanelRight />
          </Button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}

/** The one work-order picker the work-order surface has. */
function JobPicker() {
  const { jobs, jobsPhase, jobId, job, selectJob } = useWorkbenchJob()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const select = (value: string): void => {
    const id = value === NO_JOB ? undefined : (value as JobId)
    selectJob(id)
    // The workbench route names its work order in the path, so follow the pick.
    if (WORKBENCH_ROUTE.test(pathname)) void navigate(id === undefined ? '/jobs' : `/jobs/${id}`)
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={jobId ?? NO_JOB} onValueChange={select}>
        <SelectTrigger className="w-60" aria-label="当前工单">
          <SelectValue placeholder={jobsPhase === 'loading' ? '读取中…' : '选择工单'} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value={NO_JOB}>未绑定工单</SelectItem>
            {jobs.map(item => (
              <SelectItem key={item.id} value={item.id}>
                {item.name ?? '未命名消费者'} · {JOB_STATUS_LABELS[item.status]}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {job === undefined ? null : <Badge variant="outline">{JOB_STATUS_LABELS[job.status]}</Badge>}
    </div>
  )
}
