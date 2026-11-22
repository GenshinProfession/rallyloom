# Rallyloom v0.11

源码公开的 OA 底座与团队虚拟办公室桌面应用。前端使用 React 19、TypeScript、Vite、Tailwind 和 **shadcn/ui 官方组件**，并通过 Electron 打包为 Windows 桌面程序。
定位：**被接入方**——提供入口、接入规范与中性身份容器，任何系统按规范写适配器接入；客户端零存储，数据落超管配置的云端。

**必接板块（底座自带，定位即承诺）**：团队管理 · 办公室 · 交流室 · 任务看板 · 通知中心 · 文档中心。其余板块均为后期二开插槽（见 [docs/oa-foundation-plan.md](docs/oa-foundation-plan.md)）。

## 许可证

Rallyloom 自有代码采用 [PolyForm Noncommercial 1.0.0](LICENSE)。允许按许可证条款进行非商业使用、修改和分发。商业使用须另行取得权利人授权。第三方依赖和资源适用各自的许可条款。

## 功能（v0.11）

### 集团与租户联邦（v0.10 新增 · 可选管辖层 + 集团超管演示档）

- **集团 = 可选能力**：不是所有公司都是管辖体系——`tenant` 增加可选 `groupId/groupName` 字段，不属任何集团的公司（多数部署）不带字段、链路零感知；多租户基线不变
- **合并租户 = 归属同一管辖体系的配置**：分公司法律上是独立租户（股份问题），数据仍按公司硬隔离；集团层提供联邦目录（公司归属 = `attrs["公司"]` 中性属性，无新 Schema）与「策略跟随总部」标记
- **集团超管演示档**：登录页新增「星澜控股集团 · 集团超管（姜衡）」——平台运维轴化身，**不进任何公司成员表**：左上角显示集团名，直接进入集团控制台（两家公司卡片：成员/在线统计、总部·策略制定方 vs 策略跟随集团总部；42 人合并成员目录按公司 chip 着色），「进入工作区」以对应公司超管身份下钻
- 集团视图只读（`DemoGroupClient`），管理动作进工作区后执行；规范见 agent-skill `integration-spec.md` §10.1（agent-skill v1.5）——对接入方纯文档版本，字段/事件/端点零新增

### 多租户（v0.9 · 一家公司一个工作区）

- **租户 = 凭证属性**：正式模式一个 OA 服务地址 = 一家公司，bootstrap 返回 `tenant { id, name }`，客户端不可选择；承接令牌签发时绑定 (工作区, source_id)，报文不携带租户字段——**事件 Schema 零改动**
- **演示双公司**：登录页「选择演示角色」按公司分组——**星辰电商**（tenant-a，31 人电商运营）与**云岭智造**（tenant-b，8 人离散制造：董事长/厂长/车间主任/质检/采购/仓管/大客户经理/行政前台）；两家成员表、角色映射、工位编排完全隔离，切换即切换整套工作区状态
- **隔离断言可演示**：以云岭智造身份进团队管理，只见 B 公司 8 人、不见星辰电商任何成员（演示侧由 `DemoWorkspaceClient` 种子边界保证；真实部署由服务端 bootstrap/ingest 按 (workspace, source_id) 强制）
- 边界纪律：子公司/事业部先用中性 `groups + attrs` 承接，别滥用多租户；guest 跨租户联邦预留 `home_tenant`；自托管单公司退化为 default 工作区。规范见 agent-skill `integration-spec.md` §10（agent-skill v1.4）

### 通知中心（v0.8 新增 · 办公室顶部流动横幅）

- **横幅挂在办公室顶上**：最新公告横向匀速流动（hover 暂停、不足一行不滚动），级别圆点 + 标题 + 时间，置顶优先；右侧固定入口「通知中心 · 未读 N」
- **通知中心页**：级别徽章（通知/提醒/紧急）、置顶、外部来源角标、属性徽章、详情链接；点击即已读，「全部已读」一键清零
- **系统内置功能、数据外部承接**：公告由云端按 **`notice.push` / `notice.remove`** 契约推送（agent-skill v1.3，幂等锚点 `source_id + external_notice_id`）；演示源内置 6 条公告（含 oa/wms 外部推送样例）；**已读状态是员工本机状态，永不回写源系统**
- 权限 `notify.view`（owner/admin/member 可用，访客不可见横幅与入口）

