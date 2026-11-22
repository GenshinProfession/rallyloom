/** Provider-owned task states and fields. Rallyloom renders these definitions without renaming IDs. */
export type TaskStatus = string
export interface TaskBoardDefinition {
  statuses: readonly { id: string; label: string; dot: string; category?: 'pending' | 'active' | 'completed'; transitions?: readonly string[] }[]
  defaultStatus: string
  fields: readonly { id: string; label: string; type: 'text' | 'number' | 'date' | 'select'; required?: boolean; options?: readonly string[] }[]
}
export function taskStatus(board: TaskBoardDefinition, id: string) {
  return board.statuses.find((status) => status.id === id) ?? { id, label: id, dot: '#a1a1aa' }
}
export function validateBoard(board: TaskBoardDefinition) {
  const ids = board.statuses.map(({ id }) => id)
  if (!ids.length || ids.length > 32 || ids.some((id) => !id.trim()) || new Set(ids).size !== ids.length || !ids.includes(board.defaultStatus)) throw new Error('任务源的状态定义无效。')
  if (board.statuses.some(({ label, dot, transitions }) => !label.trim() || !/^#[0-9a-fA-F]{6}$/.test(dot) || transitions?.some((id) => !ids.includes(id)))) throw new Error('任务源存在无效的状态或流转定义。')
  if (board.fields.length > 32 || board.fields.some((field) => !field.id.trim() || !field.label.trim() || !['text', 'number', 'date', 'select'].includes(field.type) || (field.type === 'select' && !field.options?.length)) || new Set(board.fields.map(({ id }) => id)).size !== board.fields.length) throw new Error('任务源存在无效或重复字段。')
  return board
}
export function canMoveTask(board: TaskBoardDefinition, from: string, to: string) {
  const target = board.statuses.some(({ id }) => id === to)
  const source = board.statuses.find(({ id }) => id === from)
  return target && (from === to || !source?.transitions || source.transitions.includes(to))
}
export function validateTaskPatch(board: TaskBoardDefinition, patch: TaskPatch, previous?: TaskRecord) {
  if (patch.status !== undefined && !canMoveTask(board, previous?.status ?? patch.status, patch.status)) throw new Error('任务源不允许此状态流转。')
  const attrs = patch.attrs ?? previous?.attrs ?? {}
  for (const field of board.fields) {
    const value = attrs[field.id]?.trim() ?? ''
    if (field.required && !value) throw new Error(`请填写${field.label}。`)
    if (value && ((field.type === 'number' && !Number.isFinite(Number(value))) || (field.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)))) || (field.type === 'select' && !field.options?.includes(value)))) throw new Error(`${field.label}的值无效。`)
  }
}

export type TaskPriority = 'P0' | 'P1' | 'P2' | 'P3'

export const TASK_PRIORITIES: readonly TaskPriority[] = ['P0', 'P1', 'P2', 'P3']

export const TASK_PRIORITY_META: Record<TaskPriority, { label: string; chip: string }> = {
  P0: { label: 'P0 · 紧急', chip: 'bg-red-50 text-red-600 border-red-200' },
  P1: { label: 'P1 · 高', chip: 'bg-orange-50 text-orange-600 border-orange-200' },
  P2: { label: 'P2 · 中', chip: 'bg-blue-50 text-blue-600 border-blue-200' },
  P3: { label: 'P3 · 低', chip: 'bg-zinc-100 text-zinc-500 border-zinc-200' },
}

export interface TaskRecord {
  revision?: number
  canEdit?: boolean
  canDelete?: boolean
  canManage?: boolean
  /** Rallyloom 侧任务 ID（seed/demo 生成） */
  id: string
  /** 来源系统注册 ID（本地新建为 'rallyloom'） */
  sourceId: string
  /** 在来源系统里的稳定任务 ID（幂等锚点，同人容器一样绝不重写语义） */
  externalTaskId: string
  title: string
  status: TaskStatus
  priority?: TaskPriority
  /** 负责人：办公室 roster 成员 ID（如 store-0）；外部系统推 external_user_id 时由承接方映射 */
  assigneeId?: string
  /** 负责人兜底显示名（成员尚未同步/已离队时展示） */
  assigneeName?: string
  /** 截止日 YYYY-MM-DD */
  due?: string
  roomId?: string
  createdBy?: string
  reviewPending?: boolean
  sourceMessage?: { channelId: string; messageId: string; senderName: string; excerpt: string }
  /** 自由属性 → 表格视图动态列（多维表格的字段本质） */
  attrs: Record<string, string>
  /** 最近一次更新时间 ISO */
  updatedAt: string
  /** local=本地新建/拖拽修改；sync=外部系统推送 */
  origin: 'local' | 'sync'
}

export interface TaskPatch {
  revision?: number
  title?: string
  status?: TaskStatus
  priority?: TaskPriority | null
  assigneeId?: string | null
  assigneeName?: string | null
  due?: string | null
  attrs?: Record<string, string>
  roomId?: string
  createdBy?: string
  reviewPending?: boolean
  sourceMessage?: TaskRecord['sourceMessage']
}

export interface TaskPosition {
  revision?: number
  status: TaskStatus
  /** Insert before this task, or append to the status column when null. */
  beforeId: string | null
}

export interface TaskClient {
  kind: 'demo-local' | 'oa-rest'
  label: string
  /** Provider configuration; changes notify subscribers. No client-side business-state defaults. */
  board: TaskBoardDefinition
  configure?(board: TaskBoardDefinition): Promise<void>
  /** 全量拉取（承接端语义：read path 走存储层后端） */
  list(): Promise<TaskRecord[]>
  create(patch: TaskPatch): Promise<TaskRecord>
  update(id: string, patch: TaskPatch): Promise<TaskRecord>
  move(id: string, position: TaskPosition): Promise<TaskRecord[]>
  remove(id: string): Promise<void>
  /** 订阅变更（外部推送/本地修改都走这里通知 UI） */
  subscribe(onChange: () => void): () => void
}

/** 表格视图动态列：全量属性键按出现频次排序，最多展示 maxCols 列 */
export function attrColumns(tasks: readonly TaskRecord[], maxCols = 6): string[] {
  const counts = new Map<string, number>()
  for (const t of tasks) {
    for (const key of Object.keys(t.attrs)) counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxCols)
    .map(([key]) => key)
}
