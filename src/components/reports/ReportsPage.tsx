import { RotateCw, FilePlus2, SlidersHorizontal, SquarePen, FileText, FolderOpen, CalendarDays } from 'lucide-react'
import { WorkspaceHeader } from '@/components/ui/workspace-header'
import { useEffect, useRef, useState } from 'react'
import { oa } from '@/lib/oa/clients'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { validateReportAnswers, validateReportConfig, type ReportAnswers, type ReportConfig, type ReportEntry, type ReportPage, type ReportTemplate } from '@/lib/reports/types'
import { LocalTemplateLibrary } from './LocalTemplateLibrary'
import './reports.css'
import { ReportTemplateEditor } from './ReportTemplateEditor'

export function ReportsPage({ scope, scopes, onScope, canWrite, actorId, storageKey }: { scope?: string; scopes?: { id: string; label: string }[]; onScope: (scope: string) => void; actorId: string; canWrite: boolean; storageKey: string }) {
 const [config,setConfig] = useState<ReportConfig | null>(null), [templateId,setTemplateId] = useState(''), [day,setDay] = useState('')
 const [page,setPage] = useState<ReportPage | null>(null), [selected,setSelected] = useState<ReportEntry | null>(null), [writing,setWriting] = useState(false)
 const [answers,setAnswers] = useState<ReportAnswers>({}), [dirty,setDirty] = useState(false), [error,setError] = useState(''), [busy,setBusy] = useState(false)
 const [localLibrary,setLocalLibrary]=useState(false)
 const [editor,setEditor] = useState<ReportTemplate | null>(null), [discard,setDiscard] = useState<(() => void) | null>(null)
 const epoch = useRef(0), busyRef = useRef(false), mounted = useRef(true)
 const template = config?.templates.find(t => t.id === templateId)
 const requestChange = (action: () => void) => { if (busyRef.current) return; if (dirty) setDiscard(() => action); else action() }
 function closeEntry() { setSelected(null); setWriting(false); setAnswers({}); setDirty(false) }
 async function loadConfig() { const data = await oa<ReportConfig>('GET','/reports/templates',undefined,scope); validateReportConfig(data); if (!mounted.current) return; setConfig(data); setTemplateId(id => data.templates.some(t => t.id === id) ? id : data.templates[0]?.id ?? ''); setDay(d => d || data.today) }
 useEffect(() => { mounted.current=true; void loadConfig().catch(e => { if (mounted.current) setError(e.message) }); return () => { mounted.current=false } },[scope])
 async function load(after = 0, append = false) {
  if (!templateId || !day) return
  const token = ++epoch.current; setBusy(true)
  try { const data = await oa<ReportPage>('GET',`/reports/entries?templateId=${encodeURIComponent(templateId)}&day=${day}&after=${after}&limit=100`,undefined,scope); if (token !== epoch.current) return; setPage(previous => append && previous ? { ...data, items:[...previous.items,...data.items] } : data); setError('') }
  catch (e) { if (token === epoch.current) setError(e instanceof Error ? e.message : '加载失败') }
  finally { if (token === epoch.current) setBusy(false) }
 }
 useEffect(() => { closeEntry(); setPage(null); void load(); return () => { epoch.current++ } },[scope,templateId,day])
 const schema = selected?.status === 'SUBMITTED' ? selected.template : template
 const editable = Boolean(canWrite && template?.canWrite && writing && (!selected || selected.canEdit && selected.status === 'DRAFT'))
 async function save(submit: boolean) {
  if (!template || !editable || busyRef.current) return
  busyRef.current=true; setBusy(true)
  try { validateReportAnswers(template,answers,submit); await oa('PUT',`/reports/entries/${encodeURIComponent(template.id)}/${day}`,{answers,submit,revision:selected?.revision ?? 0,templateRevision:template.revision},scope); if (!mounted.current) return; closeEntry(); await load() }
  catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : '保存失败') }
  finally { busyRef.current=false; if (mounted.current) setBusy(false) }
 }
 function choose(row: ReportEntry) { requestChange(() => { setSelected(row); setWriting(true); setAnswers(structuredClone(row.answers)); setDirty(false) }) }
 function write() { const mine=page?.items.find(r => r.authorId === actorId); if(mine){choose(mine);return} requestChange(() => {closeEntry();setWriting(true)}) }
 const newTemplate = () => setEditor({id:crypto.randomUUID(),name:'新汇报模板',cadence:'DAILY',enabled:true,revision:0,fields:[{id:'summary',label:'工作总结',type:'multiline',required:true}]})
 return <main data-reports="root" className="workspace-view reports-workspace">
  <Dialog open={Boolean(discard)} onOpenChange={open => {if(!open)setDiscard(null)}}><DialogContent><DialogHeader><DialogTitle>放弃未保存的汇报？</DialogTitle></DialogHeader><p className="text-ui-body text-muted-foreground">当前内容还未保存。</p><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDiscard(null)}>继续编辑</Button><Button variant="destructive" onClick={() => {const action=discard;setDiscard(null);setDirty(false);action?.()}}>放弃修改并继续</Button></div></DialogContent></Dialog>
  {localLibrary && <LocalTemplateLibrary storageKey={storageKey+':'+(scope??'company')} close={()=>setLocalLibrary(false)} publish={config?.canConfigure?async value=>{await oa('PUT',`/reports/templates/${value.id}`,value,scope);await loadConfig();setTemplateId(value.id);closeEntry()}:undefined}/ >}
  {editor && <ReportTemplateEditor template={editor} close={() => setEditor(null)} save={async value => {await oa('PUT',`/reports/templates/${value.id}`,value,scope);await loadConfig();setTemplateId(value.id);closeEntry()}} />}
  <WorkspaceHeader title="工作汇报" description="企业模板 · 工作记录与团队回顾">
   {config && templateId && <Select value={templateId} disabled={busy} onValueChange={value => requestChange(() => setTemplateId(value))}><SelectTrigger className="h-8 w-36 border-black/[0.06] bg-white text-ui-label"><SelectValue /></SelectTrigger><SelectContent>{config.templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}{!t.enabled?'（已停用）':''}</SelectItem>)}</SelectContent></Select>}
   {day && <Input aria-label="汇报日期" type="date" className="h-8 w-40 border-black/[0.06] bg-white text-ui-label" value={day} max={config?.today} disabled={busy} onChange={e => {const value=e.target.value;if(value)requestChange(() => setDay(value))}} />}
   {scopes && scopes.length>1 && <Select value={scope} disabled={busy} onValueChange={value => requestChange(() => onScope(value))}><SelectTrigger className="h-8 w-40 border-black/[0.06] bg-white text-ui-label"><SelectValue /></SelectTrigger><SelectContent>{scopes.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent></Select>}
   <Button size="sm" variant="toolbar" disabled={busy} onClick={() => requestChange(() => {closeEntry();void loadConfig().then(() => load()).catch(e=>setError(e.message))})}><RotateCw />刷新</Button>
   <Button size="sm" variant="toolbar" disabled={busy} onClick={()=>requestChange(()=>setLocalLibrary(true))}><FolderOpen/>本地模板</Button>
   {config?.canConfigure && <><Button size="sm" variant="toolbar" disabled={busy} onClick={() => requestChange(newTemplate)}><FilePlus2 />新增模板</Button>{template && <Button size="sm" variant="toolbar" disabled={busy} onClick={() => requestChange(() => setEditor(structuredClone(template)))}><SlidersHorizontal />模板设置</Button>}</>}
   {canWrite && template?.canWrite && <Button size="sm" variant="toolbar" disabled={busy} onClick={write}><SquarePen />写汇报</Button>}
  </WorkspaceHeader>
  {error && <p role="alert" className="px-4 text-destructive">{error}</p>}
  <div className="workspace-content flex min-h-0 flex-1 gap-3 py-3"><aside className="reports-list"><div className="reports-list-heading"><h2>汇报记录</h2><span>{page?.items.length??0}</span></div><p className="reports-period">{page ? `${page.periodStart} 至 ${page.periodEnd}` : '加载汇报'}{config ? ` · ${config.timeZone}` : ''}</p>{page?.items.length===0 && <p className="p-3 text-ui-label text-muted-foreground">当前周期暂无汇报。获分配模板的员工可保存草稿并提交。</p>}{page?.items.map(row => <button key={row.id} disabled={busy} onClick={() => choose(row)} aria-pressed={selected?.id===row.id} className="report-entry-card"><strong className="block text-ui-body">{row.authorName}</strong><span className="report-entry-meta">{row.periodStart}<i data-status={row.status}>{row.status==='SUBMITTED'?'已提交':'草稿'}</i></span></button>)}{page?.nextCursor != null && <Button variant="outline" disabled={busy} onClick={() => void load(page.nextCursor!,true)}>加载更多</Button>}</aside>
  <section className="reports-document">{writing && schema ? <div className="report-writing"><header className="report-writing-heading"><span className="report-origin-chip">企业模板</span><h2>{selected?.template.name ?? schema.name}{selected?` · ${selected.authorName}`:''}</h2><p className="text-ui-label text-muted-foreground"><CalendarDays size={13}/>{page?.periodStart} 至 {page?.periodEnd}{selected?.status==='SUBMITTED'?' · 已提交，内容已锁定':''}</p></header>{schema.fields.map((field,index) => <label key={field.id} className="grid gap-2 text-ui-body"><span>{field.label}{field.required?' *':''}</span>{field.type==='multiline'?<textarea aria-label={index===0?'工作汇报正文':field.label} disabled={!editable || busy} className="min-h-28 w-full rounded-md border bg-background p-3 leading-6 disabled:bg-muted/40" value={String(answers[field.id] ?? '')} onChange={e=>{setAnswers({...answers,[field.id]:e.target.value});setDirty(true)}}/>:field.type==='select'?<Select disabled={!editable || busy} value={String(answers[field.id] ?? '')} onValueChange={value=>{setAnswers({...answers,[field.id]:value});setDirty(true)}}><SelectTrigger aria-label={field.label}><SelectValue placeholder="请选择"/></SelectTrigger><SelectContent>{field.options?.map(option=><SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select>:<Input aria-label={field.label} disabled={!editable || busy} type={field.type==='number'?'number':field.type==='date'?'date':'text'} value={answers[field.id] ?? ''} onChange={e=>{setAnswers({...answers,[field.id]:field.type==='number'?(e.target.value===''?null:Number(e.target.value)):e.target.value});setDirty(true)}}/>}</label>)}{editable && <div className="flex justify-end gap-3"><Button variant="outline" disabled={busy || !dirty} onClick={()=>void save(false)}>保存草稿</Button><Button disabled={busy} onClick={()=>void save(true)}>提交汇报</Button></div>}</div>:<div className="reports-empty"><span className="reports-empty-symbol"><FileText size={28}/></span><strong>把工作的进展，留在这里</strong><p>{template?.canWrite?'从左侧选择一份汇报，或开始记录本期工作。':'从左侧选择员工汇报，查看进展与回顾。'}</p>{canWrite&&template?.canWrite&&<Button size="sm" variant="toolbar" onClick={write}><SquarePen/>写本期汇报</Button>}</div>}{!canWrite && <p className="reports-readonly-note">当前为查看模式，员工提交的内容保留原始记录。</p>}</section></div>
 </main>
}
