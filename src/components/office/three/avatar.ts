import {
  CapsuleGeometry, Color, Float32BufferAttribute, Group, Mesh, MeshPhongMaterial,
  SphereGeometry, Vector3, type BufferGeometry, type ColorRepresentation,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export interface AvatarLook {
  id: string
  body: string
  skin: string
  hair: string
}

const HAIR_STYLES = ['crop', 'bob', 'part', 'tied', 'wave'] as const
type HairStyle = typeof HAIR_STYLES[number]
type Point = [number, number, number]
const HAIR_VOLUME: Record<HairStyle, Point> = {
  crop: [7.62, 7.70, 7.31],
  bob: [8.42, 8.10, 7.64],
  part: [7.79, 8.46, 7.43],
  tied: [7.58, 8.01, 7.29],
  wave: [8.25, 8.32, 7.83],
}
const up = new Vector3(0, 1, 0)

function variant(id: string) {
  let value = 0
  for (const char of id) value = (Math.imul(31, value) + char.codePointAt(0)!) >>> 0
  return value
}

function hairCap(style: HairStyle) {
  const geometry = new SphereGeometry(1, 26, 15, 0, Math.PI * 2, 0, 1)
  const points = geometry.getAttribute('position')
  const rearDepth = { crop: 2.03, bob: 2.72, part: 2.27, tied: 2.34, wave: 2.52 }[style]
  for (let i = 0; i < points.count; i++) {
    const x = points.getX(i)
    const z = points.getZ(i)
    const azimuth = Math.atan2(x, z)
    const front = (1 - Math.cos(azimuth)) / 2
    const swept = Math.sin(azimuth * 2) * front * (style === 'part' || style === 'wave' ? .24 : .06)
    const rim = rearDepth * (1 - front) + 1.33 * front + swept
    const latitude = Math.acos(Math.max(-1, Math.min(1, points.getY(i)))) * rim
    const texture = style === 'wave' ? .038 * Math.cos(4 * azimuth + latitude * 2.6) : 0
    const ring = Math.sin(latitude) * (1 + texture)
    const crest = style === 'part' ? .14 * Math.sin(azimuth) * Math.sin(2 * latitude) : 0
    points.setXYZ(i, ring * Math.sin(azimuth), Math.cos(latitude) + crest, ring * Math.cos(azimuth))
  }
  geometry.computeVertexNormals()
  return geometry
}

export function createAvatarKit() {
  const oval = new SphereGeometry(.5, 22, 14)
  const smallOval = new SphereGeometry(.5, 12, 8)
  const capsule = new CapsuleGeometry(1, 1, 6, 14)
  const caps = new Map<HairStyle, SphereGeometry>()
  const paint = new Map<string, MeshPhongMaterial>()
  const finish = new MeshPhongMaterial({ vertexColors: true, specular: '#292b28', shininess: 18 })

  function shape(group: Group, geometry: BufferGeometry, color: ColorRepresentation, at: Point, scale: Point) {
    const tone = new Color(color)
    const key = tone.getHexString()
    let material = paint.get(key)
    if (!material) {
      material = new MeshPhongMaterial({ color: tone, specular: '#292b28', shininess: 18 })
      paint.set(key, material)
    }
    const mesh = new Mesh(geometry, material)
    mesh.position.set(...at)
    mesh.scale.set(...scale)
    group.add(mesh)
    return mesh
  }

  const egg = (group: Group, color: ColorRepresentation, at: Point, size: Point) =>
    shape(group, Math.max(...size) <= 5.5 ? smallOval : oval, color, at, size)

  function limb(group: Group, color: ColorRepresentation, start: Point, end: Point, diameter: number) {
    const from = new Vector3(...start)
    const axis = new Vector3(...end).sub(from)
    const center = from.addScaledVector(axis, .5)
    const mesh = shape(group, capsule, color, [center.x, center.y, center.z], [diameter / 2, (axis.length() + diameter) / 3, diameter / 2])
    mesh.quaternion.setFromUnitVectors(up, axis.normalize())
  }

  function upperBody(group: Group, look: AvatarLook, design: number) {
    const outfit = new Color(look.body)
    const trim = outfit.clone().lerp(new Color('#222c31'), .4)
    const earTone = new Color(look.skin).lerp(new Color('#b56e55'), .15)
    const trousers = trim.clone().lerp(new Color('#343b43'), .70)
    const outfitStyle = design % 3
    const style = HAIR_STYLES[design % HAIR_STYLES.length]

    egg(group, outfit, [0, 9.1, -.3], [16.5, 17, 10.9])
    egg(group, trim, [0, 3.3, .1], [14.2, 6, 9.8])
    if (outfitStyle === 0) {
      egg(group, '#e8e2d7', [0, 13.1, -5.0], [5.5, 8.4, 2.4])
      for (const side of [-1, 1]) {
        const lapel = egg(group, trim, [side * 2.25, 13.4, -5.3], [2, 6.15, 1.8])
        lapel.rotation.z = side * -.23
      }
    } else if (outfitStyle === 1) {
      egg(group, '#d8cbb7', [0, 16.7, -.65], [7.8, 3.1, 6.8])
    } else {
      egg(group, trim, [0, 15.2, 2.65], [9.0, 5.0, 7.5])
      egg(group, outfit, [0, 7.75, -5.1], [9.4, 4.0, 2.1])
    }
    egg(group, look.skin, [0, 17.7, -.5], [5.5, 5.8, 5.1])

    const head = new Group()
    head.position.set(0, 25.8, -1.1)
    head.scale.set(1.12, 1.06, 1.1)
    group.add(head)
    egg(head, look.skin, [0, -.2, -.4], [14.8, 15.4, 13.6])
    for (const side of [-1, 1]) {
      const x = side * 6.95
      egg(head, earTone, [x, -1.15, -.8], [2.1, 3.8, 2.5])
      egg(head, '#312b2c', [side * 2.6, -.75, -6.53], [1.18, 1.65, .75])
    }
    egg(head, look.skin, [0, -2.1, -7.0], [2.0, 2.1, 1.8])
    egg(head, earTone, [0, -3.9, -6.1], [2.4, .56, .6])

    let cap = caps.get(style)
    if (!cap) { cap = hairCap(style); caps.set(style, cap) }
    shape(head, cap, look.hair, [0, .6, -.19], HAIR_VOLUME[style])
    if (style === 'tied') egg(head, look.hair, [0, 6.6, 7.02], [6.7, 6.4, 6.4])
    return { outfit, trousers }
  }

  function sculpt(group: Group) {
    const parts: BufferGeometry[] = []
    group.updateMatrixWorld(true)
    group.traverse((part) => {
      if (!(part instanceof Mesh) || !(part.material instanceof MeshPhongMaterial)) return
      const geometry = part.geometry.clone()
      geometry.deleteAttribute('uv')
      geometry.applyMatrix4(part.matrixWorld)
      const count = geometry.getAttribute('position').count
      const colors = new Float32Array(count * 3)
      for (let i = 0; i < count; i++) part.material.color.toArray(colors, i * 3)
      geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
      parts.push(geometry)
    })
    const merged = mergeGeometries(parts)!
    for (const part of parts) part.dispose()
    const result = new Mesh(merged, finish)
    result.castShadow = result.receiveShadow = true
    return result
  }

  function seated(look: AvatarLook) {
    const form = new Group()
    const pose = new Group()
    pose.position.y = 14
    form.add(pose)
    const { outfit, trousers } = upperBody(pose, look, variant(look.id))
    for (const side of [-1, 1]) {
      const x = side * 3.6
      limb(pose, trousers, [x, .4, 0], [x, .3, -8.4], 4.9)
      limb(pose, trousers, [x, .3, -8.1], [x, -9.6, -10.2], 4.0)
      egg(pose, '#343837', [x, -11.9, -11.5], [4.7, 3.3, 7.0])
      limb(pose, outfit, [side * 6.15, 13.0, -.9], [side * 8.0, 7.4, -5.0], 4.2)
      limb(pose, outfit, [side * 8.0, 7.4, -5.0], [side * 6.8, 9.0, -11.1], 3.6)
      egg(pose, look.skin, [side * 6.4, 9.15, -12.8], [3.5, 2.6, 4.7])
    }
    return sculpt(form)
  }

  function standing(look: AvatarLook) {
    const body = new Group()
    const top = new Group()
    const { outfit, trousers } = upperBody(top, look, variant(look.id))
    top.position.y = 13
    body.add(sculpt(top))
    const arms: Group[] = []
    const legs: Group[] = []
    for (const side of [-1, 1]) {
      const sleeve = new Group()
      limb(sleeve, outfit, [0, 0, 0], [side * 1.15, -7.4, -.7], 4)
      limb(sleeve, outfit, [side * 1.15, -7.4, -.7], [side * .9, -11, -.9], 3.3)
      egg(sleeve, look.skin, [side * .9, -12.25, -1.0], [3.35, 3.7, 3.5])
      const arm = new Group()
      arm.position.set(side * 6.8, 26.6, -.4)
      arm.add(sculpt(sleeve))
      body.add(arm)
      arms.push(arm)

      const pant = new Group()
      limb(pant, trousers, [0, 0, 0], [0, -10.2, 0], 4.85)
      egg(pant, '#343837', [0, -11.55, -1.45], [5, 3.0, 7.6])
      const leg = new Group()
      leg.position.set(side * 3.5, 13.1, 0)
      leg.add(sculpt(pant))
      body.add(leg)
      legs.push(leg)
    }
    return { body, arms, legs }
  }

  function dispose() {
    oval.dispose()
    smallOval.dispose()
    capsule.dispose()
    for (const cap of caps.values()) cap.dispose()
    for (const material of paint.values()) material.dispose()
  }

  return { seated, standing, dispose }
}

export type AvatarKit = ReturnType<typeof createAvatarKit>
