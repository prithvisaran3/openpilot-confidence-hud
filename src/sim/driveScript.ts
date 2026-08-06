import { smoothstep } from '../lib/math'
import type { DriveSegment, DriveState, Keyframe } from './types'

export const DRIVE_DURATION = 60

/**
 * ── The scripted drive ───────────────────────────────────────────────────────
 *
 * A keyframe table, not a CSS animation. Every visual in this app is a pure
 * function of the interpolated state below, which means scrubbing the timeline
 * to t=44.2s produces exactly the frame that playback would have produced at
 * t=44.2s. That property is why the whole thing is worth building as a running
 * prototype: a reviewer can park the playhead on the interesting moment and
 * study it, instead of watching an animation loop and taking it on faith.
 *
 * Numeric fields are interpolated with a cubic smoothstep between neighbouring
 * keyframes; `engaged` and `phase` are step-held from the last keyframe that
 * declared them. Sharp events (torque saturation, takeover) are expressed as
 * tightly spaced keyframes rather than as a separate easing mechanism.
 *
 * The narrative arc requested by the brief:
 *   0-8s    calm highway, everything nominal
 *   8-14s   lead vehicle cut-in — confidence dips, brake authority spikes
 *   14-24s  sweeping curve — lateral demand rises, confidence sags, recovers
 *   24-30s  recovery, system quiet again
 *   30-40s  construction zone — lane quality decays, confidence slides
 *   40-46s  steering torque runs out, openpilot starts deviating
 *   46-52s  driver takes over; openpilot disengaged
 *   52-60s  re-engage, confidence rebuilds
 */
