import { useState } from 'react'
import { FilePlus2, FileText, Pencil, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { validateReportTemplate, type ReportTemplate } from '@/lib/reports/types'
import { ReportTemplateEditor } from './ReportTemplateEditor'
export function LocalTemplateLibrary({storageKey,publish,close}:{storageKey:string;publish?: (value:ReportTemplate)=>Promise<void>;close:()=>void}){
 const key='rallyloom:report-template-drafts:'+storageKey
 const [items,setItems]=useState<ReportTemplate[]>(()=>{try{const raw=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(raw)?raw.filter(value=>{try{validateReportTemplate(value);return true}catch{return false}}):[]}catch{return []}})
 const [editor,setEditor]=useState<ReportTemplate>(),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 function persist(next:ReportTemplate[]){localStorage.setItem(key,JSON.stringify(next));setItems(next)}
 if(editor)return <ReportTemplateEditor template={editor} origin="本地草稿" saveLabel="保存本地模板" close={()=>setEditor(undefined)} save={async value=>{persist([...items.filter(t=>t.id!==value.id),{...value,revision:0}])}}/>
 return <Dialog open onOpenChange={open=>{if(!open&&!busy)close()}}><DialogContent className="report-library-dialog"><DialogHeader><DialogTitle>本地模板</DialogTitle><DialogDescription>先在本机设计模板；发布到企业后，才能用于正式工作汇报。</DialogDescription></DialogHeader>
  <Button variant="toolbar" size="sm" className="justify-self-start" onClick={()=>setEditor({id:crypto.randomUUID(),name:'新汇报模板',cadence:'DAILY',enabled:true,revision:0,fields:[{id:'summary',label:'工作总结',type:'multiline',required:true}]})}><FilePlus2/>创建本地模板</Button>
  <div className="report-library-list">{!items.length&&<div className="reports-empty"><FileText size={28}/><strong>从一份适合团队的模板开始</strong><p>本地草稿不会改变企业的填写要求。</p></div>}{items.map(item=><div className="report-library-card" key={item.id}><FileText size={19}/><div><strong>{item.name}</strong><p>{item.cadence==='DAILY'?'日报':item.cadence==='WEEKLY'?'周报':'月报'} · {item.fields.length} 个字段</p></div><Button variant="ghost" size="sm" disabled={busy} onClick={()=>setEditor(item)}><Pencil/>编辑</Button>{publish&&<Button variant="toolbar" size="sm" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await publish(item);persist(items.filter(t=>t.id!==item.id))}catch(e){setError(e instanceof Error?e.message:'发布失败')}finally{setBusy(false)}}}><Upload/>发布到企业</Button>}<Button aria-label={`删除本地模板 ${item.name}`} variant="ghost" size="icon" disabled={busy} onClick={()=>{try{persist(items.filter(t=>t.id!==item.id))}catch{setError('本地模板无法保存，请检查磁盘空间。')}}}><Trash2/></Button></div>)}</div>
  {error&&<p role="alert" className="text-destructive">{error}</p>}<div className="flex justify-end"><Button variant="toolbar" size="sm" disabled={busy} onClick={close}>完成</Button></div>
 </DialogContent></Dialog>
}
