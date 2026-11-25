import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  ArrowUpRight,
  AudioLines,
  LoaderCircle,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Youtube,
} from 'lucide-react'
import type { JukeboxClient, JukeboxConfig, JukeboxTrack } from '@/lib/jukebox/types'
import {
  adoptTrack,
  canPlayInline,
  curatedQueue,
  feedQueue,
  playTrack,
  playerNext,
  playerPrevious,
  playerState,
  seekPlayer,
  setPlayerQueue,
  setPlayerVolume,
  subscribePlayer,
  togglePlayer,
  type TrackUrlResolver,
} from '@/lib/jukebox/player'

interface OfficeJukeboxDockProps {
  config?: JukeboxConfig
  client?: JukeboxClient
  onOpen: () => void
}

function clock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const total = Math.floor(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * 办公室底栏播放器。
 *
 * 3D 楼层在宽屏下会在下方留出一条空间，这里放一条「办公室 BGM」玻璃播放条：
 * 曲库来自点歌台同一份数据（提供方精选歌单 / 共享曲库），播放状态跨页面共享。
 */
export function OfficeJukeboxDock({ config, client, onOpen }: OfficeJukeboxDockProps) {
  const player = useSyncExternalStore(subscribePlayer, playerState, playerState)
  const [feed, setFeed] = useState<JukeboxTrack[]>(() => curatedQueue(config))
  const [muted, setMuted] = useState(false)
  const [restoreVolume] = useState(0.72)

  useEffect(() => {
    let alive = true
    const seed = curatedQueue(config)
    if (seed.length) setFeed(seed)
    if (!client) return () => { alive = false }
    const pull = async () => {
      try {
        const next = await client.list()
        if (alive) setFeed(feedQueue(next))
      } catch {
        /* 共享曲库暂时不可用时继续用内置/精选歌单，不打断办公室 */
      }
    }
    void pull()
    const timer = window.setInterval(() => void pull(), 30000)
    return () => { alive = false; window.clearInterval(timer) }
  }, [config, client])

  useEffect(() => {
    if (feed.length) setPlayerQueue(feed)
  }, [feed])

  const resolve = useMemo<TrackUrlResolver>(() => async (track: JukeboxTrack) => {
    if (track.mediaId && client) {
      const blob = await client.media(track.mediaId)
      return URL.createObjectURL(blob)
    }
    return track.url ?? null
  }, [client])

  const current = player.track ?? feed[0] ?? null
  const duration = player.duration || current?.duration || 0
  const percent = duration > 0 ? Math.min(100, (player.position / duration) * 100) : 0
  const playsInline = canPlayInline(current)
  const playing = player.playing
  const spinning = playing && playsInline

  const toggle = useCallback(async () => {
    if (player.loading) return
    if (!current) { onOpen(); return }
    if (!playsInline) { onOpen(); return }
    if (player.track?.id === current.id) {
      await togglePlayer(resolve)
      return
    }
    await playTrack(current, { resolve, position: player.track?.id === current.id ? player.position : 0 })
  }, [current, onOpen, player.loading, player.position, player.track?.id, playsInline, resolve])

  const seek = useCallback((event: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>) => {
    const trackDuration = duration
    if (!trackDuration) return
    if ('key' in event) {
      const delta = event.key === 'ArrowRight' ? 5 : event.key === 'ArrowLeft' ? -5 : 0
      if (!delta) return
      event.preventDefault()
      if (player.track?.id !== current?.id) return
      seekPlayer(player.position + delta)
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    if (player.track?.id !== current?.id) return
    seekPlayer(trackDuration * ratio)
  }, [current?.id, duration, player.position, player.track?.id])

  const changeVolume = useCallback((next: number) => {
    setMuted(next === 0)
    setPlayerVolume(next)
  }, [])

  const toggleMute = useCallback(() => {
    if (muted || player.volume === 0) {
      setMuted(false)
      setPlayerVolume(restoreVolume)
    } else {
      setMuted(true)
      setPlayerVolume(0)
    }
  }, [muted, player.volume, restoreVolume])

  return (
    <section
      className="office-jukebox"
      data-office-jukebox
      data-playing={playing || undefined}
      aria-label="办公室背景音乐播放器"
    >
      <span className="office-jukebox-pool" aria-hidden />
      <button
        type="button"
        className="office-jukebox-cover ui-press"
        aria-label={current ? `打开点歌台：${current.title}` : '打开点歌台'}
        onClick={onOpen}
        data-jukebox-cover
      >
        <span className={`office-jukebox-vinyl${spinning ? ' is-spinning' : ''}`} aria-hidden>
          {current?.poster
            ? <img className="office-jukebox-art" src={current.poster} alt="" />
            : <AudioLines size={17} strokeWidth={1.7} />}
        </span>
        {playing && <span className="office-jukebox-eq" aria-hidden><i /><i /><i /><i /></span>}
      </button>

      <div className="office-jukebox-copy">
        <div className="office-jukebox-head">
          <span className="office-jukebox-kicker">
            <i aria-hidden /> OFFICE BGM
          </span>
          {current?.provider === 'youtube' && <span className="office-jukebox-tag"><Youtube size={10} strokeWidth={1.8} /> YOUTUBE</span>}
          <span className="office-jukebox-source">点歌台同步</span>
        </div>
        <div className="office-jukebox-title">
          <strong data-jukebox-title>{current?.title ?? '办公室还没有背景音乐'}</strong>
          <span>{current ? current.artist || current.uploaderName || '来自共享曲库' : '去点歌台挑一首，办公室一起听'}</span>
        </div>
        <div className="office-jukebox-line">
          <div
            className="office-jukebox-progress"
            role="slider"
            tabIndex={0}
            aria-label="播放进度"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(player.position)}
            aria-valuetext={`${clock(player.position)} / ${clock(duration)}`}
            onClick={seek}
            onKeyDown={seek}
            data-jukebox-progress
          >
            <span style={{ width: `${percent}%` }} />
          </div>
          <span className="office-jukebox-time">{clock(player.position)} / {clock(duration)}</span>
        </div>
        {!playsInline && (
          <p className="office-jukebox-inline-hint">YouTube 曲目 · 点播放会在点歌台打开</p>
        )}
      </div>

      <div className="office-jukebox-controls">
        <button type="button" className="office-jukebox-skip ui-press" aria-label="上一首" onClick={() => playerPrevious(resolve)} data-jukebox-prev>
          <SkipBack size={15} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          className="office-jukebox-play ui-press"
          aria-label={playing ? '暂停' : playsInline ? '播放' : '在点歌台播放'}
          onClick={() => void toggle()}
          data-jukebox-play
          data-state={player.loading ? 'loading' : playing ? 'playing' : 'paused'}
        >
          {player.loading
            ? <LoaderCircle className="size-4 animate-spin" />
            : playing ? <Pause size={16} strokeWidth={1.9} fill="currentColor" /> : <Play size={16} strokeWidth={1.9} fill="currentColor" />}
        </button>
        <button type="button" className="office-jukebox-skip ui-press" aria-label="下一首" onClick={() => playerNext(resolve)} data-jukebox-next>
          <SkipForward size={15} strokeWidth={1.8} />
        </button>
      </div>

      <div className="office-jukebox-volume">
        <button type="button" className="office-jukebox-mute ui-press" aria-label={muted ? '取消静音' : '静音'} onClick={toggleMute} data-jukebox-mute>
          {muted || player.volume === 0 ? <VolumeX size={15} strokeWidth={1.8} /> : <Volume2 size={15} strokeWidth={1.8} />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : player.volume}
          aria-label="音量"
          onChange={(event) => changeVolume(Number(event.target.value))}
          data-jukebox-volume
        />
      </div>

      <button type="button" className="office-jukebox-open ui-press" onClick={onOpen} data-jukebox-open>
        点歌台 <ArrowUpRight size={12} strokeWidth={2} />
      </button>

      {player.error && current && <span className="office-jukebox-error" role="status" data-jukebox-error>{player.error}</span>}
      {!current && <span className="office-jukebox-hint">点歌台为空 · 去添加第一首</span>}
    </section>
  )
}

/** 让点歌台把当前曲目交给底栏（切回办公室时可以接着听）。 */
export function handOffToDock(track: JukeboxTrack | null, position = 0) {
  if (track) adoptTrack(track, position)
}
