# Mira × Rallyloom：办公室家具型号白名单接入任务单

> 交接对象：Mira 后端 / 平台侧负责人（或对应 Agent）
> 来源：Rallyloom v0.14.4（桌面端编排器）
> 基准代码：Mira `github/main` 分支，提交 `9e63c54a4`
> 结论：只需要在服务端放行 8 个家具型号字符串，其它校验逻辑与接口语义全部不变。
> 可直接应用的补丁：`docs/mira-furniture-kinds.patch`（已对 `github/main@9e63c54a4` 跑过 `git apply --check`）。

---

## 1. 背景（为什么需要这次接入）

Rallyloom 的 3D 办公室编排器在 v0.14.x 新增了一批更实用、更好看的家具素材（长工位桌、L 型桌、书柜、白板、电视、饮水机、大盆栽、长会议桌）。

Rallyloom 桌面端已经在 `electron/workspace-auth.cjs` 的白名单里放行这些型号（v0.14.1 起），也可以正常渲染。但把新布局 PATCH 到 Mira 时会失败：

```
PATCH /api/v1/workspace/layout
400 { "error": "INVALID_REQUEST", "message": "家具位置、旋转或型号无效，工作区最多放置 320 件自定义家具" }
```

原因是 Mira 服务端有一份独立的家具型号白名单，目前只含旧的 28 种。放行这 8 个型号后即可互通，**不需要改动 Rallyloom 版本**。

---

## 2. 需要新增的 8 个型号

单位与布局坐标一致（`unitsPerMeter` 默认 50，即 50 布局单位 = 1 米）：

| kind | 中文名 | 默认尺寸 W×D×H | 用途 |
| --- | --- | --- | --- |
| `bench` | 长工位桌 | 200 × 56 × 40 | 一条长桌坐 3–4 人（客户端按宽度自动分配显示器/椅子） |
| `desk-l` | L 型办公桌 | 96 × 76 × 25 | 主管/技术岗位的转角桌 |
| `bookcase` | 书柜 | 96 × 26 × 88 | 靠墙收纳 |
| `whiteboard` | 白板 | 120 × 6 × 72 | 墙面书写板 |
| `tv` | 电视 | 96 × 6 × 56 | 壁挂显示器/电视 |
| `water-cooler` | 饮水机 | 24 × 24 × 56 | 茶水间/玄关 |
| `plant-large` | 大盆栽 | 44 × 44 × 74 | 落地大绿植 |
| `conference-table` | 长会议桌 | 240 × 74 × 26 | 会议室长桌（客户端按桌长自动排 6 把椅子） |

尺寸是客户端默认值；Rallyloom 在 furniture 项里可以带 `size: { width, depth, height }` 覆盖（现有规则 1–800 不变）。

---

## 3. 具体改动（2 处代码 + 1 处文档核对）

### 3.1 服务端白名单

文件：`backend/src/main/java/com/mira/integrations/rallyloom/RallyloomWorkspaceService.java`（第 52 行）

```java
// 现在
private static final Set<String> FURNITURE_KINDS = Set.of("desk", "shelf", "plant", "sofa", "coffee", "lamp", "workstation", "chair", "meeting-table", "round-table", "coffee-table", "counter", "cabinet", "display-shelf", "clothes-rack", "rug", "partition", "screen", "studio-light", "camera", "carton", "printer", "trolley", "microwave", "sink", "cup", "notebook", "monitor");

// 改为（末尾追加 8 个）
private static final Set<String> FURNITURE_KINDS = Set.of("desk", "shelf", "plant", "sofa", "coffee", "lamp", "workstation", "chair", "meeting-table", "round-table", "coffee-table", "counter", "cabinet", "display-shelf", "clothes-rack", "rug", "partition", "screen", "studio-light", "camera", "carton", "printer", "trolley", "microwave", "sink", "cup", "notebook", "monitor",
        "bench", "desk-l", "bookcase", "whiteboard", "tv", "water-cooler", "plant-large", "conference-table");
```

### 3.2 测试同步

文件：`backend/src/test/java/com/mira/integrations/rallyloom/RallyloomWorkspaceJsonTest.java`（第 253 行）

现有的一行循环里枚举了一批合法 kind，把 8 个新型号补进 `List.of(...)` 即可（其它断言不动）：

