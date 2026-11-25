/**
 * 点歌台（Jukebox）数据契约。
 *
 * 架构约定：Rallyloom 不存放任何媒体文件，只负责「播放与排队」。
 * 歌单由企业工作区（提供方）在本机 bootstrap 的 `jukebox` 字段下发，
 * 曲目可指向企业自托管 HTTPS 媒体，或使用授权平台的官方嵌入播放器。
 * 演示模式内置一组示例歌单，方便在没有提供方时先体验交互。
 */

export interface JukeboxTrack {
  /** 提供方内稳定的曲目 id（同一歌单内唯一） */
  id: string
  title: string
  /** 演唱者 / 上传人，可省略 */
  artist?: string
  /** 缺省为企业媒体直链；目前明确支持 youtube 官方嵌入播放器。 */
  provider?: 'youtube'
  /** 直链媒体 URL，或 provider=youtube 时的 YouTube 分享地址。 */
  url: string
  /** 封面图（可选） */
  poster?: string
  /** 时长（秒），仅用于列表展示，播放以实际媒体为准 */
  duration?: number
  /** 来源系统标识（用于在界面上标注「外部 · xxx」） */
  sourceId?: string
  /** 自由属性，原样展示（不做业务解释） */
  attrs?: Record<string, string>
}

export interface JukeboxPlaylist {
  id: string
  name: string
  description?: string
  tracks: readonly JukeboxTrack[]
}

export interface JukeboxConfig {
  playlists: readonly JukeboxPlaylist[]
  /** 提供方附带的说明，展示在歌单页脚 */
  note?: string
}

/** 只接受可播放的绝对地址：http(s) 且带主机名。 */
export function mediaUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'])

/** 从官方 YouTube 分享地址解析视频 ID；拒绝任意站点/播放器 URL。 */
export function youtubeVideoId(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' || (url.port && url.port !== '443') || url.username || url.password || !YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return null
    const host = url.hostname.toLowerCase()
    const parts = url.pathname.split('/').filter(Boolean)
    let id = ''
    if (host === 'youtu.be') id = parts[0] ?? ''
    else if (url.pathname === '/watch') id = url.searchParams.get('v') ?? ''
    else if (['embed', 'shorts', 'live'].includes(parts[0] ?? '')) id = parts[1] ?? ''
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null
  } catch {
    return null
  }
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/**
 * 把提供方下发的原始值清洗成 JukeboxConfig：
 * 丢弃没有合法地址的曲目、清理空歌单，并保证 id 唯一（重复时补序号）。
 * 任何结构问题都不抛错——点歌台是弱依赖板块，坏数据只影响它自己。
 */
export function normalizeJukebox(value: unknown): JukeboxConfig | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as { playlists?: unknown; note?: unknown }
  if (!Array.isArray(raw.playlists)) return null
  const used = new Set<string>()
  const playlists: JukeboxPlaylist[] = []
  for (const [playlistIndex, entry] of raw.playlists.entries()) {
    if (!entry || typeof entry !== 'object') continue
    const source = entry as { id?: unknown; name?: unknown; description?: unknown; tracks?: unknown }
    const name = text(source.name)
    if (!name || !Array.isArray(source.tracks)) continue
    let playlistId = text(source.id) ?? `playlist-${playlistIndex + 1}`
    while (used.has(playlistId)) playlistId = `${playlistId}-${playlists.length + 1}`
    used.add(playlistId)
    const trackIds = new Set<string>()
    const tracks: JukeboxTrack[] = []
    for (const [trackIndex, item] of source.tracks.entries()) {
      if (!item || typeof item !== 'object') continue
      const rawTrack = item as Record<string, unknown>
      const url = mediaUrl(rawTrack.url)
      const title = text(rawTrack.title)
      const provider = rawTrack.provider === 'youtube' ? 'youtube' : undefined
      if (rawTrack.provider !== undefined && provider === undefined) continue
      if (!url || !title || (provider === 'youtube' && !youtubeVideoId(url))) continue
      let id = text(rawTrack.id) ?? `${playlistId}-${trackIndex + 1}`
      while (trackIds.has(id)) id = `${id}-${tracks.length + 1}`
      trackIds.add(id)
      const attrs = rawTrack.attrs && typeof rawTrack.attrs === 'object'
        ? Object.fromEntries(Object.entries(rawTrack.attrs as Record<string, unknown>).flatMap(([key, item]) =>
          typeof item === 'string' && item.trim() ? [[key, item.trim()]] : []))
        : undefined
      tracks.push({
        id,
        title,
        url,
        provider,
        artist: text(rawTrack.artist),
        poster: mediaUrl(rawTrack.poster) ?? (provider === 'youtube' ? `https://i.ytimg.com/vi/${youtubeVideoId(url)}/hqdefault.jpg` : undefined),
        duration: Number.isFinite(rawTrack.duration) ? Math.max(0, Number(rawTrack.duration)) : undefined,
        sourceId: text(rawTrack.sourceId),
        attrs: attrs && Object.keys(attrs).length ? attrs : undefined,
      })
    }
    if (!tracks.length) continue
    playlists.push({ id: playlistId, name, description: text(source.description), tracks })
  }
  if (!playlists.length) return null
  return { playlists, note: text(raw.note) }
}

export function formatDuration(seconds: number | undefined): string {
  if (!seconds || !Number.isFinite(seconds)) return '--:--'
  const total = Math.round(seconds)
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}
