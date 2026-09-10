/**
 * Read-only rendering of one assembled {@link GuideDocument}: consumer header,
 * pricing, and one section per chapter (参数 / 策略 / 清单 / 话术 / 校验).
 */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { GuideDocument } from '@deepseek-ai/dsh-rxlab-job/types'
import { ReportChecks } from '@/modules/stages/ReportChecks'
import { formatMoney } from './consumer'

/** Display text for one chapter parameter. */
function paramText(value: JsonValue): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

/** Read-only guide document body. */
export function GuideDocumentView({ document }: { readonly document: GuideDocument }) {
  const consumer = document.consumer
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-medium">{consumer.name ?? '未命名消费者'}</span>
        {consumer.age === undefined ? null : <span className="text-muted-foreground">{String(consumer.age)} 岁</span>}
        {document.pricing === undefined ? null : <span className="text-muted-foreground">对客价 {formatMoney(document.pricing)}</span>}
        <span className="text-xs text-muted-foreground">生成于 {document.generatedAt}</span>
      </div>

      {document.chapters.map((chapter, index) => (
        <Card key={`${chapter.stage}-${index}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{chapter.title}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {chapter.params !== undefined && Object.keys(chapter.params).length > 0 ? (
              <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs">
                {Object.entries(chapter.params).map(([key, value]) => (
                  <div key={key} className="col-span-2 grid grid-cols-subgrid">
                    <dt className="text-muted-foreground">{key}</dt>
                    <dd className="min-w-0 break-words">{paramText(value)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            <ChapterList title="策略" items={chapter.strategy} />
            <ChapterList title="清单" items={chapter.checklist} />
            <ChapterList title="话术" items={chapter.scripts} />
            {chapter.checks === undefined ? null : (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-medium text-muted-foreground">校验</p>
                <ReportChecks report={chapter.checks} />
              </div>
            )}
          </CardContent>
        </Card>
      ))}
      {document.chapters.length === 0 ? (
        <CardDescription>指南尚无章节：请先完成各阶段产出再生成。</CardDescription>
      ) : null}
      <Separator />
    </div>
  )
}

/** One labeled list block, omitted when empty. */
function ChapterList({ title, items }: { readonly title: string; readonly items: readonly string[] | undefined }) {
  if (items === undefined || items.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <ul className="flex list-disc flex-col gap-0.5 pl-5 text-xs">
        {items.map((item, index) => <li key={`${String(index)}-${item}`}>{item}</li>)}
      </ul>
    </div>
  )
}
