# 企业 OA 协作契约（Rallyloom 0.12）

正式桌面应用通过 Electron 主进程的 `workspace.oa` 访问同源 `/api/v1/workspace/oa`。访问/续期令牌只在主进程，renderer 不保存密码或 access token。接口返回原生 JSON，不包装企业其他接口的信封。企业负责持久化、鉴权、对象范围、角色名称、任务状态和自定义字段。

## 功能与能力

| 能力 | 客户端入口 | 企业提供方责任 |
| --- | --- | --- |
| `chat.use` | 交流室、办公室聊天、提及、附件 | 频道成员范围、发送人取当前凭据、私聊仅参与者可读 |
| `tasks.use` | 任务看板、表格、任务详情、工作台 | 本人/指派/管理范围、任务原子排序、更新版本校验 |
| `tasks.coordinate` | 工作协调、看板配置 | 服务端按当前来源角色授权；不能授予跨公司管理 |
| `docs.use` | 文档树、右侧阅读/编辑、全屏 | 对每条文档返回 `canEdit/canDelete` 并独立校验 |
| `notify.view` / `notify.publish` | 通知中心 / 发布 | 公告范围、发布权限、逐用户持久化已读 |
| `reports.use` / `reports.write` | 查看汇报 / 员工填写 | 日周月周期、作者身份、提交后禁止覆盖；管理者只查看 |

Bootstrap 提供 `collaboration: {version:1, scopes:[{id,label}]}`。工作区仍是同一企业；scopes 是获准公司的工作数据范围，不是客户端切换登录租户。多公司用户切换任务/汇报时发送 `X-Rallyloom-Tenant: <scope.id>`；`company` 指企业公共工作。租户用户不能用这个头切入其他公司。提供方不支持协作接口时，必须不授予上述能力，不得回退 Demo 数据。

## 房间看板

`PATCH /api/v1/workspace/rooms/{roomId}/slot` 沿用工作区契约，仅 `slots.attach` 可写。当前 Mira 工作概览是受保护的同源 `/data-slots/{roomId}`；桌面主进程生成固定地址，不让 renderer 指向任意主机。界面位于团队成员的「房间工作看板」。

## 接口

所有下列路径相对 `/api/v1/workspace/oa`。

| 方法与路径 | 请求 / 响应 |
| --- | --- |
| `GET /task-board` | `TaskBoardDefinition`，见 `schemas/task-board.schema.json`；可额外返回 `revision` |
| `PUT /task-board` | 保存配置（带上次 revision）；拒绝删除仍有任务的状态 |
| `GET /records/{kind}?after=0&limit=100` | kind=`task/doc/notice`；`{items:[],nextCursor:null或数字}`；游标单调、稳定，过滤在分页前 |
| `POST /records/{kind}` | 对应 TaskPatch / DocDraft / 公告字段；返回完整对象 |
| `PATCH /records/{kind}/{id}` | 部分字段 + 上次 `revision`；返回更新对象 |
| `DELETE /records/{kind}/{id}?revision=N` | 删除成功 `{ok:true}` |
| `POST /tasks/{id}/move` | `{status,beforeId:null或目标id,revision}`；原子校验同公司目标、流转权限、版本并排序 |
| `GET /chat/channels` | `ChatChannel[]`；只返回获准频道 |
| `POST /chat/direct` | `{peerId}`；幂等返回仅双方参与的频道 |
| `GET /chat/channels/{id}/messages?limit=200` | 最近消息，时间升序；每次请求重新检查成员身份 |
| `POST /chat/channels/{id}/messages` | `{text,mentions?:DraftMention[],files?:[{name,base64}]}`；最多5附件/合计20MB，作者由令牌决定 |
| `GET /chat/channels/{id}/mentions` | `{people:[{id,name,presence}],allowAll:boolean}`，不能用客户端传入的收件人授权 |
| `GET /chat/attachments/{uuid}` | 受保护二进制下载，不公开存储地址 |
| `GET /unread/{notice或message}` | 当前用户未读公告或被提及消息，最多100条 |
| `POST /read/{notice或message}` | `{ids:[最多100]}`；逐对象鉴权；返回 `{ok:true}` |

