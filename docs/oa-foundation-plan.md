# Rallyloom 开源 OA 底座架构规划

> 对应需求（2026-11-21）：「并不是所有的系统都有划分部门……理论上我们这套开源 OA
> 应该做的是一个事情：**提供入口，提供一套接口规范，由其他系统写一套接口来接入我们**，
> 我们承接对方的数据。目前主要是搭一个底子架构——哪些部分要做，哪些可以二开。」

## 一、定位反转：从「我们去适配别人」到「别人来适配我们」

| | v0.3 / v0.4（已完成） | 开源 OA 底座（现在要转向的） |
| --- | --- | --- |
| 我方角色 | 客户端 / 依赖方（Relying Party） | **承接方**：数据的家、规范的发布者 |
| 对方角色 | 权威 IdP / 数据源 | **接入方**：按我们的规范写适配器 |
| 核心交付 | 一个能连外部 IdP 的桌面应用 | **《接入规范》** + 承接管道 + 底座服务 |
| 数据流向 | 我们去拉（登录时同步） | 对方**推**给我们（目录/事件），我们承接落库 |
| 部门假设 | `dept / title` 一等字段 | **不假设任何组织结构**，只提供中性容器 |

方向虽然反转，但 v0.1–v0.4 的代码结构大部分是**可继承的**——连接器注册表反转为「接入方注册表」，
同步函数就是承接管道的雏形，`WorkspaceClient` 的六条端点就是服务端 API 的草案（见第六节映射表）。

## 二、部门问题的根治：中性身份模型

**病根**：`src/lib/identity/types.ts` 的 `ExternalIdentity` 把 `dept: string; title: string`
写成一等必填字段，成员表格也硬编码「部门/职位」列——等于把「对方系统有部门」当成了世界公理。

**方案：三层中性容器**（替换 dept/title）：

```
Person {
  source_id        // 哪个系统接进来的（锚点的一半）
  external_user_id // 对方系统里的用户 ID（锚点的另一半，换邮箱不换身份）
  display_name      // 显示名（唯一必填的业务字段）
  email?            // 可选
  groups: string[]  // 中性组：可表达部门、项目、地点、审批链——语义由接入方自带
  attrs: Record<string, string>  // 自由属性：对方有什么就放什么
}
```

- `groups` 是**中性容器**：对方有部门就把部门名放进来（`dept:销售部`），没有部门就放
  项目组/地点/任意标签；底座永不解释组名含义，只提供「组 → 本地角色」映射引擎；
- `attrs` 承接长尾字段：岗位、工号、分机、职级……显示层按 key 渲染键值徽章，
  **缺失不报错、不占位假设**，有什么显示什么；
- 现有演示数据（陈媛/林晓/张三）的 `dept/title` 降级为 `attrs` 的示例条目，行为不变。

## 三、底座必须做的部分（核心清单）

判定原则一句话：**凡是「换个接入系统就要重写」的都是二开区；凡是「无论谁接入都不变」的都是底座。**

1. **《接入规范》本体**——接口契约文档 + JSON Schema + 参考适配器（demo adapter）。
   这是「提供一套接口规范」的直接交付物，没有它生态无从谈起；
2. **数据承接管道**：接收 → 校验 → 规范化 → 落库 → 审计。幂等键（source_id + external_user_id）、
   事件去重（event_id）、schema 版本号，全在底座；
3. **中性模型 + 映射引擎**：`groups → 本地角色` 的映射规则按接入方逐个配置
   （现在硬编码在 `SYNC_POLICY.groupRoleMap`，Phase B 起改为 per-source 配置）；
4. **RBAC 与本地覆盖**：`owner/admin/member/guest` × 权限矩阵；本地覆盖优先、同步永不重置——
   「承接数据」与「本系统设权限」的边界已实现，保留；
5. **底座服务端 + 云端数据库**：`WorkspaceClient` 六条端点的服务端实现；数据库 schema 归底座管，
   接入方永远不碰库（桌面直连红线在 v0.4 已声明）；
6. **入口 UI**：登录页 + 工作台；办公室场景降格为「第一号工作区插件」，证明 UI 插槽可行；
7. **审计底座**：每次承接（人/组/成员变更）写变更日志，`audit.view` 权限位已预留，只欠页面。

## 四、留给二开的部分（放开生态）

