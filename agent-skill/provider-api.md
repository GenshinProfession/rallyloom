# Rallyloom 工作区接入接口契约（Provider API · v2.2）

> 面向对象：要把自己的 OA / 业务系统接入 Rallyloom 桌面端的**企业服务端开发者（或其 AI Agent）**。
> 这份文件是**唯一完整契约**：桌面端会调用哪些地址、每个请求/响应长什么样、哪些字段必填、错误码怎么回、哪些能力必须先声明。
> 集群/事件推送那一侧（`person.upsert`、`task.upsert` 等 12 类事件）见 `integration-spec.md` 与 `schemas/*.json`，本文不重复。

---

## 0. 30 秒判断：你必须实现哪些端点

Rallyloom 只有一种「正式接入」形态：**企业服务端提供一套 HTTPS API，桌面端作为公开 OIDC 客户端登录后读取 bootstrap，随后通过 `/oa` 前缀调用业务接口。**

| 步骤 | 你必须提供 | 说明 | 必填 |
| --- | --- | --- | --- |
| 1 | `GET /api/v1/workspace/discovery` | 声明安装实例、工作区、OIDC 配置 | ✅ |
| 2 | OIDC 提供方（`issuer` 下 well-known / jwks / authorize / token / userinfo） | Authorization Code + PKCE(S256)，公开客户端 | ✅ |
| 3 | `GET /api/v1/workspace/bootstrap` | 一次返回租户、成员、权限、办公室布局、数据看板槽位 | ✅ |
| 4 | `/oa/office/seats`（可选） | 日常入座 / 离座 | 可选 |
| 5 | `/oa/*` 业务接口 | 聊天 / 任务 / 通知 / 文档 / 汇报 / 点歌台 / 工位 | 按能力声明 |
| 6 | `PATCH /api/v1/workspace/layout` | 接收桌面端编排的办公室布局 | ✅（否则编辑办公室按钮会给 404） |

**最小可用集合 = 1 + 2 + 3 + 6。** 其余模块只要在 `bootstrap.collaboration` 里不声明、`permissions` 里不给权限，桌面端就会自动隐藏对应入口，不会报错。

---

## 1. 端点总表

所有工作区端点都以绑定地址为基址，前缀 `/api/v1/workspace`；业务接口统一在 `/api/v1/workspace/oa/*`（拉丁字母 `oa`；桌面端只转发 `/oa/` 开头的路径）。

| 方法 | 路径 | 用途 | 必须返回 |
| --- | --- | --- | --- |
| GET | `/api/v1/workspace/discovery` | 工作区发现 | 见 §4.1 |
| GET/POST | `{issuer}/authorize` | OIDC 授权页（GET 渲染登录页，POST 提交） | 302 → `rallyloom://callback?code=&state=` |
| POST | `{issuer}/token` | 授权码换令牌 | `access_token` / `token_type=Bearer` / `expires_in`（可选 `id_token`） |
| GET | `{issuer}/userinfo` | 用户信息（可选） | `sub` 等 |
| GET | `{issuer}/jwks` | 签名公钥 | JWK Set |
| GET | `/api/v1/workspace/bootstrap` | 工作区载荷 | bootstrap（§5、`schemas/workspace-bootstrap.schema.json`） |
| PATCH | `/api/v1/workspace/layout` | 保存办公室布局 | **完整 bootstrap**（同 GET /bootstrap） |
| PATCH | `/api/v1/workspace/rooms/{roomId}/slot` | 挂载/卸载房间数据看板 | **完整 bootstrap** |
| GET | `/api/v1/workspace/data-slots/{roomId}` | 房间数据看板行 | `{ rows: [{ label, value, delta? }] }` |
| GET | `/oa/office/seats` | 当前入座状态 | `[{ memberId, roomId, seatIndex, seated }]` |
| PUT | `/oa/office/seats/self` | 本人入座 / 离座 | 同 GET 的数组 |
| GET | `/oa/records/{kind}?after=0&limit=100` | 记录分页 | `{ items: [...], nextCursor: number \| null }` |
| POST | `/oa/records/{kind}` | 新建记录 | 新记录（含 `id`、`revision`） |
| PATCH | `/oa/records/{kind}/{id}` | 更新记录（带 `revision`） | 更新后的记录 |
| DELETE | `/oa/records/{kind}/{id}?revision=N` | 删除记录 | 2xx 即可 |
| GET / PUT | `/oa/task-board` | 读取 / 保存任务看板定义 | `TaskBoardDefinition` |
| POST | `/oa/tasks/{id}/move` | 拖动任务 | 2xx 即可（客户端随后重新拉列表） |
| GET | `/oa/chat/channels` | 会话列表 | `ChatChannel[]` |
| GET | `/oa/chat/channels/{id}/messages?limit=200` | 历史消息 | `ChatMessage[]`（时间正序/倒序均可，客户端按 `sentAt` 排序） |
| POST | `/oa/chat/channels/{id}/messages` | 发消息 | `ChatMessage` |
| GET | `/oa/chat/channels/{id}/members` | 会话成员 | `ChatParticipant[]` |
| GET | `/oa/chat/channels/{id}/mentions` | 可 @ 的人 | `{ people: ChatParticipant[], allowAll: boolean }` |
| POST | `/oa/chat/direct` | 打开/创建私聊 | `ChatChannel` |
| GET | `/oa/unread/message` | 未读 @ 消息 | `ChatMessage[]` |
| POST | `/oa/read/message` | 标记 @ 已读 | 2xx |
| GET | `/oa/chat/attachments/{id}` | 下载聊天附件 | `{ base64, contentType? }` |
| GET | `/oa/unread/notice` | 未读通知 id | 也可只返回列表（客户端用 `!isRead` 过滤） |
| POST | `/oa/read/notice` | 标记通知已读 | 2xx |
| GET | `/oa/reports/templates` | 汇报模板配置 | `ReportConfig`（见 `reporting.md`） |
| PUT | `/oa/reports/templates/{id}` | 保存模板 | 更新后的模板 |
| GET | `/oa/reports/entries?templateId=&day=&after=&limit=` | 汇报记录分页 | `ReportPage` |
| PUT | `/oa/reports/entries/{templateId}/{day}` | 提交/保存汇报 | 更新后的 entry |
| GET | `/oa/jukebox` | 点歌台曲库 | `JukeboxFeed` |
| POST | `/oa/jukebox/tracks` | 上传 MP4（multipart：`title` + `file`） | 新曲目 |
| GET | `/oa/jukebox/media/{mediaId}` | 媒体内容 | `{ base64, contentType }` |
| DELETE | `/oa/jukebox/tracks/{mediaId}` | 删除自己上传的曲目 | 2xx |

