import { useEffect, useImperativeHandle, useRef, useState, type PointerEvent as ReactPointerEvent, type Ref } from 'react'
import { LaptopMinimal, MessageCircle, Armchair, LogOut, UserPlus } from 'lucide-react'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { PRESENCE_META, type Member } from '@/data/office'
import type { ChatMessage } from '@/lib/chat/types'
import type { DataSlots } from '@/lib/store/types'
import type { OfficeLayout, ResolvedRoom } from './rooms/api'
import { createOfficeView, type OfficeOverlay, type OfficeViewState } from './three/view'
import { OfficeResizeHandle, type OfficeResizeTarget } from './OfficeResizeHandle'
import { OfficeFreeWalls, type FreeWallEditing } from './OfficeFreeWalls'
import type { FloorPoint, OfficeDragSource, OfficePlacement } from './office-drag'

export type OfficeSceneControls = {
  startDrag: (event: ReactPointerEvent<HTMLElement>, source: OfficeDragSource) => void
  didDrag: () => boolean
}

interface OfficeSceneProps extends OfficeViewState {
  layout: OfficeLayout
  rooms: readonly ResolvedRoom[]
  roster: ReadonlyMap<string, Member[]>
  slots: DataSlots
  onSelectRoom: (id: string | null) => void
  focusedMember: string | null
  meId: string | null
  meName: string
  onSeat?: (roomId: string, seatIndex: number, seated: boolean) => void
  seatBusy?: boolean
  seatLocked?: boolean
  onAssignSeat?: (roomId: string, seatIndex: number) => void
  onOpenGmv?: () => void
  editing?: {
    freeWalls?:FreeWallEditing
    selectedFurniture?: string
    wallTool?: boolean
    partition?: (start: FloorPoint, end: FloorPoint) => void
    controls: Ref<OfficeSceneControls>
    disabled: boolean
    plan: (source: OfficeDragSource, at: FloorPoint, origin: FloorPoint | null) => OfficePlacement | null
    commit: (source: OfficeDragSource, placement: OfficePlacement) => void
    select: (source?: OfficeDragSource) => void
    resize?: readonly OfficeResizeTarget[]
  }
  chat?: {
    previewRoom: (roomId: string, anchor: HTMLElement) => void
    openRoom: (roomId: string) => void
    roomMention: (roomId: string) => ChatMessage['mention']
    canChatWith: (personId: string) => boolean
    previewPerson: (personId: string, anchor: HTMLElement) => void
  }
}

