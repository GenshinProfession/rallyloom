import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { WALL_HEIGHT } from './rooms/api'
import type { OfficeLayout, PlanPoint, WallSegment } from './rooms/api'
import { MIN_WALL_LENGTH, snapWallPointDetailed, wallLength, type WallGuide, type WallSnapKind, type WallSnapResult } from './rooms/free-walls'
import { wallNodes } from './rooms/weld-walls'
import type { createOfficeView, OfficeOverlay } from './three/view'

type Scene = NonNullable<ReturnType<typeof createOfficeView>>

export interface FreeWallEditing {
  active: boolean
  selected?: string
  disabled: boolean
  ortho?: boolean
  grid?: number
  unitsPerMeter?: number
  add: (wall: WallSegment) => boolean
  update: (wall: WallSegment, mode?: 'move' | 'reshape') => void
  remove: (id: string) => void
  select: (id: string) => void
  restore?: (walls: readonly WallSegment[]) => void
  doorTool?: boolean
  finish: () => void
  message: (text: string, tone?: 'info' | 'error') => void
}

interface HudState {
  left: number
  top: number
  meters: number
  angle: number
  label: string
  closed: boolean
  valid: boolean
}
interface MarkerState {
  left: number
  top: number
  kind: WallSnapKind
}

const MARKER_CLASS: Record<WallSnapKind, string> = {
  free: 'is-free',
  grid: 'is-grid',
  endpoint: 'is-endpoint',
  intersection: 'is-junction',
  wall: 'is-wall',
  close: 'is-close',
  axis: 'is-axis',
  polar: 'is-axis',
}