> `kind` 目前只有 `task` / `doc` / `notice` 三种，共用同一套分页与 revision 规则（§7）。

---

## 2. 通用约定

### 2.1 地址与鉴权

- 基址＝绑定地址（如 `https://mirapilot.com`），所有正式接口都在 `https://` 下；桌面端拒绝 `http://`（localhost 调试除外）。
- 除 discovery/authorize/token/jwks 外，所有请求都会带 `Authorization: Bearer <access_token>`。
- 桌面端 `/oa` 请求额外带 `X-Rallyloom-Scope: <scope id>`（当 `collaboration.scopes` 有多项时用于限定公司/业务域）；没有 scope 的请求不带该头。
- 令牌只作用于本工作区：**一个 OA 地址 = 一家公司**，跨租户数据必须 403，不能静默返回空。

### 2.2 `/oa` 转发规则（桌面端实现约束）

- 只转发 `GET / POST / PATCH / PUT / DELETE`；
- 路径必须匹配 `^/oa/[a-zA-Z0-9_/?=&%.-]+$`；
- 请求体默认 JSON；以下两个例外由桌面端特殊处理：
  - `POST /oa/jukebox/tracks`：multipart（字段 `title`、`file`，文件为 MP4）；
  - `GET /oa/jukebox/media/{id}` 和 `GET /oa/chat/attachments/{id}`：返回 `{ base64, contentType? }`，桌面端自行解码成 Blob。
- 业务接口**不要**再校验 CORS（请求来自 Electron 主进程，不是浏览器）；但 OIDC 登录页必须允许浏览器表单提交（见 §4.3）。

### 2.3 时间与幂等

- 所有时间字段用 ISO 8601 字符串（带时区，如 `2026-11-26T01:20:00+08:00`）；只接受 UTC 或带偏移的写法，不要用无时区的 naive 时间。
- 记录更新采用乐观锁：客户端 PATCH/DELETE 会带 `revision`；服务端版本不一致必须返回 `409`，客户端会提示「内容已由其他人更新，请刷新后重试」。

### 2.4 错误码

| HTTP | 含义 | 桌面端表现 |
| --- | --- | --- |
| 400 | 字段非法 | 显示服务端返回的 message（建议中文） |
| 401 | 令牌缺失/过期 | 触发重新登录（`AUTH_REQUIRED`） |
| 403 | 权限不足 / 跨租户 / 租户被禁用 | 显示错误并回到登录或工作区不可用页 |
| 404 | 接口未实现 | 对应模块报「工作区暂未提供该能力」 |
| 409 | revision 冲突 | 提示刷新重试 |
| 429 | 限流 | 客户端退避重试（建议返回 `Retry-After`） |
| 5xx | 服务端错误 | 显示「企业系统暂时不可用」 |