### 文档中心（v0.11 富文本升级 · 类钉钉文档系统）

- **全页面新建 / 编辑**：不再用弹窗——新建与编辑都进入独立页面（面包屑 + 未保存标记 + 取消/保存），正文为白色稿纸卡片，右侧实时大纲，阅读节奏与钉钉文档一致
- **富文本编辑器（TipTap v3）**：标题 1/2/3 级、粗/斜/下划线/删除线/高亮/行内代码、有序/无序/待办清单、引用、代码块（语言选择 + 一键复制）、表格（插入/加行/加列/删行列）、链接、图片、分割线、对齐——所见即所得，保存为 HTML（`format: 'rich'`）
- **正文中间可插入任意类型附件**：文件/图片/音视频/PDF/表格/压缩包/代码等按 MIME 自动识别图标与类型名，卡片可下载或移除；文末自动汇总附件清单（演示环境 2MB 内联上限，正式环境由云端上传）
- **快捷键与 `/` 菜单**：`Ctrl+S` 保存、`Ctrl+Alt+1/2/3` 标题、`Ctrl+Shift+7/8` 列表、`Ctrl+K` 链接；输入 `/` 唤起 13 项插入菜单（上下键选择、回车插入）
- **向后兼容**：历史 Markdown 文档（v0.8 种子与外部推送）自动转渲染，编辑保存时升级为 rich；办公室办公桌面板复用同一套查看器
- **数据承接而非提供**：企业公共文档由云端按 **`doc.upsert` / `doc.remove`** 契约推送（幂等锚点 `source_id + external_doc_id`）；v1.7 起 `doc.upsert` 支持可选 `content_format: 'html'` 与 `attachments[{name,url,size?,mime?}]`（agent-skill v1.7，老推送零改动）；演示源内置 6 篇（制度规范/入职引导/运营标准 空间 + hr 系统外链样例）
- `attrs` 自由属性自动出列为标签徽章；外链文档显示托管卡片 + 一键复制
- 权限 `docs.use`（owner/admin/member 可用，访客不可见入口）

### 任务看板（v0.7 · 类飞书多维表格）

- **两个视图**：看板（待排期 / 待处理 / 进行中 / 已完成 四列，**dnd-kit 拖拽换列**，卡片带负责人/优先级/截止/逾期红字/外部来源角标）+ **多维表格**（除固定列外，任务的自由属性 `attrs` **自动出列**成为动态列——飞书多维表格的字段本质）
- **数据承接而非提供**：任务数据由云端/外部系统按 **`task.upsert` / `task.remove`** 契约推送（agent-skill v1.2，幂等锚点 `source_id + external_task_id`，`attrs` 自由字段即表格列）；演示源内置 14 项电商运营任务（含 crm/erp 外部推送样例，卡片亮「外部」角标）
- **本地操作不被推送重置**：本地拖列、新建任务与外部推送共存；「新建任务」对话框支持指派 31 人任一成员、优先级、状态列、截止日
- 权限 `tasks.use`（owner/admin/member 可用，访客不可见入口）

### 交流室（v0.6 新增）

- **内部沟通工具**：复用欧美开源聊天组件库 **@chatscope/chat-ui-kit-react**（MIT，与 shadcn 风格协调的完整聊天界面），日常工作沟通走这里
- 频道 = 全员大厅 + 每个办公间一个房间频道（共 10 个）；成员在线状态实时反映在会话列表
- 发送消息后演示源自动回复 +「正在输入」指示；消息合并去重、按时间分组渲染
- 权限 `chat.use`（owner/admin/member 可用，访客不可见入口）；消息数据由云端协作后端承接（当前为演示源，接真实后端换 `ChatClient` 实现即可）

### 外置数据插槽与动态承接（v0.6）

