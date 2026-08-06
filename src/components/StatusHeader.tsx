import { confidenceColor } from '../lib/color'
import type { DriveState } from '../sim/types'

/**
 * Secondary information only: speed, engagement, and what openpilot thinks it
 * is currently driving through. Deliberately typographic and static — the top
 * corners are where the eye goes *last*, so nothing here is allowed to animate
 * or to be the sole carrier of anything urgent.
 */
export default function StatusHeader({ state }: { state: DriveState }) {
  const color = state.engaged ? confidenceColor(state.confidence) : '#5b6672'
  const deviating = state.engaged && state.lateralError > 0.06

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height: 96 }}>
      <div className="absolute" style={{ left: 48, top: 26 }}>
        <div className="flex items-center" style={{ gap: 9 }}>
          <div style={{ width: 9, height: 9, background: color }} />
          <span style={{ fontSize: 11, letterSpacing: 2.6, fontWeight: 600, color: state.engaged ? '#aab5c2' : '#5b6672' }}>
            {state.engaged ? 'OPENPILOT ENGAGED' : 'OPENPILOT OFF'}
          </span>
        </div>
        <div className="flex items-baseline" style={{ gap: 7, marginTop: 6 }}>
          <span style={{ fontSize: 32, fontWeight: 650, letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums' }}>
            {Math.round(state.speedMph)}
          </span>
          <span style={{ fontSize: 11, letterSpacing: 2.2, color: '#6b7684', fontWeight: 600 }}>MPH</span>
        </div>
      </div>

      <div className="absolute text-right" style={{ right: 48, top: 26 }}>
        <div style={{ fontSize: 13, color: '#8d99a7', fontWeight: 500 }}>{state.phase}</div>
        <div
          style={{
            fontSize: 11,
            letterSpacing: 1.8,
            fontWeight: 600,
            marginTop: 7,
            color: deviating ? '#ff8a2b' : '#3f4854',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {!state.engaged
            ? 'MANUAL STEERING'
            : deviating
              ? `LATERAL DEVIATION ${state.lateralError.toFixed(2)} m`
              : 'ON TRAJECTORY'}
        </div>
      </div>
    </div>
  )
}