错误体建议：`{ "code": "OPTIONAL_CODE", "message": "中文说明", "detail": "可选" }`。

---

## 3. 能力声明与权限

### 3.1 `bootstrap.collaboration`（能力开关）

不声明＝关闭；声明后桌面端才显示对应入口。字段见 `schemas/workspace-bootstrap.schema.json`。

```jsonc
"collaboration": {
  "version": 1,
  "scopes": [{ "id": "mira-main", "label": "平台总部" }],   // 业务域；会作为 X-Rallyloom-Scope
  "documents": { "folders": true },                        // 文档知识库文件夹
  "seating": { "version": 1 },                             // 日常入座/离座
  "reporting": { "version": 1 }                            // 工作汇报
}
```

### 3.2 `bootstrap.permissions`（权限字符串）

`office.view` 必填；其余按需下发。桌面端用这些字符串决定可见模块和按钮：

| 权限 | 作用 |
| --- | --- |
| `office.view` | 查看办公室（必需） |
| `layout.edit` | 编辑办公室布局（否则只能看） |
| `slots.attach` | 挂载/更换房间数据看板 |
| `team.view` | 查看完整成员目录（无则只能看到自己） |
| `chat.use` | 交流室 |
| `tasks.use` | 任务看板 |
| `tasks.coordinate` | 配置任务看板（状态/字段） |
| `docs.use` | 文档中心 |
| `notify.view` | 通知中心 + 办公室公告浮窗 |
| `notify.publish` | 发布通知 |
| `reports.use` | 工作汇报 |
| `reports.write` | 提交/编辑汇报 |
| `reports.review` | 查看授权范围内其他成员的汇报 |
| `reports.configure` | 管理企业汇报模板 |
| `jukebox.use` | 点歌台 |

> 权限字符串由企业侧决定（例如租户员工默认 `member` 只给读权限，平台账号给 `owner` 全量）。桌面端不会自行推断。

### 3.3 模块矩阵

| 模块 | 需要的声明/权限 | 未提供时 |
| --- | --- | --- |
| 办公室 | `office.view` + `layout` | 进入「办公室尚未编排」空态 |
| 数据屏/看板 | `dataSlots` + `/data-slots` | 屏幕显示「尚未接入数据来源」 |
| 入座/离座 | `seating.version` + `/office/seats` | 工位显示为静态（点击无动作） |
| 交流室 | `chat.use` + `/oa/chat/*` | 侧栏隐藏 |
| 任务 | `tasks.use` + `/oa/task-board`、`/oa/records/task` | 侧栏隐藏 |
| 通知 | `notify.view` + `/oa/records/notice`、`/oa/read/notice` | 侧栏隐藏、办公室无公告卡 |
| 文档 | `docs.use` + `/oa/records/doc` | 侧栏隐藏；文档为 0 篇时显示空态 |
| 汇报 | `reporting.version` + `reports.use` | 侧栏隐藏 |
| 点歌台 | `jukebox.use` | 侧栏隐藏；办公室播放器只显示空态 |

---

## 4. 发现与 OIDC 登录

### 4.1 `GET /api/v1/workspace/discovery`

```json
{
  "api_version": "v1",
  "installation_id": "mira-primary",
  "workspace_id": "mira-company",
  "display_name": "Mira 公司工作区",
  "authorization": {
    "issuer": "https://mirapilot.com/api/v1/oidc",
    "client_id": "rallyloom-desktop",
    "resource": "https://mirapilot.com/api/v1/workspace"
  }
}
```

- `installation_id` / `workspace_id` 一经绑定，后续所有响应必须一致，否则桌面端判 `WORKSPACE_CHANGED` 并要求重新绑定。
- `display_name` ≤160 字，会显示在登录页与侧栏。
- `authorization.resource` 会作为 OIDC `resource` 参数与 token 请求参数携带（RFC 8707），请校验。

### 4.2 OIDC 要求

- Authorization Code + PKCE（`code_challenge_method=S256`），**公开客户端**（`token_endpoint_auth_method=none`）。
- 回调固定 `rallyloom://callback`（桌面端会把 `rallyloom://callback/?code=...&state=...` 也视为合法）。
- 允许的 scope：`openid profile`；`state` / `nonce` 必须原样回传。
- access token 建议 5–60 分钟；Rallyloom 不持久化令牌，重启后重新登录。
- 授权页必须能用浏览器打开并支持**表单 POST 提交**（见下）。

### 4.3 ⚠️ 登录页 `Referrer-Policy`（真实踩坑，必读）

如果授权页在所有响应上设置 `Referrer-Policy: no-referrer`，Chromium 在**表单 POST 导航**时会发送 `Origin: null`，导致服务端 CORS 过滤器返回 403 `Invalid CORS request`，用户看到纯文本错误页。

