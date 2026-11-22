import * as THREE from 'three'
import type { Member } from '@/data/office'
import { getRoomWallSegments, WALL_THICKNESS, type OfficeLayout, type ResolvedRoom } from '../rooms/api'
import { buildPlacedFurniture } from '../rooms/placed-furniture'
import { createModelKit, type ModelKit } from './model'
import { createWalker } from './walker'
import { createAvatarKit, type AvatarLook } from './avatar'
import { buildGmvScreen } from './gmv-screen'
import woodFloorUrl from '@/assets/office/wood-floor.webp?inline'

export type OfficeMode = 'daily' | 'presence' | 'tasks'

type RoomAnchor = { room: ResolvedRoom; position: THREE.Vector3; present: number }
type PersonAnchor = { member: Member; position: THREE.Vector3; mesh: THREE.Mesh }

const WALL_COLOR = '#f3f4f1'
const BASE_LEVEL = -11

function floorPattern(room: ResolvedRoom, parent: THREE.Group) {
  if (room.floorMaterial === 'concrete') return
  const { width, height } = room.frame
  const wood = (room.floorMaterial ?? room.appearance.material) === 'wood'
  const lines: number[] = []
  const interval = wood ? 13 : 34
  for (let z = interval; z < height; z += interval) {
    lines.push(0, .09, z, width, .09, z)
  }
  for (let x = wood ? 28 : 34; x < width; x += wood ? 90 : 34) {
    if (wood) {
      for (let z = 0; z < height; z += interval) {
        const joint = x + (Math.round(z / interval) % 3) * 24
        if (joint < width) lines.push(joint, .09, z, joint, .09, Math.min(z + interval, height))
      }
    } else {
      lines.push(x, .09, 0, x, .09, height)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3))
  const material = new THREE.LineBasicMaterial({ color: wood ? '#ac9478' : '#87919a', transparent: true, opacity: wood ? .085 : .058 })
  parent.add(new THREE.LineSegments(geometry, material))
}

