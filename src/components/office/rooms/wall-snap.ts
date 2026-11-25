import type { OfficeLayout, PlanPoint, WallSegment } from './api'

/** What the pointer is currently magnetised to. Drives cursor marker + HUD copy. */
export type WallSnapKind =
  | 'free'
  | 'grid'
  | 'endpoint'
  | 'intersection'
  | 'wall'
  | 'close'
  | 'axis'
  | 'polar'

export const WALL_SNAP_LABEL: Record<WallSnapKind, string> = {
  free: '自由角度',
  grid: '网格吸附',
  endpoint: '连接端点',
  intersection: '连接交点',
  wall: '贴墙连接',
  close: '闭合区域',
  axis: '水平 / 垂直',
  polar: '45° 锁定',
}

/** Dashed alignment lines the canvas overlay draws across the whole office. */
export interface WallGuide {
  axis: 'x' | 'y'
  value: number
}

export interface WallSnapResult {
  point: PlanPoint
  kind: WallSnapKind
  label: string
  targetWallId?: string
  guides: WallGuide[]
  /** Distance from origin in canvas units (0 when no chain start). */
  length: number
  meters: number
  /** Degrees in [0,360), measured from the +x axis; 0 when no chain start. */
  angle: number
  /** Locked guide direction in degrees (0 = +x axis) when a polar/axis assist is active. */
  rayAngle?: number
  /** True when the point closes the current chain back onto its start. */
  closed: boolean
  /** False when the currently drawn segment would be rejected (too short / zero length). */
  valid: boolean
}

export interface WallSnapOptions {
  /** Previous endpoint of the chain; enables angle hints, guides and measurements. */
  origin?: PlanPoint
  /** First point of the chain; enables the "close the loop" magnet. */
  chainStart?: PlanPoint
  /** Shift = polar 45° lock. */
  shift?: boolean
  /** Orthogonal lock (0/90°), toggled from the toolbar. */
  ortho?: boolean
  /** Polar tracking (15° increments) keeps casual drags on a straight ray; on by default. */
  polar?: boolean
  /** Polar increment in degrees (default 15). */
  step?: number
  /** Angular tolerance in degrees for polar/axis assist (default 2.2°). */
  snapDegrees?: number
  /** Grid step in canvas units; 0 disables grid snapping. */
  grid?: number
  /** World units per metre, used for the metre readout. */
  unitsPerMeter?: number
  /** Screen pixels per canvas unit at the pointer, so magnet radii stay constant on screen. */
  pixelsPerUnit?: number
  /** Walls that must not attract the pointer (usually the wall being dragged). */
  ignoreWallIds?: readonly string[]
}

export const MIN_WALL_LENGTH = 12
const EPS = 1e-6

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const round5 = (value: number) => Math.round(value * 1e5) / 1e5
const distance = (a: PlanPoint, b: PlanPoint) => Math.hypot(a.x - b.x, a.y - b.y)

interface SearchSegment {
  start: PlanPoint
  end: PlanPoint
  wallId?: string
  /** Door walls stay whole: they are valid targets but never split or extended. */
  opening?: boolean
}

function searchSegments(layout: OfficeLayout, ignore: ReadonlySet<string>): SearchSegment[] {
  const walls: SearchSegment[] = (layout.wallSegments ?? [])
    .filter((wall) => !ignore.has(wall.id))
    .map((wall) => ({ start: wall.start, end: wall.end, wallId: wall.id, opening: !!wall.opening }))
  const { width, height } = layout
  const border: SearchSegment[] = [
    { start: { x: 0, y: 0 }, end: { x: width, y: 0 } },
    { start: { x: width, y: 0 }, end: { x: width, y: height } },
    { start: { x: width, y: height }, end: { x: 0, y: height } },
    { start: { x: 0, y: height }, end: { x: 0, y: 0 } },
  ]
  return [...walls, ...border]
}

function projectOnSegment(point: PlanPoint, start: PlanPoint, end: PlanPoint) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const squared = dx * dx + dy * dy
  if (!squared) return { point: start, t: 0 }
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / squared, 0, 1)
  return { point: { x: start.x + t * dx, y: start.y + t * dy }, t }
}

function segmentIntersection(a: PlanPoint, b: PlanPoint, c: PlanPoint, d: PlanPoint) {
  const rx = b.x - a.x
  const ry = b.y - a.y
  const sx = d.x - c.x
  const sy = d.y - c.y
  const det = rx * sy - ry * sx
  if (Math.abs(det) < 1e-8) return null
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / det
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / det
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null
  return { point: { x: a.x + t * rx, y: a.y + t * ry }, t, u }
}

function endpointHit(point: PlanPoint, layout: OfficeLayout, ignore: ReadonlySet<string>, tolerance: number) {
  let best: { point: PlanPoint; wallId?: string } | undefined
  let bestDistance = tolerance
  const candidates: Array<{ point: PlanPoint; wallId?: string }> = []
  for (const wall of layout.wallSegments ?? []) {
    if (ignore.has(wall.id)) continue
    candidates.push({ point: wall.start, wallId: wall.id }, { point: wall.end, wallId: wall.id })
  }
  candidates.push(
    { point: { x: 0, y: 0 } },
    { point: { x: layout.width, y: 0 } },
    { point: { x: layout.width, y: layout.height } },
    { point: { x: 0, y: layout.height } },
  )
  for (const candidate of candidates) {
    const gap = distance(candidate.point, point)
    if (gap <= bestDistance) {
      bestDistance = gap
      best = candidate
    }
  }
  return best
}

