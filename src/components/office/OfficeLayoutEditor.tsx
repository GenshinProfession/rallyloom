import { X, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WorkspaceHeader } from '@/components/ui/workspace-header'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { LayoutState } from '@/lib/store/types'
import { OfficeAssetLibrary } from './OfficeAssetLibrary'
import type { OfficeResizeTarget } from './OfficeResizeHandle'
import { OfficeScene, type OfficeSceneControls } from './OfficeScene'
import { OfficeRoomSurfaces } from './OfficeRoomSurfaces'
import { referenceOffice } from './reference-layout'
import { snapRoom } from './rooms/snap-room'
import { getRoomDoorway, resolveOfficeLayout, roomTemplates, type RoomPlacement } from './rooms'
import type { FurnitureKind, RoomFrame } from './rooms/api'
import { FURNITURE, fitFurniture, furnitureFits, furnitureSize } from './rooms/placed-furniture'
import { OFFICE_TEMPLATES } from './office-assets'
import { NEW_ROOM_SIZE, type FloorPoint, type OfficeDragSource, type OfficePlacement } from './office-drag'
import './office-editor.css'

const emptyRoster = new Map()
const frames = { x: '横坐标', y: '纵坐标', width: '宽度', height: '高度' } as const
const intersects = (a: RoomFrame, b: RoomFrame) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
const WORKSTATION_TEMPLATES = new Set(['desk-grid', 'studio', 'fulfillment', 'support-pods', 'showroom'])
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
  const [draft, setDraft] = useState(layout)
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
  const [confirmReference, setConfirmReference] = useState(false)
  const selected = draft.rooms.find((room) => room.id === selection)
  const selectedItem = selected?.furniture?.find((item) => item.id === furnitureSelection)
  const workstationGrid = selected && WORKSTATION_TEMPLATES.has(selected.template) ? deskGrid(selected.frame) : null
  const validation = useMemo(() => {
    let rooms: ReturnType<typeof resolveOfficeLayout> = []
    try {
      if (draft.width < 500 || draft.height < 300 || draft.width > 4000 || draft.height > 4000)
        throw new Error('画布宽度须为 500 至 4000，高度须为 300 至 4000。')
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

  function updateRoom(id: string, update: (room: RoomPlacement) => RoomPlacement) {
    setDraft((current) => ({ ...current, rooms: current.rooms.map((room) => room.id === id ? update(room) : room) }))
  }

  function selectRoom(id: string | undefined) {
    setSelection(id)
    if (id) setInspector('properties')
    setFurnitureSelection(undefined)
  }

  function changeDeskCount(room: RoomPlacement, count: number) {
    const seats = deskGrid(room.frame)
    if (!Number.isInteger(count) || count < 0 || count > seats.length) {
      setMessage(`当前房间尺寸可摆放 0 到 ${seats.length} 张办公桌。`)
      return
    }
    updateRoom(room.id, (previous) => ({ ...previous, useTemplateFurniture: true, seats: seats.slice(0, count) }))
    setMessage('')
  }

  function selectModel(source?: OfficeDragSource) {
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
      x: (requested.x - frame.x) / frame.width,
      y: (requested.y - frame.y) / frame.height,
    }, frame)
    const total = draft.rooms.reduce((count, room) => count + (room.furniture?.length ?? 0), 0)
    const valid = (sourceRoom === target || (target.furniture?.length ?? 0) < 60)
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
      if (source.kind === 'new-room') insertRoom(source.template as keyof typeof OFFICE_TEMPLATES, placement.frame)
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
      return { ...room, furniture: room.id === targetId ? [...furniture, item] : furniture }
    }) }))
    selectModel({ kind: 'furniture', roomId: targetId, id: item.id })
  }

  function resizeRoom(id: string, frame: RoomFrame) {
    updateRoom(id, (room) => {
      const validSize = frame.width >= 100 && frame.height >= 100
      const count = room.seats?.length
      const positions = validSize && count !== undefined && WORKSTATION_TEMPLATES.has(room.template) ? deskGrid(frame) : undefined
      return { ...room, frame,
        seats: positions && count !== undefined && positions.length >= count ? positions.slice(0, count) : room.seats,
        furniture: validSize ? room.furniture?.map((item) => fitFurniture(item, frame)) : room.furniture,
      }
    })
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
    if (selected) {
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
    setDraft((current) => ({ ...current, rooms: [...current.rooms, { id, frame, template, name: OFFICE_TEMPLATES[template] }] }))
    selectRoom(id)
    setMessage('')
    setConfirmEmpty(false)
  }

  function addRoom(template: keyof typeof OFFICE_TEMPLATES) {
    if (busy || draft.rooms.length >= 80) return
    const { width, height } = NEW_ROOM_SIZE
    for (let y = 0; y + height <= draft.height; y += 20) {
      for (let x = 0; x + width <= draft.width; x += 20) {
        const frame = { x, y, width, height }
        if (!draft.rooms.some((room) => intersects(room.frame, frame))) { insertRoom(template, frame); return }
      }
    }
    setMessage('画布没有足够的空位。请扩大画布或调整现有房间。')
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
    try { await onPublish({ ...draft, assignments: publishedAssignments }); onClose() }
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
            <div className="office-editor-actions">
              <label>画布宽 <input type="number" min={500} max={4000} value={draft.width} disabled={busy} onChange={(event) => setDraft({ ...draft, width: Number(event.target.value) })} /></label>
              <label>画布高 <input type="number" min={300} max={4000} value={draft.height} disabled={busy} onChange={(event) => setDraft({ ...draft, height: Number(event.target.value) })} /></label>
              <label>缩放 <input type="range" min={65} max={165} value={sceneZoom} onChange={(event) => setSceneZoom(Number(event.target.value))} /></label>
              <button type="button" disabled={busy || !draft.rooms.length} onClick={() => {
                setDraft({ ...draft, rooms: [] }); setSelection(undefined); setFurnitureSelection(undefined); setMessage('')
              }}>清空草稿</button>
              <button type="button" disabled={busy} onClick={() => {
                if (draft.rooms.length && !confirmReference) { setConfirmReference(true); return }
                const reference = referenceOffice()
                setDraft({ ...reference, revision: draft.revision })
                selectRoom('ref-open')
                setConfirmReference(false)
                setMessage('')
              }}>{confirmReference ? '确认替换为参考户型' : '参考户型'}</button>
              {confirmReference && <button type="button" onClick={() => setConfirmReference(false)}>取消替换</button>}
            </div>
            {confirmReference && <p className="office-editor-seat-notice">此操作会替换当前草稿的房间和家具，发布后生效。</p>}
            <div className="office-editor-preview" data-office-editor-3d>
              <OfficeScene layout={draft} rooms={validation.rooms} roster={emptyRoster} slots={{}}
                selectedRoom={selection ?? null}
                onSelectRoom={(id) => selectRoom(id ?? undefined)}
                focusedMember={null} meId={null} meName="" mode="daily" zoom={sceneZoom} walking={false}
                editing={{ controls: sceneControls, disabled: busy, resize: resizeTargets, plan: planModel,
                  commit: commitModel, select: selectModel,
                }} />
            </div>
          </section>
          <aside ref={inspectorPanel} className="office-editor-sidebar">
            <div className="office-inspector-tabs" role="group" aria-label="编辑侧栏">
              <button type="button" aria-pressed={inspector === 'properties'} onClick={() => setInspector('properties')}>对象属性</button>
              <button type="button" aria-pressed={inspector === 'assets'} onClick={() => setInspector('assets')}>添加素材</button>
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
              <h2>{FURNITURE[selectedItem.kind].label}</h2>
              <button type="button" onClick={() => setFurnitureSelection(undefined)}>返回「{selected.name}」房间属性</button>
              {selectedItem.kind === 'desk' && <div className="office-editor-dimensions">
                {(['width', 'depth'] as const).map((dimension) => <label key={dimension}>{dimension === 'width' ? '桌面宽' : '桌面深'}
                  <input type="number" min={20} max={240} defaultValue={furnitureSize(selectedItem)[dimension]}
                    key={selectedItem.id + dimension + furnitureSize(selectedItem)[dimension]}
                    onBlur={(event) => {
                      const value = event.currentTarget.valueAsNumber
                      const previous = furnitureSize(selectedItem)
                      if (Number.isFinite(value) && value >= 20 && value <= 240)
                        updateRoom(selected.id, (room) => ({ ...room, furniture: room.furniture?.map((item) =>
                          item.id === selectedItem.id ? fitFurniture({ ...item, size: { width: previous.width, depth: previous.depth, [dimension]: value } }, room.frame) : item) }))
                      event.currentTarget.value = String(previous[dimension])
                    }}
                    onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} disabled={busy} />
                </label>)}
              </div>}
              <label>旋转角度 <input type="number" min={0} max={359} value={selectedItem.rotation} disabled={busy}
                onChange={(event) => {
                  const rotation = clamp(Number(event.target.value), 0, 359)
                  updateRoom(selected.id, (room) => ({ ...room, furniture: room.furniture?.map((item) =>
                    item.id === selectedItem.id ? fitFurniture({ ...item, rotation }, room.frame) : item) }))
                }} /></label>
              <button type="button" disabled={busy} onClick={() => {
                updateRoom(selected.id, (room) => ({ ...room, furniture: room.furniture?.filter(({ id }) => id !== selectedItem.id) }))
                setFurnitureSelection(undefined)
              }}>移除家具</button>
            </section>}
            {inspector === 'properties' && !selectedItem && <section>
              <h2>房间属性</h2>
              <label>房间 <select value={selected?.id ?? ''} disabled={busy || !draft.rooms.length} onChange={(event) => selectRoom(event.target.value || undefined)}>
                <option value="">选择房间</option>
                {draft.rooms.map((room) => <option key={room.id} value={room.id}>{room.name || '未命名'}</option>)}
              </select></label>
              {selected && <>
                <label>名称 <input value={selected.name} maxLength={80} disabled={busy} onChange={(event) => {
                  const name = event.target.value
                  updateRoom(selected.id, (room) => ({ ...room, name }))
                }} /></label>
                {workstationGrid && <>
                  <label>办公桌数量 <input aria-label="办公桌数量" type="number" min={0}
                    max={Math.max(workstationGrid.length, selected.seats?.length ?? 0)}
                    key={selected.id + ':' + (selected.seats?.length ?? 'default')}
                    defaultValue={selected.seats?.length ?? roomTemplates.get(selected.template)?.seats.length ?? 0}
                    disabled={busy}
                    onBlur={(event) => {
                      const value = event.target.valueAsNumber
                      const oldCount = selected.seats?.length ?? roomTemplates.get(selected.template)?.seats.length ?? 0
                      if (value !== oldCount) changeDeskCount(selected, value)
                      event.target.value = String(oldCount)
                    }}
                    onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} /></label>
                  <p className="text-muted-foreground">每张桌子对应一个工位，改变数量后按房间大小自动排布。</p>
                </>}
                {selected.template !== 'empty' && <label><input type="checkbox" checked={selected.useTemplateFurniture !== false} disabled={busy} onChange={(event) => {
                  const checked = event.target.checked
                  updateRoom(selected.id, (room) => ({ ...room, useTemplateFurniture: checked }))
                }} />显示模板家具</label>}
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
                <button type="button" disabled={busy} onClick={() => removeRoom(selected.id)}>删除房间</button>
                {!!selected.furniture?.length && <div className="office-editor-palette">
                  {selected.furniture.map((item, index) => <button type="button" key={item.id}
                    aria-pressed={furnitureSelection === item.id} onClick={() => setFurnitureSelection(item.id)}>
                    {FURNITURE[item.kind].label} {index + 1}</button>)}
                </div>}
              </>}
            </section>}
          </aside>
        </div>
    </main>
  )
}
