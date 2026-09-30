import React, { useEffect, useRef } from "react";
import { Mic, MicOff, Play, Square, MonitorUp, Loader2 } from "lucide-react";

const STATUS = {
  idle: "Kikapcsolva",
  connecting: "Kapcsolódás…",
  reconnecting: "Újrakapcsolódás…",
  listening: "Figyel",
  processing: "Fordít…",
  speaking: "Beszél",
  muted: "Némítva",
  error: "Hiba",
  unshared: "Nincs megosztva",
};

// Five tiny bars driven straight from a ref (no React re-render per frame).
function MiniMeter({ levelRef, color }) {
  const bars = useRef([]);
  useEffect(() => {
    let raf;
    const loop = () => {
      const l = levelRef.current || 0;
      bars.current.forEach((b, i) => {
        if (!b) return;
        const on = l > (i + 0.5) / 6;
        b.style.opacity = on ? "1" : "0.25";
        b.style.transform = `scaleY(${on ? 1 : 0.45})`;
      });
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [levelRef]);
  return (
    <div className="flex h-4 items-center gap-[3px]" aria-hidden>
      {[0.45, 0.7, 1, 0.7, 0.45].map((h, i) => (
        <span
          key={i}
          ref={(el) => (bars.current[i] = el)}
          className="w-[3px] rounded-full transition-[transform,opacity] duration-75"
          style={{ height: `${h * 16}px`, background: color, opacity: 0.25 }}
        />
      ))}
    </div>
  );
}

function Chip({ side, name, dir, status, levelRef, latency, action, testId }) {
  const color = side === "A" ? "#60A5FA" : "#34D399";
  const dim = status === "idle" || status === "unshared";
  const alert = status === "error" || status === "muted" || status === "reconnecting";
  return (
    <div
      data-testid={testId}
      className={`flex min-w-0 flex-1 items-center gap-3 ${side === "B" ? "flex-row-reverse text-right" : ""}`}
    >
      <MiniMeter levelRef={levelRef} color={color} />
      <div className="min-w-0">
        <div className={`flex items-center gap-1.5 text-sm font-medium text-ink ${side === "B" ? "justify-end" : ""}`}>
          {name}
          <span className="text-[11px] font-normal text-faint">{dir}</span>
        </div>
        <div
          data-testid={`${testId}-status`}
          data-status={status}
          className={`tabular truncate text-xs ${alert ? "text-warn" : dim ? "text-faint" : "text-muted"}`}
        >
          {STATUS[status] || status}
          {latency != null && !dim && <span className="text-faint"> · késés ~{latency.toFixed(1).replace(".", ",")} mp</span>}
        </div>
      </div>
      {action}
    </div>
  );
}

export default function Dock({
  active,
  starting,
  onStart,
  onStop,
  pairA,
  pairB,
  statusA,
  statusB,
  levelA,
  levelB,
  latencyA,
  latencyB,
  micMuted,
  onToggleMute,
  tabReady,
  onShareTab,
}) {
  return (
    <div className="sticky bottom-0 z-20 border-t border-line/70 bg-bg/90 shadow-dock backdrop-blur-md">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4 sm:gap-6 sm:px-6">
        <Chip
          side="A"
          testId="channel-a"
          name="Partner"
          dir={pairA}
          status={active && !tabReady ? "unshared" : statusA}
          levelRef={levelA}
          latency={latencyA}
          action={
            active && !tabReady ? (
              <button
                data-testid="capture-meet-tab-btn"
                onClick={onShareTab}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-partner/40 px-3 py-1.5 text-xs text-partner transition-colors hover:bg-partner/10"
              >
                <MonitorUp size={14} /> Meet lap
              </button>
            ) : null
          }
        />

        {!active ? (
          <button
            data-testid="start-translation-session-btn"
            onClick={onStart}
            disabled={starting}
            className="inline-flex h-12 shrink-0 items-center gap-2 rounded-full bg-ink px-6 text-sm font-semibold text-bg transition-colors hover:bg-white disabled:opacity-60"
          >
            {starting ? <Loader2 size={17} className="animate-spin" /> : <Play size={17} fill="currentColor" />}
            {starting ? "Indítás…" : "Indítás"}
          </button>
        ) : (
          <button
            data-testid="stop-translation-session-btn"
            onClick={onStop}
            title="Leállítás"
            className="inline-flex h-12 shrink-0 items-center gap-2 rounded-full bg-danger/15 px-5 text-sm font-semibold text-danger transition-colors hover:bg-danger/25"
          >
            <Square size={15} fill="currentColor" />
            Leállítás
          </button>
        )}

        <Chip
          side="B"
          testId="channel-b"
          name="Te"
          dir={pairB}
          status={statusB}
          levelRef={levelB}
          latency={latencyB}
          action={
            active ? (
              <button
                data-testid="mute-mic-btn"
                onClick={onToggleMute}
                title={micMuted ? "Mikrofon bekapcsolása (M)" : "Mikrofon némítása (M)"}
                className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
                  micMuted ? "bg-danger/15 text-danger hover:bg-danger/25" : "bg-raised text-ink hover:bg-line"
                }`}
              >
                {micMuted ? <MicOff size={17} /> : <Mic size={17} />}
              </button>
            ) : null
          }
        />
      </div>
    </div>
  );
}
