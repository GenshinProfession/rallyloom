/* Rallyloom — WorkspaceClient 实现
   DemoWorkspaceClient：内存演示源，数据结构与真实后端契约完全一致；
   OaWorkspaceClient：类 OA 协作后端的真实 REST 客户端（fetch + 4s 超时），
   演示环境必然连不通 —— App 捕获错误后保持原数据源并在「存储」页如实展示。 */

import { MEMBERS } from '@/data/office'
import { OFFICE_LAYOUT } from '@/data/office-layout'
import { SEED_TEAM, SEED_TEAM_B } from '@/data/team'
import { clearLocalRole, setLocalRole, syncIdentity, SYNC_POLICY, SYNC_POLICY_B, SYNC_POLICY_GROUP } from '@/lib/identity/rbac'
import type { ExternalIdentity, RoleId, SyncPolicy, TeamMember } from '@/lib/identity/types'
import { demoJukebox } from '@/lib/jukebox/demo'
import type { JukeboxConfig } from '@/lib/jukebox/types'
import type {
  DataSlot,
  DatasourceConfig,
  LayoutState,
  OaEndpointConfig,
  SlotRow,
  SyncLoginResult,
  TenantContext,
  WorkspaceClient,
  WorkspaceSnapshot,
} from './types'

const clone = structuredClone

/* ------------------------------ 布局种子与看板 ----------------------------- */

export function seedLayout(): LayoutState {
  return {
    width: OFFICE_LAYOUT.width,
    height: OFFICE_LAYOUT.height,
    rooms: structuredClone([...OFFICE_LAYOUT.rooms]),
    assignments: Object.fromEntries(MEMBERS.map((member) => [member.id, member.roomId])),
  }
}

/**
 * 演示乙公司（云岭智造）的工位编排 —— 同一套办公室模板，完全不同的编队：
 * 多租户之间只有「壳」是共享的，人与房间编排各归各。
 */
function seedLayoutB(): LayoutState {
  return {
    width: OFFICE_LAYOUT.width,
    height: OFFICE_LAYOUT.height,
    rooms: structuredClone([...OFFICE_LAYOUT.rooms]),
    assignments: {
      'tm-demo-b-1': 'command',
      'tm-demo-b-2': 'command',
      'tm-demo-b-3': 'meeting',
      'tm-demo-b-4': 'meeting',
      'tm-demo-b-5': 'store',
      'tm-demo-b-6': 'store',
      'tm-demo-b-7': 'pantry',
      'tm-demo-b-8': 'pantry',
    },
  }
}

/** 老板办公台预挂的演示看板：数据本体依然「不在本地」，由演示数据源生成 */
function seedDataSlots(): Record<string, DataSlot> {
  return {
    command: { kind: 'demo-feed', name: '运营核心看板', refreshSec: 60 },
  }
}

/** 演示看板取数：轻时间抖动，让数字看起来「活的」 */
export function demoSlotRows(roomId: string): SlotRow[] {
  const w = (Math.floor(Date.now() / 60_000) % 97) / 100
  if (roomId === 'command') {
    return [
      { key: 'today_gmv', label: '今日 GMV', value: `¥${Math.round(1_284_690 + w * 8_000).toLocaleString('zh-CN')}`, delta: '+12.4%' },
      { label: '转化率', value: `${(3.9 + w * 0.2).toFixed(1)}%`, delta: '+0.3pt' },
      { label: '客服首响', value: '2m31s', delta: '-8.0%' },
      { label: '实时在线', value: `${22 + Math.round(w * 6)}`, delta: '+3' },
    ]
  }
  return [
    { label: '待办工单', value: `${14 + Math.round(w * 5)}`, delta: '-2' },
    { label: '今日新增成员', value: '1', delta: '+1' },
    { label: '同步延迟', value: `${(0.8 + w).toFixed(1)}s`, delta: '-0.1s' },
  ]
}

