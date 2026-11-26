import { X, Upload, Layers3, Box, RotateCw, Copy, Trash2, SlidersHorizontal, Plus, MousePointer2, PenLine, DoorOpen, Undo2, Redo2, Maximize, ChevronDown, Ruler } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WorkspaceHeader } from '@/components/ui/workspace-header'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { LayoutState } from '@/lib/store/types'
import { roomChannelId, type ChatClient } from '@/lib/chat/types'
import { OfficeAssetLibrary } from './OfficeAssetLibrary'
import type { OfficeResizeTarget } from './OfficeResizeHandle'
import { OfficeScene, type OfficeSceneControls } from './OfficeScene'
import {OfficeWallInspector} from './OfficeWallInspector'
import {reconcileRegions} from './rooms/reconcile-regions'
import {roomContains,boundaryArea,interiorPoint} from './rooms/region-geometry'
import {furnitureFitsRoom} from './rooms/furniture-region'
import {validateWallSegments} from './rooms/free-walls'
import {deleteWall,insertWall,moveWallRun,replaceWall} from './rooms/weld-walls'
import { OfficeRoomSurfaces } from './OfficeRoomSurfaces'
import { snapRoom } from './rooms/snap-room'
import { getRoomDoorway, resolveOfficeLayout, roomTemplates, type RoomPlacement } from './rooms'
import type { FurnitureKind, FurniturePlacement, RoomFrame, WallSegment } from './rooms/api'
import { materializeRoom, furnitureSeats, resizeRoomContents } from './rooms/template-furniture'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FURNITURE, fitFurniture, furnitureSize } from './rooms/placed-furniture'
import { OFFICE_TEMPLATES } from './office-assets'
import { NEW_ROOM_SIZE, type FloorPoint, type OfficeDragSource, type OfficePlacement } from './office-drag'
import './office-editor.css'

