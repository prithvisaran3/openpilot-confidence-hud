# Email draft — ready to send

**To:** work@comma.ai
**Subject:** Design challenge submission — confidence & limit HUD (live prototype) + Web Software Engineer / comma connect

---

Hi,

I took on the openpilot confidence/limits design challenge, and built it as a working prototype instead of a mockup — a 60-second simulated drive you can scrub frame by frame:

https://openpilot-confidence-hud.vercel.app

Confidence is analog, never bucketed: one continuous arc whose end blurs into a band as wide as the model's uncertainty about its own estimate. The limit bars are peripheral, not central, and each carries a tick at what the planner expects to command ~2s out. That's aimed at the alert problem — when the tick crosses the ceiling the driver gets 4.6s of quiet escalating warning before torque saturates, so the chime stops being the first news and can finally be quiet.

Code, with the design reasoning written into the source: https://github.com/prithvisaran3/openpilot-confidence-hud

I'd like to be considered for Web Software Engineer / comma connect.

Prithvi Saran
prithvisaran.s@gmail.com
