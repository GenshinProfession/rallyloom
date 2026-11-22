/* Rallyloom — RBAC 权限模型
   「自动同步对方的身份，然后再交由系统本身去设置」：
   同步层只负责给默认角色（组映射），真正生效的角色允许在团队管理里本地覆盖。 */

import type { RoleId, SyncPolicy, TeamMember } from './types'

/* ------------------------------ 角色定义 --------------------------------- */

export const ROLES: { id: RoleId; name: string; note: string }[] = [
  { id: 'owner', name: '所有者', note: '超管：全部权限，含身份源与云端存储的统一配置' },
  { id: 'admin', name: '管理员', note: '成员与身份源管理，不能配置云端存储' },
  { id: 'member', name: '成员', note: '查看团队，进入办公室与协作' },
  { id: 'guest', name: '访客', note: '仅限办公室访问的外部协作者' },
]

/* ------------------------------- 权限矩阵 -------------------------------- */

export const PERMISSIONS: { id: string; name: string; group: string; roles: RoleId[] }[] = [
  { id: 'office.view', name: '进入办公室', group: '工作区', roles: ['owner', 'admin', 'member', 'guest'] },
  { id: 'chat.use', name: '使用交流室', group: '工作区', roles: ['owner', 'admin', 'member'] },
  { id: 'tasks.use', name: '使用任务看板', group: '工作区', roles: ['owner', 'admin', 'member'] },
  { id: 'notify.view', name: '查看通知中心', group: '工作区', roles: ['owner', 'admin', 'member'] },
  { id: 'docs.use', name: '使用文档中心', group: '工作区', roles: ['owner', 'admin', 'member'] },
  { id: 'layout.edit', name: '编排办公室（房间与工位）', group: '工作区', roles: ['owner', 'admin'] },
  { id: 'slots.attach', name: '挂载外部数据看板', group: '工作区', roles: ['owner', 'admin'] },
  { id: 'team.view', name: '查看团队', group: '团队管理', roles: ['owner', 'admin', 'member'] },
  { id: 'members.invite', name: '邀请成员', group: '团队管理', roles: ['owner', 'admin'] },
  { id: 'members.role', name: '设置成员角色', group: '团队管理', roles: ['owner', 'admin'] },
  { id: 'sso.configure', name: '配置身份源与同步策略', group: '身份与安全', roles: ['owner', 'admin'] },
  { id: 'storage.configure', name: '配置云端存储（超管）', group: '身份与安全', roles: ['owner'] },
  { id: 'audit.view', name: '查看审计日志', group: '身份与安全', roles: ['owner'] },
]

export const ROLE_LABEL: Record<RoleId, string> = {
  owner: '所有者',
  admin: '管理员',
  member: '成员',
  guest: '访客',
}

/** 判断某角色是否拥有某权限 */
export function can(role: RoleId, permissionId: string): boolean {
  return PERMISSIONS.some((p) => p.id === permissionId && p.roles.includes(role))
}

/* ----------------------------- 同步策略（演示） --------------------------- */

export const SYNC_POLICY: SyncPolicy = {
  jitProvisioning: true,
  syncProfile: true,
  groupRoleMap: {
    'ops-lead': 'admin',
    partner: 'guest',
  },
  // 按接入源覆盖：各源系统的组语义不同，映射表归各源，未覆盖的走全局兜底
  roleMaps: {
    'demo-idp-owner': { 'growth-lead': 'owner' },
    'demo-idp-minimal': { 'ext-project': 'member' },
  },
  defaultRole: 'member',
  allowLocalOverride: true,
}

/** 某接入源实际生效的组映射表：源覆盖优先，全局兜底 */
export function sourceRoleMap(policy: SyncPolicy, connectorId: string): Record<string, RoleId> {
  return policy.roleMaps?.[connectorId] ?? policy.groupRoleMap
}

/**
 * 演示乙公司（云岭智造）的同步策略 —— 独立于星辰电商。
 * 多租户要点：组映射按租户各自的接入源配置，两个租户的组语义互不相干。
 */
