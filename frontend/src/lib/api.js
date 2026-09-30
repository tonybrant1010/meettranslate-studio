// Talks to the local backend (backend/server.py).
// In production the UI is served by the backend itself, so same origin.
// During `npm start` development set REACT_APP_BACKEND_URL=http://localhost:8000.

const BASE = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");

function wsBase() {
  if (BASE) return BASE.replace(/^http/, "ws");
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}`;
}

export async function getHealth() {
  const r = await fetch(`${BASE}/api/health`);
  if (!r.ok) throw new Error(`health ${r.status}`);
  return r.json();
}

export async function checkGemini() {
  const r = await fetch(`${BASE}/api/check`);
  return r.json();
}

// One translation direction over a WebSocket to the backend, which relays
// to Gemini Live Translate. Reconnects on its own if the backend link drops.
export class TranslatorChannel {
  constructor({ label, target, echo, onStatus, onInput, onOutput, onTurn, onAudio, onError }) {
    this.label = label;
    this.target = target;
    this.echo = echo;
    this.onStatus = onStatus || (() => {});
    this.onInput = onInput || (() => {});
    this.onOutput = onOutput || (() => {});
    this.onTurn = onTurn || (() => {});
    this.onAudio = onAudio || (() => {});
    this.onError = onError || (() => {});
    this.closed = false;
    this.retries = 0;
    this.fatal = false;
  }

  connect() {
    const url = `${wsBase()}/ws/translate?target=${encodeURIComponent(this.target)}&echo=${
      this.echo ? 1 : 0
    }&label=${encodeURIComponent(this.label)}`;
    this.onStatus("connecting");
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    this.ws = ws;

    ws.onmessage = (ev) => {
      if (typeof ev.data !== "string") {
        this.onAudio(ev.data);
        return;
      }
      let m;
      try {
        m = JSON.parse(ev.data);
      } catch (e) {
        return;
      }
      switch (m.type) {
        case "status":
          if (m.state === "ready") this.retries = 0;
          this.onStatus(m.state);
          break;
        case "input":
          this.onInput(m.text);
          break;
        case "output":
          this.onOutput(m.text);
          break;
        case "turn_complete":
          this.onTurn();
          break;
        case "error":
          if (m.fatal) this.fatal = true;
          this.onError(m.message, !!m.fatal);
          break;
        default:
          break;
      }
    };

    ws.onclose = () => {
      if (this.closed || this.fatal) {
        this.onStatus(this.fatal ? "error" : "idle");
        return;
      }
      if (this.retries >= 6) {
        this.onStatus("error");
        this.onError("A helyi szerver nem érhető el. Fut még a start.bat ablaka?", true);
        return;
      }
      this.retries += 1;
      this.onStatus("reconnecting");
      setTimeout(() => !this.closed && this.connect(), Math.min(500 * 2 ** this.retries, 8000));
    };
  }

  send(pcm) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(pcm);
  }

  close() {
    this.closed = true;
    try {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "stop" }));
      }
      this.ws && this.ws.close();
    } catch (e) {
      /* noop */
    }
  }
}
