/**
 * 工单总览 workbench: browse the work-order list over `remote.rxlabJob.listJobs`,
 * open one into its detail/guide page, and create draft orders from a consumer
 * profile. zh copy until the app gains a locale dictionary.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CircleAlert, FolderOpen, Link2, Plus, Search, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { JobId, JobStatus } from '@deepseek-ai/dsh-rxlab-job/types'
import type { ModulePanelProps } from '@/modules/types'
import { useConnected, useRxlabClient } from '@/rxlab/use-sessions'
import type { RxlabClientRuntime } from '@/rxlab/client'
import { ConsumerDialog } from './ConsumerDialog'
import { createJob, deleteJob, useJobList } from '@/modules/stages/use-job'
import { formatMoney } from './consumer'

const STATUS_LABELS: Record<JobStatus, string> = {
  draft: '草稿',
  'in-progress': '进行中',
  complete: '已完成',
  archived: '已归档',
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

function BootSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-4">
        <Skeleton className="size-12 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>
      <Skeleton className="h-56 rounded-xl" />
    </div>
  )
}

export default function JobsPanel(_props: ModulePanelProps) {
  const { phase, error, runtime } = useRxlabClient()
  if (phase === 'booting' || runtime === undefined) return <BootSkeleton />
  if (phase === 'failed') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>工单数据层启动失败</CardTitle>
          <CardDescription className="whitespace-pre-wrap">{error}</CardDescription>
        </CardHeader>
      </Card>
    )
  }
  return <JobsWorkbench runtime={runtime} />
}

/** The connected work-order overview: search, create, and open. */
function JobsWorkbench({ runtime }: { readonly runtime: RxlabClientRuntime }) {
  const navigate = useNavigate()
  const connected = useConnected(runtime)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [removing, setRemoving] = useState<JobId | undefined>(undefined)
  const [banner, setBanner] = useState<string | null>(null)
  const list = useJobList(runtime, connected, debounced)

  useEffect(() => {
    const timer = window.setTimeout(() => { setDebounced(query) }, 250)
    return () => { window.clearTimeout(timer) }
  }, [query])

  const onRemove = async (id: JobId): Promise<void> => {
    setRemoving(id)
    setBanner(null)
    try {
      await deleteJob(runtime, id)
      list.reload()
    } catch (cause) {
      setBanner(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setRemoving(undefined)
    }
  }

  const rows = list.state.items

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <FolderOpen className="size-4 text-muted-foreground" />
          工单总览
          <span className="text-xs font-normal text-muted-foreground">
            {connected ? `${String(rows.length)} 条` : '连接中'}
          </span>
        </div>
        <div className="relative min-w-44 flex-1">
          <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-8 pl-8" placeholder="检索消费者姓名" value={query}
            onChange={(event) => { setQuery(event.target.value) }} />
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => { setCreateOpen(true) }}>
          <Plus className="size-3.5" />
          新建工单
        </Button>
      </div>

      {banner !== null ? (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span className="whitespace-pre-wrap">{banner}</span>
        </div>
      ) : null}

      <Card>
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>消费者</TableHead>
                <TableHead className="w-24">状态</TableHead>
                <TableHead className="w-28">预算</TableHead>
                <TableHead className="w-28">会话</TableHead>
                <TableHead className="w-40">最近更新</TableHead>
                <TableHead className="w-24">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.state.phase === 'loading' && (
                <TableRow><TableCell colSpan={6}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
              )}
              {list.state.phase === 'error' && (
                <TableRow><TableCell colSpan={6} className="text-destructive">{list.state.error}</TableCell></TableRow>
              )}
              {list.state.phase === 'ready' && rows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-muted-foreground">
                  暂无工单。点「新建工单」录入消费者画像开始一次配镜。
                </TableCell></TableRow>
              )}
              {rows.map(row => (
                <TableRow key={String(row.id)} className="cursor-pointer"
                  onClick={() => { void navigate(`/jobs/${String(row.id)}`) }}>
                  <TableCell className="font-medium">{row.name ?? '未命名消费者'}</TableCell>
                  <TableCell><Badge variant="outline">{STATUS_LABELS[row.status]}</Badge></TableCell>
                  <TableCell className="text-sm">{formatMoney(row.pricing) || '—'}</TableCell>
                  <TableCell>
                    {row.sessionId === undefined
                      ? <span className="text-xs text-muted-foreground">未绑定</span>
                      : <Badge variant="secondary" className="gap-1"><Link2 className="size-3" />已绑定</Badge>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatTime(row.updatedAt)}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={removing === row.id}
                      onClick={(event) => {
                        event.stopPropagation()
                        void onRemove(row.id)
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ConsumerDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="新建工单"
        onSubmit={async (consumer) => {
          const job = await createJob(runtime, consumer)
          list.reload()
          void navigate(`/jobs/${String(job.id)}`)
        }}
      />
    </div>
  )
}
