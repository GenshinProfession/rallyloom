import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays, CloudUpload, Disc3, Headphones, LoaderCircle, Maximize2, Music2,
  Pause, Play, Plus, Search, SkipBack, SkipForward, Trash2, Volume2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { WorkspaceHeader } from '@/components/ui/workspace-header'
import { formatDuration, type JukeboxClient, type JukeboxConfig, type JukeboxFeed, type JukeboxTrack, youtubeVideoId } from '@/lib/jukebox/types'
import { adoptTrack } from '@/lib/jukebox/player'
import { loadYoutubeApi, type YoutubePlayer } from '@/lib/jukebox/youtube'
import { cn } from '@/lib/utils'
import './jukebox.css'

interface JukeboxPageProps {
  config?: JukeboxConfig
  client?: JukeboxClient
  demo: boolean
}

function curatedTracks(config?: JukeboxConfig): JukeboxTrack[] {
  return (config?.playlists ?? []).flatMap((playlist) => playlist.tracks.map((track) => ({
    ...track,
    id: `curated:${playlist.id}:${track.id}`,
    origin: 'curated' as const,
    uploaderName: 'Mira 曲库',
    canDelete: false,
  })))
}

function localDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function fileTitle(name: string) { return name.replace(/\.mp4$/i, '').trim().slice(0, 120) || '新歌曲' }
function shortDate(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(date)
}

