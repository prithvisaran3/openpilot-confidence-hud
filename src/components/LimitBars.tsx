import { headroomColor, withAlpha } from '../lib/color'
import { clamp, remap, smoothstep } from '../lib/math'
import { channelStatus } from '../sim/alerts'
import type { AlertLevel, ChannelStatus } from '../sim/alerts'
import type { DriveState } from '../sim/types'

/**
 * ── DESIGN: why these live on the edges, and why they show the future ────────
 *
 * Two decisions, both load-bearing.
 *
 * 1. PERIPHERAL, NOT CENTRAL. Actuation headroom is continuous background
 *    information — it is true every second of every drive, and 95% of the time
 *    it is boring. Anything that is usually boring must not be placed where the
 *    eye is drawn, or the driver learns to filter it out and it stops working
 *    exactly when it matters. So these bars are pinned to the physical edges of
 *    the display, outside the foveal region the ring and the road occupy. Human
 *    peripheral vision is poor at shape and colour but excellent at *length
 *    change* and *onset of motion*, which is precisely what a bar growing
 *    toward a ceiling is. The driver never reads these bars; they notice them.
 *
 * 2. SPATIALLY CONGRUENT. The bars sit where the axis they describe lives.
 *    Steering is lateral, so it is on the left and right edges — and it fills on
 *    the side it is pulling toward, so "running out of torque turning right"
 *    literally lights up the right edge of the display. Brake and accelerator
 *    are longitudinal, so they share the bottom edge, growing outward from
 *    centre in opposite directions from a single origin. No legend required.
 *
 * 3. THE PROJECTION TICK IS THE POINT. Each bar carries a second, lighter mark
 *    at what the planner expects to command roughly two seconds out. When that
 *    mark passes the ceiling, the driver is being told "openpilot is about to
 *    run out" while there is still time to act. Today that information exists
 *    inside the stack and is thrown away; the audible alert only fires once
 *    torque has already saturated and the car is already deviating. Every
 *    second of lead time here is a second of alert that never has to happen.
 */

const CAP = 13 // ceiling block: the hard limit the car imposes
const GAP = 4

function capColor(level: AlertLevel) {
  if (level >= 3) return '#ff4d3d'
  if (level === 2) return '#ff8a2b'
  return '#242c36'
}

/** Small outward chevron drawn past the ceiling when demand exceeds the limit. */
function Overshoot({ rotate }: { rotate: number }) {
  return (
    <svg width={14} height={9} viewBox="0 0 14 9" style={{ transform: `rotate(${rotate}deg)` }} className="hud-pulse">
      <path d="M7 0 L14 9 L0 9 Z" fill="#ff4d3d" />
    </svg>
  )
}

interface VerticalBarProps {
  status: ChannelStatus
  /** 0..1 share of the steering command attributable to this side. */
  weight: number
  side: 'left' | 'right'
  x: number
  top: number
  height: number
}

function VerticalSteerBar({ status, weight, side, x, top, height }: VerticalBarProps) {
  const trackH = height - CAP - GAP
  const util = clamp(status.util * weight)
  const predicted = status.predicted * weight
  const fillH = util * trackH
  const dominant = weight > 0.5
  const level = dominant ? status.level : 0
  const color = headroomColor(status.headroom)
  const predTop = top + CAP + GAP + (1 - clamp(predicted)) * trackH

  return (
    <div className="absolute" style={{ left: x, top, width: 10, height }}>
      {/* Ceiling: the car's hard torque limit. Always visible so the bar has a
          destination — a fill with no visible end has no meaning. */}
      <div
        className={level >= 2 ? 'hud-pulse' : undefined}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 10,
          height: CAP,
          background: capColor(level),
        }}
      />
      {/* Track */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: CAP + GAP,
          width: 10,
          height: trackH,
          background: '#161c24',
        }}
      />
      {/* Fill grows upward, toward the ceiling. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          width: 10,
          height: fillH,
          background: color,
          opacity: 0.25 + 0.75 * weight,
        }}
      />
      {/* Projection: where the planner expects to be in ~2s. */}
      {predicted > 0.05 && (
        <div
          style={{
            position: 'absolute',
            left: side === 'left' ? 12 : -14,
            top: predTop - top - 1,
            width: 10,
            height: 2,
            background: predicted >= 1 ? '#ff4d3d' : withAlpha(color, 0.85),
          }}
        />
      )}
      {predicted >= 1 && (
        <div style={{ position: 'absolute', left: -3, top: -14 }}>
          <Overshoot rotate={0} />
        </div>
      )}
    </div>
  )
}