const emptyRoster = new Map()
const frames = { x: '横坐标', y: '纵坐标', width: '宽度', height: '高度' } as const
const intersects = (a: RoomFrame, b: RoomFrame) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
function deskGrid(frame: RoomFrame,room?:RoomPlacement) {
  const columns = Math.max(0, Math.floor(frame.width / 78))
  const rows = Math.max(0, Math.floor(frame.height / 78))
  return Array.from({ length: Math.min(columns * rows, 60) }, (_, index) => ({
    x: (index % columns + .5) / columns,
    y: (Math.floor(index / columns) + .82) / rows,
  })).filter(seat=>!room?.boundary||furnitureFitsRoom({...seat,id:"candidate",kind:"workstation",rotation:0},room))
}
export function OfficeLayoutEditor({ layout, onPublish, onClose, chat }: {
  layout: LayoutState
  onPublish: (draft: LayoutState) => Promise<void>
  onClose: () => void
  /** 用于删除房间前的交流室安全提示；未接入交流室时直接删除。 */
  chat?: ChatClient
}) {
  const [draft, setDraft] = useState<LayoutState>(() => reconcileRegions({...layout,rooms:layout.rooms.map(room=>materializeRoom(room,roomTemplates.get(room.template)!))}))
  const [inspector, setInspector] = useState<'properties' | 'assets'>('assets')
  const [selection, setSelection] = useState<string>()
  const [furnitureSelection, setFurnitureSelection] = useState<string>()
  const [sceneZoom, setSceneZoom] = useState(100)
  const inspectorPanel = useRef<HTMLElement>(null)
  useEffect(() => { inspectorPanel.current?.scrollTo(0, 0) }, [selection, furnitureSelection, inspector])
  const sceneControls = useRef<OfficeSceneControls>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState<'info' | 'error'>('info')
  // 成功/提示与校验错误共用一行状态栏，用色调区分，避免「区域已闭合」被当成报错。
  const notify = (text: string, tone: 'info' | 'error' = 'info') => { setMessage(text); setMessageTone(tone) }
  const [confirmEmpty, setConfirmEmpty] = useState(false)
  const [archivePrompt, setArchivePrompt] = useState<{
    rooms: { id: string; name: string; messages: number }[]
    apply: () => void
  } | null>(null)
  const [tool,setTool] = useState<'select'|'wall'|'door'>('select')
  const [wallSelection,setWallSelection]=useState<string>()
  /** Orthogonal lock for the wall tool (the Shift key gives the same assist on the fly). */
  const [ortho,setOrtho]=useState(false)
  /**
   * One undo stack for the whole draft: walls, furniture, room moves, resizes and
   * every inspector edit record the previous snapshot, so a mis-drag can always be
   * taken back (Ctrl+Z) and replayed (Ctrl+Shift+Z).
   */
  const historyRef=useRef<{past:LayoutState[];future:LayoutState[]}>({past:[],future:[]})
  const [,setHistoryVersion]=useState(0)
  const draftRef=useRef(draft)
  draftRef.current=draft
  const canUndo=historyRef.current.past.length>0
  const canRedo=historyRef.current.future.length>0
  function record(snapshot:LayoutState=draftRef.current){
    const history=historyRef.current
    history.past=[...history.past.slice(-59),structuredClone(snapshot)]
    history.future=[]
    setHistoryVersion(version=>version+1)
  }
  function restore(snapshot:LayoutState){
    try{setDraft(reconcileRegions(snapshot));setMessage('')}
    catch(error){notify(error instanceof Error?error.message:'无法恢复这一步。','error')}
  }
  function undoEdit(){
    const history=historyRef.current
    const previous=history.past.pop()
    if(!previous)return
    history.future=[...history.future.slice(-59),structuredClone(draftRef.current)]
    setHistoryVersion(version=>version+1)
    setWallSelection(undefined);setFurnitureSelection(undefined)
    restore(previous)
    setMessage('已撤回上一步编辑')
  }
  function redoEdit(){
    const history=historyRef.current
    const next=history.future.pop()
    if(!next)return
    history.past=[...history.past.slice(-59),structuredClone(draftRef.current)]
    setHistoryVersion(version=>version+1)
    setWallSelection(undefined);setFurnitureSelection(undefined)
    restore(next)
    setMessage('已重做上一步编辑')
  }
  const selectedWall=draft.wallSegments?.find(wall=>wall.id===wallSelection)
  const selected = draft.rooms.find((room) => room.id === selection)
  const selectedItem = selected?.furniture?.find((item) => item.id === furnitureSelection)
  const workstationGrid = selected ? deskGrid(selected.frame,selected) : null
  const validation = useMemo(() => {
    let rooms: ReturnType<typeof resolveOfficeLayout> = []
    try {
      if (draft.width < 500 || draft.height < 300 || draft.width > 4000 || draft.height > 4000)
        throw new Error('画布宽度须为 500 至 4000，高度须为 300 至 4000。')
      validateWallSegments(draft)
      if(!Number.isFinite(draft.unitsPerMeter??50)||(draft.unitsPerMeter??50)<10||(draft.unitsPerMeter??50)>1000)throw Error('每米画布单位应为 10 至 1000。')
      rooms = resolveOfficeLayout(draft, roomTemplates)
      for (const [index, room] of draft.rooms.entries()) {
        if (!room.name.trim()) throw new Error('请填写所有房间名称。')
        if (room.frame.width < (room.boundary?.outer.length?0.001:100) || room.frame.height < (room.boundary?.outer.length?0.001:100)) throw new Error('房间最小为 100 × 100。')
        if (draft.rooms.slice(0, index).some((other) => (!(room.boundary&&other.boundary)&&intersects(other.frame, room.frame))))
          throw new Error(`「${room.name}」与其他房间重叠。`)
        if (room.furniture?.some((item) => !furnitureFitsRoom(item, room)))
          throw new Error(`「${room.name}」有家具超出房间边界。`)
      }
      return { rooms, error: '' }
    } catch (error) {
      return { rooms, error: error instanceof Error ? error.message : '布局无效。' }
    }
  }, [draft])

  const publishedAssignments = useMemo(() => {
    const remaining = new Map(validation.rooms.map((room) => [room.id, room.seats.length]))
    return Object.fromEntries(Object.entries(draft.assignments).filter(([, roomId]) => {
      const available = remaining.get(roomId) ?? 0
      if (available <= 0) return false
      remaining.set(roomId, available - 1)
      return true
    }))
  }, [draft.assignments, validation.rooms])
  const assignmentsReleased = Object.keys(layout.assignments).length - Object.keys(publishedAssignments).length

  const clipboard = useRef<{ kind: 'furniture'; item: FurniturePlacement; roomId: string } | { kind: 'room'; room: RoomPlacement } | null>(null)
  const shortcutRef = useRef<(event: KeyboardEvent) => void>(() => {})
  useEffect(() => {
    const keys = (event: KeyboardEvent) => shortcutRef.current(event)
    window.addEventListener('keydown', keys)
    return () => window.removeEventListener('keydown', keys)
  }, [])

  /**
   * 统一快捷键入口：尽量贴近常规编辑器习惯。
   * - Delete / Backspace：删除选中家具、墙体或房间
   * - 方向键：微调选中对象（Shift 加速 10 倍），连续微调合并为一步撤销
   * - R / Shift+R：家具旋转 ±90°
   * - V / W / O：选择 / 自由墙 / 开门
   * - Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y：撤回 / 重做；Ctrl+C / X / V / D：复制、剪切、粘贴、复制一份
   * - Ctrl+S：发布布局；Esc：取消选择并回到选择工具；0 / +/-：缩放
   */
  function handleShortcut(event: KeyboardEvent) {
    const target = event.target
    const key = event.key
    const editable = target instanceof HTMLElement && (
      target instanceof HTMLTextAreaElement
      || (target instanceof HTMLInputElement && !['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color'].includes(target.type))
      || target instanceof HTMLSelectElement
      || target.isContentEditable
    )

    if (key === 'Escape') {
      event.preventDefault()
      if (editable) { (target as HTMLElement).blur(); return }
      setTool('select')
      setWallSelection(undefined)
      setFurnitureSelection(undefined)
      setInspector('properties')
      return
    }
    if (editable) return

    if (event.metaKey || event.ctrlKey) {
      const lower = key.toLowerCase()
      if (lower === 'z') { event.preventDefault(); if (event.shiftKey) redoEdit(); else undoEdit(); return }
      if (lower === 'y') { event.preventDefault(); redoEdit(); return }
      if (lower === 'c') { event.preventDefault(); copySelection(); return }
      if (lower === 'x') { event.preventDefault(); cutSelection(); return }
      if (lower === 'v') { event.preventDefault(); pasteClipboard(); return }
      if (lower === 'd') { event.preventDefault(); pasteClipboard(true); return }
      if (lower === 's') { event.preventDefault(); void publish(); return }
      return
    }

    if (key === 'Delete' || key === 'Backspace') { event.preventDefault(); deleteSelection(); return }
    if (key.startsWith('Arrow')) { event.preventDefault(); nudgeSelection(key, event.shiftKey); return }
    const lower = key.toLowerCase()
    if (lower === 'r') { event.preventDefault(); rotateSelection(event.shiftKey ? -90 : 90); return }
    if (lower === 'v') { event.preventDefault(); setTool('select'); return }
    if (lower === 'w') { event.preventDefault(); setTool('wall'); return }
    if (lower === 'o') { event.preventDefault(); setTool('door'); return }
    if (key === '0') { event.preventDefault(); setSceneZoom(100); return }
    if (key === '+' || key === '=') { event.preventDefault(); setSceneZoom((zoom) => Math.min(165, zoom + 10)); return }
    if (key === '-' || key === '_') { event.preventDefault(); setSceneZoom((zoom) => Math.max(64, zoom - 10)); return }
  }
  shortcutRef.current = handleShortcut

  const nudgeAt = useRef(0)
  /** 方向键微调：家具或房间；Shift 加速十倍，连续按键合并为一个撤销步。 */
  function nudgeSelection(key: string, coarse: boolean) {
    if (busy) return
    const step = coarse ? 20 : 2
    const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0
    const dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0
    const nudge = (build: (current: LayoutState) => LayoutState) => {
      const now = Date.now()
      const current = draftRef.current
      if (now - nudgeAt.current > 700) record(current)
      nudgeAt.current = now
      setDraft(build(current))
    }
    if (furnitureSelection && selection) {
      nudge((current) => ({
        ...current,
        rooms: current.rooms.map((room) => {
          if (room.id !== selection) return room
          const next = { ...room, furniture: (room.furniture ?? []).map((item) => item.id === furnitureSelection
            ? fitFurniture({ ...item, x: item.x + dx / room.frame.width, y: item.y + dy / room.frame.height }, room.frame)
            : item) }
          return next.useTemplateFurniture === false ? { ...next, seats: furnitureSeats(next) } : next
        }),
      }))
      return
    }
    if (wallSelection) { notify('墙体不支持方向键微调，请在右侧属性里修改坐标。', 'error'); return }
    const room = draftRef.current.rooms.find((candidate) => candidate.id === selection)
    if (!room) { notify('先选中一个房间或家具，再用方向键微调。', 'error'); return }
    if (room.boundary) { notify('边界房间由墙体识别，请先拆除或移动隔墙。', 'error'); return }
    const frame = {
      ...room.frame,
      x: clamp(room.frame.x + dx, 0, draft.width - room.frame.width),
      y: clamp(room.frame.y + dy, 0, draft.height - room.frame.height),
    }
    if (draft.rooms.some((other) => other.id !== room.id && intersects(other.frame, frame))) {
      notify('这里会和其他房间重叠，请先调整相邻房间。', 'error')
      return
    }
    nudge((current) => ({ ...current, rooms: current.rooms.map((candidate) => candidate.id === room.id ? { ...candidate, frame } : candidate) }))
  }

  /** R / Shift+R：旋转选中的家具。 */
  function rotateSelection(delta: number) {
    if (busy) return
    if (!(furnitureSelection && selection)) { notify('先选中一件家具，再按 R 旋转。', 'error'); return }
    const item = draftRef.current.rooms.find((room) => room.id === selection)?.furniture?.find((candidate) => candidate.id === furnitureSelection)
    if (!item) return
    updateRoom(selection, (room) => ({
      ...room,
      furniture: (room.furniture ?? []).map((candidate) => candidate.id === furnitureSelection
        ? fitFurniture({ ...candidate, rotation: (((candidate.rotation + delta) % 360) + 360) % 360 }, room.frame)
        : candidate),
    }))
    notify(`已旋转「${FURNITURE[item.kind].label}」${delta > 0 ? '+' : ''}${delta}°`)
  }

  function selectFreeWall(id:string){setWallSelection(id);setFurnitureSelection(undefined);setInspector('properties')}

  /**
   * Every wall edit goes through the wall graph: a new segment splits the walls it
   * lands on (T junctions), a moved segment keeps its neighbours welded, and two
   * collinear segments collapse back into one. Without that, corners miss by a few
   * pixels and the region recogniser never closes the room.
   */
  function applyWalls(segments:readonly WallSegment[],note=''){
    try{
      const next={...draftRef.current,wallSegments:segments}
      validateWallSegments(next)
      record()
      setDraft(reconcileRegions(next))
      setMessage(note)
      return true
    }catch(error){notify(error instanceof Error?error.message:'墙体无效。','error');return false}
  }

  async function roomMessageCount(roomId:string){
    if(!chat)return 0
    try{return await chat.historyCount(roomChannelId(roomId))}catch{return 0}
  }

  /**
   * 拆改墙体可能让某个区域被重新识别掉。若该房间已经聊过天，先提示归档，
   * 避免编辑办公室时误删一个已有聊天记录的交流室。
   */
  function commitWalls(segments:readonly WallSegment[],note=''){
    if(!chat)return applyWalls(segments,note)
    let next:LayoutState
    try{
      const candidate={...draftRef.current,wallSegments:segments}
      validateWallSegments(candidate)
      next=reconcileRegions(candidate)
    }catch(error){notify(error instanceof Error?error.message:'墙体无效。','error');return false}
    const gone=draftRef.current.rooms.filter(room=>!next.rooms.some(candidate=>candidate.id===room.id))
    if(!gone.length)return applyWalls(segments,note)
    void Promise.all(gone.map(async room=>({id:room.id,name:room.name,messages:await roomMessageCount(room.id)})))
      .then(entries=>{
        const risky=entries.filter(entry=>entry.messages>0)
        if(!risky.length)applyWalls(segments,note)
        else setArchivePrompt({rooms:risky,apply:()=>applyWalls(segments,note)})
      })
    return false
  }

  function addFreeWall(wall:WallSegment){
    if(busy)return false
    const ok=commitWalls(insertWall(draft.wallSegments??[],wall))
    if(ok)selectFreeWall(wall.id)
    return ok
  }
  /** `mode='move'` drags the whole straight run and stretches the walls hanging off it. */
  function updateFreeWall(wall:WallSegment,mode:'move'|'reshape'='reshape'){
    if(busy)return
    const segment=draft.wallSegments??[]
    const previous=segment.find(candidate=>candidate.id===wall.id)
    const welded=mode==='move'&&previous?moveWallRun(segment,previous,wall,{width:draft.width,height:draft.height}):segment
    if(commitWalls(replaceWall(welded,wall)))selectFreeWall(wall.id)
  }
  function removeFreeWall(id:string){
    if(busy)return
    commitWalls(deleteWall(draft.wallSegments??[],id),'已删除墙体')
    if(wallSelection===id)setWallSelection(undefined)
  }

  function changeTopology(change:(current:LayoutState)=>LayoutState){
    try{const next=change(draftRef.current);if(next.width<500||next.width>4000||next.height<300||next.height>4000)throw Error('画布宽度应为500–4000，高度应为300–4000。');record();setDraft(reconcileRegions(next));setMessage('')}catch(error){notify(error instanceof Error?error.message:'区域识别失败，请检查墙体。','error')}
  }
  function updateRoom(id: string, update: (room: RoomPlacement) => RoomPlacement) {
    const current=draftRef.current
    record(current)
    setDraft({ ...current, rooms: current.rooms.map((room) => room.id === id ? (()=>{const next=update(room);return next.useTemplateFurniture===false?{...next,seats:furnitureSeats(next)}:next})() : room) })
  }

  function selectRoom(id: string | undefined) {
    setWallSelection(undefined)
    setSelection(id)
    if (id) setInspector('properties')
    setFurnitureSelection(undefined)
  }

  function changeDeskCount(room: RoomPlacement, count: number) {
    const seats = deskGrid(room.frame,room)
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
    if(source?.kind==='room'&&tool==='wall')setTool('select')
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
      if(replacement) return {kind:'room',frame:replacement.frame,roomId:replacement.id,valid:true}
      if(sourceRoom?.boundary)return null
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
    const valid = furnitureFitsRoom(item, target) && (sourceRoom === target || (target.furniture?.length ?? 0) < 60)
      && (source.kind === 'furniture' || total < 320)
    return { kind: 'furniture', roomId: target.id, item,
      at: { x: frame.x + item.x * frame.width, y: frame.y + item.y * frame.height }, valid }
  }

  function commitModel(source: OfficeDragSource, placement: OfficePlacement) {
    if (!placement.valid) {
      notify(placement.kind === 'room' ? '这里放不下房间，请拖到空闲区域。' : '请将家具放到有空间的房间内。','error')
      return
    }
    setMessage('')
    if (placement.kind === 'room') {
      if (source.kind === 'new-room') {
        const target=draft.rooms.find(room=>room.template==='room-shell'&&!room.furniture?.length&&(!placement.roomId||room.id===placement.roomId)&&Object.entries(room.frame).every(([key,value])=>placement.frame[key as keyof RoomFrame]===value))
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
    const current=draftRef.current
    record(current)
    setDraft({ ...current, rooms: current.rooms.map((room) => {
      if (room.id !== sourceId && room.id !== targetId) return room
      const furniture = (room.furniture ?? []).filter(({ id }) => id !== item.id)
      const next={ ...room, furniture: room.id === targetId ? [...furniture, item] : furniture };return {...next,seats:furnitureSeats(next)}
    }) })
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
      commit: (width, height) => changeTopology(current=>({ ...current, width, height })),
    })
    if (selected && !selected.boundary && !selectedWall) {
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
    return [...draft.rooms].reverse().find(room=>roomContains(room,point))
  }

  function placeFurniture(kind: FurnitureKind, room: RoomPlacement) {
    const offset = ((room.furniture?.length ?? 0) % 5) * .06
    const source = { kind: 'new-furniture', model: kind } as const
    const anchor=room.boundary?interiorPoint(room.boundary):{x:room.frame.x+(.4+offset)*room.frame.width,y:room.frame.y+(.5+offset)*room.frame.height}
    const placement = planModel(source, anchor, null)
    if (placement) commitModel(source, placement)
  }

  function deleteSelection() {
    if (busy) return
    if (furnitureSelection && selection) { removeFurnitureItem(selection, furnitureSelection); return }
    if (wallSelection) { removeFreeWall(wallSelection); return }
    if (selection && !selected?.boundary) { requestRemoveRoom(selection); return }
    if (selection && selected?.boundary) { notify('边界房间由墙体自动识别，删除请先拆除围合它的墙体', 'error'); return }
    notify('先选中家具、墙体或房间，再按 Delete 删除。', 'error')
  }

  function removeFurnitureItem(roomId: string, itemId: string) {
    updateRoom(roomId, (room) => ({ ...room, furniture: (room.furniture ?? []).filter((item) => item.id !== itemId) }))
    setFurnitureSelection(undefined)
  }

  /** Ctrl+C：选中家具复制家具，选中房间复制整间（带家具与座位）。 */
  function copySelection() {
    const current = draftRef.current
    if (furnitureSelection && selection) {
      const room = current.rooms.find((candidate) => candidate.id === selection)
      const item = room?.furniture?.find((candidate) => candidate.id === furnitureSelection)
      if (room && item) {
        clipboard.current = { kind: 'furniture', item: structuredClone(item), roomId: room.id }
        notify(`已复制家具「${FURNITURE[item.kind].label}」，Ctrl+V 粘贴`)
        return
      }
    }
    if (selection) {
      const room = current.rooms.find((candidate) => candidate.id === selection)
      if (!room) return
      if (room.boundary) { notify('边界房间由墙体自动识别，不能整间复制；可以单独复制里面的家具', 'error'); return }
      clipboard.current = { kind: 'room', room: structuredClone(room) }
      notify(`已复制房间「${room.name}」，Ctrl+V 粘贴`)
      return
    }
    notify('先选中一个房间或家具，再按 Ctrl+C 复制', 'error')
  }

  /** Ctrl+X：复制后立即删除原对象。 */
  function cutSelection() {
    copySelection()
    const data = clipboard.current
    if (!data) return
    if (data.kind === 'furniture' && selection) {
      removeFurnitureItem(selection, data.item.id)
      notify(`已剪切家具「${FURNITURE[data.item.kind].label}」`)
    } else if (data.kind === 'room') {
      requestRemoveRoom(data.room.id)
      notify(`已剪切房间「${data.room.name}」`)
    }
  }

  /** Ctrl+V 粘贴（Ctrl+D 复制一份并直接粘贴）。 */
  function pasteClipboard(duplicate = false) {
    const data = clipboard.current
    if (!data) { notify('剪贴板是空的：先选中房间或家具按 Ctrl+C', 'error'); return }
    if (duplicate) {
      // Ctrl+D 直接复制当前选中的对象，不依赖剪贴板
      if (furnitureSelection && selection) {
        const room = draftRef.current.rooms.find((candidate) => candidate.id === selection)
        const item = room?.furniture?.find((candidate) => candidate.id === furnitureSelection)
        if (room && item) clipboard.current = { kind: 'furniture', item: structuredClone(item), roomId: room.id }
      } else if (selection) {
        const room = draftRef.current.rooms.find((candidate) => candidate.id === selection)
        if (room && !room.boundary) clipboard.current = { kind: 'room', room: structuredClone(room) }
      }
    }
    const payload = clipboard.current
    if (!payload) { notify('当前对象不支持复制一份', 'error'); return }
    const current = draftRef.current
    if (payload.kind === 'furniture') {
      const targetId = selection ?? payload.roomId
      const room = current.rooms.find((candidate) => candidate.id === targetId)
      if (!room) { notify('先选中要粘贴到的房间，再按 Ctrl+V', 'error'); return }
      const stepX = 30 / Math.max(1, room.frame.width)
      const stepY = 30 / Math.max(1, room.frame.height)
      const copy = fitFurniture({ ...structuredClone(payload.item), id: `f-${crypto.randomUUID().slice(0, 8)}`, x: clamp(payload.item.x + stepX, .02, .98), y: clamp(payload.item.y + stepY, .02, .98) }, room.frame)
      record(current)
      setDraft({ ...current, rooms: current.rooms.map((candidate) => {
        if (candidate.id !== room.id) return candidate
        const next = { ...candidate, furniture: [...(candidate.furniture ?? []), copy] }
        return { ...next, seats: furnitureSeats(next) }
      }) })
      setFurnitureSelection(copy.id)
      notify(`已粘贴「${FURNITURE[copy.kind].label}」`)
      return
    }
    const source = payload.room
    const width = source.frame.width, height = source.frame.height
    let x = clamp(source.frame.x + 40, 0, Math.max(0, current.width - width))
    let y = clamp(source.frame.y + 40, 0, Math.max(0, current.height - height))
    for (let attempt = 0; attempt < 16; attempt += 1) {
      if (!current.rooms.some((room) => intersects(room.frame, { x, y, width, height }))) break
      x = clamp(x + 30, 0, Math.max(0, current.width - width))
      y = clamp(y + 30, 0, Math.max(0, current.height - height))
    }
    const id = `room-${crypto.randomUUID().slice(0, 8)}`
    const room: RoomPlacement = {
      ...structuredClone(source),
      id,
      name: `${source.name} 副本`,
      frame: { x, y, width, height },
      furniture: (source.furniture ?? []).map((item, index) => ({ ...item, id: `f-${crypto.randomUUID().slice(0, 8)}-${index}` })),
      seats: source.useTemplateFurniture === false ? [] : structuredClone(source.seats),
    }
    if (room.useTemplateFurniture === false) room.seats = furnitureSeats(room)
    record(current)
    setDraft({ ...current, rooms: [...current.rooms, room] })
    setSelection(id)
    setFurnitureSelection(undefined)
    setInspector('properties')
    notify(`已粘贴房间「${room.name}」`)
  }

  function insertRoom(template: keyof typeof OFFICE_TEMPLATES, frame: RoomFrame) {
    const id = crypto.randomUUID()
    const current=draftRef.current
    record(current)
    setDraft({ ...current, rooms: [...current.rooms, materializeRoom({ id, frame, template, name: OFFICE_TEMPLATES[template] },roomTemplates.get(template)!)] })
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
    notify('画布没有足够的空位。请扩大画布或调整现有房间。','error')
  }

  function applyPreset(room:RoomPlacement,template:keyof typeof OFFICE_TEMPLATES){
    updateRoom(room.id,previous=>{const next=materializeRoom({...previous,template,useTemplateFurniture:undefined,seats:undefined,furniture:[]},roomTemplates.get(template)!);return next.boundary?{...next,furniture:next.furniture?.filter(item=>furnitureFitsRoom(item,next))}:next})
    selectRoom(room.id);setMessage('')
  }

  function removeRoomNow(id: string) {
    const current=draftRef.current
    record(current)
    const rooms = current.rooms.filter((room) => room.id !== id).map((room) => {
      if (!room.workbench?.linkedRoomIds?.includes(id)) return room
      return { ...room, workbench: { ...room.workbench, linkedRoomIds: room.workbench.linkedRoomIds.filter((linked) => linked !== id) } }
    })
    setDraft({ ...current, rooms })
    setSelection(undefined)
    setFurnitureSelection(undefined)
  }


  /** 删除房间：没聊过天直接删；聊过天先提示房间交流室会归档。 */
  function requestRemoveRoom(id: string) {
    if (busy) return
    const room = draftRef.current.rooms.find((candidate) => candidate.id === id)
    if (!chat || !room) { removeRoomNow(id); return }
    void roomMessageCount(id).then((messages) => {
      if (messages > 0) setArchivePrompt({ rooms: [{ id, name: room.name, messages }], apply: () => removeRoomNow(id) })
      else removeRoomNow(id)
    })
  }

  async function publish() {
    if (busy || validation.error) return
    if (layout.rooms.length && !draft.rooms.length && !confirmEmpty) {
      setConfirmEmpty(true)
      notify('发布空办公室会移除现有房间和成员分配，请再点一次确认。','error')
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
      <WorkspaceHeader title="编排办公室" description={draft.rooms.some(room=>room.boundary)?`${draft.rooms.length} 个区域 · ${(draft.rooms.reduce((sum,room)=>sum+(room.boundary?boundaryArea(room.boundary):room.frame.width*room.frame.height),0)/(draft.unitsPerMeter??50)**2).toFixed(2)} ㎡`:undefined}>
        <div className="office-editor-actions">
          <Button variant="toolbar" size="sm" disabled={busy} onClick={onClose}><X />取消编辑</Button>
          <Button variant="toolbar" size="sm" disabled={busy || !!validation.error} onClick={() => void publish()}><Upload />
            {busy ? '正在发布…' : confirmEmpty && !draft.rooms.length ? '确认发布空办公室' : '发布办公室'}
          </Button>
        </div>
      </WorkspaceHeader>
      <p className="office-editor-shortcut-hint" aria-hidden="true">
        Ctrl+Z 撤回 · Ctrl+Shift+Z 重做 · Ctrl+C/X/V/D 复制/剪切/粘贴/复制一份 · Delete 删除选中 · 方向键微调（Shift 加速）· R 旋转 · V/W/O 选择/墙/开门 · Ctrl+S 发布 · Esc 取消
      </p>
      {(message || validation.error) && <p className={`office-editor-note${(validation.error || messageTone === 'error') ? ' is-error' : ''}`} role={validation.error || messageTone === 'error' ? 'alert' : undefined}>{message || validation.error}</p>}
      {!validation.error && assignmentsReleased > 0 && <p className="office-editor-seat-notice">
        发布后，原工位不足的 {assignmentsReleased} 位成员会转为未分配，可在办公室的「分配工位」重新安排。
      </p>}
      <div className="office-editor-grid">
          <section className="office-editor-stage">
            <div className="office-plan-toolbar" aria-label="办公室编辑工具" data-tool={tool} data-wall-count={draft.wallSegments?.length ?? 0} data-wall-doors={draft.wallSegments?.filter(wall=>!!wall.opening).length ?? 0}>
              <div className="office-plan-tools" role="group" aria-label="绘图工具">
                <button type="button" disabled={busy} aria-pressed={tool==='select'} onClick={()=>setTool('select')} title="选择并移动对象"><MousePointer2 size={15}/><span>选择</span></button>
                <button type="button" disabled={busy} aria-pressed={tool==='wall'} onClick={()=>setTool('wall')} title="连续绘制任意角度墙段"><PenLine size={15}/><span>自由墙</span></button>
                <button type="button" disabled={busy} aria-pressed={tool==='door'} onClick={()=>setTool('door')} title="在独立墙段上开门洞"><DoorOpen size={15}/><span>开门</span></button>
              </div>
              <button className="office-plan-icon" type="button" aria-label="撤回上一步编辑" title="撤回上一步编辑（Ctrl+Z）" disabled={busy||!canUndo} onClick={undoEdit}><Undo2 size={15}/></button>
              <button className="office-plan-icon" type="button" aria-label="重做上一步编辑" title="重做上一步编辑（Ctrl+Shift+Z）" disabled={busy||!canRedo} onClick={redoEdit}><Redo2 size={15}/></button>
              <button className="office-plan-icon" type="button" aria-label="正交锁定" title="正交锁定：墙段只走水平 / 垂直；按住 Shift 可临时锁定 45°" aria-pressed={ortho} disabled={busy} onClick={()=>setOrtho(value=>!value)}><Ruler size={15}/></button>
              <details className="office-canvas-size"><summary><Maximize size={14}/><span>{draft.width} × {draft.height}</span><ChevronDown size={12}/></summary><div>
                <label>画布宽<input aria-label="画布宽" type="number" min={500} max={4000} value={draft.width} disabled={busy} onChange={event=>changeTopology(current=>({...current,width:Number(event.target.value)}))}/></label>
                <label>画布高<input aria-label="画布高" type="number" min={300} max={4000} value={draft.height} disabled={busy} onChange={event=>changeTopology(current=>({...current,height:Number(event.target.value)}))}/></label>
                <label>每米单位<input aria-label="每米画布单位" type="number" min={10} max={1000} value={draft.unitsPerMeter??50} onChange={event=>{record();setDraft({...draftRef.current,unitsPerMeter:Math.max(10,Math.min(1000,Number(event.target.value)))})}}/></label>
              </div></details>
              <label className="office-plan-zoom"><input aria-label="编辑器缩放" type="range" min={65} max={165} value={sceneZoom} onChange={event=>setSceneZoom(Number(event.target.value))}/><span>{sceneZoom}%</span></label>
              <button className="office-plan-clear" type="button" disabled={busy} onClick={()=>{record();setDraft({...draftRef.current,rooms:[],wallSegments:[]});selectRoom(undefined);setMessage('')}}><Trash2 size={14}/><span>清空草稿</span></button>
            </div>
            {tool==='door'&&<div className="office-drawing-hint"><i/>点墙体放置门洞，再点同一个门洞可取消；门洞宽度随墙段长度自动取值。外围墙请在房间属性里设置出入口；Esc 或再点「开门」退出。</div>}
            {tool==='wall'&&<div className="office-drawing-hint"><i/>{'点击起点、连续点击转角；端点 / 墙身 / 交点自动吸附，方向靠近水平 / 垂直 / 15° 倍数时出现绿色引导射线并自动锁直。回到起点可自动闭合，Shift 锁定 45°，正交按钮锁定 90°，Backspace 撤回上一段，双击 / Enter / Esc 结束；画歪了可在右侧属性里改角度或点「水平 / 垂直」。'}{tool==='wall'&&draft.rooms.some(room=>Object.values(room.walls??{}).length<4||Object.values(room.walls??{}).some(value=>value!=='open'))&&<button type="button" disabled={busy} onClick={()=>changeTopology(current=>({...current,rooms:current.rooms.map(room=>({...room,walls:{north:'open',east:'open',south:'open',west:'open'}}))}))}>开放原有隔墙</button>}</div>}
            <div className="office-editor-preview" data-office-editor-3d>
              <OfficeScene layout={draft} rooms={validation.rooms} roster={emptyRoster} slots={{}}
                selectedRoom={selection ?? null}
                onSelectRoom={(id) => selectRoom(id ?? undefined)}
                focusedMember={null} meId={null} meName="" mode="daily" zoom={sceneZoom} walking={false}
                editing={{ freeWalls:{active:tool==='wall',doorTool:tool==='door',selected:wallSelection,disabled:busy,ortho,grid:0,unitsPerMeter:draft.unitsPerMeter??50,add:addFreeWall,update:updateFreeWall,remove:removeFreeWall,select:selectFreeWall,restore:(walls)=>commitWalls(walls,'已取消这组连线'),finish:()=>setTool('select'),message:setMessage},selectedFurniture:furnitureSelection, controls: sceneControls, disabled: busy, resize: resizeTargets, plan: planModel,
                  commit: commitModel, select: selectModel,
                }} />
            </div>
          </section>
          <aside ref={inspectorPanel} className="office-editor-sidebar">
            <div className="office-inspector-tabs" role="group" aria-label="编辑侧栏">
              <button type="button" aria-pressed={inspector === 'properties'} onClick={() => setInspector('properties')}><SlidersHorizontal size={14}/>对象属性</button>
              <button type="button" aria-pressed={inspector === 'assets'} onClick={() => setInspector('assets')}><Plus size={14}/>添加素材</button>
            </div>
            {inspector === 'assets' && <OfficeAssetLibrary regionMode={draft.rooms.some(room=>!!room.boundary)} disabled={busy} onDrag={(event, asset) => {
              sceneControls.current?.startDrag(event, asset.kind === 'room'
                ? { kind: 'new-room', template: asset.id } : { kind: 'new-furniture', model: asset.id })
            }} onAdd={(asset) => {
              if (sceneControls.current?.didDrag()) return
              if (asset.kind === 'room') addRoom(asset.id as keyof typeof OFFICE_TEMPLATES)
              else if (selected) placeFurniture(asset.id, selected)
              else notify('先选中房间，或直接把家具拖到房间里。','error')
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
            {inspector==='properties'&&selectedWall&&<OfficeWallInspector wall={selectedWall} disabled={busy} onChange={updateFreeWall} onDelete={()=>removeFreeWall(selectedWall.id)}/>}
            {inspector === 'properties' && !selectedWall && !selectedItem && <section>
              <div className="office-inspector-heading"><div><span className="office-inspector-eyebrow">空间边界</span><h2><Layers3 size={16}/>{selected?.boundary?'区域属性':'房间属性'}</h2></div><span>{selected?.furniture?.length??0} 件家具</span></div>
              <label>{selected?.boundary?'当前区域':'当前房间'}<Select value={selected?.id??''} disabled={busy||!draft.rooms.length} onValueChange={id=>selectRoom(id)}><SelectTrigger aria-label="选择房间"><SelectValue placeholder="选择房间"/></SelectTrigger><SelectContent>{draft.rooms.map(room=><SelectItem key={room.id} value={room.id}>{room.name||'未命名'}</SelectItem>)}</SelectContent></Select></label>
              {selected && <>
                {selected.boundary&&<div className="office-region-stats"><div><span>自动计算面积</span><strong>{(boundaryArea(selected.boundary)/(draft.unitsPerMeter??50)**2).toFixed(2)}<small>㎡</small></strong></div><p>比例 {(draft.unitsPerMeter??50)} 单位 / 米 · 可在画布设置校准</p></div>}
                <label>名称 <input aria-label="区域名称" value={selected.name} maxLength={80} disabled={busy} onChange={(event) => {
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
                {!selected.boundary&&<details className="office-room-geometry"><summary>位置与尺寸</summary>
                <div className="office-editor-dimensions">
                  {Object.entries(frames).map(([key, label]) => <label key={key}>{label}
                    <input type="number" min={key === 'x' || key === 'y' ? 0 : 100} value={selected.frame[key as keyof RoomFrame]} disabled={busy}
                      onChange={(event) => {
                        const value = Number(event.target.value)
                        resizeRoom(selected.id, { ...selected.frame, [key]: value })
                      }} />
                  </label>)}
                </div>
                </details>}
                <OfficeRoomSurfaces key={selected.id} room={selected} disabled={busy} onUpdate={(update) => updateRoom(selected.id, update)} />
                {!selected.boundary&&<button className="office-delete-object" type="button" disabled={busy} onClick={() => requestRemoveRoom(selected.id)}><Trash2 size={13}/>删除房间</button>}{selected.boundary&&<p className="office-region-note">边界由墙体自动识别。移动或删除隔墙后，区域会重新计算；家具模板仅用于布置。</p>}
                {!!selected.furniture?.length && <div className="office-object-list"><h3 className="office-inspector-subtitle">房间内的对象</h3>
                  {selected.furniture.map((item, index) => <button type="button" key={item.id}
                    aria-pressed={furnitureSelection === item.id} onClick={() => setFurnitureSelection(item.id)}>
                    <Box size={13}/><span>{FURNITURE[item.kind].label}</span><small>{String(index + 1).padStart(2,'0')}</small></button>)}
                </div>}
              </>}
            </section>}
          </aside>
        </div>
      {archivePrompt && (
        <div className="office-archive-backdrop" role="dialog" aria-modal="true" aria-labelledby="office-archive-title">
          <div className="office-archive-dialog" data-office-archive>
            <h2 id="office-archive-title">房间已经聊过天，确认删除？</h2>
            <ul>
              {archivePrompt.rooms.map((room) => (
                <li key={room.id}>「{room.name}」已有 {room.messages} 条聊天记录</li>
              ))}
            </ul>
            <p>删除后，房间与交流室会归档并从办公室移除；聊天记录保留在企业数据库中，直到管理员在 Mira 彻底删除这条房间数据。从未聊过天的房间会直接删除。</p>
            <div className="office-archive-actions">
              <Button variant="toolbar" size="sm" onClick={() => setArchivePrompt(null)}>取消</Button>
              <Button variant="toolbar" size="sm" disabled={busy}
                onClick={() => { const apply = archivePrompt.apply; setArchivePrompt(null); apply() }}>归档并删除</Button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
