import { DoorOpen, Layers3 } from 'lucide-react'
import { OFFICE_FLOORS } from './office-assets'
import { roomTemplates } from './rooms'
import { WALL_THICKNESS, type FloorMaterial, type RoomDoor, type RoomPlacement } from './rooms/api'

const sides = { north: '上侧', east: '右侧', south: '下侧', west: '左侧' } as const

export function OfficeRoomSurfaces({ room, disabled, onUpdate }: {
  room?: RoomPlacement
  disabled: boolean
  onUpdate: (update: (room: RoomPlacement) => RoomPlacement) => void
}) {
  if (!room) return <p className="office-room-tools-empty">点选场景里的房间，即可调整地板材质和出入口。</p>
  const door = room.door ?? roomTemplates.get(room.template)?.door
  const wallLength = (side: RoomDoor['side']) => side === 'east' || side === 'west' ? room.frame.height : room.frame.width
  function changeDoor(next: RoomDoor) {
    const length = wallLength(next.side)
    const width = Math.max(1, Math.min(next.width, length - 2 * WALL_THICKNESS - 2))
    const margin = (width / 2 + WALL_THICKNESS + .5) / length
    const offset = Math.max(margin, Math.min(1 - margin, next.offset))
    onUpdate((current) => ({ ...current, door: { side: next.side, width, offset } }))
  }
  return <div className="office-room-tools" aria-label={'房间设置 ' + room.name}>
    <strong title={room.name}>{room.name}</strong>
    <label><Layers3 size={15} aria-hidden="true" />地板材质
      <select aria-label="地板材质" disabled={disabled} value={room.floorMaterial ?? ''} onChange={(event) => {
        const material = event.target.value as FloorMaterial
        onUpdate((current) => {
          if (material) return { ...current, floorMaterial: material, floor: OFFICE_FLOORS[material].color }
          const { floorMaterial, floor, ...rest } = current
          return floorMaterial ? rest : current
        })
      }}>
        <option value="">模板默认</option>
        {Object.entries(OFFICE_FLOORS).map(([id, floor]) => <option key={id} value={id}>{floor.label}</option>)}
      </select>
      {room.floorMaterial && <i className="office-floor-swatch" style={{ backgroundColor: OFFICE_FLOORS[room.floorMaterial].color }} />}
    </label>
    {door && room.template !== 'empty' && <div className="office-door-controls" role="group" aria-label="房间出入口">
      <label><DoorOpen size={15} aria-hidden="true" />出入口
        <select aria-label="门洞所在墙" disabled={disabled} value={door.side}
          onChange={(event) => changeDoor({ ...door, side: event.target.value as RoomDoor['side'] })}>
          {Object.entries(sides).map(([id, label]) => <option key={id} value={id}>{label}墙</option>)}
        </select>
      </label>
      <label>位置 %
        <input type="number" aria-label="门洞位置百分比" min={0} max={100} defaultValue={Math.round(door.offset * 100)}
          key={room.id + door.side + door.offset} disabled={disabled}
          onBlur={(event) => {
            const value = event.currentTarget.valueAsNumber
            if (Number.isFinite(value) && value !== Math.round(door.offset * 100)) changeDoor({ ...door, offset: value / 100 })
            event.currentTarget.value = String(Math.round(door.offset * 100))
          }}
          onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} />
      </label>
      <label>门宽
        <input type="number" aria-label="门洞宽度" min={1} max={wallLength(door.side) - 2 * WALL_THICKNESS - 2}
          defaultValue={door.width} key={room.id + door.side + door.width} disabled={disabled}
          onBlur={(event) => {
            const value = event.currentTarget.valueAsNumber
            if (Number.isFinite(value) && value !== door.width) changeDoor({ ...door, width: value })
            event.currentTarget.value = String(door.width)
          }}
          onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} />
      </label>
    </div>}
  </div>
}