/** 外部 API 看板取数：真实 fetch（4s 超时），失败如实抛错 */
export async function fetchSlotRows(slot: DataSlot): Promise<SlotRow[]> {
  if (!slot.url) throw new Error('看板未配置数据端点')
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 4000)
  try {
    const res = await fetch(slot.url, { signal: ac.signal })
    if (!res.ok) throw new Error(`数据端点响应 HTTP ${res.status}`)
    const data = (await res.json()) as { rows?: SlotRow[] }
    if (!data || !Array.isArray(data.rows)) throw new Error('数据端点返回缺少 rows 数组')
    return data.rows
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`拉取超时（4s）：${slot.url}`)
    }
    throw new Error(`无法拉取外部看板：${err instanceof Error ? err.message : String(err)}`)
  } finally {
    clearTimeout(timer)
  }
}

function assertSnapshot(v: unknown): WorkspaceSnapshot {
  const s = v as WorkspaceSnapshot
  if (!s || !Array.isArray(s.team) || !s.policy) {
    throw new Error('后端返回不符合 Workspace 契约（缺少 team / policy）')
  }
  if (!s.tenant || typeof s.tenant.id !== 'string' || !s.tenant.name) {
    throw new Error('后端返回缺少租户上下文（tenant.id / tenant.name）')
  }
  const { layout } = s
  if (
    !layout || !Number.isFinite(layout.width) || !Number.isFinite(layout.height) ||
    !Array.isArray(layout.rooms) || !layout.assignments || typeof layout.assignments !== 'object' ||
    Array.isArray(layout.assignments) ||
    layout.rooms.some((room) => !room?.id || typeof room.template !== 'string' || !room.frame)
  ) {
    throw new Error('后端 layout 必须包含画布尺寸、房间模板与坐标、成员编排')
  }
  if (!s.dataSlots || typeof s.dataSlots !== 'object' || Array.isArray(s.dataSlots)) {
    throw new Error('后端返回缺少 dataSlots，可传入空对象')
  }
  return s
}

/* ----------------------------- 内存演示数据源 ----------------------------- */

/**
 * 演示租户注册表 —— 两家独立公司 + 一个可选的集团视图（合并目录）。
 * 正式模式（formal）没有这张表：一个 OA 地址 = 一家公司，
 * 租户上下文由服务端 discovery/bootstrap 返回，客户端不可选择；
 * 集团归属（groupId/groupName）是服务端的可选配置，不属集团的公司不带该字段。
 */
/**
 * 集团合并目录：给两家公司的成员打上「公司」中性属性。
 * 复用 attrs 自由键值 —— 公司归属对承接层来说只是源系统给的一个属性，
 * 不需要任何新字段/新 Schema。
 */
const withCompany = (team: TeamMember[], company: string): TeamMember[] =>
  team.map((member) => ({ ...member, attrs: { ...member.attrs, 公司: company } }))

const DEMO_TENANTS: Record<string, {
  tenant: TenantContext
  team: TeamMember[]
  policy: SyncPolicy
  layout: LayoutState
  dataSlots: Record<string, DataSlot>
  jukebox?: JukeboxConfig
}> = {
  // 两家演示公司独立成租户；集团归属是「可选配置」—— 这两家恰好同属星澜控股。
  'tenant-a': {
    tenant: { id: 'tenant-a', name: '星辰电商', note: '演示甲公司 · 电商运营团队', groupId: 'lantern', groupName: '星澜控股集团' },
    team: SEED_TEAM,
    policy: SYNC_POLICY,
    layout: seedLayout(),
    dataSlots: seedDataSlots(),
    jukebox: demoJukebox(),
  },
  'tenant-b': {
    tenant: { id: 'tenant-b', name: '云岭智造', note: '演示乙公司 · 离散制造 · 策略跟随集团总部', groupId: 'lantern', groupName: '星澜控股集团' },
    team: SEED_TEAM_B,
    policy: SYNC_POLICY_B,
    layout: seedLayoutB(),
    dataSlots: seedDataSlots(),
    jukebox: demoJukebox(),
  },
  // 集团视图（平台运维轴）：合并成员目录 + 跨租户控制台，数据仍按公司隔离。
  group: {
    tenant: { id: 'group', name: '星澜控股集团', note: '平台运维轴 · 集团超管视图（可选管辖层）' },
    team: [...withCompany(SEED_TEAM, '星辰电商'), ...withCompany(SEED_TEAM_B, '云岭智造')],
    policy: SYNC_POLICY_GROUP,
    layout: seedLayout(),
    dataSlots: {},
  },
}