function walls(room: ResolvedRoom, parent: THREE.Group, model: ModelKit, solids: THREE.Object3D[]) {
  const { width, height } = room.frame
  for (const { side, start, end } of getRoomWallSegments(room.frame, room.doorway)) {
    const horizontal = side === 'north' || side === 'south'
    const length = end - start
    const middle = start + length / 2
    const x = horizontal ? middle : side === 'east' ? width : 0
    const z = horizontal ? side === 'south' ? height : 0 : middle
    const wallHeight = side === 'north' ? 34 : 13
    const wallWidth = horizontal ? length : WALL_THICKNESS
    const wallDepth = horizontal ? WALL_THICKNESS : length
    solids.push(model.box(parent, x, 0, z, wallWidth, wallHeight, wallDepth, WALL_COLOR))
    model.box(parent, x, wallHeight, z, wallWidth + (horizontal ? 0 : 1), 1.5, wallDepth + (horizontal ? 1 : 0), '#fffefa')
    const trimInset = WALL_THICKNESS / 2 + .25
    const insetX = horizontal ? x : x + (side === 'west' ? trimInset : -trimInset)
    const insetZ = horizontal ? z + (side === 'north' ? trimInset : -trimInset) : z
    const baseboard = model.box(parent, insetX, .25, insetZ, horizontal ? length : .7, 2.3, horizontal ? .7 : length, '#d3dcd9')
    baseboard.castShadow = false
    if (side === 'north' && length > 100) {
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

function chair(group: THREE.Group, model: ModelKit) {
  for (let spoke = 0; spoke < 3; spoke++) {
    const angle = spoke * Math.PI / 3
    model.softBox(group, 0, .2, 1, 16, 2.1, 2.7, '#818d94').rotation.y = angle
    for (const sign of [-1, 1]) model.orb(group, sign * Math.cos(angle) * 7, 0, 1 + sign * Math.sin(angle) * 7, 3, 3, 3, '#627074')
  }
  model.round(group, 0, 1.8, 1, 4.5, 9, '#acb6bd')
  model.softBox(group, 0, 10, 0, 17.5, 4.6, 16, '#9aaba8')
  model.softBox(group, 0, 11.5, 8, 18.5, 13.5, 4.2, '#f5f5ef')
  model.softBox(group, 0, 15.3, 6, 15, 7.8, 1.6, '#a5b1b4')
  for (const x of [-9, 9]) {
    model.box(group, x, 11, 3, 1.6, 7, 2.8, '#a5b1b4')
    model.softBox(group, x, 17, 2, 3, 1.8, 11, '#c8d1cd')
  }
}

export function buildOfficeWorld(
  layout: OfficeLayout,
  rooms: readonly ResolvedRoom[],
  roster: ReadonlyMap<string, Member[]>,
  meId: string | null,
  onTexture: () => void,
  editable = false,
) {
  const scene = new THREE.Scene()
  const model = createModelKit()
  const avatars = createAvatarKit()
  const roomAnchors: RoomAnchor[] = []
  const people: PersonAnchor[] = []
  const floors: THREE.Mesh[] = []
  const solids: THREE.Object3D[] = []
  const roomModels = new Map<string, THREE.Group>()
  const furnitureModels = new Map<string, THREE.Group>()
  const staticModels: THREE.Object3D[] = []
  const highlights = new Map<string, THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>()
  const screens = new Map<string, ReturnType<typeof buildGmvScreen>>()
  let disposed = false
  const wood = rooms.some((room) => (room.floorMaterial ?? room.appearance.material) === 'wood')
    ? new THREE.TextureLoader().load(woodFloorUrl, (texture) => { if (disposed) texture.dispose(); else onTexture() })
    : undefined
  if (wood) {
    wood.colorSpace = THREE.SRGBColorSpace
    wood.wrapS = wood.wrapT = THREE.RepeatWrapping
    wood.anisotropy = 4
  }
  let mySeat: THREE.Vector3 | null = null
  const { width, height } = layout
  const center = new THREE.Vector3(width / 2, 0, height / 2)

  const slab = model.box(scene, center.x, BASE_LEVEL, center.z, width + 28, -BASE_LEVEL - .8, height + 28, '#cdd6d3')
  slab.name = 'office-base'
  const corridor = model.box(scene, center.x, -.8, center.z, width + 18, .7, height + 18, '#e5e6de')
  corridor.castShadow = false

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
    if ((room.floorMaterial ?? room.appearance.material) === 'wood' && wood) {
      const grain = new THREE.PlaneGeometry(frame.width, frame.height)
      const uv = grain.getAttribute('uv')
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * frame.width / 285, uv.getY(i) * frame.height / 285)
      const finish = new THREE.Mesh(grain, new THREE.MeshLambertMaterial({ color: room.floor, map: wood }))
      finish.rotation.x = -Math.PI / 2
      finish.position.set(frame.width / 2, .05, frame.height / 2)
      finish.receiveShadow = true
      group.add(finish)
    } else floorPattern(room, group)
    const architecture = new THREE.Group()
    group.add(architecture)
    if (room.template !== 'empty') walls(room, architecture, model, solids)
    const furniture = new THREE.Group()
    group.add(furniture)
    if (room.useTemplateFurniture !== false)
      room.appearance.build({ group: furniture, model, width: frame.width, depth: frame.height, seats: room.seats, doorway: room.doorway })
    const customFurniture = editable ? new THREE.Group() : furniture
    if (editable) group.add(customFurniture)
    for (const item of room.furniture ?? []) {
      const object = buildPlacedFurniture(customFurniture, model, item, frame)
      if (editable) {
        object.userData.ownerRoomId = room.id
        furnitureModels.set(item.id, object)
      }
    }
    if (room.appearance.display === 'gmv') {
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
      station.rotation.y = seat.facing === 'south' ? Math.PI : 0
      group.add(station)
      const seatModel = new THREE.Group()
      station.add(seatModel)
      chair(seatModel, model)
      solids.push(seatModel)
      roomStatics.push(seatModel)
      const member = roomMembers[index]
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
    if (editable) model.batchStatic(group, roomStatics)
    else staticModels.push(...roomStatics)
  }

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
    scene, floors, roomAnchors, people, highlights, mySeat, solids, screens, roomModels, furnitureModels,
    addWalker(look: AvatarLook) {
      const walker = createWalker(avatars, look)
      scene.add(walker.mesh)
      return walker
    },
    dispose() {
      disposed = true
      wood?.dispose()
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