- 授权/登录/MFA 页面请使用 `Referrer-Policy: same-origin`（或去掉该头）。
- 不要给授权页加会拦截 POST 的 `form-action`/`default-src` 限制以外的策略。
- 自检：`node agent-skill/reference/verify-provider.mjs https://你的地址` 会检查 discovery 与授权页的 Referrer-Policy，并用无头 Chrome 实际提交一次表单 POST 打印 Origin。

### 4.4 换令牌响应

```json
{ "access_token": "...", "token_type": "Bearer", "expires_in": 900, "scope": "openid profile" }
```

返回 `id_token` 时桌面端会严格校验签名/issuer/audience/nonce；不返回 `id_token` 时退化为 OAuth2 响应校验（CSRF 由 state+PKCE 保证）。

---

## 5. `GET /api/v1/workspace/bootstrap`

一次返回桌面端渲染所需的全部只读数据。**完整字段约束以 `schemas/workspace-bootstrap.schema.json` 为准**，下面是必填清单。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `installation_id` | string | ✅ | 与 discovery 一致 |
| `workspace_id` | string | ✅ | 与 discovery 一致 |
| `tenant` | `{ id?, name }` | ✅ | `name` ≤200 字，显示为工作区名；`id` 客户端以绑定为准 |
| `member_id` | string | ✅ | 当前登录成员 id，必须在 `team` 中 |
| `permissions` | string[] | ✅ | 含 `office.view` |
| `team` | Member[] | ✅ | 成员目录；无 `team.view` 时只返回本人 |
| `policy` | object | ✅ | 可传 `{}` |
| `layout` | Layout | ✅ | 办公室布局（§6，或传最小空布局） |
| `dataSlots` | object | ✅ | 房间 id → 看板槽位，可传 `{}` |
| `collaboration` | object | 可选 | 能力开关（§3.1） |
| `jukebox` | object | 可选 | 企业精选歌单（§13） |

### 5.1 Member 字段

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | ✅ | 全局唯一；布局分配、工位 API 都用它 |
| `connectorId` | string | ✅ | 身份源 id（企业可固定为任意值） |
| `idpId` | string | ✅ | 外部身份 sub |
| `displayName` | string | ✅ | 显示名 |
| `attrs` | `Record<string,string>` | ✅ | 自由属性（部门/岗位/公司…），桌面端只展示 |
| `roleId` + `roleName` | string | ✅* | 推荐写法；或给兼容字段 `role` ∈ owner/admin/member/guest |
| `presence` | enum | ✅ | `online / busy / away / offline`；**offline 只影响「在岗」统计，不影响入座显示** |
| `email` / `sourceRoleName` / `externalGroups` / `officeAssignable` | - | 可选 | `externalGroups` 用于组→角色映射 |

### 5.2 注意

- `PATCH /layout` 与 `PATCH /rooms/{id}/slot` **必须返回同样的完整 bootstrap**，否则客户端报 `INVALID_RESPONSE`。
- bootstrap 中不要下发令牌、密钥或其它租户数据。
- 成员数可达数千；`team` 上限 10000，超过请按 `team.view` 收敛。

---

## 6. 办公室布局（`PATCH /api/v1/workspace/layout`）

请求体 = 完整 Layout（桌面端把当前编辑结果整体提交）；服务端校验通过后持久化，并**返回完整 bootstrap**。

布局字段与规则详见 `schemas/office-layout.schema.json`；细则：

### 6.1 画布与房间

- `width` 500–4000、`height` 300–4000（世界单位），`unitsPerMeter` 10–1000（默认 50，即 1 米 = 50 单位）。
- `rooms` ≤80；每间必填 `id`、`name`、`template`、`frame{x,y,width,height}`。
- `template` 只能是：`desk-grid`（开放办公）、`studio`（技术部）、`fulfillment`（仓储）、`support-pods`（客服）、`command`（指挥台）、`showroom`（展示）、`meeting`（会议室）、`reception`（前台）、`pantry`（茶水）、`empty`（空房）、`room-shell`（通用壳）。
- 可选 `boundary`（多边形，支持 L 形）：`outer` 3–256 个点、`holes` ≤32；**`frame` 必须严格等于 boundary 外环包围盒**。
- 房间多边形不得重叠；总面积等于画布面积时视为无缝铺满。
- `floorMaterial` ∈ `wood / tile / concrete / quartz / terrazzo`；也可用 `floor` 传 `#rrggbb` 底色。
- `useTemplateFurniture: false` 时只渲染 `furniture` 列表（空白房间用这个 + `room-shell`）。
- `walls` 四向 `solid / glass / open`；`door{side, offset, width}` 门洞距墙角至少 6 单位。

