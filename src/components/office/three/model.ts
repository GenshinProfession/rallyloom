import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { furnitureGeometry, type FurnitureAsset } from './furniture-assets'

export function createModelKit() {
  let boxGeometry: THREE.BoxGeometry | undefined
  let softBoxGeometry: RoundedBoxGeometry | undefined
  let roundGeometry: THREE.CylinderGeometry | undefined
  let orbGeometry: THREE.SphereGeometry | undefined
  const materials = new Map<string, THREE.MeshLambertMaterial>()
  const kitMeshes = new WeakSet<THREE.Object3D>()
  const furniture = new Map<FurnitureAsset, THREE.BufferGeometry>()
  let furnitureMaterial: THREE.MeshLambertMaterial | undefined

  function material(color: THREE.ColorRepresentation) {
    const key = new THREE.Color(color).getHexString()
    let surface = materials.get(key)
    if (!surface) {
      surface = new THREE.MeshLambertMaterial({ color })
      materials.set(key, surface)
    }
    return surface
  }

  function mesh(
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    x: number, y: number, z: number,
    width: number, height: number, depth: number,
    color: THREE.ColorRepresentation,
  ) {
    const part = new THREE.Mesh(geometry, material(color))
    part.position.set(x, y + height / 2, z)
    part.scale.set(width, height, depth)
    part.castShadow = true
    part.receiveShadow = true
    parent.add(part)
    kitMeshes.add(part)
    return part
  }

  return {
    batchStatic: (parent: THREE.Object3D, branches: readonly THREE.Object3D[]) => batchStaticModels(parent, branches, kitMeshes),
    asset(parent: THREE.Object3D, name: FurnitureAsset, x: number, y: number, z: number, width: number, height: number, depth: number) {
      let geometry = furniture.get(name)
      if (!geometry) { geometry = furnitureGeometry(name); furniture.set(name, geometry) }
      const part = new THREE.Mesh(geometry, furnitureMaterial ??= new THREE.MeshLambertMaterial({ vertexColors: true }))
      part.position.set(x, y, z)
      part.scale.set(width, height, depth)
      part.castShadow = part.receiveShadow = true
      parent.add(part)
      kitMeshes.add(part)
      return part
    },
    box: (
      parent: THREE.Object3D, x: number, y: number, z: number,
      width: number, height: number, depth: number, color: THREE.ColorRepresentation,
    ) => mesh(parent, boxGeometry ??= new THREE.BoxGeometry(1, 1, 1), x, y, z, width, height, depth, color),
    softBox: (
      parent: THREE.Object3D, x: number, y: number, z: number,
      width: number, height: number, depth: number, color: THREE.ColorRepresentation,
    ) => mesh(parent, softBoxGeometry ??= new RoundedBoxGeometry(1, 1, 1, 2, .13), x, y, z, width, height, depth, color),
    round: (
      parent: THREE.Object3D, x: number, y: number, z: number,
      diameter: number, height: number, color: THREE.ColorRepresentation,
    ) => mesh(parent, roundGeometry ??= new THREE.CylinderGeometry(.5, .5, 1, 18), x, y, z, diameter, height, diameter, color),
    orb: (
      parent: THREE.Object3D, x: number, y: number, z: number,
      width: number, height: number, depth: number, color: THREE.ColorRepresentation,
    ) => mesh(parent, orbGeometry ??= new THREE.SphereGeometry(.5, 12, 8), x, y, z, width, height, depth, color),
  }
}

export type ModelKit = ReturnType<typeof createModelKit>

function batchStaticModels(parent: THREE.Object3D, branches: readonly THREE.Object3D[], kitMeshes: WeakSet<THREE.Object3D>) {
  parent.updateWorldMatrix(true, false)
  const toLocal = parent.matrixWorld.clone().invert()
  const instanceMatrix = new THREE.Matrix4()
  const batches = new Map<string, THREE.Mesh<THREE.BufferGeometry, THREE.Material>[]>()
  for (const branch of branches) {
    branch.updateWorldMatrix(true, true)
    branch.traverseVisible((part) => {
      if (!(part instanceof THREE.Mesh) || !kitMeshes.has(part) || Array.isArray(part.material) || part.layers.mask !== 1) return
      const key = `${part.geometry.id}:${part.material.id}:${part.castShadow}:${part.receiveShadow}`
      const batch = batches.get(key)
      if (batch) batch.push(part)
      else batches.set(key, [part])
    })
  }
  for (const parts of batches.values()) {
    if (parts.length < 2) continue
    const [first] = parts
    const instances = new THREE.InstancedMesh(first.geometry, first.material, parts.length)
    instances.castShadow = first.castShadow
    instances.receiveShadow = first.receiveShadow
    parts.forEach((part, i) => {
      instances.setMatrixAt(i, instanceMatrix.multiplyMatrices(toLocal, part.matrixWorld))
      // The original transforms remain available to room navigation.
      part.visible = false
    })
    parent.add(instances)
  }
}
