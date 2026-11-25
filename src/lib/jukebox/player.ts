import { youtubeVideoId, type JukeboxConfig, type JukeboxFeed, type JukeboxTrack } from './types'

/**
 * 全局单例音乐播放器（办公室底栏 / 点歌台共享）。
 *
 * - 只有一个真正的媒体元素（懒创建、挂在 document.body 之外），切页面不中断播放；
 * - 只负责「播放/暂停/上下曲/进度/音量」这类与界面无关的能力，界面各自订阅；
 * - 点歌台页有自己的舞台（视频 / YouTube / 上传试听），这里只做「最近播放」的交接：
 *   点歌台播放某首时通过 adoptTrack 把曲目与进度交给播放器，回到办公室后底栏可继续听。
 */

export interface JukeboxPlayerState {
  track: JukeboxTrack | null
  queue: readonly JukeboxTrack[]
  playing: boolean
  loading: boolean
  position: number
  duration: number
  volume: number
  error: string
}

export type TrackUrlResolver = (track: JukeboxTrack) => Promise<string | null>

const listeners = new Set<() => void>()

let state: JukeboxPlayerState = {
  track: null,
  queue: [],
  playing: false,
  loading: false,
  position: 0,
  duration: 0,
  volume: 0.72,
  error: '',
}

let audio: HTMLAudioElement | null = null
let objectUrl: string | null = null
let loadToken = 0

function emit(patch: Partial<JukeboxPlayerState>) {
  state = { ...state, ...patch }
  for (const listener of listeners) listener()
}

