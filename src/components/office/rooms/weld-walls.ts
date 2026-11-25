import type { PlanPoint, WallSegment } from './api'
import { MIN_WALL_LENGTH } from './wall-snap'

/**
 * Wall graph maintenance.
 *
 * Plan editors keep walls as a graph: drawing a wall onto another wall must
 * split that wall into two segments sharing the junction node (a T junction),
 * crossing walls must both get a node, and two collinear walls meeting at a
 * degree-2 node collapse back into one. Without this the 3D corners overlap or
 * leave gaps and neighbouring regions never close.
 */
const EPS = 1e-4
const NODE_EPS = 0.5

const distance = (a: PlanPoint, b: PlanPoint) => Math.hypot(a.x - b.x, a.y - b.y)
const round5 = (value: number) => Math.round(value * 1e5) / 1e5
export const wallLength = (wall: Pick<WallSegment, 'start' | 'end'>) => distance(wall.start, wall.end)
const samePoint = (a: PlanPoint, b: PlanPoint) => distance(a, b) <= NODE_EPS

function sameProfile(a: WallSegment, b: WallSegment) {
  return a.thickness === b.thickness && a.height === b.height && a.finish === b.finish
}
function sameShape(a: WallSegment, b: WallSegment) {
  return (samePoint(a.start, b.start) && samePoint(a.end, b.end)) || (samePoint(a.start, b.end) && samePoint(a.end, b.start))
}
function pointKey(point: PlanPoint) {
  return `${Math.round(point.x * 3)},${Math.round(point.y * 3)}`
}
function intersect(a: PlanPoint, b: PlanPoint, c: PlanPoint, d: PlanPoint) {
  const rx = b.x - a.x
  const ry = b.y - a.y
  const sx = d.x - c.x
  const sy = d.y - c.y
  const det = rx * sy - ry * sx
  if (Math.abs(det) < 1e-9) return null
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / det
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / det
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null
  return { point: { x: a.x + t * rx, y: a.y + t * ry }, t, u }
}
function insideOnSegment(point: PlanPoint, start: PlanPoint, end: PlanPoint) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const squared = dx * dx + dy * dy
  if (!squared) return 0
  const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / squared
  if (t < EPS || t > 1 - EPS) return 0
  const cross = Math.abs((point.x - start.x) * dy - (point.y - start.y) * dx) / Math.sqrt(squared)
  return cross <= 1e-3 ? t : 0
}

function splitWall(wall: WallSegment, cuts: PlanPoint[], createId: () => string): WallSegment[] {
  if (wall.opening) return [wall]
  const dx = wall.end.x - wall.start.x
  const dy = wall.end.y - wall.start.y
  const ordered = cuts
    .map((point) => ({ point, t: ((point.x - wall.start.x) * dx + (point.y - wall.start.y) * dy) / (dx * dx + dy * dy || 1) }))
    .filter(({ t }) => t > EPS && t < 1 - EPS)
    .sort((a, b) => a.t - b.t)
  if (!ordered.length) return [wall]
  const points = [wall.start, ...ordered.map(({ point }) => ({ x: round5(point.x), y: round5(point.y) })), wall.end]
  return points.slice(1).map((end, index) => ({
    ...wall,
    id: index === 0 ? wall.id : createId(),
    start: points[index],
    end,
  }))
}

function dedupe(walls: readonly WallSegment[], createId: () => string): WallSegment[] {
  const kept: WallSegment[] = []
  for (const wall of walls) {
    if (wallLength(wall) < MIN_WALL_LENGTH) continue
    const normalized = { ...wall, id: wall.id || createId() }
    if (kept.some((other) => sameProfile(normalized, other) && sameShape(normalized, other))) continue
    kept.push(normalized)
  }
  return kept
}

