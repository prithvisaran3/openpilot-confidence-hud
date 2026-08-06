/** The three actuation channels the car imposes hard limits on. */
export type LimitChannel = 'steer' | 'brake' | 'accel'

/**
 * One frame of simulated openpilot telemetry.
 *
 * Every field here maps onto something the real stack already publishes, which
 * is the point: this prototype is a rendering of existing signals, not a
 * proposal for new ones the car would have to learn how to measure.
 */
export interface DriveState {
  /** Seconds into the drive. */
  t: number

  /** Is openpilot actuating? False during the takeover window. */
  engaged: boolean

  /**
   * Model confidence, 0..1. Continuous by construction — nothing downstream
   * ever thresholds it into a state name for actuation purposes.
   * Stands in for the model's own predicted-error / disengage-probability head.
   */
  confidence: number

  /**
   * How uncertain openpilot is *about its own confidence*, 0..1.
   * The brief's phrasing — "self-aware about how likely it is to make a
   * mistake" — is a claim about a distribution, not a point estimate, so the UI
   * draws the spread as well as the mean.
   */
  confidenceSpread: number

  /** Fraction of the car's available authority currently commanded, 0..1+. */
  steerUtil: number
  brakeUtil: number
  accelUtil: number

  /**
   * What the planner expects to command ~2s from now, same units.
   * This is the single most important signal in the whole prototype: it is what
   * lets the UI warn *before* saturation instead of alerting after it.
   */
  steerUtilPredicted: number
  brakeUtilPredicted: number
  accelUtilPredicted: number

  /** Sign of the lateral command: -1 full left, +1 full right. */
  steerDir: number

  /** Road curvature used by the path renderer, -1..1. */
  curvature: number

  /** Lane-line / vision quality, 0..1. Drives how far the path fans out. */
  laneQuality: number

  /** Lateral error from the desired trajectory, metres. */
  lateralError: number

  speedMph: number

  /** Human-readable phase of the drive, shown as small secondary text. */
  phase: string
}

export interface Keyframe extends Partial<Omit<DriveState, 't'>> {
  t: number
}

export type MarkerKind = 'advance-warning' | 'legacy-alert' | 'takeover' | 'note'

export interface DriveMarker {
  t: number
  kind: MarkerKind
  label: string
}

export interface DriveSegment {
  t: number
  label: string
}
