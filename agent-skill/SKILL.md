---
name: rallyloom-source-adapter
description: 为企业接入 Rallyloom 开源 OA。用于设计企业部署、工作区绑定与多租户划分、用户登录和权限、服务器侧数据接入，或开发人员、组、任务、动态、公告和文档的源系统适配器并验证数据契约。
---

# Rallyloom 接入适配器开发 Skill

先按请求选择工作流。正式工作区的角色名称、权限、可见范围由企业提供方决定。正式目录只读，Rallyloom 不提供工作区角色、角色映射或成员身份管理；角色维护必须回企业系统。Rallyloom 只实现客户端能力和 [工作区提供方契约](workspace-provider.md)。修复接入问题时，同步更新受影响的客户端验证、契约及体检脚本。

**通用 OA 边界：** 客户端只实现可跨企业复用的契约；汇报按 [通用日志汇报](reporting.md) 的动态模板渲染，角色、范围、字段与时区均来自提供方。店铺、曝光、采购等业务概念留在企业适配器；没有通用契约的企业专有功能先不接入。不得要求其他企业模拟 Mira 的运营日报表或昨日下发机制。

- **企业首次部署、授权与绑定、基础数据库接入或定制**：读 [企业接入与授权方案](enterprise-authorization.md)，明确部署与数据归属、三类授权、服务验证和 Demo 隔离。先确认企业有哪些接口与身份服务，再决定适配器接哪层。只有正式申请的模块和操作才进入授权范围。
- **正式 OA 的任务、文档、交流室、通知、工作汇报接入或排错**：先读 [OA 协作契约](oa-collaboration.md)，逐项实现读写和服务端对象权限，再接前端入口；不同角色分别验收。群成员由 `/chat/channels/{id}/members` 独立返回，不得拿可见目录或提及候选名单推断。日常入座通过提供方声明的 `collaboration.seating` 和本人座位接口，不能改写长期分配或账号权限。
- **给已部署的 OA 对接源系统**：按下文实现数据映射、推送或账号漫游。企业侧适配器持有获准的服务端凭据，Rallyloom 按数据契约承接。

## 0. 先读什么（按顺序）

1. 本文件（你正在读）
2. `integration-spec.md` —— 现有事件和身份契约（三种接入模式、数据格式、幂等、错误码和角色边界）
3. `schemas/*.json` —— 机器可读契约（JSON Schema 2020-12；按本次模块读取相应文件）
4. `reference/adapter-demo.mjs` —— 推送适配器的参考实现（零依赖 Node 18+）
5. `reference/verify-provider.mjs` —— 提供方接入体检脚本：`<域名>` 查 discovery + 授权页 Referrer-Policy + 真实表单 POST 的 Origin（v1.6）；`--bootstrap <json>` 离线校验 bootstrap 响应体的每个字段（v1.8，v1.9 起连带校验可选 `jukebox`）

人类同事也适用本 skill：把整个目录给他即可，不需要额外上下文。

## 1. 心智模型（三句话，贯穿所有决策）

1. **有什么推什么，没有的不造。** 必填只有 `source_id + external_user_id + display_name + groups`；
   部门/岗位/工号全部走 `attrs` 自由键值对，源系统没有部门这个概念就什么都不填——不报错。
2. **目录组只描述组织归属。** 目录事件不授予权限。正式角色和能力由企业提供方在 bootstrap 返回，组到角色的映射在提供方配置和校验。
3. **同步锚点 = source_id + external_user_id。** 改名/改邮箱/改组都只是 upsert；
   人走了才发 person.remove；同一 event_id 重发永远安全（幂等 ≥72h）。

## 2. 源系统适配器开发步骤

1. **选接入模式**（integration-spec.md §1）：内部系统选 B 目录推送（+C 事件回调可选）；
   你的系统是 IdP/想让用户拿它的账号登录 Rallyloom 选 A 账号漫游（OIDC+PKCE，回调 URI 固定为
   `rallyloom://callback`）；A+B 组合最稳。**先向 Rallyloom 超管登记你的 `source_id` 与模式，领取承接令牌。**
2. **写字段映射表**（唯一必写的文档）：源系统用户对象的每个字段 → 容器字段的去向。
   没有对应的字段直接标记「不推送」。禁止发明源系统不存在的字段。
3. **实现适配器**：以 `reference/adapter-demo.mjs` 为骨架——保留信封构造、校验、
   幂等重试与错误分类逻辑，只改 `mapUserToPerson()` 和数据源 `loadUsers()`。
4. **本地自测**：`node adapter-demo.mjs --validate`（不联网）必须全绿；再用真 JSON Schema
   引擎（ajv / python jsonschema 任一）对 50 个真实样本跑一遍 `schemas/*.json`。
5. **联调**：`--push` 单事件 → `--reconcile` 全量 → 在 Rallyloom「团队管理 → 接入管理」确认成员数与
   你系统活跃用户数一致。
