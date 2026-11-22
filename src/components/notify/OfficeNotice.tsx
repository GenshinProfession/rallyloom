import { useState } from 'react'
import { Bell, ChevronLeft, ChevronRight, Megaphone, Pin } from 'lucide-react'
import { NOTICE_LEVEL_META, noticeTime, type NoticeRecord } from '@/lib/notify/types'
import './office-notice.css'

interface OfficeNoticeProps {
  notices: readonly NoticeRecord[]
  unread: number
  onOpenAll: () => void
}

export function OfficeNotice({ notices, unread, onOpenAll }: OfficeNoticeProps) {
  const [selectedId, setSelectedId] = useState<string>()
  const ordered = [...notices].sort(
    (a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false) || b.occurredAt.localeCompare(a.occurredAt),
  )
  const index = Math.max(0, ordered.findIndex(({ id }) => id === selectedId))
  const notice = ordered[index]

  return (
    <section className="office-notice" aria-label="办公室公告">
      <span className="office-notice-symbol" aria-hidden="true"><Megaphone size={16} strokeWidth={1.7} /></span>
      <div className="office-notice-copy" aria-live="polite" aria-atomic="true">
        {notice ? (
          <div className="office-notice-story" key={notice.id}>
            <div className="office-notice-heading">
              {notice.pinned && <Pin size={11} strokeWidth={1.8} aria-label="置顶" />}
              {notice.level !== 'info' && (
                <span className="office-notice-level" data-level={notice.level}>{NOTICE_LEVEL_META[notice.level].label}</span>
              )}
              <h2 title={notice.title}>{notice.title}</h2>
              <time dateTime={notice.occurredAt}>{noticeTime(notice.occurredAt)}</time>
            </div>
            {notice.summary && <p title={notice.summary}>{notice.summary}</p>}
          </div>
        ) : <p>暂无公告</p>}
      </div>
      {ordered.length > 1 && (
        <div className="office-notice-pager">
          <button type="button" className="ui-press" aria-label="上一条公告" disabled={index === 0} onClick={() => setSelectedId(ordered[index - 1].id)}>
            <ChevronLeft size={15} />
          </button>
          <span aria-label={`第 ${index + 1} 条，共 ${ordered.length} 条`}>{index + 1}/{ordered.length}</span>
          <button type="button" className="ui-press" aria-label="下一条公告" disabled={index === ordered.length - 1} onClick={() => setSelectedId(ordered[index + 1].id)}>
            <ChevronRight size={15} />
          </button>
        </div>
      )}
      <button className="office-notice-open ui-press" type="button" aria-label={`通知中心，未读 ${unread} 条`} onClick={onOpenAll}>
        <Bell size={14} strokeWidth={1.75} />
        <span>通知中心</span>
        {unread > 0 && <span className="office-notice-unread">{unread}</span>}
      </button>
    </section>
  )
}