export const SYNC_POLICY_B: SyncPolicy = {
  jitProvisioning: true,
  syncProfile: true,
  groupRoleMap: {},
  roleMaps: {
    'demo-idp-b-owner': { 'b-owner': 'owner' },
    'demo-idp-b-admin': { 'b-factory-lead': 'admin' },
  },
  defaultRole: 'member',
  allowLocalOverride: true,
}

/**
 * 集团超管（星澜控股）的同步策略 —— 平台运维轴的演示化身。
 * 他不进任何一家公司的成员表：登录后落在「集团视图」的合并目录里，
 * 角色映射也只有集团接入源自己一条（group-owner → owner）。
 */
export const SYNC_POLICY_GROUP: SyncPolicy = {
  jitProvisioning: true,
  syncProfile: true,
  groupRoleMap: {},
  roleMaps: {
    'demo-idp-group-admin': { 'group-owner': 'owner' },
  },
  defaultRole: 'member',
  allowLocalOverride: true,
}

/* ------------------------------- 身份同步 -------------------------------- */

import type { ExternalIdentity } from './types'

export interface SyncResult {
  action: 'created' | 'updated' | 'unchanged'
  member: TeamMember
}

/**
 * 同步外部身份到本地团队（JIT provisioning，承接管道雏形）。
 * 规则：
 *  - 按 connectorId + idpId 定位同一个人（与邮箱无关，邮箱可有可无）；
 *  - 资料字段（attrs 自由属性/邮箱/外部组）每次登录原样承接刷新；
 *  - 角色取「本地覆盖优先，否则该源系统组映射，否则全局映射，否则默认」
 *    —— 同步永不覆盖本地设置。
 */
export function syncIdentity(
  external: ExternalIdentity,
  team: TeamMember[],
  policy: SyncPolicy = SYNC_POLICY,
): SyncResult {
  const idx = team.findIndex(
    (m) => m.connectorId === external.connectorId && m.idpId === external.idpId,
  )

  const mapRole = (): RoleId => {
    const roleMap = sourceRoleMap(policy, external.connectorId)
    for (const g of external.externalGroups) {
      if (g in roleMap) return roleMap[g]
    }
    return policy.defaultRole
  }

  if (idx < 0) {
    if (!policy.jitProvisioning) {
      throw new Error('身份源未开启自动开通（JIT），请联系管理员邀请后进入')
    }
    const member: TeamMember = {
      id: `tm-${external.connectorId}-${external.idpId}`,
      connectorId: external.connectorId,
      idpId: external.idpId,
      displayName: external.displayName,
      email: external.email,
      attrs: { ...external.attrs },
      presence: 'online',
      externalGroups: [...external.externalGroups],
      role: mapRole(),
      localRoleOverride: null,
      syncedAt: external.syncedAt,
    }
    team.push(member)
    return { action: 'created', member }
  }

  const m = team[idx]
  const action =
    JSON.stringify(m.attrs) !== JSON.stringify(external.attrs) ||
    m.email !== external.email ||
    m.syncedAt !== external.syncedAt
      ? 'updated'
      : 'unchanged'

  if (policy.syncProfile) {
    m.displayName = external.displayName
    m.email = external.email
    m.attrs = { ...external.attrs }
    m.externalGroups = [...external.externalGroups]
  }
  m.presence = 'online'
  m.syncedAt = external.syncedAt

  return { action, member: m }
}

/** 本地设置角色（团队管理页调用） */
export function setLocalRole(member: TeamMember, role: RoleId, policy: SyncPolicy = SYNC_POLICY): void {
  if (!policy.allowLocalOverride) throw new Error('当前策略不允许本地覆盖角色')
  member.role = role
  member.localRoleOverride = role
}

/** 清除本地覆盖，回到「跟随源系统组映射」 */
export function clearLocalRole(member: TeamMember, policy: SyncPolicy = SYNC_POLICY): void {
  member.localRoleOverride = null
  const roleMap = sourceRoleMap(policy, member.connectorId)
  for (const g of member.externalGroups) {
    if (g in roleMap) {
      member.role = roleMap[g]
      return
    }
  }
  member.role = policy.defaultRole
}
