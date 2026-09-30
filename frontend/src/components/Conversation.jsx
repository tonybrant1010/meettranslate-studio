import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Copy, Check, Volume2, ArrowDown } from "lucide-react";

function Bubble({ item, who, live, onReplay, canReplay }) {
  const [copied, setCopied] = useState(false);
  const mine = who === "B";
  const copy = () => {
    navigator.clipboard?.writeText(item.translated).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <motion.div
      data-testid="transcript-card-item"
      data-who={who}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`group flex ${mine ? "justify-end" : "justify-start"}`}
    >
      <div className={`max-w-[85%] ${mine ? "items-end text-right" : ""} flex flex-col`}>
        <div className={`mb-1.5 flex items-center gap-2 px-1 text-[11px] text-faint ${mine ? "flex-row-reverse" : ""}`}>
          <span className={`font-medium ${mine ? "text-me" : "text-partner"}`}>
            {mine ? "Te" : "Partner"}
          </span>
          <span className="tabular">{item.time}</span>
          {live && <span className={`h-1.5 w-1.5 animate-pulse-dot rounded-full ${mine ? "bg-me" : "bg-partner"}`} />}
          <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            {canReplay && (
              <button
                data-testid="play-translated-speech-btn"
                onClick={() => onReplay(item)}
                className="rounded-md p-1 hover:bg-raised hover:text-ink"
                title="Újrajátszás"
              >
                <Volume2 size={13} />
              </button>
            )}
            <button
              data-testid="copy-transcript-btn"
              onClick={copy}
              className="rounded-md p-1 hover:bg-raised hover:text-ink"
              title="Fordítás másolása"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </span>
        </div>
        <div
          className={`rounded-2xl border px-4 py-3 text-left ${
            mine
              ? "rounded-tr-md border-me/20 bg-me/[0.07]"
              : "rounded-tl-md border-line bg-surface"
          }`}
        >
          <p data-testid="transcript-translated-text" className="text-[16px] leading-relaxed text-ink">
            {item.translated || <span className="text-faint">…</span>}
          </p>
          {item.original && (
            <p data-testid="transcript-original-text" className="mt-1.5 text-[13px] leading-snug text-muted">
              {item.original}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function Conversation({ items, liveIds, onReplay, hasAudio, onClear }) {
  const ref = useRef(null);
  const [atBottom, setAtBottom] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (el && atBottom) el.scrollTop = el.scrollHeight;
  }, [items, atBottom]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 60);
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={ref} onScroll={onScroll} className="scroll-slim min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6">
          {items.length === 0 ? (
            <div className="flex flex-col items-center py-24 text-center">
              <div className="relative mb-5 flex h-12 w-12 items-center justify-center">
                <span className="absolute inset-0 animate-ping rounded-full bg-partner/20" />
                <span className="h-3 w-3 rounded-full bg-partner" />
              </div>
              <p className="text-sm text-ink">Figyelek…</p>
              <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted">
                Amint valaki megszólal, itt jelenik meg a fordítás – szóról szóra, élőben.
              </p>
            </div>
          ) : (
            <>
              <div className="flex justify-center">
                <button
                  onClick={onClear}
                  data-testid="clear-conversation-btn"
                  className="rounded-full px-3 py-1 text-[11px] text-faint transition-colors hover:bg-raised hover:text-muted"
                >
                  Beszélgetés törlése
                </button>
              </div>
              <AnimatePresence initial={false}>
                {items.map((it) => (
                  <Bubble
                    key={it.id}
                    item={it}
                    who={it.who}
                    live={liveIds.includes(it.id)}
                    onReplay={onReplay}
                    canReplay={hasAudio(it.id)}
                  />
                ))}
              </AnimatePresence>
            </>
          )}
        </div>
      </div>
      {!atBottom && (
        <button
          onClick={() => {
            setAtBottom(true);
            ref.current.scrollTop = ref.current.scrollHeight;
          }}
          className="absolute bottom-4 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-raised px-3 py-1.5 text-xs text-ink shadow-lg"
        >
          <ArrowDown size={13} /> Legújabb
        </button>
      )}
    </div>
  );
}