### 6.2 家具（37 种白名单 + 默认尺寸）

`furniture` 每间 ≤60 件；字段 `id, kind, x, y, rotation?, color?, elevation?, size?`，`x/y` 为房间内归一化坐标 0–1，`size` 覆盖默认尺寸（世界单位，1–800）。

| kind | 默认宽×深×高 | kind | 默认宽×深×高 |
| --- | --- | --- | --- |
| desk | 60×36×24 | workstation | 62×80×40 |
| chair | 24×26×28 | meeting-table | 150×62×25 |
| round-table | 62×62×24 | conference-table | 240×74×26 |
| coffee-table | 48×30×14 | sofa | 75×32×29 |
| rug | 130×92×1 | plant | 23×24×38 |
| plant-large | 44×44×74 | shelf | 56×22×44 |
| bookcase | 96×26×88 | cabinet | 62×26×26 |
| display-shelf | 78×22×44 | counter | 130×38×28 |
| clothes-rack | 78×30×48 | partition | 5×46×28 |
| screen | 125×8×62 | tv | 96×6×56 |
| whiteboard | 120×6×72 | bench | 200×56×40 |
| desk-l | 96×76×25 | studio-light | 32×24×60 |
| camera | 24×24×42 | printer | 28×24×17 |
| trolley | 36×38×32 | carton | 22×18×15 |
| microwave | 27×24×17 | sink | 30×24×18 |
| cup | 8×8×7 | coffee | 20×19×28 |
| lamp | 18×18×48 | notebook | 18×13×2 |
| monitor | 30×14×28 | water-cooler | 24×24×56 |
| data-screen | 200×8×112 | | |

> **服务端白名单必须与桌面端一致**。桌面端已支持上表 37 种；如果你的服务端只放行旧 28 种，用户在编辑器里放新家具后保存会收到 400「家具位置、旋转或型号无效」。放行方式：在服务端把 kind 字符串加入白名单即可（内容仍由桌面端渲染，服务端不需要理解模型）。

### 6.3 座位与分配

- `seats` 每间 ≤60，`{x,y}` 房间内归一化坐标，可带 `facing` 或 `rotation`。
- `assignments`：成员 → 房间 id；成员必须在 `team` 内，每间人数 ≤ 该间座位数。
- `seatAssignments`：成员 → 座位序号 0–59（可选）；没有固定序号时客户端按顺序自动分配。
- 分配后桌面端会让人物**坐在对应工位**；`presence=offline` 也照常显示（仅影响「在岗」数字）。

### 6.4 数据显示屏（`data-screen`）

`data-screen` 家具的内容不是写在布局里，而是来自**房间数据看板**：

1. bootstrap 的 `dataSlots[roomId]`（或 `PATCH /rooms/{roomId}/slot` 挂载）：
   ```jsonc
   { "kind": "external-api", "name": "企业工作概览",
     "url": "https://你的域名/api/v1/workspace/data-slots/<roomId>", "refreshSec": 60 }
   ```
   `url` 必须与工作区同源 HTTPS，`refreshSec` 15–600。
2. 桌面端按 url 拉取（带 Bearer）：
   ```json
   { "rows": [ { "label": "今日 GMV", "value": "¥128,400", "delta": "+12.4%" } ] }
   ```
   最多展示 5 行；`delta` 以 `-` 开头显示红色、以 `+` 开头显示绿色。
3. 没有 slot 或没有行时，屏幕显示「尚未接入数据来源」。

> 想展示「今日 GMV / 上架数 / 履约率」这类经营数据，就把数据行灌进 `/data-slots/{roomId}`；桌面端不存储业务数据。

---

## 7. 工位入座（日常）

仅在 `collaboration.seating.version === 1` 时启用。

- `GET /oa/office/seats` → `[{ "memberId": "...", "roomId": "...", "seatIndex": 0, "seated": true }]`
- `PUT /oa/office/seats/self` ← `{ "roomId": "...", "seatIndex": 0, "seated": true, "layoutRevision": 12 }`，返回同样的数组（桌面端直接用它刷新画面）。
- 语义：一个成员同一时间最多一个 `seated: true`；`seated: false` 表示离座（人物回到站立/走廊区域）。
- 桌面端每 5 秒拉一次 `GET /oa/office/seats`；`layoutRevision` 用于拒绝基于过期布局的入座。
- 工位属于房间，房间即交流室：`PATCH /api/v1/workspace/layout` 的 `assignments` 同时决定 `room:<roomId>` 交流室成员，分配/移出工位即加入/退出该交流室，详见 §12.3。

---

## 8. 通用记录接口（任务 / 文档 / 通知）

三种资源共用：

