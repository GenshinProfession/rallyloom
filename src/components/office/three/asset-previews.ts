import * as THREE from 'three'
import { resolveOfficeLayout, roomTemplates } from '../rooms'
import type { FurnitureKind } from '../rooms/api'
import { buildPlacedFurniture } from '../rooms/placed-furniture'
import { createModelKit } from './model'
import { buildOfficeWorld } from './world'

export type OfficeAsset = { kind: 'room'; id: string } | { kind: 'furniture'; id: FurnitureKind }
export const previewKey = ({ kind, id }: OfficeAsset) => kind + ':' + id
const thumbnails = new Map<string, string>()
export const officePreview = (asset: OfficeAsset) => thumbnails.get(previewKey(asset))

export function createAssetPreviewRenderer() {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
  renderer.setSize(252, 176)
  renderer.setClearColor(0xe9efee, 0)
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = .96
  const camera = new THREE.OrthographicCamera(-126, 126, 88, -88, 1, 1800)
  const cameraDirection = new THREE.Vector3(.38, 1, .92).normalize()

  function draw(scene: THREE.Scene, target: THREE.Vector3, zoom: number) {
    camera.position.copy(target).addScaledVector(cameraDirection, 640)
    camera.lookAt(target)
    camera.zoom = zoom
    camera.updateProjectionMatrix()
    renderer.render(scene, camera)
    return renderer.domElement.toDataURL('image/png')
  }

  return {
    render(asset: OfficeAsset) {
      const cached = officePreview(asset)
      if (cached) return cached
      let image: string
      if (asset.kind === 'room') {
        const frame = { x: 0, y: 0, width: 260, height: 200 }
        const layout = { ...frame, rooms: [{ id: asset.id, name: asset.id, frame, template: asset.id }] }
        const room = resolveOfficeLayout(layout, roomTemplates)
        const world = buildOfficeWorld(layout, room, new Map(), null, () => {})
        try { image = draw(world.scene, new THREE.Vector3(130, 6, 100), .64) }
        finally { world.dispose() }
      } else {
        const scene = new THREE.Scene()
        const model = createModelKit()
        const group = new THREE.Group()
        scene.add(group)
        const frame = { x: 0, y: 0, width: 100, height: 100 }
        buildPlacedFurniture(group, model, { id: asset.id, kind: asset.id, x: .5, y: .5, rotation: 0 }, frame)
        const sun = new THREE.DirectionalLight(0xfff4dc, 2.2)
        sun.position.set(80, 110, 30)
        scene.add(new THREE.HemisphereLight(0xffffff, 0x7c8d88, 2.4), sun)
        const bounds = new THREE.Box3().setFromObject(group)
        const span = bounds.getSize(new THREE.Vector3())
        try { image = draw(scene, bounds.getCenter(new THREE.Vector3()), 122 / Math.max(span.x, span.y, span.z)) }
        finally {
          scene.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return
            object.geometry.dispose()
            for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose()
          })
        }
      }
      thumbnails.set(previewKey(asset), image)
      return image
    },
    dispose() {
      renderer.dispose()
      renderer.forceContextLoss()
    },
  }
}
