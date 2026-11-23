/**
 * 任务看板页（必接板块之四）。
 * 交互参考开源界（Teable/Baserow 的字段模型、Focalboard/Planka 的看板拖拽），
 * 数据遵循「承接与展示」：任务由云端/外部系统承接（agent-skill v1.2 契约），
 * 演示源内置内存数据。视图 = 看板（按状态列，dnd-kit 拖拽换列）
 * + 多维表格（attrs 自由属性自动出列）。
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { TaskDetails } from './TaskDetails'
import { TaskBoardSettings } from './TaskBoardSettings'
import { createPortal } from 'react-dom'
import { Plus, SquareKanban, Table2, RotateCw, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Member as OfficeMember } from '@/data/office'
type Member = Pick<OfficeMember, 'id' | 'name' | 'role' | 'body'>
import type { TaskClient, TaskPatch, TaskPosition, TaskPriority, TaskRecord, TaskStatus, TaskBoardDefinition } from '@/lib/tasks/types'
import { attrColumns, canMoveTask, taskStatus, validateBoard, TASK_PRIORITIES, TASK_PRIORITY_META } from '@/lib/tasks/types'

const today = () => new Date().toISOString().slice(0, 10)

function AssigneeChip({ member, name, size = 18 }: { member?: Member; name?: string; size?: number }) {
  const label = member?.name ?? name ?? '未指派'
  return (
    <span className="inline-flex items-center gap-1.5 text-ui-label text-muted-foreground">
      <Avatar style={{ width: size, height: size }} className="rounded-full">
        <AvatarFallback
          className="text-ui-map font-medium text-white"
          style={{ backgroundColor: member?.body ?? '#a1a1aa' }}
        >
          {label.slice(0, 1)}
        </AvatarFallback>
      </Avatar>
      <span className="max-w-[56px] truncate">{label}</span>
    </span>
  )
}

function DueChip({ due, done }: { due?: string; done: boolean }) {
  if (!due) return null
  const overdue = !done && due < today()
  return (
    <span className={cn('text-ui-label tabular-nums', overdue ? 'text-red-500' : 'text-muted-foreground')}>
      {overdue ? `已逾期 · ${due.slice(5)}` : due.slice(5)}
    </span>
  )
}

function TaskCardInner({ task, member, dragging, sortable, board }: { board: TaskBoardDefinition; task: TaskRecord; member?: Member; dragging?: boolean; sortable?: boolean }) {
  const meta = task.priority ? TASK_PRIORITY_META[task.priority] : null
  const attrEntries = Object.entries(task.attrs).slice(0, 2)
  return (
    <div
      data-task-id={task.id}
      className={cn(
        'rounded-lg border border-black/[0.06] bg-white p-2.5 shadow-[0_1px_2px_rgba(17,18,22,0.04)] transition-shadow',
        dragging && 'shadow-pop',
        sortable && 'cursor-grab active:cursor-grabbing',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 min-w-0 flex-1 break-words text-ui-body font-medium text-foreground">{task.title}</p>
        {meta && <span className={cn('shrink-0 rounded-full border px-1.5 py-px text-ui-meta font-semibold', meta.chip)}>{task.priority}</span>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <AssigneeChip member={member} name={task.assigneeName} />
        <DueChip due={task.due} done={taskStatus(board, task.status).category === 'completed'} />
        {task.origin === 'sync' && (
          <span className="rounded-full bg-indigo-50 px-1.5 py-px text-ui-meta font-medium text-indigo-500">外部 · {task.sourceId}</span>
        )}
      </div>
      {attrEntries.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {attrEntries.map(([k, v]) => (
            <span key={k} className="rounded bg-muted px-1.5 py-px text-ui-meta text-muted-foreground">
              {board.fields.find(({ id }) => id === k)?.label ?? k} · {v.length > 10 ? `${v.slice(0, 10)}…` : v}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function SortableTaskCard({ task, member, board, onOpen }: { onOpen: (task: TaskRecord) => void; board: TaskBoardDefinition; task: TaskRecord; member?: Member }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, disabled: task.canEdit === false })
  const row = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const previousTop = useRef<number | null>(null)
  const movement = useRef<Animation | null>(null)
  const attach = useCallback((node: HTMLDivElement | null) => {
    row.current = node
    setNodeRef(node)
  }, [setNodeRef])

  useLayoutEffect(() => {
    const node = row.current
    const inner = content.current
    if (!node || !inner || isDragging) { previousTop.current = null; return }
    const top = node.offsetTop
    const oldTop = previousTop.current
    previousTop.current = top
    if (oldTop === null || oldTop === top || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const offset = inner.getBoundingClientRect().top - node.getBoundingClientRect().top
    movement.current?.cancel()
    movement.current = inner.animate([
      { transform: `translateY(${oldTop - top + offset}px)` }, { transform: 'translateY(0)' },
    ], { duration: 170, easing: 'cubic-bezier(.23, 1, .32, 1)' })
  })

  return (
    <div ref={attach} {...attributes} {...listeners} data-task-row={task.id} data-drag-source={isDragging || undefined}
      onClick={() => { if (!isDragging) onOpen(task) }} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(task) }} aria-label={task.title} className={cn('shrink-0 touch-none rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring', isDragging && 'pointer-events-none invisible absolute inset-x-0')}>
      <div ref={content}><TaskCardInner task={task} member={member} board={board} sortable /></div>
    </div>
  )
}

type BoardDrag = { revision?: number; left: number; top: number; id: string; height: number; width?: number; position: TaskPosition | null }

const boardCollision: CollisionDetection = ({ pointerCoordinates, droppableContainers }) => {
  if (!pointerCoordinates) return []
  const { x, y } = pointerCoordinates
  for (const column of droppableContainers) {
    const node = column.node.current
    if (!node) continue
    const rect = node.getBoundingClientRect()
    const viewport = node.closest('[data-task-viewport]')?.getBoundingClientRect()
    if (!viewport || x < Math.max(rect.left, viewport.left) || x > Math.min(rect.right, viewport.right) ||
      y < Math.max(rect.top, viewport.top) || y > Math.min(rect.bottom, viewport.bottom)) continue

    let beforeId: string | null = null
    for (const row of node.querySelectorAll<HTMLElement>('[data-task-row]:not([data-drag-source]), [data-drop-placeholder]')) {
      const box = row.getBoundingClientRect()
      if (row.hasAttribute('data-drop-placeholder')) {
        if (y >= box.top && y <= box.bottom) {
          beforeId = row.dataset.beforeId ?? null
          break
        }
      } else if (y < box.top + box.height / 2) {
        beforeId = row.dataset.taskRow ?? null
        break
      }
    }
    return [{ id: column.id, data: { position: { status: column.id as TaskStatus, beforeId } satisfies TaskPosition } }]
  }
  return []
}

function BoardColumn({
  status,
  tasks,
  members,
  drag,
  board,
  onOpen,
}: {
  onOpen: (task: TaskRecord) => void
  board: TaskBoardDefinition
  status: TaskStatus
  tasks: readonly TaskRecord[]
  members: readonly Member[]
  drag: BoardDrag | null
}) {
  const { setNodeRef } = useDroppable({ id: status })
  const meta = taskStatus(board, status)
  const target = drag?.position?.status === status ? drag.position : null
  const placeholder = target && <div key="drop-slot" data-drop-placeholder data-before-id={target.beforeId ?? undefined}
    style={{ height: drag?.height }} aria-hidden="true" className="shrink-0 rounded-lg border border-dashed border-[#7090bd] bg-[#e8f0fc]" />
  return (
    <div
      data-status={status}
      ref={setNodeRef}
      className={cn(
        'flex min-h-0 min-w-0 flex-col rounded-lg border border-black/[0.06] bg-[#f7f7f7] p-2 transition-colors',
        target && 'bg-[#f1f5fb]',
      )}
    >
      <div className="flex items-center gap-1.5 px-1 pb-2 pt-0.5">
        <span className="size-1.5 rounded-full" style={{ backgroundColor: meta.dot }} />
        <span className="text-ui-section font-semibold text-foreground">{meta.label}</span>
        <span className="text-ui-meta tabular-nums text-muted-foreground">{tasks.length}</span>
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-0.5 pb-1">
        {tasks.flatMap((task) => {
          const card = <SortableTaskCard onOpen={onOpen} board={board} key={task.id} task={task} member={members.find((m) => m.id === task.assigneeId)} />
          return task.id === target?.beforeId ? [placeholder, card] : [card]
        })}
        {target?.beforeId === null && placeholder}
        {!target && !tasks.some(({ id }) => id !== drag?.id) && (
          <div className="mt-1 rounded-lg border border-dashed border-black/[0.08] px-2 py-5 text-center text-ui-label text-muted-foreground">
            拖任务到这里
          </div>
        )}
      </div>
    </div>
  )
}

function NewTaskDialog({
  open,
  onOpenChange,
  members,
  onCreate,
  board,
}: {
  board: TaskBoardDefinition
  open: boolean
  onOpenChange: (open: boolean) => void
  members: readonly Member[]
  onCreate: (patch: TaskPatch) => Promise<unknown>
}) {
  const [title, setTitle] = useState('')
  const [assigneeId, setAssigneeId] = useState<string>('')
  const [status, setStatus] = useState<TaskStatus>(board.defaultStatus)
  useEffect(() => { if (open) setStatus(board.defaultStatus) }, [open, board.defaultStatus])
  const [priority, setPriority] = useState<string>('P2')
  const [dueDate, setDueDate] = useState<string>('')
  const [attrs, setAttrs] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async () => {
    if (!title.trim()) return
    const member = members.find((m) => m.id === assigneeId)
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await onCreate({
        title: title.trim(),
        status,
        priority: (priority as TaskPriority) ?? undefined,
        assigneeId: member ? member.id : undefined,
        assigneeName: member ? member.name : undefined,
        due: dueDate || undefined,
        attrs,
      })
      setTitle('')
      setAssigneeId('')
      setStatus(board.defaultStatus)
      setPriority('P2')
      setDueDate('')
      setAttrs({})
      onOpenChange(false)
    } catch (failure) { setError(failure instanceof Error ? failure.message : '创建失败，请重试。') }
    finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-[440px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-ui-section">新建任务</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-1">
          <div className="grid gap-1.5">
            <Label className="text-ui-label text-muted-foreground">任务</Label>
            <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="要做什么，一句话说清" onKeyDown={(e) => e.key === 'Enter' && submit()} />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="grid gap-1.5">
              <Label className="text-ui-label text-muted-foreground">负责人</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger className="h-8"><SelectValue placeholder="未指派" /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name} · {m.role}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-ui-label text-muted-foreground">优先级</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>{TASK_PRIORITY_META[p].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="grid gap-1.5">
              <Label className="text-ui-label text-muted-foreground">状态列</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {board.statuses.map(({ id: s }) => (
                    <SelectItem key={s} value={s}>{taskStatus(board, s).label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-ui-label text-muted-foreground">截止日</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-8" />
            </div>
          </div>
        </div>
        {board.fields.map((field) => <label key={field.id} className="grid gap-1.5 text-ui-label">{field.label}{field.required ? ' *' : ''}
          {field.type === 'select' ? <select className="h-8 rounded-md border bg-background px-2" value={attrs[field.id] ?? ''} onChange={(event) => setAttrs({ ...attrs, [field.id]: event.target.value })}>
            <option value="">请选择</option>{field.options?.map((value) => <option key={value}>{value}</option>)}
          </select> : <Input type={field.type} value={attrs[field.id] ?? ''} onChange={(event) => setAttrs({ ...attrs, [field.id]: event.target.value })} />}
        </label>)}
        {error && <p role="alert" className="text-destructive text-ui-label">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>取消</Button>
          <Button size="sm" disabled={busy || !title.trim() || board.fields.some((field) => field.required && !attrs[field.id]?.trim())} onClick={() => void submit()}>创建任务</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function TaskBoardPage({ members, client, scopes, scope, onScope, canConfigure }: { members: readonly Member[]; client: TaskClient; scopes?: { id: string; label: string }[]; scope?: string; onScope?: (scope: string) => void; canConfigure?: boolean }) {
  const board = validateBoard(client.board)
  const [savingMove, setSavingMove] = useState(false)
  const [tasks, setTasks] = useState<readonly TaskRecord[] | null>(null)
  const [view, setView] = useState<'board' | 'table'>('board')
  const [selectedTask, setSelectedTask] = useState<TaskRecord | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [activeDrag, setActiveDrag] = useState<BoardDrag | null>(null)
  const [moveError, setMoveError] = useState('')
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const refresh = useCallback(async () => {
    try { setTasks(await client.list()); setMoveError('') } catch (e) { setMoveError(e instanceof Error ? e.message : '任务加载失败') }
  }, [client])

  useEffect(() => {
    void refresh()
    return client.subscribe(() => void refresh())
  }, [client, refresh])

  const byStatus = useMemo(() => {
    const map = new Map<TaskStatus, TaskRecord[]>(board.statuses.map(({ id }) => [id, []]))
    for (const t of tasks ?? []) {
      if (!map.has(t.status)) map.set(t.status, [])
      map.get(t.status)!.push(t)
    }
    return map
  }, [tasks, board])

  const memberOf = useCallback((t: TaskRecord) => members.find((m) => m.id === t.assigneeId), [members])

  const activeTask = tasks?.find((t) => t.id === activeDrag?.id) ?? null

  const onDragStart = ({ active, activatorEvent }: DragStartEvent) => {
    const task = tasks?.find(({ id }) => id === active.id)
    if (!task || savingMove) return
    const column = byStatus.get(task.status) ?? []
    const origin = activatorEvent.target instanceof Element ? activatorEvent.target.closest('[data-task-row]') : null
    const rect = active.rect.current.initial ?? origin?.getBoundingClientRect()
    setMoveError('')
    setActiveDrag({ revision: task.revision, left: rect?.left ?? 0, top: rect?.top ?? 0, id: task.id, height: rect?.height ?? 86, width: rect?.width,
      position: { status: task.status, beforeId: column[column.indexOf(task) + 1]?.id ?? null } })
  }

  const readPosition = (event: DragMoveEvent) => (event.collisions?.[0]?.data?.position as TaskPosition | undefined) ?? null

  const onDragMove = (event: DragMoveEvent) => {
    const target = readPosition(event)
    const position = target && activeTask && canMoveTask(board, activeTask.status, target.status) ? target : null
    setActiveDrag((current) => current && (
      current.position?.status === position?.status && current.position?.beforeId === position?.beforeId
        ? current : { ...current, position }
    ))
  }

  const onDragEnd = (event: DragEndEvent) => {
    const position = activeDrag?.position
    setActiveDrag(null)
    if (!position || !tasks || savingMove) return
    const previous = tasks
    const task = tasks.find(({ id }) => id === event.active.id)
    if (!task) return
    const reordered = tasks.filter(({ id }) => id !== task.id)
    const index = position.beforeId ? reordered.findIndex(({ id }) => id === position.beforeId) : reordered.length
    reordered.splice(index < 0 ? reordered.length : index, 0, { ...task, status: position.status })
    setTasks(reordered)
    setSavingMove(true)
    void client.move(String(event.active.id), { ...position, revision: activeDrag?.revision }).then(setTasks, (error: unknown) => {
      setTasks(previous)
      setMoveError(error instanceof Error ? error.message : '任务移动失败，请重试。')
    }).finally(() => setSavingMove(false))
  }

  const doingCount = (tasks ?? []).filter((task) => taskStatus(board, task.status).category === 'active').length
  const overdue = (tasks ?? []).filter((t) => taskStatus(board, t.status).category !== 'completed' && t.due && t.due < today()).length
  const extraCols = [...new Set([...board.fields.map(({ id }) => id), ...attrColumns(tasks ?? [], 32)])]

  return (
    <main data-tasks="root" className="workspace-view bg-[#f3f3f2]">
      <header className="workspace-header flex-wrap gap-y-2 border-b border-border/70 py-2">
        <h1 className="shrink-0 text-ui-title font-semibold text-foreground">任务看板</h1>
        <Badge variant="secondary" className="shrink-0 text-ui-meta font-normal">
          {tasks ? `${tasks.length} 项 · ${doingCount} 进行中${overdue ? ` · ${overdue} 逾期` : ''}` : '加载中…'}
        </Badge>
        <span className="hidden truncate text-ui-meta text-muted-foreground lg:inline" title={client.label}>
          {client.label}
        </span>
        <div data-task-toolbar className="ml-auto flex flex-wrap items-center gap-2">
          {scopes && scopes.length > 1 && <Select value={scope} onValueChange={onScope}><SelectTrigger aria-label="公司任务范围" className="h-8 w-44 rounded-md border-black/[0.06] bg-white py-0 text-ui-label shadow-[0_1px_2px_rgba(17,18,22,0.04)] hover:bg-muted/60"><SelectValue /></SelectTrigger><SelectContent>{scopes.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent></Select>}
          <Button variant="toolbar" size="sm" onClick={() => void refresh()}><RotateCw strokeWidth={1.7}/>刷新</Button>
          {canConfigure && client.configure && tasks && <Button variant="toolbar" size="sm" onClick={() => setSettingsOpen(true)}><SlidersHorizontal strokeWidth={1.7}/>看板设置</Button>}

          <Tabs value={view} onValueChange={(v) => setView(v as 'board' | 'table')}>
            <TabsList className="h-8 rounded-md p-[2px]">
              <TabsTrigger value="board" className="h-7 gap-1.5 px-2.5 text-ui-label [&_svg]:size-4">
                <SquareKanban className="size-3" strokeWidth={1.8} />看板
              </TabsTrigger>
              <TabsTrigger value="table" className="h-7 gap-1.5 px-2.5 text-ui-label [&_svg]:size-4">
                <Table2 className="size-3" strokeWidth={1.8} />表格
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="toolbar" size="sm" disabled={tasks === null} onClick={() => setNewOpen(true)}>
            <Plus className="size-3.5" strokeWidth={2} />新建任务
          </Button>
        </div>
      </header>

      {moveError && <p className="px-4 pt-2 text-ui-label text-destructive" role="alert">{moveError}</p>}
      <div data-task-viewport className="workspace-content min-h-0 flex-1 overflow-auto py-3">
        {tasks === null ? (
          <div className="grid h-full place-items-center text-ui-body text-muted-foreground">正在拉取任务…</div>
        ) : view === 'board' ? (
          <DndContext sensors={sensors} collisionDetection={boardCollision} onDragStart={onDragStart} onDragMove={onDragMove}
            onDragEnd={onDragEnd} onDragCancel={() => setActiveDrag(null)}>
            <div data-tasks="lanes" className="grid min-h-full w-full gap-2.5" style={{ gridTemplateColumns: `repeat(${byStatus.size}, minmax(220px,1fr))` }}>
              {[...byStatus.keys()].map((s) => (
                <BoardColumn onOpen={setSelectedTask} board={board} key={s} status={s} tasks={byStatus.get(s) ?? []} members={members} drag={activeDrag} />
              ))}
            </div>
            {createPortal(<DragOverlay dropAnimation={null} adjustScale={false} style={{ left: activeDrag?.left, top: activeDrag?.top }}>
              {activeTask ? <div style={{ width: activeDrag?.width }}><TaskCardInner task={activeTask} member={memberOf(activeTask)} board={board} dragging /></div> : null}
            </DragOverlay>, document.body)}
          </DndContext>
        ) : (
          <div data-tasks="table" className="w-full overflow-hidden rounded-lg border border-black/[0.06] bg-white">
              <Table className="table-fixed" style={{ minWidth: 594 + extraCols.length * 94 }}>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[74px]">状态</TableHead>
                    <TableHead>任务</TableHead>
                    <TableHead className="w-[92px]">负责人</TableHead>
                    <TableHead className="w-[58px]">优先级</TableHead>
                    <TableHead className="w-[84px]">截止</TableHead>
                    {extraCols.map((c) => (
                      <TableHead key={c} className="w-[94px] truncate" title={c}>{board.fields.find(({ id }) => id === c)?.label ?? c}</TableHead>
                    ))}
                    <TableHead className="w-[104px]">来源</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(tasks ?? []).map((t) => {
                    const m = memberOf(t)
                    const pmeta = t.priority ? TASK_PRIORITY_META[t.priority] : null
                    return (
                      <TableRow key={t.id} data-task-id={t.id}>
                        <TableCell className="py-2">
                          <span className="inline-flex items-center gap-1.5 text-ui-label text-muted-foreground">
                            <span className="size-1.5 rounded-full" style={{ backgroundColor: taskStatus(board, t.status).dot }} />
                            {taskStatus(board, t.status).label}
                          </span>
                        </TableCell>
                        <TableCell className="break-words py-2 font-medium">{t.title}</TableCell>
                        <TableCell className="py-2"><AssigneeChip member={m} name={t.assigneeName} /></TableCell>
                        <TableCell className="py-2">
                          {pmeta ? (
                            <span className={cn('rounded-full border px-1.5 py-px text-ui-meta font-semibold', pmeta.chip)}>{t.priority}</span>
                          ) : (
                            <span className="text-ui-label text-muted-foreground/60">—</span>
                          )}
                        </TableCell>
                        <TableCell className="py-2"><DueChip due={t.due} done={t.status === 'done'} /></TableCell>
                        {extraCols.map((c) => (
                          <TableCell key={c} className="truncate py-2 text-ui-label text-muted-foreground" title={t.attrs[c]}>
                            {t.attrs[c] ?? '—'}
                          </TableCell>
                        ))}
                        <TableCell className="py-2">
                          {t.origin === 'sync' ? (
                            <span className="rounded-full bg-indigo-50 px-1.5 py-px text-ui-meta font-medium text-indigo-500">
                              {t.sourceId} · 外部推送
                            </span>
                          ) : (
                            <span className="rounded-full bg-muted px-1.5 py-px text-ui-meta text-muted-foreground">本地</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
          </div>
        )}
      </div>

      {selectedTask && <TaskDetails task={selectedTask} board={board} client={client} close={() => setSelectedTask(null)} refresh={refresh} />}
      {settingsOpen && client.configure && <TaskBoardSettings board={board} close={() => setSettingsOpen(false)} save={async (value) => { await client.configure!(value); await refresh() }} />}
      <NewTaskDialog board={board} open={newOpen} onOpenChange={setNewOpen} members={members} onCreate={(patch) => client.create(patch)} />
    </main>
  )
}
