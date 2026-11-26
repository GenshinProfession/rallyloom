# 通用日志汇报契约 v1

Rallyloom 是通用客户端，企业提供方负责存储、模板分配和数据授权。日报、周报、月报只是 DAILY/WEEKLY/MONTHLY 周期的模板，不依赖店铺、运营指标或某个企业数据库。现有 ERP 数据如需引入，由企业适配器转换成下列契约；不得让客户端直接读取私有表或硬编码业务模板。

## 能力和范围

Bootstrap 声明 `collaboration.reporting: {version:1}` 且授予 `reports.use` 才展示入口。`reports.write` 表示账号可以填写本人汇报，实际每个模板还须 `canWrite=true`；`reports.configure` 表示可管理模板。角色名称与能力组合由提供方定义，客户端不判断员工/老板/管理员字符串。

工作范围由 `collaboration.scopes: [{id,label}]` 提供，id 为1至128位字母、数字、下划线或连字符的 opaque ID，可以是事业部、公司或项目标识，不要求数字租户编号。请求携带 `X-Rallyloom-Scope`，提供方必须重新鉴权。Mira 兼容旧 `X-Rallyloom-Tenant`，其他企业无需支持该旧头。

所有路径相对 `/api/v1/workspace/oa`，复用同源 OIDC 工作区令牌。声明版本和返回结构不兼容时显示错误，不回退企业专有接口或演示数据。

## 配置与模板

`GET /reports/templates` 返回：

```json
{"version":1,"timeZone":"Europe/Paris","today":"2026-11-28","canConfigure":false,"templates":[{"id":"engineering-log","name":"研发交付日志","cadence":"WEEKLY","enabled":true,"revision":1,"canWrite":true,"writeWindowOpen":true,"submissionWindow":{"days":["SATURDAY","SUNDAY"],"reportPeriod":"PREVIOUS_WEEK"},"fields":[{"id":"delivery","section":"交付复盘","label":"交付内容","type":"multiline","required":true},{"id":"tickets","section":"交付复盘","label":"关闭工单数","type":"number"},{"id":"work-items","section":"交付明细","label":"本周交付","type":"table","required":true,"minRows":1,"maxRows":20,"columns":[{"id":"item","label":"事项","type":"text","required":true},{"id":"result","label":"结果","type":"text"}]}]}]}
```

提供方按企业时区返回 today；客户端不得固定北京时间或强制只能填昨日。DAILY 是选择日期，默认 WEEKLY 为周一至周日，MONTHLY 为自然月，起止日期由列表响应确认。模板可选 `submissionWindow`；当前通用实现定义 `days:["SATURDAY","SUNDAY"]` 与 `reportPeriod:"PREVIOUS_WEEK"`，代表周六开放、周日结束，写入上一完整周（周一至周日）。使用 `submissionWindow` 时，提供方必须返回 `writeWindowOpen`；客户端同时检查模板 `canWrite` 与窗口状态。没有 `submissionWindow` 的旧 v1 提供方可以省略 `writeWindowOpen`，按原有 `canWrite` 规则工作。窗口关闭后客户端仍显示最近完整周的日志，但进入只读状态。Mira 允许最近400天且不晚于今天的日期；其他企业可按合同规则进一步限制，错误须明确返回。

`PUT /reports/templates/{id}` 提交 `name/cadence/enabled/fields/revision`，可带 `submissionWindow`。新建 revision=0，更新带上次版本，冲突409。字段类型 text/multiline/number/date/select/table；可选 `section` 将字段分组（最多80字符）。表格字段包含1至20个稳定列定义、`minRows`/`maxRows`（最多100行）与可选 `initialRows`；列类型为 text/number，可用 `required` 校验单元格。最多100模板、每模板1至30字段；字段ID唯一，最多80字符，标签最多120字符，选项1至50项且不重复。现有模板周期不可直接变更，应新增模板。禁用模板禁止新写入，历史记录仍可查看；不提供删除历史记录的快捷操作。

字段分区和重复表格是内容结构，不规定视觉皮肤。Rallyloom 以分区卡片、可编辑表格和轻量周期提示呈现，提供方不得要求客户端照搬自己的旧页面样式。表格数字/百分比及说明仍是模板输入值；通用 v1 不执行任意 Excel 公式或公式字符串，避免把企业公式引入客户端执行环境。

