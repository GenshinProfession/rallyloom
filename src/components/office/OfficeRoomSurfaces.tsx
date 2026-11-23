import { useState } from 'react'
import { DoorOpen, Layers3 } from 'lucide-react'
import { OFFICE_FLOORS } from './office-assets'
import { roomTemplates } from './rooms'
import { WALL_THICKNESS, type FloorMaterial, type RoomDoor, type RoomPlacement, type WallFinish } from './rooms/api'

const sides = { north: '上侧', east: '右侧', south: '下侧', west: '左侧' } as const

export function OfficeRoomSurfaces({ room, disabled, onUpdate }: {
  room?: RoomPlacement
  disabled: boolean
  onUpdate: (update: (room: RoomPlacement) => RoomPlacement) => void
}) {
  const [side, setSide] = useState<RoomDoor['side']>(room?.door?.side ?? roomTemplates.get(room?.template ?? '')?.door?.side ?? 'south')
  if (!room) return null
  const door = room.door ?? roomTemplates.get(room.template)?.door
  const finish = room.walls?.[side] ?? 'solid'
  const wallLength = (edge: RoomDoor['side']) => edge === 'east' || edge === 'west' ? room.frame.height : room.frame.width
  function changeDoor(next: RoomDoor) {
    const length = wallLength(next.side)
    const width = Math.max(1, Math.min(next.width, length - 2 * WALL_THICKNESS - 2))
    const margin = (width / 2 + WALL_THICKNESS + .5) / length
    const offset = Math.max(margin, Math.min(1 - margin, next.offset))
    onUpdate((current) => ({ ...current, door: { side: next.side, width, offset } }))
  }
  const updateFloor = (material?: FloorMaterial) => onUpdate((current) => {
    if (material) return { ...current, floorMaterial: material, floor: OFFICE_FLOORS[material].color }
    const { floorMaterial: _material, floor: _floor, ...rest } = current
    return rest
  })
  return <div className="office-room-surfaces" aria-label={'房间设置 ' + room.name}>
    <h3><Layers3 size={14} />地板材质</h3>
    <div className="office-floor-options" role="group" aria-label="地板材质">
      <button type="button" disabled={disabled} aria-pressed={!room.floorMaterial} onClick={() => updateFloor()}><i className="floor-default" />模板默认</button>
      {Object.entries(OFFICE_FLOORS).map(([id, floor]) => <button type="button" key={id} disabled={disabled} aria-pressed={room.floorMaterial === id} onClick={() => updateFloor(id as FloorMaterial)}>
        <i data-floor={id} style={{ backgroundColor: floor.color }} />{floor.label}
      </button>)}
    </div>
    {!room.boundary && room.template !== 'empty' && <>
      <h3><DoorOpen size={14} />墙与出入口</h3>
      <p>点选四周的墙，设置隔墙或移动出入口。</p>
      <div className="office-wall-plan" role="group" aria-label="选择要编辑的墙">
        <span className="office-wall-center">{room.name}<small>{door ? '门在' + sides[door.side] : '暂无出入口'}</small></span>
        {Object.entries(sides).map(([id, label]) => <button key={id} type="button" data-side={id} disabled={disabled} aria-label={'选择' + label + '墙'} aria-pressed={side === id} onClick={() => setSide(id as RoomDoor['side'])}>
          {label}墙{door?.side === id && <DoorOpen size={13} aria-label="当前出入口" />}
        </button>)}
      </div>
      <h4>{sides[side]}墙</h4>
      <div className="office-wall-finishes" role="group" aria-label={sides[side] + '墙材质'}>
        {([['solid', '实体墙'], ['glass', '玻璃墙'], ['open', '开放连通']] as const).map(([value, label]) => <button type="button" key={value} disabled={disabled} aria-pressed={finish === value} onClick={() => onUpdate((current) => ({ ...current, walls: { ...current.walls, [side]: value as WallFinish } }))}>{label}</button>)}
      </div>
      {finish === 'open' ? <p>此侧完全开放，无需设置门洞。</p> : door?.side !== side ? <button type="button" disabled={disabled} onClick={() => changeDoor({ side, width: door?.width ?? 42, offset: .5 })}><DoorOpen size={14} />将出入口移到此墙</button> : <div className="office-door-sliders">
        <label>门的位置 <input type="range" aria-label="门的位置" min={0} max={100} value={Math.round(door.offset * 100)} disabled={disabled} onChange={(event) => changeDoor({ ...door, offset: Number(event.target.value) / 100 })} /></label>
        <div className="office-door-presets">{([['靠左 / 上', .2], ['居中', .5], ['靠右 / 下', .8]] as const).map(([label, offset]) => <button type="button" key={label} disabled={disabled} onClick={() => changeDoor({ ...door, offset })}>{label}</button>)}</div>
        <label>门洞宽度 <input type="number" aria-label="门洞宽度" min={1} max={wallLength(side) - 2 * WALL_THICKNESS - 2} value={door.width} disabled={disabled} onChange={(event) => { if (Number.isFinite(event.target.valueAsNumber)) changeDoor({ ...door, width: event.target.valueAsNumber }) }} /></label>
      </div>}
    </>}
  </div>
}
