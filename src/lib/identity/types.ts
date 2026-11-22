/* Rallyloom — 身份体系类型定义
   三层架构：连接器(外部授权) → 同步层(JIT + 角色映射) → 本地权限层(RBAC) */

/* ------------------------------- 连接器协议 ------------------------------ */

/** 支持的外部协议 */
export type ConnectorProtocol = 'oidc' | 'oauth2' | 'saml' | 'ldap' | 'custom'

/** 连接器状态 */
export type ConnectorStatus = 'connected' | 'not-configured' | 'mock'

/**
 * 连接器 —— 任何外部系统的统一接入接口。
 * 新接一个系统 = 实现一次这个接口并注册到 CONNECTORS。
 */
export interface IdentityConnector {
  id: string
  /** 展示名（如「飞书」「演示 IdP」） */
  name: string
  protocol: ConnectorProtocol
  status: ConnectorStatus
  /** 描述（身份源卡片副标题） */
  note: string
  /**
   * 演示租户绑定（demo 模式专用）。
   * 真实部署中租户不由连接器声明：formal 模式下一个 OA 地址 = 一家公司，
   * 归属由服务端从 discovery + 登录令牌解析，客户端不可选择。
   */
  tenantId?: string
  /** 拉起授权。真协议走系统浏览器 + rallyloom:// 回调；演示连接器模拟全流程 */
  authorize: () => Promise<ExternalIdentity>
}

/* -------------------------------- 外部身份 ------------------------------ */

/**
 * 外部系统回调后拉取到的规范化身份（中性容器）。
 * 必填仅 display_name + external_user_id + groups；其余全部走 attrs 自由属性。
 * Rallyloom 不假设源系统有部门/职位等概念——有什么属性就承接什么属性。
 */
export interface ExternalIdentity {
  /** 在外部系统里的稳定 ID（同步锚点的一半，另一半是 connectorId） */
  idpId: string
  connectorId: string
  /** 建议显示名（唯一必填资料字段） */
  displayName: string
  /** 邮箱（源系统有才给；缺失不报错、不阻碍入队） */
  email?: string
  /** 自由属性键值对：部门/岗位/工号/城市…由源系统决定有什么，Rallyloom 只负责展示 */
  attrs: Record<string, string>
  /** 中性组（用于映射默认角色；不叫「部门」） */
  externalGroups: string[]
  /** 同步时间 */
  syncedAt: string
}

/* --------------------------------- 团队成员 ----------------------------- */

export type RoleId = 'owner' | 'admin' | 'member' | 'guest'
export interface ProviderRoleOption { id: string; label: string }
export interface ProviderRoleSettings {
  title: string
  description?: string
  canReset?: boolean
  fields: { id: string; label: string; value: string; options: ProviderRoleOption[]; readOnly?: boolean }[]
}

export interface ProviderMemberActions {
  roleOptions: ProviderRoleOption[]
  selectedRoleId?: string
  canResetRole?: boolean
  canRemove?: boolean
}

/** 本地成员 = 同步身份 + 本地权限设置 */
export interface TeamMember {
  id: string
  /** 同步锚点：connectorId + idpId 定位同一个人 */
  connectorId: string
  idpId: string
  displayName: string
  /** 源系统提供才有；未提供为空串 */
  email?: string
  /** 随源系统同步的自由属性（原样承接，展示为键值徽章） */
  attrs: Record<string, string>
  presence: import('@/data/office').Presence
  /** 中性组（只读，来自源系统） */
  externalGroups: string[]
  /** 当前生效角色 */
  role: RoleId
  /** 本地覆盖的角色；存在则同步不改动 */
  localRoleOverride: RoleId | null
  /** 正式工作区由提供方返回，显示名称与权限能力相互独立。 */
  roleId?: string
  roleName?: string
  sourceRoleName?: string
  officeAssignable?: boolean
  memberActions?: ProviderMemberActions
  /** 最近一次同步时间 */
  syncedAt: string
  /** 工位房间（演示数据关联 office 场景） */
  roomId?: string
}

/* ------------------------------ 同步策略 -------------------------------- */

export interface SyncPolicy {
  /** 新身份登录即自动开通（JIT provisioning） */
  jitProvisioning: boolean
  /** 每次登录自动刷新资料（属性/邮箱/外部组） */
  syncProfile: boolean
  /** 外部组 → 默认角色映射（全局兜底，未命中则用 defaultRole） */
  groupRoleMap: Record<string, RoleId>
  /** 按接入源覆盖的组映射：源系统各自的角色语义不同，映射表归各源 */
  roleMaps?: Record<string, Record<string, RoleId>>
  /** 未命中映射时的新成员默认角色 */
  defaultRole: RoleId
  /** 允许在本地覆盖同步来的角色 */
  allowLocalOverride: boolean
}

/* -------------------------------- 会话 ---------------------------------- */

export interface Session {
  /** 当前登录成员（本地成员 ID） */
  memberId: string
  /** 使用的连接器 */
  connectorId: string
  /** 登录时间 */
  loginAt: string
}
