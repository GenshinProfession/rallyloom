# Mira 接入 Rallyloom 共享点歌台契约

适用对象：Mira 后端与 Rallyloom 工作区 provider 维护者
版本：Rallyloom 共享点歌台契约 v2.0

## 产品行为

点歌台是 OA 的内置共享曲库，不要求成员找媒体直链或阅读操作说明。拥有 jukebox.use 权限的成员可以浏览、播放、拖入 MP4 分享歌曲；同一工作区的人都能听到彼此分享的歌。服务端每天按北京时间从该工作区曲库随机选出一首，并让当日所有成员看到同一首歌。Mira 将所有纳入 OA 的活跃分公司合并成一个 Rallyloom 工作区，因此这些租户共享同一曲库。

Mira 侧已经有可选的精选歌曲配置，它们会作为只读精选曲目加入共享池。成员自己上传的歌曲通过下方 OA API 写入 Mira，并归属到合并工作区；记录保留来源租户用于审计，离开 OA 范围或停用的租户成员歌曲不再展示。普通业务数据仍按原有租户边界隔离。

## 接口

路径均在 /api/v1/workspace/oa 下，身份通过现有 Rallyloom Bearer token 验证。Mira 对所有接口都必须校验 jukebox.use。歌曲池与每日随机结果按合并的 mira-company 工作区共享；上传来源租户由认证 Principal 决定，平台管理员只能在允许的 OA 租户上下文中上传。不信任请求体中任何上传者或租户字段。

| 方法与完整路径 | 行为 |
| --- | --- |
| GET /api/v1/workspace/oa/jukebox | 返回合并工作区共享曲目、北京时间日期及统一每日随机歌曲 |
| POST /api/v1/workspace/oa/jukebox/tracks | 接收 multipart/form-data；file 为 MP4 文件，title 可选 |
| GET /api/v1/workspace/oa/jukebox/media/{mediaId} | 鉴权后返回 video/mp4 文件内容 |
| DELETE /api/v1/workspace/oa/jukebox/tracks/{mediaId} | 上传者可删除自己的文件；平台管理员可删除当前工作区曲目 |

### 文件约束

- 文件扩展名必须为 mp4，文件内容必须包含合法 MP4 容器的 ftyp 标记。
- 单文件上限 20 MiB；空文件、其他媒体类型和超限文件返回 400。
- 标题可留空，服务端从文件名生成；标题最长 120 个字符。
- 上传者 ID、名称、来源租户和上传时间由服务端从登录身份取得。
- 合并工作区内的普通成员都可查看共享曲目；未纳入或已停用的租户成员曲目不进入曲库。
- 媒体文件不得通过 bootstrap 传输；bootstrap 只携带精选曲目元数据与播放来源。

### GET feed 响应字段

feed 至少包含 day、dailyTrackId、tracks；当日曲目还可以通过 dailyTrack 重复返回，方便客户端直接展示。

- day：北京时间的 YYYY-MM-DD。
- dailyTrackId：当日曲目 ID；曲库为空时为 null。
- tracks：工作区共享曲目元数据。上传曲目含 mediaId、provider=mira-file、origin=member、uploaderName、createdAt、byteSize 和 canDelete。
- 精选曲目含 HTTPS url，可选 provider=youtube、artist、poster、duration；origin=curated。
- canDelete 只用于界面显示；删除时服务端仍必须独立校验上传者或平台管理员身份。

当天的 dailyTrackId 对同一工作区保持稳定。服务端只在首次选取、曲库为空或选中的歌曲已被删除时重新抽取。提供方若把企业租户映射为多个独立工作区，则不同工作区之间曲目和每日结果互相隔离。

## Mira 当前实现对应文件

- RallyloomOaController.java：定义 feed、上传、播放文件和删除路由。
- RallyloomOaService.java：验证能力、MP4、身份、合并工作区范围，合并精选与成员曲目并生成每日抽歌结果。
- V370__rallyloom_shared_jukebox.sql：存放工作区上传曲目与每日抽歌记录。
- PlatformJukeboxPage.tsx：只配置可选的精选歌曲；成员不需要在后台说明规则或输入自己的媒体直链。

## 联调验收

1. 员工、老板、租户管理员等允许参与的账号都带有 jukebox.use；不具备能力的身份访问四个接口均被拒绝。
2. 员工拖拽或选择 MP4 上传成功，feed 中显示提交者和歌曲；另一个已纳入租户的账号刷新后能看到并播放。
3. 两个已纳入的租户互相看到曲目；未纳入或停用租户的曲目不进入池，媒体下载也受同一边界保护。
4. 合并工作区内的账号获取相同 day 与 dailyTrackId；次日重新抽取；删除当日被选曲目后服务端安全重抽。
5. 上传者可以删除本人曲目，其他普通成员不能删除；平台管理员可在合并工作区管理歌曲。

机器可读定义在 Rallyloom 仓库 agent-skill/schemas/jukebox-feed.schema.json。bootstrap 可选精选曲目沿用 agent-skill/schemas/jukebox.schema.json。平台与成员歌曲都需要有合法播放权。
