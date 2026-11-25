import type { JukeboxConfig } from './types'

/**
 * 演示模式的内置歌单。
 *
 * 曲目全部指向公开示例视频（MP4 / 少量 WebM），用来验证播放器与排队逻辑；
 * 真实部署时这些内容由企业提供方通过 bootstrap 的 `jukebox` 字段下发，
 * 企业把自己找到的 MP4 放进自己的对象存储（HTTPS + 支持 Range 即可）再填到歌单里。
 */
export function demoJukebox(): JukeboxConfig {
  return {
    note: '演示歌单：曲目为公开示例视频。企业接入后由提供方下发自有 MP4 歌单（接入规范 §13）。',
    playlists: [
      {
        id: 'party',
        name: '团建金曲',
        description: '会议室、茶水间的背景屏可以循环播放',
        tracks: [
          {
            id: 'flower',
            title: '花之舞 · 示例片段',
            artist: 'MDN 示例素材',
            url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
            duration: 14,
            attrs: { 场景: '暖场' },
          },
          {
            id: 'sintel',
            title: 'Sintel · 预告片',
            artist: 'Blender 基金会',
            url: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
            poster: 'https://media.w3.org/2010/05/sintel/poster.png',
            duration: 52,
            attrs: { 场景: '暖场', 类型: '短片' },
          },
          {
            id: 'bunny',
            title: 'Big Buck Bunny · 预告片',
            artist: 'Blender 基金会',
            url: 'https://media.w3.org/2010/05/bunny/trailer.mp4',
            poster: 'https://media.w3.org/2010/05/bunny/poster.png',
            duration: 33,
            attrs: { 场景: '气氛' },
          },
        ],
      },
      {
        id: 'focus',
        name: '轻音乐',
        description: '工作时段低音量播放',
        tracks: [
          {
            id: 'movie',
            title: '示例影片片段',
            artist: 'W3C 示例素材',
            url: 'https://media.w3.org/2010/05/video/movie_300.mp4',
            duration: 28,
            attrs: { 场景: '专注' },
          },
        ],
      },
      {
        id: 'welcome',
        name: '客户接待',
        description: '前台与洽谈室循环',
        tracks: [
          {
            id: 'trailer-sintel',
            title: 'Sintel · 正片片段',
            artist: 'Blender 基金会',
            url: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
            duration: 52,
            attrs: { 场景: '接待' },
          },
        ],
      },
    ],
  }
}
