/* 通知中心 — 契约类型
   与交流室/任务看板同构：Rallyloom 只承接与展示，公告数据由云端/外部系统
   按《接入规范》`notice.push` / `notice.remove` 推送（agent-skill v1.3）。
   已读状态是纯客户端本地态，永不回写、永不被推送重置。 */

export type NoticeLevel = 'info' | 'warning' | 'urgent'

export const NOTICE_LEVEL_META: Record<NoticeLevel, { label: string; dot: string; chip: string }> = {
  info: { label: '通知', dot: '#2563eb', chip: 'bg-[#eef2ff] text-[#3b5bdb] border-[#dbe3f8]' },
  warning: { label: '提醒', dot: '#f59e0b', chip: 'bg-[#fdf6e7] text-[#a16207] border-[#f2e5c4]' },
  urgent: { label: '紧急', dot: '#dc2626', chip: 'bg-[#fdecec] text-[#b91c1c] border-[#f6d3d3]' },
}

/** 一条公告/通知（外部推送或本地发布）。「存储数据库格式」= 本记录 + source 幂等锚点 */
export interface NoticeRecord {
  id: string
  /** 幂等锚点：source_id + external_notice_id 重推原地刷新 */
  sourceId: string
  externalNoticeId: string
  title: string
  summary?: string
  level: NoticeLevel
  url?: string
  /** 置顶横幅优先展示 */
  pinned?: boolean
  /** ISO 时间；缺省用承接时间 */
  occurredAt: string
  /** 自由属性（中性容器，同 person/task attrs） */
  attrs?: Record<string, string>
  origin: 'local' | 'sync'
}

export interface NoticeClient {
  kind: 'demo-local' | 'oa-rest'
  label: string
  list(): Promise<NoticeRecord[]>
  /** 已读为客户端本地态 */
  unreadIds(): Promise<string[]>
  markRead(ids: string[]): Promise<void>
  markAllRead(): Promise<void>
  /** 外部推送演示入口（真实链路为云端 ingest 端点） */
  upsert(record: Omit<NoticeRecord, 'id' | 'occurredAt' | 'origin'>): Promise<NoticeRecord>
  remove(sourceId: string, externalNoticeId: string): Promise<void>
  subscribe(cb: (records: NoticeRecord[]) => void): () => void
}

export function noticeTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
