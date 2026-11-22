import { Box3, Mesh, type Object3D } from 'three'
import type { RoomFrame } from '../rooms/api'

export interface WalkPoint {
  x: number
  z: number
}

const STEP = 5
const RADIUS = 5.25

export function createWalkGrid(width: number, depth: number, solids: readonly Object3D[]) {
  const columns = Math.floor(width / STEP) + 1
  const rows = Math.floor(depth / STEP) + 1
  const blocked = new Uint8Array(columns * rows)
  const bounds = new Box3()
  const boxes: { minX: number; maxX: number; minZ: number; maxZ: number }[] = []
  const pointAt = (index: number): WalkPoint => ({
    x: (index % columns) * STEP,
    z: Math.floor(index / columns) * STEP,
  })

  for (const solid of solids) {
    solid.updateWorldMatrix(true, true)
    solid.traverse((part) => {
      if (!(part instanceof Mesh)) return
      bounds.setFromObject(part)
      if (bounds.max.y <= 1.2 || bounds.min.y >= 27) return
      boxes.push({
        minX: bounds.min.x - RADIUS, maxX: bounds.max.x + RADIUS,
        minZ: bounds.min.z - RADIUS, maxZ: bounds.max.z + RADIUS,
      })
    })
  }

  for (const { minX, maxX, minZ, maxZ } of boxes) {
    const left = Math.max(0, Math.ceil(minX / STEP))
    const right = Math.min(columns - 1, Math.floor(maxX / STEP))
    if (right < left) continue
    for (let row = Math.max(0, Math.ceil(minZ / STEP)); row <= Math.min(rows - 1, Math.floor(maxZ / STEP)); row++) {
      blocked.fill(1, row * columns + left, row * columns + right + 1)
    }
  }
  for (let index = 0; index < blocked.length; index++) {
    const { x, z } = pointAt(index)
    if (x < RADIUS || z < RADIUS || x > width - RADIUS || z > depth - RADIUS) blocked[index] = 1
  }

  function clearLine(from: WalkPoint, to: WalkPoint) {
    const dx = to.x - from.x
    const dz = to.z - from.z
    return !boxes.some(({ minX, maxX, minZ, maxZ }) => {
      if (!dx && (from.x < minX || from.x > maxX)) return false
      if (!dz && (from.z < minZ || from.z > maxZ)) return false
      const x1 = dx ? (minX - from.x) / dx : -Infinity
      const x2 = dx ? (maxX - from.x) / dx : Infinity
      const z1 = dz ? (minZ - from.z) / dz : -Infinity
      const z2 = dz ? (maxZ - from.z) / dz : Infinity
      return Math.max(0, Math.min(x1, x2), Math.min(z1, z2)) <= Math.min(1, Math.max(x1, x2), Math.max(z1, z2))
    })
  }

  function nearest(point: WalkPoint, inside?: RoomFrame, requireClearLine = false) {
    const col = Math.round(point.x / STEP)
    const row = Math.round(point.z / STEP)
    let closest = -1
    let bestDistance = Infinity

    for (let y = Math.max(0, row - 18); y <= Math.min(rows - 1, row + 18); y++) {
      for (let x = Math.max(0, col - 18); x <= Math.min(columns - 1, col + 18); x++) {
        const index = y * columns + x
        if (blocked[index]) continue
        const candidate = pointAt(index)
        if (inside && (
          candidate.x <= inside.x + RADIUS || candidate.x >= inside.x + inside.width - RADIUS ||
          candidate.z <= inside.y + RADIUS || candidate.z >= inside.y + inside.height - RADIUS
        )) continue
        const distance = (point.x - candidate.x) ** 2 + (point.z - candidate.z) ** 2
        if (distance >= bestDistance || (requireClearLine && !clearLine(point, candidate))) continue
        bestDistance = distance
        closest = index
      }
    }
    return closest
  }

  return {
    spawn(point: WalkPoint, room: RoomFrame): WalkPoint | null {
      const index = nearest(point, room)
      return index === -1 ? null : pointAt(index)
    },
    route(from: WalkPoint, to: WalkPoint, room?: RoomFrame): WalkPoint[] | null {
      const start = nearest(from, undefined, true)
      const end = nearest(to, room)
      if (start === -1 || end === -1) return null
      const target = pointAt(end)
      if (clearLine(from, target)) return [target]

      const previous = new Int32Array(blocked.length).fill(-1)
      const queue = new Int32Array(blocked.length)
      queue[0] = start
      previous[start] = start
      let size = 1
      for (let head = 0; head < size && previous[end] === -1; head++) {
        const cell = queue[head]
        const column = cell % columns
        for (const next of [
          column > 0 ? cell - 1 : -1,
          column < columns - 1 ? cell + 1 : -1,
          cell - columns,
          cell + columns,
        ]) {
          if (next < 0 || next >= blocked.length || blocked[next] || previous[next] !== -1) continue
          previous[next] = cell
          queue[size++] = next
        }
      }
      if (previous[end] === -1) return null

      const path = [target]
      for (let cell = end; cell !== start;) {
        cell = previous[cell]
        path.push(pointAt(cell))
      }
      path.reverse()

      const waypoints: WalkPoint[] = []
      let anchor = from
      for (let index = 1; index < path.length; index++) {
        if (!clearLine(anchor, path[index])) {
          anchor = path[index - 1]
          waypoints.push(anchor)
        }
      }
      waypoints.push(target)
      return waypoints
    },
  }
}
