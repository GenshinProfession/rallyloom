import { youtubeVideoId, type JukeboxConfig, type JukeboxFeed, type JukeboxTrack } from './types'

/**
 * 全局单例音乐播放器（办公室底栏 / 点歌台共享）。
 *
 * - 直链/共享曲库音频用一个 `<audio>`；YouTube 曲目用一只隐藏的 `<webview>` 播放 watch 页（同一套控制语义）。
 * - 只负责「播放/暂停/上下曲/进度/音量」这类与界面无关的能力，界面各自订阅。
 * - 点歌台页有自己的舞台（视频 / YouTube / 上传试听），这里只做「最近播放」的交接：
 *   点歌台播放某首时通过 adoptTrack 把曲目与进度交给播放器，切回办公室后底栏可继续听。
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

let ytView: YoutubeView | null = null
let ytVideoId: string | null = null
let ytHost: HTMLDivElement | null = null
let ytPoll: number | null = null
let ytKick: number | null = null

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

/* ---------------- 直链音频引擎 ---------------- */

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

/* ---------------- YouTube 引擎（隐藏 <webview>） ----------------
   YouTube 的 embed 播放器在桌面端会被判为「播放器配置错误（153）」，但 watch 页面本身
   可以正常播放。这里用一只隐藏的 <webview> 加载 watch 页，再通过 executeJavaScript
   直接控制页面里的 <video>，对上层暴露与 <audio> 一致的能力。 */

interface YoutubeView extends HTMLElement {
  executeJavaScript(code: string, userGesture?: boolean): Promise<unknown>
}

/** 在页面里播放 video，必要时先静音起播再恢复（自动播放策略兜底）。 */
const YT_VIDEO_PLAY = `(async () => {
  const v = document.querySelector('video')
  if (!v) return null
  try { await v.play() } catch (error) {
    const old = v.muted
    v.muted = true
    try { await v.play() } catch { v.muted = old; return null }
    v.muted = old
  }
  return true
})()`

const YT_VIDEO_INFO = `(() => {
  const v = document.querySelector('video')
  if (!v) return null
  return { t: v.currentTime, d: v.duration, paused: v.paused, ended: v.ended }
})()`

function youtubeHost(): HTMLDivElement {
  if (ytHost) return ytHost
  const host = document.createElement('div')
  host.id = 'rallyloom-youtube-engine'
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = 'position:fixed;left:-9999px;top:0;width:320px;height:180px;overflow:hidden;opacity:0;pointer-events:none;'
  document.body.appendChild(host)
  ytHost = host
  return host
}

function ytAvailable(): boolean {
  if (typeof document === 'undefined') return false
  const probe = document.createElement('webview') as unknown as YoutubeView
  return typeof probe.executeJavaScript === 'function'
}

async function ytEval<T = unknown>(code: string): Promise<T | null> {
  const view = ytView
  if (!view) return null
  try {
    return (await view.executeJavaScript(code)) as T
  } catch {
    return null
  }
}

function stopYtPoll() {
  if (ytPoll !== null) { window.clearInterval(ytPoll); ytPoll = null }
}

function startYtPoll() {
  stopYtPoll()
  ytPoll = window.setInterval(() => {
    if (!ytView) return
    void ytEval<{ t: number; d: number; paused: boolean; ended: boolean }>(YT_VIDEO_INFO).then((info) => {
      if (!info) return
      const duration = Number.isFinite(info.d) && info.d > 0 ? info.d : state.duration
      if (info.ended) {
        emit({ playing: false, position: duration })
        void step(1, true)
        return
      }
      if (info.paused) {
        if (state.playing) emit({ playing: false })
        return
      }
      emit({ playing: true, loading: false, position: info.t, duration })
    })
  }, 600)
}

function destroyYoutube() {
  stopYtPoll()
  if (ytKick !== null) { window.clearTimeout(ytKick); ytKick = null }
  const view = ytView
  ytView = null
  ytVideoId = null
  try { view?.remove() } catch { /* 忽略 */ }
  ytHost?.replaceChildren()
}

function ytTrackId(track: JukeboxTrack | null): string | null {
  if (!track?.url) return null
  return track.provider === 'youtube' || youtubeVideoId(track.url) ? youtubeVideoId(track.url) : null
}

/** 起播兜底：页面里的 video 若被自动播放策略拦下，就再尝试一次静音起播。 */
function kickYoutube() {
  if (ytKick !== null) window.clearTimeout(ytKick)
  ytKick = window.setTimeout(() => {
    ytKick = null
    if (state.playing) return
    void ytEval(YT_VIDEO_PLAY)
  }, 1200)
}

