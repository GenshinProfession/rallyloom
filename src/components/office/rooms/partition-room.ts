import type { RoomFrame, RoomPlacement } from './api'
import { furnitureFits } from './placed-furniture'
import { furnitureSeats } from './template-furniture'

/** A partition divides one rectangular shell, preserving world positions and object sizes. */
export function partitionRoom(room: RoomPlacement, axis: 'horizontal' | 'vertical', coordinate: number, id: string): [RoomPlacement, RoomPlacement] {
  const f = room.frame
  const cut = Math.round(coordinate)
  const offset = axis === 'vertical' ? cut - f.x : cut - f.y
  const length = axis === 'vertical' ? f.width : f.height
  if (offset < 100 || length - offset < 100) throw new Error('隔墙两侧至少各留出 100 的空间。')
  const frames: RoomFrame[] = axis === 'vertical'
    ? [{ ...f, width: offset }, { ...f, x: cut, width: length - offset }]
    : [{ ...f, height: offset }, { ...f, y: cut, height: length - offset }]
  const furniture: NonNullable<RoomPlacement['furniture']>[number][][] = [[], []]
  for (const item of room.furniture ?? []) {
    const x = f.x + item.x * f.width, y = f.y + item.y * f.height
    const index = (axis === 'vertical' ? x : y) < cut ? 0 : 1, frame = frames[index]
    const next = { ...item, x: (x - frame.x) / frame.width, y: (y - frame.y) / frame.height }
    if (!furnitureFits(next, frame)) throw new Error('隔墙经过了家具，请先移动家具，或换一个位置划分。')
    furniture[index].push(next)
  }
  return frames.map((frame, index) => {
    const side = axis === 'vertical' ? index === 0 ? 'east' : 'west' : index === 0 ? 'south' : 'north'
    const walls = { ...room.walls, [side]: 'solid' as const }
    const next: RoomPlacement = { ...room, id: index ? id : room.id, name: index ? `${room.name} · 2` : room.name,
      frame, template: 'room-shell', useTemplateFurniture: false, furniture: furniture[index], walls,
      door: { side:index ? side : axis==='vertical'?'west':'north', offset: .5, width: 42 }, workbench: index ? undefined : room.workbench }
    return { ...next, seats: furnitureSeats(next) }
  }) as unknown as [RoomPlacement, RoomPlacement]
}
