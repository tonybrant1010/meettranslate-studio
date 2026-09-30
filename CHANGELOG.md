# Változásnapló

A formátum a [Keep a Changelog](https://keepachangelog.com/hu/1.1.0/) ajánlását követi, a verziószámozás pedig a [Semantic Versioning](https://semver.org/lang/hu/) szabályait.

## [1.0.0] – 2026-09-30

### Új
- Élő, kétirányú hangfordítás a **Gemini 3.5 Live Translate** modellel (folyamatos fordítás, a beszélő hangszínének megtartásával).
- Helyi futtatás Windows 11-en: `start.bat` egykattintásos indító, a Gemini kulcs a `backend\.env` fájlban marad.
- Letisztult, sötét felület: kezdőképernyő önellenőrzéssel, közös beszélgetés-nézet buborékokkal, alsó vezérlősáv, beállítási panel és súgó.
- A VB-CABLE kimenetet automatikusan kiválasztja.
- A lemaradást automatikusan behozza (rövidebb szünetek, enyhe gyorsítás).
- Késésmérő mindkét irányhoz.
- A partner eredeti hangja állítható hangerővel szól, és magától lehalkul, amíg a fordítás beszél.
- Mikrofon némítása gombbal vagy az **M** billentyűvel.
- Nyelvválasztó (22 nyelv a felületen).
- Automatikus Gemini munkamenet-váltás kb. 8 percenként, beszédszünetben, hangvesztés nélkül.

### Megváltozott
- A korábbi Emergent / OpenAI (Whisper → GPT → TTS) megoldás helyett Gemini Live Translate fordít.
- Kisebb (50 ms-os) hangcsomagok a kisebb késésért.

### Eltávolítva
- MongoDB-függőség, Emergent-specifikus szkriptek és analitika.