function splitAll(walls: readonly WallSegment[], createId: () => string): WallSegment[] {
  const cuts = new Map<number, PlanPoint[]>()
  const add = (index: number, point: PlanPoint) => {
    const list = cuts.get(index)
    if (list) list.push(point)
    else cuts.set(index, [point])
  }
  for (let i = 0; i < walls.length; i += 1) {
    for (let j = i + 1; j < walls.length; j += 1) {
      const a = walls[i]
      const b = walls[j]
      const hit = intersect(a.start, a.end, b.start, b.end)
      if (hit) {
        if (hit.t > EPS && hit.t < 1 - EPS) add(i, hit.point)
        if (hit.u > EPS && hit.u < 1 - EPS) add(j, hit.point)
        continue
      }
      // Collinear or endpoint-on-body contact: give the host wall a node.
      for (const point of [a.start, a.end]) {
        if (insideOnSegment(point, b.start, b.end)) add(j, point)
      }
      for (const point of [b.start, b.end]) {
        if (insideOnSegment(point, a.start, a.end)) add(i, point)
      }
    }
  }
  return walls.flatMap((wall, index) => {
    const list = cuts.get(index)
    return list ? splitWall(wall, list, createId) : [wall]
  })
}

function nodeDegree(walls: readonly WallSegment[], point: PlanPoint) {
  let degree = 0
  for (const wall of walls) {
    if (samePoint(wall.start, point)) degree += 1
    if (samePoint(wall.end, point)) degree += 1
  }
  return degree
}

function tryMerge(a: WallSegment, b: WallSegment, walls: readonly WallSegment[]): WallSegment | null {
  if (a.opening || b.opening || !sameProfile(a, b)) return null
  const shared: Array<{ node: PlanPoint; other: PlanPoint }> = []
  for (const node of [a.start, a.end]) {
    const fromB = samePoint(b.start, node) ? b.end : samePoint(b.end, node) ? b.start : null
    if (fromB) shared.push({ node, other: fromB })
  }
  if (shared.length !== 1) return null
  const { node, other } = shared[0]
  const fromA = samePoint(a.start, node) ? a.end : a.start
  if (nodeDegree(walls, node) !== 2) return null
  const ax = fromA.x - node.x
  const ay = fromA.y - node.y
  const bx = other.x - node.x
  const by = other.y - node.y
  const cross = ax * by - ay * bx
  const lengthA = Math.hypot(ax, ay)
  const lengthB = Math.hypot(bx, by)
  if (lengthA < EPS || lengthB < EPS) return null
  const sine = Math.abs(cross) / (lengthA * lengthB)
  if (sine > 1e-3) return null
  if (ax * bx + ay * by > 0) return null
  return { ...a, id: a.id, start: fromA, end: other }
}

function mergeCollinear(walls: readonly WallSegment[]): WallSegment[] {
  let list = [...walls]
  let merged = true
  while (merged) {
    merged = false
    outer: for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const next = tryMerge(list[i], list[j], list)
        if (!next) continue
        list = list.map((wall, index) => (index === i ? next : wall)).filter((_, index) => index !== j)
        merged = true
        break outer
      }
    }
  }
  return list
}

/** Split every junction, drop duplicates and collapse degree-2 collinear runs. */
export function rebuildWallGraph(walls: readonly WallSegment[], createId: () => string = () => crypto.randomUUID()): WallSegment[] {
  const deduped = dedupe(walls, createId)
  const split = splitAll(deduped, createId)
  return mergeCollinear(dedupe(split, createId))
}

export function insertWall(walls: readonly WallSegment[], wall: WallSegment, createId?: () => string): WallSegment[] {
  return rebuildWallGraph([...walls, wall], createId)
}

export function replaceWall(walls: readonly WallSegment[], wall: WallSegment, createId?: () => string): WallSegment[] {
  const byId = walls.findIndex((candidate) => candidate.id === wall.id)
  const byShape = byId >= 0 ? -1 : walls.findIndex((candidate) => sameShape(candidate, wall))
  const next = byId >= 0
    ? walls.map((candidate, index) => (index === byId ? wall : candidate))
    : byShape >= 0
      ? walls.map((candidate, index) => (index === byShape ? wall : candidate))
      : [...walls, wall]
  return rebuildWallGraph(next, createId)
}

export function deleteWall(walls: readonly WallSegment[], id: string, createId?: () => string): WallSegment[] {
  return rebuildWallGraph(walls.filter((wall) => wall.id !== id), createId)
}


/**
 * Slide a whole straight wall run.
 *
 * Walls are drawn as a graph: dragging one segment used to leave the run it
 * belonged to behind, so the loop tore open and the regions stopped closing.
 * Here the dragged segment and every collinear segment welded to it move
 * together and the walls hanging off the run are stretched to follow, which is
 * what people expect when they drag a partition: the rooms on both sides grow
 * or shrink instead of losing their walls.
 */
