import { Megaphone } from 'lucide-react'
import { type NoticeRecord } from '@/lib/notify/types'
import './office-notice.css'

export function OfficeNotice({ notices, onOpenAll }: {
  notices: readonly NoticeRecord[]
  unread: number
  onOpenAll: () => void
}) {
  const ordered = [...notices].sort((a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false) || b.occurredAt.localeCompare(a.occurredAt))
  if (!ordered.length) return null
  return <section className="office-announcement" aria-label="办公室公告">
    <Megaphone size={14} aria-hidden="true" />
    <span className="office-announcement-label">公告</span>
    <div className="office-announcement-window">
      <div className="office-announcement-track" style={{ animationDuration: `${Math.max(28, ordered.length * 12)}s` }}>
        {[0, 1].map((copy) => <div className="office-announcement-group" key={copy} aria-hidden={copy === 1 || undefined}>{ordered.map((notice) => <button tabIndex={copy ? -1 : 0} key={notice.id} type="button" onClick={onOpenAll} title={notice.title + (notice.summary ? ' · ' + notice.summary : '')}>
          {notice.pinned && <span>置顶</span>}<strong>{notice.title}</strong>{notice.summary && <span>{notice.summary}</span>}
        </button>)}</div>)}
      </div>
    </div>
    <button type="button" className="office-announcement-all" onClick={onOpenAll}>查看全部</button>
  </section>
}
