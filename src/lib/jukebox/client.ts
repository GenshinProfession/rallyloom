import { oa } from '@/lib/oa/clients'
import type { JukeboxClient, JukeboxFeed, JukeboxTrack } from './types'

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let offset = 0; offset < binary.length; offset += 1) bytes[offset] = binary.charCodeAt(offset)
  return bytes
}

/** Authenticated Rallyloom provider adapter. Access tokens stay in Electron's main process. */
export class OaJukeboxClient implements JukeboxClient {
  constructor(private readonly scope?: string) {}

  async list() {
    const value = await oa<JukeboxFeed>('GET', '/jukebox', undefined, this.scope)
    if (!value || !Array.isArray(value.tracks) || typeof value.day !== 'string')
      throw new Error('Mira 返回了无效的共享曲库。')
    return value
  }

  async submit(file: File, title: string) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    return oa<JukeboxTrack>('POST', '/jukebox/tracks', { fileName: file.name, title, bytes }, this.scope)
  }

  async media(id: string) {
    const value = await oa<{ base64: string; contentType?: string }>('GET', `/jukebox/media/${encodeURIComponent(id)}`, undefined, this.scope)
    return new Blob([decodeBase64(value.base64) as unknown as BlobPart], { type: value.contentType || 'video/mp4' })
  }

  async remove(id: string) {
    await oa('DELETE', `/jukebox/tracks/${encodeURIComponent(id)}`, undefined, this.scope)
  }
}
