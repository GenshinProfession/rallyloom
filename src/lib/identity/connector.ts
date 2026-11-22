/* Rallyloom — 身份连接器
   演示连接器真实走完「授权 → 回调 → 拉取身份」的数据流（模拟时序）；
   OIDC 骨架按标准 Authorization Code + PKCE 设计，等后端/client_id 就绪即可接真。 */

import type { IdentityConnector } from './types'

const now = () => new Date().toISOString()

/* ------------------------------ 演示 IdP -------------------------------- */

/** 模拟外部 IdP 的目录（演示数据）——attrs 即「源系统有什么属性就给什么」 */
const DEMO_DIRECTORY = {
  admin: {
    idpId: 'demo-u-1001',
    displayName: '陈媛',
    email: 'chen.yuan@demo.rallyloom.local',
    attrs: { 部门: '运营部', 岗位: '运营专员' },
    externalGroups: ['ops', 'ops-lead'],
  },
  owner: {
    idpId: 'demo-u-command-1',
    displayName: '林晓',
    email: 'lin.xiao@demo.rallyloom.local',
    attrs: { 部门: '运营部', 岗位: '增长负责人' },
    externalGroups: ['growth', 'growth-lead'],
  },
  guest: {
    idpId: 'demo-u-2046',
    displayName: '张三',
    email: 'zhang.san@partner.rallyloom.local',
    attrs: { 部门: '外部协作方', 岗位: '品牌顾问' },
    externalGroups: ['partner'],
  },
  /** 无部门系统：没有部门/岗位/邮箱概念，只有名字和项目组——中性模型的试金石 */
  minimal: {
    idpId: 'demo-u-9001',
    displayName: '顾远',
    attrs: {},
    externalGroups: ['ext-project'],
  },
  /** 演示乙公司（云岭智造）超管 */
  b_owner: {
    idpId: 'demo-u-b-1',
    displayName: '罗云',
    email: 'luo.yun@demo.rallyloom.local',
    attrs: { 部门: '总经办', 岗位: '董事长' },
    externalGroups: ['b-owner'],
  },
  /** 演示乙公司（云岭智造）管理员 */
  b_admin: {
    idpId: 'demo-u-b-2',
    displayName: '沈屹',
    email: 'shen.yi@demo.rallyloom.local',
    attrs: { 部门: '制造部', 岗位: '厂长' },
    externalGroups: ['b-factory-lead'],
  },
  /** 集团超管（星澜控股）—— 平台运维轴的演示化身，不进任何公司成员表 */
  group_admin: {
    idpId: 'demo-u-group-1',
    displayName: '姜衡',
    email: 'jiang.heng@demo.rallyloom.local',
    attrs: { 部门: '集团总协调部', 岗位: '集团超管' },
    externalGroups: ['group-owner'],
  },
} as const

export type DemoProfileKey = keyof typeof DEMO_DIRECTORY

/** 演示连接器显示名（登录页/接入管理卡片用） */
const DEMO_LABEL: Record<string, string> = {
  'demo-idp-admin': '演示 IdP · 管理员',
  'demo-idp-owner': '演示 IdP · 超管',
  'demo-idp-guest': '演示 IdP · 外部访客',
  'demo-idp-minimal': '演示 IdP · 无部门系统',
  'demo-idp-b-owner': '演示 IdP · 超管（云岭智造）',
  'demo-idp-b-admin': '演示 IdP · 管理员（云岭智造）',
  'demo-idp-group-admin': '演示 IdP · 集团超管（星澜控股）',
}

/** 演示连接器：模拟「浏览器跳转 → 同意授权 → 回调 → userinfo」全过程 */
function demoConnector(id: string, profile: DemoProfileKey, note?: string, tenantId?: string): IdentityConnector {
  return {
    id,
    name: DEMO_LABEL[id] ?? '演示 IdP',
    protocol: 'oidc',
    status: 'mock',
    note: note ?? '模拟 OIDC 全流程：授权页 → 深链回调 → 拉取身份（无需真实账号）',
    ...(tenantId ? { tenantId } : {}),
    authorize: async () => {
      // 真连接器在此处：生成 PKCE verifier/challenge → shell 打开系统浏览器
      // → 等待 rallyloom://callback?code=… 深链 → 换 token → 调 userinfo。
      // 演示模式直接以目录数据返回。
      await new Promise((r) => setTimeout(r, 1500))
      const p = DEMO_DIRECTORY[profile]
      return {
        idpId: p.idpId,
        connectorId: id,
        displayName: p.displayName,
        email: 'email' in p ? p.email : undefined,
        attrs: { ...p.attrs },
        externalGroups: [...p.externalGroups],
        syncedAt: now(),
      }
    },
  }
}

