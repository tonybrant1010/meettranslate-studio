import React from "react";
import { CheckCircle2, AlertCircle, Circle, Headphones, KeyRound, Cable, MonitorUp } from "lucide-react";
import { Button } from "./primitives";

const TONE = {
  ok: { Icon: CheckCircle2, cls: "text-me" },
  warn: { Icon: AlertCircle, cls: "text-warn" },
  bad: { Icon: AlertCircle, cls: "text-danger" },
  info: { Icon: Circle, cls: "text-faint" },
};

function Row({ icon: Lead, title, text, tone, action, testId }) {
  const { Icon, cls } = TONE[tone];
  return (
    <li data-testid={testId} data-tone={tone} className="flex items-center gap-4 py-3.5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-raised text-muted">
        <Lead size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-medium text-ink">
          {title}
          <Icon size={15} className={cls} />
        </div>
        <div className="mt-0.5 text-xs leading-relaxed text-muted">{text}</div>
      </div>
      {action}
    </li>
  );
}

export default function ReadyCard({ keyState, cableState, onSettings, onHelp, onCheck, checking }) {
  return (
    <div className="mx-auto w-full max-w-xl pt-6 sm:pt-12">
      <h1 className="text-center text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">
        Beszélj a saját nyelveden.
      </h1>
      <p className="mx-auto mt-3 max-w-md text-center text-sm leading-relaxed text-muted">
        Te magyarul beszélsz, a partnered angolul – és mindketten a saját nyelveteken
        halljátok egymást a Google Meetben, élőben.
      </p>

      <ul className="mt-8 divide-y divide-line rounded-2xl border border-line bg-surface px-5">
        <Row
          testId="ready-key"
          icon={KeyRound}
          title="Gemini kapcsolat"
          tone={keyState.tone}
          text={keyState.text}
          action={
            <Button variant="ghost" onClick={onCheck} disabled={checking} testId="ready-check-btn">
              {checking ? "Ellenőrzés…" : "Teszt"}
            </Button>
          }
        />
        <Row
          testId="ready-cable"
          icon={Cable}
          title="A partner hallja a fordításodat"
          tone={cableState.tone}
          text={cableState.text}
          action={
            cableState.tone === "ok" ? null : (
              <Button variant="ghost" onClick={cableState.missing ? onHelp : onSettings}>
                {cableState.missing ? "Útmutató" : "Beállítás"}
              </Button>
            )
          }
        />
        <Row
          icon={Headphones}
          title="Fejhallgató"
          tone="info"
          text="Használj fejhallgatót, hogy a fordítás ne kerüljön vissza a mikrofonodba."
        />
        <Row
          icon={MonitorUp}
          title="Meet lap megosztása"
          tone="info"
          text="Indítás után válaszd ki a Meet lapot, és kapcsold be a „Lap hangjának megosztása” kapcsolót."
        />
      </ul>
    </div>
  );
}
