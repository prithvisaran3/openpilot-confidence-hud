# openpilot — Confidence & Limit HUD

An interactive prototype for [comma.ai's design challenge](https://comma.ai/jobs): convey
openpilot's driving confidence and its distance from the car's actuation limits, while engaged,
without being intrusive.

It is a running prototype rather than a mockup. The whole HUD is a pure function of a simulated
telemetry stream, so you can scrub a 60-second scripted drive and study any frame of it.

**[Live demo →](#)** · Press `space` to play/pause, `←`/`→` to step, `R` to restart.

---

## The problem, restated

Three things in the brief are really one thing:

1. Confidence is a **continuous** quantity, so it cannot be shown as safe/unsafe.
2. Actuation headroom is useful but must stay **non-intrusive**.
3. Today's audible alert fires only **after** torque saturates and the car is already deviating,
   which makes it simultaneously too late to act on and annoying enough to train people to ignore.

(3) is the interesting one. The alert is annoying *because* it is late and binary: it arrives with
no build-up, carrying one bit of information at maximum intensity, at the moment the problem has
already happened. You cannot fix that by redesigning the alert. You fix it by making the alert
redundant — by spending the seconds before it on quiet, graded, peripheral signal.

Every decision below follows from that.

## What's on screen

```
┌──────────────────────────────────────────────────────────────┐
│ ENGAGED · 62 MPH              phase · lateral deviation      │
│  ║                    ╭─────────────╮                     ║  │
│  ║  steer               CONFIDENCE                   steer ║  │
│  ║  (left)             ╰─── ring ───╯                (right)║ │
│  ║                   [ escalation band ]                  ║  │
│  ║ ─────────────────── horizon ──────────────────────────  ║ │
│  ║              planned path + uncertainty cone           ║  │
│  ║        BRAKE ══════════╪══════════ ACCEL               ║  │
└──────────────────────────────────────────────────────────────┘
```

**Confidence ring** (centre). A continuous arc, 0–100%, with a colour ramp computed as a function
of confidence — there are no confidence *states* anywhere in the codebase, so a hard cut is
literally unrepresentable. The arc does not end in a crisp edge: it ends in a translucent band as
wide as openpilot's uncertainty *about its own confidence*. "Self-aware about how likely it is to
make a mistake" is a claim about a distribution, so the UI draws the spread, not just the mean.

**Planned path** (mid-field). The same information again, ambiently, where the driver's eyes
already are. The path fans into a cone whose far-end width is driven by confidence and lane
quality: crisp point at the vanishing point when openpilot knows exactly where it's going, wide dim
wedge when it doesn't. When lateral error grows, the path visibly washes to the outside of the turn
while a dashed marker holds the intended line.

**Limit bars** (edges). Three channels — steering torque, brake, accelerator — pinned to the
physical edges of the display. Steering is lateral, so it sits on the left and right edges and
fills on the side it is pulling toward. Brake and accelerator are longitudinal, so they share the
bottom edge and grow outward from a common origin. Each bar carries a **projection tick** at what
the planner expects to command ~2s out. When that tick crosses the ceiling, the driver is being
told openpilot is about to run out — while there is still time to act.

**Escalation band** (nested in the ring's gap). Four rungs, three of them silent: nominal →
narrowing → reserve → saturated. Today's openpilot speaks only at the last one. Here, by the time
it arrives, the driver has had ~4.6 seconds of escalating peripheral signal — the timeline under
the device measures that lead time directly from the drive script rather than asserting it.

## Design rules the code follows

- **No component may branch on a confidence bucket.** Colour comes from `confidenceColor(c)`;
  arc length comes from `c`. The word in the middle of the ring is a caption derived from the same
  value, and deleting it would not change how the UI works.
- **Headroom uses a different ramp than confidence, and never passes through green.** 65% brake
  utilisation is unremarkable and must look unremarkable, or the edges are lit up on every drive
  and the driver stops seeing them. The bars rest at a muted blue-grey and only spend colour in the
  last ~45% of headroom. Green would be a claim about safety that a distance-to-mechanical-ceiling
  readout is not in a position to make.
- **Usually-boring information never occupies the centre.** Otherwise the driver trains themselves
  to filter that region, and it fails exactly when it matters.
- **Redundant encodings.** Confidence is arc length *and* colour *and* path spread. Headroom is bar
  length *and* colour *and* projection position. The ramps move lightness and chroma monotonically
  with risk, so they survive red-green colour blindness and polarised sunglasses.
- **Nothing Qt can't cheaply render.** Solid fills, flat strokes, opacity. No blur, no box-shadow,
  no backdrop-filter, no 3D transforms, no gradients-as-decoration. One shared opacity keyframe for
  the whole app, disabled under `prefers-reduced-motion`.
- **Fixed geometry.** Authored once at a 1280×720 canvas and uniformly scaled to fit, the way you
  would lay it out in Qt for a fixed-geometry device. It never reflows like a web page.

## Architecture

```
src/
  sim/
    types.ts            DriveState — one frame of simulated telemetry
    driveScript.ts      keyframe table + pure sampleDrive(t)
    alerts.ts           channel status, 4-rung escalation, derived lead time
    useDriveSimulator.ts  the clock, and nothing else
  components/
    ConfidenceRing.tsx  centre: analog arc + uncertainty band
    RoadView.tsx        mid-field: path + uncertainty cone + deviation
    LimitBars.tsx       edges: three channels + projection ticks
    TakeoverPrompt.tsx  the last rung of the escalation ladder
    StatusHeader.tsx    speed, engagement, phase
    Timeline.tsx        simulator chrome (explicitly not part of the car UI)
  lib/
    color.ts            the two colour ramps
    math.ts, useFitScale.ts
```

The only stateful thing in the app is a single `t` advanced by `requestAnimationFrame`. Everything
else is `sampleDrive(t) → render`. That is what makes scrubbing trustworthy: parking the playhead
at t=44.2s produces exactly the frame playback would have produced, because there is no accumulated
animation state that could disagree with the clock.

The design reasoning is written into the source at each decision point rather than only here — the
header comments in `color.ts`, `LimitBars.tsx`, `ConfidenceRing.tsx` and `TakeoverPrompt.tsx` are
the argument, not documentation of the argument.

## The scripted drive

60 seconds: highway cruise → lead-vehicle cut-in (longitudinal only, so the brake bar spikes while
the steering bars stay flat) → sweeping curve → recovery → construction zone with decaying lane
quality → steering torque runs out → takeover → re-engage.

## Running it

```bash
npm install
npm run dev
```

## Trade-offs and what I'd do next

- **The road is drawn, not filmed.** On device this composites over the camera feed; the path and
  cone are the parts that matter and they carry over directly.
- **Confidence and its spread are stand-ins** for the model's predicted-error / disengage-probability
  head. The UI assumes those exist as continuous signals; the shape of the visual doesn't depend on
  how they're produced.
- **The projection horizon is fixed at ~2s.** It should probably scale with speed — headroom two
  seconds out matters more at 70mph than at 25.
- **Untested in daylight glare.** The palette is tuned for a dark cabin. A real version needs a
  measured high-ambient variant, not just a brightness slider.
- **The word ladder in the ring is the weakest element.** It's there because language helps a driver
  build a mental model early on, but it is the one thing that quantises a continuous value, and I'd
  want to know whether people stop reading the arc once they can read the word.
