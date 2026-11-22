# Rallyloom 身份、权限与存储架构

> 对应需求（2026-11-21）：Rallyloom 未来要与**任何**外部系统交互 → 需要外部登录授权；
> 核心问题是身份与权限 → **自动同步对方的身份，然后再交由本系统本身去设置权限**。
> 追加需求（2026-11-21）：**应用本身不做存储** → 存储地点由超管统一配置，外置类 OA 系统。

## 设计原则

```
外部系统 ──授权──▶ 连接器层 ──身份──▶ 同步层 ──默认角色──▶ 本地权限层(RBAC)
 (任意)     (浏览器跳转)     (规范化)     (JIT + 组映射)     (团队管理员本地设置)
```

一句话：**身份跟着外部系统走，权限留在 Rallyloom，数据落在超管配置的云端。**

## 五层结构

### 0. 租户层（一家公司一个工作区，v0.9）

- **租户 = 凭证属性，不是数据表的字段。** formal 模式下一个 OA 服务地址 = 一家公司：
  discovery 返回 `display_name`，bootstrap 返回 `tenant: { id: workspace_id, name: display_name }`
  （`electron/workspace-auth.cjs` 的 `validateBootstrap`，`WorkspaceSnapshot.tenant` 契约字段）。
  客户端**不可选择**租户——归属由服务端从工作区绑定与令牌解析。
- demo 模式内置两家互不可见的演示公司：`DEMO_TENANTS`（`src/lib/store/client.ts`）注册
  tenant-a 星辰电商（31 人电商运营）与 tenant-b 云岭智造（`SEED_TEAM_B`，`src/data/team.ts`，
  8 人离散制造）。演示连接器各自声明 `tenantId`（`IdentityConnector.tenantId`，仅 demo 用），
  `DemoWorkspaceClient(tenantId)` 按租户取种；切换公司 = 切换客户端实例与全部工作区状态。
- 隔离语义：团队、角色映射（`SYNC_POLICY_B` 独立 roleMaps）、工位编排、任务/公告/文档
  全按租户分家；B 公司成员对 A 公司数据零可见（演示侧由 `DemoWorkspaceClient` 的种子边界
  保证，真实部署由服务端 bootstrap/ingest 按工作区强制）。
- 适配器侧规则（agent-skill v1.4 §10）：**一源一司**——承接令牌签发时绑定 (工作区, source_id)，
  报文不携带租户字段，跨租户 403 永不静默。事件 Schema 因此零改动。
- **集团与租户联邦（v0.10，可选管辖层）**：多家公司同属一个管辖体系（分公司 + 总部策略）
  时，服务端把它们配置进同一集团：`TenantContext` 增加可选 `groupId` / `groupName`
  （`src/lib/store/types.ts`）——不属集团的公司（多数部署）不带该字段，链路零感知。
  「合并租户」= 归属同一管辖体系的配置，**不是数据物理合并**：各公司数据仍按工作区
  硬隔离，集团层只提供联邦目录（公司归属 = 每人 `attrs["公司"]` 中性属性，无新 Schema）
  与跨租户管理入口。集团超管 = 平台运维轴的化身：登录 `demo-idp-group-admin`（姜衡）
  落入 `DemoGroupClient`（`src/lib/store/client.ts`，只读——写操作一律返回当前快照），
  渲染 `GroupConsole`（`src/components/group/GroupConsole.tsx`）：两家公司卡片（成员/在线
  统计、总部·策略制定方 vs 策略跟随集团总部）+ 合并成员目录 + 「进入工作区」下钻
  （复用 `enterDemo` 以对应公司超管身份进入）。规范见 agent-skill v1.5 §10.1。

### 1. 连接器层（谁都可以接）

`src/lib/identity/types.ts` 的 `IdentityConnector` 是唯一接入接口：

```ts
interface IdentityConnector {
  id: string
  name: string
  protocol: 'oidc' | 'oauth2' | 'saml' | 'ldap' | 'custom'
  status: 'connected' | 'not-configured' | 'mock'
  authorize(): Promise<ExternalIdentity>
}
```

- 新接一个外部系统 = 实现一次该接口并注册进 `CONNECTORS`（`src/lib/identity/connector.ts`）。
- OIDC 走 **Authorization Code + PKCE**，桌面端不持有任何密钥：
  1. 系统默认浏览器打开 IdP 授权页（`shell.openExternal`）；
  2. IdP 回跳 `rallyloom://callback?code=…&state=…`；
  3. OS 按深链协议拉起 Rallyloom（`app.setAsDefaultProtocolClient('rallyloom')`，
     冷启动走 argv、热启动走 `second-instance`，`main.cjs` 统一 `forwardDeepLink()`）；
  4. `preload.cjs` 把 URL 经 `auth:callback` 转发给登录页 `window.rallyloom.auth.onCallback`；
  5. 渲染层用 code 换 token → 拉 userinfo → 得到 `ExternalIdentity`。
   - 打开浏览器前先探一次授权页响应头（`preflightAuthorizePage`）：若 IdP 自渲染的登录页返回
     `Referrer-Policy: no-referrer`，Chromium 会把表单 POST 的 `Origin` 序列化成 `null`，
     IdP 网关的 CORS 过滤器会直接 403「Invalid CORS request」（浏览器里只有一行纯文本）。
     客户端此时抛 `AUTH_PROVIDER_MISCONFIGURED` 并直接提示管理员改为 `same-origin`，
     不再让用户干等 180s 超时。完整症状 / 三种修复 / 禁止事项见 agent-skill
     `integration-spec.md` §11，体检脚本：`node agent-skill/reference/verify-provider.mjs <企业地址>`。
