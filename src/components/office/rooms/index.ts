import type { RoomTemplate } from './api'

// Vite discovers room modules in this directory and its subdirectories.
const modules = import.meta.glob<RoomTemplate>('./**/*.room.ts', { eager: true, import: 'default' })
const templates = new Map<string, RoomTemplate>()

for (const [path, template] of Object.entries(modules)) {
  if (!template?.id || templates.has(template.id) || typeof template.build !== 'function' || !template.door) {
    throw new Error(`房间模板缺少有效定义，或 ID 重复：${path}`)
  }
  templates.set(template.id, template)
}

export const roomTemplates: ReadonlyMap<string, RoomTemplate> = templates
export { defineOfficeLayout, defineRoomTemplate, getRoomDoorway, getRoomWallSegments, resolveOfficeLayout } from './api'
export type { OfficeLayout, RoomBuildContext, RoomDoor, RoomDoorway, RoomPlacement, RoomSeat, RoomTemplate } from './api'