function intersectionHit(point: PlanPoint, layout: OfficeLayout, ignore: ReadonlySet<string>, tolerance: number) {
  const segments = searchSegments(layout, ignore)
  let best: PlanPoint | undefined
  let bestDistance = tolerance
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const hit = segmentIntersection(segments[i].start, segments[i].end, segments[j].start, segments[j].end)
      if (!hit) continue
      const gap = distance(hit.point, point)
      if (gap <= bestDistance) {
        bestDistance = gap
        best = hit.point
      }
    }
  }
  return best
}

function wallHit(point: PlanPoint, layout: OfficeLayout, ignore: ReadonlySet<string>, tolerance: number) {
  const segments = searchSegments(layout, ignore)
  let best: { point: PlanPoint; wallId?: string } | undefined
  let bestDistance = tolerance
  for (const segment of segments) {
    const hit = projectOnSegment(point, segment.start, segment.end)
    const gap = distance(hit.point, point)
    if (gap <= bestDistance) {
      bestDistance = gap
      best = { point: hit.point, wallId: segment.wallId ?? undefined }
    }
  }
  return best
}

/** Alignment lines: show when the snapped point shares an axis with another node. */
function alignmentGuides(point: PlanPoint, layout: OfficeLayout, ignore: ReadonlySet<string>, extra: PlanPoint[] = []): WallGuide[] {
  const xs: number[] = []
  const ys: number[] = []
  for (const wall of layout.wallSegments ?? []) {
    if (ignore.has(wall.id)) continue
    xs.push(wall.start.x, wall.end.x)
    ys.push(wall.start.y, wall.end.y)
  }
  for (const point2 of [0, layout.width] as const) xs.push(point2)
  for (const point2 of extra) { xs.push(point2.x); ys.push(point2.y) }
  for (const point2 of [0, layout.height] as const) ys.push(point2)
  const TOLERANCE = 0.75
  const horizontal = xs.some((value) => Math.abs(value - point.x) <= TOLERANCE)
  const vertical = ys.some((value) => Math.abs(value - point.y) <= TOLERANCE)
  const guides: WallGuide[] = []
  if (horizontal) guides.push({ axis: 'x', value: round5(xs.find((value) => Math.abs(value - point.x) <= TOLERANCE)!) })
  if (vertical) guides.push({ axis: 'y', value: round5(ys.find((value) => Math.abs(value - point.y) <= TOLERANCE)!) })
  return guides
}

/**
 * Magnetised wall point, modelled on the way professional plan editors behave
 * (Sweet Home 3D wall tool + SketchUp inference + AutoCAD object snap):
 * close target > endpoint > intersection > wall body > axis/ortho/polar > grid > free.
 */