- `GET /oa/records/{kind}?after=0&limit=100` → `{ "items": [...], "nextCursor": 123 | null }`；
  - `after` 为上一页的 `nextCursor`（0 表示第一页）；`nextCursor=null` 表示结束；客户端最多翻 50 页（5000 条）。
  - 分页游标必须单调前进（否则客户端报「分页游标未前进」）。
- `POST /oa/records/{kind}` → 新建，返回带 `id`、`revision` 的记录；
- `PATCH /oa/records/{kind}/{id}` → 更新，body 必须含 `revision`；冲突返回 409；
- `DELETE /oa/records/{kind}/{id}?revision=N` → 删除。
- 记录公共字段：`id`、`revision`、`createdBy?`、`updatedAt`、`canEdit?`、`canDelete?`；客户端只读 `canEdit/canDelete` 决定按钮可用。
- 客户端每 10 秒拉一次列表（轮询）；服务端不需要推送。

---

## 9. 任务

### 9.1 `TaskBoardDefinition`（`GET/PUT /oa/task-board`）

```jsonc
{
  "defaultStatus": "todo",
  "statuses": [
    { "id": "backlog", "label": "待排期", "dot": "#a3a3a3", "category": "todo" },
    { "id": "todo", "label": "待办", "dot": "#3f72b5" },
    { "id": "doing", "label": "进行中", "dot": "#2f8f86" },
    { "id": "done", "label": "已完成", "dot": "#6b8f4e" }
  ],
  "fields": [
    { "id": "assignee", "label": "负责人", "type": "text" },
    { "id": "priority", "label": "优先级", "type": "select", "options": ["P0", "P1", "P2", "P3"] }
  ]
}
```

- 状态/字段各 ≤32；`dot` 必须是 `#rrggbb`；`transitions` 若提供必须引用已定义状态。
- `PUT /oa/task-board` 需要 `tasks.coordinate` 权限。

### 9.2 `TaskRecord`（`/oa/records/task`）

| 字段 | 说明 |
| --- | --- |
| `id` / `revision` | 记录 id / 版本 |
| `title` | 任务标题（必填） |
| `status` | 必须来自看板定义的 `statuses[].id` |
| `priority?` | P0–P3 |
| `assigneeId?` / `assigneeName?` | 负责人 |
| `due?` | 截止日期（ISO） |
| `roomId?` | 关联房间（办公室联动） |
| `createdBy?` | 创建人 id |
| `reviewPending?` | 是否待复核 |
| `sourceMessage?` | 来源消息（可选） |
| `attrs` | 自由属性 |
| `updatedAt` / `canEdit` / `canDelete` / `canManage` | 展示与按钮控制 |

### 9.3 `POST /oa/tasks/{id}/move`

```json
{ "status": "doing", "beforeId": null, "revision": 7 }
```

`beforeId` 用于列内排序（插到该任务之前，null = 末尾）。返回 2xx 后客户端重新拉列表。

---

## 10. 文档

`/oa/records/doc` 的记录字段（`src/lib/docs/types.ts`）：

| 字段 | 说明 |
| --- | --- |
| `entryType?` | `document`（默认）/ `folder`；旧数据可省略 |
| `title` | 标题（必填） |
| `space` | 知识库名（左侧树分组） |
| `folderPath?` | 有序父目录名数组（需要 `documents.folders=true`） |
| `format` | `rich`（富文本 HTML）/ `markdown`（源文）/ `link`（外链） |
| `content` | rich=HTML；markdown=Markdown 源文；link 可为空 |
| `url?` | `format=link` 时必填 |
| `attachments?` | `[{ id, name, size, mime, url }]`（正文内联附件；文件本身由企业托管） |
| `ownerName?` / `updatedAt` / `attrs?` | 展示与扩展 |
| `canEdit` / `canDelete` / `revision` | 权限与乐观锁 |

- 目录（文件夹）用 `POST /oa/records/doc` 创建 `entryType:"folder"` 的记录；重命名/移动文件夹 = PATCH 该文件夹 + 批量 PATCH 子项 `folderPath`（客户端不做递归删除，删除前必须为空）。
- **想让「文档中心」有内容，实现 `/oa/records/doc` 的 list/create/update/delete 即可**；当前 Mira 返回 0 篇，所以界面是空态。

---

## 11. 通知

`/oa/records/notice` 的记录字段：

| 字段 | 说明 |
| --- | --- |
| `title` | 标题（必填） |
| `summary?` | 摘要/正文（办公室公告卡里展示完整摘要） |
| `level` | `info` / `warning` / `urgent` |
| `occurredAt` | 发生时间（ISO，倒序展示） |
| `pinned?` | 置顶（公告浮窗优先展示） |
| `url?` | 点击跳转链接 |
| `isRead?` | 已读状态（也由 `POST /oa/read/notice` 持久化） |
| `externalNoticeId` / `sourceId` / `attrs?` / `origin` | 来源标识与扩展 |

