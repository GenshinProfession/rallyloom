/* DemoNoticeClient — 通知中心演示源（内存实现）
   种子公告带 oa/wms 外部推送样例（origin 'sync'），展示「承接而非提供」。 */

import type { NoticeClient, NoticeRecord } from './types'

const HOUR = 3_600_000
const now = Date.now()
const iso = (offsetHours: number) => new Date(now - offsetHours * HOUR).toISOString()

const SEED: NoticeRecord[] = [
  {
    id: 'n1', sourceId: 'oa', externalNoticeId: 'NOT-2026-0081',
    title: '11月大促复盘会提前至明早 10:00', summary: '全体运营组参加，请提前十分钟入会并带好复盘数据。',
    level: 'urgent', pinned: true, occurredAt: iso(0.4), origin: 'sync', attrs: { 发布: '运营指挥台' },
  },
  {
    id: 'n2', sourceId: 'oa', externalNoticeId: 'NOT-2026-0080',
    title: 'ERP 将于今晚 23:00–24:00 停机维护', summary: '期间订单回写暂停，履约组请提前导出当日待办。',
    level: 'warning', occurredAt: iso(2.1), origin: 'sync',
  },
  {
    id: 'n3', sourceId: 'wms', externalNoticeId: 'WMS-ALERT-552',
    title: '华东仓爆仓预警：拣货 backlog 超阈值', summary: '请履约组关注波次安排，必要时开启临时拣货通道。',
    level: 'urgent', occurredAt: iso(3.6), origin: 'sync', attrs: { 仓库: '华东仓', backlog: '412 单' },
  },
  {
    id: 'n4', sourceId: 'oa', externalNoticeId: 'NOT-2026-0078',
    title: '十一月全勤榜已发布', summary: '本月 22 人全勤，名单见文档中心「人事公告」空间。',
    level: 'info', occurredAt: iso(9.5), origin: 'sync',
  },
  {
    id: 'n5', sourceId: 'oa', externalNoticeId: 'NOT-2026-0076',
    title: '茶水间微波炉已更换并消毒', summary: '新设备位于料理台右侧，使用后请随手关门。',
    level: 'info', occurredAt: iso(26), origin: 'sync',
  },
  {
    id: 'n6', sourceId: 'rallyloom', externalNoticeId: 'LOCAL-001',
    title: '本公告为演示数据', summary: '真实环境公告由云端按《接入规范》notice.push 推送承接。',
    level: 'info', occurredAt: iso(50), origin: 'local',
  },
]

export class DemoNoticeClient implements NoticeClient {
  readonly kind = 'demo-local' as const
  readonly label = '演示公告源'
  private records: NoticeRecord[] = structuredClone(SEED)
  private read = new Set<string>()
  private listeners = new Set<(records: NoticeRecord[]) => void>()

  private emit() {
    const snapshot = structuredClone(this.records)
    for (const cb of this.listeners) cb(snapshot)
  }

  async list() { return structuredClone(this.records) }
  async unreadIds() { return this.records.filter((r) => !this.read.has(r.id)).map((r) => r.id) }
  async markRead(ids: string[]) { ids.forEach((id) => this.read.add(id)); this.emit() }
  async markAllRead() { this.records.forEach((r) => this.read.add(r.id)); this.emit() }

  async upsert(record: Omit<NoticeRecord, 'id' | 'occurredAt' | 'origin'>) {
    const at = this.records.find((r) => r.sourceId === record.sourceId && r.externalNoticeId === record.externalNoticeId)
    if (at) {
      Object.assign(at, record, { origin: 'sync' as const })
      this.emit()
      return structuredClone(at)
    }
    const created: NoticeRecord = { ...record, id: `n-${Date.now()}-${Math.floor(Math.random() * 1e4)}`, occurredAt: new Date().toISOString(), origin: 'sync' }
    this.records = [created, ...this.records]
    this.emit()
    return structuredClone(created)
  }

  async remove(sourceId: string, externalNoticeId: string) {
    this.records = this.records.filter((r) => !(r.sourceId === sourceId && r.externalNoticeId === externalNoticeId))
    this.emit()
  }

  subscribe(cb: (records: NoticeRecord[]) => void) {
    this.listeners.add(cb)
    return () => { this.listeners.delete(cb) }
  }
}
