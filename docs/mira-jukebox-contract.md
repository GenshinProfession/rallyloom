# Mira 接入点歌台（Jukebox）契约说明

> 适用对象：Mira 后端 / 工作区 provider 维护者
> 对接版本：Rallyloom v0.15.0（接入规范 v1.10 · §13 点歌台）
> 结论先行：**不需要新端点、不需要新事件、不做媒体存储**——只在 `GET /api/v1/workspace/bootstrap` 的响应里增加一个**可选**字段 `jukebox` 即可。

---

## 1. 为什么要加这个字段

Rallyloom 桌面端新增了「点歌台」页面（左栏歌单、右侧播放舞台、播放队列）。按产品约定，**Rallyloom 不存放任何音视频文件**：企业可使用自托管 HTTPS 媒体，也可选择 YouTube 官方嵌入播放器；Rallyloom 只做播放器与排队。

因此媒体列表由提供方通过 bootstrap 下发，字段名固定为 `jukebox`。

## 2. 需要改的唯一位置

`backend/src/main/java/com/mira/integrations/rallyloom/RallyloomWorkspaceService.java` 的 `bootstrap(Principal)` 返回体（当前组装 installation/workspace/tenant/member_id/permissions/team/policy/layout/dataSlots 的地方）增加一个可选键 `jukebox`。

推荐实现（与 `policy_json` / `layout_json` 同风格）：新增一张配置表或复用工作区配置 JSON 列，由平台管理员通过 Mira 后台配置歌单；未配置时返回 `null` 或直接省略该键（二者客户端都能处理）。

Go/Java 侧只需保证：`jukebox` 是对象或 `null`；对象里 `playlists` 是数组。

## 3. 响应示例

```jsonc
{
  // ……现有字段保持不变……
  "jukebox": {
    "note": "Mira 年会社内点歌台：曲目均为企业自有版权素材",
    "playlists": [
      {
        "id": "party",
        "name": "年会金曲",
        "description": "年会 / 团建时段",
        "tracks": [
          {
            "id": "mira-t-001",
            "title": "开场短片",
            "artist": "品牌部",
            "url": "https://media.mirapilot.com/jukebox/opening.mp4",
            "poster": "https://media.mirapilot.com/jukebox/opening.jpg",
            "duration": 52,
            "attrs": { "场景": "暖场", "类型": "短片" }
          }
        ]
      }
    ]
  }
}
```

机器可读契约：`agent-skill/schemas/jukebox.schema.json`（Rallyloom 仓库内）。

## 4. 字段与限制

| 字段 | 必填 | 限制 |
| --- | --- | --- |
| `playlists` | 是 | 1–40 个歌单 |
| `playlists[].id` | 是 | `[A-Za-z0-9_-]{1,64}`，稳定不变 |
| `playlists[].name` | 是 | ≤40 字 |
| `playlists[].description` | 否 | ≤160 字 |
| `playlists[].tracks` | 是 | 1–300 首 |
| `tracks[].title` | 是 | ≤120 字 |
| `tracks[].provider` | 否 | 缺省表示自托管媒体；目前可选 `youtube` |
| `tracks[].url` | 是 | 缺省 provider 时为企业 HTTPS 媒体直链；`provider=youtube` 时为 YouTube 官方分享链接 |
| `tracks[].poster` | 否 | HTTPS 封面图 |
| `tracks[].artist` | 否 | ≤80 字 |
| `tracks[].duration` | 否 | 秒，0–86400 |
| `tracks[].attrs` | 否 | 字符串键值对象（≤16 键），作为曲目标签展示 |

## 5. 媒体托管要求（Mira 侧）

1. **HTTPS**：媒体直链和 YouTube 分享链接都必须使用 HTTPS。
2. **Range 请求**：建议开启（`Accept-Ranges: bytes`），否则拖动进度条会退化为重新下载。
3. **编码**：MP4 / H.264 + AAC 最稳；不要用 H.265（Electron 内置 Chromium 不保证支持）。
4. **签名 URL 可以**，但要注意歌单只在登录/刷新工作区时下发，URL 有效期应覆盖一个工作时段。
5. 媒体文件**不经过** Mira API 或 Rallyloom，直接由对象存储/CDN 提供。

## 6. 自检（Mira 侧可在本地跑）

```bash
# 1) 抓一份 bootstrap 响应（带 token）
curl -s -H "Authorization: Bearer <token>" https://mirapilot.com/api/v1/workspace/bootstrap > bootstrap.json

# 2) 用 Rallyloom 仓库里的体检脚本离线校验（会连带检查 jukebox）
node agent-skill/reference/verify-provider.mjs --bootstrap bootstrap.json
```

期望输出包含 `bootstrap 符合契约`，且 detail 里出现 `jukebox N 歌单`。

## 7. 上线后验收

- [ ] 用已纳入租户的 Mira 账号在 Rallyloom 桌面端登录「Mira 公司工作区」；
- [ ] 左侧导航出现「点歌台」，页面顶部显示「N 个歌单 · M 首」；
- [ ] 点某首歌的「点歌」→ 右栏播放舞台开始播放（直链可访问，或 YouTube 视频允许嵌入且网络可达）；
- [ ] 播放 / 暂停 / 上一首 / 下一首 / 音量 / 全屏可用；
- [ ] 未配置 `jukebox` 的租户看到契约空态页，且不影响办公室、文档等其他板块。

## 8. 不需要做的事

- ❌ 不需要新的 `/jukebox` 端点（歌单随 bootstrap 下发）；
- ❌ 不需要事件推送（无 `jukebox.push` 一类的契约；歌单刷新靠重新登录/刷新工作区）；
- ❌ 不需要把媒体文件上传给 Rallyloom，也不需要在 Mira 做转码；
- ❌ 不需要改 `schema_version`（本字段是 bootstrap 的可选扩展，事件 Schema 零改动）。
