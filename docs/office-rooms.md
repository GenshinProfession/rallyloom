# 办公室房间模板

办公室由楼层配置和 Three.js 房间模板组成。同一模板可以放在不同位置，分别设置尺寸、工位、地板颜色和门洞。

## 添加模板

在 `src/components/office/rooms/` 或其子目录创建 `training.room.ts`，默认导出一个模板。Vite 会自动注册该文件，模板 ID 在项目内唯一。

```ts
import { defineRoomTemplate } from './api'
import { plant, table } from './furniture'

export default defineRoomTemplate({
  id: 'training',
  floor: '#e5ebef',
  accent: '#6686a4',
  door: { side: 'south', offset: 0.5, width: 44 },
  seats: [{ x: 0.36, y: 0.70 }, { x: 0.64, y: 0.70 }],
  build({ group, model, width, depth }) {
    table(group, model, width / 2, depth * 0.51, width * 0.60, 42)
    plant(group, model, width - 22, 24)
  },
})
```

模板的 `build` 用局部坐标摆放家具，默认座椅、人物、房间名和墙体由场景生成。可用 `model.box`、`model.round`、`model.orb` 共用几何和材质，也可以向 `group` 添加 Three.js 对象。办公室场景负责释放房间组内的几何和材质。

## 放到楼层

演示楼层定义在 `src/data/office-layout.ts`。线上工作区由 `WorkspaceClient` 的 `layout` 提供，保存走现有的 `PATCH /layout`。请求体包含画布的 `width`、`height`、`rooms` 和成员的 `assignments`。每个房间的 `id`、`name`、`template` 和 `frame` 必填。

```ts
{
  id: 'training-east',
  name: '培训间',
  template: 'training',
  frame: { x: 0, y: 0, width: 330, height: 220 },
  door: { side: 'east', offset: 0.7, width: 44 },
}
```

示例的 `frame` 放在楼层左上角。房间可以直接贴边，共用一道隔墙；拖拽靠近相邻边界时会吸附。通行可通过相邻房间的门洞或开放边界实现。配置中的 `door`、`seats`、`floor` 和 `accent` 可以覆盖模板的默认值。

## 门洞坐标

楼层平面使用 `x / y`，对应 Three.js 的 `X / Z`。门的 `offset` 沿墙从左或从上开始计量，`width` 使用楼层单位。房间解析结果包含 `doorway.center`、`doorway.inside` 和 `doorway.outside`。场景通过 `sharedWallRuns` 合并共墙，相邻任一房间的门洞贯穿同一堵墙。每个方向可用 `walls` 配置 `solid`、`glass`、`open`。共墙由东侧或南侧边界所属房间绘制，开放优先于玻璃和实体墙。空区域自身不围墙。

编辑器的「参考户型」以用户提供的草图为依据，包含上方三间独立空间、左侧辅助区与入口、右下开放工位区。替换只影响草稿，已有房间需要二次确认后替换，发布使用现有版本校验。

圆角家具使用实际尺寸几何，倒角最大 0.8 个场景单位，避免对单位圆角立方体进行不同比例缩放。桌子的可选 `size: {width, depth}` 范围为 20–240，移动和房间缩放时保留桌面尺寸；地砖按楼层坐标连续分缝。

办公室顶部的「试走」模式可以点击房间或地面移动。点击房间时采用门内入口点作为目标，寻路根据实际墙体、家具和座椅的空间范围避障。

## 小队和经营屏

房间可以通过 `workbench.linkedRoomIds` 引入其他房间的成员和相关任务，通过 `workbench.documentSpaces` 选定关联知识库。例如活动指挥台可以把运营、仓储和客服编入同一个视图，成员工位继续由 `assignments` 决定。

指挥台模板通过 `display: 'gmv'` 启用三维经营屏。在 `dataSlots[roomId]` 配置相应数据插槽。接口返回 `rows`，其中 `key: "today_gmv"` 标识今日 GMV。`value` 包含展示用币种和金额，`delta` 为可选变化幅度。桌面端用同一份数据绘制大屏和右侧看板。可选 `refreshSec` 默认 60 秒，有效范围为 15 至 600 秒。

办公家具和木地板的授权与出处见 [素材来源](../src/assets/office/SOURCES.md)。