- **看板/运营数据不由 Rallyloom 提供**：老板办公台等房间可挂**外置数据看板**——Rallyloom 只存一个 URL + 刷新间隔，定时拉取 `{rows:[{label,value,delta?}]}` HTTPS 端点并渲染；房间瓦片亮「看板」角标，选中房间在右侧面板显示数据卡
- **ACTIVITY 同理**：动态流是 Rallyloom 提供的展示能力，内容一律由外部系统按 **`activity.push`** 事件推送（agent-skill v1.1 契约 + JSON Schema），Rallyloom 只承接不生成；演示环境暂用种子数据
- 数据外部化边界六条表（人/组、角色、编排、动态、看板、聊天消息各归谁）见 `agent-skill/integration-spec.md` §9——**Rallyloom 永不提供核心业务数据的接口，只负责接入与展示**

### 接入规范 + agent-skill（v0.5 起，规范 v1.8）

- **`agent-skill/` 自包含 skill 包**：交给任何 AI Agent / 开发者即可按规范为你的系统开发接入适配器——含 `SKILL.md`（使命/步骤/禁止事项/验收标准）、`integration-spec.md`（规范本体：三种接入模式 × 数据契约 × 幂等/错误码 × 角色边界 × 数据外部化边界）、12 份 JSON Schema（机器可读契约）、可运行参考适配器 `reference/adapter-demo.mjs`（零依赖，`--validate` 自测通过）、提供方体检脚本 `reference/verify-provider.mjs`（`<域名>` 一键验证 discovery/登录页响应头/表单 POST 的 Origin；`--bootstrap <json>` 离线逐字段校验 bootstrap 响应体，v1.8）
- **闭环路径**：你把 agent-skill 丢给任意 Agent → Agent 为你的系统写出适配器 → 你的系统把人/组/任务/动态/公告/文档推入 Rallyloom → 完成
- 规范核心：必填仅 `source_id + external_user_id + display_name + groups`；`email/attrs` 可选；幂等键 `event_id`（≥72h 去重）；`schema_version` 不兼容返回 422 永不静默丢弃；v1.1 追加 `activity.push`、v1.2 追加 `task.upsert`/`task.remove`、v1.3 追加 `notice.push`/`notice.remove` 公告与 `doc.upsert`/`doc.remove` 文档承接、v1.4 追加 §10 多租户（一源一司，Schema 零改动）、v1.5 追加 §10.1 集团与租户联邦（纯文档，零新增）、v1.6 追加 §11 提供方自渲染登录页（`Referrer-Policy: no-referrer` 会让表单 POST 的 Origin 变 null 被网关 403，须改 `same-origin`）+ 体检脚本、v1.7 追加 `doc.upsert` 可选 `content_format: html` 与 `attachments`（富文本 + 附件，向后兼容）、v1.8 追加 §12 接入失败排查地图（错误码 → 阶段 → 字段 → 修复）与 `--bootstrap` 离线契约校验（零 Schema 变更）

### 中性身份模型（部门根治）

- `ExternalIdentity` / `TeamMember` 全面 **attrs 化**：部门/岗位/工号只是源系统的自由属性键值对，Rallyloom 原样展示为徽章，**不再假设任何系统有部门概念**
- **无部门系统演示档**（`demo-idp-minimal` · 顾远）：无 attrs、无邮箱也能正常入队，成员表显示「—（源系统无属性）」
- **组映射 per-source 化**：`SyncPolicy.roleMaps` 按接入源各自配置角色映射（源覆盖优先、全局兜底），「接入管理」卡片显示源专属映射
- 「身份源」页签更名**「接入管理」**（语义反转：我们承接，别人接入）

### 云端存储中心（v0.4）

- **应用本身不做存储**：客户端是「无状态壳」，所有团队数据经 `WorkspaceClient` 读写后端；本地不留任何数据文件
- **两种数据源**：`demo-local`（内存演示）/ `oa-rest`（外置类 OA 后端 REST API）；由**超管统一配置**（`storage.configure` 权限仅 owner）
- **存储页签**（团队管理第 4 页，仅超管可见）：零存储说明、当前数据源状态、六条后端写路径清单、OA 后端配置对话框（服务地址 / 区域 / API 版本 / 携带登录令牌）
- **真实连接尝试**：配置保存即真实 `fetch` 后端 `bootstrap`（4s 超时）；失败时红条如实展示错误且不切换数据源，成功才接入
- **云数据库直连**：仅作说明卡展示——桌面分发会暴露库凭据，生产环境应一律走 OA API
- **登录页联动**：登录后自动接入超管配置的云端存储；CSP `connect-src 'self' https:` 已放行真实后端调用

