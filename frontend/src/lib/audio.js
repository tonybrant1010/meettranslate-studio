// Audio plumbing for Gemini Live Translate.
//  - PcmCapture: MediaStream -> 16 kHz / 16-bit mono PCM chunks (50 ms)
//  - PcmPlayer:  24 kHz / 16-bit PCM chunks -> gap-free playback on a chosen output device
//  - Monitor:    plays the captured Meet tab locally at an adjustable, auto-ducked volume

const IN_RATE = 16000;
const OUT_RATE = 24000;
const CHUNK = 800; // 50 ms @ 16 kHz (smaller chunks = less waiting before the model hears you)

// AudioWorklet: resamples whatever the context rate is to 16 kHz (box-filter
// decimation, fine for speech), converts to Int16 and posts 100 ms chunks.
const WORKLET_SRC = `
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.step = sampleRate / ${IN_RATE};
    this.out = new Int16Array(${CHUNK});
    this.n = 0;
    this.acc = 0; this.accN = 0; this.pos = 0;
    this.sq = 0; this.sqN = 0;
    this.muted = false;
    this.port.onmessage = (e) => { if (e.data && 'muted' in e.data) this.muted = e.data.muted; };
  }
  push(v) {
    if (this.muted) v = 0;
    const s = Math.max(-1, Math.min(1, v));
    this.out[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
    this.sq += s * s; this.sqN++;
    if (this.n === ${CHUNK}) {
      const level = Math.sqrt(this.sq / this.sqN);
      this.port.postMessage({ pcm: this.out.buffer, level }, [this.out.buffer]);
      this.out = new Int16Array(${CHUNK});
      this.n = 0; this.sq = 0; this.sqN = 0;
    }
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    if (this.step === 1) { for (let i = 0; i < ch.length; i++) this.push(ch[i]); return true; }
    for (let i = 0; i < ch.length; i++) {
      this.acc += ch[i]; this.accN++; this.pos += 1;
      if (this.pos >= this.step) { this.push(this.acc / this.accN); this.acc = 0; this.accN = 0; this.pos -= this.step; }
    }
    return true;
  }
}
registerProcessor('pcm-capture', PcmCapture);
`;

let workletUrl = null;
function getWorkletUrl() {
  if (!workletUrl) {
    workletUrl = URL.createObjectURL(
      new Blob([WORKLET_SRC], { type: "application/javascript" })
    );
  }
  return workletUrl;
}

export class PcmCapture {
  constructor(stream, { onChunk, onLevel } = {}) {
    this.stream = stream;
    this.onChunk = onChunk || (() => {});
    this.onLevel = onLevel || (() => {});
    this.muted = false;
  }

  async start() {
    // Chrome resamples the stream into a 16 kHz context natively (best quality).
    try {
      this.ctx = new AudioContext({ sampleRate: IN_RATE, latencyHint: "interactive" });
    } catch (e) {
      this.ctx = new AudioContext({ latencyHint: "interactive" });
    }
    await this.ctx.audioWorklet.addModule(getWorkletUrl());
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, "pcm-capture");
    this.node.port.onmessage = (e) => {
      const { pcm, level } = e.data;
      this.onLevel(this.muted ? 0 : Math.min(1, level * 5));
      this.onChunk(pcm);
    };
    this.source.connect(this.node);
    // Keep the graph pulling without making any sound.
    const sink = this.ctx.createGain();
    sink.gain.value = 0;
    this.node.connect(sink).connect(this.ctx.destination);
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    this.node?.port.postMessage({ muted: m });
  }

  stop() {
    try {
      this.source?.disconnect();
      this.node?.disconnect();
    } catch (e) {
      /* noop */
    }
    if (this.ctx && this.ctx.state !== "closed") this.ctx.close().catch(() => {});
    this.onLevel(0);
  }
}

export function int16ToFloat32(buf) {
  const i16 = new Int16Array(buf);
  const f = new Float32Array(i16.length);
  for (let i = 0; i < i16.length; i++) f[i] = i16[i] / 0x8000;
  return f;
}

// Catch-up tuning: when the translation falls behind, long pauses are
// shortened first (sounds natural), then playback is sped up very slightly.
const CATCHUP_START_S = 0.8; // backlog above which pauses get trimmed
const CATCHUP_FAST_S = 2.0; // backlog above which playback speeds up
const FAST_RATE = 1.08; // ~1 semitone, barely noticeable
const MAX_PAUSE_S = 0.12; // pauses are cut down to this length
const FRAME = 240; // 10 ms @ 24 kHz
const SILENCE_RMS = 0.012;

export class PcmPlayer {
  constructor({ volume = 1, sinkId = "", catchUp = true } = {}) {
    this.ctx = new AudioContext({ sampleRate: OUT_RATE, latencyHint: "interactive" });
    this.gain = this.ctx.createGain();
    this.gain.gain.value = volume;
    this.gain.connect(this.ctx.destination);
    this.next = 0;
    this.sinkId = "";
    this.catchUp = catchUp;
    this.silentRun = 0; // samples of continuous silence already kept
    if (sinkId) this.setSink(sinkId);
  }

