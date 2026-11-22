/* Rallyloom — 团队种子数据（演示）
   31 位办公室成员 = 演示 IdP 目录同步来的身份；
   陈媛 = 本机登录的管理员，张三 = 外部访客。
   接真实后端后，这层数据改为由 syncIdentity() 产出。 */

import { MEMBERS } from '@/data/office'
import { OFFICE_LAYOUT } from '@/data/office-layout'
import type { RoleId, TeamMember } from '@/lib/identity/types'

const GROUP_BY_ROOM: Record<string, string> = {
  store: 'ops',
  visual: 'design',
  fulfill: 'wms',
  service: 'support',
  command: 'growth',
  select: 'sourcing',
  meeting: 'pm',
  lobby: 'front',
  pantry: 'staff',
}

const seedFromOffice = (): TeamMember[] =>
  MEMBERS.map((m) => {
    const room = OFFICE_LAYOUT.rooms.find((r) => r.id === m.roomId)
    return {
      id: `tm-demo-${m.id}`,
      connectorId: 'demo-idp-admin',
      idpId: `demo-u-${m.id}`,
      displayName: m.name,
      email: `${m.id}@demo.rallyloom.local`,
      attrs: { 部门: room?.name ?? '—', 岗位: m.role },
      presence: m.presence,
      externalGroups: [GROUP_BY_ROOM[m.roomId] ?? 'staff'],
      role: (m.id === 'command-1' ? 'owner' : 'member') as RoleId,
      // 林晓的 owner 来自外部组映射（growth-lead），不是本地覆盖
      localRoleOverride: null,
      syncedAt: new Date('2026-11-21T09:00:00+08:00').toISOString(),
      roomId: m.roomId,
    }
  })

export const SEED_TEAM: TeamMember[] = [
  ...seedFromOffice(),
  {
    // 陈媛：外部组 ops-lead → 组映射为 admin（见 SYNC_POLICY.groupRoleMap）
    id: 'tm-demo-idp-admin-1001',
    connectorId: 'demo-idp-admin',
    idpId: 'demo-u-1001',
    displayName: '陈媛',
    email: 'chen.yuan@demo.rallyloom.local',
    attrs: { 部门: '运营部', 岗位: '运营专员' },
    presence: 'online',
    externalGroups: ['ops', 'ops-lead'],
    role: 'admin',
    localRoleOverride: null,
    syncedAt: new Date('2026-11-21T09:12:00+08:00').toISOString(),
  },
  {
    // 张三：外部协作方，组映射 guest
    id: 'tm-demo-idp-guest-2046',
    connectorId: 'demo-idp-guest',
    idpId: 'demo-u-2046',
    displayName: '张三',
    email: 'zhang.san@partner.rallyloom.local',
    attrs: { 部门: '外部协作方', 岗位: '品牌顾问' },
    presence: 'online',
    externalGroups: ['partner'],
    role: 'guest',
    localRoleOverride: null,
    syncedAt: new Date('2026-11-21T10:40:00+08:00').toISOString(),
  },
]

/* --------------------------- 演示乙公司：云岭智造 -------------------------- */

/**
 * 多租户演示：第二家公司（离散制造，无电商语境）。
 * 与星辰电商共用同一套壳与同一份办公室模板 —— 证明租户之间
 * 团队 / 角色映射 / 工位编排完全独立，互不可见。
 */
