import { X, Upload, Layers3, Box, RotateCw, Copy, Trash2, SlidersHorizontal, Plus, BetweenHorizontalStart, MousePointer2, PenLine, Undo2, Maximize, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WorkspaceHeader } from '@/components/ui/workspace-header'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { LayoutState } from '@/lib/store/types'
import { OfficeAssetLibrary } from './OfficeAssetLibrary'
import type { OfficeResizeTarget } from './OfficeResizeHandle'
import { OfficeScene, type OfficeSceneControls } from './OfficeScene'
import {OfficeWallInspector} from './OfficeWallInspector'
import {validateWallSegments,replaceWallSegment} from './rooms/free-walls'
import { OfficeRoomSurfaces } from './OfficeRoomSurfaces'
import { partitionRoom } from './rooms/partition-room'
import { snapRoom } from './rooms/snap-room'
import { getRoomDoorway, resolveOfficeLayout, roomTemplates, type RoomPlacement } from './rooms'
import type { FurnitureKind, RoomFrame, WallSegment } from './rooms/api'
import { materializeRoom, furnitureSeats, resizeRoomContents } from './rooms/template-furniture'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FURNITURE, fitFurniture, furnitureFits, furnitureSize } from './rooms/placed-furniture'
import { OFFICE_TEMPLATES } from './office-assets'
import { NEW_ROOM_SIZE, type FloorPoint, type OfficeDragSource, type OfficePlacement } from './office-drag'
import './office-editor.css'

