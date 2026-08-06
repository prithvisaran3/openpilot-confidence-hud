import { useCallback, useEffect, useRef, useState } from 'react'
import { DRIVE_DURATION, sampleDrive } from './driveScript'
import type { DriveState } from './types'

export interface DriveSimulator {
  t: number
  state: DriveState
  playing: boolean
  play: () => void
  pause: () => void
  toggle: () => void
  restart: () => void
  seek: (t: number) => void
  /** Scrubbing suspends playback for the duration of the drag, then restores it. */
  beginScrub: () => void
  endScrub: () => void
  duration: number
}

/**
 * The clock, and nothing else.
 *
 * Deliberately the only stateful thing in the app: a time value advanced by
 * requestAnimationFrame. Every pixel downstream is `sampleDrive(t)` -> render.
 * Keeping the state machine this thin is what makes scrubbing trustworthy —
 * there is no accumulated animation state that could disagree with the clock.
 */
export function useDriveSimulator(): DriveSimulator {
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(true)
  const wasPlayingRef = useRef(true)
  const scrubbingRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const lastRef = useRef<number | null>(null)

  useEffect(() => {
    if (!playing) {
      lastRef.current = null
      return
    }
    const tick = (now: number) => {
      const last = lastRef.current
      lastRef.current = now
      if (last !== null) {
        const dt = Math.min((now - last) / 1000, 0.1) // clamp tab-switch jumps
        setT((prev) => {
          const next = prev + dt
          // Loop the drive rather than stopping: a reviewer who walks away and
          // comes back should still find something moving on screen.
          return next >= DRIVE_DURATION ? 0 : next
        })
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      lastRef.current = null
    }
  }, [playing])

  const play = useCallback(() => setPlaying(true), [])
  const pause = useCallback(() => setPlaying(false), [])
  const toggle = useCallback(() => setPlaying((p) => !p), [])
  const restart = useCallback(() => {
    setT(0)
    setPlaying(true)
  }, [])
  const seek = useCallback((next: number) => {
    setT(Math.max(0, Math.min(DRIVE_DURATION, next)))
  }, [])

  const beginScrub = useCallback(() => {
    if (scrubbingRef.current) return
    scrubbingRef.current = true
    setPlaying((p) => {
      wasPlayingRef.current = p
      return false
    })
  }, [])

  const endScrub = useCallback(() => {
    if (!scrubbingRef.current) return
    scrubbingRef.current = false
    if (wasPlayingRef.current) setPlaying(true)
  }, [])

  return {
    t,
    state: sampleDrive(t),
    playing,
    play,
    pause,
    toggle,
    restart,
    seek,
    beginScrub,
    endScrub,
    duration: DRIVE_DURATION,
  }
}
