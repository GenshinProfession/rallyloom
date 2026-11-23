import type { RoomFrame, FurnitureKind, FurniturePlacement } from './rooms/api'

export type FloorPoint = { x: number; y: number }
export type OfficeDragSource =
  | { kind: 'new-room'; template: string }
  | { kind: 'new-furniture'; model: FurnitureKind }
  | { kind: 'room'; roomId: string }
  | { kind: 'furniture'; roomId: string; id: string }

export type OfficePlacement =
  | { kind: 'room'; frame: RoomFrame; roomId?:string; valid: boolean }
  | { kind: 'furniture'; at: FloorPoint; roomId?: string; item?: FurniturePlacement; valid: boolean }

export const NEW_ROOM_SIZE = { width: 260, height: 200 }
