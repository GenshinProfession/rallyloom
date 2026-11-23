import { useEffect, useState, type PointerEvent } from 'react'
import { Armchair, LayoutGrid, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { FURNITURE } from './rooms/placed-furniture'
import type { FurnitureKind } from './rooms/api'
import { OFFICE_TEMPLATES } from './office-assets'
import { createAssetPreviewRenderer, officePreview, previewKey, type OfficeAsset } from './three/asset-previews'

const roomAssets: OfficeAsset[] = Object.keys(OFFICE_TEMPLATES).map((id) => ({ kind: 'room', id }))
const furnitureAssets: OfficeAsset[] = (Object.keys(FURNITURE) as FurnitureKind[]).map((id) => ({ kind: 'furniture', id }))

export function OfficeAssetLibrary({ disabled, onDrag, onAdd }: {
  disabled: boolean
  onDrag: (event: PointerEvent<HTMLElement>, asset: OfficeAsset) => void
  onAdd: (asset: OfficeAsset) => void
}) {
  const [query,setQuery] = useState('')
  const [category, setCategory] = useState<'room' | 'furniture'>('room')
  const [images, setImages] = useState<Record<string, string>>({})
  const [unavailable, setUnavailable] = useState(false)
  const assets = (category === 'room' ? roomAssets : furnitureAssets).filter(asset => (asset.kind==='room'?OFFICE_TEMPLATES[asset.id as keyof typeof OFFICE_TEMPLATES]:FURNITURE[asset.id].label).includes(query.trim()))

  useEffect(() => {
    const missing = assets.filter((asset) => !officePreview(asset))
    if (!missing.length) return
    let renderer: ReturnType<typeof createAssetPreviewRenderer>
    try { renderer = createAssetPreviewRenderer() }
    catch { setUnavailable(true); return }
    let index = 0
    let timer: ReturnType<typeof setTimeout>
    const renderNext = () => {
      const asset = missing[index++]
      try {
        const image = renderer.render(asset)
        setImages((current) => ({ ...current, [previewKey(asset)]: image }))
      } catch { setUnavailable(true) }
      if (index < missing.length) timer = setTimeout(renderNext, 16)
    }
    timer = setTimeout(renderNext, 16)
    return () => { clearTimeout(timer); renderer.dispose() }
  }, [category, query])

  return <section className="office-asset-library">
    <div className="office-inspector-heading"><h2>素材库</h2><span>{assets.length} 件素材</span></div><div className="office-asset-search"><Search size={14}/><Input aria-label="搜索素材" placeholder="搜索家具、房间模板" value={query} onChange={event=>setQuery(event.target.value)}/></div>
    <div className="office-asset-tabs" role="group" aria-label="素材类别">
      <button type="button" aria-pressed={category === 'room'} onClick={() => setCategory('room')}><LayoutGrid size={14} />房间模板</button>
      <button type="button" aria-pressed={category === 'furniture'} onClick={() => setCategory('furniture')}><Armchair size={14} />家具</button>
    </div>
    <p>拖入场景放置 · 模板内家具可独立编辑</p>
    <div className="office-asset-grid">
      {assets.map((asset) => {
        const image = images[previewKey(asset)] ?? officePreview(asset)
        const label = asset.kind === 'room' ? OFFICE_TEMPLATES[asset.id as keyof typeof OFFICE_TEMPLATES] : FURNITURE[asset.id].label
        return <button key={previewKey(asset)} type="button" className="office-asset-card" disabled={disabled}
          aria-label={label} onPointerDown={(event) => onDrag(event, asset)} onClick={() => onAdd(asset)}>
          <span className="office-asset-model">
            {image ? <img alt="" src={image} draggable={false} /> : category === 'room' ? <LayoutGrid size={27} /> : <Armchair size={27} />}
          </span>
          <span className="office-asset-name">{label}</span>
        </button>
      })}
    </div>
    {unavailable && <p>部分模型预览无法加载，可拖入场景查看。</p>}
  </section>
}
