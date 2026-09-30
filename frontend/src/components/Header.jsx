import React from "react";
import { Languages, Settings, CircleHelp } from "lucide-react";
import { IconButton } from "./primitives";

export default function Header({ pair, active, clock, onSettings, onHelp }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-partner to-me">
            <Languages size={19} className="text-bg" strokeWidth={2.4} />
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-semibold tracking-tight text-ink">MeetTranslate</div>
            <button
              onClick={onSettings}
              className="text-xs text-muted transition-colors hover:text-ink"
              title="Nyelvek módosítása"
            >
              {pair}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {active && (
            <span
              data-testid="session-duration"
              className="tabular mr-2 inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs text-muted"
            >
              <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-danger" />
              {clock}
            </span>
          )}
          <IconButton label="Súgó és beállítási útmutató" onClick={onHelp} data-testid="open-help-btn">
            <CircleHelp size={19} />
          </IconButton>
          <IconButton label="Beállítások" onClick={onSettings} data-testid="open-settings-btn">
            <Settings size={19} />
          </IconButton>
        </div>
      </div>
    </header>
  );
}
