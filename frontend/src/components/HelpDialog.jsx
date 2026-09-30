import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { IconButton } from "./primitives";

const STEPS = [
  {
    title: "Gemini API kulcs",
    body: (
      <>
        Kulcsot itt kapsz: <b>aistudio.google.com/apikey</b>. Írd be a <code>backend\.env</code> fájlba
        (<code>GEMINI_API_KEY=…</code>), majd indítsd a <code>start.bat</code>-ot. Ezt csak egyszer kell.
      </>
    ),
  },
  {
    title: "VB-CABLE telepítése",
    body: (
      <>
        Töltsd le a <b>vb-audio.com/Cable</b> oldalról, futtasd a telepítőt rendszergazdaként, és indítsd
        újra a gépet. Ez egy ingyenes „virtuális kábel”, ezen keresztül jut a fordításod a Meetbe.
      </>
    ),
  },
  {
    title: "Meet mikrofon: CABLE Output",
    body: (
      <>
        A Google Meetben: <b>Beállítások → Hang → Mikrofon → CABLE Output</b>. Ha a hang szaggatott, ugyanitt
        kapcsold ki a zajszűrést. A Windows alapértelmezett hangszórója maradjon a fejhallgatód.
      </>
    ),
  },
  {
    title: "Indítás",
    body: (
      <>
        Nyomd meg az <b>Indítás</b> gombot, engedélyezd a mikrofont, majd a felugró ablakban válaszd a{" "}
        <b>Chrome-lap</b> fület → a Meet lapot → kapcsold be a <b>Lap hangjának megosztása</b> kapcsolót. A
        partner felé menő kimenet (CABLE Input) magától beállítódik.
      </>
    ),
  },
];

export default function HelpDialog({ open, onClose }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/60" onClick={onClose} />
          <motion.div
            data-testid="help-dialog"
            className="scroll-slim relative max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-line bg-surface"
            initial={{ y: 16, scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 16, scale: 0.98 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex items-start justify-between px-6 pb-2 pt-6">
              <div>
                <h2 className="text-lg font-semibold text-ink">Beállítás 4 lépésben</h2>
                <p className="mt-1 text-sm text-muted">Az első három lépést csak egyszer kell megcsinálni.</p>
              </div>
              <IconButton label="Bezárás" onClick={onClose} data-testid="close-help-btn">
                <X size={18} />
              </IconButton>
            </div>
            <ol className="space-y-1 px-6 pb-6 pt-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex gap-4 py-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-raised text-xs font-semibold text-ink">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="text-sm font-medium text-ink">{s.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted [&_b]:font-medium [&_b]:text-ink [&_code]:rounded [&_code]:bg-raised [&_code]:px-1 [&_code]:text-[12px] [&_code]:text-ink">
                      {s.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="border-t border-line px-6 py-4 text-xs leading-relaxed text-muted">
              <p>
                Tipp: húzd ki ezt a fület külön ablakba, és tedd a Meet mellé – így a fordítás szövegét is
                látod. A fordítás kb. 2–3 másodperccel követi a beszédet, ugyanannyival, mint egy szinkrontolmács.
              </p>
              <p className="mt-2">
                Gyorsbillentyű: <b className="font-medium text-ink">M</b> – mikrofon némítása / visszakapcsolása.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
