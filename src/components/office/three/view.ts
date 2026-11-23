import * as THREE from 'three'
import type { SeatPresence } from '../seat-presence'
import type { Member } from '@/data/office'
import { resolveOfficeLayout, roomTemplates } from '../rooms'
import type { OfficeLayout, ResolvedRoom } from '../rooms/api'
import { NEW_ROOM_SIZE, type OfficeDragSource, type OfficePlacement } from '../office-drag'
import { createWalkGrid, type WalkPoint } from './walk-grid'
import { buildOfficeWorld, type OfficeMode } from './world'
import type { GmvDisplay } from './gmv-screen'

export interface OfficeViewState {
  selectedFurniture?: string
  seats?: readonly SeatPresence[]
  selectedRoom: string | null
  mode: OfficeMode
  zoom: number
  walking: boolean
  mentionedRooms?: ReadonlySet<string>
  gmv?: GmvDisplay
}

interface Position {
  left: number
  top: number
  visible: boolean
}

export interface OfficeOverlay {
  furnitureBounds?: { left:number; top:number; width:number; height:number }
  seats: { roomId: string; seatIndex: number; occupant?: string; at: Position }[]
  rooms: { room: ResolvedRoom; present: number; at: Position }[]
  people: { member: Member; at: Position }[]
  gmv?: { left: number; top: number; width: number; height: number }
  walk?: {
    at?: Position
    room?: ResolvedRoom
    destination?: string
    phase: 'ready' | 'moving' | 'arrived' | 'blocked'
  }
}

const WALK_SPEED = 210
const DEFAULT_LOOK = { id: 'local-avatar', body: '#486b88', skin: '#ddb08b', hair: '#32353c' }

