import { CircleGeometry, Group, Mesh, MeshBasicMaterial, RingGeometry } from 'three'
import type { AvatarKit, AvatarLook } from './avatar'

export function createWalker(avatars: AvatarKit, look: AvatarLook) {
  const mesh = new Group()
  const { body, arms, legs } = avatars.standing(look)
  mesh.add(body)

  const shadow = new Mesh(new CircleGeometry(9, 24), new MeshBasicMaterial({ color: '#263441', opacity: .12, transparent: true, depthWrite: false }))
  shadow.rotation.x = -Math.PI / 2
  shadow.scale.y = .78
  shadow.position.y = .18
  mesh.add(shadow)

  const ring = new Mesh(new RingGeometry(9.6, 10.8, 32), new MeshBasicMaterial({ color: '#527ec2', opacity: .86, transparent: true, depthWrite: false }))
  ring.rotation.x = -Math.PI / 2
  ring.position.y = .24
  mesh.add(ring)

  mesh.traverse((part) => { part.castShadow = false })
  mesh.visible = false

  return {
    mesh,
    pose(stride: number) {
      legs[0].rotation.x = stride * .43
      legs[1].rotation.x = stride * -.43
      arms[0].rotation.x = stride * -.33
      arms[1].rotation.x = stride * .33
      body.position.y = Math.abs(stride) * .58
    },
  }
}
