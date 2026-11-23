# 正式工作区的角色与权限契约

企业工作区提供方（例如 Mira）拥有角色定义、显示名称、分配规则、数据范围、操作权限和保存策略。Rallyloom 是桌面客户端。它渲染提供方返回的数据和操作，使用已验证的工作区令牌提交请求。演示模式的示例角色只用于演示。

## Bootstrap 响应与只读目录

`GET /api/v1/workspace/bootstrap` 返回当前会话的快照。角色只有企业提供方一个来源，没有另一个“工作区角色”。例如：

```json
{"member_id":"u-42","permissions":["office.view","team.view","tasks.use"],"team":[{"id":"u-42","roleId":"operations-lead","roleName":"营运主管","sourceRoleName":"营运主管","officeAssignable":true}]}
```

- 提供方定义角色名称和权限，客户端展示 `sourceRoleName`（缺少则 `roleName`），只显示一列“角色”。不得将名称映射为本地员工/老板/管理员权限，不按 `roleId` 字符串猜测能力。
- `permissions` 是服务端授予的会话能力，客户端用于显示相应功能；服务端仍在每条请求校验身份与对象范围。目录 `team`、办公室分配和各业务列表必须由提供方先过滤。
- 正式团队成员页是只读目录，只有标题、人数、搜索和实际有数据的列。不提供设置角色、角色映射、成员移除、工作区角色或房间工作看板配置。
- `memberActions`、`roleSettings`、`members.role`、`roles.configure` 为已退休的旧客户端字段。新版本不展示或执行它们，桌面 `manageMember/saveRoleSettings` IPC 返回 FORBIDDEN。提供方应停止返回这些字段，避免误导旧客户端。
- Mira 的 `/members/{id}/role`、`DELETE /members/{id}`、`/role-settings` 和旧 `/policy` 身份配置写入口一律403，包括平台管理员。修改用户、角色和数据范围应在 Mira 管理系统完成，随后客户端刷新身份；不能通过旧政策字段注入角色映射。
- 旧 `role` 字段仅用于历史结构兼容，不是可配置的第二套角色。Mira 运行时忽略旧角色映射和本地角色覆盖，以现有账号角色计算权限。旧显式排除记录保留，不借本次 UI 调整恢复被移除账号。

## 办公室家具

`PATCH /api/v1/workspace/layout` 与 bootstrap 使用同一份布局。房间可选的 `furniture` 数组保存用户摆放的物件。条目示例为 `{"id":"sofa-1","kind":"sofa","x":0.4,"y":0.7,"rotation":90}`。物件的中心相对房间坐标归一化为 0–1，`rotation` 是平面图中的顺时针角度，范围为 0 至小于 360。支持的完整型号见下方“独立家具与空白房间”。工作区内物件 ID 唯一，每个房间最多 60 件。

`useTemplateFurniture: false` 隐藏房间模板生成的家具。房间名称、门墙、工位分配和绑定的业务看板仍按原字段处理。缺少家具字段的旧布局按原模板渲染。提供方在服务器持久化这些字段，并独立校验 `layout.edit`。

房间可用 `seats` 覆盖模板工位。每项为 `{"x":0.3,"y":0.6,"facing":"north"}`，坐标为房间内 0–1，朝向可省略或使用 `north`、`south`。省略数组时使用模板默认值，空数组表示零工位，最多 60 项。办公桌模板按这些工位生成桌和椅，提供方应拒绝超过显式工位容量的分配。

`template: "empty"` 表示没有墙、模板家具和默认工位的空区域，可以摆放自定义家具。可选的 `floorMaterial` 接受 `wood`、`tile`、`concrete`、`quartz`（暖白石英）或 `terrazzo`（浅灰水磨石），可与可选的 `floor` 颜色一起保存，省略材质时使用模板默认值。

可选的 `door` 设定出入口。例如 `{"side":"east","offset":0.35,"width":42}` 表示右墙从上到下 35% 处、宽 42 的门洞。`side` 支持 `north`、`east`、`south`、`west`；`offset` 为沿墙长度的 0–1 坐标；门洞两端各至少保留 6 个场景单位。省略时使用模板默认门洞。

可选的 `walls` 为方向到隔墙类型的映射，例如 `{"south":"glass","east":"open"}`。类型支持 `solid`、`glass`、`open`，省略方向默认为实体墙。房间边界允许直接相接，共墙只渲染一次；相邻任一房间的门洞会贯通该墙，任一侧设为开放时该段连通。配置只描述真实需要的通道，无需为每个房间额外留走廊。

所有家具均可携带 `size: {"width":126,"depth":80,"height":24}` 指定实际宽、深、高，范围1–800。省略时使用默认尺寸。房间调整与家具移动会保留该尺寸。

## 接入验收

- 返回一个企业自定义的角色 ID 和本地语言名称，确认客户端原样显示。
- 用两个不同可见范围的账号读取 bootstrap，核对目录和房间分配只含获准对象。
- 用不同账号验证成员操作和配置入口，再在提供方集成测试中确认越权请求返回 403。
- 用 `node reference/verify-provider.mjs --bootstrap <响应样本.json>` 校验响应结构。线上样本应去除个人资料和凭据。

## OA 协作模块

Bootstrap 可返回 `collaboration:{version:1,scopes:[{id,label}]}` 和提供方支持的协作能力。具体接口、数据范围、更新版本与验收见 [OA 协作契约](oa-collaboration.md)。工作区权限与每条对象的权限必须分别校验。

## 当前区域名称（0.13.3）

`tenant.name` 是当前已登录账号所在区域的实际展示名，由提供方按认证身份返回，例如平台总部、分公司、事业部。Rallyloom 左上角从最新 bootstrap 的 tenant.name 展示，不能固定使用发现阶段 binding.display_name。binding 名称继续用于绑定和选择服务；workspace_id 与 tenant.id 仍保持稳定，不通过改展示名切换身份或授权范围。Mira 平台返回“平台总部”，租户返回实际租户名称。`collaboration.scopes` 为独立的数据筛选范围，不改变账号所在区域名称。

地板材质枚举需在提供方保存/回读时原样保留。客户端按世界坐标实时渲染固定尺寸的纹理，并使用导数抗锯齿，房间尺寸与视角缩放不改变纹理密度。

可选能力 `collaboration.seating: {version:1}` 声明共享座位状态接口；日常入座/离座不使用 layout PATCH、不会授予 layout.edit，具体字段与冲突处理见 OA 协作契约。

### 独立家具与空白房间

`room-shell` 是只有墙和出入口的空白房间，与无墙的 `empty` 区分。模板是初始布局预设：客户端可将旧模板转换为 `useTemplateFurniture:false` 和逐件家具，保留家具的独立ID、尺寸及位置。`furniture[].kind` 包含 `desk,shelf,plant,sofa,coffee,lamp,workstation,chair,meeting-table,round-table,coffee-table,counter,cabinet,display-shelf,clothes-rack,rug,partition,screen,studio-light,camera,carton,printer,trolley,microwave,sink,cup,notebook,monitor`。可选 `size:{width,depth,height?}` 范围1–800；`color` 为六位十六进制；`elevation` 为0–200。提供方须原样保存与回读。`seats[].rotation` 可选0至小于360，表示可旋转座椅的朝向，与家具同步。移动/删除工位会更新 seats，仍须通过已分配人数校验。调整房间边界不缩放家具，不因模版名限制家具类型。