### 登录与身份（v0.3）

- **外部授权登录**：启动先进入「授权进入团队工作台」；任何外部系统按 `IdentityConnector` 接口接入（OIDC / OAuth2 / SAML / LDAP / 自定义），OIDC 走 **Authorization Code + PKCE**，系统浏览器跳转 + `rallyloom://callback` 深链回调，桌面端不持有密钥
- **演示连接器**：管理员 / 超管 / 外部访客 / 无部门系统 四档演示身份，无需真实账号即可体验完整六步授权时序（跳转 → 确认 → 深链回调 → 换令牌 → 拉身份 → JIT 同步）
- **自动同步对方身份**：JIT 入队（新身份登录即开通）、资料每次登录刷新（姓名/邮箱/属性/外部组）、`connectorId + idpId` 锚定同人
- **权限交由本系统设置**：RBAC `owner / admin / member / guest` × 权限矩阵；同步只按组映射给默认角色，管理员本地覆盖优先且同步永不重置

### 团队管理（v0.3–v0.5）

- **成员**：搜索 + 表格视图（头像/状态、属性徽章（随源系统）、接入源、外部组、角色、最近同步）；角色可本地设置，「跟随同步」一键回到组映射
- **角色与权限**：四角色说明卡 + 权限矩阵（进入办公室 / 查看团队 / 邀请 / 设置角色 / 配置接入 / 配置存储 / 审计）
- **接入管理**：连接器卡片（JIT / 资料同步 / 允许覆盖 三开关，需权限）、OIDC 标准接入配置对话框、飞书 / 企业微信 / LDAP 占位；未配置的连接器在登录页置灰
- **权限驱动 UI**：访客看不到团队管理入口，也拿不到「我的工位」；管理员才能邀请、改角色、改同步策略；存储页签只有超管可见

### 工作区（继承 v0.2）

- **办公室场景**：Three.js 正交楼层，房间由模板和楼层配置组合，门洞坐标可供寻路使用。查看 [房间模板扩展指南](docs/office-rooms.md)。
- **实时概览面板**：Presence 分布、房间负载、今日动态；房间详情联动；成员页签按房间分组
- **无边框窗口**：自绘标题栏 + 最小化/最大化/关闭

## 架构文档

- 身份、权限与存储的**四层架构**详见 [docs/identity-architecture.md](docs/identity-architecture.md)（连接器层 → 同步层 → 存储层 → 本地权限层，含代码地图与生产接入清单）
- **底座定位与路线图**（我们做什么 / 二开区做什么 / Phase A–D）见 [docs/oa-foundation-plan.md](docs/oa-foundation-plan.md)
- **接入规范 + agent-skill**（交给任意 Agent 为你的系统开发适配器）见 [agent-skill/README.md](agent-skill/README.md)

## 设计系统

- 字体：`Geist Variable` 用于英文字母与数字，`Noto Sans SC Variable` 用于中文。两者随应用本地打包。
- 颜色：中性画布 `#f7f7f8`、白色卡面、发丝线 `#e7e7ea`、单一强调色 `#2563eb`；状态色 online/busy/away/offline；角色色 owner 金 / admin 蓝 / guest 紫
- 组件：全部来自 shadcn/ui（Button / Badge / Card / Tabs / Tooltip / Avatar / Progress / Separator / ScrollArea / DropdownMenu / Input / Skeleton / Dialog / Table / Select / Switch / Label），配置见 `components.json`
- 办公室、交流室、任务看板和团队管理共用 `src/index.css` 中的字号与行高。工作区内容铺满侧栏右侧，左右分别留 16px。