字段校验和提交授权始终由提供方执行。客户端模板编辑器只在 `canConfigure` 为 true 时展示；伪造该字段不能绕过服务端授权。

## 列表、草稿与提交

`GET /reports/entries?templateId=...&day=YYYY-MM-DD&after=0&limit=100` 返回：

```json
{"items":[{"id":"42","authorId":"employee-id","authorName":"张三","periodStart":"2026-11-23","periodEnd":"2026-11-29","status":"DRAFT","revision":1,"canEdit":true,"answers":{"delivery":"已交付","tickets":3},"template":{"id":"engineering-log","name":"研发交付日志","cadence":"WEEKLY","enabled":true,"revision":1,"fields":[{"id":"delivery","label":"交付内容","type":"multiline","required":true},{"id":"tickets","label":"关闭工单数","type":"number"}]}}],"nextCursor":null,"periodStart":"2026-11-23","periodEnd":"2026-11-29"}
```

items 包含原模板快照，已提交记录按快照阅读，后续修改模板不能改变历史内容。按不可变 ID 游标分页、每页最多100条，权限过滤在分页之前，不能先取全员数据再由客户端隐藏。authorId 必须与 bootstrap 成员 ID 同一命名空间。

`PUT /reports/entries/{templateId}/{day}`：

```json
{"revision":0,"templateRevision":1,"answers":{"delivery":"已交付","tickets":3},"submit":false}
```

返回 `{id,revision,status}`。首次写入 revision=0；后续使用上次版本。同作者、模板和周期唯一。草稿可缺必填项；提交时验证必填、类型、日期和选项，未知字段拒绝，不能静默丢失草稿。数字使用 JSON number，空值 null/缺省。单字段文本最多10000字符、answers总计最多100000字符。

作者、组织和提交时间由令牌及服务端决定，不能信任请求体 authorId/tenantId。只有作者可以编辑自己的草稿；`SUBMITTED` 不得覆写，管理者不能代填。模板版本或记录版本变化返回409，客户端保留当前输入并提示重新载入。此版本不包含审批流、评论、催交、通知群发、公式执行、商业指标自动分析或代填；这些需另行定义通用契约后再实现。

## Mira 适配边界

Mira 用独立的模板/日志存储承接通用契约，默认提供日报、周报和月报。周报参考企业提供的 Excel 字段结构：店铺与 KPI 概览、周度及平均指标、转化指标、异常店铺/商品、问题处置、本周完成、数据分析、复盘总结和下周计划。Excel 仅作为数据结构来源；Rallyloom 负责现代化填写体验，客户端不复制旧表格视觉，也不执行工作簿中的公式。周报在 Mira 企业时区的周六、周日开放，填写上一完整周，周一开始保留阅读并等待下一次周末开放。月报按相同的分区/表格/复盘规律覆盖目标成果、趋势、问题和下月计划。已纳入 OA 目录且持有 `reports.write` 的租户账号可以写自己的启用模板；租户范围与作者身份由 Mira 服务端校验。平台管理员可配置模板并查看授权企业日志，但不创建没有租户归属的个人汇报。通用汇报与旧 ERP 报工参与开关相互独立；旧 ERP 日报、周月报原记录保留，不搬迁、不改写、不强塞进新模板。

## 验收

至少使用两类不同行业字段，验证非北京时间、非数字组织范围、数字0、草稿缺必填、提交校验、同周期唯一、并发409、模板变更、提交锁定、跨公司/他人越权、分页和撤销。用合成数据与模拟提供方进行写入回归，生产默认只读。

## 企业模板与本地草稿

正式模板由提供方 `/reports/templates` 下发，正式填写和查看继续以 `canWrite/canEdit/canConfigure` 与服务端对象授权为准。客户端可按工作区＋账号＋公司范围隔离保存本地模板草稿和预览；本地模板不是企业授权，不得直接生成正式汇报。只有提供方允许配置时才显示“发布到企业”，成功后重新获取正式模板、版本和参与范围。提交中的编辑器不可被重复保存或关闭打断。
