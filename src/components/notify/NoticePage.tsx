import { WorkspaceHeader } from '@/components/ui/workspace-header'
import './notice.css'
/* NoticePage — 通知中心
   公告数据由云端按《接入规范》notice.push 推送承接；正式已读同步到提供方，演示已读留在本机。 */

import { useEffect, useState } from 'react'
import { Bell, CheckCheck, ExternalLink, Megaphone, Search, Send, Trash2, Pin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NOTICE_LEVEL_META, noticeTime, type NoticeClient, type NoticeRecord } from '@/lib/notify/types'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface NoticePageProps {
  canPublish?: boolean
  client: NoticeClient
}

export function NoticePage({ client, canPublish }: NoticePageProps) {
  const [selectedId, setSelectedId] = useState<string>()
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [deleteNotice, setDeleteNotice] = useState<NoticeRecord | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [title, setTitle] = useState(''), [summary, setSummary] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [records, setRecords] = useState<NoticeRecord[]>([])
  const [read, setRead] = useState<Set<string>>(new Set())

  useEffect(() => {
    let alive = true
    let request = 0
    const refresh = async () => {
      const current = ++request
      try {
        const [rows, ids] = await Promise.all([client.list(), client.unreadIds()])
        if (alive && current === request) { setRecords(rows); setRead(new Set(rows.filter((row) => !ids.includes(row.id)).map((row) => row.id))); setLoading(false) }
      } catch (e) { if (alive && current === request) { setError(e instanceof Error ? e.message : '通知加载失败'); setLoading(false) } }
    }
    void refresh()
    const off = client.subscribe(() => void refresh())
    return () => { alive = false; off() }
  }, [client])

  const unread = records.filter((r) => !read.has(r.id)).length
  const ordered = [...records].sort(
    (a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false) || b.occurredAt.localeCompare(a.occurredAt),
  )

  const visible = ordered.filter(notice => (filter === 'all' || !read.has(notice.id)) && [notice.title, notice.summary].some(value => value?.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())))
  // Keep the open detail visible after marking an unread item read.
  const selected = records.find(notice => notice.id === selectedId)
  const markOne = (id: string) => {
    if (read.has(id)) return
    void client.markRead([id]).then(() => setRead((prev) => new Set(prev).add(id)), (e) => setError(e instanceof Error ? e.message : '标记失败'))
  }

  return (
    <main data-notify="root" className="workspace-view notice-page">
      <Dialog open={Boolean(deleteNotice)} onOpenChange={(open) => { if (!open && !busy) setDeleteNotice(null) }}><DialogContent><DialogHeader><DialogTitle>删除通知</DialogTitle></DialogHeader><p>{deleteNotice?.title}</p>{error && <p role="alert" className="text-destructive">{error}</p>}<Button variant="destructive" disabled={busy} onClick={async () => { if (!deleteNotice) return; setBusy(true); try { await client.remove(deleteNotice.sourceId, deleteNotice.externalNoticeId); setRecords(await client.list()); setDeleteNotice(null) } catch (e) { setError(e instanceof Error ? e.message : '删除失败') } finally { setBusy(false) } }}>确认删除</Button></DialogContent></Dialog>
      <Dialog open={publishing} onOpenChange={(open) => { if (!busy) setPublishing(open) }}><DialogContent><DialogHeader><DialogTitle>发布公司通知</DialogTitle></DialogHeader>
        <Input aria-label="通知标题" placeholder="通知标题" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea aria-label="通知内容" className="min-h-36 rounded-md border p-3" value={summary} onChange={(e) => setSummary(e.target.value)} />
        {error && <p role="alert" className="text-destructive">{error}</p>}
        <Button disabled={busy || !title.trim()} onClick={async () => { setBusy(true); try { await client.upsert({ sourceId: 'mira', externalNoticeId: crypto.randomUUID(), title, summary, level: 'info' }); setRecords(await client.list()); setTitle(''); setSummary(''); setPublishing(false) } catch (e) { setError(e instanceof Error ? e.message : '发布失败') } finally { setBusy(false) } }}>确认发布</Button>
      </DialogContent></Dialog>
      <WorkspaceHeader title="通知中心" description={`${records.length} 条通知 · ${unread} 条未读`}>
        <Button variant="toolbar" size="sm" disabled={unread === 0 || busy} onClick={() => { void client.markAllRead().then(() => setRead(new Set(records.map((r) => r.id))), (e) => setError(e instanceof Error ? e.message : '标记失败')) }}><CheckCheck />全部已读</Button>
        {canPublish && <Button variant="toolbar" size="sm" onClick={() => { setError(''); setPublishing(true) }}><Send />发布通知</Button>}
      </WorkspaceHeader>
      {error && !publishing && <p role="alert" className="px-4 text-destructive">{error}</p>}
      <div className="workspace-content notice-content">
        <section className="notice-inbox" aria-label="通知列表">
          <div className="notice-inbox-tools">
            <div className="notice-search"><Search size={14} /><Input type="search" aria-label="搜索通知" placeholder="搜索通知" value={query} onChange={event => setQuery(event.target.value)} /></div>
            <div className="notice-filters" role="group" aria-label="通知筛选">
              <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>全部通知 <span>{records.length}</span></button>
              <button type="button" aria-pressed={filter === 'unread'} onClick={() => setFilter('unread')}>未读 <span>{unread}</span></button>
            </div>
          </div>
          <div className="notice-rows">
            {visible.map(notice => {
              const meta = NOTICE_LEVEL_META[notice.level], isUnread = !read.has(notice.id)
              return <button key={notice.id} type="button" data-notice-id={notice.id} aria-pressed={selectedId === notice.id} className="notice-row" onClick={() => { setSelectedId(notice.id); markOne(notice.id) }}>
                <span className={cn('notice-row-icon', meta.chip)}><Bell size={16} /></span>
                <span className="notice-row-copy"><span className="notice-row-heading"><strong>{notice.title}</strong>{isUnread && <i aria-label="未读" />}</span>
                  <span className="notice-row-summary">{notice.summary || '点击查看通知详情'}</span>
                  <span className="notice-row-meta">{notice.pinned && <Pin size={11} />}{noticeTime(notice.occurredAt)}<span>{meta.label}</span></span>
                </span>
              </button>
            })}
            {!visible.length && <div className="notice-empty"><Bell size={24} /><strong>{loading ? '正在加载通知…' : query ? '没有匹配的通知' : filter === 'unread' ? '没有未读通知' : '暂无通知'}</strong><p>{loading ? '请稍候' : '新的公司通知会显示在这里'}</p></div>}
          </div>
        </section>
        <section className="notice-detail" aria-label="通知详情">
          {selected ? <>
            <div className="notice-detail-toolbar"><span>{NOTICE_LEVEL_META[selected.level].label}{selected.pinned ? ' · 置顶' : ''}</span>
              {canPublish && selected.canDelete !== false && <Button variant="ghost" size="sm" onClick={() => { setError(''); setDeleteNotice(selected) }}><Trash2 size={14} />删除</Button>}
            </div>
            <article className="notice-article"><h2>{selected.title}</h2><time dateTime={selected.occurredAt}>{noticeTime(selected.occurredAt)}</time>
              {selected.summary && <p className="notice-body">{selected.summary}</p>}
              {selected.attrs && <dl className="notice-attributes">{Object.entries(selected.attrs).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>}
              {selected.url && <a className="notice-link" href={/^https?:\/\//i.test(selected.url) ? selected.url : undefined} target="_blank" rel="noreferrer"><ExternalLink size={14} />查看关联内容</a>}
            </article>
          </> : <div className="notice-empty notice-detail-empty"><Megaphone size={32} /><strong>{records.length ? '选择一条通知查看详情' : '公司动态，集中查看'}</strong><p>公告与提醒会保留在这里，方便随时查阅。</p></div>}
        </section>
      </div>
    </main>
  )
}
