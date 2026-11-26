# Rallyloom OA 接入规范（Integration Spec）

版本：`v2.2`（schema_version = 1；v1.1 追加 `activity.push` 与 §9 数据外部化，v1.2 追加 `task.upsert` / `task.remove` 任务承接，v1.3 追加公告与文档承接，v1.4 追加 §10 多租户，v1.5 追加 §10.1 集团与租户联邦，v1.6 追加登录页 Origin 排错，v1.7 追加富文本与文档附件，v1.8 追加接入排错地图，v1.9/v1.10 增加可选精选歌曲；v2.0 将 §13 定义为共享曲库运行时 API、MP4 上传和每日统一随机选歌；v2.1 追加完整 Provider REST 契约；v2.2 扩展通用汇报的分区、重复表格和提交窗口，旧模板继续兼容）
适用对象：要把自家系统的「人 / 组 / 成员关系」接入 Rallyloom 开源 OA 的任何团队或 AI Agent。
Rallyloom 在接入关系中是**承接方**：提供入口、规范与身份容器；**不假设源系统有任何特定的组织模型**。

企业自托管部署、正式工作区绑定和基础数据库接入见 [企业接入与授权方案](enterprise-authorization.md)。本文件的事件与载荷版本独立于部署和授权接口。

> 一句话心智模型：**你的系统里有什么属性，就推什么属性；没有的不用造。**
> 部门？那只是你系统里的一个属性键。没有部门？完全没关系。

---

## 1. 三种接入模式（按场景选一种或组合）

| 模式 | 机制 | 适用场景 | 你需要实现的东西 |
|------|------|----------|------------------|
| **A. 账号漫游** | OIDC Authorization Code + PKCE；桌面端跳系统浏览器授权，`rallyloom://callback` 深链拉回 | 你的系统已是 IdP（有登录态），用户要「用它登录 Rallyloom」 | OIDC 端点 4 件套 + 在你的 IdP 注册回调 URI `rallyloom://callback` + 在 userinfo/token 里带上 `groups` claim |
| **B. 目录推送** | 你的系统把人/组全量或增量 POST 到 Rallyloom 承接端点 | 你的系统是「用户源」但不是 IdP（如 CRM、ERP、HR 系统） | 一个适配器服务：映射字段 → 按 §3 契约推送 → 按 §5 幂等/重试 |
| **C. 事件回调** | 组织变更时（入职/转岗/离职/建组）即时推送单事件 | 变更低延迟敏感，叠加在 B 之上 | 在你的系统里挂变更钩子，产出 §4 事件信封 |

**选型建议**：内部系统选 B（+C 可选）；对外 SaaS 想让客户「用你们的账号登录协作台」选 A；A+B 组合=漫游加全量对账，最稳。

---

## 2. 中性身份容器（唯一数据模型）

Rallyloom 只认一个最小三元组 + 三个可选槽位，**除此之外没有任何必填字段**：

```jsonc
{
  "source_id": "crm",                  // 必填：你的系统在 Rallyloom 的注册 ID（接入时约定，如 "crm" / "hrm" / "wecom"）
  "external_user_id": "u-8899",        // 必填：人在你系统里的稳定 ID（离职重建账号会变，因此必须是当前账号的持久 ID）
  "display_name": "顾远",              // 必填：建议显示名
  "email": "guyuan@crm.example.com",  // 可选：有就给，没有不报错
  "attrs": {                           // 可选：自由属性键值对（全 string）
    "工号": "E1024",                   //   部门/岗位/城市/工号……你系统有什么就放什么
    "城市": "上海"                     //   Rallyloom 原样展示，不做任何语义假设
  },
  "groups": ["crm-sales", "ext-project"] // 必填：中性组 ID 列表，可为空数组
}
```

硬规则：
- `attrs` 的键与值都是字符串；**禁止**在 `attrs` 里夹带角色/权限语义（Rallyloom 不会读它做任何决策）。
- `groups` 是中性组，**不是部门**；组的语义（比如哪个组对应管理员）由 Rallyloom 侧按 §6 组映射配置，不由你决定。
- 一个人在你的系统被删除 → 发 `person.remove`；**禁止**用空 attrs 或改名来「软删除」。
- 同步锚点 = `source_id + external_user_id`。**改名/改邮箱/改组都只是 upsert**，Rallyloom 会原地刷新，不会产生新成员。

---

## 3. 承接端点（Rallyloom 侧 API，B/C 模式使用）

