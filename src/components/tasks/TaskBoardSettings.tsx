import { useState } from 'react'
import type { TaskBoardDefinition } from '@/lib/tasks/types'
import { validateBoard } from '@/lib/tasks/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function TaskBoardSettings({ board, save, close }: { board: TaskBoardDefinition; save: (value: TaskBoardDefinition) => Promise<void>; close: () => void }) {
  const [draft, setDraft] = useState(() => structuredClone(board))
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const statuses = [...draft.statuses], fields = [...draft.fields]
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) close() }}><DialogContent className="max-h-[85vh] max-w-[720px] overflow-y-auto">
    <DialogHeader><DialogTitle>当前公司任务看板设置</DialogTitle></DialogHeader>
    <p className="text-ui-label text-muted-foreground">此设置保存在 Mira。已有任务的状态须先清空再删除；各公司的规则独立。</p>
    <h3>状态列</h3>
    {statuses.map((status, index) => <div key={status.id} className="grid gap-2 rounded-md border p-3">
      <div className="flex gap-2"><Input aria-label="状态名称" value={status.label} onChange={(e) => { statuses[index] = { ...status, label: e.target.value }; setDraft({ ...draft, statuses }) }} />
        <Input aria-label="状态颜色" type="color" className="w-14" value={status.dot} onChange={(e) => { statuses[index] = { ...status, dot: e.target.value }; setDraft({ ...draft, statuses }) }} />
        <Button variant="ghost" onClick={() => setDraft({ ...draft, statuses: statuses.filter((s) => s.id !== status.id) })}>删除</Button></div>
      <div className="flex flex-wrap gap-3 text-ui-label"><label><input type="radio" name="defaultState" checked={draft.defaultStatus === status.id} onChange={() => setDraft({ ...draft, defaultStatus: status.id })} /> 默认列</label>
        {(['pending', 'active', 'completed'] as const).map((category, i) => <label key={category}><input type="radio" name={'category-' + status.id} checked={status.category === category} onChange={() => { statuses[index] = { ...status, category }; setDraft({ ...draft, statuses }) }} /> {['未开始', '进行中', '已完成'][i]}</label>)}</div>
      <details className="text-ui-label"><summary>允许移动到哪些列（当前：{status.transitions ? '指定列' : '全部列'}）</summary>
        <label className="mr-3"><input type="checkbox" checked={!status.transitions} onChange={(e) => { statuses[index] = { ...status, transitions: e.target.checked ? undefined : [] }; setDraft({ ...draft, statuses }) }} /> 全部</label>
        {statuses.filter((s) => s.id !== status.id).map((target) => <label key={target.id} className="mr-3"><input type="checkbox" disabled={!status.transitions} checked={status.transitions?.includes(target.id) ?? true} onChange={(e) => { statuses[index] = { ...status, transitions: e.target.checked ? [...status.transitions!, target.id] : status.transitions!.filter((id) => id !== target.id) }; setDraft({ ...draft, statuses }) }} /> {target.label}</label>)}</details>
    </div>)}
    <Button variant="outline" onClick={() => setDraft({ ...draft, statuses: [...statuses, { id: crypto.randomUUID(), label: '新状态', dot: '#64748b', category: 'pending' }] })}>添加状态列</Button>
    <h3>自定义字段</h3>
    {fields.map((field, index) => <div key={field.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
      <Input className="w-36" value={field.label} aria-label="字段名称" onChange={(e) => { fields[index] = { ...field, label: e.target.value }; setDraft({ ...draft, fields }) }} />
      {(['text', 'number', 'date', 'select'] as const).map((type, i) => <label className="text-ui-label" key={type}><input type="radio" name={'type-' + field.id} checked={field.type === type} onChange={() => { fields[index] = { ...field, type }; setDraft({ ...draft, fields }) }} /> {['文本', '数字', '日期', '选项'][i]}</label>)}
      <label className="text-ui-label"><input type="checkbox" checked={field.required ?? false} onChange={(e) => { fields[index] = { ...field, required: e.target.checked }; setDraft({ ...draft, fields }) }} /> 必填</label>
      {field.type === 'select' && <Input placeholder="选项用逗号分隔" value={field.options?.join(',') ?? ''} onChange={(e) => { fields[index] = { ...field, options: e.target.value.split(',') }; setDraft({ ...draft, fields }) }} />}
      <Button variant="ghost" onClick={() => setDraft({ ...draft, fields: fields.filter((f) => f.id !== field.id) })}>删除</Button>
    </div>)}
    <Button variant="outline" onClick={() => setDraft({ ...draft, fields: [...fields, { id: crypto.randomUUID(), label: '新字段', type: 'text' }] })}>添加字段</Button>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <Button disabled={busy} onClick={async () => { setBusy(true); try { validateBoard(draft); await save(draft); close() } catch (e) { setError(e instanceof Error ? e.message : '保存失败') } finally { setBusy(false) } }}>保存到 Mira</Button>
  </DialogContent></Dialog>
}
