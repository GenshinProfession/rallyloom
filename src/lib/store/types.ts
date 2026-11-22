/* Rallyloom — 存储层类型
   「应用本身不做存储」：客户端是无状态壳，团队 / 权限 / 办公室数据全部通过
   WorkspaceClient 读写超管统一配置的云端后端（类 OA 系统 + 云数据库）。 */

import type { OfficeLayout } from '@/components/office/rooms/api'
import type { ExternalIdentity, RoleId, SyncPolicy, TeamMember } from '@/lib/identity/types'

/* ------------------------------- 数据源配置 ------------------------------- */

/** 数据源种类：内存演示 / OA 协作后端（其背后是云端数据库） */
export type DatasourceKind = 'demo-local' | 'oa-rest'

/** 类 OA 后端连接配置 —— 由超管（owner）统一配置，普通成员不可见 */
export interface OaEndpointConfig {
  /** 服务地址，如 https://oa.corp.example.com */
  baseUrl: string
  /** 部署区域（展示用 + 就近接入） */
  region: string
  /** API 版本，如 v1 */
  apiVersion: string
  /** 携带登录令牌（来自身份连接器换来的 access token），桌面不保存任何独立数据库凭据 */
  useLoginToken: boolean
}

export type DatasourceConfig = { kind: 'demo-local' } | ({ kind: 'oa-rest' } & OaEndpointConfig)

export const DATASOURCE_LABEL: Record<DatasourceKind, string> = {
  'demo-local': '演示数据（内存）',
  'oa-rest': 'OA 协作后端（云端数据库）',
}

/* ------------------------------- 布局编排 -------------------------------- */

/**
 * 办公室布局 —— Rallyloom 唯一「拥有」的核心数据：房间与人员编排。
 * 业务数据（运营看板、动态、聊天）一律外部接入，本地不生成。
 */
export interface LayoutState extends OfficeLayout {
  revision?: number
  /** rosterId -> roomId；未出现在映射里的成员视为「未编排」 */
  assignments: Record<string, string>
}

/* ------------------------------- 数据插槽 -------------------------------- */

/**
 * 房间上挂载的外置数据看板（如老板办公台的运营数据）。
 * Rallyloom 只负责接入与展示，数据本体在外部系统。
 */
export interface DataSlot {
  kind: 'demo-feed' | 'external-api'
  name: string
  /** external-api：返回 { rows: [{ label, value, delta? }] } 的 JSON 端点 */
  url?: string
  /** 拉取间隔（展示用；演示客户端不自动轮询） */
  refreshSec?: number
}

/** roomId -> 挂载的看板 */
export type DataSlots = Record<string, DataSlot>

export const SLOT_SOURCE_LABEL: Record<DataSlot['kind'], string> = {
  'demo-feed': '演示数据源',
  'external-api': '外部 API',
}

export interface SlotRow {
  key?: string
  label: string
  value: string
  delta?: string
}

/* --------------------------------- 契约 ---------------------------------- */

/**
 * 租户上下文 —— 「哪家公司」。
 * 多租户模型：租户不是客户端可选项，而是随凭证绑定的事实：
 *  - formal 模式：一个 OA 服务地址 = 一家公司的 workspace，
 *    服务端从 discovery + 登录令牌解析归属，客户端不可选择；
 *  - demo 模式：演示连接器各自声明 tenantId，用于体验两家演示公司。
 */
export interface TenantContext {
  /** 租户标识（formal = 服务端 workspace_id） */
  id: string
  /** 展示名（formal = 服务端 display_name） */
  name: string
  /** 备注展示用 */
  note?: string
  /**
   * 可选：归属的集团/管辖体系标识。
   * 集团层是「可选能力」—— 不属任何管辖体系的公司（多数部署）
   * 不带这两个字段，照常以独立租户运行，链路零感知。
   * 「合并租户」= 归属同一管辖体系的配置：数据仍按公司硬隔离，
   * 员工目录联邦展示，策略可标记「跟随总部」，由服务端/超管配置。
   */
  groupId?: string
  /** 可选：集团展示名（与 groupId 成对出现） */
  groupName?: string
}

/** 存储后端的全量快照 —— 客户端状态只是它的投影 */
export interface WorkspaceSnapshot {
  collaboration?: { version: number; reporting?: { version: number }; scopes: { id: string; label: string }[] }
  tenant: TenantContext
  team: TeamMember[]
  policy: SyncPolicy
  datasource: DatasourceConfig
  layout: LayoutState
  dataSlots: DataSlots
}

/** 登录同步结果：新会话成员 + 刷新后的全量快照 */
export interface SyncLoginResult {
  member: TeamMember
  snapshot: WorkspaceSnapshot
}

/**
 * WorkspaceClient —— 客户端唯一的数据读写通道。
 * 所有六个写/读路径都必须经过这里，任何组件不得自行落地存储。
 */
export interface WorkspaceClient {
  readonly kind: DatasourceKind
  readonly label: string
  /** 启动 / 重连时拉全量快照 */
  bootstrap(): Promise<WorkspaceSnapshot>
  /** 外部身份登录同步（JIT 开通 + 资料刷新 + 角色映射） */
  syncExternalIdentity(external: ExternalIdentity): Promise<SyncLoginResult>
  /** 本地角色设置；role = null 表示清除覆盖、回到外部组映射 */
  setMemberRole(memberId: string, role: RoleId | null): Promise<WorkspaceSnapshot>
  removeMember(memberId: string): Promise<WorkspaceSnapshot>
  savePolicy(patch: Partial<SyncPolicy>): Promise<WorkspaceSnapshot>
  saveDatasource(config: DatasourceConfig): Promise<WorkspaceSnapshot>
  /** 保存办公室布局（房间增删改 + 人员编排） */
  saveLayout(layout: LayoutState): Promise<WorkspaceSnapshot>
  /** 房间挂载 / 更换 / 移除外置数据看板；slot = null 表示移除 */
  saveDataSlot(roomId: string, slot: DataSlot | null): Promise<WorkspaceSnapshot>
}
