/**
 * 演示任务源：内存态 DemoTaskClient。
 * 生产环境换 OaTaskClient（走存储层后端 /api/v1/tasks），接入方按
 * agent-skill v1.2 的 task.upsert / task.remove 契约推送任务。
 */
import { MEMBERS } from '@/data/office'
import { canMoveTask, validateBoard, validateTaskPatch } from './types'
import type { TaskClient, TaskPatch, TaskPosition, TaskRecord } from './types'

const NOW = new Date()
const iso = (dayOffset: number, hour = 10) => {
  const d = new Date(NOW)
  d.setDate(d.getDate() + dayOffset)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}
const due = (dayOffset: number) => {
  const d = new Date(NOW)
  d.setDate(d.getDate() + dayOffset)
  return d.toISOString().slice(0, 10)
}

let seq = 0
const seedTask = (
  sourceId: string,
  externalTaskId: string,
  title: string,
  status: TaskRecord['status'],
  priority: TaskRecord['priority'],
  assigneeId: string,
  assigneeName: string,
  dueDay: number,
  attrs: Record<string, string>,
  origin: TaskRecord['origin'],
  updatedDayOffset = -1,
): TaskRecord => {
  const roomId = assigneeId.slice(0, assigneeId.lastIndexOf('-'))
  const person = MEMBERS.find(({ roomId: room, name }) => room === roomId && name === assigneeName)
  return {
    id: `t-${String(++seq).padStart(3, '0')}`,
    sourceId,
    externalTaskId,
    title,
    status,
    priority,
    assigneeId: person?.id ?? assigneeId,
    assigneeName,
    roomId,
    due: due(dueDay),
    attrs,
    updatedAt: iso(updatedDayOffset),
    origin,
  }
}

function seedTasks(): TaskRecord[] {
  return [
    // 外部推送（origin: sync）——演示「承接」语义
    seedTask('crm', 'TK-2246', '华东大区线索分配规则调整', 'doing', 'P1', 'command-1', '林晓', 2, { 渠道: '私域', 金额: '¥86,400' }, 'sync', -0.2),
    seedTask('crm', 'TK-2251', '3 个新线索转入华东看板', 'todo', 'P2', 'store-0', '周璐', 3, { 渠道: '私域' }, 'sync', -0.5),
    seedTask('erp', 'MO-8890', '双十二主推款备货单确认', 'backlog', 'P0', 'fulfill-0', '赵磊', 5, { 仓库: '宁波一号', 数量: '12,400 件' }, 'sync', -1),
    seedTask('erp', 'MO-8912', '退货件质检复核', 'doing', 'P2', 'service-0', '刘敏', 1, { 仓库: '宁波一号' }, 'sync', -0.3),
    // 本地新建（origin: local）——演示团队自建任务
    seedTask('rallyloom', 'L-001', '店铺首页 11 月改版走查', 'todo', 'P1', 'visual-0', '王琪', 4, { 类目: '首页', 工时: '16h' }, 'local'),
    seedTask('rallyloom', 'L-002', '主图 A/B 实验收尾', 'doing', 'P2', 'visual-1', '李子涵', 2, { 类目: '详情页' }, 'local'),
    seedTask('rallyloom', 'L-003', '客服话术库冬季版更新', 'todo', 'P2', 'service-1', '郑文', 6, { 类目: '客服' }, 'local'),
    seedTask('rallyloom', 'L-004', '双十二大促值班表排期', 'backlog', 'P1', 'command-2', '周舟', 8, { 类目: '大促' }, 'local'),
    seedTask('rallyloom', 'L-005', '尾款催付短信号文案', 'done', 'P1', 'store-2', '陆颉', -1, { 类目: '私域' }, 'local'),
    seedTask('rallyloom', 'L-006', '仓储打包人力预算复核', 'doing', 'P1', 'fulfill-1', '吴昊', 3, { 仓库: '宁波一号' }, 'local'),
    seedTask('rallyloom', 'L-007', '选品间新供应商档案录入', 'todo', 'P3', 'select-0', '王磊', 9, { 类目: '选品' }, 'local'),
    seedTask('rallyloom', 'L-008', '售后 48h 响应率专项', 'done', 'P1', 'service-2', '唐宁', -2, { 类目: '客服' }, 'local'),
    seedTask('rallyloom', 'L-009', '会议室大屏投屏器报修', 'backlog', 'P3', 'lobby-0', '苏晚', 12, {}, 'local'),
    seedTask('rallyloom', 'L-010', '茶水间补给清单下单一批', 'done', 'P3', 'pantry-0', '何静', -1, {}, 'local'),
  ]
}

