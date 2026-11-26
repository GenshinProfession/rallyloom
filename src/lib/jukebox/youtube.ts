/**
 * YouTube IFrame Player API 的共用装载器。
 *
 * 点歌台（大舞台）与办公室底栏（后台播放）都需要 it，抽出来避免各自的 loader 打架：
 * 同一份 script、同一个全局 onYouTubeIframeAPIReady 回调链。
 */

export interface YoutubePlayer {
  destroy(): void
  playVideo(): void
  pauseVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  getCurrentTime(): number
  getDuration(): number
  getPlayerState(): number
  setVolume(volume: number): void
  mute(): void
  unMute(): void
}

export interface YoutubePlayerEvent { target: YoutubePlayer; data: number }

export interface YoutubeApi {
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number; CUED: number }
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
  interface Window { YT?: YoutubeApi; onYouTubeIframeAPIReady?: () => void }
}

let youtubeApiPromise: Promise<YoutubeApi> | undefined

export function loadYoutubeApi(): Promise<YoutubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (youtubeApiPromise) return youtubeApiPromise
  youtubeApiPromise = new Promise<YoutubeApi>((resolve, reject) => {
    let timer: number | undefined
    const previousReady = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.()
      if (timer) window.clearTimeout(timer)
      if (window.YT?.Player) resolve(window.YT)
      else reject(new Error('YouTube 播放器初始化失败'))
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
      reject(new Error('无法连接 YouTube 播放器'))
    }
    timer = window.setTimeout(() => {
      youtubeApiPromise = undefined
      reject(new Error('YouTube 播放器连接超时'))
    }, 15000)
  })
  return youtubeApiPromise
}