export const SEED_TEAM_B: TeamMember[] = [
  {
    // 罗云：演示乙公司超管，外部组 b-owner → owner（SYNC_POLICY_B.roleMaps）
    id: 'tm-demo-b-1',
    connectorId: 'demo-idp-b-owner',
    idpId: 'demo-u-b-1',
    displayName: '罗云',
    email: 'luo.yun@demo.rallyloom.local',
    attrs: { 部门: '总经办', 岗位: '董事长' },
    presence: 'online',
    externalGroups: ['b-owner'],
    role: 'owner',
    localRoleOverride: null,
    syncedAt: new Date('2026-11-21T09:00:00+08:00').toISOString(),
  },
  {
    // 沈屹：外部组 b-factory-lead → admin
    id: 'tm-demo-b-2',
    connectorId: 'demo-idp-b-admin',
    idpId: 'demo-u-b-2',
    displayName: '沈屹',
    email: 'shen.yi@demo.rallyloom.local',
    attrs: { 部门: '制造部', 岗位: '厂长' },
    presence: 'online',
    externalGroups: ['b-factory-lead'],
    role: 'admin',
    localRoleOverride: null,
    syncedAt: new Date('2026-11-21T09:00:00+08:00').toISOString(),
  },
  {
    id: 'tm-demo-b-3',
    connectorId: 'demo-idp-b-admin',
    idpId: 'demo-u-b-3',
    displayName: '秦岭',
    email: 'qin.ling@demo.rallyloom.local',
    attrs: { 部门: '制造部', 岗位: '车间主任' },
    presence: 'busy',
    externalGroups: ['b-factory'],
    role: 'member',
    localRoleOverride: null,
    syncedAt: new Date('2026-11-21T09:00:00+08:00').toISOString(),
  },
  {
    id: 'tm-demo-b-4',
    connectorId: 'demo-idp-b-admin',
    idpId: 'demo-u-b-4',
    displayName: '白露',
    email: 'bai.lu@demo.rallyloom.local',
    attrs: { 部门: '品质部', 岗位: '质检主管' },
    presence: 'away',
    externalGroups: ['b-quality'],
    role: 'member',
    localRoleOverride: null,
    syncedAt: new Date('2026-11-21T09:00:00+08:00').toISOString(),
  },
  {
    id: 'tm-demo-b-5',
    connectorId: 'demo-idp-b-admin',
    idpId: 'demo-u-b-5',
    displayName: '秋实',
    email: 'qiu.shi@demo.rallyloom.local',
    attrs: { 部门: '供应链部', 岗位: '采购专员' },
    presence: 'online',
    externalGroups: ['b-purchase'],
    role: 'member',
    localRoleOverride: null,
    syncedAt: new Date('2026-11-21T09:00:00+08:00').toISOString(),
  },
  {
    id: 'tm-demo-b-6',
    connectorId: 'demo-idp-b-admin',
    idpId: 'demo-u-b-6',
    displayName: '冬宁',
    email: 'dong.ning@demo.rallyloom.local',
    attrs: { 部门: '供应链部', 岗位: '仓管' },
    presence: 'offline',
    externalGroups: ['b-warehouse'],
    role: 'member',
    localRoleOverride: null,
    syncedAt: new Date('2026-11-21T09:00:00+08:00').toISOString(),
  },
  {
    id: 'tm-demo-b-7',
    connectorId: 'demo-idp-b-admin',
    idpId: 'demo-u-b-7',
    displayName: '顾北',
    email: 'gu.bei@demo.rallyloom.local',
    attrs: { 部门: '营销部', 岗位: '大客户经理' },
    presence: 'online',
    externalGroups: ['b-sales'],
    role: 'member',
    localRoleOverride: null,
    syncedAt: new Date('2026-11-21T09:00:00+08:00').toISOString(),
  },
  {
    id: 'tm-demo-b-8',
    connectorId: 'demo-idp-b-admin',
    idpId: 'demo-u-b-8',
    displayName: '林晚',
    email: 'lin.wan@demo.rallyloom.local',
    attrs: { 部门: '综合部', 岗位: '行政前台' },
    presence: 'online',
    externalGroups: ['b-front'],
    role: 'member',
    localRoleOverride: null,
    syncedAt: new Date('2026-11-21T09:00:00+08:00').toISOString(),
  },
]

/** 当前登录身份 → 办公室「我的工位」映射 */
export function seatIdOf(memberId: string | undefined, team: TeamMember[]): string | null {
  if (!memberId) return null
  const m = team.find((t) => t.id === memberId)
  if (!m || m.role === 'guest') return null
  // 陈媛（演示管理员）：示例工位
  if (m.connectorId === 'demo-idp-admin' && m.idpId === 'demo-u-1001') return 'store-0'
  // 演示目录同步来的 31 位办公室成员：idpId 即办公室成员 id
  if (m.connectorId.startsWith('demo-idp-') && m.idpId.startsWith('demo-u-')) {
    const officeId = m.idpId.slice('demo-u-'.length)
    return MEMBERS.some((o) => o.id === officeId) ? officeId : null
  }
  return null
}