记录公共字段：`id`、`revision`、`updatedAt`、`createdBy`；`canEdit/canDelete` 由服务端下发。任务可返回 `canManage` 区分负责人改状态与发起人/管理者改标题、截止日等。服务端必须拒绝伪造 `createdBy/ownerName/senderId/tenantId`。`sortOrder` 用于任务展示排序，分页游标独立，不能用可变排序值分页。客户端当前以4秒拉取聊天、10秒拉取资源订阅，单视图最多5000条并明确报错，不能把截断伪装成全量。

工作汇报须接入企业现有汇报服务，不另起一套绕过参与范围的记录。Mira 使用：

- `GET /work-reports?type=DAILY|WEEK|MONTH&day=YYYY-MM-DD`：返回既有 `rows`、`editable`、`participating`。员工按本人读取；老板沿用直属员工范围；租户管理员只看本公司；平台只读已纳入 OA 公司。最多查看最近400天，日报按工作日选择。
- `GET /work-reports/shops`：当前员工有权记录日报动作的店铺。
- `PUT /work-reports/daily/{id}`：`{focusNote,data:{tasks,metrics,adjustedShopIds}}`；保留原模板，只有本人昨日已下发日报可写。
- `PUT /work-reports/periodic?type=WEEK|MONTH&day=...`：`{summary,actions,results,problems,nextPlan,submit,version}`；沿用 Mira 原必填项、乐观锁、当前/上期可修订、历史待交补交规则。管理员不代填。

企业的 `participating:false` 必须显示未参与，不展示强制填写入口。旧 `/records/report` 已停用。Mira 的汇报由同一份数据库记录驱动 ERP 运营看板，无需复制或迁移。其他企业如使用不同汇报模板，应扩展契约并在服务端做字段转换，不能默认拿 Mira 模板套其他公司。

`401` 需重新授权或使用主进程续期；`403` 不得重试成其他租户；`409` 保留编辑内容并提示重新载入；`400` 展示字段错误。重试失败不能显示成功。任务失败保留原状态/顺序，文档全屏切换不应重建编辑器。

## Mira 的默认边界（其他企业可自行定义）

- 仅平台已纳入 OA 的 ACTIVE 公司与非供应商 ACTIVE 账号可进入；停用、排除和 session_version 变更即时失效。
- 完整平台管理员：目录覆盖纳入公司，任务/汇报可切公司；布局和角色配置由平台管理。其他人的私聊仍不可读取。
- 租户超管、老板：只看和管理本租户任务，查看本租户汇报，发布本租户通知；不能修改总部公共文档或其他公司对象。
- 员工：目录仅本人；任务仅本人创建或指派给本人；汇报仅本人且须已纳入相应汇报类型；公司共享文档/公告可读，只有自己创建的文档可改。
- 员工不能转派给其他人、配置状态、发布通知、替其他人填写汇报、读取其他员工任务/私聊/附件。
- 重要写操作记录元数据审计；不在日志记录聊天正文、凭据和附件内容。

## 验收（必须分层）

1. 契约：用真实 bootstrap 跑 `reference/verify-provider.mjs --bootstrap`，不把结构检查当权限验收。
2. 客户端：`npm run build`、`node --test tests/task-board.test.mjs tests/oa-clients.test.mjs`、`node tests/docs-board.cjs`、`node tests/formal-oa.cjs`。
3. 提供方：隔离样例验证同公司/跨公司/本人/他人、直接请求隐藏接口、状态迁移、409并发、分页、不合法字段、频道/附件权限和撤销。
4. 生产：真实账号仅只读登录、读快照与负向越权探测；额外的生产写入测试须有具体授权并仅用可识别的临时测试对象，不能向真实群聊发送验收消息。
5. 发布后再读生产版本和迁移状态；桌面必须重启最新构建且保留原用户 profile。
