import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronRight, Megaphone, Pin } from 'lucide-react'
import { NOTICE_LEVEL_META, noticeTime, type NoticeRecord } from '@/lib/notify/types'
import './office-announcement.css'

const ACK_KEY = 'rallyloom.announcements.acked'

function readAcked(): Set<string> {
  try {
    const raw = window.localStorage.getItem(ACK_KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

function saveAcked(ids: Set<string>) {
  try {
    window.localStorage.setItem(ACK_KEY, JSON.stringify([...ids].slice(-200)))
  } catch {
    /* 隐私模式等场景下忽略持久化失败 */
  }
}

/**
 * 办公室顶部的公告浮窗。
 *
 * 3D 画面顶部原本是一条空白带，这里放一块轻量公告卡：完整显示标题、正文与属性，
 * 读完点「已阅」即记已读并自动收起；还有未读就顺延展示下一条，
 * 全部读完就彻底消失（不再是常驻跑马灯）。
 */
export function OfficeAnnouncement({ notices, unread = 0, onRead, onOpen }: {
  notices: readonly NoticeRecord[]
  unread?: number
  onRead?: (id: string) => void
  onOpen?: () => void
}) {
  const [acked, setAcked] = useState<Set<string>>(() => readAcked())
  const [leaving, setLeaving] = useState<string | null>(null)

  const items = useMemo(() => {
    /* 公告的唯一来源是通知中心（企业工作区下发的通知记录）。
       通知中心为空时这里就不该有任何内容，不再内置任何演示/系统公告。 */
    return notices
      .filter((item) => !item.isRead && !acked.has(item.id))
      .sort((a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false) || b.occurredAt.localeCompare(a.occurredAt))
  }, [acked, notices])

  useEffect(() => {
    if (!leaving) return
    const timer = window.setTimeout(() => setLeaving(null), 180)
    return () => window.clearTimeout(timer)
  }, [leaving])

  const current = items[0]
  if (!current) return null

  const level = NOTICE_LEVEL_META[current.level]
  const rest = items.length - 1
  const attrs = Object.entries(current.attrs ?? {}).slice(0, 3)

  const acknowledge = () => {
    const id = leaving ?? current.id
    setAcked((prev) => {
      const next = new Set(prev)
      next.add(id)
      saveAcked(next)
      return next
    })
    onRead?.(id)
  }

  const onAckClick = () => {
    setLeaving(current.id)
    window.setTimeout(acknowledge, 150)
  }

  return (
    <section
      className={`office-hud${leaving ? ' is-leaving' : ''}`}
      data-office-hud
      data-office-hud-remaining={items.length}
      aria-label="工作区公告"
    >
      <span className="office-hud-aura" aria-hidden />
      <header className="office-hud-head">
        <span className="office-hud-mark" aria-hidden><Megaphone size={15} strokeWidth={1.9} /></span>
        <span className="office-hud-label">公告</span>
        <span className={`office-hud-level is-${current.level}`}>{level.label}</span>
        {current.pinned && <span className="office-hud-pin"><Pin size={9} strokeWidth={2.2} />置顶</span>}
        <time className="office-hud-time">{noticeTime(current.occurredAt)}</time>
        <span className="office-hud-count">{items.length > 1 ? `还有 ${rest} 条未阅` : '最后一条'}</span>
      </header>

      <button
        type="button"
        className="office-hud-title"
        onClick={onOpen}
        disabled={!onOpen}
        data-office-hud-line
        title={onOpen ? '查看全部公告' : undefined}
      >
        <strong data-office-hud-title>{current.title}</strong>
        {onOpen && <ChevronRight size={14} strokeWidth={2} aria-hidden />}
      </button>

      {current.summary && <p className="office-hud-summary" data-office-hud-summary>{current.summary}</p>}
      {current.sourceId && (
        <p className="office-hud-source">
          来源 <b>{current.sourceId}</b>
          {current.externalNoticeId ? ` · ${current.externalNoticeId}` : ''}
        </p>
      )}
      {attrs.length > 0 && (
        <ul className="office-hud-attrs">
          {attrs.map(([key, value]) => <li key={key}><span>{key}</span>{value}</li>)}
        </ul>
      )}

      <footer className="office-hud-actions">
        <button type="button" className="office-hud-ack ui-press" onClick={onAckClick} data-office-hud-ack>
          <Check size={13} strokeWidth={2.4} aria-hidden />
          已阅
        </button>
        {onOpen && (
          <button type="button" className="office-hud-more ui-press" onClick={onOpen} data-office-hud-open>
            查看全部{unread > 0 ? ` · ${unread} 条未读` : ''}
          </button>
        )}
      </footer>
    </section>
  )
}
