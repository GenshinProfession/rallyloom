import * as THREE from 'three'
import type { SeatPresence } from '../seat-presence'
import type { Member } from '@/data/office'
import { WALL_THICKNESS, type OfficeLayout, type ResolvedRoom } from '../rooms/api'
import { sharedWallRuns } from '../rooms/shared-walls'
import { officeChair } from '../rooms/furniture'
import { buildPlacedFurniture } from '../rooms/placed-furniture'
import { createModelKit, type ModelKit } from './model'
import { createWalker } from './walker'
import { createAvatarKit, type AvatarLook } from './avatar'
import { buildGmvScreen } from './gmv-screen'
import { createFloorMaterial } from './floor-material'

export type OfficeMode = 'daily' | 'presence' | 'tasks'

type RoomAnchor = { room: ResolvedRoom; position: THREE.Vector3; present: number }
type PersonAnchor = { member: Member; position: THREE.Vector3; mesh: THREE.Object3D }

const WALL_COLOR = '#515957'
const BASE_LEVEL = -11

function walls(room: ResolvedRoom, rooms: readonly ResolvedRoom[], parent: THREE.Group, model: ModelKit, solids: THREE.Object3D[]) {
  const { width, height } = room.frame
  for (const { side, start, end, finish, shared } of sharedWallRuns(room, rooms)) {
    const horizontal = side === 'north' || side === 'south'
    const length = end - start
    const middle = start + length / 2
    const x = horizontal ? middle : side === 'east' ? width : 0
    const z = horizontal ? side === 'south' ? height : 0 : middle
    const wallHeight = shared ? 24 : side === 'north' ? 34 : 16
    const wallWidth = horizontal ? length : WALL_THICKNESS
    const wallDepth = horizontal ? WALL_THICKNESS : length
    if (finish === 'glass') {
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(wallWidth, wallHeight, wallDepth),
        new THREE.MeshStandardMaterial({ color: '#a6c7c4', transparent: true, opacity: .24, roughness: .18, metalness: .08, depthWrite: false }),
      )
      glass.position.set(x, wallHeight / 2, z)
      parent.add(glass)
      solids.push(glass)
      const panels = Math.max(1, Math.ceil(length / 64))
      for (let i = 0; i <= panels; i++) {
        const offset = start + i * length / panels
        model.box(parent, horizontal ? offset : x, 0, horizontal ? z : offset,
          horizontal ? 1.6 : 2, wallHeight + 1, horizontal ? 2 : 1.6, '#414c4c')
      }
    } else solids.push(model.box(parent, x, 0, z, wallWidth, wallHeight, wallDepth, WALL_COLOR))
    model.box(parent, x, wallHeight, z, wallWidth + (horizontal ? 0 : 1), 1.1, wallDepth + (horizontal ? 1 : 0), '#68716e')
    const trimInset = WALL_THICKNESS / 2 + .25
    const insetX = horizontal ? x : x + (side === 'west' ? trimInset : -trimInset)
    const insetZ = horizontal ? z + (side === 'north' ? trimInset : -trimInset) : z
    const baseboard = model.box(parent, insetX, .25, insetZ, horizontal ? length : .7, 2.3, horizontal ? .7 : length, '#d3dcd9')
    baseboard.castShadow = false
    if (!shared && finish !== 'glass' && side === 'north' && length > 100) {
      for (const offset of [-.24, .24]) {
        const glass = model.box(parent, x + length * offset, 21, z + 3.25, length * .38, 9.5, 1, '#c2d6d7')
        glass.castShadow = false
        model.box(parent, x + length * offset, 20, z + 3.5, length * .39, 1, 1.8, '#edf2ef').castShadow = false
      }
    }
  }

  const { side, center, width: clearWidth } = room.doorway
  const horizontal = side === 'north' || side === 'south'
  const roomX = center.x - room.frame.x
  const roomZ = center.y - room.frame.y
  // Flush floor strip. There is no wall collider or render mesh above the threshold.
  model.box(parent, roomX, 0, roomZ, horizontal ? clearWidth : 10, .22, horizontal ? 10 : clearWidth, '#c9d7d6').castShadow = false
  for (const edge of [-4, 4]) {
    model.box(parent, roomX + (horizontal ? 0 : edge), .22, roomZ + (horizontal ? edge : 0), horizontal ? clearWidth : .6, .16, horizontal ? .6 : clearWidth, '#ecf0ee').castShadow = false
  }
}