6. **验收演示**：按 integration-spec.md §8 清单逐条打勾（幂等 409、删除 remove、无部门用户、
   断网重试、422 保留不丢弃）。

## 3. 数据契约速查

```
信封（必填五字段）：{ event_id: UUID, event_type, occurred_at: ISO8601, schema_version: 1, payload }
person.upsert payload：
  { source_id, external_user_id, display_name,          ← 必填
    email?, attrs?: {任意字符串键值}, groups: [] }       ← email/attrs 可选，groups 必填可空
person.remove  payload：{ source_id, external_user_id }
group.upsert   payload：{ source_id, group_id, display_name, description? }
members.reconcile payload：{ source_id, persons: [person.upsert payload 数组] }  ← 全量对账，快照外的人被移除
activity.push  payload：{ source_id, items: [ { actor_id, actor_name?, text, kind?, url?, occurred_at? } ] }  ← v1.1 动态承接
task.upsert   payload：{ source_id, external_task_id, title,            ← 必填三元组
    status?(接入方状态id), priority?(P0-P3), assignee_id?, assignee_name?, due?,
    attrs?: {任意字符串键值 → 表格视图动态列} }                          ← v1.2 任务承接
task.remove   payload：{ source_id, external_task_id }                 ← 任务作废必须显式 remove，禁清字段冒充
notice.push  payload：{ source_id, items: [ { external_notice_id, title,            ← v1.3 公告承接
    summary?, level?(info|warning|urgent), url?, pinned?, occurred_at?, attrs? } ] }
notice.remove payload：{ source_id, external_notice_id }               ← 公告撤回
doc.upsert   payload：{ source_id, external_doc_id, title,           ← v1.3 文档承接（存储格式=本字段集）
    space?, folder_path?: string[], format(markdown|link), content?/url?, owner_name?, updated_at?, attrs?,
    content_format?(markdown|html，v1.7), attachments?: [{id?,name,size?,mime?,url}] }   ← v1.7 富文本+附件
doc.remove   payload：{ source_id, external_doc_id }                 ← 文档下架
bootstrap.jukebox（可选字段，无事件）：{ playlists: [ { id, name, tracks: [ { title, url(HTTPS MP4), artist?, poster?, duration?, attrs? } ] } ] }  ← v1.9 点歌台
```

响应契约：200 成功 / 409 幂等命中（视为成功）/ 400 修后重发 / 401 换令牌 / **422 版本不兼容（保留事件+告警，绝不静默丢弃）** / 5xx 指数退避重试 3 次后转对账兜底。

v1.1–v1.3 的「业务数据承接」：动态流走 `activity.push`、任务看板走 `task.upsert`/`task.remove`、
通知中心走 `notice.push`/`notice.remove`（Rallyloom 只展示不生成，已读状态保留在本机）；
文档中心走 `doc.upsert`/`doc.remove`（查看器与富文本编辑器内置：markdown 或 `content_format:"html"` + 正文中间可放任意类型附件；文档数据、附件本体与存储不归 Rallyloom）；
看板/大盘不需要适配器——只要一个返回 `{rows:[{label,value,delta?}]}` 的 HTTPS JSON 端点，
由 Rallyloom 超管在「挂载外部数据看板」里填 URL 即可。边界详见 integration-spec.md §9。

点歌台（v1.9）：Rallyloom 不存任何音视频文件，只做播放器与排队。企业把 MP4 放在自己的 HTTPS 对象存储上，
在 bootstrap 响应里加可选 `jukebox` 字段（歌单数组 + 每首歌的 `title`/`url` 等）即可；媒体不进 Rallyloom，
事件 Schema 零改动，`verify-provider.mjs --bootstrap` 会连带校验这段。详见 integration-spec.md §13。

多租户（v1.4）：一家公司一个工作区，**一源一司**——你的承接令牌绑定了唯一一家公司，
报文里没有租户字段、也不需要发明一个（租户随令牌走，所以 Schema 零改动）。两家公司
接同一套源系统 = 注册两个 source_id 各领各的令牌；收到 403 = 令牌绑定的公司与你预期
不一致，停止并核对。详见 integration-spec.md §10。

集团（v1.5，可选）：目标公司可能同属一个「管辖体系」（分公司+总部策略）。这**不改变
你任何一行代码**：集团归属是服务端配置，联邦目录里的「公司」只是 attrs 里的普通键。
不属集团的公司不带 groupId——照常独立接入。详见 integration-spec.md §10.1。

富文本文档（v1.7）：文档中心已内置富文本编辑器（标题/列表/引用/代码块/表格/图片/附件卡），
适配器只要按需推 `content_format:"html"` 与 `attachments`，不需要实现任何编辑器。

