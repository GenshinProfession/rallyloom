/* Rallyloom — 团队管理
   四个页签：成员（承接身份 + 本地角色设置）、角色与权限（RBAC 矩阵）、接入管理（源系统与同步策略）、存储（超管）。
   「承接对方的数据，权限交由本系统设置」在这里落地：
   资料列（属性/邮箱/组）全部来自源系统同步（只读），角色列归本团队管（覆盖后同步不再改动）。 */

import { Fragment, useMemo, useState } from 'react'
import {
  ArrowLeftRight,
  CircleHelp,
  Copy,
  Info,
  KeyRound,
  Plug,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  UserMinus,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StorageSection } from '@/components/team/StorageSection'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { getConnector } from '@/lib/identity/connector'
import { can, PERMISSIONS, ROLES, ROLE_LABEL, sourceRoleMap } from '@/lib/identity/rbac'
import type { RoleId, SyncPolicy, TeamMember } from '@/lib/identity/types'
import { DATASOURCE_LABEL, type DatasourceConfig } from '@/lib/store/types'
import { cn } from '@/lib/utils'

const fmt = (iso: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))

const AVATAR_PALETTE = ['#3f4a5c', '#55617a', '#5f5768', '#4a5560', '#6b5f55', '#46525f']
const avatarColor = (name: string) =>
  AVATAR_PALETTE[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_PALETTE.length]

const ROLE_CHIP: Record<RoleId, string> = {
  owner: 'bg-[#fdf3e3] text-[#b45309] border-[#ecd9b5]',
  admin: 'bg-[#eaf3fe] text-[#2563eb] border-[#c9dcf8]',
  member: 'bg-muted text-foreground/70 border-border/70',
  guest: 'bg-[#f4f0f8] text-[#7c6bc4] border-[#ddd4ec]',
}

/* --------------------------------- 成员 ---------------------------------- */

