import { clamp } from '../lib/math'
import { DRIVE_DURATION, sampleDrive } from './driveScript'
import type { DriveState, LimitChannel } from './types'

/**
 * ── DESIGN: escalation is graded, and it starts early ────────────────────────
 *
 * The brief's sharpest complaint is that today the driver learns about a
 * problem from an audible alert that fires *after* openpilot has already run
 * out of torque and started deviating — by which point the alert is both late
 * and, because it is binary and loud, more irritating than informative.
 *
 * So the escalation ladder here has four rungs instead of two, and the first
 * three are silent and visual:
 *
 *   0  nominal    nothing is drawn beyond the resting bar
 *   1  narrowing  the bar grows and warms; ambient, no attention demanded
 *   2  reserve    the planner *predicts* it will exceed the limit within its
 *                 horizon. The bar shows a projection tick past the ceiling and
 *                 the relevant edge pulses. This is the advance warning today's
 *                 UI has no way to give.
 *   3  saturated  authority is gone and lateral error is growing. This is the
 *                 only rung at which today's openpilot says anything.
 *
 * By the time rung 3 arrives the driver has already had several seconds of
 * escalating peripheral signal, so the loud alert is no longer the first news —
 * it is a confirmation. That is what makes it possible to make it quieter.
 */
export type AlertLevel = 0 | 1 | 2 | 3

export interface ChannelStatus {
  channel: LimitChannel
  /** Fraction of authority currently commanded, clamped to 0..1 for drawing. */
  util: number
  /** Fraction the planner expects to command ~2s out. May exceed 1. */
  predicted: number
  /** 1 - util. What the driver actually cares about: how much is left. */
  headroom: number
  level: AlertLevel
}

const LEVEL_1_UTIL = 0.62
const LEVEL_1_PREDICTED = 0.8
const LEVEL_2_PREDICTED = 1.0
const LEVEL_2_UTIL = 0.88
const LEVEL_3_UTIL = 0.985

export function channelStatus(
  channel: LimitChannel,
  util: number,
  predicted: number,
  engaged: boolean,
): ChannelStatus {
  // Disengaged means openpilot is commanding nothing, so every channel reads
  // empty. Leaving the last commanded value on screen would imply the system is
  // still acting on the car, which is exactly the wrong thing to imply during a
  // takeover.
  if (!engaged) {
    return { channel, util: 0, predicted: 0, headroom: 1, level: 0 }
  }

  let level: AlertLevel = 0
  if (engaged) {
    if (util >= LEVEL_3_UTIL) level = 3
    else if (predicted >= LEVEL_2_PREDICTED || util >= LEVEL_2_UTIL) level = 2
    else if (predicted >= LEVEL_1_PREDICTED || util >= LEVEL_1_UTIL) level = 1
  }
  return {
    channel,
    util: clamp(util, 0, 1),
    predicted: Math.max(0, predicted),
    headroom: clamp(1 - util),
    level,
  }
}

export function channelStatuses(s: DriveState): ChannelStatus[] {
  return [
    channelStatus('steer', s.steerUtil, s.steerUtilPredicted, s.engaged),
    channelStatus('brake', s.brakeUtil, s.brakeUtilPredicted, s.engaged),
    channelStatus('accel', s.accelUtil, s.accelUtilPredicted, s.engaged),
  ]
}

/** Highest rung across all three channels — drives the system-level prompt. */
export const systemLevel = (statuses: ChannelStatus[]): AlertLevel =>
  statuses.reduce<AlertLevel>((m, s) => (s.level > m ? s.level : m), 0)

export interface AlertTimings {
  /** First moment the UI escalates to rung 2 on the steering channel. */
  advanceWarningAt: number
  /** First moment torque saturates — where today's audible alert fires. */
  legacyAlertAt: number
  /** How much earlier the driver is told. Derived, not asserted. */
  leadSeconds: number
}

/**
 * Walk the scripted drive and *measure* the lead time rather than claiming it.
 * If someone edits the keyframes, the number on screen moves with them.
 */
export function deriveAlertTimings(): AlertTimings {
  const step = 1 / 30
  let advanceWarningAt = -1
  let legacyAlertAt = -1
  for (let t = 0; t <= DRIVE_DURATION; t += step) {
    const s = sampleDrive(t)
    const steer = channelStatus('steer', s.steerUtil, s.steerUtilPredicted, s.engaged)
    if (advanceWarningAt < 0 && steer.level >= 2) advanceWarningAt = t
    if (legacyAlertAt < 0 && steer.level >= 3) {
      legacyAlertAt = t
      break
    }
  }
  return {
    advanceWarningAt,
    legacyAlertAt,
    leadSeconds: legacyAlertAt > 0 && advanceWarningAt > 0 ? legacyAlertAt - advanceWarningAt : 0,
  }
}

export const CHANNEL_LABEL: Record<LimitChannel, string> = {
  steer: 'STEER',
  brake: 'BRAKE',
  accel: 'ACCEL',
}
