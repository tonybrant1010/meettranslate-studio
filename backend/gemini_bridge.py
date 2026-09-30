"""Bridge between one browser WebSocket and Gemini Live Translate.

One bridge = one translation direction (e.g. partner EN -> HU for you, or
your HU mic -> EN for the partner).

The browser streams raw 16 kHz / 16-bit mono PCM; Gemini answers with
24 kHz / 16-bit mono PCM plus live transcriptions of both sides.

Gemini Live connections are closed by the server after ~10 minutes (and audio
sessions are capped at ~15 minutes), so the bridge quietly rotates to a fresh
Gemini session before that happens. It waits for a pause in the conversation
to switch, lets the old session finish speaking, and keeps any audio that
arrives during the switch in a short buffer, so the call is not interrupted.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from collections import deque
from typing import Any, Awaitable, Callable, Optional

from google.genai import types

logger = logging.getLogger("bridge")

INPUT_MIME = "audio/pcm;rate=16000"

# Rotate well before the ~10 min server-side connection limit.
ROTATE_AFTER_S = 8 * 60
# Hard deadline: rotate even mid-sentence if nobody pauses.
FORCE_ROTATE_AFTER_S = 9 * 60 + 20
# How long the conversation must be quiet before a planned rotation.
QUIET_FOR_S = 1.2
# Keep the old session alive this long so it can finish its last sentence.
DRAIN_S = 6.0
# Audio kept while (re)connecting: 50 ms chunks -> 4 s.
MAX_BUFFER_CHUNKS = 80
MAX_CONNECT_ATTEMPTS = 6

SendJson = Callable[[dict], Awaitable[None]]
SendAudio = Callable[[bytes], Awaitable[None]]
# connect_fn(model, config) -> async context manager yielding a live session
ConnectFn = Callable[[str, types.LiveConnectConfig], Any]


def build_config(target: str, echo: bool) -> types.LiveConnectConfig:
    return types.LiveConnectConfig(
        response_modalities=["AUDIO"],
        input_audio_transcription=types.AudioTranscriptionConfig(),
        output_audio_transcription=types.AudioTranscriptionConfig(),
        translation_config=types.TranslationConfig(
            target_language_code=target,
            echo_target_language=echo,
        ),
    )


def describe_error(exc: BaseException) -> str:
    """Turn API errors into a short Hungarian hint for the UI."""
    text = str(exc)
    low = text.lower()
    if "api key" in low or "api_key" in low or "permission" in low or "401" in low or "403" in low:
        return "A Gemini API kulcs érvénytelen vagy nincs jogosultsága (ellenőrizd a backend/.env fájlt)."
    if "not found" in low or "404" in low or "not supported" in low:
        return "A fordító modell nem érhető el ezzel a kulccsal (GEMINI_MODEL a .env-ben)."
    if "quota" in low or "429" in low or "resource_exhausted" in low or "rate" in low:
        return "Elérted a Gemini kvótát / sebességkorlátot. Várj egy kicsit, vagy kapcsold be a fizetős szintet."
    return f"Gemini kapcsolat hiba: {text[:200]}"


class _Live:
    """One open Gemini Live session."""

    def __init__(self, serial: int):
        self.serial = serial
        self.session: Any = None
        self.stack = contextlib.AsyncExitStack()
        self.recv_task: Optional[asyncio.Task] = None
        self.opened_at = time.monotonic()
        self.dead = asyncio.Event()
        self.go_away = False


class TranslateBridge:
    def __init__(
        self,
        *,
        connect_fn: ConnectFn,
        model: str,
        target: str,
        echo: bool,
        send_json: SendJson,
        send_audio: SendAudio,
        rotate_after_s: float = ROTATE_AFTER_S,
        force_rotate_after_s: float = FORCE_ROTATE_AFTER_S,
        quiet_for_s: float = QUIET_FOR_S,
        drain_s: float = DRAIN_S,
    ):
        self.connect_fn = connect_fn
        self.model = model
        self.config = build_config(target, echo)
        self.send_json = send_json
        self.send_audio = send_audio
        self.rotate_after_s = rotate_after_s
        self.force_rotate_after_s = force_rotate_after_s
        self.quiet_for_s = quiet_for_s
        self.drain_s = drain_s

        self._active: Optional[_Live] = None
        self._buffer: deque[bytes] = deque(maxlen=MAX_BUFFER_CHUNKS)
        self._wake = asyncio.Event()
        self._closed = False
        self._serial = 0
        self._last_activity = time.monotonic()
        self._manager: Optional[asyncio.Task] = None
        self._background: set[asyncio.Task] = set()
        self.rotations = 0

    # ------------------------------------------------------------------ API
    async def start(self) -> None:
        self._manager = asyncio.create_task(self._run())

    async def push_audio(self, pcm: bytes) -> None:
        live = self._active
        if live is None or live.dead.is_set():
            self._buffer.append(pcm)
            return
        try:
            await live.session.send_realtime_input(
                audio=types.Blob(data=pcm, mime_type=INPUT_MIME)
            )
        except Exception as exc:  # connection dropped under us
            logger.warning("send failed on session %s: %s", live.serial, exc)
            self._buffer.append(pcm)
            live.dead.set()
            self._wake.set()

    async def close(self) -> None:
        self._closed = True
        self._wake.set()
        if self._manager:
            self._manager.cancel()
            with contextlib.suppress(BaseException):
                await self._manager
        for t in list(self._background):
            t.cancel()
        if self._active:
            await self._shutdown(self._active)
            self._active = None

    # ------------------------------------------------------------ internals
    async def _run(self) -> None:
        try:
            live = await self._open_with_retry()
            if live is None:
                return
            self._activate(live)
            await self.send_json({"type": "status", "state": "ready"})

            while not self._closed:
                live = self._active
                reason = await self._wait_for_rotation(live)
                if self._closed:
                    break
                logger.info("rotating session %s (%s)", live.serial, reason)
                if reason == "dead":
                    await self.send_json({"type": "status", "state": "reconnecting"})
                    self._active = None  # buffer audio meanwhile
                new = await self._open_with_retry()
                if new is None:
                    return
                old = self._active
                self._activate(new)
                self.rotations += 1
                if old is not None:
                    self._retire(old)
                elif live is not None:
                    self._retire(live, drain=False)
                await self.send_json({"type": "status", "state": "ready"})
        except asyncio.CancelledError:
            pass
        except Exception as exc:  # pragma: no cover - defensive
            logger.exception("bridge crashed")
            await self._safe_json({"type": "error", "fatal": True, "message": describe_error(exc)})

    async def _wait_for_rotation(self, live: _Live) -> str:
        while not self._closed:
            if live.dead.is_set():
                return "dead"
            age = time.monotonic() - live.opened_at
            quiet = time.monotonic() - self._last_activity >= self.quiet_for_s
            if live.go_away:
                return "go_away"
            if age >= self.force_rotate_after_s:
                return "deadline"
            if age >= self.rotate_after_s and quiet:
                return "planned"
            self._wake.clear()
            with contextlib.suppress(asyncio.TimeoutError):
                await asyncio.wait_for(self._wake.wait(), timeout=0.25)
        return "closed"

    async def _open_with_retry(self) -> Optional[_Live]:
        delay = 0.5
        last_exc: Optional[BaseException] = None
        for attempt in range(1, MAX_CONNECT_ATTEMPTS + 1):
            if self._closed:
                return None
            try:
                return await self._open()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                last_exc = exc
                msg = describe_error(exc)
                logger.warning("connect attempt %s failed: %s", attempt, exc)
                fatal_hint = any(k in msg for k in ("API kulcs", "modell nem"))
                if fatal_hint:
                    break
                await self._safe_json({"type": "status", "state": "reconnecting", "attempt": attempt})
                await asyncio.sleep(delay)
                delay = min(delay * 2, 8)
        await self._safe_json(
            {"type": "error", "fatal": True, "message": describe_error(last_exc or RuntimeError("unknown"))}
        )
        return None

    async def _open(self) -> _Live:
        self._serial += 1
        live = _Live(self._serial)
        try:
            live.session = await live.stack.enter_async_context(
                self.connect_fn(self.model, self.config)
            )
        except BaseException:
            await live.stack.aclose()
            raise
        live.opened_at = time.monotonic()
        live.recv_task = asyncio.create_task(self._receive(live))
        logger.info("gemini session %s open", live.serial)
        return live

    def _activate(self, live: _Live) -> None:
        self._active = live
        # Flush audio buffered during the switch, in order.
        pending = list(self._buffer)
        self._buffer.clear()
        if pending:
            t = asyncio.create_task(self._flush(live, pending))
            self._background.add(t)
            t.add_done_callback(self._background.discard)

    async def _flush(self, live: _Live, chunks: list[bytes]) -> None:
        for c in chunks:
            try:
                await live.session.send_realtime_input(
                    audio=types.Blob(data=c, mime_type=INPUT_MIME)
                )
            except Exception:
                return

    def _retire(self, live: _Live, drain: bool = True) -> None:
        async def _later():
            if drain and not live.dead.is_set():
                with contextlib.suppress(Exception):
                    await live.session.send_realtime_input(audio_stream_end=True)
                with contextlib.suppress(asyncio.TimeoutError):
                    await asyncio.wait_for(live.dead.wait(), timeout=self.drain_s)
            await self._shutdown(live)

        t = asyncio.create_task(_later())
        self._background.add(t)
        t.add_done_callback(self._background.discard)

    async def _shutdown(self, live: _Live) -> None:
        if live.recv_task and not live.recv_task.done():
            live.recv_task.cancel()
            with contextlib.suppress(BaseException):
                await live.recv_task
        with contextlib.suppress(BaseException):
            await live.stack.aclose()
        logger.info("gemini session %s closed", live.serial)

    async def _receive(self, live: _Live) -> None:
        try:
            while True:
                got_any = False
                async for msg in live.session.receive():
                    got_any = True
                    await self._handle(live, msg)
                if not got_any:
                    # receive() returned without messages: socket is gone.
                    break
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            if not self._closed:
                logger.warning("session %s receive ended: %s", live.serial, exc)
                if self._active is live:
                    await self._safe_json({"type": "status", "state": "reconnecting"})
        finally:
            live.dead.set()
            self._wake.set()

    async def _handle(self, live: _Live, msg: Any) -> None:
        if getattr(msg, "go_away", None) is not None:
            live.go_away = True
            self._wake.set()

        sc = getattr(msg, "server_content", None)
        if sc is None:
            return

        it = getattr(sc, "input_transcription", None)
        if it is not None and getattr(it, "text", None):
            self._last_activity = time.monotonic()
            await self.send_json({"type": "input", "text": it.text})

        ot = getattr(sc, "output_transcription", None)
        if ot is not None and getattr(ot, "text", None):
            self._last_activity = time.monotonic()
            await self.send_json({"type": "output", "text": ot.text})

        turn = getattr(sc, "model_turn", None)
        if turn is not None and getattr(turn, "parts", None):
            for part in turn.parts:
                blob = getattr(part, "inline_data", None)
                if blob is not None and blob.data:
                    self._last_activity = time.monotonic()
                    await self.send_audio(blob.data)

        if getattr(sc, "turn_complete", False) or getattr(sc, "generation_complete", False):
            await self.send_json({"type": "turn_complete"})

    async def _safe_json(self, payload: dict) -> None:
        with contextlib.suppress(Exception):
            await self.send_json(payload)