| 文字用途 | 类名 | 字号 / 行高 |
| --- | --- | --- |
| 页面标题 | `text-ui-title` | 16 / 22 px |
| 分区标题 | `text-ui-section` | 13 / 18 px |
| 正文、消息与表格正文 | `text-ui-body` | 12 / 18 px |
| 表头、按钮和字段标签 | `text-ui-label` | 11 / 16 px |
| 时间、计数和辅助文字 | `text-ui-meta` | 10 / 14 px |
| 楼层名牌中的小字 | `text-ui-map` | 9 / 11 px |

## 开发

```bash
npm install
npm run dev:app   # Vite + Electron 热重载开发
npm run dev       # 仅浏览器预览（无窗口控制按钮）
```

> 本机若设置了 `ELECTRON_RUN_AS_NODE=1`，dev 脚本已自动清空该变量。

## 打包

```bash
npm run pack      # 仅输出免安装目录 release/win-unpacked
npm run dist      # 输出 NSIS 安装包 release/Rallyloom-<版本>-Setup.exe
```

安装包支持自定义安装目录、创建桌面/开始菜单快捷方式。

## 自检截图（开发用）

设置 `RALLYLOOM_SNAPSHOT` 为 PNG 路径后启动 Electron，会在页面加载完成后截图并写出同名 `.json` 统计（房间数、人数、字体、溢出、渲染错误）：

```powershell
$env:RALLYLOOM_SNAPSHOT="$PWD\.snap\shot.png"
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npx electron .
```

可选 `RALLYLOOM_W` / `RALLYLOOM_H` 指定窗口尺寸，`RALLYLOOM_ACTION_FILE` 指定截图前执行的 JS（用于登录、切页等交互后截图；脚本用 async IIFE 包裹，`document.querySelector('[data-connector="demo-idp-admin"]').click()` 走演示登录，`[data-nav]` 切换页面）。

## 深链协议（企业授权回调）

- 主进程 `app.setAsDefaultProtocolClient('rallyloom')` 注册协议：冷启动走 `process.argv`，热启动走 `second-instance`，两路都交给 `forwardDeepLink()`，校验通过后把窗口抬到前台
- **回调地址等价格式**：Chromium 会把自定义协议的空路径补成 `/`（`rallyloom://callback/?code=…&state=…`），Windows 再原样交给应用；`electron/workspace-auth.cjs` 的 `callbackState()` 同时接受 `rallyloom://callback` 与 `rallyloom://callback/`，`state` 必须与本次登录一致且只出现一次
- **失败可诊断**：每次回调都会写 `%APPDATA%\Rallyloom\rallyloom-deeplink.log`（`RALLYLOOM_DEEPLINK_LOG=0` 可关闭），记录协议注册结果、argv、是否受理及拒绝原因；授权码 3 分钟内有效
- **兜底通道**：浏览器未拉起应用时，登录页「等待企业授权」下方可粘贴 `rallyloom://callback?…` 手动完成（`workspace:callback` IPC）
- 真接入 OIDC：IdP 侧注册回调 `rallyloom://callback`；code 换 token、bootstrap 全部在主进程完成（Node fetch），渲染层不接触令牌

## 更换 Logo

1. 更新 `src/assets/rallyloom-mark.svg`。标题栏、登录页和网页标签页共用此文件。
2. 从该标志导出 `build/icon.png` 和多尺寸 `build/icon.ico`。Windows 图标使用透明底的黑色标志。
3. 执行 `npm run dist` 重新打包。

## 目录结构

```
electron/    Electron 主进程（无边框窗口、IPC、深链转发、截图自检）
src/
  components/auth/     外部授权登录页（连接器列表 + 授权时序动画）
  components/team/     团队管理（成员 / 角色与权限 / 接入管理 / 存储）
  components/office/   Three.js 办公室、共墙隔断、家具与 3D 编排
  components/panels/   右侧实时概览
  components/ui/       shadcn/ui 基础组件
  lib/identity/        连接器 / RBAC / JIT 同步（types, connector, rbac）
  lib/store/           存储层抽象（types, client：demo / oa-rest）
  data/office.ts       房间、成员、动态数据
  data/team.ts         团队种子数据（= 演示 IdP 同步结果）
agent-skill/  接入规范 skill 包（SKILL.md + integration-spec + schemas + 参考适配器）
build/       应用图标资源
docs/        identity-architecture.md / oa-foundation-plan.md
```