export function OfficeFreeWalls({ stage, engine, layout, editing }: {
  stage: RefObject<HTMLDivElement | null>
  engine: RefObject<Scene | null>
  layout: OfficeLayout
  editing: FreeWallEditing
  overlay?: OfficeOverlay
}) {
  const latest = useRef({ layout, editing })
  latest.current = { layout, editing }
  const chain = useRef<PlanPoint | undefined>(undefined)
  const chainStart = useRef<PlanPoint | undefined>(undefined)
  const chainPoints = useRef<PlanPoint[]>([])
  const chainIds = useRef<string[]>([])
  const chainBase = useRef<WallSegment[] | undefined>(undefined)
  const cancel = useRef<() => void>(() => {})
  const skipClick = useRef(false)
  const cursor = useRef<{ left: number; top: number } | undefined>(undefined)
  const handles = useRef<Record<string, HTMLButtonElement | null>>({})
  const pendingMessage = useRef('')

  const [hud, setHud] = useState<HudState | null>(null)
  const [marker, setMarker] = useState<MarkerState | null>(null)
  const [guides, setGuides] = useState<WallGuide[]>([])
  const [ray, setRay] = useState<{ angle: number; origin: PlanPoint } | null>(null)
  const [chainActive, setChainActive] = useState(false)

  const at = (event: PointerEvent) => {
    const bounds = stage.current?.getBoundingClientRect()
    return bounds ? engine.current?.floorPoint(event.clientX - bounds.left, event.clientY - bounds.top) : null
  }
  const inside = (point: PlanPoint) => point.x >= 0 && point.y >= 0 && point.x <= latest.current.layout.width && point.y <= latest.current.layout.height
  const preview = (wall?: WallSegment) => engine.current?.previewWall(wall)
  const unitsPerMeter = () => latest.current.editing.unitsPerMeter ?? 50

  function pixelsPerUnit(point: PlanPoint) {
    const first = engine.current?.screenPoint(point.x, point.y)
    const second = engine.current?.screenPoint(point.x + 100, point.y)
    return first && second ? Math.max(0.02, Math.hypot(first.left - second.left, first.top - second.top) / 100) : 1
  }

  /** Shared magnet + overlay feedback for every wall gesture. */
  function snapFor(point: PlanPoint, origin: PlanPoint | undefined, modifiers: { shift?: boolean; ignoreWallIds?: string[] }): WallSnapResult {
    return snapWallPointDetailed(point, latest.current.layout, {
      origin,
      chainStart: chainStart.current,
      shift: modifiers.shift,
      ortho: latest.current.editing.ortho,
      polar: true,
      step: 15,
      grid: latest.current.editing.grid ?? 0,
      unitsPerMeter: unitsPerMeter(),
      pixelsPerUnit: pixelsPerUnit(point),
      ignoreWallIds: modifiers.ignoreWallIds,
    })
  }

  function showFeedback(result: WallSnapResult, screen: { left: number; top: number } | undefined, origin: PlanPoint | undefined) {
    setGuides(result.guides)
    setRay(result.rayAngle !== undefined && origin ? { angle: result.rayAngle, origin } : null)
    if (!screen) {
      setMarker(null)
      return
    }
    setMarker({ left: screen.left, top: screen.top, kind: result.kind })
    if (origin) {
      setHud({
        left: Math.min(screen.left, (stage.current?.clientWidth ?? screen.left) - 150) + 16,
        top: Math.max(12, screen.top - 44),
        meters: result.meters,
        angle: result.angle,
        label: result.closed ? '闭合区域' : result.label,
        closed: result.closed,
        valid: result.valid,
      })
    } else {
      setHud(null)
    }
  }

  function clearFeedback() {
    setHud(null)
    setMarker(null)
    setGuides([])
    setRay(null)
  }

  function resetChain() {
    cancel.current()
    chain.current = undefined
    chainStart.current = undefined
    chainPoints.current = []
    chainIds.current = []
    chainBase.current = undefined
    setChainActive(false)
    preview()
    clearFeedback()
  }

  function startPoint(point: PlanPoint) {
    chain.current = point
    chainStart.current = point
    chainPoints.current = [point]
    chainIds.current = []
  }

  /** Auto-close a nearly-closed loop, the way plan editors finish a room. */
  function finishChain(autoClose = true) {
    const start = chainStart.current
    const end = chain.current
    let closed = false
    if (autoClose && start && end && chainIds.current.length >= 2) {
      const gap = Math.hypot(end.x - start.x, end.y - start.y)
      if (gap >= MIN_WALL_LENGTH && gap <= 26) {
        const closing: WallSegment = { id: crypto.randomUUID(), start: { ...end }, end: { ...start }, height: WALL_HEIGHT, thickness: 6, finish: 'solid' }
        closed = latest.current.editing.add(closing)
        if (closed) latest.current.editing.message('已自动闭合区域')
      }
    }
    if (!closed && pendingMessage.current) latest.current.editing.message(pendingMessage.current)
    pendingMessage.current = ''
    resetChain()
    latest.current.editing.finish()
  }

  function undoLastSegment() {
    const id = chainIds.current.pop()
    if (!id) return
    latest.current.editing.remove(id)
    chainPoints.current.pop()
    chain.current = chainPoints.current[chainPoints.current.length - 1]
    chainStart.current = chainPoints.current[0]
    preview()
    latest.current.editing.message('已撤回上一段墙')
  }

  /** 取消整组连线：把这一组画下的墙全部退回画之前的快照。 */
  function cancelChain() {
    const base = chainBase.current
    const restore = latest.current.editing.restore
    if (base && restore) {
      restore(base)
      latest.current.editing.message('已取消这组连线，可以从头再画')
    } else {
      latest.current.editing.message('已取消当前连线')
    }
    resetChain()
    latest.current.editing.finish()
  }

  function wallProjection(point: PlanPoint, wall: WallSegment) {
    const dx = wall.end.x - wall.start.x
    const dy = wall.end.y - wall.start.y
    const lengthSquared = dx * dx + dy * dy
    const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - wall.start.x) * dx + (point.y - wall.start.y) * dy) / lengthSquared)) : 0
    return { t, length: Math.sqrt(lengthSquared), distance: Math.hypot(point.x - (wall.start.x + dx * t), point.y - (wall.start.y + dy * t)) }
  }

  /** 开门工具：点墙体放置门洞，再点同一个门洞可取消。 */
  function placeDoor(event: PointerEvent) {
    const point = at(event)
    if (!point) return
    event.preventDefault()
    event.stopPropagation()
    const walls = latest.current.layout.wallSegments ?? []
    const bounds = stage.current?.getBoundingClientRect()
    const picked = bounds ? engine.current?.pickWall(event.clientX - bounds.left, event.clientY - bounds.top) : undefined
    let best = walls.find((candidate) => candidate.id === picked)
    let bestDistance = Infinity
    for (const wall of walls) {
      const { distance } = wallProjection(point, wall)
      if (distance < bestDistance) { bestDistance = distance; best = wall }
    }
    if (!best || bestDistance > 36) {
      latest.current.editing.message('没有点到墙体：门洞只能开在独立墙段上，外围墙请在房间属性里设置出入口', 'error')
      return
    }
    const wall = best
    const { t, length } = wallProjection(point, wall)
    const width = Math.min(46, Math.max(26, Math.round(length * .18)))
    if (wall.opening && Math.abs(wall.opening.offset - t) * length <= wall.opening.width / 2 + 10) {
      latest.current.editing.update({ ...wall, opening: undefined })
      latest.current.editing.message('已取消这段门洞')
      return
    }
    const margin = (6 + width / 2) / Math.max(1, length)
    if (margin >= .5) {
      latest.current.editing.message('墙段太短，放不下门洞：请先加长墙体', 'error')
      return
    }
    const offset = Math.max(margin, Math.min(1 - margin, t))
    latest.current.editing.update({ ...wall, opening: { offset, width } })
    latest.current.editing.message(`已开门：${(width / unitsPerMeter()).toFixed(2)} m 宽，再点一次可取消`)
  }

  function transform(event: PointerEvent, wall: WallSegment, handle: 'start' | 'end' | 'body') {
    if (event.button !== 0 || latest.current.editing.disabled) return
    const origin = at(event)
    if (!origin) return
    event.preventDefault()
    event.stopPropagation()
    cancel.current()
    skipClick.current = true
    latest.current.editing.select(wall.id)
    let next = wall
    let moved = false
    const move = (e: PointerEvent) => {
      if (e.pointerId !== event.pointerId) return
      const point = at(e)
      if (!point) return
      moved = moved || Math.hypot(e.clientX - event.clientX, e.clientY - event.clientY) > 3
      const config = latest.current.layout
      if (handle === 'body') {
        const dx = Math.max(-Math.min(wall.start.x, wall.end.x), Math.min(config.width - Math.max(wall.start.x, wall.end.x), point.x - origin.x))
        const dy = Math.max(-Math.min(wall.start.y, wall.end.y), Math.min(config.height - Math.max(wall.start.y, wall.end.y), point.y - origin.y))
        next = { ...wall, start: { x: Math.round(wall.start.x + dx), y: Math.round(wall.start.y + dy) }, end: { x: Math.round(wall.end.x + dx), y: Math.round(wall.end.y + dy) } }
        setHud(null)
        setGuides([])
        setMarker(null)
      } else {
        const opposite = handle === 'start' ? wall.end : wall.start
        const snapped = snapFor(point, opposite, { shift: e.shiftKey, ignoreWallIds: [wall.id] })
        next = { ...wall, [handle]: snapped.point }
        const scene = engine.current?.screenPoint(snapped.point.x, snapped.point.y)
        showFeedback({ ...snapped, meters: wallLength(next) / unitsPerMeter(), angle: snapped.angle, length: wallLength(next) }, scene, opposite)
      }
      preview(next)
      for (const key of ['start', 'end'] as const) {
        const screen = engine.current?.screenPoint(next[key].x, next[key].y)
        const button = handles.current[key]
        if (screen && button) {
          button.style.left = screen.left + 'px'
          button.style.top = screen.top + 'px'
        }
      }
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', stop)
      window.removeEventListener('blur', stop)
      preview()
      clearFeedback()
      cancel.current = () => {}
    }
    const up = (e: PointerEvent) => {
      if (e.pointerId !== event.pointerId) return
      stop()
      if (moved && wallLength(next) >= MIN_WALL_LENGTH) latest.current.editing.update(next, handle === 'body' ? 'move' : 'reshape')
    }
    cancel.current = stop
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', stop)
    window.addEventListener('blur', stop)
  }

  useEffect(() => {
    const root = stage.current
    if (!root) return
    const pointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof HTMLCanvasElement) || latest.current.editing.disabled || event.button !== 0) return
      if (!latest.current.editing.active) {
        if (latest.current.editing.doorTool) {
          if (event.target instanceof HTMLCanvasElement) placeDoor(event)
          return
        }
        const bounds = root.getBoundingClientRect()
        const id = engine.current?.pickWall(event.clientX - bounds.left, event.clientY - bounds.top)
        const wall = latest.current.layout.wallSegments?.find((candidate) => candidate.id === id)
        if (wall) transform(event, wall, 'body')
        return
      }
      const point = at(event)
      if (!point || !inside(point)) return
      event.preventDefault()
      event.stopPropagation()
      cancel.current()
      skipClick.current = true

      const chaining = !!chain.current
      const start = chain.current ?? snapFor(point, undefined, {}).point
      let end = start
      let moved = false
      const make = (): WallSegment => ({ id: crypto.randomUUID(), start, end, height: WALL_HEIGHT, thickness: 6, finish: 'solid' })
      const move = (e: PointerEvent) => {
        if (e.pointerId !== event.pointerId) return
        const raw = at(e)
        if (!raw) return
        const dragging = Math.hypot(e.clientX - event.clientX, e.clientY - event.clientY) > 4
        moved = moved || dragging
        const snapped = snapFor(raw, chaining ? start : undefined, { shift: e.shiftKey })
        end = snapped.point
        if (chaining) {
          const bounds = root.getBoundingClientRect()
          showFeedback(snapped, engine.current?.screenPoint(end.x, end.y) ?? { left: e.clientX - bounds.left, top: e.clientY - bounds.top }, start)
          preview(make())
        } else {
          const bounds = root.getBoundingClientRect()
          if (dragging) {
            showFeedback(snapped, engine.current?.screenPoint(end.x, end.y) ?? { left: e.clientX - bounds.left, top: e.clientY - bounds.top }, start)
            preview(make())
          }
        }
      }
      const stop = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', abort)
        window.removeEventListener('blur', abort)
        preview()
        clearFeedback()
        cancel.current = () => {}
      }
      const abort = () => {
        stop()
        resetChain()
      }
      const up = (e: PointerEvent) => {
        if (e.pointerId !== event.pointerId) return
        const raw = at(e)
        const committed = !moved && raw ? snapFor(raw, start, { shift: e.shiftKey }) : null
        if (committed) end = committed.point
        stop()
        if (moved) {
          if (wallLength(make()) >= MIN_WALL_LENGTH) {
            latest.current.editing.add(make())
            resetChain()
          } else {
            resetChain()
          }
          return
        }
        if (!raw || !inside(raw)) {
          resetChain()
          return
        }
        const wall = make()
        if (wallLength(wall) < MIN_WALL_LENGTH) {
          if (!chaining) startPoint(start)
          else latest.current.editing.message('墙段太短：请把端点放到更远的位置', 'error')
          return
        }
        const baseBefore = latest.current.layout.wallSegments ? [...latest.current.layout.wallSegments] : []
        if (latest.current.editing.add(wall)) {
          if (chainIds.current.length === 0) chainBase.current = baseBefore
          setChainActive(true)
          chainIds.current.push(wall.id)
          chainPoints.current.push(end)
          chain.current = end
          if (committed?.closed) {
            latest.current.editing.message('区域已闭合，可继续绘制下一组墙体')
            resetChain()
            return
          }
          if (!chaining) startPoint(chainPoints.current[0])
          chainStart.current = chainPoints.current[0]
          latest.current.editing.message(`已连接 ${chainIds.current.length} 段墙，双击 / Enter / Esc 结束`)
        }
      }
      cancel.current = abort
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', abort)
      window.addEventListener('blur', abort)
    }
    const hover = (event: PointerEvent) => {
      const bounds = root.getBoundingClientRect()
      cursor.current = { left: event.clientX - bounds.left, top: event.clientY - bounds.top }
      if (!latest.current.editing.active || !chain.current || event.buttons) return
      const raw = at(event)
      if (!raw || !inside(raw)) {
        setMarker(null)
        setGuides([])
        return
      }
      const start = chain.current
      const snapped = snapFor(raw, start, { shift: event.shiftKey })
      showFeedback(snapped, engine.current?.screenPoint(snapped.point.x, snapped.point.y), start)
      preview({ id: 'preview', start, end: snapped.point, height: WALL_HEIGHT, thickness: 6, finish: 'solid' })
    }
    const click = (event: MouseEvent) => {
      if (event.target instanceof HTMLCanvasElement && (skipClick.current || latest.current.editing.active)) {
        event.stopPropagation()
        skipClick.current = false
      }
    }
    const dblclick = (event: MouseEvent) => {
      if (!latest.current.editing.active || !(event.target instanceof HTMLCanvasElement)) return
      event.preventDefault()
      event.stopPropagation()
      if (chain.current) finishChain(true)
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        cancel.current()
        if (chain.current) cancelChain()
        else {
          resetChain()
          if (latest.current.editing.active) latest.current.editing.finish()
        }
        return
      }
      if (event.key === 'Enter') {
        cancel.current()
        if (chain.current) finishChain(true)
        else if (latest.current.editing.active) latest.current.editing.finish()
        return
      }
      if (event.key === 'Backspace' && chain.current) {
        event.preventDefault()
        undoLastSegment()
        return
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && !chain.current && latest.current.editing.selected) {
        event.preventDefault()
        latest.current.editing.remove(latest.current.editing.selected)
        latest.current.editing.message('已删除墙体')
      }
    }
    const blur = () => {
      cancel.current()
      resetChain()
    }
    const contextMenu = (event: MouseEvent) => {
      if (!latest.current.editing.active) return
      event.preventDefault()
      if (chain.current) cancelChain()
    }
    root.addEventListener('pointerdown', pointerDown, true)
    root.addEventListener('contextmenu', contextMenu)
    root.addEventListener('pointermove', hover)
    root.addEventListener('click', click, true)
    root.addEventListener('dblclick', dblclick, true)
    window.addEventListener('keydown', key)
    window.addEventListener('blur', blur)
    return () => {
      cancel.current()
      root.removeEventListener('pointerdown', pointerDown, true)
      root.removeEventListener('contextmenu', contextMenu)
      root.removeEventListener('pointermove', hover)
      root.removeEventListener('click', click, true)
      root.removeEventListener('dblclick', dblclick, true)
      window.removeEventListener('keydown', key)
      window.removeEventListener('blur', blur)
    }
  }, [])

  useEffect(() => {
    if (!editing.active) {
      cancel.current()
      resetChain()
    }
  }, [editing.active])

  useEffect(() => {
    const target = chain.current
    if (!editing.active || !target) return
    // 提交墙段后 3D 场景会重建；这里把链头对齐到最近的墙体端点，方便继续连接（含 T 型拆分后的新端点）。
    let best: PlanPoint | undefined
    let bestDistance = 4
    for (const wall of layout.wallSegments ?? []) {
      for (const point of [wall.start, wall.end]) {
        const distance = Math.hypot(point.x - target.x, point.y - target.y)
        if (distance < bestDistance) { bestDistance = distance; best = point }
      }
    }
    if (best) {
      chain.current = best
      chainPoints.current[chainPoints.current.length - 1] = best
    }
    preview()
  }, [layout.wallSegments, editing.active])

  const openEnds = useMemo(() => {
    if (!editing.active) return []
    const walls = layout.wallSegments ?? []
    return wallNodes(walls)
      .filter((node) => node.degree === 1)
      .map((node) => engine.current?.screenPoint(node.point.x, node.point.y))
      .filter((screen): screen is { left: number; top: number; visible: boolean } => !!screen)
  }, [editing.active, layout.wallSegments])

  const size = { width: stage.current?.clientWidth ?? 0, height: stage.current?.clientHeight ?? 0 }
  const wall = layout.wallSegments?.find((candidate) => candidate.id === editing.selected)

  const rayLine = (() => {
    if (!ray) return null
    const from = engine.current?.screenPoint(ray.origin.x, ray.origin.y)
    if (!from) return null
    const radians = (ray.angle * Math.PI) / 180
    // 射线画到画布边为止：超出画布的世界坐标投影不出来，会让引导线整段消失。
    const direction = { x: Math.cos(radians), y: Math.sin(radians) }
    const limits: number[] = []
    if (direction.x !== 0) limits.push(((direction.x > 0 ? layout.width : 0) - ray.origin.x) / direction.x)
    if (direction.y !== 0) limits.push(((direction.y > 0 ? layout.height : 0) - ray.origin.y) / direction.y)
    const positive = limits.filter((value) => Number.isFinite(value) && value > 0)
    const length = positive.length ? Math.min(...positive) : 1
    const to = engine.current?.screenPoint(ray.origin.x + direction.x * length, ray.origin.y + direction.y * length)
    return to ? { x1: from.left, y1: from.top, x2: to.left, y2: to.top } : null
  })()

  const guideLines = guides.flatMap((guide) => {
    const a = guide.axis === 'x' ? engine.current?.screenPoint(guide.value, 0) : engine.current?.screenPoint(0, guide.value)
    const b = guide.axis === 'x' ? engine.current?.screenPoint(guide.value, layout.height) : engine.current?.screenPoint(layout.width, guide.value)
    return a && b ? [{ key: `${guide.axis}-${guide.value}`, x1: a.left, y1: a.top, x2: b.left, y2: b.top }] : []
  })

  return (
    <>
      <div className="office-wall-overlay" data-wall-overlay aria-hidden={editing.active ? undefined : true}>
        {(editing.active || marker) && (
          <svg className="office-wall-guides" width={size.width} height={size.height} data-wall-guides={guides.length}>
            {guideLines.map((line) => (
              <line key={line.key} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
            ))}
            {rayLine && <line className="office-wall-ray" data-wall-ray={ray!.angle} x1={rayLine.x1} y1={rayLine.y1} x2={rayLine.x2} y2={rayLine.y2} />}
          </svg>
        )}
        {editing.active && openEnds.map((screen, index) => (
          <span key={index} className="office-wall-open-end" style={{ left: screen.left, top: screen.top }} title="墙体端点未连接：区域无法闭合" />
        ))}
        {editing.active && chainActive && (
          <div className="office-wall-chain-actions" role="group" aria-label="连线操作">
            <button type="button" data-wall-finish onClick={() => finishChain(true)}>结束绘制</button>
            <button type="button" data-wall-cancel onClick={cancelChain}>取消这组</button>
          </div>
        )}
        {chain.current && <span className="office-wall-chain-start" style={positionOf(engine.current?.screenPoint(chain.current.x, chain.current.y))} />}
        {marker && <span className={`office-wall-snap ${MARKER_CLASS[marker.kind]}`} data-wall-snap={marker.kind} style={{ left: marker.left, top: marker.top }} />}
        {hud && (
          <div className={`office-wall-hud${hud.closed ? ' is-closed' : ''}${hud.valid ? '' : ' is-invalid'}`} data-wall-hud={hud.label} style={{ left: hud.left, top: hud.top }}>
            <strong>{hud.meters.toFixed(2)} m</strong>
            <span>{Math.round(hud.angle)}°</span>
            <em>{hud.label}</em>
          </div>
        )}
      </div>
      {wall && !editing.active && (
        <div className="office-free-wall-handles">
          {(['start', 'end'] as const).map((key) => {
            const screen = engine.current?.screenPoint(wall[key].x, wall[key].y)
            return screen && (
              <button key={key} ref={(node) => { handles.current[key] = node }} className="office-wall-node" data-wall-node={key} type="button"
                aria-label={key === 'start' ? '拖动墙起点' : '拖动墙终点'} style={{ left: screen.left, top: screen.top }}
                onPointerDown={(event) => transform(event.nativeEvent, wall, key)}
                onKeyDown={(event) => {
                  const delta = ({ ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, -5], ArrowDown: [0, 5] } as Record<string, [number, number]>)[event.key]
                  if (!delta) return
                  event.preventDefault()
                  latest.current.editing.update({ ...wall, [key]: snapFor({ x: wall[key].x + delta[0], y: wall[key].y + delta[1] }, wall[key === 'start' ? 'end' : 'start'], { ignoreWallIds: [wall.id] }).point })
                }} />
            )
          })}
        </div>
      )}
    </>
  )
}

function positionOf(screen: { left: number; top: number } | undefined) {
  return screen ? { left: screen.left, top: screen.top } : { display: 'none' }
}
