import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import type { RoomFrame } from './rooms/api'

export type OfficeResizeTarget = {
  id: string
  label: string
  frame: RoomFrame
  fit: (width: number, height: number) => { width: number; height: number }
  commit: (width: number, height: number) => void
}
type ScreenBounds = { left: number; top: number; width: number; height: number }
type Size = { width: number; height: number }

export function OfficeResizeHandle({ target, screen }: { target: OfficeResizeTarget; screen: ScreenBounds }) {
  const guide = useRef<HTMLDivElement>(null)
  const grip = useRef<HTMLButtonElement>(null)
  const caption = useRef<HTMLSpanElement>(null)
  const stopGesture = useRef<(() => void) | null>(null)
  const { frame } = target
  const scaleX = screen.width / frame.width, scaleY = screen.height / frame.height

  function draw(size: Size) {
    const dx = (size.width - frame.width) * scaleX, dy = (size.height - frame.height) * scaleY
    if (grip.current) grip.current.style.translate = dx + 'px ' + dy + 'px'
    if (guide.current) {
      guide.current.style.width = size.width * scaleX + 'px'
      guide.current.style.height = size.height * scaleY + 'px'
    }
    if (caption.current) caption.current.textContent = size.width + ' × ' + size.height
  }

  useEffect(() => () => stopGesture.current?.(), [])

  function begin(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || stopGesture.current || scaleX <= 0 || scaleY <= 0) return
    const { pointerId, clientX, clientY, currentTarget } = event
    event.preventDefault()

    function measure(pointer: PointerEvent) {
      return target.fit(
        Math.round(frame.width + (pointer.clientX - clientX) / scaleX),
        Math.round(frame.height + (pointer.clientY - clientY) / scaleY),
      )
    }
    function move(pointer: PointerEvent) {
      if (pointer.pointerId === pointerId) draw(measure(pointer))
    }
    function finish(pointer: PointerEvent) {
      if (pointer.pointerId !== pointerId) return
      const size = measure(pointer)
      stop()
      if (size.width !== frame.width || size.height !== frame.height) target.commit(size.width, size.height)
    }
    function cancel(pointer: PointerEvent) {
      if (pointer.pointerId === pointerId) stop()
    }
    function stop() {
      stopGesture.current = null
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', finish, true)
      window.removeEventListener('pointercancel', cancel, true)
      window.removeEventListener('blur', stop)
      if (currentTarget.hasPointerCapture(pointerId)) currentTarget.releasePointerCapture(pointerId)
      guide.current?.removeAttribute('data-resizing')
      guide.current?.style.removeProperty('width')
      guide.current?.style.removeProperty('height')
      grip.current?.style.removeProperty('translate')
    }

    stopGesture.current = stop
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', finish, true)
    window.addEventListener('pointercancel', cancel, true)
    window.addEventListener('blur', stop)
    currentTarget.setPointerCapture(pointerId)
    guide.current?.setAttribute('data-resizing', '')
    draw(frame)
  }

  return <div className="office-resize-boundary" data-canvas={target.id === 'canvas'} style={screen}>
    <div ref={guide} className="office-resize-outline" aria-hidden="true">
      <i className="office-corner office-corner-nw"/><i className="office-corner office-corner-ne"/><i className="office-corner office-corner-sw"/><span ref={caption} />
    </div>
    <button ref={grip} type="button" className="office-resize-grip" aria-label={target.label} title={target.label}
      onPointerDown={begin}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 20 : 5
        const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key]
        if (!delta) return
        event.preventDefault()
        const next = target.fit(frame.width + delta[0], frame.height + delta[1])
        target.commit(next.width, next.height)
      }}><span className="office-resize-dot" /></button>
  </div>
}
