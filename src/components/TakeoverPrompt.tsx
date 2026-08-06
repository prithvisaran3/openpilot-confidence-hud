import { channelStatuses, systemLevel } from '../sim/alerts'
import type { DriveState } from '../sim/types'

/**
 * ── DESIGN: making the loud alert unnecessary ────────────────────────────────
 *
 * The brief says the audible alert is "frequently more annoying than useful".
 * It is annoying because it is binary and late: it arrives with no build-up, at
 * the moment the car is already deviating, carrying one bit of information at
 * maximum intensity.
 *
 * The fix is not to make the alert prettier — it is to make it redundant. By
 * the time this prompt appears, the driver has already had several seconds of
 * escalating peripheral signal: the steering bar climbing, its projection tick
 * crossing the ceiling, the confidence arc shortening and warming, the path
 * cone fanning out. This band is the last rung of that ladder, not the first
 * news, so it can be a quiet line of text instead of a chime.
 *
 * Note what it does *not* do: no full-screen colour wash, no modal overlay, no
 * motion across the road view. It is a single flat band with a hard left edge
 * in the channel's own colour. On a windshield at night, a full-screen flash is
 * genuinely dangerous.
 */
export default function TakeoverPrompt({ state }: { state: DriveState }) {
  const level = systemLevel(channelStatuses(state))

  if (!state.engaged) {
    return (
      <Band accent="#5b6672" title="DRIVER IN CONTROL" sub="openpilot disengaged — re-engage when clear" />
    )
  }
  if (level >= 3) {
    return (
      <Band
        accent="#ff4d3d"
        title="TAKE STEERING"
        sub="torque limit reached — openpilot is deviating"
        pulse
      />
    )
  }
  if (level === 2) {
    return <Band accent="#ff8a2b" title="HANDS ON" sub="steering reserve running out ahead" />
  }
  return null
}

function Band({
  accent,
  title,
  sub,
  pulse,
}: {
  accent: string
  title: string
  sub: string
  pulse?: boolean
}) {
  return (
    <div
      className="pointer-events-none absolute"
      // Nested into the gap at the bottom of the confidence ring, above the
      // horizon. It lands where the eye is already going when it checks the
      // ring, and — unlike a band placed over the road — it never occludes the
      // planned path at the moment the path is the thing worth watching.
      style={{ left: 0, right: 0, top: 288, display: 'flex', justifyContent: 'center' }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          background: '#0a0e13',
          borderLeft: `4px solid ${accent}`,
          padding: '9px 22px 9px 18px',
        }}
      >
        <div
          className={pulse ? 'hud-pulse' : undefined}
          style={{ width: 10, height: 10, background: accent, flex: 'none' }}
        />
        <div style={{ fontSize: 19, fontWeight: 650, letterSpacing: 3, color: accent }}>{title}</div>
        <div style={{ fontSize: 12, letterSpacing: 0.6, color: '#7d8894' }}>{sub}</div>
      </div>
    </div>
  )
}