export function buildOfficeWorld(
  layout: OfficeLayout,
  rooms: readonly ResolvedRoom[],
  roster: ReadonlyMap<string, Member[]>,
  meId: string | null,
  _onTexture: () => void,
  editable = false,
  presence: readonly SeatPresence[] = [],
) {
  const scene = new THREE.Scene()
  const model = createModelKit()
  const avatars = createAvatarKit()
  const roomAnchors: RoomAnchor[] = []
  const people: PersonAnchor[] = []
  const floors: THREE.Mesh[] = []
  const seatTargets: { roomId: string; seatIndex: number; position: THREE.Vector3; occupant?: string }[] = []
  const overrides = new Map(presence.map(seat => [seat.memberId, seat]))
  const allMembers = new Map([...roster.values()].flat().map(member => [member.id, member]))
  const solids: THREE.Object3D[] = []
  const roomModels = new Map<string, THREE.Group>()
  const furnitureModels = new Map<string, THREE.Group>()
  const staticModels: THREE.Object3D[] = []
  const highlights = new Map<string, THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>()
  const screens = new Map<string, ReturnType<typeof buildGmvScreen>>()
  let mySeat: THREE.Vector3 | null = null
  const { width, height } = layout
  const center = new THREE.Vector3(width / 2, 0, height / 2)

  const slab = model.box(scene, center.x, BASE_LEVEL, center.z, width + 28, -BASE_LEVEL - .8, height + 28, '#cdd6d3')
  slab.name = 'office-base'
  const foundation = model.box(scene, center.x, -.8, center.z, width + 18, .7, height + 18, '#eeefeb')
  foundation.castShadow = false

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(width * 4, height * 4), new THREE.ShadowMaterial({ opacity: .12 }))
  ground.rotation.x = -Math.PI / 2
  ground.position.set(center.x, BASE_LEVEL - .2, center.z)
  ground.receiveShadow = true
  scene.add(ground)

  for (const room of rooms) {
    const frame = room.frame
    const group = new THREE.Group()
    group.name = room.id
    group.position.set(frame.x, 0, frame.y)
    roomModels.set(room.id, group)
    group.userData.roomId = room.id
    scene.add(group)

    const floor = model.box(group, frame.width / 2, -1, frame.height / 2, frame.width, 1, frame.height, room.floor)
    floor.castShadow = false
    floor.userData.roomId = room.id
    floors.push(floor)
    const finish = new THREE.Mesh(new THREE.PlaneGeometry(frame.width, frame.height),
      createFloorMaterial(room.floorMaterial ?? (room.appearance.material === 'wood' ? 'wood' : 'tile'), room.floor))
    finish.rotation.x = -Math.PI / 2
    finish.position.set(frame.width / 2, .05, frame.height / 2)
    finish.receiveShadow = true
    group.add(finish)
    const architecture = new THREE.Group()
    group.add(architecture)
    if (room.template !== 'empty') walls(room, rooms, architecture, model, solids)
    const furniture = new THREE.Group()
    group.add(furniture)
    if (room.useTemplateFurniture !== false)
      room.appearance.build({ group: furniture, model, width: frame.width, depth: frame.height, seats: room.seats, doorway: room.doorway })
    const customFurniture = editable ? new THREE.Group() : furniture
    if (editable) group.add(customFurniture)
    for (const item of room.furniture ?? []) {
      let object: THREE.Group
      if(item.kind==='screen' && room.appearance.display==='gmv' && !screens.has(room.id)){
        object=new THREE.Group();customFurniture.add(object)
        object.position.set(item.x*frame.width,item.elevation??0,item.y*frame.height);object.rotation.y=-item.rotation*Math.PI/180
        const screenFrame=new THREE.Group();object.add(screenFrame);screenFrame.position.set(-100,0,-32.2)
        const size=item.size;object.scale.set((size?.width??125)/124,(size?.height??62)/62,(size?.depth??30)/35)
        screens.set(room.id,buildGmvScreen(screenFrame,model,200,140))
      }else object = buildPlacedFurniture(customFurniture, model, item, frame)
      if (editable) {
        object.userData.ownerRoomId = room.id
        furnitureModels.set(item.id, object)
      }
    }
    if (room.appearance.display === 'gmv' && room.useTemplateFurniture !== false) {
      const mediaWall = new THREE.Group()
      group.add(mediaWall)
      screens.set(room.id, buildGmvScreen(mediaWall, model, frame.width, frame.height))
      solids.push(mediaWall)
    }
    solids.push(furniture)
    const roomStatics = [architecture, furniture]

    const selection = new THREE.Mesh(
      new THREE.PlaneGeometry(frame.width - 7, frame.height - 7),
      new THREE.MeshBasicMaterial({ color: '#5492db', transparent: true, opacity: .13, depthWrite: false }),
    )
    selection.rotation.x = -Math.PI / 2
    selection.position.set(frame.width / 2, .13, frame.height / 2)
    selection.visible = false
    group.add(selection)
    highlights.set(room.id, selection)

    const roomMembers = roster.get(room.id) ?? []
    roomAnchors.push({
      room,
      position: new THREE.Vector3(frame.x + 12, room.appearance.display === 'gmv' ? 55 : 28, frame.y + 5),
      present: roomMembers.filter((member) => member.presence !== 'offline').length,
    })

    for (const [index, seat] of room.seats.entries()) {
      const x = seat.x * frame.width
      const z = seat.y * frame.height
      const station = new THREE.Group()
      station.position.set(x, 0, z)
      station.rotation.y = seat.rotation !== undefined ? -seat.rotation*Math.PI/180 : seat.facing === 'south' ? Math.PI : 0
      group.add(station)
      const seatModel = new THREE.Group()
      station.add(seatModel)
      if (room.useTemplateFurniture !== false) officeChair(seatModel, model)
      solids.push(seatModel)
      roomStatics.push(seatModel)
      const occupied = presence.find(value => value.seated && value.roomId === room.id && value.seatIndex === index)
      const original = roomMembers[index]
      const candidate = occupied ? allMembers.get(occupied.memberId) : original && !overrides.has(original.id) ? original : undefined
      const member = candidate && (candidate.presence !== 'offline' || candidate.id === meId) ? { ...candidate, roomId: room.id } : undefined
      seatTargets.push({ roomId: room.id, seatIndex: index, position: new THREE.Vector3(frame.x + x, 18, frame.y + z), occupant: member?.id ?? occupied?.memberId })
      if (member?.id === meId) {
        mySeat = new THREE.Vector3(frame.x + x, 0, frame.y + z)
        const halo = new THREE.Mesh(
          new THREE.RingGeometry(13, 15, 32),
          new THREE.MeshBasicMaterial({ color: '#527ec2', side: THREE.DoubleSide }),
        )
        halo.rotation.x = -Math.PI / 2
        halo.position.y = .17
        station.add(halo)
      }
      if (!member || (member.presence === 'offline' && member.id !== meId)) continue
      const occupant = avatars.seated(member)
      occupant.name = member.id
      station.add(occupant)
      people.push({
        member,
        position: new THREE.Vector3(frame.x + x, 50, frame.y + z - (seat.facing === 'south' ? 8 : 20)),
        mesh: occupant,
      })
    }
    for (const state of presence.filter(value => !value.seated && value.roomId === room.id)) {
      const member = allMembers.get(state.memberId), seat = room.seats[state.seatIndex]
      if (!member || !seat || (member.presence === 'offline' && member.id !== meId)) continue
      const stand = avatars.standing(member).body
      const x = seat.x * frame.width + 19, z = seat.y * frame.height + 15
      stand.position.set(x, 0, z); group.add(stand)
      people.push({ member: { ...member, roomId: room.id }, mesh: stand, position: new THREE.Vector3(frame.x + x, 53, frame.y + z) })
      if (member.id === meId) mySeat = new THREE.Vector3(frame.x + x, 0, frame.y + z)
    }
    if (editable) model.batchStatic(group, roomStatics)
    else staticModels.push(...roomStatics)
  }

  const roomPresence = new Map<string, number>()
  for (const person of people) if (person.member.presence !== 'offline') roomPresence.set(person.member.roomId, (roomPresence.get(person.member.roomId) ?? 0) + 1)
  for (const anchor of roomAnchors) anchor.present = roomPresence.get(anchor.room.id) ?? 0
  if (!editable) model.batchStatic(scene, staticModels)
  scene.add(new THREE.HemisphereLight('#f7fcff', '#bca993', 1.92))
  const fill = new THREE.DirectionalLight('#ebf6ff', .40)
  fill.position.set(center.x + 400, 360, center.z + 520)
  scene.add(fill)
  const sun = new THREE.DirectionalLight('#fff5e3', 1.83)
  sun.position.set(center.x - 360, 780, center.z - 240)
  sun.target.position.copy(center)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  const span = Math.max(width, height) * .69
  Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 10, far: 1800 })
  sun.shadow.camera.updateProjectionMatrix()
  sun.shadow.normalBias = .38
  sun.shadow.bias = -.00018
  sun.shadow.radius = 4.4
  sun.shadow.intensity = .67
  scene.add(sun, sun.target)
  if (editable) scene.updateMatrixWorld(true)

  return {
    scene, floors, seatTargets, roomAnchors, people, highlights, mySeat, solids, screens, roomModels, furnitureModels,
    addWalker(look: AvatarLook) {
      const walker = createWalker(avatars, look)
      scene.add(walker.mesh)
      return walker
    },
    dispose() {
      for (const screen of screens.values()) screen.dispose()
      const geometries = new Set<THREE.BufferGeometry>()
      const materials = new Set<THREE.Material>()
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments)) return
        if (object instanceof THREE.InstancedMesh) object.dispose()
        geometries.add(object.geometry)
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material)
      })
      for (const geometry of geometries) geometry.dispose()
      for (const material of materials) material.dispose()
      avatars.dispose()
      sun.shadow.dispose()
    },
  }
}
