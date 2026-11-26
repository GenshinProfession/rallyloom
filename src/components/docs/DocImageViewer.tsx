import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export interface DocImageSource {
  src: string
  alt: string
  rect: DOMRect
  element: HTMLImageElement | null
}

/** 文档内图片的「双击放大」状态：记录被双击的图片，方便关闭时做回到原位的动画。 */
export function useImageLightbox() {
  const [source, setSource] = useState<DocImageSource | null>(null)
  const open = useCallback((event: React.MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null
    if (!(target instanceof HTMLImageElement)) return
    const src = target.currentSrc || target.src
    if (!src) return
    event.preventDefault()
    event.stopPropagation()
    setSource({ src, alt: target.alt || '图片', rect: target.getBoundingClientRect(), element: target })
  }, [])
  const close = useCallback(() => setSource(null), [])
  return { source, open, close }
}

interface Rect { left: number; top: number; width: number; height: number }

function targetRect(source: DocImageSource): Rect {
  const padX = Math.max(40, Math.min(150, window.innerWidth * 0.07))
  const padY = Math.max(52, Math.min(150, window.innerHeight * 0.09))
  const availW = Math.max(180, window.innerWidth - padX * 2)
  const availH = Math.max(180, window.innerHeight - padY * 2)
  const ratio = source.rect.width / Math.max(1, source.rect.height)
  let width = availW
  let height = width / ratio
  if (height > availH) {
    height = availH
    width = height * ratio
  }
  return { left: (window.innerWidth - width) / 2, top: (window.innerHeight - height) / 2, width, height }
}

const EASE = 'cubic-bezier(0.22, 0.75, 0.24, 1)'

/** 全屏看图：从图片原位置放大展开，点击空白处再缩回原位置。 */
export function DocImageViewer({ source, onClose }: { source: DocImageSource; onClose: () => void }) {
  const [phase, setPhase] = useState<'enter' | 'open' | 'leave'>('enter')
  const [frame, setFrame] = useState<Rect>(() => targetRect(source))
  const closedRef = useRef(false)

  const finish = useCallback(() => {
    if (closedRef.current) return
    closedRef.current = true
    onClose()
  }, [onClose])

  useLayoutEffect(() => {
    setFrame(targetRect(source))
    const raf = requestAnimationFrame(() => setPhase('open'))
    return () => cancelAnimationFrame(raf)
  }, [source])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setPhase((current) => (current === 'leave' ? current : 'leave'))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (phase !== 'leave') return
    const timer = window.setTimeout(finish, 300)
    return () => window.clearTimeout(timer)
  }, [phase, finish])

  const live = source.element && source.element.isConnected ? source.element.getBoundingClientRect() : source.rect
  const from: Rect = { left: live.left, top: live.top, width: live.width, height: live.height }
  const scaleX = from.width / Math.max(1, frame.width)
  const scaleY = from.height / Math.max(1, frame.height)
  const transform = phase === 'open'
    ? 'none'
    : `translate(${from.left - frame.left}px, ${from.top - frame.top}px) scale(${scaleX}, ${scaleY})`
  const radius = phase === 'open' ? 10 : 4

  return createPortal(
    <div className="doc-viewer" data-doc-viewer="true" role="dialog" aria-modal="true" aria-label={source.alt}>
      <div
        className={`doc-viewer-backdrop${phase === 'open' ? ' is-open' : ''}`}
        data-doc-viewer-backdrop="true"
        onClick={() => setPhase((current) => (current === 'leave' ? current : 'leave'))}
      />
      <div
        className="doc-viewer-frame"
        style={{
          left: frame.left,
          top: frame.top,
          width: frame.width,
          height: frame.height,
          transform,
          borderRadius: radius,
          transition: phase === 'enter' ? 'none' : `transform 280ms ${EASE}, border-radius 240ms ${EASE}`,
        }}>
        <img src={source.src} alt={source.alt || '图片'} className="doc-viewer-image" draggable={false} />
      </div>
      <button
        type="button"
        className="doc-viewer-close"
        data-doc-viewer-close="true"
        aria-label="关闭图片"
        title="关闭（Esc）"
        onClick={() => setPhase((current) => (current === 'leave' ? current : 'leave'))}>
        <X className="size-4" strokeWidth={1.8} />
      </button>
      <p className="doc-viewer-hint">点击空白处返回文档</p>
    </div>,
    document.body,
  )
}
