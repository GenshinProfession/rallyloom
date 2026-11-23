import { useState } from 'react'
import { FileText, Plus, Trash2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { validateReportTemplate, type ReportTemplate, type ReportField } from '@/lib/reports/types'
import './reports.css'
const fieldTypes = { text:'单行文本',multiline:'多行文本',number:'数字',date:'日期',select:'选项' } as const
export function ReportTemplateEditor({template,save,close,origin='企业模板',saveLabel='保存模板'}:{template:ReportTemplate;save:(t:ReportTemplate)=>Promise<void>;close:()=>void;origin?:string;saveLabel?:string}){
 const [draft,setDraft]=useState(()=>structuredClone(template)),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 function field(index:number,patch:Partial<ReportField>){setDraft(current=>({...current,fields:current.fields.map((f,i)=>i===index?{...f,...patch}:f)}))}
 return <Dialog open onOpenChange={open=>{if(!open&&!busy)close()}}><DialogContent className="report-template-dialog" data-report-template-editor>
  <DialogHeader className="report-template-header"><span className="report-template-symbol"><FileText size={20}/></span><div><DialogTitle>{draft.revision?'编辑汇报模板':'新增汇报模板'}</DialogTitle><DialogDescription>{origin} · 配置字段，右侧即时预览填写效果</DialogDescription></div></DialogHeader>
  <div className="report-template-body"><div className="report-template-settings">
   <label className="report-control-label">模板名称<Input disabled={busy} aria-label="模板名称" value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
   <div className="report-template-cadence" role="group" aria-label="汇报周期">{(['DAILY','WEEKLY','MONTHLY'] as const).map((cadence,i)=><button key={cadence} type="button" disabled={busy||draft.revision>0} aria-pressed={draft.cadence===cadence} onClick={()=>setDraft({...draft,cadence})}>{['日报','周报','月报'][i]}</button>)}</div>
   <label className="report-toggle"><span>启用模板</span><Switch aria-label="启用模板" disabled={busy} checked={draft.enabled} onCheckedChange={enabled=>setDraft({...draft,enabled})}/></label>
   <div className="report-fields-heading"><h3>填写字段</h3><span>{draft.fields.length} / 30</span></div>
   {draft.fields.map((f,index)=><section key={f.id} className="report-template-field"><div className="report-field-row"><span className="report-field-grip">{index+1}</span><Input disabled={busy} aria-label="汇报字段名称" value={f.label} onChange={e=>field(index,{label:e.target.value})}/><Select disabled={busy} value={f.type} onValueChange={type=>field(index,{type:type as ReportField['type']})}><SelectTrigger aria-label="字段类型"><SelectValue/></SelectTrigger><SelectContent>{Object.entries(fieldTypes).map(([type,label])=><SelectItem key={type} value={type}>{label}</SelectItem>)}</SelectContent></Select><Button size="icon" disabled={busy} variant="ghost" aria-label={`删除字段 ${f.label}`} onClick={()=>setDraft({...draft,fields:draft.fields.filter((_,i)=>i!==index)})}><Trash2/></Button></div>
    <label className="report-toggle report-required"><span>提交时必填</span><Switch aria-label={`必填 ${f.label}`} disabled={busy} checked={f.required??false} onCheckedChange={required=>field(index,{required})}/></label>
    {f.type==='select'&&<Input aria-label="字段选项" disabled={busy} placeholder="选项用逗号分隔" value={f.options?.join(',')??''} onChange={e=>field(index,{options:e.target.value.split(/[,，]/).map(v=>v.trim())})}/>}</section>)}
   <Button size="sm" disabled={busy||draft.fields.length>=30} variant="toolbar" className="report-add-field" onClick={()=>setDraft({...draft,fields:[...draft.fields,{id:crypto.randomUUID(),label:'新字段',type:'multiline'}]})}><Plus/>添加字段</Button>
  </div><aside className="report-template-preview"><span className="report-preview-eyebrow">填写预览</span><div className="report-preview-paper"><span className="report-origin-chip">{origin}</span><h3>{draft.name||'未命名模板'}</h3><p>{draft.cadence==='DAILY'?'每天':draft.cadence==='WEEKLY'?'每周':'每月'}记录工作进展</p>{draft.fields.map(f=><div className="report-preview-field" key={f.id}><label>{f.label||'未命名字段'}{f.required&&<i>*</i>}</label><div data-type={f.type}>{f.type==='select'?(f.options?.filter(Boolean).join(' / ')||'选择一个选项'):f.type==='date'?'年 / 月 / 日':f.type==='number'?'0':'请输入内容…'}</div></div>)}</div></aside></div>
  <footer className="report-template-footer"><p role={error?'alert':undefined} className={error?'report-template-error':''}>{error||'历史汇报保留提交时的模板版本。'}</p><Button size="sm" variant="toolbar" disabled={busy} onClick={close}>取消</Button><Button size="sm" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{validateReportTemplate(draft);await save(draft);close()}catch(e){setError(e instanceof Error?e.message:'保存失败')}finally{setBusy(false)}}}><Save/>{busy?'正在保存…':saveLabel}</Button></footer>
 </DialogContent></Dialog>
}
