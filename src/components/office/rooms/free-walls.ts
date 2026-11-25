import type { OfficeLayout, PlanPoint, WallSegment } from './api'
import { onSegment } from './region-geometry'

export {
  MIN_WALL_LENGTH,
  WALL_SNAP_LABEL,
  danglingEndpoints,
  snapWallPoint,
  snapWallPointDetailed,
} from './wall-snap'
export type { WallGuide, WallSnapKind, WallSnapOptions, WallSnapResult } from './wall-snap'

type Point = PlanPoint
export const wallLength = (wall: Pick<WallSegment, 'start' | 'end'>) => Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y)
export function replaceWallSegment(walls: readonly WallSegment[], wall: WallSegment): WallSegment[] {
  const previous = walls.find((item) => item.id === wall.id)
  const joint = (point: Point) => {
    if (!previous || !onSegment(point, previous.start, previous.end, 1e-4)) return point
    const dx = previous.end.x - previous.start.x, dy = previous.end.y - previous.start.y, squared = dx * dx + dy * dy
    const t = squared ? ((point.x - previous.start.x) * dx + (point.y - previous.start.y) * dy) / squared : 0
    return { x: wall.start.x + t * (wall.end.x - wall.start.x), y: wall.start.y + t * (wall.end.y - wall.start.y) }
  }
  return walls.map((item) => {
    if (item.id === wall.id) return wall
    const start = joint(item.start), end = joint(item.end)
    return start === item.start && end === item.end ? item : { ...item, start, end }
  })
}
export function validateWallSegments(layout: OfficeLayout) {
  if (!Array.isArray(layout.wallSegments ?? []) || (layout.wallSegments?.length ?? 0) > 240) throw Error('最多可绘制 240 段墙。')
  const ids = new Set<string>()
  for (const wall of layout.wallSegments ?? []) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(wall.id) || ids.has(wall.id)) throw Error('墙段标识重复或为空。')
    ids.add(wall.id)
    for (const p of [wall.start, wall.end]) {
      if (!p || ![p.x, p.y].every(Number.isFinite) || p.x < 0 || p.y < 0 || p.x > layout.width || p.y > layout.height) throw Error('墙段端点超出画布。')
    }
    if (wallLength(wall) < 12 || !Number.isFinite(wall.thickness) || wall.thickness < 2 || wall.thickness > 24
      || !Number.isFinite(wall.height) || wall.height < 8 || wall.height > 100
      || !['solid', 'glass'].includes(wall.finish)) throw Error('墙段长度、厚度、高度或材质无效。')
    const door = wall.opening, length = wallLength(wall)
    if (door && (![door.width, door.offset].every(Number.isFinite) || door.width < 12 || door.offset * length - door.width / 2 < 6 || door.offset * length + door.width / 2 > length - 6)) throw Error('门洞两侧至少各保留 6 的墙体。')
  }
}
