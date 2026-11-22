import { useState } from 'react'
import { Search } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PRESENCE_META } from '@/data/office'
import type { ProviderRoleSettings, TeamMember } from '@/lib/identity/types'
import type { MemberAction } from '@/lib/store/workspace-binding'

export function FormalTeam({ members, onManage, roleSettings, onSaveSettings }: {
  members: TeamMember[]
  onManage?: (id: string, action: MemberAction) => Promise<void>
  roleSettings?: ProviderRoleSettings
  onSaveSettings?: (values: Record<string, string>) => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null)
  const [draftSettings, setDraftSettings] = useState<Record<string, string> | null>(null)
  const [resetPending, setResetPending] = useState(false)
  const term = query.trim().toLowerCase()
  const visible = members.filter(({ displayName, email, attrs, sourceRoleName, roleName }) =>
    [displayName, email, attrs['公司'], sourceRoleName, roleName].some((value) => value?.toLowerCase().includes(term)),
  )

  async function manage(member: TeamMember, action: MemberAction) {
    const actions = members.find(({ id }) => id === member.id)?.memberActions
    if (!onManage || !actions || busy) return
    const allowed = action.kind === 'remove' ? actions.canRemove : action.roleId === null
      ? actions.canResetRole : actions.roleOptions.some(({ id }) => id === action.roleId)
    if (!allowed) return
    setBusy(true)
    setError('')
    try {
      await onManage(member.id, action)
      setRemoveTarget(null)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '未能更新成员，请重试。')
    } finally {
      setBusy(false)
    }
  }

  async function saveSettings(values: Record<string, string>) {
    if (!onSaveSettings || busy) return
    setBusy(true)
    setError('')
    try {
      await onSaveSettings(values)
      setDraftSettings(null)
      setResetPending(false)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '未能保存角色配置，请重试。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-ui-title font-semibold">团队成员</h1>
          <p className="mt-1 text-ui-meta text-muted-foreground">企业目录 · {members.length} 位成员</p>
        </div>
        <label className="flex h-8 items-center gap-2 rounded-md border border-border bg-background px-2.5 text-muted-foreground focus-within:ring-2 focus-within:ring-ring/30">
          <Search size={14} aria-hidden="true" />
          <input type="search" aria-label="搜索团队成员" placeholder="搜索姓名、公司或角色" className="w-36 min-w-0 bg-transparent text-ui-body text-foreground outline-none" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        {roleSettings && onSaveSettings && !draftSettings && <button type="button" className="rounded-md border px-3 py-1.5 text-sm" disabled={busy || !!removeTarget}
          onClick={() => {
            setError('')
            setResetPending(false)
            setDraftSettings(Object.fromEntries(roleSettings.fields.filter((field) => !field.readOnly).map(({ id, value }) => [id, value])))
          }}>{roleSettings.title}</button>}
      </header>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {draftSettings && roleSettings && onSaveSettings && (
        <section className="max-h-[50vh] shrink-0 overflow-auto rounded-lg border p-4" aria-label={roleSettings.title}>
          <h2 className="font-semibold">{roleSettings.title}</h2>
          {roleSettings.description && <p className="my-2 text-sm text-muted-foreground">{roleSettings.description}</p>}
          {resetPending ? <p className="my-2 text-sm">保存后将恢复企业提供方的默认角色配置。</p> :
            <div className="grid gap-2 sm:grid-cols-2">
              {roleSettings.fields.map((field) => (
                <label key={field.id} className="flex items-center justify-between gap-2 text-sm">
                  {field.label}
                  <select className="rounded border bg-background p-1" value={draftSettings[field.id] ?? field.value} disabled={busy || field.readOnly}
                    onChange={(event) => setDraftSettings({ ...draftSettings, [field.id]: event.target.value })}>
                    {field.options.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
                  </select>
                </label>
              ))}
            </div>}
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            <button type="button" className="rounded-md border bg-primary px-3 py-1.5 text-primary-foreground" disabled={busy} onClick={() => void saveSettings(resetPending ? {} : draftSettings)}>
              {resetPending ? '确认恢复默认' : '保存配置'}
            </button>
            {roleSettings.canReset && <button type="button" className="underline" disabled={busy} onClick={() => setResetPending(!resetPending)}>
              {resetPending ? '返回编辑' : '恢复默认'}
            </button>}
            <button type="button" className="underline" disabled={busy} onClick={() => setDraftSettings(null)}>取消</button>
          </div>
        </section>
      )}
      {removeTarget && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm">
          <span>确认从工作区移除 {removeTarget.displayName}？</span>
          <button type="button" className="text-destructive underline" disabled={busy} onClick={() => void manage(removeTarget, { kind: 'remove' })}>确认移除</button>
          <button type="button" className="underline" disabled={busy} onClick={() => setRemoveTarget(null)}>取消</button>
        </div>
      )}
      <div className="min-h-0 overflow-auto rounded-lg border border-border bg-background">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="pl-4">姓名</TableHead>
              <TableHead>邮箱</TableHead>
              <TableHead>公司</TableHead>
              <TableHead>账号角色</TableHead>
              <TableHead>工作区角色</TableHead>
              <TableHead>状态</TableHead>
              {onManage && <TableHead>管理</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((member) => (
              <TableRow key={member.id}>
                <TableCell className="pl-4 font-medium">{member.displayName}</TableCell>
                <TableCell className="text-muted-foreground">{member.email || '—'}</TableCell>
                <TableCell>{member.attrs['公司'] || '—'}</TableCell>
                <TableCell>{member.sourceRoleName ?? '—'}</TableCell>
                <TableCell>{member.roleName ?? '—'}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full" style={{ background: PRESENCE_META[member.presence].color }} />{PRESENCE_META[member.presence].label}</span>
                </TableCell>
                {onManage && <TableCell>{member.memberActions && (
                  <div className="flex items-center gap-2">
                    {(member.memberActions.roleOptions.length > 0 || member.memberActions.canResetRole) &&
                      <select aria-label={`${member.displayName}的工作区角色`} className="rounded border bg-background p-1"
                        value={member.memberActions.selectedRoleId ?? ''} disabled={busy || !!removeTarget || !!draftSettings}
                        onChange={(event) => void manage(member, { kind: 'role', roleId: event.target.value || null })}>
                        <option value="" disabled={!member.memberActions.canResetRole}>{member.memberActions.canResetRole ? '跟随来源' : '选择角色'}</option>
                        {member.memberActions.roleOptions.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
                      </select>}
                    {member.memberActions.canRemove &&
                      <button type="button" className="text-destructive underline" disabled={busy || !!removeTarget || !!draftSettings} onClick={() => setRemoveTarget(member)}>移除</button>}
                  </div>
                )}</TableCell>}
              </TableRow>
            ))}
            {!visible.length && <TableRow><TableCell colSpan={onManage ? 7 : 6} className="py-8 text-center text-muted-foreground">没有符合搜索条件的成员</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}