export function snapWallPointDetailed(input: PlanPoint, layout: OfficeLayout, options: WallSnapOptions = {}): WallSnapResult {
  const { origin, chainStart, shift, ortho, polar = true, step = 15, snapDegrees = 2.2, grid = 0, unitsPerMeter = 50, pixelsPerUnit } = options
  const ignore = new Set(options.ignoreWallIds ?? [])
  const perUnit = pixelsPerUnit && pixelsPerUnit > 0.01 ? pixelsPerUnit : 1
  const tolerance = (pixels: number) => pixels / perUnit

  let point: PlanPoint = {
    x: clamp(Math.round(input.x), 0, layout.width),
    y: clamp(Math.round(input.y), 0, layout.height),
  }
  let kind: WallSnapKind = 'free'
  let targetWallId: string | undefined

  // 1. Close the loop by snapping back onto the first point of the chain.
  if (chainStart && origin && distance(chainStart, point) <= tolerance(18) && distance(chainStart, origin) > MIN_WALL_LENGTH) {
    point = { ...chainStart }
    kind = 'close'
  }

  // 2. Existing nodes (wall endpoints + canvas corners) beat everything else.
  if (kind === 'free') {
    const hit = endpointHit(point, layout, ignore, tolerance(13))
    if (hit) {
      point = { ...hit.point }
      targetWallId = hit.wallId
      kind = 'endpoint'
    }
  }

  // 3. Wall crossings give an exact T/X node.
  if (kind === 'free') {
    const hit = intersectionHit(point, layout, ignore, tolerance(13))
    if (hit) {
      point = { ...hit }
      kind = 'intersection'
    }
  }

  // 4. Wall bodies: land exactly on the centreline (T connection).
  if (kind === 'free') {
    const hit = wallHit(point, layout, ignore, tolerance(15))
    if (hit) {
      point = { ...hit.point }
      targetWallId = hit.wallId
      kind = 'wall'
    }
  }

  // 5. Angle assists relative to the chain origin — the "straight line" guarantee.
  //    Shift locks 45°, ortho locks 0/90°, and a plain drag gets polar tracking every
  //    `step` degrees so a slightly wobbly hand still lands on a perfectly straight wall.
  let guides: WallGuide[] = []
  let rayAngle: number | undefined
  if (kind === 'free' && origin) {
    const dx = point.x - origin.x
    const dy = point.y - origin.y
    const rawLength = Math.hypot(dx, dy)
    if (shift || ortho) {
      const increment = shift ? 45 : 90
      const rawAngle = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360
      const locked = Math.round(rawAngle / increment) * increment
      const radians = (locked * Math.PI) / 180
      point = { x: origin.x + Math.cos(radians) * rawLength, y: origin.y + Math.sin(radians) * rawLength }
      rayAngle = ((locked % 360) + 360) % 360
      kind = rayAngle % 90 === 0 ? 'axis' : 'polar'
    } else if (polar && rawLength >= MIN_WALL_LENGTH) {
      const rawAngle = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360
      const nearest = ((Math.round(rawAngle / step) * step) % 360 + 360) % 360
      const delta = Math.abs((((rawAngle - nearest) % 360) + 540) % 360 - 180)
      // 0/90/180/270 are the rays people need most, so they catch a slightly wider band.
      const catchDegrees = nearest % 90 === 0 ? snapDegrees * 1.5 : snapDegrees
      if (delta <= catchDegrees) {
        const radians = (nearest * Math.PI) / 180
        point = { x: origin.x + Math.cos(radians) * rawLength, y: origin.y + Math.sin(radians) * rawLength }
        rayAngle = nearest
        kind = rayAngle % 90 === 0 ? 'axis' : 'polar'
      }
    }
    if (kind === 'free' && !shift && !ortho) {
      const axisTolerance = tolerance(9)
      if (Math.abs(dx) <= axisTolerance && Math.abs(dy) > axisTolerance) {
        point = { x: origin.x, y: point.y }
        rayAngle = dy >= 0 ? 90 : 270
        kind = 'axis'
      } else if (Math.abs(dy) <= axisTolerance && Math.abs(dx) > axisTolerance) {
        point = { x: point.x, y: origin.y }
        rayAngle = dx >= 0 ? 0 : 180
        kind = 'axis'
      }
    }
  }

  // 6. Crosshair guides: the chain origin itself participates, so a straight drag always
  //    shows the horizontal/vertical guide it is riding on.
  if (kind === 'free' || kind === 'axis' || kind === 'polar') {
    guides = alignmentGuides(point, layout, ignore, origin ? [origin] : [])
  }

  if (kind === 'free' && grid > 0) {
    point = {
      x: clamp(Math.round(point.x / grid) * grid, 0, layout.width),
      y: clamp(Math.round(point.y / grid) * grid, 0, layout.height),
    }
    kind = 'grid'
  }

  if (kind === 'axis' && rayAngle !== undefined && !guides.length) {
    guides = rayAngle % 180 === 0
      ? [{ axis: 'y', value: round5(point.y) }]
      : [{ axis: 'x', value: round5(point.x) }]
  }

  point = { x: round5(clamp(point.x, 0, layout.width)), y: round5(clamp(point.y, 0, layout.height)) }

  const length = origin ? distance(origin, point) : 0
  const angle = origin && length > EPS
    ? (Math.atan2(point.y - origin.y, point.x - origin.x) * 180 / Math.PI + 360) % 360
    : 0

  // HUD 文案：轴锁给出具体方向，polar 直接报出锁定的角度。
  const horizontalRay = rayAngle !== undefined && rayAngle % 180 === 0
  const label = kind === 'axis'
    ? (rayAngle === undefined ? (guides.some((guide) => guide.axis === 'x') ? '垂直' : '水平') : horizontalRay ? '水平' : '垂直')
    : kind === 'polar'
      ? (rayAngle === undefined ? WALL_SNAP_LABEL.polar : `${Math.round(rayAngle)}° 引导`)
      : WALL_SNAP_LABEL[kind]

  return {
    point,
    kind,
    label,
    targetWallId,
    guides,
    rayAngle,
    length,
    meters: length / unitsPerMeter,
    angle,
    closed: kind === 'close',
    valid: !origin || length >= MIN_WALL_LENGTH,
  }
}

/** Backwards-compatible helper: returns only the magnetised point. */
export function snapWallPoint(point: PlanPoint, layout: OfficeLayout, origin?: PlanPoint, shift = false): PlanPoint {
  return snapWallPointDetailed(point, layout, { origin, shift }).point
}

/** Endpoints that are not shared with any other wall — the usual reason a region will not close. */
export function danglingEndpoints(walls: readonly WallSegment[], tolerance = 0.5): PlanPoint[] {
  const nodes: Array<{ point: PlanPoint; count: number }> = []
  for (const wall of walls) {
    for (const point of [wall.start, wall.end]) {
      const node = nodes.find((candidate) => distance(candidate.point, point) <= tolerance)
      if (node) node.count += 1
      else nodes.push({ point, count: 1 })
    }
  }
  return nodes.filter((node) => node.count === 1).map((node) => node.point)
}