- 办公室顶部公告卡**只来自通知中心**：`notices` 里有未读才出现；点「已阅」= `POST /oa/read/notice{ids:[...]}`。
- `GET /oa/unread/notice` 可用来快速取未读 id；也可直接让客户端用列表里的 `isRead` 过滤。

---

## 12. 交流室

### 12.1 数据字段

- `ChatChannel`：`{ id, name, info, roomId?, peerId? }`（`roomId` 存在时表示房间频道，与办公室联动；`peerId` 表示私聊）。
- `ChatParticipant`：`{ id, name, roomId?, presence, detail? }`。
- `ChatMessage`：`{ id, channelId, senderId, senderName, text, sentAt, attachments?: [{id,name,size}], mention?: "all"|"members", mentionRecipientIds?: string[] }`。

### 12.2 约定

- 历史消息一次最多 200 条；客户端每 4 秒轮询一次增量（自己按 id 去重，可只返回最近消息）。
- 发消息附件 ≤5 个、合计 ≤20 MB；附件走 `POST /oa/chat/channels/{id}/messages` 的 `files:[{name, base64}]`，读取走 `GET /oa/chat/attachments/{id}`。
- `GET /oa/chat/channels/{id}/members` 也用于**频道列表显示人数与在线数**：桌面端会为每个频道预取一次成员列表，所以该接口必须按频道返回准确的成员（含 `presence`）。
- `@` 名单：`GET /oa/chat/channels/{id}/mentions` 返回 `{ people: [...], allowAll: boolean }`。
- 未读 `@`：`GET /oa/unread/message`、`POST /oa/read/message { ids }`。

---

### 12.3 房间交流室与座位绑定（座位即成员）

**核心语义：分配工位就是把人聚到同一个交流室里。** 办公室里的每个区域都对应一个交流室频道，频道 id 固定为 `room:<roomId>`（`roomId` = 布局里的房间 id）。

- **分配工位 = 加入交流室**：`PATCH /api/v1/workspace/layout` 保存新的 `assignments` 后，被分到该房间的成员必须出现在 `GET /oa/chat/channels/room:<roomId>/members` 里，并可以成员身份收发消息。
- **移出工位 = 退出交流室**：成员从 `assignments` 移除（或改派到其他房间）后，必须从原房间频道的成员列表中移除；其历史消息仍然保留在频道里。
- `GET /oa/chat/channels` 需要返回所有房间频道（**包括空房间**，成员为 0），并回填 `roomId`；桌面端据此在办公室与交流室之间联动。
- 不需要新增端点：桌面端“分配工位”保存就是调用 `PATCH /api/v1/workspace/layout`，请提供方在服务端把 `assignments` 当作房间频道的成员事实源。

**删除房间的归档语义**（桌面端编辑器会先提示“归档并删除”）：

1. 若该房间交流室**已经有聊天记录**，提供方不得物理删除消息：应把频道标记为归档（不再出现在 `GET /oa/chat/channels`，历史消息保留在企业数据库，直到管理员彻底清除该房间数据）。
2. 若从未产生消息，可直接删除该频道与房间数据。
3. `PATCH /api/v1/workspace/layout` 返回的完整 bootstrap 中不应再包含被删除的房间；归档动作由提供方在服务端完成，桌面端不做数据清理。

---

## 13. 工作汇报

见 `agent-skill/reporting.md`（含完整 JSON 示例与校验）。要点：

- `GET /oa/reports/templates` → `ReportConfig{ version:1, timeZone, today, canConfigure, templates[] }`
- `PUT /oa/reports/templates/{id}`（需要 `reports.configure`）
- `GET /oa/reports/entries?templateId=&day=&after=&limit=100` → `ReportPage{ items, nextCursor, periodStart, periodEnd }`
- `PUT /oa/reports/entries/{templateId}/{day}`，body `{ answers, submit, revision, templateRevision }`
- 模板 ≤100；每模板 1–30 字段；字段类型 `text / multiline / number / date / select / table`，可选 `section` 用于分组；重复表格定义稳定列、行数上下限和可选初始行。答案文本 ≤10000、合计 ≤100000。`submissionWindow` 可限制提交时段；Mira 的周报只在企业时区周六、周日开放，记录上一完整周，关闭后仍可只读回看。
- Mira 在 `/api/platform/rallyloom/reports/templates` 提供完整平台管理员专用的模板配置页接口；租户模板仍由 `reports.configure` 和企业适配器授权。

---

## 14. 点歌台（自带 MP4 / YouTube）

