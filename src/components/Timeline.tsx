import { useCallback, useMemo, useRef } from 'react'
import { confidenceColor } from '../lib/color'
import { fmtTime } from '../lib/math'
import { deriveAlertTimings } from '../sim/alerts'
import { DRIVE_SEGMENTS, sampleDrive } from '../sim/driveScript'
import type { DriveSimulator } from '../sim/useDriveSimulator'

const SAMPLES = 320
const TRACK_H = 46

/**
 * Simulator chrome — explicitly *not* part of the car UI.
 *
 * It is styled as instrumentation around the device rather than as part of it,
 * because a scrub bar is a reviewer's affordance and putting it inside the HUD
 * would misrepresent the design. Everything above the fold is the product;
 * everything here is the harness used to inspect it.
 *
 * The confidence strip under the scrubber is the entire drive rendered through
 * the same colour function the ring uses, so the shape of the drive — and the
 * fact that the ramp really is continuous — is legible at a glance.
 */
export default function Timeline({ sim }: { sim: DriveSimulator }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const timings = useMemo(() => deriveAlertTimings(), [])

  const strip = useMemo(
    () =>
      Array.from({ length: SAMPLES }, (_, i) => {
        const s = sampleDrive((i / (SAMPLES - 1)) * sim.duration)
        return { c: s.confidence, engaged: s.engaged }
      }),
    [sim.duration],
  )

  const seekFromEvent = useCallback(
    (clientX: number) => {
      const el = trackRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      sim.seek(((clientX - r.left) / r.width) * sim.duration)
    },
    [sim],
  )

  const pct = (t: number) => `${(t / sim.duration) * 100}%`

  return (
    <div className="w-full select-none" style={{ color: '#8d99a7' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
        <div className="flex items-center" style={{ gap: 8 }}>
          <Ctl onClick={sim.toggle} primary label={sim.playing ? 'Pause' : 'Play'}>
            {sim.playing ? <PauseIcon /> : <PlayIcon />}
            <span>{sim.playing ? 'Pause' : 'Play'}</span>
          </Ctl>
          <Ctl onClick={sim.restart} label="Restart drive">
            <RestartIcon />
            <span>Restart drive</span>
          </Ctl>
          <span
            style={{
              fontVariantNumeric: 'tabular-nums',
              fontSize: 12,
              letterSpacing: 1.4,
              color: '#5f6b78',
              marginLeft: 6,
            }}
          >
            {fmtTime(sim.t)} / {fmtTime(sim.duration)}
          </span>
        </div>

        {/* The measured payoff, computed from the script rather than asserted. */}
        <div className="flex items-center" style={{ gap: 18, fontSize: 11.5, letterSpacing: 0.4 }}>
          <Legend color="#ff8a2b" text="HUD warns (projected limit)" />
          <Legend color="#ff4d3d" text="today's audible alert" />
          <span style={{ color: '#e8edf4', fontWeight: 600 }}>
            {timings.leadSeconds.toFixed(1)}s earlier
          </span>
        </div>
      </div>

      {/* Bracket showing the advance-warning window. */}
      <div style={{ position: 'relative', height: 18 }}>
        <div
          style={{
            position: 'absolute',
            left: pct(timings.advanceWarningAt),
            width: `calc(${pct(timings.legacyAlertAt)} - ${pct(timings.advanceWarningAt)})`,
            bottom: 0,
            height: 9,
            borderLeft: '2px solid #ff8a2b',
            borderRight: '2px solid #ff4d3d',
            borderTop: '2px solid #3a3026',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: pct((timings.advanceWarningAt + timings.legacyAlertAt) / 2),
            bottom: 9,
            transform: 'translateX(-50%)',
            fontSize: 10.5,
            letterSpacing: 1.2,
            color: '#b08a5e',
            whiteSpace: 'nowrap',
          }}
        >
          {timings.leadSeconds.toFixed(1)}s OF ADVANCE WARNING
        </div>
      </div>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Drive timeline"
        aria-valuemin={0}
        aria-valuemax={sim.duration}
        aria-valuenow={Number(sim.t.toFixed(1))}
        className="relative cursor-pointer"
        style={{ height: TRACK_H, background: '#0c1015' }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          sim.beginScrub()
          seekFromEvent(e.clientX)
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) seekFromEvent(e.clientX)
        }}
        onPointerUp={(e) => {
          e.currentTarget.releasePointerCapture(e.pointerId)
          sim.endScrub()
        }}
        onPointerCancel={() => sim.endScrub()}
      >
        <svg
          viewBox={`0 0 ${SAMPLES} ${TRACK_H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
        >
          {strip.map((s, i) => {
            const h = 5 + s.c * (TRACK_H - 9)
            return (
              <rect
                key={i}
                x={i}
                y={TRACK_H - h}
                width={1.02}
                height={h}
                fill={s.engaged ? confidenceColor(s.c) : '#39424d'}
                opacity={s.engaged ? 0.9 : 0.75}
              />
            )
          })}
        </svg>

        {DRIVE_SEGMENTS.filter((s) => s.t > 0).map((s) => (
          <div
            key={s.t}
            style={{ position: 'absolute', left: pct(s.t), top: 0, bottom: 0, width: 1, background: '#00000066' }}
          />
        ))}

        <Marker t={timings.advanceWarningAt} color="#ff8a2b" pct={pct} />
        <Marker t={timings.legacyAlertAt} color="#ff4d3d" pct={pct} />

        {/* Playhead */}
        <div
          style={{
            position: 'absolute',
            left: pct(sim.t),
            top: -4,
            bottom: -4,
            width: 2,
            background: '#e8edf4',
            transform: 'translateX(-1px)',
          }}
        />
      </div>

      <div style={{ position: 'relative', height: 18, marginTop: 6 }}>
        {DRIVE_SEGMENTS.map((s) => (
          <button
            key={s.t}
            onClick={() => sim.seek(s.t)}
            style={{
              position: 'absolute',
              left: pct(s.t),
              top: 0,
              padding: '0 6px 0 4px',
              background: 'transparent',
              border: 0,
              cursor: 'pointer',
              fontSize: 10,
              letterSpacing: 1.3,
              fontWeight: 600,
              color: '#4c5663',
              whiteSpace: 'nowrap',
            }}
            title={`Jump to ${s.label}`}
          >
            {s.label.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  )
}

function Marker({ t, color, pct }: { t: number; color: string; pct: (t: number) => string }) {
  return (
    <div style={{ position: 'absolute', left: pct(t), top: 0, bottom: 0, width: 2, background: color }} />
  )
}

function Legend({ color, text }: { color: string; text: string }) {
  return (
    <span className="flex items-center" style={{ gap: 7, color: '#6b7684' }}>
      <span style={{ width: 9, height: 9, background: color, display: 'block' }} />
      {text}
    </span>
  )
}

function Ctl({
  children,
  onClick,
  primary,
  label,
}: {
  children: React.ReactNode
  onClick: () => void
  primary?: boolean
  label: string
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="flex items-center transition-colors"
      style={{
        gap: 8,
        padding: '7px 14px',
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: 0.8,
        border: `1px solid ${primary ? '#2f3a46' : '#1d232c'}`,
        background: primary ? '#161d25' : 'transparent',
        color: primary ? '#e8edf4' : '#8d99a7',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

const PlayIcon = () => (
  <svg width="10" height="11" viewBox="0 0 10 11" fill="currentColor">
    <path d="M0 0l10 5.5L0 11z" />
  </svg>
)
const PauseIcon = () => (
  <svg width="10" height="11" viewBox="0 0 10 11" fill="currentColor">
    <rect x="0" y="0" width="3.5" height="11" />
    <rect x="6.5" y="0" width="3.5" height="11" />
  </svg>
)
const RestartIcon = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor">
    <path d="M0 0h2.2v11H0z" />
    <path d="M11 0L2.9 5.5 11 11z" />
  </svg>
)
