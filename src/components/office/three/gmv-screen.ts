import { CanvasTexture, Group, LinearFilter, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Vector3 } from 'three'
import type { ModelKit } from './model'

export interface GmvDisplay { roomId: string; value?: string; delta?: string; status: string }

export function buildGmvScreen(parent: Group, model: ModelKit, width: number, depth: number) {
  const group = new Group()
  const displayWidth = Math.min(width * .62, 320)
  const displayHeight = Math.min(displayWidth * .229, depth * .32)
  const z = Math.min(41, depth * .23)
  group.position.set(width / 2, displayHeight * .46 + 16, z)
  group.rotation.x = -.48
  parent.add(group)
  model.softBox(parent, width / 2, 0, z + 8, displayWidth + 21, 11, 34, '#ac9375')
  model.softBox(parent, width / 2, 10.8, z + 8, displayWidth + 22, 2.6, 35, '#d8c2a5')
  for (const offset of [-.25, .25]) {
    model.box(parent, width / 2 + displayWidth * offset, 12, z + displayHeight * .20 + 2, 5, 11, 8, '#55605a')
  }
  model.softBox(group, 0, -displayHeight / 2 - 4.1, -.8, displayWidth + 12, displayHeight + 8.2, 5.7, '#bb9f7d')
  model.softBox(group, 0, -displayHeight / 2 - 1.4, 2.5, displayWidth + 3.5, displayHeight + 2.8, 2.5, '#434c48')
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearFilter
  const face = new Mesh(new PlaneGeometry(displayWidth, displayHeight), new MeshBasicMaterial({ map: texture, toneMapped: false }))
  face.position.z = 3.8
  group.add(face)
  let last: GmvDisplay | undefined

  function draw(data?: GmvDisplay) {
    if (data && data.value === last?.value && data.delta === last?.delta && data.status === last?.status) return
    if (!data && last === undefined && texture.version > 1) return
    last = data
    ctx.fillStyle = '#26383c'
    ctx.fillRect(0, 0, 1024, 256)
    ctx.fillStyle = '#34474a'
    ctx.fillRect(750, 0, 274, 256)
    ctx.fillStyle = '#99bba9'
    ctx.fillRect(0, 0, 1024, 4)
    ctx.fillStyle = '#dae8e1'
    ctx.font = '600 48px "Segoe UI", "Microsoft YaHei", sans-serif'
    ctx.fillText('今日 GMV', 46, 77)
    ctx.fillStyle = '#f2f5f0'
    ctx.font = '600 108px "Segoe UI", "Microsoft YaHei", sans-serif'
    ctx.fillText(data?.value ?? '—', 46, 200, 668)
    ctx.fillStyle = '#c6d9d0'
    ctx.font = '500 34px "Segoe UI", "Microsoft YaHei", sans-serif'
    ctx.fillText(data?.status ?? '等待数据', 782, 77, 210)
    if (data?.delta) {
      ctx.fillStyle = data.delta.startsWith('-') ? '#edb5a5' : '#aad8c4'
      ctx.font = '600 50px "Segoe UI", sans-serif'
      ctx.fillText(data.delta, 782, 169, 202)
    }
    texture.needsUpdate = true
  }
  draw()
  const topLeft = new Vector3(-displayWidth / 2, displayHeight / 2, 3.8)
  const bottomRight = new Vector3(displayWidth / 2, -displayHeight / 2, 3.8)
  return { group, topLeft, bottomRight, draw, dispose: () => texture.dispose() }
}
