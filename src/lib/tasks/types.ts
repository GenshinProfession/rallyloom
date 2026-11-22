/**
 * 任务看板（类飞书多维表格）数据契约。
 *
 * 定位与交流室一致：Rallyloom 提供「承接与展示」能力，任务数据本身
 * 由云端/外部系统承接（见 agent-skill/integration-spec.md §4.6、§9）。
 * - 中性任务容器：必填仅 source_id + external_task_id + title；
 *   attrs 是自由属性键值对 → 表格视图按「多维字段」自动出列。
 * - 状态/优先级是 Rallyloom 的看板语义（列），外部系统可映射可不映射，
 *   不给就落默认列，绝不报错。
 */

export type TaskStatus = 'backlog' | 'todo' | 'doing' | 'done'

export const TASK_STATUSES: readonly TaskStatus[] = ['backlog', 'todo', 'doing', 'done']

export const TASK_STATUS_META: Record<TaskStatus, { label: string; hint: string; dot: string }> = {
  backlog: { label: '待排期', hint: '还没定排期的任务', dot: '#a1a1aa' },
  todo: { label: '待处理', hint: '已排期待开工', dot: '#f59e0b' },
  doing: { label: '进行中', hint: '有人正在推进', dot: '#2563eb' },
  done: { label: '已完成', hint: '本周内完成', dot: '#16a34a' },
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
  status: TaskStatus
  /** Insert before this task, or append to the status column when null. */
  beforeId: string | null
}

export interface TaskClient {
  kind: 'demo-local' | 'oa-rest'
  label: string
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