async function ensureYoutube(videoId: string): Promise<void> {
  if (ytView && ytVideoId === videoId) return
  destroyYoutube()
  if (!ytAvailable()) throw new Error('当前环境不支持内嵌 YouTube 播放')
  const view = document.createElement('webview') as unknown as YoutubeView
  view.setAttribute('partition', 'persist:rallyloom-media')
  view.setAttribute('src', `https://www.youtube.com/watch?v=${videoId}&autoplay=1&mute=0&playsinline=1`)
  view.setAttribute('aria-hidden', 'true')
  view.style.cssText = 'width:320px;height:180px;border:0;background:#000;'
  ytVideoId = videoId
  ytView = view
  youtubeHost().appendChild(view)

  let ready = false
  const at = Date.now()
  while (Date.now() - at < 20000) {
    await new Promise((resolve) => { window.setTimeout(resolve, 400) })
    if (ytView !== view) throw new Error('YouTube 播放已取消')
    ready = Boolean(await ytEval<boolean>(`(() => { const v = document.querySelector('video'); return Boolean(v && v.readyState >= 1) })()`))
    if (ready) break
  }
  if (!ready) {
    destroyYoutube()
    throw new Error('YouTube 播放器加载超时')
  }
  await ytEval(`(() => { const v = document.querySelector('video'); if (v) { v.volume = ${state.volume}; v.muted = false } return true })()`)
  startYtPoll()
}

/* ---------------- 队列与播放控制 ---------------- */

/** 提供方可能只给 YouTube 链接而不写 provider，这里统一补上。 */
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

/** 共享曲库返回的曲目保留服务端 id，仅剔除重复条目。 */
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

async function loadAudio(track: JukeboxTrack, position: number, resolve?: TrackUrlResolver) {
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

async function playYoutube(track: JukeboxTrack, position = 0): Promise<boolean> {
  const videoId = ytTrackId(track)
  if (!videoId) {
    emit({ track, playing: false, loading: false, error: '曲目缺少 YouTube 视频地址' })
    return false
  }
  audio?.pause()
  emit({ track, playing: false, loading: true, position, duration: track.duration ?? 0, error: '' })
  try {
    await ensureYoutube(videoId)
    if (state.track?.id !== track.id) return false
    if (position > 0) {
      await ytEval(`(() => { const v = document.querySelector('video'); if (v) v.currentTime = ${Math.max(0, position)}; return true })()`)
    }
    await ytEval(YT_VIDEO_PLAY)
    kickYoutube()
    emit({ loading: false })
    return true
  } catch (error) {
    emit({ playing: false, loading: false, error: error instanceof Error ? error.message : 'YouTube 曲目暂时无法播放' })
    return false
  }
}

export async function playTrack(track: JukeboxTrack, options: { position?: number; resolve?: TrackUrlResolver } = {}): Promise<boolean> {
  if (ytTrackId(track)) return playYoutube(track, options.position ?? 0)
  const ok = await loadAudio(track, options.position ?? 0, options.resolve)
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

export async function togglePlayer(resolve?: TrackUrlResolver): Promise<void> {
  const current = state.track
  if (!current) return
  const videoId = ytTrackId(current)
  if (videoId) {
    if (state.playing) {
      await ytEval('(() => { document.querySelector("video")?.pause(); return true })()')
      emit({ playing: false })
      return
    }
    if (ytView && ytVideoId === videoId) {
      await ytEval(YT_VIDEO_PLAY)
      kickYoutube()
      return
    }
    await playYoutube(current, state.position)
    return
  }
  const media = element()
  if (state.playing) {
    media.pause()
    return
  }
  if (!media.src) {
    const ok = await loadAudio(current, state.position, resolve)
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
  const current = state.track
  if (current && ytTrackId(current) && ytView) {
    const target = Math.min(Math.max(seconds, 0), state.duration || seconds)
    void ytEval(`(() => { const v = document.querySelector('video'); if (v) v.currentTime = ${target}; return true })()`)
    emit({ position: target })
    return
  }
  const media = element()
  const duration = Number.isFinite(media.duration) ? media.duration : state.duration
  const target = Math.min(Math.max(seconds, 0), duration || seconds)
  try { media.currentTime = target } catch { return }
  emit({ position: target })
}

export function setPlayerVolume(volume: number) {
  const next = Math.min(Math.max(volume, 0), 1)
  if (audio) audio.volume = next
  void ytEval(`(() => { const v = document.querySelector('video'); if (v) { v.volume = ${next}; v.muted = ${next === 0} } return true })()`)
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
  if (ytTrackId(track) !== ytVideoId) destroyYoutube()
  else {
    void ytEval('(() => { document.querySelector("video")?.pause(); return true })()')
  }
  emit({ track, position: Math.max(0, position), duration: track.duration ?? 0, playing: false, loading: false, error: '' })
}

/** 自动播放被浏览器策略拦截时不打扰用户（用户本来就点了播放键），其它错误才提示。 */
function playbackErrorText(error: unknown): string {
  return error instanceof DOMException && error.name === 'NotAllowedError'
    ? ''
    : '这首曲子的媒体地址暂时无法播放'
}

export function canPlayInline(track: JukeboxTrack | null): boolean {
  return Boolean(track && (track.url || track.mediaId))
}