1. **协议/系统适配器**：企业微信、飞书、钉钉、LDAP、老 OA 数据迁移器——
   按规范各自实现，**不入底座代码库**（底座只保留 demo 参考实现）；
2. **业务模块**：审批流、考勤、公告、文档、报销、报表——OA 的业务面全部走插件插槽；
3. **组织语义插件**：部门树 / 岗位体系 / 汇报线的展示与编辑——底座只存中性组，
   「部门」只是接入方和二开插件赋予的解释；
4. **工作区皮肤**：办公室场景 / 经典列表 / 看板视图，作为可切换的工作区插件；
5. **通知渠道与 webhook 分发**：邮件、IM 推送、第三方回调；
6. **行业定制**：合规报表、行业字段包、私有化部署脚本。

## 五、《接入规范》草案（v0）

### 5.0 Integration Kit：把规范做成「照着做就能接上」的技能包

光有一份 PDF 式接口文档，二开快不起来。规范必须以**工具包**形态交付，接入方拿到手的是
「clone → 填空 → 跑通」的路径，而不是「读懂 → 自己猜」的路径：

| # | 交付物 | 形态 | 解决什么 |
| --- | --- | --- | --- |
| 1 | 规范本体 | 文档（人读）+ **OpenAPI 3 / JSON Schema**（机器读） | 二开方直接生成 SDK、本地校验 payload，不用手抄字段 |
| 2 | 参考适配器 | 可运行的 demo adapter 仓库 | 全流程样板：字段映射、对账、重试怎么写都有出处 |
| 3 | 自测沙盒 | demo token + mock 端点 + CLI（校验/模拟推送/对账 diff） | **不用等底座部署完就能联调**，接入验收自动化 |
| 4 | 版本承诺页 | API 清单上显式标注 `stable(v1)` / `experimental` | 生态敢投入的前提：锁死的永不破坏性变更，实验的随时可谈 |

### 5.1 三种接入模式

| 模式 | 方向 | 用途 |
| --- | --- | --- |
| 账号漫游 | 用户从对方系统进入我们（OIDC，我们当 RP） | 「提供入口」——v0.3 深链 + PKCE 机制原样保留 |
| 目录推送 | 对方服务端 → 我方 REST 端点（API Token） | 「承接对方数据」的主通道：人、组、成员关系 |
| 事件回调 | 对方 webhook 推变更，我方可回拉对账 | 增量同步：入职/离职/调组实时反映 |

### 5.2 数据契约（草案）

```jsonc
// POST /api/v1/sources/{source_id}/persons:upsert
{
  "schema_version": 1,
  "event_id": "uuid",                  // 幂等去重键
  "person": {
    "external_user_id": "u-1001",      // 与 source_id 共同构成幂等锚点
    "display_name": "陈媛",
    "email": "chen.y@example.com",
    "groups": ["ops", "ops-lead"],     // 中性组，语义自带
    "attrs": { "岗位": "运营专员" }     // 长尾字段，缺省不报错
  }
}

// POST /api/v1/sources/{source_id}/persons:remove
// POST /api/v1/sources/{source_id}/groups:upsert   { external_group_id, name, attrs }
// POST /api/v1/sources/{source_id}/reconcile       全量对账（对方定期兜底推送）
```

### 5.3 底座承诺（规范必须写死的部分）

- **认证**：服务端到服务端 API Token，超管在「存储/接入」页生成与轮换；
- **幂等**：同一 `source_id + external_user_id` 重复推送 = 更新；`event_id` 去重窗口 ≥ 72h；
- **兼容**：`schema_version` 不兼容时 422 明确报字段，**永不静默丢弃**；
- **角色边界**：推送只影响「默认角色」（组映射），**本地覆盖永不被推送重置**；
- **审计**：每次承接产生变更记录，管理员可查。

### 5.4 接入方职责（写给二开者）

1. 实现「对方概念 → `groups/attrs`」的字段映射；
2. 全量对账（首次接入 + 定期兜底）+ 增量事件（变更即推）；
3. 处理 422/410 错误与重试（指数退避）；
4. 不得绕过规范直连底座数据库（桌面与服务端同此红线）。

## 六、现有资产映射（v0.4 → 底座）

