import { useEffect } from 'react'
import ConfidenceRing from './components/ConfidenceRing'
import LimitBars from './components/LimitBars'
import RoadView from './components/RoadView'
import StatusHeader from './components/StatusHeader'
import TakeoverPrompt from './components/TakeoverPrompt'
import Timeline from './components/Timeline'
import { useFitScale } from './lib/useFitScale'
import { useDriveSimulator } from './sim/useDriveSimulator'

const DESIGN_W = 1280
const DESIGN_H = 720

/**
 * ── The composition ──────────────────────────────────────────────────────────
 *
 * Three attention tiers, assigned deliberately:
 *
 *   CENTRE     confidence ring — the decision the driver has to make
 *   MID-FIELD  road + planned path — the same information, ambiently
 *   EDGES      actuation headroom — noticed, never read
 *
 * The rule the whole layout obeys: information that is *usually boring* must
 * never occupy the centre, or the driver trains themselves to ignore that
 * region and it fails at the exact moment it matters.
 */
export default function App() {
  const sim = useDriveSimulator()
  const { ref, scale } = useFitScale(DESIGN_W, DESIGN_H)

  // Keyboard transport, so a reviewer can step through the interesting moments.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault()
        sim.toggle()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        sim.seek(sim.t - (e.shiftKey ? 5 : 1))
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        sim.seek(sim.t + (e.shiftKey ? 5 : 1))
      } else if (e.key.toLowerCase() === 'r') {
        sim.restart()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sim])

  return (
    <div className="flex h-full w-full flex-col items-center" style={{ padding: '18px 22px 16px' }}>
      <div ref={ref} className="flex min-h-0 w-full flex-1 items-center justify-center">
        {/* Fixed-geometry device viewport: 16:9, scaled, never reflowed. */}
        <div
          className="relative"
          style={{ width: DESIGN_W * scale, height: DESIGN_H * scale, border: '1px solid #1a212a' }}
        >
          <div
            className="absolute left-0 top-0 origin-top-left overflow-hidden"
            style={{
              width: DESIGN_W,
              height: DESIGN_H,
              transform: `scale(${scale})`,
              background: '#07090b',
            }}
          >
            <RoadView state={sim.state} />
            <ConfidenceRing state={sim.state} />
            <LimitBars state={sim.state} />
            <StatusHeader state={sim.state} />
            <TakeoverPrompt state={sim.state} />
          </div>
        </div>
      </div>

      <div style={{ width: DESIGN_W * scale, marginTop: 16, flex: 'none' }}>
        <Timeline sim={sim} />
      </div>
    </div>
  )
}
