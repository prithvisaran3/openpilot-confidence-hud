import { clamp, lerp, remap } from './math'

/**
 * ── DESIGN: the colour ramp is a *function*, not a set of buckets ────────────
 *
 * The brief is explicit that confidence is a continuous spectrum, so the very
 * first thing to get right is that no part of this UI is allowed to know about
 * "green / yellow / red" states. There is one function, confidence -> colour,
 * and every element that needs a colour calls it. That makes a hard cut
 * literally unrepresentable: you cannot draw a threshold you never encoded.
 *
 * Hue sweeps monotonically along a single arc (warm 6deg -> cool 174deg) so the
 * ramp never doubles back through a muddy midpoint. Saturation and lightness
 * ride along with it, which matters more than hue does:
 *
 *   - Low confidence is brighter and more saturated, so it advances toward the
 *     driver in peripheral vision without needing motion or an audible cue.
 *   - High confidence is cooler and quieter, so a well-behaved system visually
 *     recedes and stops competing with the road.
 *
 * Because salience is carried by lightness/chroma and not by hue alone, the
 * ramp still reads correctly for a red-green colourblind driver, and still
 * reads through polarised sunglasses at a glance. Colour is the redundancy
 * here; the primary channels are arc length and bar length.
 *
 * The exponent on the hue term is the one piece of tuning that isn't cosmetic.
 * A linear hue sweep puts 60% confidence somewhere around green, which would be
 * a lie — 60% is a "hands near the wheel" number, and it has to look like one.
 * Squaring the input holds the ramp in warm territory across the entire lower
 * half and spends the cool end only on genuinely nominal driving, so the colour
 * agrees with what the arc length is already saying.
 */
export function confidenceColor(confidence: number): string {
  const c = clamp(confidence)
  const shaped = Math.pow(c, 2.3)
  return hslToHex(lerp(6, 182, shaped), lerp(0.95, 0.58, c), lerp(0.61, 0.5, c))
}

/**
 * Actuation headroom uses a *different* ramp, and the difference matters.
 *
 * Confidence is meaningful across its whole range. Headroom is not: commanding
 * 40% of available brake is completely unremarkable and must look completely
 * unremarkable, or the edges of the display are lit up warm on every drive and
 * the driver stops seeing them. So this ramp stays a muted, receding steel-blue
 * until roughly 45% headroom remains, and only then starts spending colour —
 * through amber, then hard into red over the last 10%.
 *
 * It also mixes between three fixed anchors in RGB rather than sweeping hue,
 * specifically so it never passes through green. A hue sweep would paint 65%
 * torque utilisation a confident green, and this bar is not in a position to
 * make a claim about safety — it only reports distance to a mechanical ceiling.
 * Green would be that claim; muted blue-grey is the honest resting state.
 *
 * Same principle as the alert ladder: the resting state has to be boring for
 * the escalation to be worth anything.
 */
const CALM: RGB = [74, 127, 146]
const WARN: RGB = [245, 161, 26]
const CRIT: RGB = [250, 70, 48]

export function headroomColor(headroom: number): string {
  const h = clamp(headroom)
  const warm = clamp(remap(h, 0.1, 0.45, 1, 0))
  const crit = clamp(remap(h, 0, 0.1, 1, 0))
  return toHex(mix(mix(CALM, WARN, warm), CRIT, crit))
}

type RGB = [number, number, number]

const mix = (a: RGB, b: RGB, t: number): RGB => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
]

const toHex = (c: RGB) =>
  `#${c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('')}`

/** Convert to `rgba()` so flat fills can be laid over the road without blur. */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const v = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))
    return Math.round(255 * v)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}
