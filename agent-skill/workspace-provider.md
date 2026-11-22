# 正式工作区的角色与权限契约

企业工作区提供方（例如 Mira）拥有角色定义、显示名称、分配规则、数据范围、操作权限和保存策略。Rallyloom 是桌面客户端。它渲染提供方返回的数据和操作，使用已验证的工作区令牌提交请求。演示模式的示例角色只用于演示。

## Bootstrap 响应

`GET /api/v1/workspace/bootstrap` 返回当前会话的快照。以下是权限相关字段的节选，布局及其他必填字段见 [接入规范](integration-spec.md) §12.3。

```json
{
  "member_id": "u-42",
  "permissions": ["office.view", "team.view", "members.role", "roles.configure"],
  "team": [
    {
      "id": "u-42",
      "roleId": "operations-lead",
      "roleName": "营运负责人",
      "sourceRoleName": "营运主管",
      "officeAssignable": true
    },
    {
      "id": "u-88",
      "roleId": "customer-advisor",
      "roleName": "客户顾问",
      "memberActions": {
        "roleOptions": [{"id":"customer-advisor","label":"客户顾问"}],
        "selectedRoleId": "customer-advisor",
        "canResetRole": true,
        "canRemove": false
      }
    }
  ],
  "roleSettings": {
    "title": "企业角色设置",
    "description": "调整本工作区的角色分配。",
    "fields": [
      {
        "id": "consultant-profile",
        "label": "顾问组",
        "value": "customer-advisor",
        "options": [{"id":"customer-advisor","label":"客户顾问"}]
      }
    ],
    "canReset": true
  }
}
```

- **成员角色**。同时返回 `roleId` 和 `roleName`。ID 由提供方定义，长度不超过 128，客户端用 `roleName` 展示，不从名称或 ID 推导能力。可选的 `sourceRoleName` 展示来源账号角色。旧接口只有 `role` 时，客户端把该字符串作为显示回退。新接口可以省略 `role`。
- **会话能力**。`office.view` 允许打开办公室，`team.view` 允许打开目录，`layout.edit` 允许编辑办公室，`members.role` 允许展示提供方批准的成员操作，`roles.configure` 允许展示角色配置。提供方可返回其他能力标识，当前客户端只启用已实现的能力。
- **可见范围**。`team` 必须包含本人，其他成员和 `layout.assignments` 由服务端按工作区、组织、用户和资源权限过滤。仅允许查看本人时，返回本人且不授予 `team.view`。成员可被分配到办公室时返回 `officeAssignable: true`。
- **逐成员操作**。仅当当前用户对该行有操作权限时返回 `memberActions`。角色选项是发送给接口的 ID 和用于展示的标签，`selectedRoleId` 可省略。布尔开关省略等同关闭。成员行的能力还受顶层 `members.role` 约束。
- **角色配置**。仅向获授权用户返回 `roleSettings` 和 `roles.configure`。表单字段由提供方定义，字段 ID 和选项 ID 在各自列表内唯一，`value` 必须对应选项之一。只读字段设 `readOnly: true`。不提供配置表单也可以在提供方自己的管理后台维护权限。设置内容及默认值均由提供方决定。

## 写入契约

| 操作 | 请求 |
| --- | --- |
| 设置目标成员角色 | `PATCH /api/v1/workspace/members/{memberId}/role`，`{"role":"提供方返回的选项 ID"}` |
| 恢复来源角色 | 同上，`{"role":null}`，要求提供方允许 `canResetRole` |
| 移除成员 | `DELETE /api/v1/workspace/members/{memberId}`，要求提供方允许 `canRemove` |
| 保存角色配置 | `PATCH /api/v1/workspace/role-settings`，`{"values":{"字段 ID":"选项 ID"}}`，只提交可写字段 |
| 恢复默认配置 | 同上，`{"values":{}}`，仅在提供方声明 `canReset` 时提供 |

成功返回更新后的完整 bootstrap 快照。失败返回 `401`、`403`、`400` 或 `409` 等适用状态，以及 `{"error":"可显示的错误"}`。对于每个请求，提供方重新从访问凭据解析操作者，校验当前操作权限、目标归属、选项有效性、管理范围和变更约束。客户端的按钮、角色 ID、快照和表单值都不能作为授权依据。写入时在提供方记录操作者、对象、变更和时间。

## 办公室家具

`PATCH /api/v1/workspace/layout` 与 bootstrap 使用同一份布局。房间可选的 `furniture` 数组保存用户摆放的物件。条目示例为 `{"id":"sofa-1","kind":"sofa","x":0.4,"y":0.7,"rotation":90}`。物件的中心相对房间坐标归一化为 0–1，`rotation` 是平面图中的顺时针角度，范围为 0 至小于 360。客户端当前支持 `desk`、`shelf`、`plant`、`sofa`、`coffee`、`lamp`。工作区内物件 ID 唯一，每个房间最多 60 件。

`useTemplateFurniture: false` 隐藏房间模板生成的家具。房间名称、门墙、工位分配和绑定的业务看板仍按原字段处理。缺少家具字段的旧布局按原模板渲染。提供方在服务器持久化这些字段，并独立校验 `layout.edit`。

房间可用 `seats` 覆盖模板工位。每项为 `{"x":0.3,"y":0.6,"facing":"north"}`，坐标为房间内 0–1，朝向可省略或使用 `north`、`south`。省略数组时使用模板默认值，空数组表示零工位，最多 60 项。办公桌模板按这些工位生成桌和椅，提供方应拒绝超过显式工位容量的分配。

`template: "empty"` 表示没有墙、模板家具和默认工位的空区域，可以摆放自定义家具。可选的 `floorMaterial` 接受 `wood`、`tile` 或 `concrete`，可与可选的 `floor` 颜色一起保存，省略材质时使用模板默认值。

可选的 `door` 设定出入口。例如 `{"side":"east","offset":0.35,"width":42}` 表示右墙从上到下 35% 处、宽 42 的门洞。`side` 支持 `north`、`east`、`south`、`west`；`offset` 为沿墙长度的 0–1 坐标；门洞两端各至少保留 6 个场景单位。省略时使用模板默认门洞。

可选的 `walls` 为方向到隔墙类型的映射，例如 `{"south":"glass","east":"open"}`。类型支持 `solid`、`glass`、`open`，省略方向默认为实体墙。房间边界允许直接相接，共墙只渲染一次；相邻任一房间的门洞会贯通该墙，任一侧设为开放时该段连通。配置只描述真实需要的通道，无需为每个房间额外留走廊。

`desk` 家具可携带 `size: {"width":126,"depth":80}` 指定桌面实际长宽，范围为 20–240。省略时使用默认尺寸。房间调整与家具移动会保留该尺寸。

## 接入验收

- 返回一个企业自定义的角色 ID 和本地语言名称，确认客户端原样显示。
- 用两个不同可见范围的账号读取 bootstrap，核对目录和房间分配只含获准对象。
- 用不同账号验证成员操作和配置入口，再在提供方集成测试中确认越权请求返回 403。
- 用 `node reference/verify-provider.mjs --bootstrap <响应样本.json>` 校验响应结构。线上样本应去除个人资料和凭据。