function MemberRow({
  member,
  editable,
  onSetRole,
  onClearOverride,
  onRemove,
}: {
  member: TeamMember
  editable: boolean
  onSetRole: (role: RoleId) => void
  onClearOverride: () => void
  onRemove: () => void
}) {
  const connector = getConnector(member.connectorId)
  return (
    <TableRow className="hover:bg-muted/40">
      <TableCell className="py-1.5 pl-3">
        <div className="flex items-center gap-2">
          <span className="relative shrink-0">
            <Avatar className="size-[22px]">
              <AvatarFallback
                className="text-ui-meta font-semibold text-white"
                style={{ background: avatarColor(member.displayName) }}
              >
                {member.displayName.slice(0, 1)}
              </AvatarFallback>
            </Avatar>
            <span
              className="absolute -bottom-px -right-px size-[7px] rounded-full border-2 border-white"
              style={{
                background:
                  member.presence === 'online'
                    ? '#16a34a'
                    : member.presence === 'busy'
                      ? '#f59e0b'
                      : member.presence === 'away'
                        ? '#a1a1aa'
                        : '#d4d4d8',
              }}
            />
          </span>
          <div className="min-w-0">
            <div className="text-ui-body font-medium leading-tight">{member.displayName}</div>
            <div className="truncate text-ui-meta leading-tight text-muted-foreground">
              {member.email ?? '源系统未提供邮箱'}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell className="py-1.5">
        {Object.keys(member.attrs).length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {Object.entries(member.attrs).map(([k, v]) => (
              <Badge
                key={k}
                variant="outline"
                className="h-[15px] border-border/60 px-1 text-ui-meta font-medium text-muted-foreground"
              >
                {k} · {v}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-ui-meta text-muted-foreground/50">—（源系统无属性）</span>
        )}
      </TableCell>
      <TableCell className="py-1.5">
        <span className="text-ui-label text-muted-foreground">
          {connector?.name ?? member.connectorId}
        </span>
      </TableCell>
      <TableCell className="py-1.5">
        <div className="flex flex-wrap gap-1">
          {member.externalGroups.map((g) => (
            <Badge
              key={g}
              variant="outline"
              className="h-[15px] border-border/60 px-1 text-ui-meta font-medium text-muted-foreground"
            >
              {g}
            </Badge>
          ))}
        </div>
      </TableCell>
      <TableCell className="py-1.5">
        {editable ? (
          <div className="flex items-center gap-1.5">
            <Select value={member.role} onValueChange={(v) => onSetRole(v as RoleId)}>
              <SelectTrigger className="h-[22px] w-[86px] rounded-md border-border/70 bg-white px-2 text-ui-label shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="text-ui-label">
                {ROLES.map((r) => (
                  <SelectItem key={r.id} value={r.id} className="text-ui-label">
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {member.localRoleOverride && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={onClearOverride}
                    className="text-ui-meta text-[#2563eb] hover:underline"
                  >
                    跟随同步
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-ui-meta">
                  已本地覆盖角色；点此清除，恢复外部组映射（{ROLE_LABEL[member.role]} → 组映射）
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        ) : (
          <Badge variant="outline" className={cn('h-[18px] px-1.5 text-ui-meta', ROLE_CHIP[member.role])}>
            {ROLE_LABEL[member.role]}
          </Badge>
        )}
      </TableCell>
      <TableCell className="py-1.5">
        <span className="tabular text-ui-meta text-muted-foreground">{fmt(member.syncedAt)}</span>
      </TableCell>
      <TableCell className="py-1.5 pr-3 text-right">
        {editable && (
          <div className="flex items-center justify-end gap-1">
            {member.localRoleOverride && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 text-muted-foreground hover:text-foreground"
                    onClick={onClearOverride}
                  >
                    <ArrowLeftRight className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left" className="text-ui-meta">
                  恢复为外部组映射的角色
                </TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 text-muted-foreground hover:text-red-500"
                  onClick={onRemove}
                >
                  <UserMinus className="size-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-ui-meta">
                从团队移除（外部系统重新登录时按 JIT 策略决定是否回来）
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </TableCell>
    </TableRow>
  )
}

/* ------------------------------ 角色与权限 -------------------------------- */

function RolesSection() {
  const groups = [...new Set(PERMISSIONS.map((p) => p.group))]
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        {ROLES.map((r) => (
          <div key={r.id} className="rounded-lg border border-border/70 bg-white px-3 py-2.5">
            <Badge variant="outline" className={cn('h-[19px] px-1.5 text-ui-meta', ROLE_CHIP[r.id])}>
              {r.name}
            </Badge>
            <div className="mt-1.5 text-ui-meta leading-relaxed text-muted-foreground">{r.note}</div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-border/70 bg-white">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-7 bg-muted/50 pl-3 text-ui-meta font-medium text-muted-foreground">
                权限
              </TableHead>
              {ROLES.map((r) => (
                <TableHead
                  key={r.id}
                  className="h-7 bg-muted/50 text-center text-ui-meta font-medium text-muted-foreground"
                >
                  {r.name}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g) => (
              <Fragment key={g}>
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={5}
                    className="eyebrow bg-[#fafafa] py-1 pl-3 text-muted-foreground"
                  >
                    {g}
                  </TableCell>
                </TableRow>
                {PERMISSIONS.filter((p) => p.group === g).map((p) => (
                  <TableRow key={p.id} className="hover:bg-muted/30">
                    <TableCell className="py-1.5 pl-3 text-ui-label">{p.name}</TableCell>
                    {ROLES.map((r) => (
                      <TableCell key={r.id} className="py-1.5 text-center">
                        {p.roles.includes(r.id) ? (
                          <ShieldCheck className="inline size-3 text-[#16a34a]" strokeWidth={2.2} />
                        ) : (
                          <span className="text-ui-meta text-muted-foreground/40">—</span>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="px-1 text-ui-meta leading-relaxed text-muted-foreground/80">
        矩阵由角色定义固定；「本地设置」只改成员挂的角色，不改动矩阵本身。源系统同步来的身份先按该源的组映射拿默认角色，
        管理员可在「成员」页覆盖，覆盖后每次登录同步资料但不再重置角色。
      </p>
    </div>
  )
}

/* -------------------------------- 身份源 --------------------------------- */

function ConnectorCard({
  connectorId,
  team,
  policy,
  editable,
  onUpdatePolicy,
  onConfigure,
}: {
  connectorId: string
  team: TeamMember[]
  policy: SyncPolicy
  editable: boolean
  onUpdatePolicy: (patch: Partial<SyncPolicy>) => void
  onConfigure: () => void
}) {
  const c = getConnector(connectorId)
  if (!c) return null
  const members = team.filter((m) => m.connectorId === c.id)
  const lastSync = members.reduce(
    (acc, m) => (m.syncedAt > acc ? m.syncedAt : acc),
    members[0]?.syncedAt ?? '',
  )
  const connected = c.status === 'mock' || c.status === 'connected'

  const switches: { key: PolicySwitchKey; label: string; note: string }[] = [
    { key: 'jitProvisioning', label: '登录即自动开通（JIT）', note: '新身份授权成功后自动进入团队' },
    { key: 'syncProfile', label: '自动同步资料', note: '每次登录刷新属性与外部组（源系统有什么就承接什么）' },
    { key: 'allowLocalOverride', label: '允许本地覆盖角色', note: '关闭则完全跟随外部组映射' },
  ]

  return (
    <div className="rounded-xl border border-border/70 bg-white p-3.5">
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            'flex size-8 items-center justify-center rounded-lg text-ui-body font-semibold',
            connected ? 'bg-[#eef4fe] text-[#2563eb]' : 'bg-muted text-muted-foreground',
          )}
        >
          <Plug className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-ui-section font-medium">{c.name}</span>
            <span className="text-ui-meta font-medium tracking-wide text-muted-foreground/70">
              {c.protocol.toUpperCase()}
            </span>
          </div>
          <div className="mt-0.5 text-ui-label leading-snug text-muted-foreground">{c.note}</div>
        </div>
        {connected ? (
          <Badge variant="outline" className={cn('text-ui-meta', CHIP_OK)}>
            已连接 · {members.length} 人
          </Badge>
        ) : (
          <Button variant="outline" size="sm" className="h-6 px-2 text-ui-meta" onClick={onConfigure}>
            <Settings2 className="mr-1 size-3" />
            配置
          </Button>
        )}
      </div>

      {connected && (
        <>
          <Separator className="my-3" />
          <div className="space-y-2">
            {switches.map((s) => {
              const control = (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-ui-label">{s.label}</span>
                  <Switch
                    checked={Boolean(policy[s.key])}
                    onCheckedChange={(v) => onUpdatePolicy({ [s.key]: v } as Partial<SyncPolicy>)}
                    disabled={!editable}
                    className="scale-[0.85]"
                  />
                </div>
              )
              return (
                <Tooltip key={s.key}>
                  <TooltipTrigger asChild>
                    <div>{control}</div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-ui-meta">
                    {s.note}
                    {!editable && '（需要「配置身份源与同步策略」权限）'}
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </div>
          <div className="mt-3 flex items-center justify-between text-ui-meta text-muted-foreground">
            <span>
              最近同步 <span className="tabular">{lastSync ? fmt(lastSync) : '—'}</span>
            </span>
            <span>
              组映射：{Object.keys(sourceRoleMap(policy, c.id)).length} 条
              {policy.roleMaps?.[c.id] ? '（源专属）' : ''} · 默认「成员」
            </span>
          </div>
        </>
      )}
    </div>
  )
}

const CHIP_OK = 'border-[#b7d7b7] bg-[#eaf6ea] text-[#16a34a]'

/** 可在身份源卡片上直接切换的三个策略开关 */
type PolicySwitchKey = 'jitProvisioning' | 'syncProfile' | 'allowLocalOverride'

/* --------------------------------- 页面 ---------------------------------- */

export function TeamManage({
  team,
  me,
  policy,
  datasource,
  connError,
  storageBusy,
  onTryConnect,
  onUpdatePolicy,
  onSetRole,
  onClearOverride,
  onRemove,
}: {
  team: TeamMember[]
  me: TeamMember
  policy: SyncPolicy
  datasource: DatasourceConfig
  connError: string | null
  storageBusy: boolean
  onTryConnect: (config: DatasourceConfig) => Promise<boolean>
  onUpdatePolicy: (patch: Partial<SyncPolicy>) => void
  onSetRole: (memberId: string, role: RoleId) => void
  onClearOverride: (memberId: string) => void
  onRemove: (memberId: string) => void
}) {
  const [query, setQuery] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [oidcOpen, setOidcOpen] = useState(false)

  const editableRole = can(me.role, 'members.role')
  const editableSso = can(me.role, 'sso.configure')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return team
    return team.filter(
      (m) =>
        m.displayName.toLowerCase().includes(q) ||
        (m.email ?? '').toLowerCase().includes(q) ||
        Object.entries(m.attrs).some(([, v]) => v.toLowerCase().includes(q)) ||
        m.externalGroups.some((g) => g.toLowerCase().includes(q)),
    )
  }, [team, query])

  const connectorsInUse = [...new Set(team.map((m) => m.connectorId))]

  return (
    <div className="workspace-view overflow-y-auto bg-[#f3f3f2]" data-team="root">
      <header className="workspace-header justify-between border-b border-border/70">
        <div className="min-w-0">
          <h1 className="text-ui-title font-semibold">团队管理</h1>
          <p className="truncate text-ui-meta text-muted-foreground">
            {team.length} 位成员 · {connectorsInUse.length} 个接入源 · 数据源{' '}
            {DATASOURCE_LABEL[datasource.kind]} · 当前身份 {me.displayName}（{ROLE_LABEL[me.role]}）
            {me.localRoleOverride ? ' · 本地设置' : ' · 外部组映射'}
          </p>
        </div>
        {can(me.role, 'members.invite') && (
          <Button
            size="sm"
            className="h-7 rounded-md bg-[#2563eb] px-2.5 text-ui-label hover:bg-[#1d4ed8]"
            onClick={() => setInviteOpen(true)}
          >
            <Plus className="mr-1 size-3" />
            邀请成员
          </Button>
        )}
      </header>

      <div className="workspace-content flex-1 py-3">
        <Tabs defaultValue="members" className="gap-3">
          <TabsList className="h-[26px] rounded-md bg-muted p-[2px]">
            <TabsTrigger value="members" className="h-[22px] px-3 text-ui-label">
              成员
            </TabsTrigger>
            <TabsTrigger value="roles" className="h-[22px] px-3 text-ui-label">
              角色与权限
            </TabsTrigger>
            <TabsTrigger value="sso" className="h-[22px] px-3 text-ui-label">
              接入管理
            </TabsTrigger>
            {can(me.role, 'storage.configure') && (
              <TabsTrigger value="storage" className="h-[22px] px-3 text-ui-label">
                存储
              </TabsTrigger>
            )}
          </TabsList>

          {/* 成员 */}
          <TabsContent value="members" className="mt-3">
            <div className="mb-2 flex items-center gap-2">
              <div className="relative w-[220px]">
                <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/70" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索姓名、邮箱、属性或组"
                  className="h-7 rounded-md border-border/70 bg-white pl-[26px] text-ui-label"
                />
              </div>
              <span className="text-ui-meta text-muted-foreground/70">
                姓名/邮箱/属性由源系统同步，只读；角色由本团队设置
              </span>
            </div>
            <div className="w-full overflow-hidden rounded-lg border border-border/70 bg-white">
              <Table className="min-w-[740px]" data-team="members">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="bg-muted/50 pl-3">
                      成员
                    </TableHead>
                    <TableHead className="bg-muted/50">
                      属性（随源系统）
                    </TableHead>
                    <TableHead className="bg-muted/50">
                      身份源
                    </TableHead>
                    <TableHead className="bg-muted/50">
                      外部组
                    </TableHead>
                    <TableHead className="bg-muted/50">
                      角色
                    </TableHead>
                    <TableHead className="bg-muted/50">
                      同步于
                    </TableHead>
                    <TableHead className="bg-muted/50 pr-3" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((m) => (
                    <MemberRow
                      key={m.id}
                      member={m}
                      editable={editableRole}
                      onSetRole={(r) => onSetRole(m.id, r)}
                      onClearOverride={() => onClearOverride(m.id)}
                      onRemove={() => onRemove(m.id)}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* 角色与权限 */}
          <TabsContent value="roles" className="mt-3">
            <RolesSection />
          </TabsContent>

          {/* 身份源 */}
          <TabsContent value="sso" className="mt-3">
            <div className="space-y-2.5">
              {connectorsInUse.map((id) => (
                <ConnectorCard
                  key={id}
                  connectorId={id}
                  team={team}
                  policy={policy}
                  editable={editableSso}
                  onUpdatePolicy={onUpdatePolicy}
                  onConfigure={() => {}}
                />
              ))}
              <div className="eyebrow px-1 pt-1">可接入的外部系统（按《接入规范》实现适配器）</div>
              <div className="grid grid-cols-2 gap-2">
                {['oidc-standard', 'wecom', 'feishu', 'ldap-directory'].map((id) => {
                  const c = getConnector(id)
                  if (!c) return null
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => id === 'oidc-standard' && setOidcOpen(true)}
                      className="flex items-center gap-2.5 rounded-lg border border-dashed border-border/80 bg-white/60 px-3 py-2.5 text-left transition-colors hover:border-[#b9cdf1] hover:bg-[#f8fafd]"
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <KeyRound className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="text-ui-body font-medium">{c.name}</span>
                        <span className="mt-0.5 block truncate text-ui-meta text-muted-foreground">
                          {c.note}
                        </span>
                      </span>
                      <span className="text-ui-meta text-muted-foreground/60">接入</span>
                    </button>
                  )
                })}
              </div>
              <p className="px-1 text-ui-meta leading-relaxed text-muted-foreground/80">
                我们是承接方：源系统按《接入规范》写适配器，把人/组/成员推送进来；账号漫游场景由对方实现 OIDC
                + rallyloom:// 深链回调。规范本体与参考适配器见 agent-skill/（可直接交给任何 Agent 开发）。
              </p>
            </div>
          </TabsContent>

          {can(me.role, 'storage.configure') && (
            <TabsContent value="storage" className="mt-3">
              <StorageSection
                datasource={datasource}
                connError={connError}
                busy={storageBusy}
                onTryConnect={onTryConnect}
              />
            </TabsContent>
          )}

        </Tabs>
      </div>

      {/* 邀请成员 */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="w-[380px] rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-ui-section">邀请成员</DialogTitle>
            <DialogDescription className="text-ui-label leading-relaxed">
              推荐直接使用外部身份源：对方用授权登录即自动入队（JIT）。链接邀请作为无 IdP 时的兜底。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2.5">
            <div>
              <Label className="text-ui-label text-muted-foreground">邀请链接（演示）</Label>
              <div className="mt-1 flex items-center gap-1.5">
                <Input
                  readOnly
                  value="https://join.rallyloom.local/invite/demo-token-7f3a"
                  className="h-8 rounded-md bg-muted/60 text-ui-label"
                />
                <Button variant="outline" size="icon" className="size-8 shrink-0 rounded-md">
                  <Copy className="size-3.5" />
                </Button>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2.5">
              <Info className="mt-px size-3.5 shrink-0 text-[#2563eb]" />
              <p className="text-ui-meta leading-relaxed text-muted-foreground">
                真接入后：成员改由身份源目录驱动，邀请链接仅用于开通首个连接器权限；组织架构变更在下次登录时自动同步。
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-7 text-ui-label" onClick={() => setInviteOpen(false)}>
              关闭
            </Button>
            <Button size="sm" className="h-7 rounded-md bg-[#2563eb] px-3 text-ui-label hover:bg-[#1d4ed8]" onClick={() => setInviteOpen(false)}>
              生成邀请
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* OIDC 配置 */}
      <Dialog open={oidcOpen} onOpenChange={setOidcOpen}>
        <DialogContent className="w-[420px] rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-ui-section">配置 OIDC 标准连接器</DialogTitle>
            <DialogDescription className="text-ui-label leading-relaxed">
              Authorization Code + PKCE。桌面端不持有密钥，注册回调 URI
              <span className="tabular"> rallyloom://callback</span> 即可。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2.5">
            <div>
              <Label className="text-ui-label text-muted-foreground">Issuer</Label>
              <Input placeholder="https://sso.example.com/realms/rallyloom" className="mt-1 h-8 text-ui-label" />
            </div>
            <div>
              <Label className="text-ui-label text-muted-foreground">Client ID</Label>
              <Input placeholder="rallyloom-desktop" className="mt-1 h-8 text-ui-label" />
            </div>
            <div>
              <Label className="text-ui-label text-muted-foreground">Scopes</Label>
              <Input readOnly value="openid profile email groups" className="mt-1 h-8 bg-muted/60 text-ui-label" />
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2.5">
              <CircleHelp className="mt-px size-3.5 shrink-0 text-[#2563eb]" />
              <p className="text-ui-meta leading-relaxed text-muted-foreground">
                演示环境仅保存到本地；生产接入还需在 IdP 侧注册 rallyloom://callback，并约定 groups claim
                以驱动角色映射。
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-7 text-ui-label" onClick={() => setOidcOpen(false)}>
              取消
            </Button>
            <Button size="sm" className="h-7 rounded-md bg-[#2563eb] px-3 text-ui-label hover:bg-[#1d4ed8]" onClick={() => setOidcOpen(false)}>
              保存配置
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