Base URL 与令牌在接入时由 Rallyloom 超管发放（页面：团队管理 → 接入管理）。所有请求带 `Authorization: Bearer <token>`。

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/v1/ingest/events` | POST | 提交单个事件信封（§4）——**首选**，C 模式用一个端点打全部 |
| `/api/v1/ingest/reconcile` | POST | 全量对账快照（§4.4），B 模式的兜底/定时任务 |
| `/api/v1/ingest/status?event_id=` | GET | 查询某事件的处理结果（可选实现） |

---

## 4. 事件信封与数据契约

所有推送共用一个信封。**信封必填五字段**，缺一即 400：

```jsonc
{
  "event_id": "5f1c…-uuid",            // 必填：UUID，幂等去重键（服务端 ≥72h 窗口去重）
  "event_type": "person.upsert",       // 必填：person.upsert | person.remove | group.upsert | members.reconcile | activity.push | task.upsert | task.remove
  "occurred_at": "2026-11-21T18:00:00+08:00", // 必填：ISO 8601，带时区
  "schema_version": 1,                 // 必填：整数，当前为 1
  "payload": { /* 按 event_type，见下 */ }
}
```

### 4.1 `person.upsert`
payload = §2 容器本体（去掉 groups 语义说明）。新建即 JIT 入队；已存在则刷新 `display_name/email/attrs/groups`。**永不改动本地角色覆盖**。

### 4.2 `person.remove`
payload = `{ "source_id": "crm", "external_user_id": "u-8899" }`
该成员从团队移除；其本地角色设置保留归档，同 ID 再次 upsert 视为重新入职。

### 4.3 `group.upsert`
```jsonc
{ "source_id": "crm", "group_id": "crm-sales", "display_name": "销售组", "description": "可选" }
```
组先于/伴随人注册，展示名才可读；不注册也能推（Rallyloom 显示原始 group_id）。

### 4.4 `members.reconcile`（全量对账）
payload = `{ "source_id": "crm", "persons": [<§2 容器数组>] }`
语义：**以此次快照为准**——快照里有的人 upsert，快照里没有但此前存在的人被移除。适合每夜定时跑；平时用增量事件。服务端在处理 reconcile 时同样不动角色覆盖。

### 4.5 `activity.push`（工作区动态，v1.1）
payload 见 `schemas/activity-push.schema.json`。语义：**动态（ACTIVITY）是 Rallyloom 提供的展示能力，但内容一律由外部系统推送**——Rallyloom 自己不生成任何动态。
```jsonc
{
  "source_id": "crm",
  "items": [
    {
      "actor_id": "u-8899",              // 必填：发起人 external_user_id（挂头像；查无此人则展示 actor_name 兜底）
      "actor_name": "顾远",              // 可选：成员尚未同步时的显示名兜底
      "text": "把 3 个新线索转入了「华东大区」看板",  // 必填：≤280 字，原样展示
      "kind": "crm",                     // 可选：自由类型标签，Rallyloom 只作徽章展示
      "url": "https://crm.example.com/board/42",   // 可选：跳回你系统的 HTTPS 链接
      "occurred_at": "2026-11-21T18:00:00+08:00"   // 可选：缺省用信封时间
    }
  ]
}
```
硬规则与 §2 同源：**有什么推什么，没有的不造**；`actor_id` 查无此人不报错（展示兜底名）；禁止推角色/权限语义；批大小 ≤100 条。适配器典型用法：在你的系统里挂业务事件钩子（成单/转岗/发版）→ 组装 items → 单信封推送，幂等与重试与 §5 完全一致。

### 4.6 `task.upsert` / `task.remove`（任务看板，v1.2）
payload 见 `schemas/task-upsert.schema.json` / `schemas/task-remove.schema.json`。语义：**任务看板（类飞书多维表格）是 Rallyloom 必接板块之一，但任务数据一律由外部系统推送**——Rallyloom 只承接与展示。
```jsonc
{
  "source_id": "crm",
  "external_task_id": "TK-2246",       // 必填：幂等锚点，重推原地刷新绝不产生重复任务
  "title": "华东大区线索分配规则调整",   // 必填：≤200 字
  "status": "doing",                   // 可选：企业定义的状态 id（省略使用企业 defaultStatus）
  "priority": "P1",                    // 可选：P0|P1|P2|P3（你自己的优先级模型请放 attrs 不映射）
  "assignee_id": "u-8899",            // 可选：负责人 external_user_id（挂头像；查无此人展示 assignee_name）
  "assignee_name": "顾远",             // 可选：兜底显示名
  "due": "2026-11-30",                // 可选：截止日
  "attrs": { "渠道": "私域", "金额": "¥86,400" }  // 可选：自由键值 → 表格视图自动出列（多维字段本质）
}
```
状态与字段由企业任务源定义，定义结构见 `schemas/task-board.schema.json`（客户端 `TaskClient.board`）。状态使用接入方原始 id；`defaultStatus` 必须存在，状态/字段 id 不得重复。`category` 仅用于进行中计数与截止提醒，不改变企业状态名称。`transitions` 缺省允许所有列，空数组不允许跨列；服务端仍必须逐次校验权限和流转。未识别的存量状态单独保留一列，禁止静默丢任务。

`fields` 决定自定义字段的顺序、名称、类型、必填项和选项；`attrs` 按字段 id 传值（string）。字段表单与表格列使用此定义，空数据也能显示字段。核心标题、负责人、截止日保留为通用字段。拖拽提交 `TaskPosition { status, beforeId }`，接入方原子更新状态与顺序并返回权威列表；失败须回滚并显示错误。推送与编辑冲突由服务端版本控制，不能默认以本机状态覆盖企业状态。

**正式运行**：Rallyloom 0.12 通过企业协作 REST 接口读取状态定义和业务数据，见 [OA 协作契约](oa-collaboration.md)。企业决定角色与数据范围；不提供某功能时不授予其能力。演示源的四列只属于演示公司。

### 4.7 `notice.push` / `notice.remove`（通知中心，v1.3）
payload 见 `schemas/notice-push.schema.json` / `schemas/notice-remove.schema.json`。语义：**通知中心是 Rallyloom 系统内置板块，但公告数据由外部系统推送**——横幅挂在办公室顶部流动展示，通知中心页展示全量与未读；已读状态是员工本机状态，永不回写源系统。
```jsonc
{
  "source_id": "oa",
  "items": [                              // 批 ≤100 条
    {
      "external_notice_id": "NOT-2026-0081",   // 必填：幂等锚点，同 ID 重推原地刷新
      "title": "11月大促复盘会提前至明早 10:00", // 必填
      "summary": "全体运营组参加，请提前十分钟入会。",
      "level": "urgent",                  // 可选：info|warning|urgent（不给默认 info）
      "pinned": true,                     // 可选：横幅置顶
      "url": "https://oa.example.com/notices/81", // 可选：详情链接
      "attrs": { "发布": "运营指挥台" }    // 可选：自由键值 → 通知卡属性徽章
    }
  ]
}
```
硬规则同源：**有什么推什么**；`level` 只是展示级别，禁止映射任何权限语义；撤回必须显式 `notice.remove`；置顶可被超管本地撤下（承接不重置）。

### 4.8 `doc.upsert` / `doc.remove`（文档中心，v1.3）
payload 见 `schemas/doc-upsert.schema.json` / `schemas/doc-remove.schema.json`。语义：**文档中心（类钉钉）是内置板块——查看器与编辑器内置，文档数据本身由云端/外部系统推送或托管**。「存储数据库格式」= 本 payload 字段集（即对方数据库里一篇文档应存的全部字段）。

**v1.7 富文本与附件**（查看器/编辑器内置，不要求适配器实现任何富文本能力）：

- 正文默认按 `content_format: "markdown"`（缺省值）承接，兼容所有老推送；
- 需要正文带标题层级、代码块、表格、图片、附件卡片等结构时，推 `content_format: "html"`，`content` 为 HTML 片段（TipTap schema：`<h1..h3>/<p>/<ul>/<ol>/<blockquote>/<pre><code class="language-*">`/`<table>/<img>/<div data-attachment=…>`）；Rallyloom 用同一套富文本管线渲染，无需适配器做任何 UI 工作；
- 附件放 `attachments: [{id?, name, size?, mime?, url}]`（≤64 个）：`url` 优先 https 直链，内网自托管可用 `data:` URL；正文中如需内联卡片位置，在 HTML 里放 `<div data-attachment="附件id"></div>`（`id` 缺省时按 `name` 匹配）；
- **附件内容不归 Rallyloom**：它只存引用与展示元数据，文件本体仍在你方对象存储/文档库；删除文档时必须同时清理你方文件（`doc.remove` 只移除引用）。
```jsonc
{
  "source_id": "hr",
  "external_doc_id": "HR-LEAVE-2026",     // 必填：幂等锚点，同 ID 重推原地刷新（含正文替换）
  "title": "2026 年假与调休政策",          // 必填
  "space": "制度规范",                    // 可选：知识库/空间（钉钉「知识库」语义；缺省「未分组」）
  "folder_path": ["人事制度", "假勤政策"],  // 可选：知识库内从上到下的目录，缺省归入知识库根目录
  "format": "markdown",                   // 必选其一：markdown（内联正文）| link（外链托管）
  "content": "# 年假政策\n…",              // format=markdown 必填，≤256KB；超大文档请拆分或用 link
  "url": "https://hr.example.com/policies/leave-2026", // format=link 必填
  "owner_name": "人事行政",               // 可选：署名（展示用，非身份锚点）
  "updated_at": "2026-11-20T10:00:00Z",
  "attrs": { "版本": "V2", "适用": "全员" } // 可选：自由键值 → 列表标签
}
```
硬规则同源：正文变更走同 ID 重推（原地替换）；下架必须显式 `doc.remove`，禁止清空字段冒充删除；禁止把权限/密钥塞进 `attrs` 或正文。

机器可读契约：`schemas/*.json`（JSON Schema 2020-12），提交前请用其做本地校验。

---

## 5. 响应、幂等与错误处理（必须实现）

| 状态码 | 语义 | 适配器行为 |
|--------|------|-----------|
| 200 | 已承接 | 记录 event_id → 完成 |
| 409 | event_id 重复 | **视为成功**（幂等命中），勿重试 |
| 400 | 信封/载荷结构错误 | 修正后重发；连续失败进死信，告警人工 |
| 401/403 | 令牌失效/权限不足 | 停止重试，联系 Rallyloom 超管换发令牌 |
| 422 | schema_version 不兼容 | **绝不静默丢弃**：保留事件、告警，等待 Rallyloom 升级后重放 |
| 5xx / 网络错误 | 服务端/链路故障 | 指数退避重试（如 1s→4s→16s，3 次后转定时补推或 reconcile 兜底） |

- **去重承诺**：Rallyloom 对 `event_id` 至少 72 小时幂等，重发安全。
- **顺序承诺**：单人的事件按 `occurred_at` 串行化处理；不需要你保证全局顺序。
- **永不静默**：任何被拒事件都保留在适配器侧（死信队列/日志），接入验收要演示一次 422 与一次 409。

---

## 6. 角色与权限的边界

1. 目录适配器推人员和中性组。企业提供方决定组、岗位、角色与权限之间的关系。
2. 正式接入由提供方返回角色显示名、会话能力、按权限裁剪的成员目录与人员分配。角色设置和成员写入按 [正式工作区提供方契约](workspace-provider.md) 执行。
3. 演示模式的本地覆盖只适用于演示数据。正式工作区的覆盖、同步和撤销由企业提供方维护。

---

## 7. 安全边界

- 适配器用限于 ingest 的**承接令牌**访问 OA 承接接口。企业数据库凭据由获授权的企业服务端保管，桌面端用用户令牌访问 OA API。
- B/C 模式密钥只存在你的服务端；A 模式（OIDC）用 PKCE，客户端不落密钥。
- 令牌泄露处置：在 Rallyloom「接入管理」一键吊销重发。
- 传输一律 HTTPS；`attrs` 里**禁止**放敏感凭据类字段（密码/密钥），Rallyloom 会原样展示它们。

---

## 8. 接入验收清单（Definition of Done）

- [ ] `--validate` 本地校验：50 个随机真实样本全过 schemas/*.json，0 错误
- [ ] 全量 reconcile 一次：Rallyloom 成员表人数与你系统活跃用户数一致
- [ ] 增量演示：改一个用户的名字 → upsert 后 Rallyloom 侧名字刷新、无重复成员
- [ ] 幂等演示：同一 event_id 重发 → 409，成员无变化
- [ ] 删除演示：person.remove → 成员移除
- [ ] 无部门系统演示：attrs 为空 `{}`、无 email 的用户正常入队，无报错
- [ ] 失败演示：断网重试日志可查；恢复后补推成功
- [ ] 文档：字段映射表（你的系统字段 → 容器字段）一页，附本仓库链接
- [ ] 动态演示（可选，v1.1）：`activity.push` 推 3 条真实业务动态 → Rallyloom 动态流原样展示、`actor_id` 正确挂头像
- [ ] 任务演示（可选，v1.2）：`task.upsert` 推 3 条任务 → 看板/表格视图出现且 `attrs` 自动出列；同 `external_task_id` 重推标题变更 → 原地刷新无重复；`task.remove` → 任务消失
- [ ] 公告演示（可选，v1.3）：`notice.push` 推 2 条公告 → 办公室顶部横幅流动展示、通知中心出现；置顶公告排前；`notice.remove` → 横幅与列表同步消失
- [ ] 文档演示（可选，v1.3）：`doc.upsert` 推 2 篇 markdown 文档 → 文档中心对应空间出现且内置查看器正常渲染；同 `external_doc_id` 重推正文变更 → 原地刷新；`doc.remove` → 列表消失
- [ ] 登录页体检（A 模式必测，v1.6）：`node reference/verify-provider.mjs <企业地址>` 输出 PASS；手工复核——在浏览器授权页按 F12 → Network → 提交表单的 POST 请求头 `Origin` 是真实域名（**不是 `null`**），响应不是 `Invalid CORS request`

---

## 9. 数据外部化边界（v1.1：Rallyloom 只做「承接与展示」）

接入前先分清**编排数据**与**业务数据**，这决定你要不要写适配器：

| 数据类别 | 归谁 | 机制 |
|----------|------|------|
| 人 / 组 / 成员关系 | 外部系统推送，Rallyloom 承接 | §2 容器 + §4 事件（本规范核心） |
| 角色与权限 | 企业工作区提供方 | §6 与正式工作区契约 |
| 房间 / 工位编排 | 企业工作区提供方保存和授权 | Rallyloom 提供编辑、预览及发布界面 |
| 工作区动态（ACTIVITY） | 外部系统推送，Rallyloom 承接 | §4.5 `activity.push` |
| 任务看板（多维表格） | 外部系统推送，Rallyloom 承接 | §4.6 `task.upsert` / `task.remove`；企业服务端确认状态、排序和权限 |
| 通知中心（公告横幅） | 外部系统推送，Rallyloom 承接 | §4.7 `notice.push` / `notice.remove`；已读为员工本机状态，永不回写 |
| 文档中心（企业公共文档） | 外部系统推送或外链托管 | §4.8 `doc.upsert` / `doc.remove`；查看器内置（markdown 渲染），数据与存储不归 Rallyloom |
| 看板 / 运营数据（如老板办公台挂的大盘） | 外部系统提供 | **外置数据插槽**：Rallyloom 只存一个 URL + 刷新间隔，定时拉取并渲染 `{rows:[{label,value,delta?}]}` |
| 交流室消息 | 云端协作后端（可由你的系统提供） | 聊天数据走存储层后端；Rallyloom 客户端零存储、只渲染 |

给外部系统开发者的三个推论：
1. **Rallyloom 永远不提供「核心业务数据」的接口**——办公室、成员在岗状态只是编排结果的渲染；大盘数据、动态内容、聊天记录都来自你（或你指定的后端）。
2. 看板接入不需要适配器服务：只要有一个返回 `{rows:[{label,value,delta?}]}` 的 HTTPS JSON 端点，超管在「挂载外部数据看板」里填 URL 即完成接入；`delta` 取值 `-1..1`（负=环比下降）。
3. 动态流接入用 `activity.push`；两者都遵循「有什么推什么」的中性容器哲学——Rallyloom 对内容零语义假设。

---

## 10. 多租户（v1.4：一家公司一个工作区，一源一司）

服务端部署模型：**installation（部署实例）→ workspaces（工作区）→ 每个工作区 = 一家公司（租户）**。团队、角色映射、工位编排、任务/公告/文档、看板配置全部按工作区硬隔离。

员工归属只从凭证解析：formal 模式下一个 OA 服务地址 = 一家公司。discovery 返回 `display_name`，bootstrap 顶层返回 `tenant: { "id": "<workspace_id>", "name": "<display_name>" }`。客户端**不可选择**租户。

适配器开发者的硬规则：

1. **一个 `source_id` 只属于一家公司**。承接令牌在签发时绑定 `(workspace, source_id)`——你推送的数据永远只落到令牌绑定的那家公司。
2. **报文里没有租户字段，也禁止发明一个**。租户是凭证属性不是数据属性：这就是为什么 §4 的全部 Schema 在多租户下零改动。
3. **跨租户永远是 `403`**，绝不静默落到别家公司。适配器收到 403 = 令牌绑定的工作区与你预期的不一致，停止推送并找企业管理员核对。
4. 同一套源系统要接两家公司（例如同一 CRM 管两个主体）→ 注册**两个 `source_id`**（如 `crm-acme` / `crm-globex`），各自领令牌、各推各的人群。

边界判断：

- 子公司 / 事业部**别滥用**多租户。同一公司内的组织划分先用中性 `groups` + `attrs` 承接；工作区 = 硬隔离 + 独立管理边界（各自的 owner、角色映射、存储配置），语义上就是「两家公司」。
- 跨租户联邦为预留能力：`guest` 身份带 `home_tenant` 展示位（当前版本仅展示归属，不跨租户查询数据）。
- 自托管单公司部署：只有一个 `default` 工作区，一切行为退化为 v1.3。
- 桌面端 Demo 内置两家互不可见的演示公司（星辰电商 / 云岭智造），用于体验租户切换与隔离断言——演示连接器各自声明 `tenantId`，真实部署中不存在这个客户端字段。

### 10.1 集团与租户联邦（v1.5：可选管辖层，Schema 依旧零改动）

多家公司同属一个「管辖体系」（法律上是分公司，股份与策略风向跟总公司）时，服务端可以把这些工作区**配置**进同一个集团（group）。这是租户之上的**可选能力**——多数公司不属任何集团，两个可选字段一概不出现，链路零感知。

配置语义（全部在服务端/集团超管侧，与适配器无关）：

- bootstrap 顶层 `tenant` 增加可选字段 `groupId` / `groupName`（成对出现）。不带 = 独立公司，一切照旧。
- **「合并租户」= 归属同一管辖体系的配置**，不是数据物理合并：各公司数据仍按工作区硬隔离，集团层只提供联邦目录与跨租户管理入口。
- **员工的风向策略跟总公司**：策略（JIT/资料同步/组映射默认值）可由集团总部统一下发，子公司工作区标记「跟随总部」；本地覆盖仍按 §6 永不被推送重置。
- 集团超管 = 平台运维轴（管理公司注册、令牌签发、集团归属配置），**不进任何一家公司的成员表**，因此不需要新的角色或权限位。
- 联邦目录里的「公司归属」复用中性容器：它只是每个人 `attrs` 里的一个普通键（演示用 `attrs["公司"]`）。接入方照常只推自己系统里有的属性——集团视图怎么聚合展示，是 Rallyloom 服务端的事。

对适配器的全部要求，读完 §10 你已经读完了：**没有新增任何字段、事件或端点。** 集团归属是服务端对已有数据的配置与聚合视图，v1.5 对接入方是纯文档版本。

---

## 11. 提供方自渲染登录页（v1.6：A 模式最容易翻车的响应头坑）

A 模式（账号漫游 / OIDC Authorization Code + PKCE）下，登录页、MFA 页由**你的系统**渲染，浏览器负责提交表单。这里有一个与接入数据契约完全无关、但会让整条登录链断掉的坑，真实项目已经踩过，必须写进验收。

### 11.1 症状

- 用户在浏览器里填完账号密码提交后，浏览器显示一个**纯文本页面**：`Invalid CORS request`（Spring `CorsFilter` 的固定响应体）或干脆 403/空白页；
- Rallyloom 侧一直停在「等待企业授权…」，直到超时才报错；
- 登录页本身能正常 GET 打开，OIDC discovery / token 端点也都正常——所以很容易误判成「OIDC 配错了」，其实是**表单 POST 在进入你的 Controller 之前就被 CORS 过滤器拒绝了**。

### 11.2 根因

Chromium 在**表单 POST 导航**时，按当前文档的 `Referrer-Policy` 计算 `Origin` 请求头。若该 HTML 页面响应带：

```http
Referrer-Policy: no-referrer
```

浏览器会把 POST 的 `Origin` 序列化成 **`null`**（同时不带 `Referer`）。你的 CORS 允许列表里通常只有自己的域名，没有 `null`，于是 403「Invalid CORS request」。

常见来源：安全加固时给**全站**统一加了 `Referrer-Policy: no-referrer`（Spring Security `referrerPolicy`、Helmet、nginx `add_header` 等），自渲染的登录/MFA 页面也被一起带上。

已用对照实验确认：`same-origin` / `strict-origin` / `strict-origin-when-cross-origin` / `origin` / `origin-when-cross-origin` / `no-referrer-when-downgrade` 都不会影响 `Origin`，**只有 `no-referrer` 会把它变成 `null`**。

### 11.3 硬规则

> **任何会提交表单的 HTML 页面（登录、MFA、授权确认、错误重试页），响应头 `Referrer-Policy` 不得为 `no-referrer`。**

推荐值：`same-origin`（既不把 Referer 发给第三方，又能让同源表单 POST 带上正确 `Origin`）。

同时避免：给这些页面加 `Content-Security-Policy: sandbox`（会让文档变成不透明源，`Origin` 同样是 `null`）；`form-action` 需放行表单自身地址。

### 11.4 修复方式（任选其一）

**A. 在页面响应上覆盖（推荐，作用面最小）**

在渲染这些页面的 Controller/View 里显式设置响应头：

```java
response.setHeader("Referrer-Policy", "same-origin");   // 只作用于登录/MFA 页
```

多数框架的全局 header writer 在写响应头前会检查是否已存在同名头（Spring Security 7 的 `ReferrerPolicyHeaderWriter` 第一行就是 `containsHeader` 判断），因此 Controller 设置的优先级更高；若你的框架会强制覆盖，改用下面的路径级配置。

**B. 按路径改全局策略**

保留全站 `no-referrer`，仅对登录相关路径改为 `same-origin`（Spring Security 可用 `requestMatcher` 定制 header writer；其他框架同理按路由配置）。

**C. 反向代理兜底（不发版即可生效）**

```nginx
location /your-oidc-path/ {
    proxy_hide_header Referrer-Policy;                       # 先去掉上游的 no-referrer
    add_header Referrer-Policy "same-origin" always;         # 再写自己的
    # 其余 proxy_pass / CSP 配置保持不变
}
```

注意：只写 `add_header` 不会删掉上游已有的 `Referrer-Policy`，两个值同时到达浏览器时行为不可靠，**必须配合 `proxy_hide_header`**。

### 11.5 不要这样修

- ❌ 在 CORS 允许列表里加 `null`。允许 `Origin: null` 会打开沙箱 iframe / `data:` / 本地文件页面的跨域入口；带 `allowCredentials=true` 时尤其危险。这只是掩盖症状，不是修复。
- ❌ 让 Rallyloom 客户端绕过登录页。桌面端不收集、不代填企业账号密码——这是产品安全边界。
- ❌ 只修登录页不修 MFA 页。两页通常是同一段渲染逻辑，一起改。

### 11.6 自检（30 秒）

```bash
node reference/verify-provider.mjs https://your-oa.example.com
```

脚本会：①校验 discovery 可读；②GET 授权页并检查 `Referrer-Policy` 是否为 `no-referrer`；③用本机 Chrome（无头）真实提交一次表单，打印 POST 的 `Origin` 与最终页面判定。输出 `PASS` 才算这一项通过。手工版：浏览器 F12 → Network → 提交时的 POST → Request Headers 里看 `Origin`，是域名就对了，是 `null` 就是本文档描述的坑。

### 11.7 给 AI Agent 的一句话

> 你负责的登录页如果不是纯 SPA（有服务端渲染的 `<form method="post">`），先检查它的 `Referrer-Policy` 响应头；`no-referrer` 会让表单 POST 变成 `Origin: null`，整条 OIDC 登录链会以 `Invalid CORS request` 失败，而所有 OIDC 端点看起来都正常。


## 12. 接入失败排查地图（v1.8）

接入失败时，先不要改代码——按这张表定位到「哪一步、哪个字段」。桌面端从 v0.11.4 起对每个失败点都给出可执行的文案，并写出诊断文件。

### 12.1 按阶段定位

| 阶段 | 现象 | 客户端错误码 | 常见原因 / 修复 |
| --- | --- | --- | --- |
| 地址检测 | 「无法连接工作区服务」 | `NETWORK` | 地址不可达、被防火墙拦截、只支持 http；需公网 HTTPS |
| 地址检测 | 「服务证书验证失败」 | `CERTIFICATE` | 自签证书 / 证书链不全 / 域名与证书不匹配 |
| 地址检测 | 「未找到工作区接口」 | `API_MISSING` | `/api/v1/workspace/discovery` 未部署或路径不同 |
| 地址检测 | 「服务返回了不同的工作区」 | `WORKSPACE_CHANGED` | 该地址指向了另一个 installation_id / workspace_id |
| 登录页 | 浏览器纯文本 `Invalid CORS request` | `AUTH_PROVIDER_MISCONFIGURED` | 登录页返回 `Referrer-Policy: no-referrer` 或 CSP sandbox（见 §11） |
| 回调 | 「等待浏览器授权超时」 | `AUTH_TIMEOUT` | 回调地址 `rallyloom://callback` 未注册到客户端、浏览器拦截了协议、或登录页报错没人点返回 |
| 令牌 | 「企业身份服务验证失败」+ `invalid_grant` | `OIDC` | 授权码过期/已用/不匹配；重点查**授权码有效期的时间计算**（见 §12.2） |
| 数据 | 「工作区返回的数据不符合接入规范：…」 | `INVALID_RESPONSE` | bootstrap 响应缺字段或类型不对（见 §12.3） |
| 数据 | 「当前身份无权访问此工作区」 | `FORBIDDEN` | 成员被排除、租户被停用、或 `permissions` 缺 `office.view` |
| 会话 | 「登录已失效，请重新授权」 | `AUTH_REQUIRED` | access token 过期（Rallyloom 会在下次调用时重新走登录） |

### 12.2 `invalid_grant` 排查清单（提供方自查）

授权码兑换失败时，服务端应按顺序检查：

1. `redirect_uri` 与服务端常量**逐字符一致**（`rallyloom://callback`，不要补斜杠、不要加 query）；
2. `client_id` 一致（默认 `rallyloom-desktop`，以 discovery 声明为准）；
3. `resource` 与 discovery 的 `authorization.resource` 一致；
4. `code_verifier` 满足 `[A-Za-z0-9._~-]{43,128}`，且 `base64url(sha256(verifier))` 等于发码时保存的 `code_challenge`；
5. 授权码**一次性**：兑换成功后立即标记已用，重复兑换返回 `invalid_grant`；
6. **有效期时间计算必须用同一个时钟**：写库与校验都用数据库时间（如 `CURRENT_TIMESTAMP + INTERVAL '3 minutes'`），不要一边写 Java `LocalDateTime.now(UTC)`、另一边用 `CURRENT_TIMESTAMP` 比较——`TIMESTAMP` 无时区，数据库会话时区非 UTC 时（例如 `Asia/Shanghai`）这个差会变成「刚发出就过期 8 小时」，日志里只会看到 `invalid_grant`。
7. 失败响应建议额外返回 `error_detail`（中文原因）并写服务端日志，桌面端会把该字段显示到界面上。

### 12.3 `INVALID_RESPONSE`（bootstrap）排查清单

`GET /api/v1/workspace/bootstrap` 返回体必须满足：

| 字段 | 要求 |
| --- | --- |
| `installation_id` / `workspace_id` | 与 discovery 一致 |
| `tenant` | `{id,name}`，`id = workspace_id`，`name = display_name` |
| `member_id` | 当前登录成员在 `team` 中的 `id` |
| `permissions` | 字符串数组，必须包含 `office.view` |
| `team[]` | `id`、`connectorId`、`idpId`、`displayName`、`attrs{}`、提供方定义的 `roleId` 和 `roleName`、`presence`、`externalGroups[]`，且必须包含自己。旧响应可用字符串 `role` 作为名称回退 |
| `roleSettings` | 可选的提供方角色配置表单，授权用户同时收到 `roles.configure` |
| `policy` | 对象，可 `{}` |
| `layout` | `{width>0, height>0, rooms[{id,name,template,frame{x,y,width,height}}], assignments{}}` |
| `dataSlots` | 对象，可 `{}` |

离线自检（不需要装桌面端）：

```bash
# 取一份 bootstrap 响应体（浏览器 F12 → Network → bootstrap → 复制响应）
node reference/verify-provider.mjs --bootstrap bootstrap.json
```

输出会逐条列出问题，例如：

```
[FAIL] bootstrap 不符合契约 — 3 处问题：
       ✗ layout.rooms[0].template：办公室模板 id（如 desk-grid）
       ✗ team[2].presence：online/busy/away/offline
       ✗ tenant：{id,name} 两个非空字符串
```

桌面端失败时还会写出 `%APPDATA%\Rallyloom\workspace-diagnostic.json`（结构摘要 + 裁剪响应体，不含令牌），可直接转给提供方。

### 12.4 三条自检命令

```bash
# ① 登录页 + discovery（A 模式，含真实表单提交）
node reference/verify-provider.mjs https://your-oa.example.com
# ② 只查 discovery/响应头，不启浏览器
node reference/verify-provider.mjs https://your-oa.example.com --no-browser
# ③ bootstrap 响应体离线校验
node reference/verify-provider.mjs --bootstrap bootstrap.json
```

三条都 `PASS`，再加上 §8 的事件推送验收，即可认为接入完成。

### 12.5 给 AI Agent 的一句话

> 接入失败时，先按 §12 的表把错误码映射到「阶段 + 字段」，再用三条自检命令复现；`invalid_grant` 优先怀疑授权码有效期的时间计算（§12.2 第 6 条），`INVALID_RESPONSE` 一律用 `--bootstrap` 离线校验出具体字段，不要凭感觉改。

---

## 13. 点歌台（v2.0：工作区共享曲库与每日歌曲）

点歌台是内置的 OA 协作功能。获得 jukebox.use 能力的工作区成员都能浏览和播放共享曲库、拖入 MP4 分享歌曲；每个工作区每天由服务端随机选出一首，所有成员看到同一个结果。它不依赖 bootstrap 配置才显示，也不需要歌单说明文案。提供方若把多个组织租户合并为一个 OA 工作区，曲库和每日歌曲覆盖该工作区内所有有权成员；租户隔离由提供方的 workspace 拓扑决定。

### 13.1 运行时 API

所有路径均相对 /api/v1/workspace/oa，使用当前 Rallyloom 会话的 Bearer token。平台账号仅在已有工作区范围机制允许时使用 X-Rallyloom-Scope 指定操作上下文；普通成员不能选择或跨越租户。服务端必须对每个端点检查 jukebox.use，不可只依赖隐藏导航。曲库按 provider 定义的 workspace 共享，不按平台管理员当前浏览的业务数据范围分裂。

| 方法与路径 | 用途 |
| --- | --- |
| GET /jukebox | 返回当前工作区曲目、日期和统一的每日歌曲 |
| POST /jukebox/tracks | multipart 上传 MP4，字段 file 必填、title 可选 |
| GET /jukebox/media/{mediaId} | 授权读取已上传的 MP4，响应 video/mp4 |
| DELETE /jukebox/tracks/{mediaId} | 上传者删除自己的歌曲；平台管理员可管理当前范围内的歌曲 |

POST 接受 .mp4，文件内容必须是 MP4 容器（ftyp 标记），最大 20 MiB。标题为空时从文件名生成，最多 120 字；提供方可按自身存储能力额外设更低限制。歌曲元数据和媒体必须绑定到认证身份所在的 workspace，来源租户可作为审计字段保存，但不能信任客户端传入的上传者或租户标识。一个 workspace 可以有意合并多个租户；若提供方使用独立 workspace，则歌曲也必须分别隔离。

GET /jukebox 的响应形状由 schemas/jukebox-feed.schema.json 定义。每条曲目包含稳定 id 和 title；上传曲目另含 mediaId、provider=mira-file、origin=member、uploaderName、createdAt 与 canDelete。每日歌曲由 dailyTrackId 标识，可同时返回 dailyTrack 对象。

dailyTrackId 对同一工作区和北京时间自然日保持稳定；只有曲库为空或当日歌曲已删除时才重新抽取。用户播放队列属于本人会话，曲库与每日歌曲属于整个工作区。曲目新增后客户端会定时刷新，其他成员无需重新绑定。

### 13.2 可选精选曲目

提供方仍可在 bootstrap 返回可选 jukebox.playlists 作为工作区精选歌曲；成员上传的共享曲目由运行时 API 提供。这些精选歌曲与成员 MP4 一起进入同一个随机池。现有静态字段由 schemas/jukebox.schema.json 校验，note 不用于成员端说明。verify-provider.mjs --bootstrap 可离线检查精选曲目字段。

精选歌曲字段：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| playlists | 是 | 1–40 个可选精选歌单 |
| playlists[].id / name / tracks | 是 | 稳定 ID、歌单名和曲目数组 |
| tracks[].title / url | 是 | 标题和 HTTPS 媒体地址 |
| tracks[].provider | 否 | 可用 youtube；播放走官方嵌入播放器 |
| tracks[].artist / poster / duration | 否 | 展示元数据 |

### 13.3 客户端行为

- 成员可拖拽 MP4 到曲库，也可点击选择文件；提交成功后同工作区成员刷新时可见。
- 点击曲目播放；用户可另建本机队列。每日歌曲由服务端抽取，成员从每日歌曲卡片播放。
- jukebox.use 成员能力决定页面及每个 API 的访问；默认成员角色应由提供方授权所有可参与的工作区成员。
- 文件只能由上传者删除；提供方可自行提供更细的审核/删除策略，但不能跨租户读取媒体。

### 13.4 不要这样做

- ❌ 把成员提交的 MP4 当作一次性浏览器文件；上传成功后必须进入工作区共享曲库。
- ❌ 把客户端提交的 uploaderName、tenantId 或播放日期当作可信来源；身份、租户与每日抽歌日期由服务端确定。
- ❌ 仅靠前端导航隐藏来实现权限；媒体读取和删除也必须经过授权及租户范围校验。
- ❌ 把完整媒体内容放进 bootstrap 或曲库 JSON；元数据和文件读取使用分离的运行时 API。
- ❌ 把不拥有或未经许可的受版权限制音视频放入公司曲库。

### 13.5 给 AI Agent 的一句话

> 点歌台是工作区内置共享曲库：让拥有 jukebox.use 的成员上传 MP4、播放同事分享的歌曲，并由服务端按公司范围和北京时间每天稳定随机选歌；按本节 API、两个 Schema 和租户授权约束实现，不要要求成员找媒体直链或填写说明。


---

## 14. Provider REST 完整契约（v2.2）

本文件 §§1–13 描述**事件推送与身份承接**的语义；企业服务端为了让桌面端完整可用，还需要实现一组 **REST 接口**（discovery、OIDC、bootstrap、办公室布局、房间数据看板、`/oa` 业务接口）。

这些接口的逐端点、逐字段、逐错误码契约统一放在 **[provider-api.md](provider-api.md)**，配套机器可读约束：

- `schemas/workspace-bootstrap.schema.json` —— bootstrap 响应体（含 tenant/member/team/permissions/collaboration/layout/dataSlots/jukebox）
- `schemas/office-layout.schema.json` —— 办公室布局（PATCH `/api/v1/workspace/layout` 请求体，含 37 种家具白名单）
- `schemas/jukebox.schema.json` —— bootstrap 可选精选歌单

离线自检：

```bash
node reference/verify-provider.mjs --bootstrap bootstrap.json
node reference/verify-provider.mjs --layout layout.json --team bootstrap.json
```

一句话：**事件 Schema 管「数据怎么同步进来」，provider-api.md 管「桌面端怎么读和写你的系统」**——两者都要实现，但互不重复。
