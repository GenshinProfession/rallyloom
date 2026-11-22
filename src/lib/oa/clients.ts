import { workspaceValue } from '@/lib/store/workspace-binding'
import { validateBoard, type TaskBoardDefinition, type TaskClient, type TaskPatch, type TaskPosition, type TaskRecord } from '@/lib/tasks/types'
import type { DocClient, DocDraft, DocRecord } from '@/lib/docs/types'
import type { NoticeClient, NoticeRecord } from '@/lib/notify/types'
import type { ChatClient, ChatDraft, ChatEvent, ChatMessage, ChatPerson, MentionOptions, ChatChannel } from '@/lib/chat/types'

export async function oa<T>(method: string, path: string, body?: unknown, scope?: string): Promise<T> {
  const bridge = window.rallyloom?.workspace
  if (!bridge?.oa) throw new Error('请升级桌面端以使用正式 OA 接口。')
  return workspaceValue(await bridge.oa(method, '/oa' + path, body, scope)) as T
}
async function all<T>(kind: string, scope?: string): Promise<T[]> {
  const items: T[] = []
  let after: number | null = 0
  for (let page = 0; page < 50; page++) {
    const data: { items: T[]; nextCursor: number | null } = await oa('GET', `/records/${kind}?after=${after}&limit=100`, undefined, scope)
    if (!Array.isArray(data.items)) throw new Error('OA 返回了无效的分页结果。')
    items.push(...data.items)
    if (data.nextCursor === null) return items
    if (data.nextCursor === after) throw new Error('OA 分页游标未前进。')
    after = data.nextCursor
  }
  throw new Error('记录超过5000条，请在 Mira 归档历史记录后重试。')
}
type Versioned = { id: string; revision?: number; sortOrder?: number }
class Records<T extends Versioned> {
  protected cache = new Map<string, T>()
  private listeners = new Set<(rows: T[]) => void>()
  private notify() { for (const callback of this.listeners) callback([...this.cache.values()]) }
  constructor(protected resourceKind: string, public scope?: string) {}
  async list() { const rows = await all<T>(this.resourceKind, this.scope); this.cache = new Map(rows.map((row) => [row.id, row])); return rows }
  async create(body: unknown) { const row = await oa<T>('POST', `/records/${this.resourceKind}`, body, this.scope); this.cache.set(row.id, row); this.notify(); return row }
  async update(id: string, body: object) { const row = await oa<T>('PATCH', `/records/${this.resourceKind}/${encodeURIComponent(id)}`, { ...body, revision: (body as { revision?: number }).revision ?? this.cache.get(id)?.revision }, this.scope); this.cache.set(id, row); this.notify(); return row }
  async remove(id: string) { await oa('DELETE', `/records/${this.resourceKind}/${encodeURIComponent(id)}?revision=${this.cache.get(id)?.revision ?? -1}`, undefined, this.scope); this.cache.delete(id); this.notify() }
  subscribe(callback: (rows: T[]) => void) {
    this.listeners.add(callback)
    let alive = true, busy = false
    const refresh = async () => { if (busy || !alive) return; busy = true; try { const rows = await this.list(); if (alive) callback(rows) } catch { /* Keep last good view; direct actions expose errors. */ } finally { busy = false } }
    const timer = setInterval(() => void refresh(), 10000)
    return () => { alive = false; this.listeners.delete(callback); clearInterval(timer) }
  }
}
export class OaTaskClient extends Records<TaskRecord & Versioned> implements TaskClient {
  readonly kind = 'oa-rest' as const
  readonly label = 'Mira 公司任务'
  board: TaskBoardDefinition = { defaultStatus: 'loading', statuses: [{ id: 'loading', label: '正在加载任务定义…', dot: '#aaaaaa' }], fields: [] }
  constructor(scope?: string) { super('task', scope) }
  async list() { this.board = validateBoard(await oa<TaskBoardDefinition>('GET', '/task-board', undefined, this.scope)); return (await super.list()).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)) }
  async create(patch: TaskPatch) { if (this.board.defaultStatus === 'loading') this.board = validateBoard(await oa<TaskBoardDefinition>('GET', '/task-board', undefined, this.scope)); return super.create({ ...patch, status: !patch.status || patch.status === 'loading' ? this.board.defaultStatus : patch.status }) }
  async update(id: string, patch: TaskPatch) { return super.update(id, patch) }
  async move(id: string, position: TaskPosition) { await oa('POST', `/tasks/${encodeURIComponent(id)}/move`, { ...position, revision: position.revision ?? this.cache.get(id)?.revision }, this.scope); return this.list() }
  async configure(board: TaskBoardDefinition) { this.board = validateBoard(await oa<TaskBoardDefinition>('PUT', '/task-board', board, this.scope)) }
}
export class OaDocClient extends Records<DocRecord & Versioned> implements DocClient {
  readonly kind = 'oa-rest' as const
  readonly label = 'Mira 云端文档'
  constructor() { super('doc') }
  async create(draft: DocDraft) { return super.create(draft) }
  async update(id: string, draft: DocDraft) { return super.update(id, draft) }
}
export class OaNoticeClient extends Records<NoticeRecord & Versioned> implements NoticeClient {
  readonly kind = 'oa-rest' as const
  readonly label = 'Mira 公司通知'
  constructor() { super('notice') }
  async unreadIds() { return (await this.list()).filter((row) => !row.isRead).map(({ id }) => id) }
  async markRead(ids: string[]) { for (let index = 0; index < ids.length; index += 100) await oa('POST', '/read/notice', { ids: ids.slice(index, index + 100) }) }
  async markAllRead() { await this.markRead(await this.unreadIds()) }
  async upsert(record: Omit<NoticeRecord, 'id' | 'occurredAt' | 'origin'>) { return super.create(record) }
  // Legacy ingestion uses source IDs; UI deletion passes the authoritative record ID.
  async remove(sourceId: string, externalNoticeId?: string) { const row = externalNoticeId ? [...this.cache.values()].find((r) => r.sourceId === sourceId && r.externalNoticeId === externalNoticeId) : this.cache.get(sourceId); if (!row) throw new Error('通知已变更，请刷新。'); return super.remove(row.id) }
}
async function fileData(file: File) {
  const buffer = new Uint8Array(await file.arrayBuffer())
  let binary = ''; for (let i = 0; i < buffer.length; i += 16384) binary += String.fromCharCode(...buffer.subarray(i, i + 16384))
  return { name: file.name, base64: btoa(binary) }
}
export class OaChatClient implements ChatClient {
  readonly kind = 'oa-rest' as const
  readonly label = 'Mira 公司交流室'
  channels() { return oa<ChatChannel[]>('GET', '/chat/channels') }
  history(id: string, limit = 200) { return oa<ChatMessage[]>('GET', `/chat/channels/${encodeURIComponent(id)}/messages?limit=${limit}`) }
  async send(id: string, draft: ChatDraft, _sender: ChatPerson) { return oa<ChatMessage>('POST', `/chat/channels/${encodeURIComponent(id)}/messages`, { text: draft.text, mentions: draft.mentions, files: await Promise.all(draft.files.map(fileData)) }) }
  mentionOptions(id: string) { return oa<MentionOptions>('GET', `/chat/channels/${encodeURIComponent(id)}/mentions`) }
  directChannel(peerId: string) { return oa<ChatChannel>('POST', '/chat/direct', { peerId }) }
  unreadMentions() { return oa<ChatMessage[]>('GET', '/unread/message') }
  async readMentions(ids: readonly string[]) { await oa('POST', '/read/message', { ids }) }
  subscribeMentions(callback: (message: ChatMessage) => void) {
    return poll(() => this.unreadMentions(), (rows) => rows.forEach(callback))
  }
  async attachment(id: string) { const data = await oa<{ base64: string }>('GET', `/chat/attachments/${encodeURIComponent(id)}`); return new Blob([Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0))]) }
  subscribe(channelId: string, callback: (event: ChatEvent) => void) { return poll(() => this.history(channelId), (rows) => rows.forEach((message) => callback({ type: 'message', message }))) }
}
function poll(read: () => Promise<ChatMessage[]>, callback: (rows: ChatMessage[]) => void) {
  let alive = true, busy = false; const seen = new Set<string>()
  const tick = async () => { if (busy || !alive) return; busy = true; try { const rows = await read(); if (!alive) return; const fresh = rows.filter(({ id }) => !seen.has(id)); for (const row of rows) seen.add(row.id); if (seen.size > 1000) { seen.clear(); for (const row of rows) seen.add(row.id) } callback(fresh) } catch { /* Network retry on next tick. */ } finally { busy = false } }
  const timer = setInterval(() => void tick(), 4000); void tick()
  return () => { alive = false; clearInterval(timer) }
}
