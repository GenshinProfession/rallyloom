import type { ResolvedRoom, RoomDoor, WallFinish } from './api'

export interface WallRun {
  side: RoomDoor['side']
  start: number
  end: number
  finish: WallFinish
  shared: boolean
}
const opposite = { north: 'south', south: 'north', east: 'west', west: 'east' } as const
const EPSILON = .01

/** Adjacent rectangular areas share one physical partition and either area's doorway. */
export function sharedWallRuns(room: ResolvedRoom, rooms: readonly ResolvedRoom[]): WallRun[] {
  const result: WallRun[] = []
  for (const side of ['north', 'east', 'south', 'west'] as const) {
    const horizontal = side === 'north' || side === 'south'
    const { x, y, width, height } = room.frame
    const origin = horizontal ? x : y
    const length = horizontal ? width : height
    const line = horizontal ? y + (side === 'south' ? height : 0) : x + (side === 'east' ? width : 0)
    const adjacent = rooms.filter((other) => {
      if (other.id === room.id || other.template === 'empty') return false
      const f = other.frame
      const otherLine = horizontal ? f.y + (side === 'north' ? f.height : 0) : f.x + (side === 'west' ? f.width : 0)
      const start = horizontal ? f.x : f.y
      return Math.abs(line - otherLine) < EPSILON && start < origin + length && start + (horizontal ? f.width : f.height) > origin
    })
    const cuts = [0, length]
    const ownOpening = room.doorway.side === side ? room.doorway : undefined
    if (ownOpening) cuts.push(ownOpening.start, ownOpening.end)
    for (const other of adjacent) {
      const start = (horizontal ? other.frame.x : other.frame.y) - origin
      cuts.push(Math.max(0, start), Math.min(length, start + (horizontal ? other.frame.width : other.frame.height)))
      if (other.doorway.side === opposite[side]) {
        cuts.push(Math.max(0, Math.min(length, start + other.doorway.start)),
          Math.max(0, Math.min(length, start + other.doorway.end)))
      }
    }
    const sorted = [...new Set(cuts)].sort((a, b) => a - b)
    for (let i = 1; i < sorted.length; i++) {
      const start = sorted[i - 1], end = sorted[i], mid = (start + end) / 2
      if (end - start < EPSILON) continue
      const neighbor = adjacent.find((other) => {
        const offset = (horizontal ? other.frame.x : other.frame.y) - origin
        return mid > offset && mid < offset + (horizontal ? other.frame.width : other.frame.height)
      })
      // East/south owns a shared partition, west/north is rendered by the neighbor.
      if (neighbor && (side === 'west' || side === 'north')) continue
      const ownFinish = room.walls?.[side] ?? 'solid'
      const neighborFinish = neighbor?.walls?.[opposite[side]]
      if (ownFinish === 'open' || neighborFinish === 'open') continue
      if (ownOpening && mid > ownOpening.start && mid < ownOpening.end) continue
      if (neighbor?.doorway.side === opposite[side]) {
        const offset = (horizontal ? neighbor.frame.x : neighbor.frame.y) - origin
        if (mid > offset + neighbor.doorway.start && mid < offset + neighbor.doorway.end) continue
      }
      result.push({ side, start, end, finish: ownFinish === 'glass' || neighborFinish === 'glass' ? 'glass' : 'solid', shared: !!neighbor })
    }
  }
  return result
}