export function moveWallRun(
  walls: readonly WallSegment[],
  previous: WallSegment,
  moved: WallSegment,
  bounds: { width: number; height: number } = { width: 4000, height: 4000 },
): WallSegment[] {
  const delta = { x: moved.start.x - previous.start.x, y: moved.start.y - previous.start.y }
  if (!delta.x && !delta.y) return [...walls]
  const dir = { x: previous.end.x - previous.start.x, y: previous.end.y - previous.start.y }
  const length = Math.hypot(dir.x, dir.y)
  if (length < EPS) return [...walls]
  const unit = { x: dir.x / length, y: dir.y / length }
  const collinear = (wall: WallSegment) => {
    const size = wallLength(wall)
    if (size < EPS) return false
    const sine = Math.abs(unit.x * (wall.end.y - wall.start.y) - unit.y * (wall.end.x - wall.start.x)) / size
    return sine <= 0.02
  }
  const chain = new Set<string>([previous.id])
  let grew = true
  while (grew) {
    grew = false
    for (const wall of walls) {
      if (chain.has(wall.id) || wall.opening || !collinear(wall) || !sameProfile(previous, wall)) continue
      const touches = walls.some((other) => chain.has(other.id) && sharesEndpoint(wall, other))
      if (!touches) continue
      chain.add(wall.id)
      grew = true
    }
  }
  const run = walls.filter((wall) => chain.has(wall.id))
  const next = walls.map((wall) => (chain.has(wall.id)
    ? {
      ...wall,
      start: { x: round5(wall.start.x + delta.x), y: round5(wall.start.y + delta.y) },
      end: { x: round5(wall.end.x + delta.x), y: round5(wall.end.y + delta.y) },
    }
    : wall))
  for (let index = 0; index < next.length; index += 1) {
    const wall = next[index]
    if (chain.has(wall.id)) continue
    for (const key of ['start', 'end'] as const) {
      if (!run.some((segment) => pointOnSegment(wall[key], segment.start, segment.end, 2.5))) continue
      const hit = lineIntersection(wall.start, wall.end, moved.start, moved.end)
      if (!hit) continue
      if (hit.u < -0.1 || hit.u > 1.1) continue
      if (hit.t > 1.4 || hit.t < -0.4) continue
      const target = { x: round5(hit.point.x), y: round5(hit.point.y) }
      if (target.x < -1 || target.y < -1 || target.x > bounds.width + 1 || target.y > bounds.height + 1) continue
      next[index] = { ...next[index], [key]: target }
    }
  }
  return next
}

function sharesEndpoint(a: WallSegment, b: WallSegment) {
  return samePoint(a.start, b.start) || samePoint(a.start, b.end) || samePoint(a.end, b.start) || samePoint(a.end, b.end)
}

function pointOnSegment(point: PlanPoint, start: PlanPoint, end: PlanPoint, tolerance: number) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const squared = dx * dx + dy * dy
  if (!squared) return distance(point, start) <= tolerance
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / squared))
  return distance(point, { x: start.x + t * dx, y: start.y + t * dy }) <= tolerance
}

function lineIntersection(a: PlanPoint, b: PlanPoint, c: PlanPoint, d: PlanPoint) {
  const rx = b.x - a.x
  const ry = b.y - a.y
  const sx = d.x - c.x
  const sy = d.y - c.y
  const det = rx * sy - ry * sx
  if (Math.abs(det) < 1e-9) return null
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / det
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / det
  return { point: { x: a.x + t * rx, y: a.y + t * ry }, t, u }
}

/** Junction nodes of the current wall graph, used by the overlay to mark open ends. */
export function wallNodes(walls: readonly WallSegment[]) {
  const nodes = new Map<string, { point: PlanPoint; degree: number }>()
  for (const wall of walls) {
    for (const point of [wall.start, wall.end]) {
      const key = pointKey(point)
      const node = nodes.get(key)
      if (node) node.degree += 1
      else nodes.set(key, { point: { x: round5(point.x), y: round5(point.y) }, degree: 1 })
    }
  }
  return [...nodes.values()]
}