/* --------------------------- OIDC 骨架（未配置） -------------------------- */

/** OIDC 标准连接器 —— 接生产 IdP（Keycloak / Auth0 / Okta / Azure AD…）的模板 */
function oidcConnector(): IdentityConnector {
  return {
    id: 'oidc-standard',
    name: 'OIDC 标准协议',
    protocol: 'oidc',
    status: 'not-configured',
    note: 'Authorization Code + PKCE，系统浏览器跳转，rallyloom:// 深链回调；配置 Issuer 与 Client ID 后启用',
    authorize: () => {
      // 骨架阶段拒绝启动；配置就绪后实现为：
      // 1) crypto.randomUUID 生成 state/nonce + PKCE S256
      // 2) window.rallyloom 打开系统浏览器：
      //    {issuer}/authorize?response_type=code&client_id=…&redirect_uri=rallyloom://callback
      //    &scope=openid profile email groups&state=…&code_challenge=…&code_challenge_method=S256
      // 3) main.cjs 捕获深链 → webContents.send('auth:callback', url)
      // 4) preload → renderer 解析 code → token endpoint 换 token → userinfo 拉身份
      return Promise.reject(new Error('OIDC 连接器尚未配置 Issuer / Client ID'))
    },
  }
}

/* ---------------------------- 企业系统占位 ------------------------------ */

/** 企业 IM 类连接器占位（企业微信/飞书/钉钉）：OAuth2 变体 + 通讯录同步 */
function wecomPlaceholder(id: string, name: string): IdentityConnector {
  return {
    id,
    name,
    protocol: 'oauth2',
    status: 'not-configured',
    note: '授权后同步通讯录组织架构，外部部门/角色自动映射（需企业管理员授权）',
    authorize: () => Promise.reject(new Error(`${name} 连接器待接入：需要企业 CorpID 与 Agent 配置`)),
  }
}

/** LDAP/AD 占位：内网目录直连 */
function ldapPlaceholder(): IdentityConnector {
  return {
    id: 'ldap-directory',
    name: 'LDAP / AD 目录',
    protocol: 'ldap',
    status: 'not-configured',
    note: '绑定服务账号后按部门 DN 自动同步成员与组',
    authorize: () => Promise.reject(new Error('LDAP 连接器待接入：需要目录地址与绑定账号')),
  }
}

/** 全部已注册连接器（团队管理「接入管理」页展示的就是这张表） */
export const CONNECTORS: IdentityConnector[] = [
  // 星辰电商（演示甲公司）
  demoConnector('demo-idp-admin', 'admin', undefined, 'tenant-a'),
  demoConnector('demo-idp-owner', 'owner', undefined, 'tenant-a'),
  demoConnector('demo-idp-guest', 'guest', undefined, 'tenant-a'),
  demoConnector('demo-idp-minimal', 'minimal', '源系统没有部门概念：只有名字与项目组，邮箱缺失也不报错（中性容器试金石）', 'tenant-a'),
  // 云岭智造（演示乙公司）—— 与甲公司完全隔离的第二租户
  demoConnector('demo-idp-b-owner', 'b_owner', '演示乙公司超管：体验第二租户的独立团队、角色映射与工位编排', 'tenant-b'),
  demoConnector('demo-idp-b-admin', 'b_admin', '演示乙公司管理员：登录后只能看到云岭智造的成员，看不到星辰电商', 'tenant-b'),
  // 星澜控股集团 —— 平台运维轴演示化身（tenantId='group'：集团视图，不进公司成员表）
  demoConnector('demo-idp-group-admin', 'group_admin', '集团超管：不进任何公司成员表，跨租户控制台 + 合并成员目录（策略随集团总部）', 'group'),
  oidcConnector(),
  wecomPlaceholder('wecom', '企业微信'),
  wecomPlaceholder('feishu', '飞书'),
  ldapPlaceholder(),
]

export function getConnector(id: string): IdentityConnector | undefined {
  return CONNECTORS.find((c) => c.id === id)
}