  async setSink(id) {
    this.sinkId = id || "";
    if (typeof this.ctx.setSinkId === "function") {
      try {
        await this.ctx.setSinkId(this.sinkId);
        return true;
      } catch (e) {
        console.warn("setSinkId failed", e);
      }
    }
    return false;
  }

  setVolume(v) {
    this.gain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  backlog() {
    return Math.max(0, this.next - this.ctx.currentTime);
  }

  // Removes the part of long pauses beyond MAX_PAUSE_S (state carries across chunks).
  _trimPauses(f32) {
    const keepMax = MAX_PAUSE_S * OUT_RATE;
    const out = new Float32Array(f32.length);
    let n = 0;
    for (let i = 0; i < f32.length; i += FRAME) {
      const end = Math.min(i + FRAME, f32.length);
      let sq = 0;
      for (let j = i; j < end; j++) sq += f32[j] * f32[j];
      const silent = Math.sqrt(sq / (end - i)) < SILENCE_RMS;
      if (silent) {
        if (this.silentRun >= keepMax) continue; // drop this frame
        this.silentRun += end - i;
      } else {
        this.silentRun = 0;
      }
      out.set(f32.subarray(i, end), n);
      n += end - i;
    }
    return out.subarray(0, n);
  }

  // Schedules audio; returns the delay (s) until it starts playing.
  playFloat(f32, rate = OUT_RATE) {
    if (!f32.length || this.ctx.state === "closed") return 0;
    if (this.ctx.state === "suspended") this.ctx.resume();
    const behind = this.backlog();
    let speed = 1;
    if (this.catchUp && behind > CATCHUP_START_S) {
      f32 = this._trimPauses(f32);
      if (behind > CATCHUP_FAST_S) speed = FAST_RATE;
      if (!f32.length) return behind;
    } else {
      this.silentRun = 0;
    }
    const buf = this.ctx.createBuffer(1, f32.length, rate);
    buf.copyToChannel(f32, 0);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = speed;
    src.connect(this.gain);
    const now = this.ctx.currentTime;
    const at = Math.max(now + 0.02, this.next);
    src.start(at);
    this.next = at + buf.duration / speed;
    return at - now;
  }

  play(int16Buffer) {
    return this.playFloat(int16ToFloat32(int16Buffer));
  }

  isPlaying() {
    return this.ctx.state !== "closed" && this.ctx.currentTime < this.next;
  }

  stop() {
    if (this.ctx.state !== "closed") this.ctx.close().catch(() => {});
  }
}

// Plays the captured Meet tab to your headphones at an adjustable volume and
// ducks it while the translation is speaking.
export class TabMonitor {
  constructor(stream, { volume = 0.35 } = {}) {
    this.ctx = new AudioContext({ latencyHint: "interactive" });
    this.src = this.ctx.createMediaStreamSource(stream);
    this.gain = this.ctx.createGain();
    this.gain.gain.value = volume;
    this.src.connect(this.gain).connect(this.ctx.destination);
    this.volume = volume;
    this.ducked = false;
  }
  setVolume(v) {
    this.volume = v;
    this._apply();
  }
  setDucked(d) {
    if (d === this.ducked) return;
    this.ducked = d;
    this._apply();
  }
  _apply() {
    const target = this.ducked ? this.volume * 0.25 : this.volume;
    this.gain.gain.setTargetAtTime(target, this.ctx.currentTime, this.ducked ? 0.05 : 0.3);
  }
  stop() {
    try {
      this.src.disconnect();
    } catch (e) {
      /* noop */
    }
    if (this.ctx.state !== "closed") this.ctx.close().catch(() => {});
  }
}

// A short three-tone chime, used to test the VB-CABLE route into Meet.
export function chime() {
  const rate = OUT_RATE;
  const tones = [660, 880, 1100];
  const len = Math.floor(rate * 0.22);
  const out = new Float32Array(len * tones.length + rate * 0.1);
  tones.forEach((f, k) => {
    for (let i = 0; i < len; i++) {
      const env = Math.min(1, i / 400) * Math.min(1, (len - i) / 1600);
      out[k * len + i] = 0.35 * env * Math.sin((2 * Math.PI * f * i) / rate);
    }
  });
  return out;
}

export async function listOutputDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "audiooutput");
  } catch (e) {
    return [];
  }
}

export async function captureMic() {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
}

// Shares the Google Meet tab's audio. With suppressLocal=true Chrome stops
// playing the tab itself, and TabMonitor plays it instead (so it can be ducked).
export async function captureTabAudio({ suppressLocal = true } = {}) {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: "browser" },
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      suppressLocalAudioPlayback: suppressLocal,
    },
    preferCurrentTab: false,
    selfBrowserSurface: "exclude",
    surfaceSwitching: "include",
    systemAudio: "exclude",
  });
  const audioTracks = stream.getAudioTracks();
  stream.getVideoTracks().forEach((t) => t.stop());
  if (audioTracks.length === 0) {
    throw new Error("NO_TAB_AUDIO");
  }
  return new MediaStream(audioTracks);
}
