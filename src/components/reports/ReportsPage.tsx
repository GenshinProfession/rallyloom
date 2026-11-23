import { useEffect, useRef, useState } from 'react'
import { oa } from '@/lib/oa/clients'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { validateReportAnswers, validateReportConfig, type ReportAnswers, type ReportConfig, type ReportEntry, type ReportPage, type ReportTemplate } from '@/lib/reports/types'
import { ReportTemplateEditor } from './ReportTemplateEditor'

export function ReportsPage({ scope, scopes, onScope, canWrite, actorId }: { scope?: string; scopes?: { id: string; label: string }[]; onScope: (scope: string) => void; actorId: string; canWrite: boolean }) {
 const [config,setConfig] = useState<ReportConfig | null>(null), [templateId,setTemplateId] = useState(''), [day,setDay] = useState('')
 const [page,setPage] = useState<ReportPage | null>(null), [selected,setSelected] = useState<ReportEntry | null>(null), [writing,setWriting] = useState(false)
 const [answers,setAnswers] = useState<ReportAnswers>({}), [dirty,setDirty] = useState(false), [error,setError] = useState(''), [busy,setBusy] = useState(false)
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
 return <main data-reports="root" className="workspace-view bg-[#f4f4f6]">
  <Dialog open={Boolean(discard)} onOpenChange={open => {if(!open)setDiscard(null)}}><DialogContent><DialogHeader><DialogTitle>放弃未保存的汇报？</DialogTitle></DialogHeader><p className="text-ui-body text-muted-foreground">当前内容还未保存。</p><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDiscard(null)}>继续编辑</Button><Button variant="destructive" onClick={() => {const action=discard;setDiscard(null);setDirty(false);action?.()}}>放弃修改并继续</Button></div></DialogContent></Dialog>
  {editor && <ReportTemplateEditor template={editor} close={() => setEditor(null)} save={async value => {await oa('PUT',`/reports/templates/${value.id}`,value,scope);await loadConfig();setTemplateId(value.id);closeEntry()}} />}
  <header className="workspace-header flex-wrap gap-2 border-b py-2"><div><h1 className="text-ui-title font-semibold">工作汇报</h1><p className="text-ui-label text-muted-foreground">按模板记录工作，提交后由有权限的同事查看</p></div><div className="ml-auto flex flex-wrap items-center gap-2">
   {config && templateId && <Select value={templateId} disabled={busy} onValueChange={value => requestChange(() => setTemplateId(value))}><SelectTrigger className="h-8 w-36 border-black/[0.06] bg-white text-ui-label"><SelectValue /></SelectTrigger><SelectContent>{config.templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}{!t.enabled?'（已停用）':''}</SelectItem>)}</SelectContent></Select>}
   {day && <Input aria-label="汇报日期" type="date" className="h-8 w-40 border-black/[0.06] bg-white text-ui-label" value={day} max={config?.today} disabled={busy} onChange={e => {const value=e.target.value;if(value)requestChange(() => setDay(value))}} />}
   {scopes && scopes.length>1 && <Select value={scope} disabled={busy} onValueChange={value => requestChange(() => onScope(value))}><SelectTrigger className="h-8 w-40 border-black/[0.06] bg-white text-ui-label"><SelectValue /></SelectTrigger><SelectContent>{scopes.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent></Select>}
   <Button size="sm" variant="toolbar" disabled={busy} onClick={() => requestChange(() => {closeEntry();void loadConfig().then(() => load()).catch(e=>setError(e.message))})}>刷新</Button>
   {config?.canConfigure && <><Button size="sm" variant="toolbar" disabled={busy} onClick={() => requestChange(newTemplate)}>新增模板</Button>{template && <Button size="sm" variant="toolbar" disabled={busy} onClick={() => requestChange(() => setEditor(structuredClone(template)))}>模板设置</Button>}</>}
   {canWrite && template?.canWrite && <Button size="sm" variant="toolbar" disabled={busy} onClick={write}>写汇报</Button>}
  </div></header>
  {error && <p role="alert" className="px-4 text-destructive">{error}</p>}
  <div className="workspace-content flex min-h-0 flex-1 gap-3 py-3"><aside className="w-64 shrink-0 overflow-auto rounded-lg border bg-white p-2"><p className="px-3 py-2 text-ui-label text-muted-foreground">{page ? `${page.periodStart} 至 ${page.periodEnd}` : '加载汇报'}{config ? ` · ${config.timeZone}` : ''}</p>{page?.items.length===0 && <p className="p-3 text-ui-label text-muted-foreground">当前周期暂无汇报。获分配模板的员工可保存草稿并提交。</p>}{page?.items.map(row => <button key={row.id} disabled={busy} onClick={() => choose(row)} className={`mb-2 block w-full rounded-md border p-3 text-left hover:bg-muted ${selected?.id===row.id?'border-primary bg-primary/5':''}`}><strong className="block text-ui-body">{row.authorName}</strong><span className="text-ui-label text-muted-foreground">{row.periodStart} · {row.status==='SUBMITTED'?'已提交':'草稿'}</span></button>)}{page?.nextCursor != null && <Button variant="outline" disabled={busy} onClick={() => void load(page.nextCursor!,true)}>加载更多</Button>}</aside>
  <section className="min-w-0 flex-1 overflow-auto rounded-lg border bg-white p-5">{writing && schema ? <div className="mx-auto grid max-w-3xl gap-5"><div><h2 className="text-ui-section font-semibold">{selected?.template.name ?? schema.name}{selected?` · ${selected.authorName}`:''}</h2><p className="text-ui-label text-muted-foreground">{page?.periodStart} 至 {page?.periodEnd}{selected?.status==='SUBMITTED'?' · 已提交，内容已锁定':''}</p></div>{schema.fields.map((field,index) => <label key={field.id} className="grid gap-2 text-ui-body"><span>{field.label}{field.required?' *':''}</span>{field.type==='multiline'?<textarea aria-label={index===0?'工作汇报正文':field.label} disabled={!editable || busy} className="min-h-28 w-full rounded-md border bg-background p-3 leading-6 disabled:bg-muted/40" value={String(answers[field.id] ?? '')} onChange={e=>{setAnswers({...answers,[field.id]:e.target.value});setDirty(true)}}/>:field.type==='select'?<Select disabled={!editable || busy} value={String(answers[field.id] ?? '')} onValueChange={value=>{setAnswers({...answers,[field.id]:value});setDirty(true)}}><SelectTrigger aria-label={field.label}><SelectValue placeholder="请选择"/></SelectTrigger><SelectContent>{field.options?.map(option=><SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select>:<Input aria-label={field.label} disabled={!editable || busy} type={field.type==='number'?'number':field.type==='date'?'date':'text'} value={answers[field.id] ?? ''} onChange={e=>{setAnswers({...answers,[field.id]:field.type==='number'?(e.target.value===''?null:Number(e.target.value)):e.target.value});setDirty(true)}}/>}</label>)}{editable && <div className="flex justify-end gap-3"><Button variant="outline" disabled={busy || !dirty} onClick={()=>void save(false)}>保存草稿</Button><Button disabled={busy} onClick={()=>void save(true)}>提交汇报</Button></div>}</div>:<p className="p-8 text-muted-foreground">从左侧选择汇报查看{template?.canWrite?'，或点击“写汇报”开始记录。':'。当前账号未获此模板的填写权限。'}</p>}{!canWrite && <p className="mt-6 text-ui-label text-muted-foreground">管理者只读查看，不能替员工填写或覆盖记录。</p>}</section></div>
 </main>
}
