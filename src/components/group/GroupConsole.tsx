import { WorkspaceHeader } from '@/components/ui/workspace-header'
/* Rallyloom — 集团控制台（平台运维轴 · 可选管辖层）
   「合并租户」= 归属同一管辖体系的配置：数据仍按公司硬隔离，
   这里只做联邦目录与跨租户入口；集团超管不进任何公司成员表。
   不属任何集团的公司不带 groupId —— 这一层对它们完全不可见。 */

import { ArrowRight, Building2, Crown, ShieldCheck } from 'lucide-react'
import type { RoleId, TeamMember } from '@/lib/identity/types'
import { GROUP_TENANT_IDS, demoTenantSummary } from '@/lib/store/client'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const AVATAR_PALETTE = ['#3f4a5c', '#55617a', '#5f5768', '#4a5560', '#6b5f55', '#46525f']
const avatarColor = (name: string) =>
  AVATAR_PALETTE[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_PALETTE.length]

const ROLE_CHIP: Record<RoleId, string> = {
  owner: 'bg-[#fdf3e3] text-[#b45309] border-[#ecd9b5]',
  admin: 'bg-[#eaf3fe] text-[#2563eb] border-[#c9dcf8]',
  member: 'bg-muted text-foreground/70 border-border/70',
  guest: 'bg-[#f4f0f8] text-[#7c6bc4] border-[#ddd4ec]',
}

const COMPANY_CHIP: Record<string, string> = {
  星辰电商: 'bg-[#eaf3fe] text-[#2563eb] border-[#c9dcf8]',
  云岭智造: 'bg-[#eef7f0] text-[#3f7c4f] border-[#c9e8d2]',
  集团总部: 'bg-[#fdf3e3] text-[#b45309] border-[#ecd9b5]',
}

const ROLE_LABEL: Record<RoleId, string> = { owner: '超管', admin: '管理员', member: '成员', guest: '访客' }

const companyOf = (member: TeamMember) => member.attrs['公司'] ?? '集团总部'

export function GroupConsole({
  directory,
  groupName,
  onEnterWorkspace,
}: {
  /** 合并成员目录（各公司成员 + JIT 登录的集团超管） */
  directory: readonly TeamMember[]
  groupName: string
  onEnterWorkspace: (tenantId: string) => void
}) {
  const companies = GROUP_TENANT_IDS.map((id) => {
    const summary = demoTenantSummary(id)
    const members = directory.filter((m) => companyOf(m) === summary?.name)
    return {
      id,
      name: summary?.name ?? id,
      note: summary?.note,
      total: members.length,
      online: members.filter(({ presence }) => presence === 'online').length,
      headquarter: id === 'tenant-a',
    }
  })

  return (
    <main data-group="root" className="flex min-w-0 flex-1 flex-col bg-[#f4f4f6]">
      <WorkspaceHeader title="集团控制台" description={groupName}>
          <Badge variant="outline" className="h-[20px] shrink-0 gap-1 border-[#ecd9b5] bg-[#fdf3e3] px-2 text-[11px] text-[#b45309]">
            <ShieldCheck className="size-3" strokeWidth={1.7} />
            集团超管不进任何公司成员表
          </Badge>
      </WorkspaceHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-6 pb-5">
        <div className="grid grid-cols-2 gap-3">
          {companies.map((company) => (
            <Card key={company.id} data-tenant-card={company.id} className="rounded-xl border-border/80 bg-white shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <span className="grid size-7 place-items-center rounded-md bg-[#f2f4f7]">
                    <Building2 className="size-4 text-[#4b688e]" strokeWidth={1.7} />
                  </span>
                  <span className="text-[14px] font-semibold leading-none">{company.name}</span>
                  <Badge variant="outline" className="h-[18px] px-1.5 text-[10px]">{company.note}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-border/70 bg-[#fafafa] px-3 py-2">
                    <div className="eyebrow">成员</div>
                    <div className="stat mt-0.5 text-[20px] tabular-nums leading-tight">{company.total}</div>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-[#fafafa] px-3 py-2">
                    <div className="eyebrow">在线</div>
                    <div className="stat mt-0.5 flex items-baseline gap-1.5 text-[20px] tabular-nums leading-tight">
                      {company.online}
                      <span className="size-[7px] translate-y-[-4px] rounded-full bg-[#16a34a]" />
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <Badge variant="outline" className={cn('h-[20px] gap-1 px-1.5 text-[11px]',
                    company.headquarter ? 'border-[#ecd9b5] bg-[#fdf3e3] text-[#b45309]' : 'border-border/70 bg-muted text-foreground/70')}>
                    <Crown className="size-3" strokeWidth={1.7} />
                    {company.headquarter ? '总部 · 策略制定方' : '策略跟随集团总部'}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-[26px] gap-1 px-2.5 text-[12px]"
                    data-enter-tenant={company.id}
                    onClick={() => onEnterWorkspace(company.id)}
                  >
                    进入工作区
                    <ArrowRight className="size-3" strokeWidth={1.7} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="flex min-h-0 flex-1 flex-col rounded-xl border-border/80 bg-white shadow-card">
          <div className="flex items-center justify-between border-b border-border/70 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="eyebrow">合并成员目录</span>
              <span className="text-[11px] text-muted-foreground">
                公司归属 = 中性属性 attrs['公司']，随目录承接，无需任何新 Schema
              </span>
            </div>
            <Badge variant="secondary" className="h-[18px] px-1.5 text-[10px]">{directory.length} 人</Badge>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <Table data-group-directory>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-8 pl-4 text-[11px]">成员</TableHead>
                  <TableHead className="h-8 text-[11px]">公司</TableHead>
                  <TableHead className="h-8 text-[11px]">部门</TableHead>
                  <TableHead className="h-8 text-[11px]">岗位</TableHead>
                  <TableHead className="h-8 pr-4 text-[11px]">角色</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {directory.map((member) => {
                  const company = companyOf(member)
                  return (
                    <TableRow key={`${member.connectorId}:${member.idpId}`} className="hover:bg-muted/40">
                      <TableCell className="py-1.5 pl-4">
                        <div className="flex items-center gap-2.5">
                          <Avatar className="size-[24px]">
                            <AvatarFallback className="size-[24px] text-[11px] text-white" style={{ background: avatarColor(member.displayName) }}>
                              {member.displayName.slice(0, 1)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="truncate text-[12.5px] font-medium leading-tight">{member.displayName}</div>
                            {member.email && <div className="truncate text-[10.5px] text-muted-foreground">{member.email}</div>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('h-[19px] px-1.5 text-[10.5px]', COMPANY_CHIP[company] ?? 'bg-muted text-foreground/70 border-border/70')}>
                          {company}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[12px] text-foreground/80">{member.attrs['部门'] ?? '—'}</TableCell>
                      <TableCell className="text-[12px] text-foreground/80">{member.attrs['岗位'] ?? '—'}</TableCell>
                      <TableCell className="pr-4">
                        <Badge variant="outline" className={cn('h-[19px] px-1.5 text-[10.5px]', ROLE_CHIP[member.role])}>
                          {ROLE_LABEL[member.role]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        </Card>
      </div>
    </main>
  )
}