提供方自渲染登录页（v1.6，A 模式）：如果你的 OIDC 登录页由你自己渲染，**该页面响应头不得是
`Referrer-Policy: no-referrer`**——Chromium 会因此把表单 POST 的 `Origin` 发成 `null`，
被网关 CORS 拒成 403 `Invalid CORS request`（症状是浏览器纯文本错误页，而 discovery/token
端点都正常，极易误判）。改为 `same-origin`，先跑
`node reference/verify-provider.mjs https://你的域名` 体检。详见 integration-spec.md §11。

接入失败排查（v1.8）：任何一步报错，先按 integration-spec.md **§12 接入失败排查地图**把错误码
映射到「阶段 + 字段」（`NETWORK` / `CERTIFICATE` / `API_MISSING` / `WORKSPACE_CHANGED` /
`AUTH_PROVIDER_MISCONFIGURED` / `AUTH_TIMEOUT` / `OIDC invalid_grant` / `INVALID_RESPONSE` /
`FORBIDDEN` / `AUTH_REQUIRED`），再用 §12.4 的三条自检命令复现；不要凭感觉改代码。

## 4. 适配器职责（四条全要）

1. **映射**：源系统用户 → 中性容器；字段映射表留档。
2. **幂等**：每个事件 `event_id = UUID`；重试复用同一 event_id；断电/重启不产生重复成员。
3. **错误分类**：按 §5 语义处理，409 是成功、401 不重试、422 进死信并告警。
4. **对账兜底**：提供 `--reconcile` 或定时全量任务，让增量漏掉的事件最终收敛。

## 5. 禁止事项（踩了即返工）

- ❌ 在 `attrs` 里塞角色/权限字段（Rallyloom 不读它做决策）
- ❌ 推送任何「角色」概念；组→角色的映射权在 Rallyloom 超管手里
- ❌ 用改名/清空 attrs 冒充删除——必须发 `person.remove`
- ❌ 在报文里携带/发明公司或租户字段——租户随令牌绑定，一源一司（§10）
- ❌ 适配器直连 Rallyloom 数据库——只有 ingest 端点，令牌 scope 仅此
- ❌ 静默丢弃任何被拒事件（尤其 422）
- ❌ 令牌/密钥写进桌面端或前端代码（A 模式用 PKCE，客户端零密钥）
- ❌ 忽略 `groups: []` 合法性——空组的人是合法成员，照推
- ❌ 让自渲染的登录/MFA 页返回 `Referrer-Policy: no-referrer`——表单 POST 的 Origin 会变 null 被 403（§11，先用 verify-provider.mjs 体检）
- ❌ 用「应用时钟」写授权码有效期、用数据库 `CURRENT_TIMESTAMP` 校验——`TIMESTAMP` 无时区，会话时区非 UTC 时码会「刚发出就过期」，只看到 `invalid_grant`（§12.2）

## 6. 验收标准（全部满足才算完成）

见 integration-spec.md §8 清单。核心五条：
① `--validate` 与 JSON Schema 校验全绿；② reconcile 后两边人数一致；
③ 改名演示不产生重复成员；④ 同 event_id 重发无副作用；
⑤ 无部门/无邮箱用户（attrs={}、无 email 字段）正常入队；
⑥ （A 模式必测，v1.6）`node reference/verify-provider.mjs <企业地址>` 输出 PASS，手工复核表单 POST 的 Origin 不是 `null`。
⑦ （A 模式必测，v1.8）抓一份 `/api/v1/workspace/bootstrap` 响应体，跑
`node reference/verify-provider.mjs --bootstrap bootstrap.json` 输出 PASS——
这一条能提前排掉 90% 的「登录成功却进不去办公室」问题。
（可选加演：`activity.push` 推 3 条动态 → Rallyloom 动态流原样展示且 actor 正确挂头像；
`task.upsert` 推 3 条任务 → 看板出现、attrs 自动出列、重推无重复；
`notice.push` 推 2 条公告 → 办公室顶部横幅流动展示、通知中心可读；
`doc.upsert` 推 2 篇文档 → 文档中心空间出现、内置查看器渲染正常；
v1.7 可选加演：推一篇 `content_format:"html"`（含标题/代码块/表格）+ `attachments` 的文档 → 富文本查看器正常、附件可下载。）

## 7. 交付物清单

- 适配器仓库/脚本（含 `--validate` / `--push` / `--reconcile` 三个入口）
- 字段映射表（一页）
- 联调记录（6. 验收逐条打勾截图/日志）
- 运维说明：令牌轮换、死信处理、reconcile 定时周期

## 任务状态与字段（2026-11-23）

先读取 `schemas/task-board.schema.json` 与 integration-spec.md §4.6。禁止在客户端写死公司的任务列、流转或自定义字段；四列只属于演示源。提供方负责鉴权、状态流转与排序确认。未提供某模块接口时，不得授予该模块能力或回退演示数据。

正式汇报适配必须优先复用企业已有的参与范围、模板和提交服务；Mira 不能通过通用 record/report 新建绕过 `operations_report_enabled`。修改周月报前读取 OA 契约中的 work-reports 章节。