interface HalfBarProps {
  status: ChannelStatus
  dir: 'left' | 'right'
  originX: number
  y: number
  length: number
}

function LongitudinalHalfBar({ status, dir, originX, y, length }: HalfBarProps) {
  const trackL = length - CAP - GAP
  const fillL = clamp(status.util) * trackL
  const sign = dir === 'left' ? -1 : 1
  const color = headroomColor(status.headroom)
  const predOff = clamp(status.predicted) * trackL

  const capX = dir === 'left' ? originX - length : originX + length - CAP
  const trackX = dir === 'left' ? originX - length + CAP + GAP : originX + GAP
  const fillX = dir === 'left' ? originX - fillL : originX
  const predX = dir === 'left' ? originX - predOff : originX + predOff

  return (
    <>
      <div
        className={status.level >= 2 ? 'hud-pulse' : undefined}
        style={{ position: 'absolute', left: capX, top: y, width: CAP, height: 10, background: capColor(status.level) }}
      />
      <div
        style={{ position: 'absolute', left: trackX, top: y, width: trackL, height: 10, background: '#161c24' }}
      />
      <div style={{ position: 'absolute', left: fillX, top: y, width: fillL, height: 10, background: color }} />
      {status.predicted > 0.05 && (
        <div
          style={{
            position: 'absolute',
            left: predX - 1,
            top: y - 12,
            width: 2,
            height: 10,
            background: status.predicted >= 1 ? '#ff4d3d' : withAlpha(color, 0.85),
          }}
        />
      )}
      {status.predicted >= 1 && (
        <div style={{ position: 'absolute', left: capX + sign * 18, top: y - 2 }}>
          <Overshoot rotate={dir === 'left' ? -90 : 90} />
        </div>
      )}
    </>
  )
}

const LABEL: React.CSSProperties = {
  position: 'absolute',
  fontSize: 10,
  letterSpacing: 2.4,
  fontWeight: 600,
  color: '#4c5663',
}

export default function LimitBars({ state }: { state: DriveState }) {
  const steer = channelStatus('steer', state.steerUtil, state.steerUtilPredicted, state.engaged)
  const brake = channelStatus('brake', state.brakeUtil, state.brakeUtilPredicted, state.engaged)
  const accel = channelStatus('accel', state.accelUtil, state.accelUtilPredicted, state.engaged)

  // Split the single steering command across the two edges by direction. Total
  // ink is conserved, so the pair reads as one analog quantity whose position
  // encodes which way the wheel is being pulled.
  const rightWeight = smoothstep(remap(state.steerDir, -0.35, 0.35, 0, 1))
  const leftWeight = 1 - rightWeight

  const BAR_TOP = 112
  const BAR_H = 540

  return (
    <div className="pointer-events-none absolute inset-0">
      <VerticalSteerBar status={steer} weight={leftWeight} side="left" x={20} top={BAR_TOP} height={BAR_H} />
      <VerticalSteerBar status={steer} weight={rightWeight} side="right" x={1252} top={BAR_TOP} height={BAR_H} />

      <div style={{ ...LABEL, left: 16, top: BAR_TOP + BAR_H + 12, writingMode: 'vertical-rl' }}>STEER</div>
      <div style={{ ...LABEL, left: 1248, top: BAR_TOP + BAR_H + 12, writingMode: 'vertical-rl' }}>STEER</div>

      <LongitudinalHalfBar status={brake} dir="left" originX={640} y={700} length={296} />
      <LongitudinalHalfBar status={accel} dir="right" originX={640} y={700} length={296} />
      {/* Shared origin tick: both longitudinal channels grow from the same zero. */}
      <div style={{ position: 'absolute', left: 639, top: 696, width: 2, height: 18, background: '#2b333d' }} />

      <div style={{ ...LABEL, left: 262, top: 702, width: 72, textAlign: 'right' }}>BRAKE</div>
      <div style={{ ...LABEL, left: 946, top: 702 }}>ACCEL</div>

      {/* Numeric headroom appears only once a channel is actually tight — the
          rest of the time a number here would be noise the driver must ignore. */}
      {steer.level >= 2 && state.engaged && (
        <div
          style={{
            position: 'absolute',
            top: BAR_TOP - 2,
            [rightWeight > 0.5 ? 'right' : 'left']: 44,
            fontSize: 11,
            letterSpacing: 1.6,
            fontWeight: 600,
            color: steer.level >= 3 ? '#ff4d3d' : '#ff8a2b',
          }}
        >
          {Math.round(steer.headroom * 100)}% TORQUE LEFT
        </div>
      )}
    </div>
  )
}