const KEYFRAMES: Keyframe[] = [
  {
    t: 0,
    engaged: true,
    confidence: 0.94,
    confidenceSpread: 0.05,
    steerUtil: 0.16,
    steerUtilPredicted: 0.19,
    brakeUtil: 0.04,
    brakeUtilPredicted: 0.05,
    accelUtil: 0.14,
    accelUtilPredicted: 0.16,
    steerDir: 0.1,
    curvature: 0.04,
    laneQuality: 0.97,
    lateralError: 0.01,
    speedMph: 64,
    phase: 'Highway cruise',
  },
  {
    t: 4,
    accelUtil: 0.46,
    accelUtilPredicted: 0.5,
    speedMph: 69,
    confidence: 0.95,
    confidenceSpread: 0.04,
  },
  { t: 7.5, accelUtil: 0.12, accelUtilPredicted: 0.14, speedMph: 71, confidence: 0.93 },

  // Lead vehicle cut-in. Longitudinal demand, not lateral: the brake bar is the
  // one that moves, which is the whole reason the three channels are separated.
  {
    t: 9,
    confidence: 0.75,
    confidenceSpread: 0.13,
    brakeUtil: 0.44,
    brakeUtilPredicted: 0.58,
    accelUtil: 0,
    accelUtilPredicted: 0,
    speedMph: 68,
    phase: 'Lead vehicle cut-in',
  },
  {
    t: 11.5,
    confidence: 0.71,
    confidenceSpread: 0.15,
    brakeUtil: 0.61,
    brakeUtilPredicted: 0.5,
    // Held low on purpose: a cut-in is a purely longitudinal event, and the
    // lateral bar staying flat while the brake bar spikes is the clearest
    // demonstration that the three channels are independent readouts.
    steerUtil: 0.18,
    steerUtilPredicted: 0.2,
    steerDir: 0.12,
    curvature: 0.05,
    speedMph: 62,
  },
  { t: 14, confidence: 0.85, confidenceSpread: 0.08, brakeUtil: 0.18, brakeUtilPredicted: 0.14, speedMph: 60 },

  // Sweeping curve: sustained lateral demand, modest confidence sag.
  {
    t: 16,
    curvature: 0.5,
    steerDir: 0.8,
    steerUtil: 0.46,
    steerUtilPredicted: 0.58,
    confidence: 0.72,
    confidenceSpread: 0.14,
    phase: 'Sweeping right-hand curve',
  },
  {
    t: 19.5,
    curvature: 0.82,
    steerDir: 1,
    steerUtil: 0.63,
    steerUtilPredicted: 0.66,
    confidence: 0.62,
    confidenceSpread: 0.17,
    laneQuality: 0.88,
    speedMph: 57,
  },
  { t: 23, curvature: 0.28, steerDir: 0.5, steerUtil: 0.3, steerUtilPredicted: 0.24, confidence: 0.84, confidenceSpread: 0.09 },

  {
    t: 27,
    curvature: 0.02,
    steerDir: 0.05,
    steerUtil: 0.15,
    steerUtilPredicted: 0.16,
    confidence: 0.94,
    confidenceSpread: 0.05,
    laneQuality: 0.96,
    accelUtil: 0.3,
    accelUtilPredicted: 0.28,
    speedMph: 64,
    phase: 'Recovered — highway cruise',
  },

  // Construction zone. Vision degrades first; confidence follows it down. The
  // slide is deliberately slow and legible — this is the window in which a
  // driver should be putting their hands back on, and today gets no signal.
  {
    t: 31,
    laneQuality: 0.76,
    confidence: 0.85,
    confidenceSpread: 0.1,
    accelUtil: 0.06,
    accelUtilPredicted: 0.05,
    brakeUtil: 0.22,
    brakeUtilPredicted: 0.26,
    speedMph: 58,
    phase: 'Construction zone ahead',
  },
  {
    t: 34.5,
    laneQuality: 0.52,
    confidence: 0.63,
    confidenceSpread: 0.21,
    curvature: 0.34,
    steerDir: 0.7,
    steerUtil: 0.47,
    steerUtilPredicted: 0.62,
    brakeUtil: 0.3,
    brakeUtilPredicted: 0.24,
    speedMph: 51,
    phase: 'Shifted lanes — cones',
  },
  {
    t: 38,
    laneQuality: 0.36,
    confidence: 0.5,
    confidenceSpread: 0.27,
    curvature: 0.58,
    steerDir: 0.9,
    steerUtil: 0.7,
    steerUtilPredicted: 0.93,
    brakeUtil: 0.18,
    brakeUtilPredicted: 0.16,
    speedMph: 47,
    phase: 'Tight concrete barrier',
  },

  // The planner now expects to ask for more torque than the car will give.
  // Prediction crosses 1.0 here; actual command has not yet.
  {
    t: 41,
    laneQuality: 0.3,
    confidence: 0.42,
    confidenceSpread: 0.3,
    curvature: 0.72,
    steerDir: 1,
    steerUtil: 0.83,
    steerUtilPredicted: 1.06,
    lateralError: 0.04,
    accelUtil: 0.04,
    accelUtilPredicted: 0.03,
    speedMph: 45,
    phase: 'Approaching steering limit',
  },
  {
    t: 43.6,
    confidence: 0.33,
    confidenceSpread: 0.31,
    curvature: 0.86,
    steerUtil: 0.96,
    steerUtilPredicted: 1.12,
    lateralError: 0.12,
    laneQuality: 0.28,
    speedMph: 44,
  },
  // Torque saturated: openpilot is now deviating. This is the *only* moment at
  // which today's openpilot would have said anything at all. It is held for
  // ~2.5s so a reviewer can actually sit inside it — and because that is
  // roughly how long a real saturation event lasts before someone intervenes.
  {
    t: 44.6,
    confidence: 0.27,
    confidenceSpread: 0.3,
    steerUtil: 1,
    steerUtilPredicted: 1.15,
    lateralError: 0.22,
    phase: 'Steering torque saturated',
  },
  { t: 47, confidence: 0.21, confidenceSpread: 0.29, steerUtil: 1, steerUtilPredicted: 1.16, lateralError: 0.44, accelUtil: 0.03, accelUtilPredicted: 0.02, speedMph: 43 },
  {
    t: 47.6,
    engaged: false,
    confidence: 0.2,
    confidenceSpread: 0.28,
    steerUtil: 0,
    steerUtilPredicted: 0,
    brakeUtil: 0,
    brakeUtilPredicted: 0,
    accelUtil: 0,
    accelUtilPredicted: 0,
    lateralError: 0.46,
    phase: 'Driver in control',
  },
  { t: 50.5, engaged: false, confidence: 0.36, confidenceSpread: 0.22, curvature: 0.4, lateralError: 0.12, laneQuality: 0.44, speedMph: 42 },

  // Re-engage on the far side of the works.
  {
    t: 52.5,
    engaged: true,
    confidence: 0.64,
    confidenceSpread: 0.16,
    curvature: 0.18,
    steerDir: 0.3,
    steerUtil: 0.28,
    steerUtilPredicted: 0.3,
    accelUtil: 0.38,
    accelUtilPredicted: 0.4,
    laneQuality: 0.7,
    lateralError: 0.03,
    speedMph: 46,
    phase: 'Re-engaged',
  },
  {
    t: 56,
    confidence: 0.87,
    confidenceSpread: 0.07,
    curvature: 0.05,
    steerDir: 0.1,
    steerUtil: 0.17,
    steerUtilPredicted: 0.18,
    accelUtil: 0.24,
    accelUtilPredicted: 0.2,
    laneQuality: 0.93,
    lateralError: 0.01,
    speedMph: 58,
    phase: 'Clear — highway cruise',
  },
  {
    t: 60,
    confidence: 0.93,
    confidenceSpread: 0.05,
    accelUtil: 0.14,
    accelUtilPredicted: 0.12,
    laneQuality: 0.96,
    speedMph: 62,
  },
]

