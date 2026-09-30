import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Volume2, PlugZap } from "lucide-react";
import { Button, IconButton, Section, Select, Slider, Toggle } from "./primitives";

export default function SettingsSheet({
  open,
  onClose,
  active,
  langs,
  myLang,
  setMyLang,
  partnerLang,
  setPartnerLang,
  volA,
  setVolA,
  origVol,
  setOrigVol,
  volB,
  setVolB,
  outputs,
  sinkB,
  setSinkB,
  onRefreshOutputs,
  echoMine,
  setEchoMine,
  catchUp,
  setCatchUp,
  onTestSound,
  onCheck,
  checking,
  checkResult,
}) {
  const langOptions = Object.entries(langs).map(([code, name]) => (
    <option key={code} value={code}>
      {name}
    </option>
  ));
  const devices = outputs.filter((d) => d.deviceId && d.deviceId !== "default" && d.deviceId !== "communications");
  const labelsKnown = devices.some((d) => d.label);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div
            className="absolute inset-0 bg-black/60"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.aside
            data-testid="settings-sheet"
            className="scroll-slim absolute right-0 top-0 flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-line bg-surface"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.22, ease: "easeOut" }}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface/95 px-6 py-4 backdrop-blur">
              <h2 className="text-base font-semibold text-ink">Beállítások</h2>
              <IconButton label="Bezárás" onClick={onClose} data-testid="close-settings-btn">
                <X size={18} />
              </IconButton>
            </div>

            <Section title="Nyelvek">
              <div className="grid grid-cols-2 gap-3">
                <Select label="Én beszélek" value={myLang} onChange={setMyLang} disabled={active} testId="my-language-select">
                  {langOptions}
                </Select>
                <Select
                  label="A partner beszél"
                  value={partnerLang}
                  onChange={setPartnerLang}
                  disabled={active}
                  testId="partner-language-select"
                >
                  {langOptions}
                </Select>
              </div>
              {active && <p className="text-xs text-faint">A nyelvet leállított fordítás mellett lehet módosítani.</p>}
            </Section>

            <Section title="Amit te hallasz">
              <Slider label="Fordítás hangereje" value={volA} onChange={setVolA} testId="channel-a-volume-slider" />
              <Slider
                label="Partner eredeti hangja"
                value={origVol}
                onChange={setOrigVol}
                testId="original-volume-slider"
              />
              <p className="text-xs leading-relaxed text-muted">
                Az eredeti hang automatikusan lehalkul, amíg a fordítás szól.
              </p>
            </Section>

            <Section title="Amit a partner hall">
              <Select
                label="Kimenet a Meet felé"
                value={sinkB}
                onChange={setSinkB}
                testId="channel-b-output-device-select"
                hint={
                  labelsKnown
                    ? "Válaszd a „CABLE Input” eszközt, és a Meetben a mikrofon legyen „CABLE Output”."
                    : "Az eszközök neve az első indítás után jelenik meg."
                }
              >
                <option value="">Alapértelmezett kimenet</option>
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || "Hangeszköz"}
                  </option>
                ))}
              </Select>
              <div className="flex flex-wrap gap-2 pb-3 pt-1">
                <Button onClick={onTestSound} testId="test-vbcable-audio-route-btn">
                  <Volume2 size={15} /> Teszthang
                </Button>
                <Button variant="ghost" onClick={onRefreshOutputs}>
                  Eszközök frissítése
                </Button>
              </div>
              <Slider
                label="Kimenő fordítás hangereje"
                value={volB}
                onChange={setVolB}
                accent="#34D399"
                testId="channel-b-volume-slider"
              />
            </Section>

            <Section title="Fordítás">
              <Toggle
                label="Lemaradás automatikus behozása"
                hint="Ha a fordítás lemarad, lerövidíti a szüneteket és kicsit gyorsabban beszél."
                checked={catchUp}
                onChange={setCatchUp}
                testId="catchup-toggle"
              />
              <Toggle
                label="A partner nyelvén mondott mondataimat is továbbítsa"
                hint="Ha néha angolul szólsz, azt is kimondja a partnernek. Indítás előtt állítható."
                checked={echoMine}
                onChange={setEchoMine}
                disabled={active}
                testId="echo-target-checkbox"
              />
            </Section>

            <Section title="Kapcsolat">
              <Button onClick={onCheck} disabled={checking} testId="check-gemini-connection-btn">
                <PlugZap size={15} /> {checking ? "Ellenőrzés…" : "Gemini kapcsolat tesztelése"}
              </Button>
              {checkResult && (
                <p
                  data-testid="check-result"
                  className={`mt-3 rounded-xl px-3 py-2 text-sm ${
                    checkResult.ok ? "bg-me/10 text-me" : "bg-danger/10 text-danger"
                  }`}
                >
                  {checkResult.message}
                </p>
              )}
            </Section>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
