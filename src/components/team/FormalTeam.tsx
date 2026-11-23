import { WorkspaceHeader } from '@/components/ui/workspace-header'
import { useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PRESENCE_META } from '@/data/office'
import type { TeamMember } from '@/lib/identity/types'

/** A read-only projection of the enterprise directory. Identity and authorization belong to the provider. */
export function FormalTeam({ members }: { members: TeamMember[] }) {
 const [query,setQuery]=useState('')
 const has=(value:string|undefined)=>Boolean(value?.trim())
 const showEmail=members.some(m=>has(m.email)),showCompany=members.some(m=>has(m.attrs['公司']))
 const roleName=(m:TeamMember)=>m.sourceRoleName || m.roleName || ''
 const showRole=members.some(m=>has(roleName(m)))
 const visible=members.filter(m=>[m.displayName,m.email,m.attrs['公司'],roleName(m)].some(v=>v?.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())))
 return <section className="workspace-view" data-team-directory>
  <WorkspaceHeader title="团队成员" description={`企业目录 · ${members.length} 位成员`}><div className="relative w-full sm:w-64"><Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"/><Input type="search" aria-label="搜索团队成员" placeholder="搜索姓名、公司或角色" className="h-8 pl-9" value={query} onChange={e=>setQuery(e.target.value)}/></div></WorkspaceHeader>
  <div className="workspace-content min-h-0 flex-1 overflow-auto py-3"><div className="overflow-hidden rounded-lg border border-border bg-background"><Table><TableHeader className="bg-muted/50"><TableRow><TableHead className="pl-4">姓名</TableHead>{showEmail&&<TableHead>邮箱</TableHead>}{showCompany&&<TableHead>公司</TableHead>}{showRole&&<TableHead>角色</TableHead>}<TableHead>状态</TableHead></TableRow></TableHeader><TableBody>{visible.map(m=><TableRow key={m.id}><TableCell className="pl-4 font-medium">{m.displayName}</TableCell>{showEmail&&<TableCell className="text-muted-foreground">{m.email||'—'}</TableCell>}{showCompany&&<TableCell>{m.attrs['公司']||'—'}</TableCell>}{showRole&&<TableCell>{roleName(m)||'—'}</TableCell>}<TableCell><span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full" style={{background:PRESENCE_META[m.presence].color}}/>{PRESENCE_META[m.presence].label}</span></TableCell></TableRow>)}{!visible.length&&<TableRow><TableCell colSpan={2+Number(showEmail)+Number(showCompany)+Number(showRole)} className="py-8 text-center text-muted-foreground">没有符合搜索条件的成员</TableCell></TableRow>}</TableBody></Table></div></div>
 </section>
}
