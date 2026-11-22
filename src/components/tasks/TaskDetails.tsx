import { useState } from 'react'
import type { TaskBoardDefinition, TaskClient, TaskPatch, TaskRecord } from '@/lib/tasks/types'
import { canMoveTask } from '@/lib/tasks/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
export function TaskDetails({ task, board, client, close, refresh }: { task: TaskRecord; board: TaskBoardDefinition; client: TaskClient; close: () => void; refresh: () => Promise<void> }) {
  const [title, setTitle] = useState(task.title), [status, setStatus] = useState(task.status), [due, setDue] = useState(task.due ?? ''), [attrs, setAttrs] = useState(task.attrs)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [confirmDelete, setConfirmDelete] = useState(false)
  const manage = task.canManage !== false, edit = task.canEdit !== false
  async function save() { setBusy(true); try { const patch: TaskPatch = { status, attrs, revision: task.revision }; if (manage) { patch.title = title; patch.due = due || null } await client.update(task.id, patch); await refresh(); close() } catch (e) { setError(e instanceof Error ? e.message : '保存失败') } finally { setBusy(false) } }
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) close() }}><DialogContent className="max-h-[85vh] max-w-[540px] overflow-y-auto"><DialogHeader><DialogTitle>任务详情</DialogTitle></DialogHeader>
    <label className="grid gap-1 text-ui-label">任务标题<Input disabled={!edit || !manage} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
    <p className="text-ui-label text-muted-foreground">负责人：{task.assigneeName ?? '未指派'}</p>
    <Select disabled={!edit} value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{board.statuses.filter((s) => s.id === task.status || canMoveTask(board, task.status, s.id)).map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent></Select>
    <label className="grid gap-1 text-ui-label">截止日期<Input disabled={!edit || !manage} type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>
    {board.fields.map((field) => <label key={field.id} className="grid gap-1 text-ui-label">{field.label}{field.required ? ' *' : ''}{field.type === 'select' ? <Select disabled={!edit} value={attrs[field.id] ?? ''} onValueChange={(value) => setAttrs({ ...attrs, [field.id]: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{field.options?.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select> : <Input disabled={!edit} type={field.type} value={attrs[field.id] ?? ''} onChange={(e) => setAttrs({ ...attrs, [field.id]: e.target.value })} />}</label>)}
    {task.reviewPending && <p className="text-ui-label">此任务待验收，请由发起人或管理者在办公室处理。</p>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <div className="flex justify-between gap-3">{task.canDelete !== false && <Button variant="destructive" disabled={busy} onClick={async () => { if (!confirmDelete) { setConfirmDelete(true); return } setBusy(true); try { await client.remove(task.id); await refresh(); close() } catch (e) { setError(e instanceof Error ? e.message : '删除失败') } finally { setBusy(false) } }}>{confirmDelete ? '确认删除任务' : '删除任务'}</Button>}{edit && <Button disabled={busy || !title.trim()} onClick={() => void save()}>保存修改</Button>}</div>
  </DialogContent></Dialog>
}
