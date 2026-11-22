import { useLayoutEffect, useRef } from 'react'

/** Requires a positioned parent whose controls are direct children. */
export function SelectionHighlight({ selected }: { selected: string }) {
  const ref = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const element = ref.current
    const parent = element?.parentElement
    if (!element || !parent) return
    const highlight = element
    const track = parent

    let current: HTMLElement | null = null
    let geometry = ''
    let movement: Animation | undefined
    const reduce = matchMedia('(prefers-reduced-motion: reduce)')
    const resize = new ResizeObserver(() => align(false))

    function align(animate: boolean) {
      const next = Array.from(track.children).find(
        (child): child is HTMLElement => child instanceof HTMLElement && child.matches(selected),
      )
      const previous = current
      if (!next || !next.offsetWidth) {
        movement?.cancel()
        highlight.hidden = true
        current = null
        return
      }
      const { offsetLeft: x, offsetTop: y, offsetWidth: width, offsetHeight: height } = next
      const bounds = `${x}:${y}:${width}:${height}`
      if (next === previous && geometry === bounds) return

      const shouldMove = animate && previous && previous !== next &&
        !reduce.matches && !next.matches(':focus-visible')
      // Start from the painted position, including an interrupted move.
      const before = shouldMove ? highlight.getBoundingClientRect() : null
      movement?.cancel()
      highlight.hidden = false
      highlight.style.translate = `${x}px ${y}px`
      highlight.style.width = `${width}px`
      highlight.style.height = `${height}px`
      geometry = bounds
      current = next
      if (!before) return
      const after = highlight.getBoundingClientRect()
      movement = highlight.animate([
        { transform: `translate(${before.left - after.left}px, ${before.top - after.top}px) scale(${before.width / after.width}, ${before.height / after.height})` },
        { transform: 'none' },
      ], { duration: 180, easing: getComputedStyle(track).getPropertyValue('--ease-out').trim() })
    }

    function watchSizes() {
      resize.disconnect()
      resize.observe(track)
      for (const child of track.children) {
        if (child !== highlight) resize.observe(child)
      }
    }

    align(false)
    watchSizes()
    const changes = new MutationObserver((records) => {
      if (records.some(({ type, target }) => type === 'childList' && target === track)) watchSizes()
      align(true)
    })
    changes.observe(track, {
      childList: true,
      subtree: true,
      attributeFilter: ['aria-selected', 'aria-current', 'aria-pressed'],
    })
    const onPreferenceChange = () => { if (reduce.matches) movement?.cancel() }
    reduce.addEventListener('change', onPreferenceChange)
    return () => {
      reduce.removeEventListener('change', onPreferenceChange)
      movement?.cancel()
      changes.disconnect()
      resize.disconnect()
    }
  }, [selected])

  return <span ref={ref} className="selection-highlight" aria-hidden="true" hidden />
}
