import { confidenceColor, withAlpha } from '../lib/color'
import { clamp, lerp } from '../lib/math'
import type { DriveState } from '../sim/types'

const HORIZON = 336
const BASE_Y = 676 // path base; the road *surface* keeps going to BASE_Y+58 and is clipped by the frame
const CENTER = 640

/** Tapered ribbon between a wide base and a narrow far end, bowed by curvature. */
function ribbon(
  baseX: number,
  baseHalf: number,
  topX: number,
  topHalf: number,
  bow: number,
  topY: number,
) {
  const midY = lerp(BASE_Y, topY, 0.45)
  const cL = lerp(baseX - baseHalf, topX - topHalf, 0.5) + bow
  const cR = lerp(baseX + baseHalf, topX + topHalf, 0.5) + bow
  return [
    `M ${(baseX - baseHalf).toFixed(1)} ${BASE_Y}`,
    `Q ${cL.toFixed(1)} ${midY.toFixed(1)} ${(topX - topHalf).toFixed(1)} ${topY.toFixed(1)}`,
    `L ${(topX + topHalf).toFixed(1)} ${topY.toFixed(1)}`,
    `Q ${cR.toFixed(1)} ${midY.toFixed(1)} ${(baseX + baseHalf).toFixed(1)} ${BASE_Y}`,
    'Z',
  ].join(' ')
}

/** A single open lane edge. Open, not closed, so nothing is stroked across the
 *  bottom of the scene — the road should run off the bottom of the display the
 *  way it runs off the bottom of a windshield. */
function edgeCurve(baseX: number, topX: number, bow: number, topY: number) {
  const midY = lerp(BASE_Y, topY, 0.45)
  const c = lerp(baseX, topX, 0.5) + bow
  return `M ${baseX.toFixed(1)} ${BASE_Y + 58} Q ${c.toFixed(1)} ${midY.toFixed(1)} ${topX.toFixed(1)} ${topY.toFixed(1)}`
}

interface Props {
  state: DriveState
}

/**
 * ── DESIGN: the path is the ambient confidence channel ───────────────────────
 *
 * The ring is what you look at. The path is what you see without looking — it
 * sits where the driver's eyes already are, on the road ahead, so it can carry
 * the same information a second time for free.
 *
 * The encoding is the one openpilot's own visualisation already implies: the
 * planned path fans out into a cone as confidence falls. At high confidence it
 * converges to a crisp point at the vanishing point — "I know exactly where I'm
 * going". At low confidence the far end spreads into a wide, dim wedge — "it's
 * somewhere in here". That is a literal picture of predictive uncertainty, and
 * it requires no legend to understand.
 *
 * Lateral deviation is drawn as the path physically sliding off the lane centre
 * while a thin marker holds the intended line. When openpilot runs out of
 * torque the driver sees the gap open up *as it opens*, rather than being told
 * about it afterwards by a chime.
 *
 * Everything here is flat fills and 1-3px strokes — a scene Qt can repaint at
 * 60fps without a compositor.
 */
export default function RoadView({ state }: Props) {
  const c = clamp(state.confidence)
  const color = state.engaged ? confidenceColor(c) : '#59636f'

  // Vanishing point slides with curvature; the whole scene bows toward it.
  const vpX = CENTER + state.curvature * state.steerDir * 78
  const bow = state.curvature * state.steerDir * 42

  // Lateral error pushes the *rendered* path away from the lane centre — and it
  // pushes it to the OUTSIDE of the turn. Running out of steering torque in a
  // right-hand curve means the car fails to turn in far enough and washes wide
  // to the left; drawing the drift toward the turn would be backwards.
  const drift = -state.lateralError * 150 * Math.sign(state.steerDir || 1)

  // Far-end half-width of the uncertainty cone. Driven by confidence and, to a
  // lesser degree, by how good the lane lines are — degraded vision widens the
  // cone even when the model still feels reasonably confident.
  const uncertainHalf = lerp(6, 92, clamp(1 - c) * lerp(0.75, 1, clamp(1 - state.laneQuality)))
  const coreHalf = Math.max(3, uncertainHalf * 0.22)

  const roadPoly = [
    `M 208 ${BASE_Y + 58}`,
    `Q ${lerp(208, vpX - 30, 0.5) + bow} ${lerp(BASE_Y, HORIZON, 0.45)} ${vpX - 30} ${HORIZON}`,
    `L ${vpX + 30} ${HORIZON}`,
    `Q ${lerp(1072, vpX + 30, 0.5) + bow} ${lerp(BASE_Y, HORIZON, 0.45)} 1072 ${BASE_Y + 58}`,
    'Z',
  ].join(' ')

  return (
    <svg viewBox="0 0 1280 720" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
      <line x1={110} y1={HORIZON} x2={1170} y2={HORIZON} stroke="#12181f" strokeWidth={1.5} />

      <path d={roadPoly} fill="#0b0f14" />
      {/* Lane edges dim out as lane quality falls: the UI stops drawing what it
          can no longer see, instead of drawing a confident line over a guess. */}
      <g stroke="#212a35" strokeWidth={2.5} fill="none" strokeOpacity={lerp(0.25, 1, clamp(state.laneQuality))}>
        <path d={edgeCurve(240, vpX - 26, bow, HORIZON + 2)} />
        <path d={edgeCurve(1040, vpX + 26, bow, HORIZON + 2)} />
      </g>

      {state.engaged ? (
        <>
          {/* Uncertainty cone — the ambient read. */}
          <path
            d={ribbon(640 + drift, 114, vpX + drift * 0.45, uncertainHalf, bow, HORIZON + 16)}
            fill={withAlpha(color, 0.085)}
            stroke={withAlpha(color, 0.32)}
            strokeWidth={1.5}
          />
          {/* Committed path — where openpilot intends to be right now. */}
          <path
            d={ribbon(640 + drift, 52, vpX + drift * 0.45, coreHalf, bow, HORIZON + 26)}
            fill={withAlpha(color, 0.46)}
          />
        </>
      ) : (
        <path
          d={ribbon(640, 62, vpX, 10, bow, HORIZON + 26)}
          fill="none"
          stroke="#2c343d"
          strokeWidth={2}
          strokeDasharray="10 12"
        />
      )}

      {/* Intended lane centre. Only drawn once there is a gap worth seeing. */}
      {state.engaged && state.lateralError > 0.06 && (
        <>
          <line x1={640} y1={BASE_Y + 42} x2={vpX} y2={HORIZON + 40} stroke="#48525d" strokeWidth={1.5} strokeDasharray="6 8" />
          <line
            x1={640}
            y1={BASE_Y + 30}
            x2={640 + drift}
            y2={BASE_Y + 30}
            stroke={color}
            strokeWidth={2.5}
          />
        </>
      )}
    </svg>
  )
}
