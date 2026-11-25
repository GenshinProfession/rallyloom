import { useEffect, useMemo, useRef, useState } from 'react'
import { Disc3, ListMusic, Maximize2, Music4, Pause, Play, Plus, Search, SkipBack, SkipForward, Trash2, Volume2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { WorkspaceHeader } from '@/components/ui/workspace-header'
import { formatDuration, mediaUrl, type JukeboxConfig, type JukeboxPlaylist, type JukeboxTrack, youtubeVideoId } from '@/lib/jukebox/types'
import { cn } from '@/lib/utils'
import './jukebox.css'

interface JukeboxPageProps {
  /** 提供方下发的歌单（已清洗过）；为空则引导企业配置 */
  config?: JukeboxConfig
  demo: boolean
  /** 演示模式下允许管理员添加本机试听条目（企业实际接入时由提供方下发歌单） */
  canManage: boolean
  /** 演示模式下本机试听条目的持久化键（正式模式不落盘） */
  storageKey?: string
}

interface YoutubePlayer {
  destroy(): void
  playVideo(): void
  pauseVideo(): void
  getPlayerState(): number
  setVolume(volume: number): void
}

interface YoutubePlayerEvent {
  target: YoutubePlayer
  data: number
}

interface YoutubeApi {
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number }
  Player: new (element: HTMLElement, options: {
    videoId: string
    playerVars?: Record<string, number | string>
    events: {
      onReady: (event: YoutubePlayerEvent) => void
      onStateChange: (event: YoutubePlayerEvent) => void
      onError: (event: YoutubePlayerEvent) => void
    }
  }) => YoutubePlayer
}

declare global {
  interface Window {
    YT?: YoutubeApi
    onYouTubeIframeAPIReady?: () => void
  }
}

let youtubeApiPromise: Promise<YoutubeApi> | undefined

function loadYoutubeApi(): Promise<YoutubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (youtubeApiPromise) return youtubeApiPromise
  youtubeApiPromise = new Promise<YoutubeApi>((resolve, reject) => {
    let timer: number | undefined
    const previousReady = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.()
      if (timer) window.clearTimeout(timer)
      if (window.YT?.Player) resolve(window.YT)
      else reject(new Error('YouTube 播放器没有完成初始化'))
    }
    let script = document.querySelector<HTMLScriptElement>('script[data-jukebox-youtube-api]')
    if (!script) {
      script = document.createElement('script')
      script.src = 'https://www.youtube.com/iframe_api'
      script.async = true
      script.dataset.jukeboxYoutubeApi = 'true'
      document.head.appendChild(script)
    }
    script.onerror = () => {
      if (timer) window.clearTimeout(timer)
      youtubeApiPromise = undefined
      reject(new Error('无法连接 YouTube 官方播放器'))
    }
    timer = window.setTimeout(() => {
      youtubeApiPromise = undefined
      reject(new Error('YouTube 播放器加载超时，请检查网络后重试'))
    }, 15000)
  })
  return youtubeApiPromise
}

const LOCAL_PLAYLIST: JukeboxPlaylist = { id: '__local__', name: '本机试听', description: '演示模式下临时添加的 MP4，不会同步到云端', tracks: [] }

function readLocal(storageKey?: string): JukeboxTrack[] {
  if (!storageKey) return []
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return []
    const list = JSON.parse(raw) as JukeboxTrack[]
    return Array.isArray(list) ? list.filter((track) => track && typeof track.url === 'string') : []
  } catch {
    return []
  }
}