export function JukeboxPage({ config, client, demo }: JukeboxPageProps) {
  void demo
  const initialTracks = useMemo(() => curatedTracks(config), [config])
  const [feed, setFeed] = useState<JukeboxFeed>(() => ({ day: localDate(), dailyTrackId: initialTracks[0]?.id ?? null, tracks: initialTracks }))
  const [queue, setQueue] = useState<JukeboxTrack[]>([])
  const [index, setIndex] = useState(0)
  const [query, setQuery] = useState('')
  const [volume, setVolume] = useState(0.8)
  const [playing, setPlaying] = useState(false)
  const [loadingMedia, setLoadingMedia] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const youtubeHostRef = useRef<HTMLDivElement>(null)
  const youtubePlayerRef = useRef<YoutubePlayer | null>(null)
  const queueStateRef = useRef({ queue, index })
  const localUrlsRef = useRef<string[]>([])
  const current = queue[index]
  const youtubeId = current?.provider === 'youtube' ? youtubeVideoId(current.url) : null
  queueStateRef.current = { queue, index }

  const refresh = useCallback(async () => {
    if (!client) return
    try {
      const next = await client.list()
      setFeed(next)
      setError('')
    } catch (cause) {
      /* 企业只在 bootstrap 里下发歌单时，共享曲库接口可以不存在：用精选歌单即可，不打扰。 */
      setError(curatedTracks(config).length ? '' : cause instanceof Error ? cause.message : '共享曲库暂时无法连接')
    }
  }, [client, config])

  useEffect(() => { void refresh() }, [refresh])
  /* 交给办公室底栏：切回办公室时同一条曲子可以接着听（点歌台自己的舞台不变）。 */
  useEffect(() => {
    if (current) adoptTrack(current, videoRef.current?.currentTime ?? 0)
  }, [current])
  useEffect(() => {
    if (!client) return
    const timer = window.setInterval(() => void refresh(), 20000)
    return () => window.clearInterval(timer)
  }, [client, refresh])
  useEffect(() => () => localUrlsRef.current.forEach((url) => URL.revokeObjectURL(url)), [])

  const tracks = feed.tracks
  const filteredTracks = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) return tracks
    return tracks.filter((track) => `${track.title} ${track.artist ?? ''} ${track.uploaderName ?? ''}`.toLocaleLowerCase().includes(needle))
  }, [query, tracks])
  const dailyTrack = feed.tracks.find((track) => track.id === feed.dailyTrackId) ?? feed.dailyTrack

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let alive = true
    let objectUrl: string | undefined
    setError('')
    setPlaying(false)
    setLoadingMedia(false)
    video.pause()
    video.removeAttribute('src')
    video.load()
    if (!current || current.provider === 'youtube') return
    const play = (url: string) => {
      if (!alive || !videoRef.current) return
      video.src = url
      video.volume = volume
      void video.play().then(() => { if (alive) setPlaying(true) }).catch(() => { if (alive) setPlaying(false) })
    }
    if (current.mediaId && client) {
      setLoadingMedia(true)
      void client.media(current.mediaId).then((blob) => {
        if (!alive) return
        objectUrl = URL.createObjectURL(blob)
        setLoadingMedia(false)
        play(objectUrl)
      }).catch((cause: unknown) => {
        if (!alive) return
        setLoadingMedia(false)
        setError(cause instanceof Error ? cause.message : '歌曲加载失败，请重试')
      })
    } else if (current.url) play(current.url)
    else setError('这首歌暂时无法播放')
    return () => {
      alive = false
      video.pause()
      video.removeAttribute('src')
      video.load()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [client, current?.id, current?.mediaId, current?.provider, current?.url])

  useEffect(() => {
    const host = youtubeHostRef.current
    if (!youtubeId || !host) {
      youtubePlayerRef.current?.destroy()
      youtubePlayerRef.current = null
      return
    }
    let alive = true
    const mount = document.createElement('div')
    host.replaceChildren(mount)
    setError('')
    void loadYoutubeApi().then((api) => {
      if (!alive) return
      const playerVars: Record<string, number | string> = { autoplay: 1, controls: 1, playsinline: 1, rel: 0, enablejsapi: 1 }
      if (location.origin.startsWith('http')) playerVars.origin = location.origin
      youtubePlayerRef.current = new api.Player(mount, {
        videoId: youtubeId,
        playerVars,
        events: {
          onReady: ({ target }) => { target.setVolume(Math.round(volume * 100)); target.playVideo() },
          onStateChange: ({ data }) => {
            if (data === api.PlayerState.PLAYING) setPlaying(true)
            if (data === api.PlayerState.PAUSED) setPlaying(false)
            if (data === api.PlayerState.ENDED) { const state = queueStateRef.current; if (state.queue.length) setIndex((state.index + 1) % state.queue.length) }
          },
          onError: ({ data }) => { setPlaying(false); setError(data === 101 || data === 150 ? '该视频不允许嵌入播放。' : data === 100 ? 'YouTube 上找不到该视频。' : 'YouTube 播放器无法播放该视频。') },
        },
      })
    }).catch((cause: unknown) => { if (alive) setError(cause instanceof Error ? cause.message : 'YouTube 播放器加载失败') })
    return () => { alive = false; youtubePlayerRef.current?.destroy(); youtubePlayerRef.current = null; host.replaceChildren() }
  }, [youtubeId])

  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume
    youtubePlayerRef.current?.setVolume(Math.round(volume * 100))
  }, [volume])

  useEffect(() => {
    if (!queue.length) { setIndex(0); return }
    if (index >= queue.length) setIndex(queue.length - 1)
  }, [queue.length, index])

  const playTrack = (track: JukeboxTrack) => { setError(''); setQueue([track]); setIndex(0) }
  const playAt = (next: number) => { if (queue.length) setIndex(((next % queue.length) + queue.length) % queue.length) }
  const queueTrack = (track: JukeboxTrack) => {
    setError('')
    setQueue((items) => {
      if (items.some(({ id }) => id === track.id)) { setMessage('这首歌已经在播放队列里'); return items }
      setMessage(`已把「${track.title}」加入队列`)
      return [...items, track]
    })
  }
  const removeAt = (at: number) => {
    setQueue((items) => items.filter((_, position) => position !== at))
    setIndex((value) => at < value ? value - 1 : value)
  }

  function togglePlay() {
    if (current?.provider === 'youtube') {
      const player = youtubePlayerRef.current
      if (!player) { setError('正在连接 YouTube 播放器，请稍候。'); return }
      if (player.getPlayerState() === 1) player.pauseVideo()
      else player.playVideo()
      return
    }
    const video = videoRef.current
    if (!video || !current) return
    if (video.paused) void video.play().then(() => setPlaying(true)).catch(() => setError('当前歌曲无法播放。'))
    else { video.pause(); setPlaying(false) }
  }

  async function fullscreen() {
    try { await stageRef.current?.requestFullscreen() }
    catch { setError('当前窗口不支持全屏播放') }
  }

  async function addFile(file?: File) {
    if (!file) return
    setError('')
    setMessage('')
    if (!file.name.toLowerCase().endsWith('.mp4')) { setError('请选择 MP4 文件'); return }
    if (file.size > 20 * 1024 * 1024) { setError('MP4 文件不能超过 20 MB'); return }
    const title = fileTitle(file.name)
    if (!client) {
      const url = URL.createObjectURL(file)
      localUrlsRef.current.push(url)
      const local: JukeboxTrack = { id: `demo:${crypto.randomUUID()}`, title, url, origin: 'member', uploaderName: '你', canDelete: true }
      setFeed((value) => ({ ...value, tracks: [local, ...value.tracks], dailyTrackId: value.dailyTrackId ?? local.id }))
      setMessage('已加入当前演示曲库')
      return
    }
    setUploading(true)
    try {
      await client.submit(file, title)
      await refresh()
      setMessage(`「${title}」已分享给工作区成员`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '上传失败，请重试')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function deleteTrack(track: JukeboxTrack) {
    if (track.id.startsWith('demo:')) {
      setFeed((value) => ({ ...value, tracks: value.tracks.filter(({ id }) => id !== track.id) }))
      return
    }
    const mediaId = track.mediaId ?? track.id.replace(/^upload:/, '')
    if (!client || !track.canDelete || !/^[0-9a-f-]{36}$/i.test(mediaId)) return
    try { await client.remove(mediaId); await refresh(); setMessage('歌曲已从共享曲库移除') }
    catch (cause) { setError(cause instanceof Error ? cause.message : '歌曲删除失败') }
  }

  const dailyLabel = useMemo(() => {
    if (!feed.day) return '今日随机'
    const date = new Date(`${feed.day}T00:00:00`)
    return Number.isNaN(date.getTime()) ? '今日随机' : new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(date)
  }, [feed.day])

  return (
    <div className="jukebox-page" data-jukebox="root">
      <WorkspaceHeader title="点歌台" description={`${tracks.length} 首歌 · 每天随机一首`}>
        <label className="jukebox-search">
          <Search className="size-3.5" strokeWidth={1.8} />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="找一首歌" aria-label="搜索曲库" />
        </label>
        <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading} data-jukebox-add-mp4>
          {uploading ? <LoaderCircle className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          {uploading ? '正在分享' : '分享一首歌'}
        </Button>
      </WorkspaceHeader>

      <input ref={fileInputRef} className="jukebox-file-input" type="file" accept=".mp4,video/mp4" onChange={(event) => void addFile(event.target.files?.[0])} />
      <main className="jukebox-layout">
        <section className={cn('jukebox-library', dragOver && 'is-drag-over')} onDragOver={(event) => { event.preventDefault(); setDragOver(true) }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOver(false) }}
          onDrop={(event) => { event.preventDefault(); setDragOver(false); void addFile(event.dataTransfer.files?.[0]) }}>
          <header className="jukebox-library-heading">
            <div><span className="jukebox-kicker">THE SHARED MIX</span><h2>大家分享的歌</h2></div>
            <Badge variant="secondary">{tracks.length} 首</Badge>
          </header>

          <button type="button" className="jukebox-drop" onClick={() => fileInputRef.current?.click()} disabled={uploading} data-jukebox-drop>
            <span className="jukebox-drop-icon">{uploading ? <LoaderCircle className="size-5 animate-spin" /> : <CloudUpload className="size-5" strokeWidth={1.7} />}</span>
            <span className="jukebox-drop-copy"><strong>{uploading ? '正在加入共享曲库…' : '把喜欢的 MP4 拖到这里'}</strong><small>{uploading ? '完成后大家刷新时就能听到' : '或点击选择 · 单曲不超过 20 MB'}</small></span>
            <Plus className="jukebox-drop-plus size-4" />
          </button>

          <div className="jukebox-track-list" data-jukebox-tracks>
            {filteredTracks.map((track, position) => (
              <article key={track.id} className={cn('jukebox-track', current?.id === track.id && 'is-playing')} data-jukebox-track={track.id}>
                <button type="button" className="jukebox-art" aria-label={`播放 ${track.title}`} onClick={() => playTrack(track)}>
                  {track.poster ? <img src={track.poster} alt="" /> : <span><Music2 className="size-4" /></span>}
                  <i><Play className="size-3" fill="currentColor" /></i>
                </button>
                <button type="button" className="jukebox-track-info" onClick={() => playTrack(track)}>
                  <strong>{track.title}</strong>
                  <span>{track.artist || track.uploaderName || '工作区分享'}{track.duration ? ` · ${formatDuration(track.duration)}` : ''}</span>
                  <small>{track.origin === 'member' ? `${track.uploaderName || '成员'} 分享${shortDate(track.createdAt) ? ` · ${shortDate(track.createdAt)}` : ''}` : 'Mira 曲库'}</small>
                </button>
                <div className="jukebox-track-actions">
                  <Button variant="ghost" size="icon" aria-label={`加入队列：${track.title}`} onClick={() => queueTrack(track)}><Plus className="size-4" /></Button>
                  {track.canDelete && track.mediaId && <Button variant="ghost" size="icon" aria-label={`删除分享：${track.title}`} onClick={() => void deleteTrack(track)}><Trash2 className="size-3.5" /></Button>}
                </div>
                <span className="jukebox-track-number">{String(position + 1).padStart(2, '0')}</span>
              </article>
            ))}
            {!filteredTracks.length && <div className="jukebox-empty"><Disc3 className="size-7" /><strong>{query ? '没有找到这首歌' : '这里还没有歌曲'}</strong><span>{query ? '换个名字再找找' : '把第一首喜欢的歌放进来吧'}</span></div>}
          </div>
          {error && <p className="jukebox-error" role="alert" data-jukebox-error>{error}</p>}
          {message && <p className="jukebox-message" role="status">{message}</p>}
        </section>

        <aside className="jukebox-side">
          <section className="jukebox-daily" data-jukebox-daily>
            <div className="jukebox-daily-top"><span><CalendarDays className="size-3.5" /> {dailyLabel}</span><span className="jukebox-daily-dot" /></div>
            {dailyTrack ? <>
              <div className="jukebox-daily-art" style={dailyTrack.poster ? { backgroundImage: `linear-gradient(180deg,rgba(12,31,25,.05),rgba(12,31,25,.78)),url("${dailyTrack.poster}")` } : undefined}>
                {!dailyTrack.poster && <Disc3 className="jukebox-daily-disc" strokeWidth={1.1} />}
                <span>今日随机</span>
              </div>
              <div className="jukebox-daily-info"><strong>{dailyTrack.title}</strong><span>{dailyTrack.artist || dailyTrack.uploaderName || '来自共享曲库'}</span></div>
              <Button className="jukebox-daily-play" onClick={() => playTrack(dailyTrack)}><Play className="size-4" fill="currentColor" /> 播放今日歌曲</Button>
            </> : <div className="jukebox-daily-empty"><Disc3 className="size-7" /><strong>今日歌曲等你来选</strong><span>第一首分享后会自动抽取</span></div>}
          </section>

          <section className="jukebox-player-card">
            <div className="jukebox-player-heading"><Headphones className="size-4" /><span>正在播放</span><span className={cn('jukebox-live', playing && 'is-active')}>{playing ? '播放中' : loadingMedia ? '载入中' : '待机'}</span></div>
            <div className="jukebox-stage" ref={stageRef}>
              {current?.provider === 'youtube'
                ? <div ref={youtubeHostRef} className="jukebox-youtube" data-jukebox-youtube />
                : <video ref={videoRef} data-jukebox-video className="jukebox-video" playsInline preload="metadata" poster={current?.poster}
                  onEnded={() => playAt(index + 1)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />}
              {!current && <div className="jukebox-stage-placeholder"><Disc3 className="size-8" strokeWidth={1.2} /><span>挑一首歌，和大家一起听</span></div>}
              {loadingMedia && <div className="jukebox-loading"><LoaderCircle className="size-5 animate-spin" /><span>正在载入歌曲</span></div>}
              {current && !playing && !loadingMedia && <button type="button" className="jukebox-stage-play" aria-label="播放" onClick={togglePlay}><Play className="size-5" fill="currentColor" /></button>}
              <button type="button" className="jukebox-fullscreen" aria-label="全屏播放" disabled={!current} onClick={() => void fullscreen()}><Maximize2 className="size-3.5" /></button>
            </div>
            <div className="jukebox-now"><strong>{current?.title ?? '还没开始播放'}</strong><span>{current ? `${current.artist || current.uploaderName || '工作区分享'} · ${formatDuration(current.duration)}` : '今天的歌已经准备好了'}</span></div>
            <div className="jukebox-transport">
              <Button variant="ghost" size="icon" aria-label="上一首" disabled={!queue.length} onClick={() => playAt(index - 1)}><SkipBack className="size-4" /></Button>
              <Button className="jukebox-main-play" size="icon" aria-label={playing ? '暂停' : '播放'} disabled={!current || loadingMedia} onClick={togglePlay}>{playing ? <Pause className="size-4" /> : <Play className="size-4" fill="currentColor" />}</Button>
              <Button variant="ghost" size="icon" aria-label="下一首" disabled={!queue.length} onClick={() => playAt(index + 1)}><SkipForward className="size-4" /></Button>
              <label className="jukebox-volume"><Volume2 className="size-3.5" /><input type="range" min={0} max={1} step={0.05} value={volume} aria-label="音量" onChange={(event) => setVolume(Number(event.target.value))} /></label>
            </div>
          </section>

          <section className="jukebox-queue" data-jukebox-queue>
            <header><div><span className="jukebox-kicker">UP NEXT</span><h3>接下来播放</h3></div><Badge variant="outline">{queue.length}</Badge></header>
            {queue.length ? <div className="jukebox-queue-list">
              {queue.map((track, position) => <div key={`${track.id}-${position}`} className={cn('jukebox-queue-item', position === index && 'is-current')}>
                <button type="button" onClick={() => setIndex(position)}><span className="jukebox-queue-play">{position === index && playing ? <span className="jukebox-equalizer"><i /><i /><i /></span> : position + 1}</span><span className="jukebox-queue-title"><strong>{track.title}</strong><small>{track.artist || track.uploaderName || '工作区分享'}</small></span></button>
                <Button variant="ghost" size="icon" aria-label={`从队列移除 ${track.title}`} onClick={() => removeAt(position)}><Trash2 className="size-3.5" /></Button>
              </div>)}
            </div> : <div className="jukebox-queue-empty"><Music2 className="size-4" /><span>从曲库里加入接下来想听的歌</span></div>}
          </section>
        </aside>
      </main>
    </div>
  )
}
