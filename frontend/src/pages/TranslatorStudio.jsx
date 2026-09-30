import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import Header from "../components/Header";
import ReadyCard from "../components/ReadyCard";
import Conversation from "../components/Conversation";
import Dock from "../components/Dock";
import SettingsSheet from "../components/SettingsSheet";
import HelpDialog from "../components/HelpDialog";
import {
  PcmCapture,
  PcmPlayer,
  TabMonitor,
  captureMic,
  captureTabAudio,
  chime,
  listOutputDevices,
} from "../lib/audio";
import { TranslatorChannel, getHealth, checkGemini } from "../lib/api";
import { LatencyTracker } from "../lib/latency";

const FALLBACK_LANGS = { hu: "Magyar", en: "Angol", de: "Német" };
const NEW_CARD_GAP_MS = 2500;
const MAX_CARDS = 80;
const CABLE_RE = /cable input/i;

const nowLabel = () =>
  new Date().toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" });

const loadPref = (k, d) => {
  try {
    const v = localStorage.getItem(`mt:${k}`);
    return v === null ? d : JSON.parse(v);
  } catch (e) {
    return d;
  }
};
const savePref = (k, v) => {
  try {
    localStorage.setItem(`mt:${k}`, JSON.stringify(v));
  } catch (e) {
    /* noop */
  }
};

