/**
 * 点歌台（Jukebox）数据契约。
 *
 * bootstrap 可选下发企业精选曲目；成员曲目由 JukeboxClient 接入工作区共享曲库 API。
 */

export interface JukeboxTrack {
  /** 提供方内稳定的曲目 id（同一歌单内唯一） */
  id: string
  title: string
  /** 演唱者 / 上传人，可省略 */
  artist?: string
  /** 缺省为企业媒体直链；目前明确支持 youtube 官方嵌入播放器。 */
  provider?: 'youtube' | 'mira-file'
  /** 直链媒体 URL，或 provider=youtube 时的 YouTube 分享地址。 */
  url?: string
  /** Mira 共享曲库中受授权保护的上传文件 ID。 */
  mediaId?: string
  /** 提交人显示名；仅服务端返回。 */
  uploaderName?: string
  /** 上传时间；仅服务端返回。 */
  createdAt?: string
  /** track 的来源类型：curated 或 member。 */
  origin?: 'curated' | 'member'
  canDelete?: boolean
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
}

export interface JukeboxFeed {
  day: string
  dailyTrackId: string | null
  dailyTrack?: JukeboxTrack
  tracks: JukeboxTrack[]
}

export interface JukeboxClient {
  list(): Promise<JukeboxFeed>
  submit(file: File, title: string): Promise<JukeboxTrack>
  media(id: string): Promise<Blob>
  remove(id: string): Promise<void>
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
  const raw = value as { playlists?: unknown }
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
  return { playlists }
}

export function formatDuration(seconds: number | undefined): string {
  if (!seconds || !Number.isFinite(seconds)) return '--:--'
  const total = Math.round(seconds)
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}