const emptyRoster = new Map()
const frames = { x: '横坐标', y: '纵坐标', width: '宽度', height: '高度' } as const
const intersects = (a: RoomFrame, b: RoomFrame) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
function deskGrid(frame: RoomFrame) {
  const columns = Math.max(0, Math.floor(frame.width / 78))
  const rows = Math.max(0, Math.floor(frame.height / 78))
  return Array.from({ length: Math.min(columns * rows, 60) }, (_, index) => ({
    x: (index % columns + .5) / columns,
    y: (Math.floor(index / columns) + .82) / rows,
  }))
}
export function OfficeLayoutEditor({ layout, onPublish, onClose }: {
  layout: LayoutState
  onPublish: (draft: LayoutState) => Promise<void>
  onClose: () => void
}) {
  const [draft, setDraft] = useState(() => ({...layout,rooms:layout.rooms.map(room=>materializeRoom(room,roomTemplates.get(room.template)!))}))
  const [inspector, setInspector] = useState<'properties' | 'assets'>('assets')
  const [selection, setSelection] = useState<string>()
  const [furnitureSelection, setFurnitureSelection] = useState<string>()
  const [sceneZoom, setSceneZoom] = useState(100)
  const inspectorPanel = useRef<HTMLElement>(null)
  useEffect(() => { inspectorPanel.current?.scrollTo(0, 0) }, [selection, furnitureSelection, inspector])
  const sceneControls = useRef<OfficeSceneControls>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [confirmEmpty, setConfirmEmpty] = useState(false)
  const [tool,setTool] = useState<'select'|'wall'|'split'>('select')
  const wallTool=tool==='split'
  const [wallSelection,setWallSelection]=useState<string>()
  const selectedWall=draft.wallSegments?.find(wall=>wall.id===wallSelection)
  const selected = draft.rooms.find((room) => room.id === selection)
  const selectedItem = selected?.furniture?.find((item) => item.id === furnitureSelection)
  const workstationGrid = selected ? deskGrid(selected.frame) : null
  const validation = useMemo(() => {
    let rooms: ReturnType<typeof resolveOfficeLayout> = []
    try {
      if (draft.width < 500 || draft.height < 300 || draft.width > 4000 || draft.height > 4000)
        throw new Error('画布宽度须为 500 至 4000，高度须为 300 至 4000。')
      validateWallSegments(draft)
      rooms = resolveOfficeLayout(draft, roomTemplates)
      for (const [index, room] of draft.rooms.entries()) {
        if (!room.name.trim()) throw new Error('请填写所有房间名称。')
        if (room.frame.width < 100 || room.frame.height < 100) throw new Error('房间最小为 100 × 100。')
        if (draft.rooms.slice(0, index).some((other) => intersects(other.frame, room.frame)))
          throw new Error(`「${room.name}」与其他房间重叠。`)
        if (room.furniture?.some((item) => !furnitureFits(item, room.frame)))
          throw new Error(`「${room.name}」有家具超出房间边界。`)
      }
      return { rooms, error: '' }
    } catch (error) {
      return { rooms, error: error instanceof Error ? error.message : '布局无效。' }
    }
  }, [draft])

  const publishedAssignments = useMemo(() => {
    const remaining = new Map(validation.rooms.map((room) => [room.id, room.seats.length]))
    return Object.fromEntries(Object.entries(layout.assignments).filter(([, roomId]) => {
      const available = remaining.get(roomId) ?? 0
      if (available <= 0) return false
      remaining.set(roomId, available - 1)
      return true
    }))
  }, [layout.assignments, validation.rooms])
  const assignmentsReleased = Object.keys(layout.assignments).length - Object.keys(publishedAssignments).length

  useEffect(()=>{const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setTool('select')};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape)},[])
  function drawPartition(start:FloorPoint,end:FloorPoint){
    if(busy||draft.rooms.length>=80)return
    const room=roomAt(start) ?? (draft.rooms.length===0?{id:crypto.randomUUID(),name:'办公室',template:'room-shell',frame:{x:0,y:0,width:draft.width,height:draft.height},furniture:[],useTemplateFurniture:false}:undefined)
    if(!room){setMessage('请从一个房间内部开始划分隔墙。');return}
    const axis=Math.abs(end.x-start.x)>Math.abs(end.y-start.y)?'horizontal':'vertical'
    try {
      const appearance=validation.rooms.find(candidate=>candidate.id===room.id)
      const parts=partitionRoom({...room,floor:room.floor??appearance?.floor,accent:room.accent??appearance?.accent},axis,axis==='vertical'?start.x:start.y,crypto.randomUUID())
      setDraft(current=>({...current,rooms:current.rooms.length?current.rooms.flatMap(candidate=>candidate.id===room.id?parts:[candidate]):parts}))
      selectRoom(parts[1].id);setMessage('')
    }catch(error){setMessage(error instanceof Error?error.message:'无法划分这个房间。')}
  }

  function selectFreeWall(id:string){setWallSelection(id);setFurnitureSelection(undefined);setInspector('properties')}
  function changeFreeWall(wall:WallSegment,add:boolean){
    if(busy)return false
    try{
      const wallSegments=add?[...(draft.wallSegments??[]),wall]:replaceWallSegment(draft.wallSegments??[],wall)
      const next={...draft,wallSegments}
      validateWallSegments(next)
      if(!next.rooms.length)next.rooms=[{id:crypto.randomUUID(),name:'开放办公区',template:'room-shell',frame:{x:0,y:0,width:next.width,height:next.height},walls:{north:'open',east:'open',south:'open',west:'open'},floorMaterial:'quartz',floor:'#eeebe3',useTemplateFurniture:false,seats:[],furniture:[]}]
      setDraft(next);selectFreeWall(wall.id);setMessage('');return true
    }catch(error){setMessage(error instanceof Error?error.message:'墙段无效。');return false}
  }
  function addFreeWall(wall:WallSegment){return changeFreeWall(wall,true)}
  function updateFreeWall(wall:WallSegment){changeFreeWall(wall,false)}

  function updateRoom(id: string, update: (room: RoomPlacement) => RoomPlacement) {
    setDraft((current) => ({ ...current, rooms: current.rooms.map((room) => room.id === id ? (()=>{const next=update(room);return next.useTemplateFurniture===false?{...next,seats:furnitureSeats(next)}:next})() : room) }))
  }

  function selectRoom(id: string | undefined) {
    setWallSelection(undefined)
    setSelection(id)
    if (id) setInspector('properties')
    setFurnitureSelection(undefined)
  }

  function changeDeskCount(room: RoomPlacement, count: number) {
    const seats = deskGrid(room.frame)
    if (!Number.isInteger(count) || count < 0 || count > seats.length || count > 60-(room.furniture??[]).filter(item=>item.kind!=='workstation').length) {
      setMessage(`当前房间尺寸可摆放 0 到 ${seats.length} 张办公桌。`)
      return
    }
    updateRoom(room.id, previous => {
      const existing=(previous.furniture??[]).filter(item=>item.kind==='workstation')
      const kept=(previous.furniture??[]).filter(item=>item.kind!=='workstation')
      const stations=Array.from({length:count},(_,index)=>existing[index]??fitFurniture({id:crypto.randomUUID(),kind:'workstation' as const,x:seats[index].x,y:seats[index].y,rotation:0},previous.frame))
      return {...previous,furniture:[...kept,...stations]}
    })
    setMessage('')
  }

  function selectModel(source?: OfficeDragSource) {
    setWallSelection(undefined)
    if (source?.kind === 'furniture') {
      setInspector('properties')
      setSelection(source.roomId)
      setFurnitureSelection(source.id)
    } else selectRoom(source?.kind === 'room' ? source.roomId : undefined)
  }

  function planModel(source: OfficeDragSource, point: FloorPoint, origin: FloorPoint | null): OfficePlacement | null {
    const sourceRoom = 'roomId' in source ? draft.rooms.find((room) => room.id === source.roomId) : undefined
    if (source.kind === 'room' || source.kind === 'new-room') {
      if (source.kind === 'room' && (!sourceRoom || !origin)) return null
      const underPointer = source.kind === 'new-room' ? roomAt(point) : undefined
      const replacement = underPointer?.template === 'room-shell' && !underPointer.furniture?.length ? underPointer : undefined
      if(replacement) return {kind:'room',frame:replacement.frame,valid:true}
      const previous = sourceRoom?.frame
      const { width, height } = previous ?? NEW_ROOM_SIZE
      const x = previous && origin ? previous.x + point.x - origin.x : point.x - width / 2
      const y = previous && origin ? previous.y + point.y - origin.y : point.y - height / 2
      const frame = snapRoom({
        x: clamp(Math.round(x), 0, draft.width - width),
        y: clamp(Math.round(y), 0, draft.height - height),
        width, height,
      }, draft.rooms, sourceRoom?.id, draft.width, draft.height)
      const onBoard = point.x >= 0 && point.y >= 0 && point.x <= draft.width && point.y <= draft.height
      const valid = onBoard && !draft.rooms.some((room) => room.id !== sourceRoom?.id && intersects(room.frame, frame))
        && (source.kind === 'room' || draft.rooms.length < 80)
      return { kind: 'room', frame, valid }
    }

    const original = source.kind === 'furniture' ? sourceRoom?.furniture?.find(({ id }) => id === source.id) : undefined
    if (source.kind === 'furniture' && (!original || !sourceRoom || !origin)) return null
    const requested = original && sourceRoom && origin ? {
      x: sourceRoom.frame.x + original.x * sourceRoom.frame.width + point.x - origin.x,
      y: sourceRoom.frame.y + original.y * sourceRoom.frame.height + point.y - origin.y,
    } : point
    const target = roomAt(requested)
    if (!target) return { kind: 'furniture', at: requested, valid: false }
    const { frame } = target
    const item = fitFurniture({
      id: original?.id ?? '',
      kind: source.kind === 'new-furniture' ? source.model : original!.kind,
      rotation: original?.rotation ?? 0,
      size: original?.size,
      color: original?.color,
      elevation: original?.elevation,
      x: (requested.x - frame.x) / frame.width,
      y: (requested.y - frame.y) / frame.height,
    }, frame)
    const total = draft.rooms.reduce((count, room) => count + (room.furniture?.length ?? 0), 0)
    const valid = furnitureFits(item, frame) && (sourceRoom === target || (target.furniture?.length ?? 0) < 60)
      && (source.kind === 'furniture' || total < 320)
    return { kind: 'furniture', roomId: target.id, item,
      at: { x: frame.x + item.x * frame.width, y: frame.y + item.y * frame.height }, valid }
  }

  function commitModel(source: OfficeDragSource, placement: OfficePlacement) {
    if (!placement.valid) {
      setMessage(placement.kind === 'room' ? '这里放不下房间，请拖到空闲区域。' : '请将家具放到有空间的房间内。')
      return
    }
    setMessage('')
    if (placement.kind === 'room') {
      if (source.kind === 'new-room') {
        const target=draft.rooms.find(room=>room.template==='room-shell'&&!room.furniture?.length&&Object.entries(room.frame).every(([key,value])=>placement.frame[key as keyof RoomFrame]===value))
        if(target) applyPreset(target,source.template as keyof typeof OFFICE_TEMPLATES)
        else insertRoom(source.template as keyof typeof OFFICE_TEMPLATES, placement.frame)
      }
      if (source.kind === 'room') {
        updateRoom(source.roomId, (room) => ({ ...room, frame: placement.frame }))
        selectModel(source)
      }
      return
    }
    if (!placement.item || !placement.roomId) return
    const sourceId = source.kind === 'furniture' ? source.roomId : undefined
    const targetId = placement.roomId
    const item = { ...placement.item, id: placement.item.id || crypto.randomUUID() }
    setDraft((current) => ({ ...current, rooms: current.rooms.map((room) => {
      if (room.id !== sourceId && room.id !== targetId) return room
      const furniture = (room.furniture ?? []).filter(({ id }) => id !== item.id)
      const next={ ...room, furniture: room.id === targetId ? [...furniture, item] : furniture };return {...next,seats:furnitureSeats(next)}
    }) }))
    selectModel({ kind: 'furniture', roomId: targetId, id: item.id })
  }

  function resizeRoom(id: string, frame: RoomFrame) {
    updateRoom(id, room => resizeRoomContents(room, frame))
  }

  const resizeTargets: OfficeResizeTarget[] = []
  if (!busy && !validation.error) {
    const roomRight = Math.max(500, ...draft.rooms.map(({ frame }) => Math.ceil(frame.x + frame.width)))
    const roomBottom = Math.max(300, ...draft.rooms.map(({ frame }) => Math.ceil(frame.y + frame.height)))
    resizeTargets.push({
      id: 'canvas', label: '拖动调整办公室长宽', frame: { x: 0, y: 0, width: draft.width, height: draft.height },
      fit: (width, height) => ({ width: clamp(width, roomRight, 4000), height: clamp(height, roomBottom, 4000) }),
      commit: (width, height) => setDraft((current) => ({ ...current, width, height })),
    })
    if (selected && !selectedWall) {
      const frame = selected.frame
      const neighbors = draft.rooms.filter((room) => room.id !== selected.id)
      resizeTargets.push({
        id: 'room:' + selected.id, label: '拖动调整房间长宽', frame,
        fit: (width, height) => {
          const next = { ...frame, width: clamp(width, 100, draft.width - frame.x), height: clamp(height, 100, draft.height - frame.y) }
          for (const { frame: other } of neighbors) {
            if (!intersects(next, other)) continue
            if (frame.y + frame.height <= other.y) next.height = other.y - frame.y
            else if (frame.x + frame.width <= other.x) next.width = other.x - frame.x
          }
          const door = selected.door ?? roomTemplates.get(selected.template)?.door
          if (door) {
            try { getRoomDoorway(next, door) }
            catch { return frame }
          }
          return next
        },
        commit: (width, height) => resizeRoom(selected.id, { ...frame, width, height }),
      })
    }
  }

  function roomAt(point: FloorPoint) {
    return [...draft.rooms].reverse().find(({ frame }) => point.x >= frame.x && point.x < frame.x + frame.width
      && point.y >= frame.y && point.y < frame.y + frame.height)
  }

  function placeFurniture(kind: FurnitureKind, room: RoomPlacement) {
    const offset = ((room.furniture?.length ?? 0) % 5) * .06
    const source = { kind: 'new-furniture', model: kind } as const
    const placement = planModel(source, {
      x: room.frame.x + (.4 + offset) * room.frame.width,
      y: room.frame.y + (.5 + offset) * room.frame.height,
    }, null)
    if (placement) commitModel(source, placement)
  }

  function insertRoom(template: keyof typeof OFFICE_TEMPLATES, frame: RoomFrame) {
    const id = crypto.randomUUID()
    setDraft((current) => ({ ...current, rooms: [...current.rooms, materializeRoom({ id, frame, template, name: OFFICE_TEMPLATES[template] },roomTemplates.get(template)!)] }))
    selectRoom(id)
    setMessage('')
    setConfirmEmpty(false)
  }

  function addRoom(template: keyof typeof OFFICE_TEMPLATES) {
    if (busy || draft.rooms.length >= 80) return
    if(selected?.template==='room-shell'&&!selected.furniture?.length){applyPreset(selected,template);return}
    const { width, height } = NEW_ROOM_SIZE
    for (let y = 0; y + height <= draft.height; y += 20) {
      for (let x = 0; x + width <= draft.width; x += 20) {
        const frame = { x, y, width, height }
        if (!draft.rooms.some((room) => intersects(room.frame, frame))) { insertRoom(template, frame); return }
      }
    }
    setMessage('画布没有足够的空位。请扩大画布或调整现有房间。')
  }

  function applyPreset(room:RoomPlacement,template:keyof typeof OFFICE_TEMPLATES){
    updateRoom(room.id,previous=>materializeRoom({...previous,template,useTemplateFurniture:undefined,seats:undefined,furniture:[]},roomTemplates.get(template)!))
    selectRoom(room.id);setMessage('')
  }

  function removeRoom(id: string) {
    const rooms = draft.rooms.filter((room) => room.id !== id).map((room) => {
      if (!room.workbench?.linkedRoomIds?.includes(id)) return room
      return { ...room, workbench: { ...room.workbench, linkedRoomIds: room.workbench.linkedRoomIds.filter((linked) => linked !== id) } }
    })
    setDraft({ ...draft, rooms })
    setSelection(undefined)
    setFurnitureSelection(undefined)
  }

  async function publish() {
    if (busy || validation.error) return
    if (layout.rooms.length && !draft.rooms.length && !confirmEmpty) {
      setConfirmEmpty(true)
      setMessage('发布空办公室会移除现有房间和成员分配，请再点一次确认。')
      return
    }
    setBusy(true)
    setMessage('')
    try { await onPublish({ ...draft, assignments: publishedAssignments, seatAssignments:Object.fromEntries(Object.entries(draft.seatAssignments??{}).filter(([id,index])=>publishedAssignments[id] && index<(draft.rooms.find(room=>room.id===publishedAssignments[id])?.seats?.length??0))) }); onClose() }
    catch (error) { setMessage(error instanceof Error ? error.message : '发布失败，请重试。') }
    finally { setBusy(false) }
  }

  return (
    <main className="office-editor">
      <WorkspaceHeader title="编排办公室">
        <div className="office-editor-actions">
          <Button variant="toolbar" size="sm" disabled={busy} onClick={onClose}><X />取消编辑</Button>
          <Button variant="toolbar" size="sm" disabled={busy || !!validation.error} onClick={() => void publish()}><Upload />
            {busy ? '正在发布…' : confirmEmpty && !draft.rooms.length ? '确认发布空办公室' : '发布办公室'}
          </Button>
        </div>
      </WorkspaceHeader>
      {(message || validation.error) && <p className="office-editor-error" role="alert">{message || validation.error}</p>}
      {!validation.error && assignmentsReleased > 0 && <p className="office-editor-seat-notice">
        发布后，原工位不足的 {assignmentsReleased} 位成员会转为未分配，可在办公室的「分配工位」重新安排。
      </p>}
      <div className="office-editor-grid">
          <section className="office-editor-stage">
            <div className="office-plan-toolbar" aria-label="办公室编辑工具">
              <div className="office-plan-tools" role="group" aria-label="绘图工具">
                <button type="button" disabled={busy} aria-pressed={tool==='select'} onClick={()=>setTool('select')} title="选择并移动对象"><MousePointer2 size={15}/><span>选择</span></button>
                <button type="button" disabled={busy} aria-pressed={tool==='wall'} onClick={()=>setTool('wall')} title="连续绘制任意角度墙段"><PenLine size={15}/><span>自由墙</span></button>
                <button type="button" disabled={busy} aria-pressed={tool==='split'} onClick={()=>setTool('split')} title="将矩形房间一分为二"><BetweenHorizontalStart size={15}/><span>矩形分区</span></button>
              </div>
              <button className="office-plan-icon" type="button" aria-label="撤回上一段墙" disabled={busy||!draft.wallSegments?.length} onClick={()=>{setDraft(current=>({...current,wallSegments:current.wallSegments?.slice(0,-1)}));setWallSelection(undefined)}}><Undo2 size={15}/></button>
              <details className="office-canvas-size"><summary><Maximize size={14}/><span>{draft.width} × {draft.height}</span><ChevronDown size={12}/></summary><div>
                <label>画布宽<input aria-label="画布宽" type="number" min={500} max={4000} value={draft.width} disabled={busy} onChange={event=>setDraft({...draft,width:Number(event.target.value)})}/></label>
                <label>画布高<input aria-label="画布高" type="number" min={300} max={4000} value={draft.height} disabled={busy} onChange={event=>setDraft({...draft,height:Number(event.target.value)})}/></label>
              </div></details>
              <label className="office-plan-zoom"><input aria-label="编辑器缩放" type="range" min={65} max={165} value={sceneZoom} onChange={event=>setSceneZoom(Number(event.target.value))}/><span>{sceneZoom}%</span></label>
              <button className="office-plan-clear" type="button" disabled={busy} onClick={()=>{setDraft({...draft,rooms:[],wallSegments:[]});selectRoom(undefined);setMessage('')}}><Trash2 size={14}/><span>清空草稿</span></button>
            </div>
            {(wallTool||tool==='wall')&&<div className="office-drawing-hint"><i/>{wallTool?'拖出横墙或竖墙，划分矩形房间':'点击起点、连续点击转角；也可拖出单段墙。Shift 对齐 45°，Enter / Esc 结束。'}{tool==='wall'&&draft.rooms.some(room=>Object.values(room.walls??{}).length<4||Object.values(room.walls??{}).some(value=>value!=='open'))&&<button type="button" disabled={busy} onClick={()=>setDraft(current=>({...current,rooms:current.rooms.map(room=>({...room,walls:{north:'open',east:'open',south:'open',west:'open'}}))}))}>开放原有隔墙</button>}</div>}
            <div className="office-editor-preview" data-office-editor-3d>
              <OfficeScene layout={draft} rooms={validation.rooms} roster={emptyRoster} slots={{}}
                selectedRoom={selection ?? null}
                onSelectRoom={(id) => selectRoom(id ?? undefined)}
                focusedMember={null} meId={null} meName="" mode="daily" zoom={sceneZoom} walking={false}
                editing={{ freeWalls:{active:tool==='wall',selected:wallSelection,disabled:busy,add:addFreeWall,update:updateFreeWall,select:selectFreeWall,finish:()=>setTool('select')},wallTool, partition:drawPartition, selectedFurniture:furnitureSelection, controls: sceneControls, disabled: busy, resize: resizeTargets, plan: planModel,
                  commit: commitModel, select: selectModel,
                }} />
            </div>
          </section>
          <aside ref={inspectorPanel} className="office-editor-sidebar">
            <div className="office-inspector-tabs" role="group" aria-label="编辑侧栏">
              <button type="button" aria-pressed={inspector === 'properties'} onClick={() => setInspector('properties')}><SlidersHorizontal size={14}/>对象属性</button>
              <button type="button" aria-pressed={inspector === 'assets'} onClick={() => setInspector('assets')}><Plus size={14}/>添加素材</button>
            </div>
            {inspector === 'assets' && <OfficeAssetLibrary disabled={busy} onDrag={(event, asset) => {
              sceneControls.current?.startDrag(event, asset.kind === 'room'
                ? { kind: 'new-room', template: asset.id } : { kind: 'new-furniture', model: asset.id })
            }} onAdd={(asset) => {
              if (sceneControls.current?.didDrag()) return
              if (asset.kind === 'room') addRoom(asset.id as keyof typeof OFFICE_TEMPLATES)
              else if (selected) placeFurniture(asset.id, selected)
              else setMessage('先选中房间，或直接把家具拖到房间里。')
            }} />}
            {inspector === 'properties' && selected && selectedItem && <section>
              <div className="office-inspector-heading"><div><span className="office-inspector-eyebrow">家具 · 独立对象</span><h2><Box size={16}/>{FURNITURE[selectedItem.kind].label}</h2></div><span>{selected.name}</span></div>
              <button type="button" onClick={() => setFurnitureSelection(undefined)}>返回「{selected.name}」房间属性</button>
              <div className="office-editor-dimensions">
                {(['width', 'depth', 'height'] as const).map(dimension=><label key={dimension}>{dimension==='width'?'宽度':dimension==='depth'?'深度':'高度'}<input
                  aria-label={dimension==='width'?'家具宽度':dimension==='depth'?'家具深度':'家具高度'} type="number" min={1} max={800} value={furnitureSize(selectedItem)[dimension]} disabled={busy}
                  onChange={event=>{const value=event.target.valueAsNumber;const previous=furnitureSize(selectedItem);if(Number.isFinite(value)&&value>=1&&value<=800&&(dimension==='height'||value<=(dimension==='width'?selected.frame.width:selected.frame.height)-12))updateRoom(selected.id,room=>({...room,furniture:room.furniture?.map(item=>item.id===selectedItem.id?fitFurniture({...item,size:{...previous,[dimension]:value}},room.frame):item)}))}}/></label>)}
              </div>
              <div className="office-editor-dimensions">{(['x','y'] as const).map(axis=><label key={axis}>{axis==='x'?'X 位置':'Y 位置'}<input type="number" aria-label={axis==='x'?'家具X位置':'家具Y位置'} min={0} value={Math.round(selectedItem[axis]*(axis==='x'?selected.frame.width:selected.frame.height))} disabled={busy} onChange={event=>updateRoom(selected.id,room=>({...room,furniture:room.furniture?.map(item=>item.id===selectedItem.id?fitFurniture({...item,[axis]:Number(event.target.value)/(axis==='x'?room.frame.width:room.frame.height)},room.frame):item)}))}/></label>)}</div>
              <h3 className="office-inspector-subtitle">变换</h3><label>旋转角度 <input type="number" min={0} max={359} value={selectedItem.rotation} disabled={busy}
                onChange={(event) => {
                  const rotation = clamp(Number(event.target.value), 0, 359)
                  updateRoom(selected.id, (room) => ({ ...room, furniture: room.furniture?.map((item) =>
                    item.id === selectedItem.id ? fitFurniture({ ...item, rotation }, room.frame) : item) }))
                }} /></label>
              <div className="office-object-actions"><Button variant="toolbar" size="sm" disabled={busy} onClick={()=>updateRoom(selected.id,room=>({...room,furniture:room.furniture?.map(item=>item.id===selectedItem.id?fitFurniture({...item,rotation:(item.rotation+90)%360},room.frame):item)}))}><RotateCw/>旋转90°</Button><Button variant="toolbar" size="sm" disabled={busy||(selected.furniture?.length??0)>=60} onClick={()=>{
                const item=fitFurniture({...selectedItem,id:crypto.randomUUID(),x:selectedItem.x+.06,y:selectedItem.y+.06},selected.frame)
                updateRoom(selected.id,room=>({...room,furniture:[...(room.furniture??[]),item]}));setFurnitureSelection(item.id)
              }}><Copy/>复制</Button></div>
              <label>离地高度<input aria-label="家具离地高度" type="number" min={0} max={200} value={selectedItem.elevation??0} disabled={busy} onChange={event=>updateRoom(selected.id,room=>({...room,furniture:room.furniture?.map(item=>item.id===selectedItem.id?{...item,elevation:clamp(Number(event.target.value),0,200)}:item)}))}/></label>
              {!['plant','sofa','coffee','lamp','chair','workstation','shelf','display-shelf','screen','monitor','studio-light','camera','clothes-rack','trolley','sink','cup'].includes(selectedItem.kind) && <label>饰面颜色<input aria-label="家具颜色" type="color" value={selectedItem.color??'#efece2'} disabled={busy} onChange={event=>updateRoom(selected.id,room=>({...room,furniture:room.furniture?.map(item=>item.id===selectedItem.id?{...item,color:event.target.value}:item)}))}/></label>}
              <button type="button" disabled={busy} onClick={() => {
                updateRoom(selected.id, (room) => ({ ...room, furniture: room.furniture?.filter(({ id }) => id !== selectedItem.id) }))
                setFurnitureSelection(undefined)
              }} className="office-delete-object"><Trash2 size={13}/>移除家具</button>
            </section>}
            {inspector==='properties'&&selectedWall&&<OfficeWallInspector wall={selectedWall} disabled={busy} onChange={updateFreeWall} onDelete={()=>{setDraft(current=>({...current,wallSegments:current.wallSegments?.filter(wall=>wall.id!==selectedWall.id)}));setWallSelection(undefined)}}/>}
            {inspector === 'properties' && !selectedWall && !selectedItem && <section>
              <div className="office-inspector-heading"><div><span className="office-inspector-eyebrow">空间边界</span><h2><Layers3 size={16}/>房间属性</h2></div><span>{selected?.furniture?.length??0} 件家具</span></div>
              <label>当前房间<Select value={selected?.id??''} disabled={busy||!draft.rooms.length} onValueChange={id=>selectRoom(id)}><SelectTrigger aria-label="选择房间"><SelectValue placeholder="选择房间"/></SelectTrigger><SelectContent>{draft.rooms.map(room=><SelectItem key={room.id} value={room.id}>{room.name||'未命名'}</SelectItem>)}</SelectContent></Select></label>
              {selected && <>
                <label>名称 <input value={selected.name} maxLength={80} disabled={busy} onChange={(event) => {
                  const name = event.target.value
                  updateRoom(selected.id, (room) => ({ ...room, name }))
                }} /></label>
                {workstationGrid && <>
                  <label>办公桌数量 <input aria-label="办公桌数量" type="number" min={0}
                    max={Math.min(workstationGrid.length,60-(selected.furniture??[]).filter(item=>item.kind!=='workstation').length)}
                    key={selected.id + ':' + (selected.seats?.length ?? 'default')}
                    defaultValue={selected.furniture?.filter(item=>item.kind==='workstation').length??0}
                    disabled={busy}
                    onBlur={(event) => {
                      const value = event.target.valueAsNumber
                      const oldCount = selected.furniture?.filter(item=>item.kind==='workstation').length??0
                      if (value !== oldCount) changeDeskCount(selected, value)
                      event.target.value = String(oldCount)
                    }}
                    onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} /></label>
                  <p className="text-muted-foreground">增加的是独立办公工位；调整墙体尺寸不会放大桌椅。</p>
                </>}
                <details className="office-room-geometry"><summary>位置与尺寸</summary>
                <div className="office-editor-dimensions">
                  {Object.entries(frames).map(([key, label]) => <label key={key}>{label}
                    <input type="number" min={key === 'x' || key === 'y' ? 0 : 100} value={selected.frame[key as keyof RoomFrame]} disabled={busy}
                      onChange={(event) => {
                        const value = Number(event.target.value)
                        resizeRoom(selected.id, { ...selected.frame, [key]: value })
                      }} />
                  </label>)}
                </div>
                </details>
                <OfficeRoomSurfaces key={selected.id} room={selected} disabled={busy} onUpdate={(update) => updateRoom(selected.id, update)} />
                <button className="office-delete-object" type="button" disabled={busy} onClick={() => removeRoom(selected.id)}><Trash2 size={13}/>删除房间</button>
                {!!selected.furniture?.length && <div className="office-object-list"><h3 className="office-inspector-subtitle">房间内的对象</h3>
                  {selected.furniture.map((item, index) => <button type="button" key={item.id}
                    aria-pressed={furnitureSelection === item.id} onClick={() => setFurnitureSelection(item.id)}>
                    <Box size={13}/><span>{FURNITURE[item.kind].label}</span><small>{String(index + 1).padStart(2,'0')}</small></button>)}
                </div>}
              </>}
            </section>}
          </aside>
        </div>
    </main>
  )
}
