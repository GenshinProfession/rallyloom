import { useEffect, useState, type MouseEvent } from 'react'
import { ArrowUpRight, AtSign, Bell, Check, ClipboardList, FileText, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { DocEditorDialog } from '@/components/docs/DocEditorDialog'
import { documentPath } from '@/components/docs/DocumentTree'
import { ViewerMarkdown } from '@/components/docs/ViewerMarkdown'
import type { Member } from '@/data/office'
import type { ChatMessage } from '@/lib/chat/types'
import { documentUrl, type DocClient, type DocRecord } from '@/lib/docs/types'
import type { NoticeClient, NoticeRecord } from '@/lib/notify/types'
import { canMoveTask, taskStatus, type TaskClient, type TaskPatch, type TaskRecord } from '@/lib/tasks/types'
import type { ResolvedRoom } from './rooms/api'
import './office-work.css'

export interface OfficeTaskDraft { roomId?: string; sourceMessage?: TaskRecord['sourceMessage'] }

export interface OfficeWorkAccess {
  actorId: string
  actorName: string
  canCoordinate: boolean
  tasks?: TaskClient
  docs?: DocClient
  notices?: NoticeClient
}

const compact = 'h-7 gap-1.5 px-2 text-ui-label'

function TaskEditor({ draft, task, people, access, meSeatId, onSave, onClose, onSource }: {
  draft: OfficeTaskDraft
  task?: TaskRecord
  people: readonly Member[]
  access: OfficeWorkAccess
  meSeatId: string | null
  onSave: (patch: TaskPatch) => Promise<unknown>
  onClose: () => void
  onSource?: (source: NonNullable<TaskRecord['sourceMessage']>, anchor: HTMLElement) => void
}) {
  const board = access.tasks!.board
  const activeStatus = board.statuses.find((status) => status.category === 'active')?.id
  const completedStatus = board.statuses.find((status) => status.category === 'completed')?.id
  const allowed = (status: string | undefined) => !!status && (!task || canMoveTask(board, task.status, status))
  const quoted = draft.sourceMessage ?? task?.sourceMessage
  const [title, setTitle] = useState(task?.title ?? quoted?.excerpt.replace(/\s+/g, ' ').slice(0, 60) ?? '')
  const [assignee, setAssignee] = useState(task ? task.assigneeId ?? '' : access.actorId)
  const [due, setDue] = useState(task?.due ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const isMine = task?.assigneeId === meSeatId || task?.assigneeId === access.actorId
  const canReview = !!task && (task.createdBy === access.actorId || access.canCoordinate)
  const canEdit = !task || isMine || canReview

  async function apply(patch: TaskPatch) {
    if (busy || !title.trim()) return
    setBusy(true)
    setError('')
    try {
      const person = people.find(({ id }) => id === assignee)
      const assigneeName = assignee === access.actorId ? access.actorName : person?.name ?? (assignee === task?.assigneeId ? task?.assigneeName : undefined)
      await onSave({ title: title.trim(), assigneeId: assignee || null, assigneeName: assigneeName ?? null, due: due || null, ...patch })
      onClose()
    } catch (failure) { setError(failure instanceof Error ? failure.message : '任务更新失败。') }
    finally { setBusy(false) }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose() }}>
      <DialogContent className="max-w-[470px]">
        <DialogHeader>
          <DialogTitle>{task ? '任务详情' : quoted ? '从消息创建任务' : '新建任务'}</DialogTitle>
          <DialogDescription>{task ? (task.reviewPending ? '待验收' : taskStatus(access.tasks!.board, task.status).label) : '填写任务并指派负责人。'}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); if (canEdit) void apply({}) }}>
          <label className="grid gap-1 text-ui-label">任务标题<Input required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} disabled={busy || !canEdit} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-ui-label">负责人
              <select className="h-9 min-w-0 rounded-md border border-input bg-white px-2 text-ui-body" value={assignee} onChange={(event) => setAssignee(event.target.value)} disabled={busy || !canEdit}>
                <option value="">未指派</option>
                {!people.some(({ id }) => id === access.actorId) && <option value={access.actorId}>我 · {access.actorName}</option>}
                {assignee && assignee !== access.actorId && !people.some(({ id }) => id === assignee) && <option value={assignee}>{task?.assigneeName || assignee}</option>}
                {people.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-ui-label">截止日期<Input type="date" value={due} onChange={(event) => setDue(event.target.value)} disabled={busy || !canEdit} /></label>
          </div>
          {quoted && <div className="office-source-message"><strong>原消息 · {quoted.senderName}</strong>{quoted.excerpt && <p>{quoted.excerpt}</p>}
            {task && onSource && <Button size="sm" type="button" variant="link" className="h-6 px-0" onClick={(event) => onSource(quoted, event.currentTarget)}>查看原消息 <ArrowUpRight /></Button>}
          </div>}
          {error && <p role="alert" className="text-ui-label text-destructive">{error}</p>}
          <DialogFooter className="flex-wrap gap-y-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>关闭</Button>
            {task && !task.reviewPending && taskStatus(access.tasks!.board, task.status).category !== 'completed' && canEdit && (
              taskStatus(access.tasks!.board, task.status).category === 'active' ? <Button type="button" variant="outline" disabled={busy} onClick={() => void apply({ reviewPending: true })}>提交验收</Button>
                : <Button type="button" variant="outline" disabled={busy || !allowed(activeStatus)} onClick={() => void apply({ status: activeStatus })}>开始处理</Button>
            )}
            {task?.reviewPending && canReview && <>
              <Button type="button" variant="outline" disabled={busy || !allowed(activeStatus)} onClick={() => void apply({ status: activeStatus, reviewPending: false })}>退回处理</Button>
              <Button type="button" disabled={busy || !allowed(completedStatus)} onClick={() => void apply({ status: completedStatus, reviewPending: false })}>确认验收</Button>
            </>}
            {canEdit && !task?.reviewPending && <Button type="submit" disabled={busy || !title.trim()}>{task ? '保存' : '创建任务'}</Button>}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function OfficeWorkPanel({ access, room, people, meSeatId, mentions, draft, onDraft, onMessage, onChat }: {
  access: OfficeWorkAccess
  room?: ResolvedRoom
  people: readonly Member[]
  meSeatId: string | null
  mentions: ReadonlyMap<string, ChatMessage> | undefined
  draft: OfficeTaskDraft | null
  onDraft: (draft: OfficeTaskDraft | null) => void
  onMessage: (channelId: string, messageId: string, anchor: HTMLElement) => void
  onChat?: (event: MouseEvent<HTMLButtonElement>) => void
}) {
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [docs, setDocs] = useState<DocRecord[]>([])
  const [notices, setNotices] = useState<NoticeRecord[]>([])
  const [unread, setUnread] = useState<string[]>([])
  const [error, setError] = useState('')
  const [taskId, setTaskId] = useState<string>()
  const [docId, setDocId] = useState<string>()
  const [editingDoc, setEditingDoc] = useState(false)
  const [newDoc, setNewDoc] = useState(false)
  const [notice, setNotice] = useState<NoticeRecord>()
  const [showAll, setShowAll] = useState(false)
  const { tasks: taskClient, docs: docClient, notices: noticeClient } = access

  useEffect(() => {
    if (!taskClient) return
    let active = true
    const refresh = () => { void taskClient.list().then((rows) => { if (active) setTasks(rows) }, () => { if (active) setError('任务暂时无法加载。') }) }
    refresh()
    const off = taskClient.subscribe(refresh)
    return () => { active = false; off() }
  }, [taskClient])
  useEffect(() => {
    if (!docClient) return
    let active = true
    const update = (rows: DocRecord[]) => { if (active) setDocs(rows) }
    void docClient.list().then(update, () => { if (active) setError('文档暂时无法加载。') })
    const off = docClient.subscribe(update)
    return () => { active = false; off() }
  }, [docClient])
  useEffect(() => {
    if (!noticeClient) return
    let active = true
    const refresh = () => void Promise.all([noticeClient.list(), noticeClient.unreadIds()]).then(([rows, ids]) => {
      if (active) { setNotices(rows); setUnread(ids) }
    }, () => { if (active) setError('通知暂时无法加载。') })
    refresh()
    const off = noticeClient.subscribe(refresh)
    return () => { active = false; off() }
  }, [noticeClient])

  const lane = new Set(room ? [room.id, ...(room.workbench?.linkedRoomIds ?? [])] : [])
  const squad = people.filter((person) => lane.has(person.roomId))
  const assignees = new Set(squad.map(({ id }) => id))
  const personalTask = (task: TaskRecord) => task.assigneeId === meSeatId || task.assigneeId === access.actorId ||
    task.createdBy === access.actorId || (task.reviewPending && access.canCoordinate)
  const selectedTasks = tasks.filter((task) => taskStatus(access.tasks!.board, task.status).category !== 'completed' && (room
    ? (task.roomId ? lane.has(task.roomId) : task.assigneeId && assignees.has(task.assigneeId))
    : personalTask(task))).sort((a, b) => Number(Boolean(b.reviewPending)) - Number(Boolean(a.reviewPending)) || a.updatedAt.localeCompare(b.updatedAt) * -1)
  const selectedDocs = room ? docs.filter((doc) => (room.workbench?.documentSpaces ?? [room.name]).includes(doc.space) || documentPath(doc).includes(room.name)) : docs
  const selectedMentions = [...(mentions?.values() ?? [])].filter((item) => !room || item.channelId === `room:${room.id}`).reverse()
  const selectedNotices = notices.filter(({ id }) => unread.includes(id))
  const task = tasks.find(({ id }) => id === taskId)
  const doc = docs.find(({ id }) => id === docId)

  return (
    <div className="office-work" data-office-work={room?.id ?? 'inbox'}>
      <section className="office-work-intro">
        <div className="office-work-head"><h2>{room?.name ?? '待我处理'}</h2>{taskClient && <Button type="button" variant="outline" size="sm" className={compact}
          onClick={() => onDraft({ roomId: room?.id })}><Plus /> 新建任务</Button>}</div>
        {room && <><p>{room.note}</p><div className="office-squad-row">
          <div className="office-squad-people" aria-label={`${squad.length} 位小队成员`}>{squad.slice(0, 6).map((member) =>
            <span key={member.id} style={{ background: member.body }} title={member.name}>{member.name.slice(0, 1)}</span>)}
            <small>{squad.length} 人</small></div>
          {onChat && <Button type="button" variant="ghost" size="sm" className={compact} onClick={onChat}>房间聊天 <ArrowUpRight /></Button>}
        </div></>}
      </section>
      {error && <p role="status" className="office-work-empty">{error}</p>}
      {!!selectedMentions.length && <section className="office-work-section"><header><h3>提及我的消息</h3><span>{selectedMentions.length}</span></header>
        {selectedMentions.map((message) => <button type="button" className="office-work-row ui-press" key={message.id}
          onClick={(event) => onMessage(message.channelId, message.id, event.currentTarget)}>
          <AtSign size={14} /><span><strong>{message.senderName}</strong><small>{message.text || '含附件的消息'}</small></span><ArrowUpRight size={12} />
        </button>)}
      </section>}
      {taskClient && <section className="office-work-section"><header><h3>{room ? '小队任务' : '我的任务与验收'}</h3><span>{selectedTasks.length}</span></header>
        {selectedTasks.slice(0, showAll ? undefined : 5).map((entry) => <button type="button" className="office-work-row ui-press" key={entry.id} data-office-task={entry.id} onClick={() => setTaskId(entry.id)}>
          <ClipboardList size={14} /><span><strong>{entry.title}</strong><small>{entry.assigneeName || '未指派'}{entry.due ? ` · ${entry.due.slice(5)}` : ''}</small></span>
          <em data-review={entry.reviewPending || undefined}>{entry.reviewPending ? '待验收' : taskStatus(taskClient.board, entry.status).label}</em>
        </button>)}
        {!selectedTasks.length && <p className="office-work-empty">暂无待处理任务</p>}
        {selectedTasks.length > 5 && <button type="button" className="office-more" onClick={() => setShowAll(!showAll)}>{showAll ? '收起任务' : '显示全部任务'}</button>}
      </section>}
      {docClient && <section className="office-work-section"><header><h3>{room ? '小队文档' : '最近文档'}</h3>
        <Button type="button" variant="ghost" size="sm" className={compact} onClick={() => setNewDoc(true)}><Plus /> 新建文档</Button></header>
        {[...selectedDocs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4).map((entry) => <button type="button" className="office-work-row ui-press" key={entry.id} data-office-doc={entry.id} onClick={() => setDocId(entry.id)}>
          <FileText size={14} /><span><strong>{entry.title}</strong><small>{entry.space}</small></span><ArrowUpRight size={12} />
        </button>)}
        {!selectedDocs.length && <p className="office-work-empty">暂无关联文档</p>}
      </section>}
      {!room && !!selectedNotices.length && <section className="office-work-section"><header><h3>未读通知</h3><span>{selectedNotices.length}</span></header>
        {selectedNotices.slice(0, 5).map((item) => <button type="button" className="office-work-row ui-press" key={item.id} onClick={() => setNotice(item)}>
          <Bell size={14} /><span><strong>{item.title}</strong><small>{item.summary}</small></span><ArrowUpRight size={12} />
        </button>)}
      </section>}
      {taskClient && (task || draft) && <TaskEditor key={task?.id ?? 'draft'} task={task} draft={draft ?? {}} access={access} people={people}
        meSeatId={meSeatId} onSource={(source, anchor) => { setTaskId(undefined); onMessage(source.channelId, source.messageId, anchor) }}
        onClose={() => { setTaskId(undefined); onDraft(null) }} onSave={(patch) => task ? taskClient.update(task.id, patch)
          : taskClient.create({ status: taskClient.board.defaultStatus, ...patch, roomId: draft?.roomId, createdBy: access.actorId, sourceMessage: draft?.sourceMessage })} />}
      {doc && !editingDoc && <Dialog open onOpenChange={(open) => { if (!open) setDocId(undefined) }}>
        <DialogContent className="max-h-[84vh] max-w-[720px] overflow-y-auto">
          <DialogHeader><DialogTitle>{doc.title}</DialogTitle><DialogDescription>{documentPath(doc).join(' / ')}</DialogDescription></DialogHeader>
          {(doc.format === 'markdown' || doc.format === 'rich') ? <article><ViewerMarkdown content={doc.content ?? ''} format={doc.format} /></article> : (() => {
            const url = documentUrl(doc.url)
            return url ? <a className="text-ui-body text-primary underline" href={url} target="_blank" rel="noreferrer">打开外部文档</a> : <p>文档链接不可用</p>
          })()}
          {doc.origin === 'local' && <DialogFooter><Button type="button" size="sm" variant="outline" onClick={() => setEditingDoc(true)}>编辑文档</Button></DialogFooter>}
        </DialogContent>
      </Dialog>}
      {doc && editingDoc && docClient && <DocEditorDialog doc={doc} records={docs} location={documentPath(doc)} onClose={() => setEditingDoc(false)}
        onSave={async (patch) => { await docClient.update(doc.id, patch); setEditingDoc(false) }} />}
      {newDoc && docClient && <DocEditorDialog doc={null} records={docs} location={room ? [room.workbench?.documentSpaces?.[0] ?? room.name] : []}
        onClose={() => setNewDoc(false)} onSave={async (patch) => { const saved = await docClient.create(patch); setNewDoc(false); setDocId(saved.id) }} />}
      {notice && <Dialog open onOpenChange={(open) => { if (!open) setNotice(undefined) }}>
        <DialogContent><DialogHeader><DialogTitle>{notice.title}</DialogTitle><DialogDescription>{notice.summary ?? notice.sourceId}</DialogDescription></DialogHeader>
          <DialogFooter><Button type="button" size="sm" onClick={async () => {
            try { await noticeClient?.markRead([notice.id]); setUnread((ids) => ids.filter((id) => id !== notice.id)); setNotice(undefined) }
            catch { setError('无法标记已读，请重试。'); setNotice(undefined) }
          }}><Check /> 标记已读</Button></DialogFooter>
        </DialogContent>
      </Dialog>}
    </div>
  )
}
