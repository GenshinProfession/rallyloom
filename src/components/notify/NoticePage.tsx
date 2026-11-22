/* NoticePage — 通知中心
   公告数据由云端按《接入规范》notice.push 推送承接；已读为本地态。 */

import { useEffect, useState } from 'react'
import { ArrowLeft, Bell, CheckCheck, ExternalLink, Megaphone } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { NOTICE_LEVEL_META, noticeTime, type NoticeClient, type NoticeRecord } from '@/lib/notify/types'
import { cn } from '@/lib/utils'

interface NoticePageProps {
  client: NoticeClient
  onBack: () => void
}

export function NoticePage({ client, onBack }: NoticePageProps) {
  const [records, setRecords] = useState<NoticeRecord[]>([])
  const [read, setRead] = useState<Set<string>>(new Set())

  useEffect(() => {
    let alive = true
    void client.list().then((list) => { if (alive) setRecords(list) })
    void client.unreadIds().then((ids) => { if (alive) setRead(new Set(ids)) })
    const off = client.subscribe(() => {
      void client.list().then((list) => { if (alive) setRecords(list) })
      void client.unreadIds().then((ids) => { if (alive) setRead(new Set(ids)) })
    })
    return () => { alive = false; off() }
  }, [client])

  const unread = records.filter((r) => !read.has(r.id)).length
  const ordered = [...records].sort(
    (a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false) || b.occurredAt.localeCompare(a.occurredAt),
  )

  const markOne = (id: string) => {
    if (read.has(id)) return
    void client.markRead([id])
    setRead((prev) => new Set(prev).add(id))
  }

  return (
    <main data-notify="root" className="flex min-w-0 flex-1 flex-col bg-[#f4f4f6]">
      <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-border/70 bg-white px-3">
        <Button variant="ghost" size="icon" className="size-7 rounded-md" aria-label="返回办公室" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-[14px] font-semibold tracking-[-0.01em]">通知中心</h1>
        <span className="text-[11px] text-muted-foreground">公告由云端推送承接 · 已读状态保存在本机</span>
        <div className="ml-auto flex items-center gap-2">
          {unread > 0 && <Badge variant="secondary" className="h-[19px] px-1.5 text-[10.5px]">{unread} 条未读</Badge>}
          <Button
            variant="outline"
            size="sm"
            className="h-[26px] gap-1 px-2 text-[11px]"
            disabled={unread === 0}
            onClick={() => { void client.markAllRead(); setRead(new Set(records.map((r) => r.id))) }}
          >
            <CheckCheck className="size-3.5" />全部已读
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto flex max-w-[760px] flex-col gap-2">
          {ordered.length === 0 && (
            <div className="grid h-40 place-items-center rounded-lg border border-dashed border-border/70 bg-white/60 text-[12px] text-muted-foreground">
              <span className="flex items-center gap-2"><Megaphone className="size-4" />暂无公告</span>
            </div>
          )}
          {ordered.map((notice) => {
            const meta = NOTICE_LEVEL_META[notice.level]
            const isUnread = !read.has(notice.id)
            return (
              <button
                key={notice.id}
                type="button"
                data-notice-id={notice.id}
                onClick={() => markOne(notice.id)}
                className={cn(
                  'group grid w-full grid-cols-[auto_1fr] gap-x-3 rounded-lg border border-border/80 bg-white p-3.5 text-left shadow-[0_1px_2px_rgba(17,18,22,0.03)] transition-colors hover:border-border',
                  isUnread && 'border-l-[3px]',
                )}
                style={isUnread ? { borderLeftColor: meta.dot } : undefined}
              >
                <span
                  className={cn('grid size-7 shrink-0 place-items-center rounded-md border', meta.chip)}
                  aria-label={meta.label}
                >
                  <Bell className="size-3.5" strokeWidth={1.8} />
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className={cn('text-[13px] leading-tight', isUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground/80')}>
                      {notice.title}
                    </span>
                    {notice.pinned && <Badge variant="secondary" className="h-[17px] bg-amber-50 px-1.5 text-[10px] text-amber-700">置顶</Badge>}
                    {notice.origin === 'sync' && (
                      <Badge variant="secondary" className="h-[17px] bg-indigo-50 px-1.5 text-[10px] text-indigo-700">外部 · {notice.sourceId}</Badge>
                    )}
                    {isUnread && <i className="size-[6px] rounded-full" style={{ background: meta.dot }} aria-label="未读" />}
                  </span>
                  {notice.summary && <span className="mt-1 block text-[12px] leading-relaxed text-muted-foreground">{notice.summary}</span>}
                  <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {notice.attrs && Object.entries(notice.attrs).slice(0, 4).map(([k, v]) => (
                      <Badge key={k} variant="secondary" className="h-[17px] px-1.5 text-[10px] font-medium text-muted-foreground">{k} · {v}</Badge>
                    ))}
                    {notice.url && (
                      <span className="flex items-center gap-1 text-[10.5px] text-primary/80">
                        <ExternalLink className="size-3" />{notice.url.replace(/^https?:\/\//, '').slice(0, 42)}
                      </span>
                    )}
                    <span className="ml-auto text-[10.5px] text-muted-foreground/80">{noticeTime(notice.occurredAt)}</span>
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </main>
  )
}