export function createOfficeView(
  stage: HTMLElement,
  layout: OfficeLayout,
  rooms: readonly ResolvedRoom[],
  roster: ReadonlyMap<string, Member[]>,
  meId: string | null,
  initialView: OfficeViewState,
  onOverlay: (overlay: OfficeOverlay) => void,
  editable = false,
) {
  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  } catch {
    return null
  }
  stage.prepend(canvas)
  renderer.setPixelRatio(Math.max(1.5, Math.min(window.devicePixelRatio || 1, 2)))
  renderer.setClearColor(0xf3f3f1, 0)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.shadowMap.autoUpdate = false
  renderer.shadowMap.needsUpdate = true
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = .96

  const world = buildOfficeWorld(layout, rooms, roster, meId, schedule, editable, initialView.seats)
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 3150)
  const center = new THREE.Vector3(layout.width / 2, 0, layout.height / 2 - 8)
  const direction = new THREE.Vector3(0, 1100, 510).normalize()
  const projected = new THREE.Vector3()
  const ray = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const floorHit = new THREE.Vector3()
  const modelBounds = new THREE.Box3()
  const boundsHit = new THREE.Vector3()
  const walkerTag = new THREE.Vector3()
  const screenTag = new THREE.Vector3()
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const ownDesk = world.people.find(({ member }) => member.id === meId)
  let grid: ReturnType<typeof createWalkGrid> | undefined
  let walker: ReturnType<typeof world.addWalker> | undefined
  let route: WalkPoint[] = []
  let nextWaypoint = 0
  let walked = 0
  let lastTime = 0
  let walkPhase: NonNullable<OfficeOverlay['walk']>['phase'] = 'ready'
  let destination: string | undefined
  let width = 0
  let height = 0
  let view = initialView
  let shadowMode: OfficeMode | undefined
  let frame = 0
  let drag: { model: THREE.Group; original: THREE.Vector3; clean?: () => void } | undefined
  const indicator = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    transparent: true, opacity: .27, depthWrite: false,
  }))
  indicator.rotation.x = -Math.PI / 2
  indicator.visible = false
  if (editable) world.scene.add(indicator)

  function clearPreview() {
    if (!drag) return
    drag.model.position.copy(drag.original)
    drag.clean?.()
    drag = undefined
    indicator.visible = false
    renderer.shadowMap.needsUpdate = true
    schedule()
  }

  function beginPreview(source: OfficeDragSource) {
    clearPreview()
    if (source.kind === 'room' || source.kind === 'furniture') {
      const model = source.kind === 'room' ? world.roomModels.get(source.roomId) : world.furnitureModels.get(source.id)
      if (model) drag = { model, original: model.position.clone() }
      return
    }
    const frame = { x: 0, y: 0, ...NEW_ROOM_SIZE }
    const room = source.kind === 'new-room'
      ? { id: 'asset-preview', name: '', frame, template: source.template }
      : { id: 'asset-preview', name: '', frame, template: 'empty',
        furniture: [{ id: 'furniture-preview', kind: source.model, x: 0, y: 0, rotation: 0 }] }
    const fixture = { ...NEW_ROOM_SIZE, rooms: [room] }
    const preview = buildOfficeWorld(fixture, resolveOfficeLayout(fixture, roomTemplates), new Map(), null, schedule, true)
    const model = source.kind === 'new-room' ? preview.roomModels.get(room.id) : preview.furnitureModels.get('furniture-preview')
    if (!model) { preview.dispose(); return }
    world.scene.add(model)
    model.visible = false
    drag = { model, original: model.position.clone(), clean: () => {
      preview.scene.add(model)
      preview.dispose()
    } }
  }

  function showPreview(placement: OfficePlacement | null) {
    if (!drag) return
    if (!placement) {
      if (drag.clean) drag.model.visible = false
      else drag.model.position.copy(drag.original)
      indicator.visible = false
    } else {
      const at = placement.kind === 'room' ? placement.frame : placement.at
      const local = new THREE.Vector3(at.x, placement.valid ? .08 : .5, at.y)
      drag.model.parent?.worldToLocal(local)
      drag.model.position.copy(local)
      drag.model.visible = true
      const width = placement.kind === 'room' ? placement.frame.width : 46
      const height = placement.kind === 'room' ? placement.frame.height : 38
      indicator.position.set(at.x + (placement.kind === 'room' ? width / 2 : 0), 1, at.y + (placement.kind === 'room' ? height / 2 : 0))
      indicator.scale.set(width, height, 1)
      indicator.material.color.set(placement.valid ? '#508ae2' : '#e36157')
      indicator.visible = true
    }
    schedule()
  }

  function roomAt(point: WalkPoint) {
    return rooms.find(({ frame }) =>
      point.x > frame.x && point.x < frame.x + frame.width &&
      point.z > frame.y && point.z < frame.y + frame.height,
    )
  }

  function startWalk() {
    grid ??= createWalkGrid(layout.width, layout.height, world.solids)
    walker ??= world.addWalker(ownDesk?.member ?? DEFAULT_LOOK)
    const ownRoom = world.mySeat && roomAt(world.mySeat)
    let spawn: WalkPoint | null = null
    if (ownRoom && world.mySeat) {
      spawn = grid.spawn({ x: world.mySeat.x, z: world.mySeat.z + 20 }, ownRoom.frame)
    }
    for (const room of rooms) {
      if (spawn) break
      const { inside } = room.doorway
      spawn = grid.spawn({ x: inside.x, z: inside.y }, room.frame)
    }
    walker.mesh.visible = Boolean(spawn)
    if (spawn) walker.mesh.position.set(spawn.x, 0, spawn.z)
    walker.mesh.rotation.y = 0
    walker.pose(0)
    walked = 0
    walkPhase = spawn ? 'ready' : 'blocked'
  }

  function walkTo(point: WalkPoint, room = roomAt(point)) {
    if (!view.walking || !walker?.mesh.visible || !grid) return
    destination = room?.name ?? '走廊'
    route = grid.route(walker.mesh.position, point, room?.frame) ?? []
    nextWaypoint = 0
    lastTime = 0
    walkPhase = route.length ? 'moving' : 'blocked'
    if (!route.length) walker.pose(0)
    schedule()
  }

  function advance(now: number) {
    if (!walker || nextWaypoint >= route.length) return
    const position = walker.mesh.position
    let budget = lastTime ? Math.min((now - lastTime) / 1000, .07) * WALK_SPEED : 0
    lastTime = now
    while (nextWaypoint < route.length) {
      const target = route[nextWaypoint]
      const dx = target.x - position.x
      const dz = target.z - position.z
      const distance = Math.hypot(dx, dz)
      if (distance > .01) walker.mesh.rotation.y = Math.atan2(-dx, -dz)
      if (distance <= budget) {
        position.set(target.x, 0, target.z)
        budget -= distance
        walked += distance
        nextWaypoint++
      } else {
        position.x += dx * (budget / distance)
        position.z += dz * (budget / distance)
        walked += budget
        break
      }
    }
    if (nextWaypoint === route.length) walkPhase = 'arrived'
    walker.pose(walkPhase === 'moving' && !reducedMotion.matches ? Math.sin(walked * .075) : 0)
  }

  function project(position: THREE.Vector3): Position {
    projected.copy(position).project(camera)
    return {
      left: (projected.x + 1) * width / 2,
      top: (1 - projected.y) * height / 2,
      visible: Math.abs(projected.x) < 1.03 && Math.abs(projected.y) < 1.03,
    }
  }

  function updateCamera() {
    const { selectedRoom, zoom, walking } = view
    const modelHeight = layout.height * direction.y + 72
    const fit = Math.max(.03, Math.min((width - 24) / (layout.width + 28), (height - 18) / modelHeight))
    const target = center.clone()
    const lift = Math.min(52, Math.max(0, height - modelHeight * fit) * .30)
    target.z += lift * Math.min(1, (160 - zoom) / 60) / (fit * direction.y)
    const focus = world.roomAnchors.find(({ room }) => room.id === selectedRoom)
    if (zoom > 100 && walking && walker?.mesh.visible) {
      target.lerp(walker.mesh.position, Math.min((zoom - 100) / 65, 1))
    } else if (zoom > 100 && focus) {
      const { x, y, width, height } = focus.room.frame
      const amount = Math.min((zoom - 100) / 65, 1)
      const selection = new THREE.Vector3(x + width / 2, 0, y + height / 2)
      const myRoom = roster.get(focus.room.id)?.some((member) => member.id === meId)
      target.lerp(myRoom && world.mySeat ? world.mySeat : selection, amount)
    }
    camera.position.copy(target).addScaledVector(direction, 1320)
    camera.lookAt(target)
    Object.assign(camera, { left: -width / 2, right: width / 2, top: height / 2, bottom: -height / 2 })
    camera.zoom = fit * zoom / 100
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
  }

  function render(now: number) {
    frame = 0
    if (!width || !height) return
    const { selectedRoom, mode, walking, mentionedRooms, gmv } = view
    if (walking) advance(now)
    updateCamera()
    for (const [id, highlight] of world.highlights) {
      const mentioned = mentionedRooms?.has(id)
      highlight.visible = Boolean(mentioned || id === selectedRoom)
      if (highlight.visible) {
        highlight.material.color.set(mentioned ? '#e8a23d' : '#5492db')
        highlight.material.opacity = mentioned ? .22 : .055
      }
    }
    for (const { member, mesh } of world.people) {
      mesh.visible = !(walking && walker?.mesh.visible && member.id === meId) &&
        (mode !== 'presence' || member.presence !== 'away' || member.id === meId)
    }
    if (shadowMode !== mode) {
      renderer.shadowMap.needsUpdate = true
      shadowMode = mode
    }
    for (const [roomId, screen] of world.screens) screen.draw(gmv?.roomId === roomId ? gmv : undefined)
    renderer.render(world.scene, camera)
    if (drag) return
    const screen = gmv && world.screens.get(gmv.roomId)
    const screenTop = screen && project(screen.group.localToWorld(screenTag.copy(screen.topLeft)))
    const screenBottom = screen && project(screen.group.localToWorld(screenTag.copy(screen.bottomRight)))
    const selectedObject=view.selectedFurniture?world.furnitureModels.get(view.selectedFurniture):undefined
    let furnitureBounds: OfficeOverlay['furnitureBounds']
    if(selectedObject){
      const bounds=new THREE.Box3().setFromObject(selectedObject),points=[]
      for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])points.push(project(new THREE.Vector3(x,y,z)))
      const left=Math.min(...points.map(p=>p.left)),top=Math.min(...points.map(p=>p.top))
      furnitureBounds={left,top,width:Math.max(...points.map(p=>p.left))-left,height:Math.max(...points.map(p=>p.top))-top}
    }
    onOverlay({
      furnitureBounds,
      seats: world.seatTargets.map(({ position, ...seat }) => ({ ...seat, at: project(position) })),
      rooms: world.roomAnchors.map(({ room, present, position }) => ({ room, present, at: project(position) })),
      people: world.people.filter(({ mesh }) => mesh.visible).map(({ member, position }) => ({ member, at: project(position) })),
      gmv: screenTop && screenBottom && (screenTop.visible || screenBottom.visible)
        ? { left: screenTop.left, top: screenTop.top, width: screenBottom.left - screenTop.left, height: screenBottom.top - screenTop.top }
        : undefined,
      walk: walking ? {
        at: walker?.mesh.visible ? project(walkerTag.copy(walker.mesh.position).setY(53)) : undefined,
        room: walker?.mesh.visible ? roomAt(walker.mesh.position) : undefined,
        phase: walkPhase,
        destination,
      } : undefined,
    })
    if (walking && walkPhase === 'moving') schedule()
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(render)
  }

  function pointRay(x: number, y: number) {
    ray.setFromCamera(pointer.set(x / width * 2 - 1, 1 - y / height * 2), camera)
  }

  function resize(nextWidth: number, nextHeight: number) {
    width = nextWidth
    height = nextHeight
    if (!width || !height) return
    renderer.setSize(width, height, false)
    updateCamera()
    schedule()
  }

  resize(stage.clientWidth, stage.clientHeight)
  const observer = new ResizeObserver(([entry]) => resize(entry.contentRect.width, entry.contentRect.height))
  observer.observe(stage)

  const restore = () => {
    renderer.shadowMap.needsUpdate = true
    schedule()
  }
  canvas.addEventListener('webglcontextrestored', restore)
  if (initialView.walking) startWalk()

  return {
    draw(next: OfficeViewState) {
      if (next.walking !== view.walking) {
        route = []
        nextWaypoint = 0
        destination = undefined
        renderer.shadowMap.needsUpdate = true
        if (next.walking) startWalk()
        else if (walker) walker.mesh.visible = false
      }
      view = next
      schedule()
    },
    pickSeat(x: number, y: number) {
      const nearest = world.seatTargets.map(seat => { const at = project(seat.position); return { seat, distance: at.visible ? Math.hypot(at.left - x, at.top - y) : Infinity } }).sort((a,b) => a.distance - b.distance)[0]
      return nearest && nearest.distance < 18 ? nearest.seat : undefined
    },
    pick(x: number, y: number): string | null {
      if (!width || !height) return null
      pointRay(x, y)
      return ray.intersectObjects(world.floors, false)[0]?.object.userData.roomId ?? null
    },
    pickEditable(x: number, y: number): OfficeDragSource | undefined {
      if (!width || !height) return
      pointRay(x, y)
      let furniture: OfficeDragSource | undefined
      let closest = Infinity
      for (const [id, model] of world.furnitureModels) {
        modelBounds.setFromObject(model).expandByScalar(2)
        const hit = ray.ray.intersectBox(modelBounds, boundsHit)
        if (!hit) continue
        const distance = ray.ray.origin.distanceToSquared(hit)
        if (distance >= closest) continue
        closest = distance
        furniture = { kind: 'furniture', roomId: model.userData.ownerRoomId, id }
      }
      if (furniture) return furniture
      let object: THREE.Object3D | undefined = ray.intersectObjects([...world.roomModels.values()], true)
        .find(({ object }) => object.visible)?.object
      while (object) {
        const roomId = object.userData.roomId
        if (roomId) return { kind: 'room', roomId }
        object = object.parent ?? undefined
      }
    },
    beginPreview,
    showPreview,
    clearPreview,
    floorPoint(x: number, y: number) {
      if (!width || !height) return null
      pointRay(x, y)
      return ray.ray.intersectPlane(floor, floorHit) ? { x: floorHit.x, y: floorHit.z } : null
    },
    screenPoint(x: number, y: number) {
      return project(new THREE.Vector3(x, 0, y))
    },
    walkAt(x: number, y: number) {
      if (!width || !height) return
      pointRay(x, y)
      if (!ray.ray.intersectPlane(floor, floorHit)) return
      const { x: planX, z } = floorHit
      if (planX >= 0 && planX <= layout.width && z >= 0 && z <= layout.height) walkTo(floorHit)
    },
    walkToRoom(id: string) {
      const room = rooms.find((candidate) => candidate.id === id)
      if (room) walkTo({ x: room.doorway.inside.x, z: room.doorway.inside.y }, room)
    },
    dispose() {
      observer.disconnect()
      clearPreview()
      cancelAnimationFrame(frame)
      if (!editable) { indicator.geometry.dispose(); indicator.material.dispose() }
      canvas.removeEventListener('webglcontextrestored', restore)
      world.dispose()
      renderer.dispose()
      canvas.remove()
    },
  }
}
