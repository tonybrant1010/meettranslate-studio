"""MeetTranslate Studio – local backend.

Runs on your laptop (http://localhost:8000). It
  * serves the web UI (frontend/build),
  * keeps your Gemini API key on the server side (backend/.env),
  * bridges each browser audio channel to Gemini Live Translate over WebSocket.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from gemini_bridge import TranslateBridge, build_config, describe_error

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env", encoding="utf-8-sig")

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s  %(levelname)-7s %(name)s: %(message)s"
)
logger = logging.getLogger("server")

MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.5-live-translate-preview").strip()
BUILD_DIR = Path(os.environ.get("FRONTEND_BUILD", ROOT_DIR.parent / "frontend" / "build"))

# BCP-47 codes offered in the UI (the model supports 70+; add more here if needed).
LANGUAGES = {
    "hu": "Magyar",
    "en": "Angol",
    "de": "Német",
    "fr": "Francia",
    "es": "Spanyol",
    "it": "Olasz",
    "pt": "Portugál",
    "nl": "Holland",
    "pl": "Lengyel",
    "cs": "Cseh",
    "sk": "Szlovák",
    "ro": "Román",
    "hr": "Horvát",
    "sr": "Szerb",
    "uk": "Ukrán",
    "ru": "Orosz",
    "tr": "Török",
    "zh": "Kínai",
    "ja": "Japán",
    "ko": "Koreai",
    "ar": "Arab",
    "hi": "Hindi",
}


def _api_key() -> str:
    return (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or "").strip()


_client = None


def get_client():
    global _client
    if _client is None:
        from google import genai

        _client = genai.Client(api_key=_api_key())
    return _client


def gemini_connect(model, config):
    return get_client().aio.live.connect(model=model, config=config)


# Tests swap this for a fake Gemini.
CONNECT_FN = gemini_connect

app = FastAPI(title="MeetTranslate Studio")


@app.get("/api/health")
async def health():
    return {
        "ok": True,
        "has_key": bool(_api_key()),
        "model": MODEL,
        "languages": LANGUAGES,
    }


@app.get("/api/check")
async def check():
    """Open and close one Gemini session to verify key + model access."""
    if not _api_key():
        return {"ok": False, "message": "Nincs GEMINI_API_KEY a backend/.env fájlban."}
    try:
        async def _probe():
            async with CONNECT_FN(MODEL, build_config("hu", False)):
                return True

        await asyncio.wait_for(_probe(), timeout=15)
        return {"ok": True, "message": f"Gemini kapcsolat rendben ({MODEL})."}
    except asyncio.TimeoutError:
        return {"ok": False, "message": "A Gemini nem válaszolt 15 mp alatt (hálózat?)."}
    except Exception as exc:
        logger.warning("check failed: %s", exc)
        return {"ok": False, "message": describe_error(exc)}


@app.websocket("/ws/translate")
async def ws_translate(ws: WebSocket, target: str = "hu", echo: int = 0, label: str = "?"):
    await ws.accept()
    if target not in LANGUAGES:
        await ws.send_text(json.dumps({"type": "error", "fatal": True, "message": f"Ismeretlen nyelv: {target}"}))
        await ws.close()
        return
    if not _api_key():
        await ws.send_text(json.dumps({
            "type": "error", "fatal": True,
            "message": "Nincs Gemini API kulcs. Írd be a backend/.env fájlba: GEMINI_API_KEY=...",
        }))
        await ws.close()
        return

    # Single writer task: Starlette websockets must not be written concurrently.
    outbox: asyncio.Queue = asyncio.Queue(maxsize=2000)

    async def writer():
        while True:
            item = await outbox.get()
            if item is None:
                return
            if isinstance(item, bytes):
                await ws.send_bytes(item)
            else:
                await ws.send_text(json.dumps(item, ensure_ascii=False))

    async def send_json(payload: dict):
        await outbox.put(payload)

    async def send_audio(pcm: bytes):
        await outbox.put(pcm)

    bridge = TranslateBridge(
        connect_fn=CONNECT_FN,
        model=MODEL,
        target=target,
        echo=bool(echo),
        send_json=send_json,
        send_audio=send_audio,
    )
    writer_task = asyncio.create_task(writer())
    await bridge.start()
    logger.info("channel %s opened (target=%s echo=%s)", label, target, bool(echo))

    try:
        while True:
            msg = await ws.receive()
            if msg["type"] == "websocket.disconnect":
                break
            data = msg.get("bytes")
            if data:
                await bridge.push_audio(data)
            elif msg.get("text"):
                with contextlib.suppress(Exception):
                    ctrl = json.loads(msg["text"])
                    if ctrl.get("type") == "stop":
                        break
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.warning("channel %s error: %s", label, exc)
    finally:
        await bridge.close()
        with contextlib.suppress(Exception):
            outbox.put_nowait(None)
        writer_task.cancel()
        with contextlib.suppress(BaseException):
            await writer_task
        with contextlib.suppress(Exception):
            await ws.close()
        logger.info("channel %s closed (rotations=%s)", label, bridge.rotations)


# ---- Web UI -------------------------------------------------------------
if (BUILD_DIR / "index.html").exists():
    app.mount("/", StaticFiles(directory=str(BUILD_DIR), html=True), name="ui")
else:
    @app.get("/", response_class=HTMLResponse)
    async def no_ui():
        return (
            "<h2>A felület még nincs lefordítva.</h2>"
            "<p>Hiányzik a <code>frontend/build</code> mappa. Futtasd: "
            "<code>cd frontend &amp;&amp; npm install &amp;&amp; npm run build</code></p>"
        )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("PORT", "8000")))