/** 集团控制台展示的管辖体系成员公司（不含 group 自身） */
export const GROUP_TENANT_IDS = ['tenant-a', 'tenant-b'] as const

/** 演示租户展示名（登录页「选择演示角色」分组标题） */
export function demoTenantName(tenantId: string): string {
  return DEMO_TENANTS[tenantId]?.tenant.name ?? tenantId
}

/** 演示租户摘要（集团控制台卡片用） */
export function demoTenantSummary(tenantId: string): { id: string; name: string; note?: string; groupId?: string; groupName?: string } | undefined {
  const t = DEMO_TENANTS[tenantId]?.tenant
  return t ? { id: t.id, name: t.name, note: t.note, groupId: t.groupId, groupName: t.groupName } : undefined
}

export class DemoWorkspaceClient implements WorkspaceClient {
  readonly kind = 'demo-local' as const
  readonly label = '演示数据（内存）'
  /** 当前演示租户 —— 两家公司的数据在此完全分家 */
  readonly tenantId: string

  private tenant: TenantContext
  private team: TeamMember[]
  private policy: SyncPolicy
  private datasource: DatasourceConfig = { kind: 'demo-local' }
  private layout: LayoutState
  private dataSlots: Record<string, DataSlot>
  private jukebox: JukeboxConfig | undefined

  constructor(tenantId = 'tenant-a') {
    const seed = DEMO_TENANTS[tenantId] ?? DEMO_TENANTS['tenant-a']
    this.tenantId = seed.tenant.id
    this.tenant = clone(seed.tenant)
    this.team = clone(seed.team)
    this.policy = clone(seed.policy)
    this.layout = clone(seed.layout)
    this.dataSlots = clone(seed.dataSlots)
    this.jukebox = seed.jukebox ? clone(seed.jukebox) : undefined
  }

  async bootstrap(): Promise<WorkspaceSnapshot> {
    return this.snapshot()
  }

  async syncExternalIdentity(external: ExternalIdentity): Promise<SyncLoginResult> {
    const { member } = syncIdentity(external, this.team, this.policy)
    return { member: clone(member), snapshot: this.snapshot() }
  }

  async setMemberRole(memberId: string, role: RoleId | null): Promise<WorkspaceSnapshot> {
    const m = this.team.find((t) => t.id === memberId)
    if (m) {
      if (role === null) clearLocalRole(m, this.policy)
      else setLocalRole(m, role, this.policy)
    }
    return this.snapshot()
  }

  async removeMember(memberId: string): Promise<WorkspaceSnapshot> {
    this.team = this.team.filter((t) => t.id !== memberId)
    return this.snapshot()
  }

  async savePolicy(patch: Partial<SyncPolicy>): Promise<WorkspaceSnapshot> {
    this.policy = { ...this.policy, ...patch }
    return this.snapshot()
  }

  async saveDatasource(config: DatasourceConfig): Promise<WorkspaceSnapshot> {
    this.datasource = { ...config }
    return this.snapshot()
  }

  async saveLayout(layout: LayoutState): Promise<WorkspaceSnapshot> {
    this.layout = clone(layout)
    return this.snapshot()
  }

  async saveDataSlot(roomId: string, slot: DataSlot | null): Promise<WorkspaceSnapshot> {
    if (slot === null) delete this.dataSlots[roomId]
    else this.dataSlots[roomId] = clone(slot)
    return this.snapshot()
  }

  private snapshot(): WorkspaceSnapshot {
    return {
      tenant: clone(this.tenant),
      team: clone(this.team),
      policy: clone(this.policy),
      datasource: { ...this.datasource },
      layout: clone(this.layout),
      dataSlots: clone(this.dataSlots),
      jukebox: this.jukebox ? clone(this.jukebox) : undefined,
    }
  }
}

/**
 * 集团视图客户端 —— 平台运维轴的演示化身。
 * 只读：所有写操作一律返回当前快照不落任何状态；
 * 管理动作请「进入工作区」后以对应公司超管身份执行。
 */