| 现有资产 | 文件 | 新定位 | 动作 |
| --- | --- | --- | --- |
| `IdentityConnector` 接口 | `src/lib/identity/types.ts` | 接入方注册表（一个 connector = 一个已接入 source） | 语义反转 + dept/title 降级为 attrs |
| `DEMO_DIRECTORY` 演示目录 | `src/lib/identity/connector.ts` | **参考适配器**（规范的 demo 实现） | 改造档案结构，保留 OIDC 流程 |
| `syncIdentity()` | `src/lib/identity/rbac.ts` | 承接管道的规范化步骤 | 直接复用（锚点/JIT/组映射已对） |
| `groupRoleMap` | `src/lib/identity/rbac.ts` | 映射引擎 | 硬编码 → per-source 可配置 |
| `WorkspaceClient` 六端点 | `src/lib/store/types.ts` `client.ts` | **底座服务端 API 草案** | 契约保留，服务端在 Phase C 实现 |
| RBAC + 权限矩阵 | `src/lib/identity/rbac.ts` | 权限底座 | 不动 |
| 存储页（超管配置） | `src/components/team/StorageSection.tsx` | 「接入与存储」管理页 | 加 API Token 生成/轮换 |
| 团队管理四页签 | `src/components/team/TeamManage.tsx` | 管理后台 | 「身份源」改名「接入管理」 |
| 办公室场景 | `src/components/office/` | 第一号工作区插件 | 保留，归入 UI 插槽示范 |
| 登录页 | `src/components/auth/LoginScreen.tsx` | 入口 | 保留 |
| 深链 + PKCE | `electron/main.cjs` | 账号漫游通道 | 保留 |

## 七、分阶段路线

- **Phase A（已完成，v0.1–v0.4）**：桌面壳 + 身份锚点 + RBAC + 本地覆盖 + 存储契约 + 入口 UI；
- **Phase B（已完成，v0.5）**：部门根治 + 规范发布 + agent-skill。
  1. ✅ `ExternalIdentity`/`TeamMember` attrs 化（中性容器），成员表「属性徽章」渲染（`src/components/team/TeamManage.tsx`）；
  2. ✅ 《接入规范》转正为机器可读 skill 包：`agent-skill/`（SKILL.md + integration-spec.md + 5 份 JSON Schema + 可运行参考适配器 `reference/adapter-demo.mjs`，`--validate` 自测通过）；
  3. ✅ 演示「无部门系统」接入档 `demo-idp-minimal`（顾远：无 attrs/无邮箱，快照断言 MINIMAL_ATTRS_OK）；
  4. ✅ 「身份源」页改名「接入管理」；`groupRoleMap` → per-source（`SyncPolicy.roleMaps` + `sourceRoleMap()`，超管/演示 IdP · 超管 各自持有映射表）；
- **Phase B+（已完成，v0.6）**：数据外部化边界落地——「Rallyloom 不提供核心业务数据接口」成为产品级承诺。
  1. ✅ 交流室（复用 @chatscope/chat-ui-kit-react；频道=大厅+房间；`chat.use` 权限；消息走 `ChatClient` 后端承接，演示源自带自动回复）；
  2. ✅ 外置数据看板插槽（`DataSlot`：demo-feed / external-api `{rows:[{label,value,delta?}]}`，房间挂 URL 即接入，超管配置）；
  3. ✅ ACTIVITY 外部化契约：规范 v1.1 追加 `activity.push` 事件 + `schemas/activity-push.schema.json` + integration-spec §9 数据外部化六条边界表；
  4. ✅ agent-skill 升 v1.1（SKILL.md 契约速查/验收清单同步）。
- **Phase B++（已完成，v0.7）**：四大必接板块成型——**团队管理 · 办公室 · 交流室 · 任务看板**（其余板块一律 Phase D 二开插槽）。
  1. ✅ 任务看板（类飞书多维表格）：看板视图（dnd-kit 拖拽换列）+ 表格视图（`attrs` 自由属性自动出列=动态列）；`TaskClient` 承接契约与交流室同构；
  2. ✅ 规范 v1.2 追加 `task.upsert` / `task.remove` + 2 份 JSON Schema；幂等锚点 `source_id + external_task_id`；本地拖列/新建不被推送重置（承接不重置哲学贯穿）；
  3. ✅ agent-skill 升 v1.2（SKILL.md/README 同步）。
