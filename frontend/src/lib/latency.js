// Rough "how far behind is the translation" meter.
// Speech onset is detected from the local input level; the delay is measured
// until the first translated audio for it actually starts playing.

const VOICE_LEVEL = 0.08; // scaled level (see PcmCapture.onLevel)
const QUIET_BEFORE_MS = 800; // silence needed before a new onset counts
const KEEP = 7;

export class LatencyTracker {
  constructor() {
    this.reset();
  }

  reset() {
    this.onset = null;
    this.lastVoice = 0;
    this.samples = [];
  }

  // Called for every captured chunk.
  level(l, outputBusy) {
    const now = performance.now();
    if (l < VOICE_LEVEL) return;
    if (this.onset === null && !outputBusy && now - this.lastVoice > QUIET_BEFORE_MS) {
      this.onset = now;
    }
    this.lastVoice = now;
  }

  // Called when translated audio is scheduled; startsIn = seconds until it plays.
  audio(startsIn) {
    if (this.onset === null) return;
    const v = (performance.now() - this.onset) / 1000 + (startsIn || 0);
    this.onset = null;
    if (v > 0.2 && v < 15) {
      this.samples.push(v);
      if (this.samples.length > KEEP) this.samples.shift();
    }
  }

  // Median of the recent measurements, or null.
  value() {
    if (!this.samples.length) return null;
    const s = [...this.samples].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }
}
