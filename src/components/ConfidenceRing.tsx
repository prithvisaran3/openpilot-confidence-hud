import { confidenceColor, withAlpha } from '../lib/color'
import { clamp } from '../lib/math'
import type { DriveState } from '../sim/types'

/** Polar helper. Angles are degrees clockwise from 12 o'clock — gauge convention. */
function pt(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number) {
  const s = pt(cx, cy, r, a0)
  const e = pt(cx, cy, r, a1)
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`
}

const CX = 640
const CY = 196
const R = 112
const W = 15
const A0 = -125
const A1 = 125
const SWEEP = A1 - A0

/**
 * A descriptive word, not a state machine.
 *
 * Six rungs rather than three, and crucially nothing in this app branches on
 * the word — it is derived from the same continuous value the arc draws, purely
 * so the driver has language for what they are seeing. The arc is the truth;
 * the word is a caption. If this ladder were deleted the UI would still work.
 */
function confidenceWord(c: number): string {
  if (c >= 0.86) return 'CONFIDENT'
  if (c >= 0.72) return 'STEADY'
  if (c >= 0.56) return 'ATTENTIVE'
  if (c >= 0.4) return 'UNCERTAIN'
  if (c >= 0.26) return 'LOW'
  return 'CRITICAL'
}

interface Props {
  state: DriveState
}

/**
 * ── DESIGN: why an analog arc, and why it lives in the centre ────────────────
 *
 * Confidence is the one thing on screen that is genuinely about *the driver's
 * job* — whether to keep supervising loosely or put hands back on the wheel. It
 * earns the centre position; everything else is deliberately pushed to the
 * edges so this can be found without a search.
 *
 * Three properties do the work in under a second of eye contact:
 *
 *   1. ARC LENGTH is the primary encoding. Length is pre-attentive and ordinal —
 *      you read "less than before" without reading a value. There are no
 *      segments, no ticks that snap, no discrete states; a 3% drop moves the arc
 *      by 3% of its sweep. A traffic light cannot express "slightly worse".
 *
 *   2. COLOUR is the redundant encoding, from one continuous function
 *      (see lib/color.ts). It shifts a little every frame, so the driver's
 *      peripheral vision picks up the *trend* before the value matters.
 *
 *   3. The SPREAD BAND is the part I think the brief is really asking for.
 *      "openpilot is self-aware about how likely it is to make a mistake" is a
 *      statement about a distribution. So the arc does not end in a hard edge:
 *      it ends in a translucent band as wide as the model's uncertainty about
 *      its own estimate. When openpilot is sure it is doing well, the arc ends
 *      crisply. When it is unsure how sure it is, the end of the arc becomes
 *      visibly fuzzy — which is a thing you can feel at a glance, and which no
 *      single number can say.
 *
 * The 250 degree sweep leaves a gap at the bottom, opening toward the road and
 * the planned path below it, so the ring frames the driving scene instead of
 * boxing it in.
 */
export default function ConfidenceRing({ state }: Props) {
  const engaged = state.engaged
  const c = clamp(state.confidence)
  const color = engaged ? confidenceColor(c) : '#4a545f'

  const headAngle = A0 + SWEEP * c

  // Uncertainty band: +/- half the spread around the point estimate, clipped to
  // the arc. Drawn at the same radius and width as the fill so it reads as a
  // soft edge on the same object rather than a second, competing indicator.
  const spread = clamp(state.confidenceSpread)
  const lo = clamp(c - spread / 2)
  const hi = clamp(c + spread / 2)
  const bandA0 = A0 + SWEEP * lo
  const bandA1 = A0 + SWEEP * hi

  const head = pt(CX, CY, R, headAngle)
  const headOuter = pt(CX, CY, R + W / 2 + 5, headAngle)
  const headInner = pt(CX, CY, R - W / 2 - 5, headAngle)

  // Sparse ticks give the arc a scale to be read against without implying that
  // the underlying quantity is quantised.
  const ticks = Array.from({ length: 11 }, (_, i) => {
    const a = A0 + (SWEEP * i) / 10
    const major = i % 5 === 0
    const p1 = pt(CX, CY, R + W / 2 + 6, a)
    const p2 = pt(CX, CY, R + W / 2 + (major ? 14 : 10), a)
    return { a, major, p1, p2 }
  })

  return (
    <svg
      viewBox="0 0 1280 720"
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      {ticks.map((t) => (
        <line
          key={t.a}
          x1={t.p1.x}
          y1={t.p1.y}
          x2={t.p2.x}
          y2={t.p2.y}
          stroke={t.major ? '#2b333d' : '#1c222a'}
          strokeWidth={t.major ? 2 : 1.5}
        />
      ))}

      {/* Unfilled remainder of the scale. Flat, dark, no gradient. */}
      <path d={arcPath(CX, CY, R, A0, A1)} fill="none" stroke="#151a21" strokeWidth={W} strokeLinecap="butt" />

      {engaged && (
        <>
          <path d={arcPath(CX, CY, R, A0, headAngle)} fill="none" stroke={color} strokeWidth={W} strokeLinecap="butt" />
          {/* The fuzzy end: how unsure openpilot is about its own confidence. */}
          {hi > lo && (
            <path
              d={arcPath(CX, CY, R, bandA0, bandA1)}
              fill="none"
              stroke={withAlpha(color, 0.34)}
              strokeWidth={W}
              strokeLinecap="butt"
            />
          )}
          {/* Point estimate, so the band never makes the reading ambiguous. */}
          <line
            x1={headInner.x}
            y1={headInner.y}
            x2={headOuter.x}
            y2={headOuter.y}
            stroke={color}
            strokeWidth={3}
          />
          <circle cx={head.x} cy={head.y} r={3.5} fill="#0a0d11" stroke={color} strokeWidth={2.5} />
        </>
      )}

      {!engaged && (
        <path d={arcPath(CX, CY, R, A0, A1)} fill="none" stroke="#232a33" strokeWidth={W} strokeDasharray="4 10" />
      )}

      <text
        x={CX}
        y={CY - 40}
        textAnchor="middle"
        fill="#6b7684"
        fontSize={12}
        letterSpacing={4.5}
        fontWeight={500}
      >
        CONFIDENCE
      </text>

      <text x={CX} y={CY + 8} textAnchor="middle" fill={color} fontSize={engaged ? 25 : 22} fontWeight={650} letterSpacing={1.5}>
        {engaged ? confidenceWord(c) : 'DISENGAGED'}
      </text>

      {engaged && (
        <text
          x={CX}
          y={CY + 40}
          textAnchor="middle"
          fill="#6b7684"
          fontSize={15}
          fontWeight={500}
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {Math.round(c * 100)}
          <tspan fill="#3f4854"> ± {Math.round(spread * 50)}</tspan>
        </text>
      )}
    </svg>
  )
}
