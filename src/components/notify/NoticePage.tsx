/* NoticePage — 通知中心
   公告数据由云端按《接入规范》notice.push 推送承接；已读为本地态。 */

import { useEffect, useState } from 'react'
import { ArrowLeft, Bell, CheckCheck, ExternalLink, Megaphone } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { NOTICE_LEVEL_META, noticeTime, type NoticeClient, type NoticeRecord } from '@/lib/notify/types'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface NoticePageProps {
  canPublish?: boolean
  client: NoticeClient
  onBack: () => void
}

export function NoticePage({ client, onBack, canPublish }: NoticePageProps) {
  const [deleteNotice, setDeleteNotice] = useState<NoticeRecord | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [title, setTitle] = useState(''), [summary, setSummary] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [records, setRecords] = useState<NoticeRecord[]>([])
  const [read, setRead] = useState<Set<string>>(new Set())

  useEffect(() => {
    let alive = true
    void client.list().then((list) => { if (alive) setRecords(list) })
    void Promise.all([client.list(), client.unreadIds()]).then(([rows, ids]) => { if (alive) setRead(new Set(rows.filter((row) => !ids.includes(row.id)).map((row) => row.id))) })
    const off = client.subscribe(() => {
      void client.list().then((list) => { if (alive) setRecords(list) })
      void Promise.all([client.list(), client.unreadIds()]).then(([rows, ids]) => { if (alive) setRead(new Set(rows.filter((row) => !ids.includes(row.id)).map((row) => row.id))) })
    })
    return () => { alive = false; off() }
  }, [client])

  const unread = records.filter((r) => !read.has(r.id)).length
  const ordered = [...records].sort(
    (a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false) || b.occurredAt.localeCompare(a.occurredAt),
  )

  const markOne = (id: string) => {
    if (read.has(id)) return
    void client.markRead([id]).then(() => setRead((prev) => new Set(prev).add(id)), (e) => setError(e instanceof Error ? e.message : '标记失败'))
  }

  return (
    <main data-notify="root" className="flex min-w-0 flex-1 flex-col bg-[#f4f4f6]">
      <Dialog open={Boolean(deleteNotice)} onOpenChange={(open) => { if (!open && !busy) setDeleteNotice(null) }}><DialogContent><DialogHeader><DialogTitle>删除通知</DialogTitle></DialogHeader><p>{deleteNotice?.title}</p>{error && <p role="alert" className="text-destructive">{error}</p>}<Button variant="destructive" disabled={busy} onClick={async () => { if (!deleteNotice) return; setBusy(true); try { await client.remove(deleteNotice.sourceId, deleteNotice.externalNoticeId); setRecords(await client.list()); setDeleteNotice(null) } catch (e) { setError(e instanceof Error ? e.message : '删除失败') } finally { setBusy(false) } }}>确认删除</Button></DialogContent></Dialog>
      <Dialog open={publishing} onOpenChange={(open) => { if (!busy) setPublishing(open) }}><DialogContent><DialogHeader><DialogTitle>发布公司通知</DialogTitle></DialogHeader>
        <Input aria-label="通知标题" placeholder="通知标题" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea aria-label="通知内容" className="min-h-36 rounded-md border p-3" value={summary} onChange={(e) => setSummary(e.target.value)} />
        {error && <p role="alert" className="text-destructive">{error}</p>}
        <Button disabled={busy || !title.trim()} onClick={async () => { setBusy(true); try { await client.upsert({ sourceId: 'mira', externalNoticeId: crypto.randomUUID(), title, summary, level: 'info' }); setRecords(await client.list()); setTitle(''); setSummary(''); setPublishing(false) } catch (e) { setError(e instanceof Error ? e.message : '发布失败') } finally { setBusy(false) } }}>确认发布</Button>
      </DialogContent></Dialog>
      {error && !publishing && <p role="alert" className="px-4 text-destructive">{error}</p>}
      <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-border/70 bg-white px-3">
        <Button variant="ghost" size="icon" className="size-7 rounded-md" aria-label="返回办公室" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-[14px] font-semibold tracking-[-0.01em]">通知中心</h1>
        <span className="text-[11px] text-muted-foreground">{client.kind === 'oa-rest' ? '公司通知 · 已读状态同步到 Mira' : '演示通知'}</span>
        <div className="ml-auto flex items-center gap-2">
          {canPublish && <Button size="sm" onClick={() => setPublishing(true)}>发布通知</Button>}
          {unread > 0 && <Badge variant="secondary" className="h-[19px] px-1.5 text-[10.5px]">{unread} 条未读</Badge>}
          <Button
            variant="outline"
            size="sm"
            className="h-[26px] gap-1 px-2 text-[11px]"
            disabled={unread === 0}
            onClick={() => { void client.markAllRead().then(() => setRead(new Set(records.map((r) => r.id))), (e) => setError(e instanceof Error ? e.message : '标记失败')) }}
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
              <div
                key={notice.id}
                role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') markOne(notice.id) }}
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
                    {canPublish && notice.canDelete !== false && <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setError(''); setDeleteNotice(notice) }}>删除</Button>}
                  </span>
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}
