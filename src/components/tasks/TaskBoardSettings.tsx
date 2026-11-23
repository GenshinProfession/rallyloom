import { useState } from 'react'
import { Columns3, Plus, Trash2, Check, ListFilter, ArrowRight } from 'lucide-react'
import type { TaskBoardDefinition } from '@/lib/tasks/types'
import { validateBoard } from '@/lib/tasks/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import './board-settings.css'

type Status = TaskBoardDefinition['statuses'][number]
type Field = TaskBoardDefinition['fields'][number]
export function TaskBoardSettings({ board, save, close }: { board: TaskBoardDefinition; save: (value: TaskBoardDefinition) => Promise<void>; close: () => void }) {
  const [draft, setDraft] = useState(() => structuredClone(board))
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [tab,setTab]=useState<'statuses'|'fields'>('statuses')
  const [expanded,setExpanded]=useState<string>()
  const patchStatus=(id:string,patch:Partial<Status>)=>setDraft(current=>({...current,statuses:current.statuses.map(status=>status.id===id?{...status,...patch}:status)}))
  const patchField=(id:string,patch:Partial<Field>)=>setDraft(current=>({...current,fields:current.fields.map(field=>field.id===id?{...field,...patch}:field)}))
  function removeStatus(id:string){
    if(draft.statuses.length===1){setError('至少保留一个状态列。');return}
    const statuses=draft.statuses.filter(status=>status.id!==id).map(status=>({...status,transitions:status.transitions?.filter(target=>target!==id)}))
    setDraft({...draft,statuses,defaultStatus:draft.defaultStatus===id?statuses[0].id:draft.defaultStatus});setError('')
  }
  return <Dialog open onOpenChange={open=>{if(!open&&!busy)close()}}><DialogContent className="board-settings-dialog">
    <DialogHeader><DialogTitle>任务看板设置</DialogTitle><DialogDescription>配置当前公司的状态流转与任务字段，保存后同步到企业系统。</DialogDescription></DialogHeader>
    <div className="board-settings-tabs" role="tablist" aria-label="看板设置分类">
      <button role="tab" aria-selected={tab==='statuses'} onClick={()=>setTab('statuses')}><Columns3 size={15}/>状态列 <span>{draft.statuses.length}</span></button>
      <button role="tab" aria-selected={tab==='fields'} onClick={()=>setTab('fields')}><ListFilter size={15}/>自定义字段 <span>{draft.fields.length}</span></button>
    </div>
    <div className="board-settings-body" aria-busy={busy}><fieldset disabled={busy}>
    {tab==='statuses' ? <>
      <p className="board-settings-hint">每列可独立配置流转范围；已有任务的列需先清空才能删除。</p>
      {draft.statuses.map(status=><section key={status.id} className="board-setting-card">
        <div className="board-setting-row"><label className="board-status-color" style={{background:status.dot}} title="状态颜色"><input aria-label="状态颜色" type="color" value={status.dot} onChange={event=>patchStatus(status.id,{dot:event.target.value})}/></label>
          <Input aria-label="状态名称" value={status.label} onChange={event=>patchStatus(status.id,{label:event.target.value})}/>
          <Button variant="ghost" size="icon" aria-label={'删除状态 '+status.label} onClick={()=>removeStatus(status.id)}><Trash2 size={15}/></Button>
        </div>
        <div className="board-setting-row board-setting-meta"><Select value={status.category??'pending'} onValueChange={value=>patchStatus(status.id,{category:value as Status['category']})}><SelectTrigger aria-label={'状态类别 '+status.label}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="pending">未开始</SelectItem><SelectItem value="active">进行中</SelectItem><SelectItem value="completed">已完成</SelectItem></SelectContent></Select>
          <button className="board-default-toggle" aria-pressed={draft.defaultStatus===status.id} onClick={()=>setDraft({...draft,defaultStatus:status.id})}><Check size={13}/>默认列</button>
          <button className="board-transition-toggle" aria-expanded={expanded===status.id} onClick={()=>setExpanded(expanded===status.id?undefined:status.id)}><ArrowRight size={13}/>{status.transitions?'指定流转':'可流转至全部列'}</button>
        </div>
        {expanded===status.id && <div className="board-transition-options"><label>允许流转至所有状态<Switch checked={!status.transitions} onCheckedChange={checked=>patchStatus(status.id,{transitions:checked?undefined:[]})}/></label>
          {status.transitions && <div>{draft.statuses.filter(target=>target.id!==status.id).map(target=><button key={target.id} aria-pressed={status.transitions?.includes(target.id)} onClick={()=>patchStatus(status.id,{transitions:status.transitions!.includes(target.id)?status.transitions!.filter(id=>id!==target.id):[...status.transitions!,target.id]})}><i style={{background:target.dot}}/>{target.label}{status.transitions?.includes(target.id)&&<Check size={12}/>}</button>)}</div>}
        </div>}
      </section>)}
      <Button variant="outline" className="board-add" disabled={draft.statuses.length>=32} onClick={()=>setDraft({...draft,statuses:[...draft.statuses,{id:crypto.randomUUID(),label:'新状态',dot:'#64748b',category:'pending'}]})}><Plus size={14}/>添加状态列</Button>
    </> : <>
      <p className="board-settings-hint">按业务需要增加字段，任务表单会同步显示。</p>
      {draft.fields.map(field=><section className="board-setting-card" key={field.id}><div className="board-setting-row"><Input aria-label="字段名称" value={field.label} onChange={event=>patchField(field.id,{label:event.target.value})}/><Button variant="ghost" size="icon" aria-label={'删除字段 '+field.label} onClick={()=>setDraft({...draft,fields:draft.fields.filter(value=>value.id!==field.id)})}><Trash2 size={15}/></Button></div>
        <div className="board-setting-row board-setting-meta"><Select value={field.type} onValueChange={value=>patchField(field.id,{type:value as Field['type']})}><SelectTrigger aria-label={'字段类型 '+field.label}><SelectValue/></SelectTrigger><SelectContent>{(['text','number','date','select'] as const).map((type,index)=><SelectItem key={type} value={type}>{['文本','数字','日期','选项'][index]}</SelectItem>)}</SelectContent></Select><label className="board-field-required">必填<Switch checked={field.required??false} onCheckedChange={checked=>patchField(field.id,{required:checked})}/></label></div>
        {field.type==='select'&&<Input aria-label="字段选项" placeholder="选项用逗号分隔" value={field.options?.join(',')??''} onChange={event=>patchField(field.id,{options:event.target.value.split(',')})}/>}
      </section>)}
      {!draft.fields.length&&<div className="board-fields-empty"><ListFilter size={24}/><strong>按工作方式定义字段</strong><span>例如项目、工时、交付日期</span></div>}
      <Button variant="outline" className="board-add" disabled={draft.fields.length>=32} onClick={()=>setDraft({...draft,fields:[...draft.fields,{id:crypto.randomUUID(),label:'新字段',type:'text'}]})}><Plus size={14}/>添加字段</Button>
    </>}
    </fieldset></div>
    <footer className="board-settings-footer">{error&&<p role="alert">{error}</p>}<Button variant="outline" disabled={busy} onClick={close}>取消</Button><Button disabled={busy} onClick={async()=>{setBusy(true);setError('');try{const value={...draft,fields:draft.fields.map(field=>({...field,options:field.options?.map(option=>option.trim()).filter(Boolean)}))};validateBoard(value);await save(value);close()}catch(cause){setError(cause instanceof Error?cause.message:'保存失败')}finally{setBusy(false)}}}>{busy?'保存中…':'保存设置'}</Button></footer>
  </DialogContent></Dialog>
}