export function OfficeScene({
  layout, rooms, roster, slots, selectedRoom, onSelectRoom, focusedMember, meId, meName, mode, zoom, walking, mentionedRooms, gmv, onOpenGmv, chat, editing, seats, onSeat, seatBusy, seatLocked, onAssignSeat,
}: OfficeSceneProps) {
  const viewport = useRef<HTMLDivElement>(null)
  const engine = useRef<ReturnType<typeof createOfficeView>>(null)
  const view = useRef<OfficeViewState>({ selectedRoom, mode, zoom, walking, mentionedRooms, gmv, seats, seatLocked, selectedFurniture:editing?.selectedFurniture })
  const [overlay, setOverlay] = useState<OfficeOverlay>()
  const [graphicsUnavailable, setGraphicsUnavailable] = useState(false)
  const stopDrag = useRef<() => void>(() => {})
  const dragged = useRef(false)
  const canEdit = Boolean(editing)
  const wallGuide=useRef<SVGSVGElement>(null)
  const [context, setContext] = useState<{ x:number; y:number; roomId:string; seatIndex?:number; occupant?:string }>()

  useEffect(() => {
    if (!viewport.current || (!rooms.length && !canEdit)) return
    const next = createOfficeView(viewport.current, layout, rooms, roster, meId, { ...view.current, seats, seatLocked, selectedFurniture:editing?.selectedFurniture }, setOverlay, canEdit)
    engine.current = next
    setGraphicsUnavailable(!next)
    return () => {
      stopDrag.current()
      engine.current = null
      next?.dispose()
    }
  }, [layout, rooms, roster, meId, canEdit, seats])

  useEffect(() => {
    view.current = { selectedRoom, mode, zoom, walking, mentionedRooms, gmv, seats, seatLocked, selectedFurniture:editing?.selectedFurniture }
    engine.current?.draw(view.current)
  }, [selectedRoom, mode, zoom, walking, mentionedRooms, gmv, seats, seatLocked, editing?.selectedFurniture])

  useEffect(()=>{if(!editing?.wallTool)stopDrag.current()},[editing?.wallTool])
  useEffect(()=>{const cancel=(event:KeyboardEvent)=>{if(event.key==='Escape')stopDrag.current()};window.addEventListener('keydown',cancel);return()=>window.removeEventListener('keydown',cancel)},[])

  const walk = walking ? overlay?.walk : undefined
  const walkMessage = walk?.phase === 'moving' ? `前往${walk.destination}`
    : walk?.phase === 'arrived' ? `已到达${walk.destination}`
      : walk?.phase === 'blocked' ? (walk.at ? '无法到达该位置，试试别处' : '楼层内暂无可站立的位置')
        : '点击房间或地面移动'

  function toggle(roomId: string | null) {
    onSelectRoom(selectedRoom === roomId ? null : roomId)
  }

  function point(clientX: number, clientY: number): [number, number] {
    const bounds = viewport.current?.getBoundingClientRect()
    return [clientX - (bounds?.left ?? 0), clientY - (bounds?.top ?? 0)]
  }

  function startDrag(event: ReactPointerEvent<HTMLElement>, source: OfficeDragSource) {
    const scene = engine.current
    const stage = viewport.current
    if (!editing || !scene || !stage || editing.disabled || event.button !== 0) return
    stopDrag.current()
    dragged.current = false
    const { clientX, clientY, pointerId } = event
    const origin = scene.floorPoint(...point(clientX, clientY))
    let moved = false

    function plan(pointer: PointerEvent) {
      const bounds = stage!.getBoundingClientRect()
      if (pointer.clientX < bounds.left || pointer.clientX >= bounds.right
        || pointer.clientY < bounds.top || pointer.clientY >= bounds.bottom) return null
      const floor = scene!.floorPoint(...point(pointer.clientX, pointer.clientY))
      return floor ? editing!.plan(source, floor, origin) : null
    }
    function move(pointer: PointerEvent) {
      if (pointer.pointerId !== pointerId) return
      if (!moved) {
        if (Math.hypot(pointer.clientX - clientX, pointer.clientY - clientY) < 5) return
        moved = true
        dragged.current = true
        stage!.dataset.dragging = 'true'
        scene!.beginPreview(source)
      }
      scene!.showPreview(plan(pointer))
    }
    function finish(pointer: PointerEvent) {
      if (pointer.pointerId !== pointerId) return
      const placement = moved ? plan(pointer) : null
      stop()
      if (placement) editing!.commit(source, placement)
    }
    function cancel(pointer: PointerEvent) {
      if (pointer.pointerId === pointerId) stop()
    }
    function stop() {
      delete stage!.dataset.dragging
      scene!.clearPreview()
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', finish, true)
      window.removeEventListener('pointercancel', cancel, true)
      window.removeEventListener('blur', stop)
      stopDrag.current = () => {}
      if (moved) window.setTimeout(() => { dragged.current = false }, 0)
    }
    stopDrag.current = stop
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', finish, true)
    window.addEventListener('pointercancel', cancel, true)
    window.addEventListener('blur', stop)
  }

  useImperativeHandle(editing?.controls, () => ({ startDrag, didDrag: () => dragged.current }))

  return (
    <div
      className="office-viewport"
      data-walking={walking || undefined}
      ref={viewport}
      data-seat-locked={seatLocked || undefined}
      data-wall-tool={editing?.wallTool || editing?.freeWalls?.active || undefined}
      onContextMenu={!editing ? event => {
        if (!(event.target instanceof HTMLCanvasElement)) return
        const at = point(event.clientX,event.clientY), seat = engine.current?.pickSeat(...at, 36)
        const roomId = seat?.roomId ?? engine.current?.pick(...at)
        if (!roomId) return
        event.preventDefault()
        setContext({ x:event.clientX,y:event.clientY,roomId,seatIndex:seat?.seatIndex,occupant:seat?.occupant })
      } : undefined}
      onPointerDown={editing ? (event) => {
        if (!(event.target instanceof HTMLCanvasElement)) return
        if (editing.wallTool) {
          if (event.button !== 0 || editing.disabled) return
          stopDrag.current()
          const pointerId=event.pointerId
          const start = engine.current?.floorPoint(...point(event.clientX,event.clientY))
          if (!start) return
          event.preventDefault(); dragged.current=true
          const boundary=rooms.find(room=>start.x>=room.frame.x&&start.x<=room.frame.x+room.frame.width&&start.y>=room.frame.y&&start.y<=room.frame.y+room.frame.height)?.frame??{x:0,y:0,width:layout.width,height:layout.height}
          const move = (e:PointerEvent) => {
            if(e.pointerId!==pointerId)return
            const end=engine.current?.floorPoint(...point(e.clientX,e.clientY));if(!end)return
            const horizontal=Math.abs(end.x-start.x)>Math.abs(end.y-start.y)
            const a=engine.current?.screenPoint(horizontal?boundary.x:start.x,horizontal?start.y:boundary.y)
            const b=engine.current?.screenPoint(horizontal?boundary.x+boundary.width:start.x,horizontal?start.y:boundary.y+boundary.height)
            const guide=wallGuide.current,line=guide?.querySelector('line')
            if(a&&b&&guide&&line){guide.style.display='block';for(const [name,value] of Object.entries({x1:a.left,y1:a.top,x2:b.left,y2:b.top}))line.setAttribute(name,String(value))}
          }
          const stop = () => { window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',stop);window.removeEventListener('blur',stop);if(wallGuide.current)wallGuide.current.style.display='none';stopDrag.current=()=>{};setTimeout(()=>{dragged.current=false},0) }
          const finish = (e:PointerEvent) => { if(e.pointerId!==pointerId)return;const end=engine.current?.floorPoint(...point(e.clientX,e.clientY));stop();if(end && Math.hypot(e.clientX-event.clientX,e.clientY-event.clientY)>12)editing.partition?.(start,end) }
          stopDrag.current=stop;window.addEventListener('pointermove',move);window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',stop);window.addEventListener('blur',stop)
          return
        }
        dragged.current = false
        const source = engine.current?.pickEditable(...point(event.clientX, event.clientY))
        if (source) startDrag(event, source)
      } : undefined}
      onClick={(event) => {
        if (!(event.target instanceof HTMLCanvasElement) || event.detail > 1) return
        const at = point(event.clientX, event.clientY)
        if (editing) {
          if (!editing.disabled && !dragged.current) editing.select(engine.current?.pickEditable(...at))
        } else if (walking) engine.current?.walkAt(...at)
        else {
          const seat = onSeat && !seatBusy ? engine.current?.pickSeat(...at) : undefined
          if (seat && (!seat.occupant || seat.occupant === meId)) onSeat?.(seat.roomId, seat.seatIndex, seat.occupant !== meId)
          else toggle(engine.current?.pick(...at) ?? null)
        }
      }}

    >
      {graphicsUnavailable && (canEdit || rooms.length > 0) && (
        <div className="office-webgl-fallback">
          <LaptopMinimal size={24} strokeWidth={1.5} />
          <strong>当前窗口无法渲染 3D 办公室</strong>
          <span>{editing ? '可从右侧「房间属性」选择房间并修改设置。' : '可从概览打开房间，查看成员与在岗状态。'}</span>
        </div>
      )}

      {!rooms.length && !canEdit && <div className="office-webgl-fallback">当前楼层暂无房间。</div>}

      {(canEdit || rooms.length > 0) && !graphicsUnavailable && (
        <div className="office-overlay">
          {overlay && editing?.resize?.map((target) => {
            const { x, y, width, height } = target.frame
            const origin = engine.current?.screenPoint(x, y)
            const end = engine.current?.screenPoint(x + width, y + height)
            if (!origin || !end?.visible) return null
            return <OfficeResizeHandle key={target.id} target={target}
              screen={{ left: origin.left, top: origin.top, width: end.left - origin.left, height: end.top - origin.top }} />
          })}
          {gmv && overlay?.gmv && !walking && <button type="button" className="office-screen-target" data-office-gmv={gmv.roomId}
            style={overlay.gmv} title="查看经营看板" aria-label={`今日 GMV ${gmv.value ?? gmv.status}，查看经营看板`} onClick={onOpenGmv} />}
          {overlay?.rooms.filter(({ at }) => at.visible).map(({ room, present, at }) => {
            const mentioned = mentionedRooms?.has(room.id) || undefined
            return (
              <div key={room.id} className="office-room-marker" style={{ left: at.left, top: at.top }}
                data-selected={selectedRoom === room.id || undefined} data-mentioned={mentioned}
              >
                <button type="button" className="office-room-label ui-press" data-room={room.id}
                  aria-pressed={selectedRoom === room.id} style={{ borderLeftColor: room.accent }}
                  onPointerDown={editing ? (event) => startDrag(event, { kind: 'room', roomId: room.id }) : undefined}
                  title="选择房间 · 右键更多操作"
                  onContextMenu={!editing ? event=>{event.preventDefault();setContext({x:event.clientX,y:event.clientY,roomId:room.id})}:undefined}
                  onClick={(event) => {
                    if (event.detail > 1) return
                    if (editing) {
                      if (!editing.disabled && !dragged.current) editing.select({ kind: 'room', roomId: room.id })
                    } else if (walking) engine.current?.walkToRoom(room.id)
                    else toggle(room.id)
                  }}
                >
                  <strong>{room.name}</strong>
                  {present > 0 && <span className="office-room-count">{present} 在岗</span>}
                  {slots[room.id] && <span data-slot-chip title={slots[room.id].name}>看板</span>}
                </button>

              </div>
            )
          })}
          {editing?.selectedFurniture && overlay?.furnitureBounds && <div data-selected-furniture={editing.selectedFurniture} className="office-furniture-outline" style={overlay.furnitureBounds}><i/><i/><i/><i/></div>}
          {onSeat && !editing && overlay?.seats.filter(seat => seat.at.visible && !seat.occupant && seat.roomId === selectedRoom).map(seat => <button
            type="button" key={seat.roomId + ':' + seat.seatIndex} className="office-seat-action" data-seat-target={seat.roomId+':'+seat.seatIndex}
            disabled={seatBusy} aria-label={`空座位 ${seat.seatIndex + 1}，入座`} title="点击入座" style={{ left: seat.at.left, top: seat.at.top }}
            onContextMenu={event=>{event.preventDefault();setContext({x:event.clientX,y:event.clientY,roomId:seat.roomId,seatIndex:seat.seatIndex})}}
            onClick={() => onSeat(seat.roomId, seat.seatIndex, true)}>＋</button>)}
          {overlay?.people.filter(({ at }) => at.visible).map(({ member, at }) => {
            const preview = member.id !== meId && chat?.canChatWith(member.id) ? chat?.previewPerson : undefined
            const ownSeat = member.id === meId && onSeat ? overlay.seats.find(seat => seat.occupant === meId) : undefined
            const Name = preview || ownSeat ? 'button' : 'span'
            return (
            <span
              key={member.id}
              data-person={member.id}
              className="office-person-label"
              data-me={member.id === meId || undefined}
              data-highlighted={member.id === focusedMember || undefined}
              style={{ left: at.left, top: at.top }}
            >
              <Name className="office-person-name" type={preview || ownSeat ? 'button' : undefined}
                title={ownSeat ? '点击离座' : preview ? `右键与 ${member.name} 私聊` : undefined}
                aria-haspopup={preview ? 'dialog' : undefined}
                onContextMenu={!editing ? (event) => {
                  event.preventDefault()
                  const seat=overlay?.seats.find(row=>row.occupant===member.id)
                  setContext({x:event.clientX,y:event.clientY,roomId:member.roomId,seatIndex:seat?.seatIndex,occupant:member.id})
                } : undefined}
                onClick={ownSeat ? () => { if (!seatBusy) onSeat?.(ownSeat.roomId, ownSeat.seatIndex, false) } : preview ? (event) => {
                  if (event.detail === 0) preview(member.id, event.currentTarget)
                  else if (walking) engine.current?.walkAt(...point(event.clientX, event.clientY))
                  else toggle(member.roomId)
                } : undefined}
              >
                {member.id === meId ? `我 · ${member.name}` : member.name}
                <i style={{ background: PRESENCE_META[member.presence].color }} />
              </Name>
              {mode === 'tasks' && member.presence !== 'away' && (
                <span className="office-person-task">{member.current}</span>
              )}
            </span>
            )
          })}
          {walk?.at?.visible && (
            <span
              className="office-person-label"
              data-walker
              data-me
              style={{ left: walk.at.left, top: walk.at.top }}
            >
              <span className="office-person-name">我 · {meName}</span>
            </span>
          )}
        </div>
      )}
      <svg ref={wallGuide} className="office-partition-guide" style={{display:'none'}} aria-hidden="true"><line/></svg>
      {editing?.freeWalls&&<OfficeFreeWalls stage={viewport} engine={engine} layout={layout} editing={editing.freeWalls} overlay={overlay}/>}
      <DropdownMenu open={!!context} onOpenChange={open=>{if(!open)setContext(undefined)}} modal={false}>
        <DropdownMenuTrigger asChild><button aria-hidden="true" tabIndex={-1} className="office-context-anchor" style={{left:context?.x??0,top:context?.y??0}} /></DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={0} className="office-context-menu">
          <div className="office-context-heading">{rooms.find(room=>room.id===context?.roomId)?.name}{context?.seatIndex!==undefined ? ` · 工位 ${context.seatIndex+1}` : ''}</div>
          {context?.occupant && context.occupant!==meId && chat?.canChatWith(context.occupant) && <DropdownMenuItem onSelect={()=>{const anchor=viewport.current;if(anchor)chat.previewPerson(context.occupant!,anchor)}}><MessageCircle/>发起私聊</DropdownMenuItem>}
          {chat && context && <DropdownMenuItem onSelect={()=>chat.openRoom(context.roomId)}><MessageCircle/>进入房间群聊</DropdownMenuItem>}
          {context?.seatIndex!==undefined && onSeat && (!context.occupant||context.occupant===meId) && <DropdownMenuItem disabled={seatBusy} onSelect={()=>onSeat(context.roomId,context.seatIndex!,context.occupant!==meId)}>{context.occupant===meId?<LogOut/>:<Armchair/>}{context.occupant===meId?'离开座位':'在此入座'}</DropdownMenuItem>}
          {context?.seatIndex!==undefined && onAssignSeat && <DropdownMenuItem onSelect={()=>onAssignSeat(context.roomId,context.seatIndex!)}><UserPlus/>分配此工位</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
      {walking && !graphicsUnavailable && (
        <div className="office-walk-status" role="status" data-walk-room={walk?.at ? walk.room?.id ?? 'corridor' : undefined}>
          {walk?.at && walk.phase !== 'arrived' && <strong>{walk.room?.name ?? '走廊'}</strong>}
          <span>{walkMessage}</span>
        </div>
      )}
    </div>
  )
}