/** Chapter labels rendered under the scrub track so a reviewer can aim. */
export const DRIVE_SEGMENTS: DriveSegment[] = [
  { t: 0, label: 'Cruise' },
  { t: 8.5, label: 'Cut-in' },
  { t: 14.5, label: 'Curve' },
  { t: 24.5, label: 'Recover' },
  { t: 30, label: 'Construction' },
  { t: 40, label: 'Limit' },
  { t: 47.6, label: 'Takeover' },
  { t: 52.5, label: 'Re-engage' },
]

const NUMERIC_KEYS = [
  'confidence',
  'confidenceSpread',
  'steerUtil',
  'brakeUtil',
  'accelUtil',
  'steerUtilPredicted',
  'brakeUtilPredicted',
  'accelUtilPredicted',
  'steerDir',
  'curvature',
  'laneQuality',
  'lateralError',
  'speedMph',
] as const

type NumericKey = (typeof NUMERIC_KEYS)[number]

/** Index of keyframes that define each numeric key, so interpolation only ever
 *  bridges keyframes that actually carry the channel. Built once at module load. */
const CHANNEL_INDEX: Record<NumericKey, { t: number; v: number }[]> = Object.fromEntries(
  NUMERIC_KEYS.map((key) => [
    key,
    KEYFRAMES.filter((k) => k[key] !== undefined).map((k) => ({ t: k.t, v: k[key] as number })),
  ]),
) as Record<NumericKey, { t: number; v: number }[]>

function sampleChannel(key: NumericKey, t: number): number {
  const pts = CHANNEL_INDEX[key]
  if (pts.length === 0) return 0
  if (t <= pts[0].t) return pts[0].v
  const last = pts[pts.length - 1]
  if (t >= last.t) return last.v
  let i = 0
  while (i < pts.length - 1 && pts[i + 1].t <= t) i++
  const a = pts[i]
  const b = pts[i + 1]
  return a.v + (b.v - a.v) * smoothstep((t - a.t) / (b.t - a.t))
}

function stepHold<K extends 'engaged' | 'phase'>(key: K, t: number): NonNullable<Keyframe[K]> {
  let value = KEYFRAMES.find((k) => k[key] !== undefined)![key]!
  for (const k of KEYFRAMES) {
    if (k.t > t) break
    if (k[key] !== undefined) value = k[key]!
  }
  return value as NonNullable<Keyframe[K]>
}

/** Pure: time in, one frame of telemetry out. No hidden state, no clock. */
export function sampleDrive(t: number): DriveState {
  const clamped = Math.max(0, Math.min(DRIVE_DURATION, t))
  const numeric = Object.fromEntries(
    NUMERIC_KEYS.map((key) => [key, sampleChannel(key, clamped)]),
  ) as Record<NumericKey, number>

  return {
    t: clamped,
    engaged: stepHold('engaged', clamped),
    phase: stepHold('phase', clamped),
    ...numeric,
  }
}