```java
for (String kind : List.of("workstation", "chair", "meeting-table", "round-table", "counter",
        "cabinet", "display-shelf", "clothes-rack", "rug", "partition", "camera", "studio-light",
        "carton", "printer", "trolley", "microwave", "sink", "cup", "notebook", "monitor",
        "bench", "desk-l", "bookcase", "whiteboard", "tv", "water-cooler", "plant-large", "conference-table")) {
    item.put("kind", kind);
    RallyloomWorkspaceService.validateLayout(layout);
}
```

### 3.3 文档 / 前端核对（可选）

- `docs/engineering/integrations/rallyloom-workspace-provider.md`：`github/main` 当前未发现逐型号清单，若你方文档补了型号表，请同步这 8 个。
- 若 Mira 前端有任何「办公室家具 → 图标/缩略图」映射，需要为这 8 个 kind 补默认兜底（Rallyloom 之外的地方不影响本次接收入口）。

---

## 4. 明确不需要改的部分

以下规则保持现状即可，Rallyloom 生成的数据全部符合：

- 布局结构：`width/height` 整数且 ≥500/≥300、`rooms ≤ 80`、`assignments` 必须是对象、`revision` 整数
- 区域：`frame` 必须严格等于 `boundary.outer` 包围盒；多边形不重叠；模板名沿用现有 9 种（Rallyloom 发布时会用 `desk-grid / meeting / command / pantry / reception / studio`）
- 家具：`x/y` 归一化 0..1、`rotation` 0..360、`size` 1..800、每间 ≤60 件、中心点与旋转足迹必须在房间多边形内、颜色/抬高限制
- 工位：`seats ≤ 60`、`x/y` 归一化、`rotation`、`facing` 仅 `north|south`
- 工位分配：成员必须在工作区 team 内
- 权限：`layout.edit`（owner）；`revision` 乐观锁与 `CONFLICT` 语义

---

## 5. 验收标准（建议直接写成测试）

1. 对 8 个新 kind 各构造一个最小合法 layout（room 带 boundary、frame = 包围盒、家具足迹在区域内）→ `validateLayout` 通过，PATCH 返回成功。
2. 未在白名单的 kind（如 `sofa-xx`）→ 仍 400，错误可定位到家具。
3. 新 kind 的 `size` 覆盖（如 `bench` 改为 260×56）→ 通过；`size.width = 0` → 400（现有规则）。
4. 同一间房 61 件家具 → 400（现有规则）。
5. `GET /api/v1/workspace/bootstrap` 原样返回新 kind（含 `size/rotation`），不丢字段、不做静默裁剪。

---

## 6. 上线顺序

1. Mira 合并并部署白名单（向后兼容，旧布局与旧客户端不受影响）；
2. 告知 Rallyloom 侧部署的提交号/版本；
3. Rallyloom 重新生成含新家具的布局并 PATCH（我方执行，约 10 分钟），随后截图确认；
4. 若需要回滚：只回退白名单即可，旧布局数据仍可正常读取（含新 kind 的布局会被判无效，回滚前先让 Rallyloom 发布旧型号布局）。

---

## 7. 附：一个最小测试载荷（可直接复制）

```jsonc
{
  "width": 1250,
  "height": 771,
  "unitsPerMeter": 50,
  "revision": 1,
  "wallSegments": [],
  "rooms": [{
    "id": "bench-test",
    "name": "白名单测试间",
    "template": "desk-grid",
    "frame": { "x": 0, "y": 0, "width": 300, "height": 200 },
    "boundary": { "outer": [
      { "x": 0, "y": 0 }, { "x": 300, "y": 0 }, { "x": 300, "y": 200 }, { "x": 0, "y": 200 }
    ] },
    "floor": "#f2efe9",
    "floorMaterial": "quartz",
    "useTemplateFurniture": false,
    "seats": [],
    "furniture": [
      { "id": "f1", "kind": "bench", "x": 0.5, "y": 0.5, "rotation": 0 },
      { "id": "f2", "kind": "conference-table", "x": 0.5, "y": 0.8, "rotation": 0, "size": { "width": 240, "depth": 74 } }
    ]
  }],
  "assignments": {},
  "seatAssignments": {}
}
```

---

**联系人**：Rallyloom 侧（本对话）。相关契约文档：`agent-skill/integration-spec.md`（数据外部化边界 §9、接入排查 §12）、`docs/identity-architecture.md`（工作区绑定与四层架构）。
