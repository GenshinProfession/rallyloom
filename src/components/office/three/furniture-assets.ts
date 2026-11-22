import { Color, Float32BufferAttribute, Mesh, Vector3, type BufferGeometry } from 'three'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import plant from '@/assets/office/pottedPlant.obj?raw'
import sofa from '@/assets/office/loungeSofa.obj?raw'
import coffee from '@/assets/office/kitchenCoffeeMachine.obj?raw'
import lamp from '@/assets/office/lampRoundFloor.obj?raw'

const assets = {
  plant: { source: plant, palette: { plant: '#63886b', wood: '#d9cab6', woodDark: '#a98b71' } },
  sofa: { source: sofa, palette: { carpet: '#799487', wood: '#9a8170' } },
  coffee: { source: coffee, palette: { metal: '#7c9295', metalMedium: '#394952', carpetWhite: '#f1ece0' } },
  lamp: { source: lamp, palette: { metal: '#6c7978', lamp: '#f5dfb6' } },
}

export type FurnitureAsset = keyof typeof assets

export function furnitureGeometry(name: FurnitureAsset) {
  const { source, palette } = assets[name]
  const parsed = new OBJLoader().parse(source.replace(/^usemap .*$/gm, ''))
  const parts: BufferGeometry[] = []
  parsed.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const part = object.geometry as BufferGeometry
    const vertexCount = part.getAttribute('position').count
    const colors = new Float32Array(vertexCount * 3)
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    const groups = part.groups.length ? part.groups : [{ start: 0, count: vertexCount, materialIndex: 0 }]
    for (const { start, count, materialIndex } of groups) {
      const color = new Color((palette as Record<string, string>)[materials[materialIndex ?? 0].name] ?? '#ded5c7')
      for (let i = start; i < start + count; i++) color.toArray(colors, i * 3)
    }
    part.deleteAttribute('uv')
    part.setAttribute('color', new Float32BufferAttribute(colors, 3))
    parts.push(part)
    for (const material of materials) material.dispose()
  })
  const geometry = mergeGeometries(parts)!
  for (const part of parts) part.dispose()
  geometry.computeBoundingBox()
  const bounds = geometry.boundingBox!
  const size = bounds.getSize(new Vector3())
  const center = bounds.getCenter(new Vector3())
  geometry.translate(-center.x, -bounds.min.y, -center.z)
  geometry.scale(1 / size.x, 1 / size.y, 1 / size.z)
  return geometry
}
