import { useEffect, useImperativeHandle, useRef, useState, type PointerEvent as ReactPointerEvent, type Ref } from 'react'
import { AtSign, LaptopMinimal, MessageCircle } from 'lucide-react'
import { PRESENCE_META, type Member } from '@/data/office'
import type { ChatMessage } from '@/lib/chat/types'
import type { DataSlots } from '@/lib/store/types'
import type { OfficeLayout, ResolvedRoom } from './rooms/api'
import { createOfficeView, type OfficeOverlay, type OfficeViewState } from './three/view'
import { OfficeResizeHandle, type OfficeResizeTarget } from './OfficeResizeHandle'
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
  onOpenGmv?: () => void
  editing?: {
    selectedFurniture?: string
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
  layout, rooms, roster, slots, selectedRoom, onSelectRoom, focusedMember, meId, meName, mode, zoom, walking, mentionedRooms, gmv, onOpenGmv, chat, editing, seats, onSeat, seatBusy,
}: OfficeSceneProps) {
  const viewport = useRef<HTMLDivElement>(null)
  const engine = useRef<ReturnType<typeof createOfficeView>>(null)
  const view = useRef<OfficeViewState>({ selectedRoom, mode, zoom, walking, mentionedRooms, gmv, seats, selectedFurniture:editing?.selectedFurniture })
  const [overlay, setOverlay] = useState<OfficeOverlay>()
  const [graphicsUnavailable, setGraphicsUnavailable] = useState(false)
  const stopDrag = useRef<() => void>(() => {})
  const dragged = useRef(false)
  const canEdit = Boolean(editing)

  useEffect(() => {
    if (!viewport.current || (!rooms.length && !canEdit)) return
    const next = createOfficeView(viewport.current, layout, rooms, roster, meId, { ...view.current, seats, selectedFurniture:editing?.selectedFurniture }, setOverlay, canEdit)
    engine.current = next
    setGraphicsUnavailable(!next)
    return () => {
      stopDrag.current()
      engine.current = null
      next?.dispose()
    }
  }, [layout, rooms, roster, meId, canEdit, seats])

  useEffect(() => {
    view.current = { selectedRoom, mode, zoom, walking, mentionedRooms, gmv, seats, selectedFurniture:editing?.selectedFurniture }
    engine.current?.draw(view.current)
  }, [selectedRoom, mode, zoom, walking, mentionedRooms, gmv, seats, editing?.selectedFurniture])

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
      onPointerDown={editing ? (event) => {
        if (!(event.target instanceof HTMLCanvasElement)) return
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
      onDoubleClick={(event) => {
        if (!chat || walking || !(event.target instanceof HTMLCanvasElement)) return
        const roomId = engine.current?.pick(...point(event.clientX, event.clientY))
        if (roomId) chat.openRoom(roomId)
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
            const mentionLabel = chat?.roomMention(room.id) === 'all' ? '全体提醒' : '提到了你'
            return (
              <div key={room.id} className="office-room-marker" style={{ left: at.left, top: at.top }}
                data-selected={selectedRoom === room.id || undefined} data-mentioned={mentioned}
              >
                <button type="button" className="office-room-label ui-press" data-room={room.id}
                  aria-pressed={selectedRoom === room.id} style={{ borderLeftColor: room.accent }}
                  onPointerDown={editing ? (event) => startDrag(event, { kind: 'room', roomId: room.id }) : undefined}
                  title={chat && !walking ? `双击进入「${room.name}」频道` : undefined}
                  onClick={(event) => {
                    if (event.detail > 1) return
                    if (editing) {
                      if (!editing.disabled && !dragged.current) editing.select({ kind: 'room', roomId: room.id })
                    } else if (walking) engine.current?.walkToRoom(room.id)
                    else toggle(room.id)
                  }}
                  onDoubleClick={() => { if (!walking) chat?.openRoom(room.id) }}
                >
                  <strong>{room.name}</strong>
                  {present > 0 && <span className="office-room-count">{present} 在岗</span>}
                  {slots[room.id] && <span data-slot-chip title={slots[room.id].name}>看板</span>}
                </button>
                {chat && (
                  <button type="button" className="office-room-quick ui-press" data-room-quick={room.id} data-mentioned={mentioned}
                    aria-label={mentioned ? `${room.name} · ${mentionLabel}，打开快速聊天` : `${room.name}快速聊天`}
                    title="单击快速聊天 · 双击进入频道" aria-haspopup="dialog"
                    onClick={(event) => { if (event.detail < 2) chat.previewRoom(room.id, event.currentTarget) }}
                    onDoubleClick={() => chat.openRoom(room.id)}
                  >
                    {mentioned ? <><AtSign size={12} /> <span>{mentionLabel}</span></> : <MessageCircle size={12} />}
                  </button>
                )}
              </div>
            )
          })}
          {editing?.selectedFurniture && overlay?.furnitureBounds && <div data-selected-furniture={editing.selectedFurniture} className="office-furniture-outline" style={overlay.furnitureBounds}><i/><i/><i/><i/></div>}
          {onSeat && !editing && overlay?.seats.filter(seat => seat.at.visible && !seat.occupant && seat.roomId === selectedRoom).map(seat => <button
            type="button" key={seat.roomId + ':' + seat.seatIndex} className="office-seat-action" data-seat-target={seat.roomId+':'+seat.seatIndex}
            disabled={seatBusy} aria-label={`空座位 ${seat.seatIndex + 1}，入座`} title="点击入座" style={{ left: seat.at.left, top: seat.at.top }}
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
                onContextMenu={preview ? (event) => {
                  event.preventDefault()
                  preview(member.id, event.currentTarget)
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
      {walking && !graphicsUnavailable && (
        <div className="office-walk-status" role="status" data-walk-room={walk?.at ? walk.room?.id ?? 'corridor' : undefined}>
          {walk?.at && walk.phase !== 'arrived' && <strong>{walk.room?.name ?? '走廊'}</strong>}
          <span>{walkMessage}</span>
        </div>
      )}
    </div>
  )
}