- **Phase B+++（已完成，v0.8）**：必接板块扩至六个——追加**通知中心**与**文档中心**。
  1. ✅ 通知中心：办公室顶部流动横幅（置顶优先/hover 暂停）+ 通知中心页（级别徽章/全部已读）；公告承接走 `notice.push` / `notice.remove`；已读为员工本机状态永不回写；
  2. ✅ 文档中心（类钉钉）：知识库空间树 + 搜索 + 内置 Markdown 查看器（react-markdown + remark-gfm）；文档承接走 `doc.upsert` / `doc.remove`（`format: markdown 内联 | link 外链`），**对方的文档存储记录格式 = 契约字段集**；
  3. ✅ 规范 v1.3 追加 4 事件 + 4 份 JSON Schema（共 12 份）；agent-skill 升 v1.3。
- **Phase B++++（已完成，v0.9）**：多租户——一家公司一个工作区，一源一司。
  1. ✅ 租户=凭证属性非数据字段：formal 侧 bootstrap 返回 `tenant { id=workspace_id, name=display_name }`（`electron/workspace-auth.cjs`），客户端不可选；demo 侧 `DEMO_TENANTS` 注册表 + `DemoWorkspaceClient(tenantId)` 按租户取种（`src/lib/store/client.ts`）；
  2. ✅ 演示双公司互不可见：星辰电商（tenant-a，31 人）与云岭智造（tenant-b，`SEED_TEAM_B` 8 人，独立 `SYNC_POLICY_B` roleMaps 与工位编排）；登录页演示角色按公司分组展示；
  3. ✅ 规范 v1.4 追加 §10 多租户（一源一司/报文禁带租户字段/跨租户 403 不静默/两公司两 source_id/子公司别滥用先用 groups+attrs/guest home_tenant 联邦预留/自托管 default 退化）——**全部事件 Schema 零改动**；agent-skill 升 v1.4（SKILL.md 禁止事项补一条）；
  4. ✅ Phase C 服务端原则先行写定：全表 workspace-scoped、承接令牌签发绑定 (workspace, source_id) 两级。
- **Phase B+++++（已完成，v0.10）**：集团与租户联邦——租户之上的**可选管辖层**。
  1. ✅ `TenantContext` 增可选 `groupId/groupName`（`src/lib/store/types.ts`）：不属集团的公司不带字段、链路零感知；「合并租户」= 归属同一管辖体系的配置，数据仍按公司硬隔离；
  2. ✅ 集团超管演示档 `demo-idp-group-admin`（姜衡）：平台运维轴化身，不进任何公司成员表；`DemoGroupClient`（只读）+ `GroupConsole`（两家公司卡片 + 42 人合并目录，公司归属 = `attrs["公司"]` 中性属性 + 「进入工作区」以对应公司超管身份下钻）；
  3. ✅ 规范 v1.5 追加 §10.1（可选管辖层/合并=归属配置非物理合并/策略跟随总部/集团超管=平台运维轴不进成员表/联邦目录复用中性 attrs）——对适配方纯文档版本，字段/事件/端点零新增；agent-skill 升 v1.5。
- **Phase C（底座服务端）**：六端点实现 + 云端数据库 schema + 多团队 + 审计页；
- **Phase D（插件区）**：业务模块插槽、工作区插槽、webhook 分发、参考二开模板仓库。

## 八、二开点速查（给接入方/生态的「能做什么」清单)

| 二开点 | 交付物形态 | 门槛 |
| --- | --- | --- |
| 系统适配器 | 独立仓库/服务，实现目录推送 + 漫游跳转 | 读《接入规范》+ demo 参考 |
| 业务模块 | 插件包（注册到业务插槽） | Phase D 插槽 API |
| 工作区皮肤 | UI 插件（办公室/列表/看板…） | Phase D 插槽 API |
| 组织语义展示 | 展示插件（读中性 groups/attrs 自行解释） | 只读 API |
| 通知/webhook | 配置式接入 | Phase D |
| 行业字段包 | attrs 约定 + 展示模板 | 只需文档约定 |

---

**结论**：底座做七件事——**规范、承接管道、中性模型、映射引擎、RBAC、服务端与库、入口与审计**；
其余全部二开。当前代码已覆盖 Phase A、Phase B（v0.5：中性模型落地 + 规范/agent-skill 发布）、Phase B+（v0.6：交流室 + 看板/动态外部化，规范 v1.1）、Phase B++/B+++（v0.7/v0.8：任务看板、通知中心、文档中心，规范 v1.2/v1.3）、Phase B++++（v0.9：多租户，规范 v1.4）与 Phase B+++++（v0.10：集团与租户联邦，规范 v1.5）；下一棒是 Phase C 服务端。