export function JukeboxPage({ config, demo, canManage, storageKey }: JukeboxPageProps) {
  const [localTracks, setLocalTracks] = useState<JukeboxTrack[]>(() => (demo ? readLocal(storageKey) : []))
  const playlists = useMemo<JukeboxPlaylist[]>(() => {
    const base = config?.playlists ?? []
    return localTracks.length ? [...base, { ...LOCAL_PLAYLIST, tracks: localTracks }] : [...base]
  }, [config?.playlists, localTracks])
  const [activeId, setActiveId] = useState<string>(() => playlists[0]?.id ?? '')
  const active = playlists.find(({ id }) => id === activeId) ?? playlists[0]
  const [query, setQuery] = useState('')

  const [queue, setQueue] = useState<JukeboxTrack[]>([])
  const [index, setIndex] = useState(0)
  const current = queue[index]
  const [playing, setPlaying] = useState(false)
  const [volume, setVolume] = useState(0.8)
  const [error, setError] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const youtubeHostRef = useRef<HTMLDivElement>(null)
  const youtubePlayerRef = useRef<YoutubePlayer | null>(null)
  const queueStateRef = useRef({ queue, index })
  const stageRef = useRef<HTMLDivElement>(null)
  const youtubeId = current?.provider === 'youtube' ? youtubeVideoId(current.url) : null
  queueStateRef.current = { queue, index }

  const tracks = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!active) return []
    if (!needle) return active.tracks
    return active.tracks.filter((track) =>
      `${track.title} ${track.artist ?? ''} ${Object.values(track.attrs ?? {}).join(' ')}`.toLowerCase().includes(needle))
  }, [active, query])

  useEffect(() => {
    if (!activeId && playlists[0]) setActiveId(playlists[0].id)
  }, [activeId, playlists])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (!current || current.provider === 'youtube') {
      video.pause()
      video.removeAttribute('src')
      video.load()
      setPlaying(false)
      return
    }
    if (video.getAttribute('src') !== current.url) video.src = current.url
    video.volume = volume
    // 当前音轨变化时尝试自动播放；被系统拦截就停留在暂停态，由用户点播放。
    video.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    return () => {
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [current?.provider, current?.url]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const host = youtubeHostRef.current
    if (!youtubeId || !host) {
      youtubePlayerRef.current?.destroy()
      youtubePlayerRef.current = null
      return
    }
    let cancelled = false
    setError('')
    setPlaying(false)
    const mount = document.createElement('div')
    host.replaceChildren(mount)

    loadYoutubeApi().then((api) => {
      if (cancelled || !youtubeHostRef.current) return
      const playerVars: Record<string, number | string> = {
        autoplay: 1,
        controls: 1,
        playsinline: 1,
        rel: 0,
        enablejsapi: 1,
      }
      if (location.origin.startsWith('http')) playerVars.origin = location.origin
      youtubePlayerRef.current = new api.Player(mount, {
        videoId: youtubeId,
        playerVars,
        events: {
          onReady: ({ target }) => {
            target.setVolume(Math.round(volume * 100))
            target.playVideo()
          },
          onStateChange: ({ data }) => {
            if (data === api.PlayerState.PLAYING) setPlaying(true)
            if (data === api.PlayerState.PAUSED) setPlaying(false)
            if (data === api.PlayerState.ENDED) {
              const state = queueStateRef.current
              if (state.queue.length) setIndex((state.index + 1) % state.queue.length)
            }
          },
          onError: ({ data }) => {
            setPlaying(false)
            setError(data === 101 || data === 150
              ? '该视频不允许嵌入播放，请换用允许嵌入的官方链接。'
              : data === 100
                ? 'YouTube 上找不到该视频，或视频已设为私享。'
                : 'YouTube 播放器无法播放该视频，请检查网络或视频状态。')
          },
        },
      })
    }).catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'YouTube 播放器加载失败')
    })

    return () => {
      cancelled = true
      youtubePlayerRef.current?.destroy()
      youtubePlayerRef.current = null
      host.replaceChildren()
    }
  }, [youtubeId])

  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume
    youtubePlayerRef.current?.setVolume(Math.round(volume * 100))
  }, [volume])

  useEffect(() => {
    if (current) return
    const video = videoRef.current
    if (!video) return
    video.pause()
    video.removeAttribute('src')
    video.load()
    setPlaying(false)
  }, [current?.provider, current?.url])

  useEffect(() => {
    if (!queue.length) { setIndex(0); return }
    if (index >= queue.length) setIndex(queue.length - 1)
  }, [queue.length, index])

  function addToQueue(track: JukeboxTrack) {
    setError('')
    setQueue((list) => {
      if (list.some(({ id, url }) => id === track.id && url === track.url)) {
        setError(`「${track.title}」已经在播放队列里`)
        return list
      }
      return [...list, track]
    })
  }

  function playAt(next: number) {
    if (!queue.length) return
    setIndex(((next % queue.length) + queue.length) % queue.length)
  }

  function removeAt(at: number) {
    setQueue((list) => list.filter((_, i) => i !== at))
    setIndex((value) => (at < value ? value - 1 : at === value ? value : value))
  }

  function togglePlay() {
    if (current?.provider === 'youtube') {
      const player = youtubePlayerRef.current
      if (!player) { setError('正在连接 YouTube 官方播放器，请稍候再试。'); return }
      if (player.getPlayerState() === 1) player.pauseVideo()
      else player.playVideo()
      return
    }
    const video = videoRef.current
    if (!video || !current) return
    if (video.paused) {
      video.play().then(() => setPlaying(true)).catch(() => setError('当前媒体无法播放：请确认 HTTPS 地址可访问并且格式受浏览器支持'))
    } else {
      video.pause()
      setPlaying(false)
    }
  }

  async function fullscreen() {
    try {
      await stageRef.current?.requestFullscreen()
    } catch {
      setError('当前窗口不支持全屏播放')
    }
  }

  function saveLocal(draft: { title: string; url: string; artist?: string }) {
    const url = mediaUrl(draft.url)
    if (!url) { setError('请填写可播放的 MP4 地址（http/https 绝对地址）'); return }
    const track: JukeboxTrack = {
      id: `local-${Date.now().toString(36)}`,
      title: draft.title.trim(),
      artist: draft.artist?.trim() || undefined,
      url,
      attrs: { 来源: '本机添加' },
    }
    const next = [...localTracks, track]
    setLocalTracks(next)
    if (storageKey) window.localStorage.setItem(storageKey, JSON.stringify(next))
    setActiveId(LOCAL_PLAYLIST.id)
    setAddOpen(false)
    setError('')
  }

  const total = playlists.reduce((sum, playlist) => sum + playlist.tracks.length, 0)

  return (
    <div className="jukebox-page" data-jukebox="root">
      <WorkspaceHeader
        title="点歌台"
        description={playlists.length ? `${playlists.length} 个歌单 · ${total} 首` : '等待企业配置歌单'}
      >
        <label className="jukebox-search">
          <Search className="size-3.5" strokeWidth={1.8} />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索曲目" aria-label="搜索曲目" />
        </label>
        {demo && canManage && (
          <Button variant="outline" size="sm" onClick={() => setAddOpen(true)} data-jukebox-add-mp4>
            <Plus className="size-3.5" />添加 MP4
          </Button>
        )}
      </WorkspaceHeader>

      {!playlists.length ? (
      <div className="jukebox-empty" data-jukebox-empty>
          <div className="jukebox-empty-icon"><Music4 className="size-5" strokeWidth={1.6} /></div>
          <h2>企业还没有配置歌单</h2>
          <p>
            点歌台负责展示、排队与播放，不存放媒体文件。歌单可使用企业自托管 HTTPS 媒体直链，也可使用允许嵌入的 YouTube 分享链接；
            工作区提供方通过 bootstrap 的 <code>jukebox</code> 字段下发，数据结构见《接入规范》§13。
          </p>
          <dl className="jukebox-empty-schema">
            <div><dt>playlists[].id / name</dt><dd>歌单标识与名称</dd></div>
            <div><dt>tracks[].title / url</dt><dd>曲目标题 + HTTPS 媒体直链或 YouTube 官方分享链接</dd></div>
            <div><dt>tracks[].artist / poster / duration</dt><dd>可选展示字段</dd></div>
          </dl>
        </div>
      ) : (
        <div className="jukebox-body">
          <section className="jukebox-library">
            <div className="jukebox-playlists" role="tablist" aria-label="歌单">
              {playlists.map((playlist) => (
                <button
                  key={playlist.id}
                  type="button"
                  role="tab"
                  aria-selected={playlist.id === active?.id}
                  className={cn('jukebox-playlist', playlist.id === active?.id && 'is-active')}
                  data-jukebox-playlist={playlist.id}
                  onClick={() => { setActiveId(playlist.id); setQuery('') }}
                >
                  <ListMusic className="size-3.5" strokeWidth={1.8} />
                  <span className="jukebox-playlist-name">{playlist.name}</span>
                  <span className="jukebox-playlist-count">{playlist.tracks.length}</span>
                </button>
              ))}
            </div>
            {active?.description && <p className="jukebox-description">{active.description}</p>}
            <div className="jukebox-tracks" data-jukebox-tracks>
              {tracks.map((track, position) => (
                <article key={`${track.id}-${position}`} className="jukebox-track" data-jukebox-track={track.id}>
                  <span className="jukebox-track-index">{String(position + 1).padStart(2, '0')}</span>
                  <div className="jukebox-track-body">
                    <div className="jukebox-track-title">{track.title}</div>
                    <div className="jukebox-track-meta">
                      <span>{track.artist ?? '未知演唱'}</span>
                      <span>·</span>
                      {track.duration !== undefined && <span>{formatDuration(track.duration)}</span>}
                      {track.provider === 'youtube' && <Badge variant="outline" className="jukebox-track-source">YouTube</Badge>}
                      {track.sourceId && <Badge variant="secondary" className="jukebox-track-source">外部 · {track.sourceId}</Badge>}
                      {track.attrs && Object.entries(track.attrs).slice(0, 2).map(([key, value]) => (
                        <Badge key={key} variant="outline" className="jukebox-track-attr">{key} · {value}</Badge>
                      ))}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="jukebox-track-add" data-jukebox-add={track.id} onClick={() => addToQueue(track)}>
                    <Plus className="size-3.5" />点歌
                  </Button>
                </article>
              ))}
              {!tracks.length && <p className="jukebox-hint">{query ? '没有匹配的曲目' : '这个歌单暂时没有曲目'}</p>}
            </div>
            {config?.note && <p className="jukebox-note">{config.note}</p>}
          </section>

          <section className="jukebox-playback">
            <div className="jukebox-stage" ref={stageRef}>
              {/* 只嵌入提供方明确声明的官方 YouTube 播放器；其它曲目走给定 HTTPS 媒体地址。 */}
              {current?.provider === 'youtube'
                ? <div ref={youtubeHostRef} className="jukebox-youtube" data-jukebox-youtube />
                : <video ref={videoRef} data-jukebox-video className="jukebox-video" playsInline preload="metadata" poster={current?.poster}
                  onEnded={() => playAt(index + 1)}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)} />}
              {!current && (
                <div className="jukebox-stage-placeholder">
                  <Disc3 className="size-8" strokeWidth={1.2} />
                  <span>从左侧歌单里点一首歌开始播放</span>
                </div>
              )}
              {current && !playing && (
                <button type="button" className="jukebox-stage-play" aria-label="播放" onClick={togglePlay}>
                  <Play className="size-6" fill="currentColor" />
                </button>
              )}
            </div>

            <div className="jukebox-console">
              <div className="jukebox-now" data-jukebox-nowplaying={current ? current.id : undefined}>
                <div className="jukebox-now-title">{current?.title ?? '未播放'}</div>
                <div className="jukebox-now-meta">
                  {current ? [current.artist ?? '未知演唱', formatDuration(current.duration)].join(' · ') : '点歌后在这里控制播放'}
                </div>
              </div>
              <div className="jukebox-transport">
                <Button variant="ghost" size="icon" aria-label="上一首" disabled={!queue.length} onClick={() => playAt(index - 1)}><SkipBack className="size-4" /></Button>
                <Button size="icon" aria-label={playing ? '暂停' : '播放'} disabled={!current} onClick={togglePlay}>
                  {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
                </Button>
                <Button variant="ghost" size="icon" aria-label="下一首" disabled={!queue.length} onClick={() => playAt(index + 1)}><SkipForward className="size-4" /></Button>
                <label className="jukebox-volume">
                  <Volume2 className="size-3.5" strokeWidth={1.7} />
                  <input type="range" min={0} max={1} step={0.05} value={volume} aria-label="音量"
                    onChange={(event) => setVolume(Number(event.target.value))} />
                </label>
                <Button variant="ghost" size="icon" aria-label="全屏播放" disabled={!current} onClick={() => void fullscreen()}><Maximize2 className="size-4" /></Button>
              </div>
            </div>

            <div className="jukebox-queue" data-jukebox-queue>
              <div className="jukebox-queue-head">
                <span className="eyebrow">QUEUE</span>
                <span className="jukebox-queue-count" data-jukebox-queue-count={queue.length}>播放队列 · {queue.length} 首</span>
                {queue.length > 0 && <Button variant="ghost" size="sm" onClick={() => { setQueue([]); setIndex(0) }}>清空</Button>}
              </div>
              <div className="jukebox-queue-list">
                {queue.map((track, position) => (
                  <div key={`${track.id}-${position}`} className={cn('jukebox-queue-item', position === index && 'is-current')} data-jukebox-queue-item={track.id}>
                    <button type="button" className="jukebox-queue-title" onClick={() => setIndex(position)}>
                      <span className="jukebox-queue-index">{position + 1}</span>
                      <span className="truncate">{track.title}</span>
                      <span className="jukebox-queue-artist">{track.artist ?? '未知演唱'}</span>
                    </button>
                    <Button variant="ghost" size="icon" aria-label={`移除 ${track.title}`} onClick={() => removeAt(position)}><Trash2 className="size-3.5" /></Button>
                  </div>
                ))}
                {!queue.length && <p className="jukebox-hint">队列为空，点歌后按顺序播放（播完自动下一首）。</p>}
              </div>
            </div>

            {error && <p className="jukebox-error" role="alert" data-jukebox-error>{error}</p>}
          </section>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <DialogTitle>添加本机试听 MP4</DialogTitle>
            <DialogDescription>演示模式临时用；正式接入由企业提供方在 bootstrap 的 jukebox 字段下发歌单。</DialogDescription>
          </DialogHeader>
          <form className="jukebox-form" onSubmit={(event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            saveLocal({ title: String(form.get('title') ?? ''), url: String(form.get('url') ?? ''), artist: String(form.get('artist') ?? '') })
          }}>
            <label>标题<input name="title" required placeholder="例如：开业宣传片" /></label>
            <label>MP4 地址<input name="url" required placeholder="https://media.example.com/videos/opening.mp4" /></label>
            <label>演唱 / 上传人<input name="artist" placeholder="可留空" /></label>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setAddOpen(false)}>取消</Button>
              <Button type="submit" data-jukebox-add-save>加入歌单</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