export function subscribePlayer(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function playerState(): JukeboxPlayerState {
  return state
}

function releaseObjectUrl() {
  if (!objectUrl) return
  URL.revokeObjectURL(objectUrl)
  objectUrl = null
}

function element(): HTMLAudioElement {
  if (audio) return audio
  const next = new Audio()
  next.preload = 'metadata'
  next.volume = state.volume
  next.addEventListener('timeupdate', () => {
    if (!audio) return
    emit({
      position: audio.currentTime,
      duration: Number.isFinite(audio.duration) ? audio.duration : state.duration,
    })
  })
  next.addEventListener('durationchange', () => {
    if (audio && Number.isFinite(audio.duration) && audio.duration > 0) emit({ duration: audio.duration })
  })
  next.addEventListener('playing', () => emit({ playing: true, loading: false }))
  next.addEventListener('waiting', () => emit({ loading: true }))
  next.addEventListener('pause', () => emit({ playing: false }))
  next.addEventListener('volumechange', () => { if (audio) emit({ volume: audio.volume }) })
  next.addEventListener('ended', () => { step(1, true) })
  next.addEventListener('error', () => emit({ playing: false, loading: false, error: '这首曲子暂时无法播放' }))
  audio = next
  return next
}

/** 把提供方下发的歌单展开成一条顺序队列（与点歌台「精选」列表同一套 id 规则）。 */
/** 提供方可能只给 YouTube 链接而不写 provider，这里统一补上，避免底栏把它当直链音频播放。 */
function withProvider(track: JukeboxTrack): JukeboxTrack {
  if (track.provider || !track.url) return track
  return youtubeVideoId(track.url) ? { ...track, provider: 'youtube' } : track
}

export function curatedQueue(config?: JukeboxConfig): JukeboxTrack[] {
  return (config?.playlists ?? []).flatMap((playlist) => playlist.tracks.map((track) => withProvider({
    ...track,
    id: `curated:${playlist.id}:${track.id}`,
    origin: 'curated' as const,
    uploaderName: 'Mira 曲库',
    canDelete: false,
  })))
}

/** 共享曲库返回的曲目保留服务端 id，仅剔除不可播放的条目。 */
export function feedQueue(feed?: JukeboxFeed): JukeboxTrack[] {
  if (!feed) return []
  const tracks = [...(feed.dailyTrack ? [feed.dailyTrack] : []), ...feed.tracks]
  const seen = new Set<string>()
  const queue: JukeboxTrack[] = []
  for (const track of tracks) {
    if (!track?.id || seen.has(track.id)) continue
    seen.add(track.id)
    queue.push(withProvider(track))
  }
  return queue
}

export function setPlayerQueue(tracks: readonly JukeboxTrack[]) {
  const current = state.track
  const stillThere = current ? tracks.some((track) => track.id === current.id) : false
  emit({ queue: tracks, track: current && stillThere ? current : tracks[0] ?? null })
}

function queueIndex(track: JukeboxTrack | null, offset: number) {
  const queue = state.queue
  if (!queue.length) return -1
  const base = track ? queue.findIndex((item) => item.id === track.id) : -1
  if (base < 0) return offset > 0 ? 0 : queue.length - 1
  return (base + offset + queue.length) % queue.length
}

async function load(track: JukeboxTrack, position: number, resolve?: TrackUrlResolver) {
  const token = ++loadToken
  const media = element()
  media.pause()
  releaseObjectUrl()
  emit({
    track,
    playing: false,
    loading: true,
    position: Math.max(0, position),
    duration: track.duration ?? 0,
    error: '',
  })
  let url: string | null = track.url ?? null
  if (resolve && (track.mediaId || !url)) {
    try {
      url = await resolve(track)
    } catch {
      url = null
    }
  }
  if (token !== loadToken) return false
  if (!url) {
    emit({ loading: false, error: '这首歌暂时无法播放' })
    return false
  }
  if (url.startsWith('blob:')) objectUrl = url
  media.src = url
  media.volume = state.volume
  if (position > 0) {
    try { media.currentTime = position } catch { /* 媒体还没就绪时交给元数据事件 */ }
  }
  emit({ loading: false })
  return true
}

/**
 * 播放指定曲目。
 * @returns false 表示这首曲目不能在本机播放（例如 YouTube 嵌入），调用方应引导去点歌台。
 */
export async function playTrack(track: JukeboxTrack, options: { position?: number; resolve?: TrackUrlResolver } = {}): Promise<boolean> {
  if (track.provider === 'youtube') {
    emit({ track, playing: false, loading: false, position: 0, duration: track.duration ?? 0, error: '' })
    return false
  }
  const ok = await load(track, options.position ?? 0, options.resolve)
  if (!ok) return false
  try {
    await element().play()
    emit({ playing: true })
    return true
  } catch (error) {
    emit({ playing: false, error: playbackErrorText(error) })
    return true
  }
}

/** 播放/暂停当前曲目；尚未加载过媒体时按需加载。 */
export async function togglePlayer(resolve?: TrackUrlResolver): Promise<void> {
  const current = state.track
  if (!current) return
  const media = element()
  if (state.playing) {
    media.pause()
    return
  }
  if (!media.src) {
    const ok = await load(current, state.position, resolve)
    if (!ok) return
  }
  try {
    await media.play()
    emit({ playing: true, error: '' })
  } catch (error) {
    emit({ playing: false, error: playbackErrorText(error) })
  }
}

async function step(offset: number, autoplay: boolean, resolve?: TrackUrlResolver) {
  const next = queueIndex(state.track, offset)
  if (next < 0) return
  const track = state.queue[next]
  if (autoplay) await playTrack(track, { resolve })
  else emit({ track, position: 0, duration: track.duration ?? 0, playing: false, loading: false, error: '' })
}

export function playerNext(resolve?: TrackUrlResolver) { void step(1, true, resolve) }
export function playerPrevious(resolve?: TrackUrlResolver) { void step(-1, true, resolve) }

export function seekPlayer(seconds: number) {
  const media = element()
  const duration = Number.isFinite(media.duration) ? media.duration : state.duration
  const target = Math.min(Math.max(seconds, 0), duration || seconds)
  try { media.currentTime = target } catch { return }
  emit({ position: target })
}

export function setPlayerVolume(volume: number) {
  const next = Math.min(Math.max(volume, 0), 1)
  if (audio) audio.volume = next
  emit({ volume: next })
}

/** 点歌台把「正在播放」交给底栏：只记录曲目与进度，不抢占点歌台自己的播放。 */
export function adoptTrack(track: JukeboxTrack, position = 0) {
  loadToken++
  releaseObjectUrl()
  if (audio) {
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
  }
  emit({ track, position: Math.max(0, position), duration: track.duration ?? 0, playing: false, loading: false, error: '' })
}

/** 是否能在底栏直接播放（YouTube 嵌入只能回点歌台）。 */
/** 自动播放被浏览器拦截时提示再点一次；其它错误说明媒体地址本身不可播。 */
function playbackErrorText(error: unknown): string {
  return error instanceof DOMException && error.name === 'NotAllowedError'
    ? '点击播放键即可开始'
    : '这首曲子的媒体地址暂时无法播放，可以到点歌台试试'
}

export function canPlayInline(track: JukeboxTrack | null): boolean {
  if (!track) return false
  return track.provider !== 'youtube' && !(track.url && youtubeVideoId(track.url))
}