export class DemoTaskClient implements TaskClient {
  readonly board = {
    defaultStatus: 'todo',
    statuses: [
      { id: 'backlog', label: '待排期', dot: '#a1a1aa', category: 'pending' },
      { id: 'todo', label: '待处理', dot: '#f59e0b', category: 'pending' },
      { id: 'doing', label: '进行中', dot: '#2563eb', category: 'active' },
      { id: 'done', label: '已完成', dot: '#16a34a', category: 'completed' },
    ],
    fields: [
      { id: '渠道', label: '渠道', type: 'text' }, { id: '金额', label: '金额', type: 'text' },
      { id: '仓库', label: '仓库', type: 'text' }, { id: '数量', label: '数量', type: 'text' },
      { id: '类目', label: '类目', type: 'text' }, { id: '工时', label: '工时', type: 'text' },
    ],
  } as const

  kind = 'demo-local' as const
  label = '演示任务源'
  private tasks: TaskRecord[]
  private listeners = new Set<() => void>()

  constructor() {
    validateBoard(this.board)
    this.tasks = seedTasks()
  }

  private notify() {
    for (const fn of this.listeners) fn()
  }

  async list(): Promise<TaskRecord[]> {
    return structuredClone(this.tasks)
  }

  async create(patch: TaskPatch): Promise<TaskRecord> {
    validateTaskPatch(this.board, patch)
    const task: TaskRecord = {
      id: `t-${String(++seq).padStart(3, '0')}`,
      sourceId: 'rallyloom',
      externalTaskId: `L-${String(Math.floor(Math.random() * 900) + 100)}`,
      title: patch.title ?? '未命名任务',
      status: patch.status ?? 'todo',
      priority: patch.priority ?? undefined,
      assigneeId: patch.assigneeId ?? undefined,
      assigneeName: patch.assigneeName ?? undefined,
      due: patch.due ?? undefined,
      roomId: patch.roomId,
      createdBy: patch.createdBy,
      sourceMessage: patch.sourceMessage,
      attrs: patch.attrs ?? {},
      updatedAt: new Date().toISOString(),
      origin: 'local',
    }
    this.tasks = [task, ...this.tasks]
    this.notify()
    return structuredClone(task)
  }

  async update(id: string, patch: TaskPatch): Promise<TaskRecord> {
    const idx = this.tasks.findIndex((t) => t.id === id)
    if (idx < 0) throw new Error(`任务不存在：${id}`)
    const prev = this.tasks[idx]
    validateTaskPatch(this.board, patch, prev)
    const next: TaskRecord = {
      ...prev,
      ...patch,
      priority: patch.priority !== undefined ? (patch.priority ?? undefined) : prev.priority,
      assigneeId: patch.assigneeId !== undefined ? (patch.assigneeId ?? undefined) : prev.assigneeId,
      assigneeName: patch.assigneeName !== undefined ? (patch.assigneeName ?? undefined) : prev.assigneeName,
      due: patch.due !== undefined ? (patch.due ?? undefined) : prev.due,
      attrs: patch.attrs ?? prev.attrs,
      updatedAt: new Date().toISOString(),
      origin: 'local',
    }
    this.tasks[idx] = next
    this.notify()
    return structuredClone(next)
  }

  async move(id: string, { status, beforeId }: TaskPosition): Promise<TaskRecord[]> {
    const task = this.tasks.find((entry) => entry.id === id)
    if (!task) throw new Error('任务已不存在。')
    if (!canMoveTask(this.board, task.status, status)) throw new Error('任务源不允许此状态流转。')
    if (task.reviewPending && status !== task.status) throw new Error('这项任务待验收，请在办公室处理验收。')
    const column = this.tasks.filter((entry) => entry.status === status)
    if (task.status === status && (column[column.indexOf(task) + 1]?.id ?? null) === beforeId) return this.list()

    const next = this.tasks.filter((entry) => entry.id !== id)
    const index = beforeId === null
      ? next.length
      : next.findIndex((entry) => entry.id === beforeId && entry.status === status)
    if (index < 0) throw new Error('目标位置已变更，请重新拖动。')
    next.splice(index, 0, { ...task, status, updatedAt: new Date().toISOString() })
    this.tasks = next
    this.notify()
    return this.list()
  }

  async remove(id: string): Promise<void> {
    this.tasks = this.tasks.filter((t) => t.id !== id)
    this.notify()
  }

  subscribe(onChange: () => void): () => void {
    this.listeners.add(onChange)
    return () => this.listeners.delete(onChange)
  }
}