- 演示连接器（demo-idp-admin / demo-idp-owner / demo-idp-guest）模拟同样六步时序，
  用于无 IdP 环境体验全流程（管理员 / 超管 / 外部访客三档身份）。

### 2. 同步层（自动同步对方身份）

`src/lib/identity/rbac.ts` 的 `syncIdentity(external, team, policy)`：

- **锚点**：`connectorId + idpId` 定位同一个人（换邮箱不换身份，邮箱本身可有可无）；
- **JIT provisioning**：新身份登录即自动入队（可在接入管理卡关闭，关闭后走邀请）；
- **资料刷新**：姓名 / 邮箱 / attrs 自由属性 / 外部组 每次登录都刷新为外部最新值（只读，
  中性容器：源系统有什么属性就承接什么，没有部门概念也不报错）；
- **角色只给默认值**：外部组 → 组映射（per-source：`SyncPolicy.roleMaps[connectorId]` 源专属，
  未覆盖走全局 `groupRoleMap`），未命中用 `defaultRole`（member）；
- **本地覆盖优先**：`localRoleOverride` 存在时，同步永不改动角色 —— 系统本身的设置是权威。

### 3. 存储层（应用本身不做存储）

`src/lib/store/types.ts` 的 `WorkspaceClient` 是唯一数据出入口：

```ts
interface WorkspaceClient {
  kind: DatasourceKind            // 'demo-local' | 'oa-rest'
  bootstrap(): Promise<WorkspaceSnapshot>
  syncExternalIdentity(ext): Promise<SyncLoginResult>
  setMemberRole(id, role | null): Promise<WorkspaceSnapshot>
  removeMember(id): Promise<WorkspaceSnapshot>
  savePolicy(patch): Promise<WorkspaceSnapshot>
  saveDatasource(config): Promise<WorkspaceSnapshot>
}
```

- **客户端零落地**：渲染层不落任何数据文件，所有团队/策略/数据源变更经 `WorkspaceClient`
  写回后端，再以 `WorkspaceSnapshot` 整体回读（`App.tsx` 的 `applySnapshot` 是唯一状态入口）；
- **`oa-rest` 实现**（`OaWorkspaceClient`）：真实 `fetch` `${baseUrl}/api/${apiVersion}/workspace/bootstrap`
  等端点，4s AbortController 超时，可携带登录令牌 `Authorization: Bearer`；
- **超管统一配置**：`storage.configure` 权限仅 owner；「团队管理 · 存储」页配置
  服务地址 / 区域 / API 版本 / 是否携带令牌，保存即真实尝试连接——**失败如实报错且不切换数据源**；
- **云数据库直连仅作说明**：桌面分发会暴露库凭据，生产一律走 OA API（安全红线在页面上明示）；
- **回退**：`demo-local`（`DemoWorkspaceClient`，内存）用于无后端演示，行为与真实客户端完全一致。

### 4. 本地权限层（交由系统本身设置）

- 角色：`owner / admin / member / guest`（`ROLES`），权限矩阵 `PERMISSIONS`：
  office.view 全员、team.view 三档、members.invite / members.role / sso.configure owner+admin、
  storage.configure / audit.view 仅 owner。入口处一律 `can(role, permissionId)` 判定（导航可见性、按钮可用性）。
- 管理员在「团队管理 · 成员」里改角色 = 写 `localRoleOverride`；「跟随同步」清除覆盖，
  角色回到组映射结果。
- 访客（guest）看不到团队管理，只有办公室。

## 同步策略（SyncPolicy）

`身份源` 页每个已连接连接器可切换：JIT 自动开通 / 自动同步资料 / 允许本地覆盖角色。
组映射与默认角色在 `SYNC_POLICY.groupRoleMap / defaultRole`。

## 代码地图

| 层 | 文件 |
| --- | --- |
| 类型契约 | `src/lib/identity/types.ts` |
| 连接器注册表 | `src/lib/identity/connector.ts` |
| RBAC + 同步 + 覆盖 | `src/lib/identity/rbac.ts` |
| 存储契约 | `src/lib/store/types.ts` |
| 存储客户端（demo / oa-rest） | `src/lib/store/client.ts` |
| 存储配置 UI | `src/components/team/StorageSection.tsx` |
| 团队种子数据 | `src/data/team.ts` |
| 登录页（授权时序） | `src/components/auth/LoginScreen.tsx` |
| 团队管理页 | `src/components/team/TeamManage.tsx` |
| 会话 gate / 页面切换 | `src/App.tsx` |
| 深链注册与转发 | `electron/main.cjs` → `electron/preload.cjs` |

## 真接入清单（生产化 TODO）

1. `authorize()` 换真协议实现（PKCE state 校验、token 缓存与刷新）；
2. IdP 侧注册回调 `rallyloom://callback`；
3. 同步层后端化：定时目录拉取（SCIM / LDAP pull），不止登录时刷新；
4. OA 后端实现六条端点（bootstrap / sync-identity / set-role / remove / policy / datasource），
   云端数据库由 OA 后端统一访问，桌面永不直连；
5. 审计日志页（audit.view 已预留权限位）；
6. 多团队下的 membership 模型（当前单团队演示）。