export class DemoGroupClient extends DemoWorkspaceClient {
  constructor() { super('group') }
  override async savePolicy(): Promise<WorkspaceSnapshot> { return this.bootstrap() }
  override async setMemberRole(): Promise<WorkspaceSnapshot> { return this.bootstrap() }
  override async removeMember(): Promise<WorkspaceSnapshot> { return this.bootstrap() }
  override async saveDatasource(): Promise<WorkspaceSnapshot> { return this.bootstrap() }
  override async saveLayout(): Promise<WorkspaceSnapshot> { return this.bootstrap() }
  override async saveDataSlot(): Promise<WorkspaceSnapshot> { return this.bootstrap() }
}

/* ------------------------ OA 协作后端（云端数据库） ------------------------ */

/**
 * 真实 REST 客户端：每个方法对应后端一条接口。
 * 鉴权只用身份连接器换来的登录令牌，桌面端不保存数据库账号密码。
 */
export class OaWorkspaceClient implements WorkspaceClient {
  readonly kind = 'oa-rest' as const
  readonly label = 'OA 协作后端（云端数据库）'

  constructor(
    private readonly endpoint: OaEndpointConfig,
    /** 真 OIDC 流程在此处取 access token；演示身份无令牌，请求将省略 Authorization 头 */
    private readonly getToken: () => string | null = () => null,
  ) {}

  async bootstrap(): Promise<WorkspaceSnapshot> {
    return assertSnapshot(await this.request('GET', '/workspace/bootstrap'))
  }

  async syncExternalIdentity(external: ExternalIdentity): Promise<SyncLoginResult> {
    const r = assertSnapshot(
      await this.request('POST', '/identity/sync', external),
    ) as SyncLoginResult & WorkspaceSnapshot
    if (!r.member) throw new Error('后端返回缺少 member')
    return { member: r.member, snapshot: r }
  }

  async setMemberRole(memberId: string, role: RoleId | null): Promise<WorkspaceSnapshot> {
    return assertSnapshot(
      await this.request('PATCH', `/members/${encodeURIComponent(memberId)}/role`, { role }),
    )
  }

  async removeMember(memberId: string): Promise<WorkspaceSnapshot> {
    return assertSnapshot(
      await this.request('DELETE', `/members/${encodeURIComponent(memberId)}`),
    )
  }

  async savePolicy(patch: Partial<SyncPolicy>): Promise<WorkspaceSnapshot> {
    return assertSnapshot(await this.request('PATCH', '/policy', patch))
  }

  async saveDatasource(config: DatasourceConfig): Promise<WorkspaceSnapshot> {
    return assertSnapshot(await this.request('PATCH', '/datasource', config))
  }

  async saveLayout(layout: LayoutState): Promise<WorkspaceSnapshot> {
    return assertSnapshot(await this.request('PATCH', '/layout', layout))
  }

  async saveDataSlot(roomId: string, slot: DataSlot | null): Promise<WorkspaceSnapshot> {
    return assertSnapshot(
      await this.request('PATCH', `/rooms/${encodeURIComponent(roomId)}/slot`, { slot }),
    )
  }

  /* ------------------------------ 传输细节 ------------------------------ */

  private async request(method: string, apiPath: string, body?: unknown): Promise<unknown> {
    const base = this.endpoint.baseUrl.replace(/\/+$/, '')
    const url = `${base}/api/${this.endpoint.apiVersion}${apiPath}`
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const token = this.endpoint.useLoginToken ? this.getToken() : null
    if (token) headers.Authorization = `Bearer ${token}`

    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), 4000)
    try {
      const res = await fetch(url, {
        method,
        headers,
        signal: ac.signal,
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`后端响应 HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`连接超时（4s）：${url}`)
      }
      throw new Error(`无法连接 OA 后端：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      clearTimeout(timer)
    }
  }
}

/** 按配置创建客户端：demo-local → 内存源；oa-rest → 真实 REST 客户端 */
export function createWorkspaceClient(
  config: DatasourceConfig,
  getToken?: () => string | null,
): WorkspaceClient {
  return config.kind === 'demo-local'
    ? new DemoWorkspaceClient()
    : new OaWorkspaceClient(config, getToken)
}
