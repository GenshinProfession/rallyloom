import { Group } from 'three'
import type { FurnitureKind, FurniturePlacement, RoomFrame } from './api'
import type { ModelKit } from '../three/model'
import { shelf, table } from './furniture'

export const FURNITURE = {
  desk: { label: '桌子', width: 60, depth: 36, height: 24 },
  shelf: { label: '置物架', width: 56, depth: 22, height: 44 },
  plant: { label: '绿植', width: 23, depth: 24, height: 38 },
  sofa: { label: '沙发', width: 75, depth: 32, height: 29 },
  coffee: { label: '咖啡机', width: 20, depth: 19, height: 28 },
  lamp: { label: '落地灯', width: 18, depth: 18, height: 48 },
} satisfies Record<FurnitureKind, { label: string; width: number; depth: number; height: number }>

function clearances(item: FurniturePlacement, room: RoomFrame) {
  const { width, depth } = FURNITURE[item.kind]
  const angle = item.rotation * Math.PI / 180
  const sin = Math.abs(Math.sin(angle)), cos = Math.abs(Math.cos(angle))
  return {
    x: (cos * width + sin * depth) / (2 * room.width),
    y: (sin * width + cos * depth) / (2 * room.height),
  }
}

export function fitFurniture(item: FurniturePlacement, room: RoomFrame): FurniturePlacement {
  const edge = clearances(item, room)
  return {
    ...item,
    x: Math.max(edge.x, Math.min(1 - edge.x, item.x)),
    y: Math.max(edge.y, Math.min(1 - edge.y, item.y)),
  }
}

export function furnitureFits(item: FurniturePlacement, room: RoomFrame) {
  const fitted = fitFurniture(item, room)
  return Math.abs(fitted.x - item.x) < 0.000001 && Math.abs(fitted.y - item.y) < 0.000001
}

export function buildPlacedFurniture(parent: Group, model: ModelKit, item: FurniturePlacement, frame: RoomFrame) {
  const object = new Group()
  object.position.set(item.x * frame.width, 0, item.y * frame.height)
  object.rotation.y = -item.rotation * Math.PI / 180
  parent.add(object)
  const { width, depth, height } = FURNITURE[item.kind]
  switch (item.kind) {
    case 'desk': table(object, model, 0, 0, width, depth); break
    case 'shelf': shelf(object, model, 0, 0, width, true); break
    default: model.asset(object, item.kind, 0, 0, 0, width, height, depth)
  }
  return object
}
