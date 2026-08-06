import { useLayoutEffect, useRef, useState } from 'react'

/**
 * The comma 3X is a fixed-geometry device, so this prototype is authored once at
 * a 1280x720 (16:9) design canvas and uniformly scaled to fit whatever window it
 * is opened in. Every coordinate in the HUD components is therefore a real
 * device pixel and can be reasoned about directly — which is how you would
 * actually lay this out in Qt, and it keeps the composition intentional at any
 * window size instead of reflowing like a web page.
 */
export function useFitScale(w: number, h: number, max = 1.55) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.6)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return
      setScale(Math.max(0.2, Math.min(max, Math.min(r.width / w, r.height / h))))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [w, h, max])

  return { ref, scale }
}
