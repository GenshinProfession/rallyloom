正式工作区协作接口、能力、对象范围与验收先读 [OA 协作契约](oa-collaboration.md)。目录事件推送是另一条可选链路，不能替代正式 OA API。

# Rallyloom 接入 Skill 包（agent-skill/）· v1.8

企业可以用这个包规划自托管接入、工作区授权与多租户划分，也可以交给开发者或 AI Agent 为已有 OA 部署编写源系统适配器。
首次接入、基础数据库访问和定制流程见 [企业接入与授权方案](enterprise-authorization.md)（设计草案）。
v1.1 新增 `activity.push`（动态承接）与 §9 数据外部化边界；v1.2 新增 `task.upsert` / `task.remove`
（任务看板承接）；v1.3 新增 `notice.push` / `notice.remove`（通知中心公告承接）与
`doc.upsert` / `doc.remove`（文档中心承接——对方数据库里的文档记录格式即 payload 字段集）；
v1.4 新增 §10 多租户（一家公司一个工作区、一源一司、租户随令牌绑定——**全部事件 Schema 零改动**）。
v1.5 新增 §10.1 集团与租户联邦（可选管辖层：合并租户 = 归属同一管辖体系的配置，数据仍硬隔离；不属集团的公司零感知——依旧零改动）。
v1.6 新增 §11 提供方自渲染登录页的 Referrer-Policy/Origin 坑与 `reference/verify-provider.mjs` 体检脚本（`Referrer-Policy: no-referrer` 会让表单 POST 的 Origin 变成 null，被网关 403 `Invalid CORS request`）；v1.7 为 `doc.upsert` 增加可选 `content_format: html` 与 `attachments`（富文本文档与正文内任意类型附件，查看器/编辑器内置——其余事件 Schema 零改动）；v1.8 新增 §12 **接入失败排查地图**（错误码 → 阶段 → 字段 → 修复）与 `verify-provider.mjs --bootstrap` 离线契约校验（无 Schema 变更）。

## 目录内容

| 文件 | 作用 |
|------|------|
| `SKILL.md` | Agent 的第一入口：任务使命、心智模型、开发步骤、禁止事项、验收标准 |
| `enterprise-authorization.md` | 企业接入、授权与撤销、正式绑定、数据库适配和 Demo 隔离的设计草案 |
| `integration-spec.md` | 规范本体：三种接入模式、中性身份容器、事件契约、幂等/错误码、角色边界、数据外部化边界、多租户（§10 一源一司）、验收清单 |
| `schemas/envelope.schema.json` | 事件信封（JSON Schema 2020-12） |
| `schemas/person-upsert.schema.json` | 人 · 新建/更新载荷 |
| `schemas/person-remove.schema.json` | 人 · 移除载荷 |
| `schemas/group-upsert.schema.json` | 组 · 注册/更新载荷 |
| `schemas/members-reconcile.schema.json` | 全量对账快照载荷 |
| `schemas/activity-push.schema.json` | 工作区动态承接载荷（v1.1） |
| `schemas/task-upsert.schema.json` | 任务看板承接载荷（v1.2） |
| `schemas/task-remove.schema.json` | 任务移除载荷（v1.2） |
| `schemas/notice-push.schema.json` | 通知中心公告承接载荷（v1.3） |
| `schemas/notice-remove.schema.json` | 公告撤回载荷（v1.3） |
| `schemas/doc-upsert.schema.json` | 文档中心承接载荷（v1.3 起；v1.7 增 `content_format` 与 `attachments`，即对方的文档存储记录格式） |
| `schemas/doc-remove.schema.json` | 文档下架载荷（v1.3） |
| `reference/adapter-demo.mjs` | 可运行参考适配器（零依赖 Node 18+） |
| `reference/verify-provider.mjs` | 提供方接入体检脚本：`<域名>` 查 discovery / Referrer-Policy / 真实 POST 的 Origin（v1.6）；`--bootstrap <json>` 离线逐字段校验 bootstrap 响应体（v1.8） |
| `workspace-provider.md` | 正式工作区的企业角色名称、会话能力、成员可见范围和管理配置契约 |

## 怎么丢给一个 Agent

任选其一：

1. **上下文注入**：把本目录所有文本文件内容贴进对话，指令写
   「先读 SKILL.md，按它为我们的系统开发接入适配器」。
2. **作为 skill 文件**：把 `SKILL.md` 挂到你的 Agent 平台的 skill 目录
   （frontmatter 已按通用 skill 格式写好 name/description），其余文件随附。
3. **仓库托管**：把整个目录推到 git，给 Agent 一个只读链接即可。

## 启动源系统推送前的准备

1. 向 Rallyloom 超管登记你的 `source_id`（如 `crm`），领取**承接令牌**与 `INGEST_URL`。
2. 确认组→角色的映射意图（如 `crm-admin → admin`），把它配在企业提供方的角色映射里——这是配置，不是代码。

## 验收

按 `integration-spec.md` §8 清单逐条演示；Agent 侧最低要求见 `SKILL.md` 第 6 节。


通用日志汇报：见 [reporting.md](reporting.md) 与 `schemas/reporting.schema.json`。模板、字段、周期、草稿/提交、版本与权限是跨企业契约；Mira 仅是一个提供方实现。
