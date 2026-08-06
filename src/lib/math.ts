/** Small numeric helpers shared by the simulator and the renderers. */

export const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v)

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Cubic smoothstep. Used everywhere instead of linear ramps: real vehicle
 *  signals ease rather than step, and eased motion is far less distracting in
 *  peripheral vision than a linear slide. */
export const smoothstep = (t: number) => {
  const x = clamp(t)
  return x * x * (3 - 2 * x)
}

/** Map v from [inLo, inHi] onto [outLo, outHi], clamped. */
export const remap = (v: number, inLo: number, inHi: number, outLo: number, outHi: number) =>
  lerp(outLo, outHi, clamp((v - inLo) / (inHi - inLo)))

export const fmtTime = (s: number) => {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}
