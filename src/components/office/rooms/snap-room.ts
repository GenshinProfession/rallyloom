import type { RoomFrame, RoomPlacement } from './api'

export function snapRoom(frame: RoomFrame, rooms: readonly RoomPlacement[], excludeId: string | undefined, width: number, height: number): RoomFrame {
  const others = rooms.filter((room) => room.id !== excludeId)
  const xs = [0, width - frame.width]
  const ys = [0, height - frame.height]
  for (const { frame: other } of others) {
    if (frame.y < other.y + other.height && frame.y + frame.height > other.y)
      xs.push(other.x - frame.width, other.x + other.width, other.x, other.x + other.width - frame.width)
    if (frame.x < other.x + other.width && frame.x + frame.width > other.x)
      ys.push(other.y - frame.height, other.y + other.height, other.y, other.y + other.height - frame.height)
  }
  const nearest = (value: number, targets: number[], max: number) => {
    const found = targets.filter((target) => target >= 0 && target <= max)
      .sort((a, b) => Math.abs(a - value) - Math.abs(b - value))[0]
    return found !== undefined && Math.abs(found - value) <= 10 ? found : value
  }
  return { ...frame, x: nearest(frame.x, xs, width - frame.width), y: nearest(frame.y, ys, height - frame.height) }
}