见 `integration-spec.md` §13，外加两条由 `/oa` 特殊处理的接口：

- `GET /oa/jukebox` → `JukeboxFeed{ day, dailyTrackId, dailyTrack?, tracks[] }`
- `POST /oa/jukebox/tracks`：multipart `title` + `file`（MP4，≤20 MiB）
- `GET /oa/jukebox/media/{mediaId}` → `{ base64, contentType }`
- `DELETE /oa/jukebox/tracks/{mediaId}`：只能删自己上传的

也可以不改 `/oa`，只在 `bootstrap.jukebox.playlists` 里下发精选歌单（`schemas/jukebox.schema.json`）：`url` 必须是 HTTPS；YouTube 链接请给 `provider:"youtube"` 或直接给 watch/youtu.be 链接（桌面端用隐藏 webview 播放 watch 页）。

---

## 15. 安全与多租户边界

- **租户随令牌绑定，不从请求体读取**：一个 OA 地址对应一家公司；客户端不能切换租户。
- 跨租户访问一律 403，**禁止静默返回空数组**（空数组会被当成「真的没有数据」）。
- 令牌签发时必须绑定 `workspace_id` + `source_id`；事件推送侧同一令牌只能写本公司数据（一源一司）。
- bootstrap 不下发其它租户成员；`team` 只包含当前工作区可见成员。
- 服务端必须校验 `layout` 中每个 `assignments` / `seatAssignments` 成员都在 `team` 内。
- 建议所有写接口做 revision 校验，避免并发覆盖。

---

## 16. 自检与验收

### 16.1 离线校验你的响应

```bash
# 1) bootstrap 契约（含 layout、team、dataSlots、jukebox、collaboration）
node agent-skill/reference/verify-provider.mjs --bootstrap bootstrap.json

# 2) 单独校验布局（可加 --team bootstrap.json 校验成员归属）
node agent-skill/reference/verify-provider.mjs --layout layout.json --team bootstrap.json

# 3) 在线检查 discovery / OIDC / Referrer-Policy / 表单 POST Origin
node agent-skill/reference/verify-provider.mjs https://你的域名
```

也可以直接用 JSON Schema 校验：
`schemas/workspace-bootstrap.schema.json`、`schemas/office-layout.schema.json`、`schemas/jukebox.schema.json`。

### 16.2 验收清单

- [ ] discovery 的 `installation_id`/`workspace_id` 与后续 bootstrap 完全一致
- [ ] 浏览器打开授权页 → 输入账号 → 302 回 `rallyloom://callback?code=&state=`，桌面端自动完成登录（无 `Invalid CORS request`）
- [ ] bootstrap 通过 `--bootstrap` 校验，且返回 200
- [ ] 办公室能进入，房间/家具渲染正常；`PATCH /layout` 返回完整 bootstrap
- [ ] 分配工位后员工坐在工位上（`presence=offline` 也应显示）
- [ ] 交流室频道列表直接显示人数/在线数（不必点开频道）
- [ ] 任务/通知/文档/汇报按权限出现；新建/编辑/删除可用（revision 冲突返回 409）
- [ ] 断开网络或令牌过期时，桌面端提示重试/重新登录而不是白屏

### 16.3 最小对接清单（按优先级）

1. `GET /discovery` + OIDC（PKCE）+ `GET /bootstrap`（`office.view`、`team`、最小 `layout`、`dataSlots:{}`）
2. `PATCH /layout` 落库（返回 bootstrap）
3. 办公室家具白名单放行 37 种（否则保存 400）
4. `/oa/records/doc`（文档中心有内容）、`/oa/records/notice`（通知/公告）
5. `/oa/chat/*`（交流室）、`/oa/task-board` + `/oa/records/task` + `/oa/tasks/{id}/move`（任务）
6. `/oa/office/seats`（日常入座）、`PATCH /rooms/{id}/slot` + `GET /data-slots/{roomId}`（数据显示屏）
7. `/oa/reports/*`、`/oa/jukebox*`（可选模块）

---

## 17. 附：字段速查

| 对象 | Schema 文件 |
| --- | --- |
| bootstrap 响应 | `schemas/workspace-bootstrap.schema.json` |
| 办公室布局 | `schemas/office-layout.schema.json` |
| 精选歌单 | `schemas/jukebox.schema.json` |
| 点歌台运行时 | `schemas/jukebox-feed.schema.json` |
| 事件推送信封与 12 类事件 | `schemas/envelope.schema.json` 等（见 README 目录表） |

版本：v2.2（2026-11-26）。变更：新增完整 Provider REST 契约、37 家具白名单、data-screen/数据看板取数、工位 API、`/oa` 转发规则与错误码表；完善通用汇报的分区、表格字段、模板权限和按企业时区执行的周末提交窗口。
