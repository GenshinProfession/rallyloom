import type { Group } from 'three'
import type { ModelKit } from '../three/model'

export interface RoomSeat {
  /** Coordinates relative to the room, from 0 to 1. */
  x: number
  y: number
  facing?: 'north' | 'south'
}

export interface RoomFrame {
  x: number
  y: number
  width: number
  height: number
}

export const WALL_THICKNESS = 6
export type FloorMaterial = 'wood' | 'tile' | 'concrete' | 'quartz' | 'terrazzo'
export type WallFinish = 'solid' | 'glass' | 'open'

export interface RoomDoor {
  side: 'north' | 'east' | 'south' | 'west'
  /** Center of the opening along the wall, from 0 to 1. */
  offset: number
  /** Clear opening in floor plan units. */
  width: number
}

export interface RoomDoorway extends RoomDoor {
  start: number
  end: number
  center: { x: number; y: number }
  inside: { x: number; y: number }
  outside: { x: number; y: number }
}

export interface RoomBuildContext {
  group: Group
  model: ModelKit
  width: number
  depth: number
  seats: readonly RoomSeat[]
  doorway: RoomDoorway
}

export interface RoomTemplate {
  id: string
  floor: string
  accent: string
  material?: 'tile' | 'wood'
  display?: 'gmv'
  seats: readonly RoomSeat[]
  door: RoomDoor
  build: (context: RoomBuildContext) => void
}

export interface RoomPlacement {
  id: string
  name: string
  note?: string
  template: string
  frame: RoomFrame
  floor?: string
  floorMaterial?: FloorMaterial
  walls?: Partial<Record<RoomDoor['side'], WallFinish>>
  accent?: string
  seats?: readonly RoomSeat[]
  door?: RoomDoor
  workbench?: { linkedRoomIds?: readonly string[]; documentSpaces?: readonly string[] }
  useTemplateFurniture?: boolean
  furniture?: readonly FurniturePlacement[]
}

export type FurnitureKind = 'desk' | 'shelf' | 'plant' | 'sofa' | 'coffee' | 'lamp'

export interface FurniturePlacement {
  id: string
  kind: FurnitureKind
  /** Center in room coordinates, normalized to 0–1. */
  x: number
  y: number
  /** Clockwise rotation on the plan, in degrees. */
  rotation: number
  /** Desk dimensions in scene units, independent of room dimensions. */
  size?: { width: number; depth: number }
}

export interface OfficeLayout {
  width: number
  height: number
  rooms: readonly RoomPlacement[]
}

export interface ResolvedRoom extends RoomPlacement {
  appearance: RoomTemplate
  floor: string
  accent: string
  seats: readonly RoomSeat[]
  doorway: RoomDoorway
}

export function defineRoomTemplate(template: RoomTemplate): RoomTemplate {
  return template
}

export function defineOfficeLayout(layout: OfficeLayout): OfficeLayout {
  return layout
}

/** Returns world-plan coordinates. The 3D axes for these are X and Z. */
export function getRoomDoorway(frame: RoomFrame, door: RoomDoor): RoomDoorway {
  const { side, offset, width } = door
  const horizontal = side === 'north' || side === 'south'
  const wallLength = horizontal ? frame.width : frame.height
  const along = wallLength * offset
  const start = along - width / 2
  const end = along + width / 2
  if (
    !['north', 'east', 'south', 'west'].includes(side) ||
    !Number.isFinite(offset) || !Number.isFinite(width) || width <= 0 ||
    start < WALL_THICKNESS || end > wallLength - WALL_THICKNESS
  ) {
    throw new Error('门洞须位于一面墙内，并为两端墙角留出空间')
  }

  const normalX = side === 'west' ? -1 : side === 'east' ? 1 : 0
  const normalY = side === 'north' ? -1 : side === 'south' ? 1 : 0
  const center = {
    x: frame.x + (horizontal ? along : side === 'east' ? frame.width : 0),
    y: frame.y + (horizontal ? side === 'south' ? frame.height : 0 : along),
  }
  const clearance = WALL_THICKNESS * 1.5
  return {
    ...door,
    start,
    end,
    center,
    inside: { x: center.x - normalX * clearance, y: center.y - normalY * clearance },
    outside: { x: center.x + normalX * clearance, y: center.y + normalY * clearance },
  }
}

export function getRoomWallSegments(frame: RoomFrame, doorway: RoomDoorway) {
  const sides = ['north', 'east', 'south', 'west'] as const
  return sides.flatMap((side) => {
    const length = side === 'north' || side === 'south' ? frame.width : frame.height
    return side === doorway.side
      ? [{ side, start: 0, end: doorway.start }, { side, start: doorway.end, end: length }]
      : [{ side, start: 0, end: length }]
  })
}

export function resolveOfficeLayout(
  layout: OfficeLayout,
  templates: ReadonlyMap<string, RoomTemplate>,
): ResolvedRoom[] {
  const { width, height } = layout
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('办公室画布尺寸必须是正数')
  }

  const ids = new Set<string>()
  return layout.rooms.map((room) => {
    if (!room.id || ids.has(room.id)) throw new Error(`房间标识为空或重复：${room.id}`)
    ids.add(room.id)

    const appearance = templates.get(room.template)
    if (!appearance) throw new Error(`房间 ${room.id} 引用了未知模板 ${room.template}`)

    const frame = room.frame
    if (
      !frame || ![frame.x, frame.y, frame.width, frame.height].every(Number.isFinite) ||
      frame.x < 0 || frame.y < 0 || frame.width <= WALL_THICKNESS * 2 || frame.height <= WALL_THICKNESS * 2 ||
      frame.x + frame.width > width || frame.y + frame.height > height
    ) {
      throw new Error(`房间 ${room.id} 的位置或尺寸超出办公室画布`)
    }

    const seats = room.seats ?? appearance.seats
    if (seats.some(({ x, y }) => !(x >= 0 && x <= 1 && y >= 0 && y <= 1))) {
      throw new Error(`房间 ${room.id} 的工位坐标必须在 0 到 1 之间`)
    }
    const doorway = getRoomDoorway(frame, room.door ?? appearance.door)

    return {
      ...room,
      appearance,
      floor: room.floor ?? appearance.floor,
      accent: room.accent ?? appearance.accent,
      seats,
      doorway,
    }
  })
}
