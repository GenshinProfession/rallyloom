import * as THREE from 'three'
import type { FurniturePlacement, RoomFrame } from '../rooms/api'
import type { ModelKit } from './model'

const CANVAS_WIDTH = 1024
const CANVAS_HEIGHT = 576
const FONT = '"Inter Variable", "Noto Sans SC Variable", "Segoe UI", sans-serif'

/**
 * 数据显示屏：文字内容完全来自数据源（看板插槽的 SlotRow 行），
 * 字号按行数自适应 —— 行数越少字越大，行数多则自动缩排。
 */
function paintScreen(lines: readonly string[]) {
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_WIDTH
  canvas.height = CANVAS_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const background = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  background.addColorStop(0, '#0b1626')
  background.addColorStop(1, '#111f31')
  ctx.fillStyle = background
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  ctx.strokeStyle = 'rgba(120,170,255,.22)'
  ctx.lineWidth = 3
  ctx.strokeRect(9, 9, CANVAS_WIDTH - 18, CANVAS_HEIGHT - 18)
  ctx.fillStyle = 'rgba(132,173,222,.85)'
  ctx.font = `600 26px ${FONT}`
  ctx.fillText('数据看板 · 实时', 44, 64)
  ctx.fillStyle = 'rgba(120,170,255,.28)'
  ctx.fillRect(44, 84, CANVAS_WIDTH - 88, 2)
  const rows = lines.slice(0, 5)
  if (!rows.length) {
    ctx.fillStyle = '#eef4fd'
    ctx.font = `600 46px ${FONT}`
    ctx.fillText('尚未接入数据来源', 44, 250)
    ctx.fillStyle = 'rgba(198,214,234,.66)'
    ctx.font = `400 24px ${FONT}`
    ctx.fillText('在「编辑办公室 → 房间属性」里给这间房挂载看板数据，', 44, 314)
    ctx.fillText('屏幕上的文字与字号会随数据自动排版。', 44, 352)
    return canvas
  }
  const size = rows.length === 1 ? 118 : rows.length === 2 ? 92 : rows.length === 3 ? 70 : rows.length === 4 ? 58 : 48
  let y = 168
  for (const row of rows) {
    const parts = row.split(/\s{2,}/)
    const label = parts.length > 1 ? parts[0] : ''
    const value = parts.length > 1 ? parts.slice(1).join('  ') : row
    if (label) {
      ctx.fillStyle = 'rgba(176,198,222,.82)'
      ctx.font = `500 ${Math.round(size * 0.44)}px ${FONT}`
      ctx.fillText(label, 44, y)
    }
    ctx.fillStyle = /^[+-]/.test(value.trim()) ? (/^-/.test(value.trim()) ? '#f3a293' : '#8fe0b0') : '#f5f9ff'
    ctx.font = `700 ${size}px ${FONT}`
    ctx.fillText(value, 44, y + size * 0.92)
    y += size * 0.92 + 34
    if (y > CANVAS_HEIGHT - 40) break
  }
  return canvas
}

export function buildDataScreen(
  parent: THREE.Group,
  model: ModelKit,
  item: FurniturePlacement,
  frame: RoomFrame,
  lines: readonly string[],
) {
  const width = item.size?.width ?? 200
  const height = item.size?.height ?? 112
  const depth = item.size?.depth ?? 8
  const object = new THREE.Group()
  object.position.set(item.x * frame.width, item.elevation ?? 0, item.y * frame.height)
  object.rotation.y = -item.rotation * Math.PI / 180
  parent.add(object)
  const bottom = 12
  model.box(object, 0, bottom + height / 2, 0, width, height, depth, '#1a222c')
  model.box(object, 0, bottom + height / 2, depth * .04, width - 9, height - 9, Math.max(1.4, depth * .3), '#0a1018')
  const texture = new THREE.CanvasTexture(paintScreen(lines))
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(width - 12, height - 12),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
  )
  panel.position.set(0, bottom + height / 2, depth / 2 + .8)
  panel.renderOrder = 2
  object.add(panel)
  model.box(object, 0, bottom / 2, 0, 18, bottom, 12, '#232c38')
  return object
}