export default function TranslatorStudio() {
  const [health, setHealth] = useState(null);
  const [serverDown, setServerDown] = useState(false);
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [tabReady, setTabReady] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const [duration, setDuration] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState(null);

  const [statusA, setStatusA] = useState("idle");
  const [statusB, setStatusB] = useState("idle");
  const [latA, setLatA] = useState(null);
  const [latB, setLatB] = useState(null);
  const [items, setItems] = useState([]);
  const [liveIds, setLiveIds] = useState([]);

  const [myLang, setMyLang] = useState(() => loadPref("myLang", "hu"));
  const [partnerLang, setPartnerLang] = useState(() => loadPref("partnerLang", "en"));
  const [echoMine, setEchoMine] = useState(() => loadPref("echoMine", true));
  const [catchUp, setCatchUp] = useState(() => loadPref("catchUp", true));
  const [volA, setVolA] = useState(() => loadPref("volA", 1));
  const [volB, setVolB] = useState(() => loadPref("volB", 1));
  const [origVol, setOrigVol] = useState(() => loadPref("origVol", 0.3));
  const [micMuted, setMicMuted] = useState(false);
  const [outputs, setOutputs] = useState([]);
  const [sinkB, setSinkB] = useState(() => loadPref("sinkB", ""));

  // --- runtime refs ---
  const activeRef = useRef(false);
  const levelA = useRef(0);
  const levelB = useRef(0);
  const cap = useRef({ A: null, B: null });
  const chan = useRef({ A: null, B: null });
  const player = useRef({ A: null, B: null });
  const conn = useRef({ A: "idle", B: "idle" });
  const lastInput = useRef({ A: 0, B: 0 });
  const cur = useRef({ A: null, B: null });
  const lat = useRef({ A: new LatencyTracker(), B: new LatencyTracker() });
  const audioStore = useRef(new Map());
  const monitor = useRef(null);
  const tabStream = useRef(null);
  const micStream = useRef(null);
  const sinkRef = useRef(sinkB);
  sinkRef.current = sinkB;

  const langs = health?.languages || FALLBACK_LANGS;
  const langName = (c) => langs[c] || c.toUpperCase();
  const pairA = `${partnerLang.toUpperCase()} → ${myLang.toUpperCase()}`;
  const pairB = `${myLang.toUpperCase()} → ${partnerLang.toUpperCase()}`;

  // persist preferences
  useEffect(() => savePref("myLang", myLang), [myLang]);
  useEffect(() => savePref("partnerLang", partnerLang), [partnerLang]);
  useEffect(() => savePref("echoMine", echoMine), [echoMine]);
  useEffect(() => savePref("catchUp", catchUp), [catchUp]);
  useEffect(() => savePref("volA", volA), [volA]);
  useEffect(() => savePref("volB", volB), [volB]);
  useEffect(() => savePref("origVol", origVol), [origVol]);
  useEffect(() => savePref("sinkB", sinkB), [sinkB]);

  // Picks "CABLE Input" automatically if nothing valid is selected yet.
  const refreshOutputs = useCallback(async (announce = true) => {
    const devs = await listOutputDevices();
    setOutputs(devs);
    const current = sinkRef.current;
    const valid = current && devs.some((d) => d.deviceId === current);
    if (!valid) {
      const cable = devs.find((d) => CABLE_RE.test(d.label || ""));
      if (cable) {
        setSinkB(cable.deviceId);
        player.current.B?.setSink(cable.deviceId);
        if (announce) toast.success("A partner felé menő hangot a CABLE Input eszközre állítottam.");
      } else if (current && devs.some((d) => d.label)) {
        setSinkB("");
      }
    }
    return devs;
  }, []);

  useEffect(() => {
    getHealth()
      .then((h) => {
        setHealth(h);
        setServerDown(false);
        if (!h.has_key && !loadPref("seenHelp", false)) setHelpOpen(true);
      })
      .catch(() => setServerDown(true));
    refreshOutputs(false);
    const onChange = () => refreshOutputs(true);
    navigator.mediaDevices?.addEventListener?.("devicechange", onChange);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", onChange);
  }, [refreshOutputs]);

  useEffect(() => {
    if (helpOpen) savePref("seenHelp", true);
  }, [helpOpen]);

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => clearInterval(t);
  }, [active]);

  // Status, latency, live-bubble and ducking loop
  useEffect(() => {
    const t = setInterval(() => {
      const compute = (ch) => {
        if (!activeRef.current || !chan.current[ch]) return "idle";
        const c = conn.current[ch];
        if (c === "connecting" || c === "reconnecting" || c === "error") return c;
        if (ch === "B" && cap.current.B?.muted) return "muted";
        if (player.current[ch]?.isPlaying()) return "speaking";
        if (Date.now() - lastInput.current[ch] < 1500) return "processing";
        return "listening";
      };
      setStatusA(compute("A"));
      setStatusB(compute("B"));
      setLatA(lat.current.A.value());
      setLatB(lat.current.B.value());
      const now = Date.now();
      const live = ["A", "B"]
        .map((ch) => cur.current[ch])
        .filter((it) => it && now - it.lastAt < NEW_CARD_GAP_MS)
        .map((it) => it.id);
      setLiveIds((prev) => (prev.join() === live.join() ? prev : live));
      if (monitor.current) monitor.current.setDucked(!!player.current.A?.isPlaying());
    }, 200);
    return () => clearInterval(t);
  }, []);

  // live changes
  useEffect(() => player.current.A?.setVolume(volA), [volA]);
  useEffect(() => player.current.B?.setVolume(volB), [volB]);
  useEffect(() => monitor.current?.setVolume(origVol), [origVol]);
  useEffect(() => {
    player.current.B?.setSink(sinkB);
  }, [sinkB]);
  useEffect(() => cap.current.B?.setMuted(micMuted), [micMuted]);
  useEffect(() => {
    if (player.current.A) player.current.A.catchUp = catchUp;
    if (player.current.B) player.current.B.catchUp = catchUp;
  }, [catchUp]);

  // "M" toggles the microphone during a session
  useEffect(() => {
    const onKey = (e) => {
      if (e.key.toLowerCase() !== "m" || e.ctrlKey || e.metaKey || e.altKey) return;
      if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
      if (activeRef.current && cap.current.B) setMicMuted((m) => !m);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // --- transcript bubbles ---
  const appendText = (ch, field, text) => {
    const now = Date.now();
    if (field === "original") lastInput.current[ch] = now;
    let item = cur.current[ch];
    const stale = !item || now - item.lastAt > NEW_CARD_GAP_MS;
    const closedAndNewSpeech = item && item.closed && field === "original";
    if (stale || closedAndNewSpeech) {
      item = {
        id: `${ch}-${now}-${Math.random().toString(36).slice(2, 7)}`,
        who: ch,
        original: "",
        translated: "",
        time: nowLabel(),
        lastAt: now,
        closed: false,
      };
      cur.current[ch] = item;
      audioStore.current.set(item.id, []);
    }
    item[field] += text;
    item.lastAt = now;
    const snap = {
      id: item.id,
      who: ch,
      original: item.original.trim(),
      translated: item.translated.trim(),
      time: item.time,
    };
    setItems((prev) => {
      const i = prev.findIndex((p) => p.id === snap.id);
      if (i >= 0) {
        const next = prev.slice();
        next[i] = snap;
        return next;
      }
      const next = [...prev, snap];
      if (next.length > MAX_CARDS) {
        next.slice(0, next.length - MAX_CARDS).forEach((o) => audioStore.current.delete(o.id));
        return next.slice(-MAX_CARDS);
      }
      return next;
    });
  };

  const onAudio = (ch, buf) => {
    const startsIn = player.current[ch]?.play(buf);
    lat.current[ch].audio(startsIn);
    const item = cur.current[ch];
    if (item) {
      item.lastAt = Date.now();
      audioStore.current.get(item.id)?.push(buf);
    }
  };

  const openChannel = (ch) => {
    const c = new TranslatorChannel({
      label: ch,
      target: ch === "A" ? myLang : partnerLang,
      echo: ch === "A" ? false : echoMine,
      onStatus: (s) => (conn.current[ch] = s),
      onInput: (t) => appendText(ch, "original", t),
      onOutput: (t) => appendText(ch, "translated", t),
      onTurn: () => {
        if (cur.current[ch]) cur.current[ch].closed = true;
      },
      onAudio: (buf) => onAudio(ch, buf),
      onError: (msg, fatal) =>
        fatal ? toast.error(msg, { duration: 12000 }) : toast(msg),
    });
    c.connect();
    chan.current[ch] = c;
    return c;
  };

  const makeCapture = (ch, stream, c) =>
    new PcmCapture(stream, {
      onChunk: (pcm) => c.send(pcm),
      onLevel: (l) => {
        (ch === "A" ? levelA : levelB).current = l;
        lat.current[ch].level(l, !!player.current[ch]?.isPlaying());
      },
    });

  const closeChannel = (ch) => {
    chan.current[ch]?.close();
    chan.current[ch] = null;
    cap.current[ch]?.stop();
    cap.current[ch] = null;
    conn.current[ch] = "idle";
    cur.current[ch] = null;
  };

  // --- partner side: Meet tab -> my language ---
  const stopTab = () => {
    closeChannel("A");
    monitor.current?.stop();
    monitor.current = null;
    tabStream.current?.getTracks().forEach((t) => t.stop());
    tabStream.current = null;
    levelA.current = 0;
    setTabReady(false);
  };

  const startTab = async () => {
    stopTab();
    try {
      const stream = await captureTabAudio({ suppressLocal: true });
      tabStream.current = stream;
      stream.getAudioTracks()[0].addEventListener("ended", () => {
        if (tabStream.current === stream) {
          stopTab();
          toast("A Meet lap megosztása leállt. A „Meet lap” gombbal újraindíthatod.");
        }
      });
      monitor.current = new TabMonitor(stream, { volume: origVol });
      if (!player.current.A) player.current.A = new PcmPlayer({ volume: volA, catchUp });
      const c = openChannel("A");
      const capture = makeCapture("A", stream, c);
      await capture.start();
      cap.current.A = capture;
      setTabReady(true);
      return true;
    } catch (e) {
      if (e && e.message === "NO_TAB_AUDIO") {
        toast.error("Nem érkezett hang a lapról. Oszd meg újra, és kapcsold be a „Lap hangjának megosztása” kapcsolót.", {
          duration: 10000,
        });
      } else {
        toast("A Meet lap nincs megosztva – a partner hangját így nem fordítom. A „Meet lap” gombbal pótolhatod.");
      }
      stopTab();
      return false;
    }
  };

  // --- my side: microphone -> partner language ---
  const startMic = async () => {
    try {
      const stream = await captureMic();
      micStream.current = stream;
      if (!player.current.B) {
        player.current.B = new PcmPlayer({ volume: volB, sinkId: sinkRef.current, catchUp });
      }
      const c = openChannel("B");
      const capture = makeCapture("B", stream, c);
      await capture.start();
      capture.setMuted(micMuted);
      cap.current.B = capture;
      setMicReady(true);
      return true;
    } catch (e) {
      console.error(e);
      toast.error("Nem kaptam hozzáférést a mikrofonhoz. Engedélyezd a böngésző címsorában a lakat ikonnál.");
      closeChannel("B");
      setMicReady(false);
      return false;
    }
  };

  const startSession = async () => {
    if (serverDown) {
      toast.error("A helyi szerver nem fut. Indítsd el a start.bat fájlt.");
      return;
    }
    if (health && !health.has_key) {
      setHelpOpen(true);
      return;
    }
    setStarting(true);
    activeRef.current = true;
    lat.current.A.reset();
    lat.current.B.reset();
    const micOk = await startMic();
    const devs = await refreshOutputs(true);
    if (micOk && !devs.some((d) => CABLE_RE.test(d.label || ""))) {
      toast("Nem találom a VB-CABLE-t, ezért a partner nem hallja a fordításodat. Nézd meg a Súgót.", {
        duration: 10000,
      });
    }
    const tabOk = await startTab();
    setStarting(false);
    if (micOk || tabOk) {
      setActive(true);
      setDuration(0);
    } else {
      activeRef.current = false;
      stopEverything();
    }
  };

  const stopEverything = () => {
    stopTab();
    closeChannel("B");
    micStream.current?.getTracks().forEach((t) => t.stop());
    micStream.current = null;
    player.current.A?.stop();
    player.current.B?.stop();
    player.current = { A: null, B: null };
    levelB.current = 0;
  };

  const stopSession = useCallback(() => {
    activeRef.current = false;
    stopEverything();
    setActive(false);
    setMicReady(false);
    setMicMuted(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => stopSession(), [stopSession]);

  const playOnce = (ch, fill) => {
    let p = player.current[ch];
    let temp = false;
    if (!p) {
      p = new PcmPlayer({ volume: ch === "A" ? volA : volB, sinkId: ch === "B" ? sinkB : "", catchUp: false });
      temp = true;
    }
    fill(p);
    if (temp) {
      const wait = () => (p.isPlaying() ? setTimeout(wait, 300) : p.stop());
      setTimeout(wait, 600);
    }
  };

  const replay = (item) => {
    const chunks = audioStore.current.get(item.id) || [];
    if (chunks.length) playOnce(item.who, (p) => chunks.forEach((c) => p.play(c)));
  };

  const testSound = () => {
    playOnce("B", (p) => p.playFloat(chime()));
    toast(sinkB ? "Teszthang elküldve a Meet felé. Mozog a Meet mikrofon-ikonja?" : "Teszthang az alapértelmezett kimeneten.");
  };

  const runCheck = async () => {
    setChecking(true);
    try {
      const r = await checkGemini();
      setCheckResult(r);
      r.ok ? toast.success(r.message) : toast.error(r.message);
    } catch (e) {
      setCheckResult({ ok: false, message: "A helyi szerver nem érhető el." });
    }
    setChecking(false);
  };

  // --- readiness (first screen) ---
  const keyState = serverDown
    ? { tone: "bad", text: "A helyi szerver nem fut – indítsd el a start.bat fájlt." }
    : !health
    ? { tone: "info", text: "Ellenőrzés…" }
    : !health.has_key
    ? { tone: "bad", text: "Hiányzik az API kulcs a backend\\.env fájlból." }
    : checkResult
    ? { tone: checkResult.ok ? "ok" : "bad", text: checkResult.message }
    : { tone: "ok", text: "Kulcs beállítva. A „Teszt” gombbal kipróbálhatod a kapcsolatot." };

  const devs = outputs.filter((d) => d.deviceId && d.deviceId !== "default");
  const labelsKnown = devs.some((d) => d.label);
  const selected = devs.find((d) => d.deviceId === sinkB);
  const cableDev = devs.find((d) => CABLE_RE.test(d.label || ""));
  const cableState = selected
    ? CABLE_RE.test(selected.label || "")
      ? { tone: "ok", text: "Beállítva: CABLE Input → a Meetben a mikrofon legyen „CABLE Output”." }
      : { tone: "warn", text: `Most ide megy: ${selected.label || "kiválasztott eszköz"}. A Meethez a CABLE Input kell.` }
    : !labelsKnown
    ? { tone: "info", text: "Indításkor automatikusan beállítom a VB-CABLE-t (ha telepítve van)." }
    : cableDev
    ? { tone: "warn", text: "Válaszd ki a „CABLE Input” eszközt a beállításokban." }
    : { tone: "warn", missing: true, text: "Nem találom a VB-CABLE-t. Telepítsd, hogy a partner hallja a fordítást." };

  const clock = `${String(Math.floor(duration / 60)).padStart(2, "0")}:${String(duration % 60).padStart(2, "0")}`;
  const showReady = !active && items.length === 0;

  return (
    <div className="flex h-full flex-col bg-bg">
      <Header
        pair={`${langName(partnerLang)} ⇄ ${langName(myLang)}`}
        active={active}
        clock={clock}
        onSettings={() => setSettingsOpen(true)}
        onHelp={() => setHelpOpen(true)}
      />

      <main className="flex min-h-0 flex-1 flex-col">
        {showReady ? (
          <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-4 pb-10">
            <ReadyCard
              keyState={keyState}
              cableState={cableState}
              onSettings={() => setSettingsOpen(true)}
              onHelp={() => setHelpOpen(true)}
              onCheck={runCheck}
              checking={checking}
            />
          </div>
        ) : (
          <Conversation
            items={items}
            liveIds={liveIds}
            onReplay={replay}
            hasAudio={(id) => (audioStore.current.get(id) || []).length > 0}
            onClear={() => {
              setItems([]);
              audioStore.current.clear();
            }}
          />
        )}
      </main>

      <Dock
        active={active}
        starting={starting}
        onStart={startSession}
        onStop={stopSession}
        pairA={pairA}
        pairB={pairB}
        statusA={statusA}
        statusB={micReady ? statusB : "idle"}
        levelA={levelA}
        levelB={levelB}
        latencyA={latA}
        latencyB={latB}
        micMuted={micMuted}
        onToggleMute={() => setMicMuted((m) => !m)}
        tabReady={tabReady}
        onShareTab={startTab}
      />

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        active={active}
        langs={langs}
        myLang={myLang}
        setMyLang={setMyLang}
        partnerLang={partnerLang}
        setPartnerLang={setPartnerLang}
        volA={volA}
        setVolA={setVolA}
        origVol={origVol}
        setOrigVol={setOrigVol}
        volB={volB}
        setVolB={setVolB}
        outputs={outputs}
        sinkB={sinkB}
        setSinkB={setSinkB}
        onRefreshOutputs={() => refreshOutputs(true)}
        echoMine={echoMine}
        setEchoMine={setEchoMine}
        catchUp={catchUp}
        setCatchUp={setCatchUp}
        onTestSound={testSound}
        onCheck={runCheck}
        checking={checking}
        checkResult={checkResult}
      />
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
